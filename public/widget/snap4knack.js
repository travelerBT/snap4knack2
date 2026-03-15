/**
 * Snap4Knack Widget v1.0.0
 * Visual feedback capture tool for Knack applications.
 * Full vanilla JS — no external dependencies.
 */
;(function (global) {
  'use strict';
  if (global.Snap4Knack) { return; }

  // ── Constants ──────────────────────────────────────────────────────────────

  var API_BASE = 'https://snap4knack2.web.app';
  var FIREBASE_PROJECT = 'snap4knack2';
  var FUNCTIONS_BASE = 'https://us-central1-' + FIREBASE_PROJECT + '.cloudfunctions.net';

  var MODES = {
    FULL: 'full_viewport',
    AREA: 'select_area',
    PIN: 'element_pin',
    RECORDING: 'screen_recording',
    CONSOLE: 'console_errors',
  };

  var TOOLS = { PEN: 'pen', RECT: 'rect', ARROW: 'arrow', TEXT: 'text', BLUR: 'blur' };

  // ── State ──────────────────────────────────────────────────────────────────

  var state = {
    config: null,
    idToken: null,
    idTokenAcquiredAt: 0,
    knackUser: null,
    knackRole: null,
    open: false,
    mode: null,
    step: 'mode',       // 'mode' | 'capture' | 'annotate' | 'form' | 'submitting' | 'done'
    captureBlob: null,
    captureDataUrl: null,
    captureType: null,
    captureIsVideo: false,
    consoleErrors: [],
    annotations: [],
    currentTool: TOOLS.PEN,
    currentColor: '#ef4444',
    drawing: false,
    currentShape: null,
    recording: false,
    mediaRecorder: null,
    recordingChunks: [],
    pinTarget: null,
    selectStart: null,
    selectRect: null,
    primaryColor: '#3b82f6',
    position: 'bottom-right',
    categories: ['Bug', 'Feature Request', 'Question', 'Other'],
    hipaaEnabled: false,
    allowRecording: false,
    appSource: null,  // 'knack' | 'react'
    reactUser: null,  // { userId, userEmail }
  };

  // ── Console capture (all levels) ──────────────────────────────────────────

  ['log', 'info', 'warn', 'error', 'debug'].forEach(function (level) {
    var _orig = console[level].bind(console);
    console[level] = function () {
      try {
        var args = Array.prototype.slice.call(arguments);
        var msg = args.map(function (a) {
          try { return typeof a === 'object' ? JSON.stringify(a) : String(a); } catch (e) { return String(a); }
        }).join(' ');
        state.consoleErrors.push({ level: level, message: msg, timestamp: Date.now() });
        if (state.consoleErrors.length > 100) state.consoleErrors.shift();
      } catch (e) { /* ignore */ }
      _orig.apply(console, arguments);
    };
  });

  // Catch unhandled promise rejections (not routed through console.error)
  window.addEventListener('unhandledrejection', function (event) {
    try {
      var reason = event.reason;
      var msg = reason
        ? (reason.stack || reason.message || String(reason))
        : 'Unhandled promise rejection';
      state.consoleErrors.push({ level: 'error', message: 'Uncaught (in promise): ' + msg, timestamp: Date.now() });
      if (state.consoleErrors.length > 100) state.consoleErrors.shift();
    } catch (e) { /* ignore */ }
  });

  // Catch synchronous uncaught errors
  window.addEventListener('error', function (event) {
    try {
      var msg = event.message || 'Script error';
      if (event.filename) msg += ' at ' + event.filename + ':' + event.lineno;
      state.consoleErrors.push({ level: 'error', message: 'Uncaught error: ' + msg, timestamp: Date.now() });
      if (state.consoleErrors.length > 100) state.consoleErrors.shift();
    } catch (e) { /* ignore */ }
  }, true); // capture phase so it fires before any other handlers

  // ── Utils ──────────────────────────────────────────────────────────────────

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function css(el, styles) {
    for (var k in styles) el.style[k] = styles[k];
  }

  function req(method, url, data, token) {
    return new Promise(function (resolve, reject) {
      // Only allow HTTPS to prevent token theft on mixed-content pages (M-07)
      if (url.indexOf('https://') !== 0) {
        return reject(new Error('Only HTTPS requests are permitted'));
      }
      var xhr = new XMLHttpRequest();
      xhr.open(method, url);
      xhr.setRequestHeader('Content-Type', 'application/json');
      if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText)); } catch (e) { resolve({}); }
        } else {
          reject(new Error(xhr.responseText || 'Request failed ' + xhr.status));
        }
      };
      xhr.onerror = function () { reject(new Error('Network error')); };
      xhr.send(data ? JSON.stringify(data) : null);
    });
  }

  // ── Knack user detection ───────────────────────────────────────────────────

  // Normalize roles from any Knack user object shape
  function getRoles(user) {
    var roles = user.roles || user.profileKeys || user.profile_keys || [];
    if (roles.length > 0 && typeof roles[0] === 'object') {
      return roles.map(function (r) { return r.key || r.name || r.id || r; });
    }
    return roles;
  }

  // ── Auth: request widget token from Cloud Function ─────────────────────────

  function getWidgetToken(pluginId, tenantId, userId, userRole) {
    // onRequest — send data directly, response is { token: "..." }
    var body = { pluginId: pluginId, tenantId: tenantId };
    if (state.appSource === 'react') {
      body.userId = userId;
      body.userRole = userRole || 'authenticated';
    } else {
      body.knackUserId = userId;
      body.knackUserRole = userRole;
    }
    return req('POST', FUNCTIONS_BASE + '/issueWidgetToken', body).then(function (resp) {
      // Exchange custom token for Firebase ID token
      return exchangeCustomToken(resp.token);
    });
  }

  function fetchPluginBranding(pluginId, tenantId, idToken) {
    var url = 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT +
      '/databases/(default)/documents/tenants/' + tenantId + '/snapPlugins/' + pluginId;
    return req('GET', url, null, idToken).then(function (doc) {
      if (!doc || !doc.fields) return;
      var brandingField = doc.fields.customBranding;
      if (brandingField && brandingField.mapValue && brandingField.mapValue.fields) {
        var bf = brandingField.mapValue.fields;
        if (bf.primaryColor && bf.primaryColor.stringValue) state.primaryColor = bf.primaryColor.stringValue;
        if (bf.position && bf.position.stringValue) state.position = bf.position.stringValue;
      }
      var ssField = doc.fields.snapSettings;
      if (ssField && ssField.mapValue && ssField.mapValue.fields) {
        var sf = ssField.mapValue.fields;
        if (sf.categories && sf.categories.arrayValue && sf.categories.arrayValue.values) {
          var cats = sf.categories.arrayValue.values.map(function (v) { return v.stringValue; }).filter(Boolean);
          if (cats.length) state.categories = cats;
        }
      }
      // Read HIPAA flag directly from plugin root fields
      if (doc.fields.hipaaEnabled && doc.fields.hipaaEnabled.booleanValue === true) {
        state.hipaaEnabled = true;
      }
      // Read allowRecording from snapSettings
      if (ssField && ssField.mapValue && ssField.mapValue.fields) {
        var sf2 = ssField.mapValue.fields;
        if (sf2.allowRecording && sf2.allowRecording.booleanValue === true) {
          state.allowRecording = true;
        }
      }
      // HIPAA always overrides allowRecording
      if (state.hipaaEnabled) state.allowRecording = false;
    }).catch(function (e) {
      console.warn('[Snap4Knack] Could not fetch plugin branding:', e.message);
    });
  }

  // Ensures a valid (non-expired) Firebase ID token is in state.idToken.
  // Firebase ID tokens expire after 1 hour; refresh after 50 minutes.
  function ensureFreshToken() {
    var EXPIRY_MS = 50 * 60 * 1000; // 50 minutes
    var tokenAge = Date.now() - state.idTokenAcquiredAt;
    if (state.idToken && tokenAge < EXPIRY_MS) {
      return Promise.resolve(state.idToken);
    }
    var activeUser = state.appSource === 'react' ? state.reactUser : state.knackUser;
    if (!activeUser || !state.config) {
      return Promise.reject(new Error('Not authenticated'));
    }
    var userId = state.appSource === 'react'
      ? (activeUser.userId || activeUser.userEmail || 'anonymous')
      : (activeUser.id || activeUser.email || 'anonymous');
    var userRole = state.appSource === 'react' ? 'authenticated' : state.knackRole;
    return getWidgetToken(state.config.pluginId, state.config.tenantId, userId, userRole)
      .then(function (idToken) {
        state.idToken = idToken;
        state.idTokenAcquiredAt = Date.now();
        return idToken;
      });
  }

  function exchangeCustomToken(customToken) {
    var apiKey = 'AIzaSyC6J5VNpybrQUnD-pbnaQkXjcAeVAUZZKo';
    return req('POST',
      'https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=' + apiKey,
      { token: customToken, returnSecureToken: true }
    ).then(function (data) { return data.idToken; });
  }

  // ── FAB injection ──────────────────────────────────────────────────────────

  var CAMERA_SVG = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="24" height="24"><path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316ZM16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" /></svg>';

  function injectFAB() {
    if (document.getElementById('s4k-fab')) return;
    var fab = el('button', '', CAMERA_SVG);
    fab.id = 's4k-fab';
    var pos = state.position === 'bottom-left' ? '20px' : null;
    css(fab, {
      position: 'fixed',
      bottom: '20px',
      right: state.position === 'bottom-right' ? '20px' : 'auto',
      left: pos,
      width: '52px',
      height: '52px',
      borderRadius: '50%',
      border: 'none',
      background: state.primaryColor,
      color: '#fff',
      cursor: 'pointer',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      zIndex: '2147483600',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'transform 0.15s ease',
    });
    fab.title = 'Snap Feedback';
    fab.addEventListener('mouseenter', function(){ fab.style.transform='scale(1.1)'; });
    fab.addEventListener('mouseleave', function(){ fab.style.transform='scale(1)'; });
    fab.addEventListener('click', function () { toggleDrawer(); });
    document.body.appendChild(fab);
  }

  // ── Drawer ─────────────────────────────────────────────────────────────────

  function toggleDrawer() {
    state.open ? closeDrawer() : openDrawer();
  }

  function openDrawer() {
    state.open = true;
    state.step = 'mode';
    renderDrawer();
  }

  function closeDrawer() {
    state.open = false;
    var drawer = document.getElementById('s4k-drawer');
    if (drawer) drawer.remove();
    var overlay = document.getElementById('s4k-overlay');
    if (overlay) overlay.remove();
    stopRecording();
    resetCaptureState();
  }

  function resetCaptureState() {
    state.captureBlob = null;
    state.captureDataUrl = null;
    state.captureType = null;
    state.captureIsVideo = false;
    state.annotations = [];
    state.currentShape = null;
    state.mode = null;
  }

  function renderDrawer() {
    var existing = document.getElementById('s4k-drawer');
    if (existing) existing.remove();

    var drawer = el('div');
    drawer.id = 's4k-drawer';
    css(drawer, {
      position: 'fixed',
      right: '0',
      top: '0',
      width: '340px',
      height: '100%',
      background: '#fff',
      boxShadow: '-4px 0 20px rgba(0,0,0,0.15)',
      zIndex: '2147483601',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: '14px',
      color: '#111827',
      overflowY: 'auto',
    });

    // Header
    var header = el('div', '', '');
    css(header, {
      padding: '14px 16px',
      borderBottom: '1px solid #e5e7eb',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      background: state.primaryColor,
      color: '#fff',
      flexShrink: '0',
    });
    var title = el('span', '', '');
    title.innerHTML = '<span style="display:flex;align-items:center;gap:8px">' + CAMERA_SVG + '<span>Send Feedback</span></span>';
    css(title, { fontWeight: '600', fontSize: '15px' });
    var closeBtn = el('button', '', '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>');
    css(closeBtn, {
      background: 'rgba(255,255,255,0.2)',
      border: 'none',
      color: '#fff',
      width: '28px', height: '28px',
      borderRadius: '50%',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: '0',
    });
    closeBtn.addEventListener('click', closeDrawer);
    header.appendChild(title);
    header.appendChild(closeBtn);
    drawer.appendChild(header);

    // Body
    var body = el('div', '');
    css(body, { flex: '1', overflowY: 'auto' });

    if (state.step === 'mode') renderModeStep(body);
    else if (state.step === 'annotate') renderAnnotateStep(body);
    else if (state.step === 'form') renderFormStep(body);
    else if (state.step === 'submitting') renderSubmittingStep(body);
    else if (state.step === 'done') renderDoneStep(body);

    drawer.appendChild(body);
    document.body.appendChild(drawer);
  }

  // ── Step: mode selection ───────────────────────────────────────────────────

  function renderModeStep(container) {
    var wrap = el('div', '', '');
    css(wrap, { padding: '16px' });

    var intro = el('p', '', 'Choose how you want to capture feedback:');
    css(intro, { color: '#6b7280', marginBottom: '12px', marginTop: '4px' });
    wrap.appendChild(intro);

    var SVG_FULL     = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="20" height="20"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75V18A2.25 2.25 0 0 0 4.5 20.25h15A2.25 2.25 0 0 0 21.75 18v-2.25M2.25 8.25V6A2.25 2.25 0 0 1 4.5 3.75h15A2.25 2.25 0 0 1 21.75 6v2.25M2.25 12h19.5" /></svg>';
    var SVG_AREA     = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="20" height="20"><path stroke-linecap="round" stroke-linejoin="round" d="M7.5 3.75H6A2.25 2.25 0 0 0 3.75 6v1.5M16.5 3.75H18A2.25 2.25 0 0 1 20.25 6v1.5M20.25 16.5V18A2.25 2.25 0 0 1 18 20.25h-1.5M7.5 20.25H6A2.25 2.25 0 0 1 3.75 18v-1.5M9 12h6M12 9v6" /></svg>';
    var SVG_PIN      = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="20" height="20"><path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" /></svg>';
    var SVG_RECORD   = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="20" height="20"><path stroke-linecap="round" stroke-linejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>';
    var SVG_CONSOLE  = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="20" height="20"><path stroke-linecap="round" stroke-linejoin="round" d="m6.75 7.5 3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0 0 21 18V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v12a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>';

    var modes = [
      { id: MODES.FULL,      icon: SVG_FULL,    label: 'Full Page',      desc: 'Capture the entire visible page' },
      { id: MODES.AREA,      icon: SVG_AREA,    label: 'Select Area',    desc: 'Draw a region to capture' },
      { id: MODES.PIN,       icon: SVG_PIN,     label: 'Pin Element',    desc: 'Click on a specific element' },
    ];
    if (state.allowRecording && !state.hipaaEnabled) {
      modes.push({ id: MODES.RECORDING, icon: SVG_RECORD, label: 'Record Screen', desc: 'Record up to 30 seconds' });
    }

    modes.forEach(function (m) {
      var btn = el('button', '', '');
      css(btn, {
        display: 'flex', alignItems: 'center', gap: '14px',
        width: '100%', padding: '12px 14px', marginBottom: '8px',
        background: '#ffffff', border: '1.5px solid #e5e7eb',
        borderRadius: '10px', cursor: 'pointer', textAlign: 'left',
        transition: 'border-color 0.15s, background 0.15s',
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      });
      btn.innerHTML =
        '<span style="flex-shrink:0;width:36px;height:36px;border-radius:8px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;color:#374151">' + m.icon + '</span>' +
        '<span style="min-width:0">' +
          '<strong style="display:block;font-size:13px;color:#111827;font-weight:600">' + m.label + '</strong>' +
          '<span style="font-size:11.5px;color:#6b7280;display:block;margin-top:1px">' + m.desc + '</span>' +
        '</span>';
      btn.addEventListener('mouseenter', function(){
        btn.style.borderColor = state.primaryColor;
        btn.style.background = '#f8faff';
        btn.querySelector('span').style.background = state.primaryColor + '18';
        btn.querySelector('span').style.color = state.primaryColor;
      });
      btn.addEventListener('mouseleave', function(){
        btn.style.borderColor = '#e5e7eb';
        btn.style.background = '#ffffff';
        btn.querySelector('span').style.background = '#f3f4f6';
        btn.querySelector('span').style.color = '#374151';
      });
      btn.addEventListener('click', function () { startCapture(m.id); });
      wrap.appendChild(btn);
    });
    container.appendChild(wrap);
  }

  // ── Capture ────────────────────────────────────────────────────────────────

  function startCapture(mode) {
    state.mode = mode;
    closeDrawerBody();

    if (mode === MODES.FULL) captureFullViewport();
    else if (mode === MODES.AREA) startAreaSelect();
    else if (mode === MODES.PIN) startElementPin();
    else if (mode === MODES.RECORDING) startScreenRecording();
    else if (mode === MODES.CONSOLE) {
      state.captureType = MODES.CONSOLE;
      state.attachConsole = true;
      state.step = 'form';
      renderDrawer();
    }
  }

  function closeDrawerBody() {
    var drawer = document.getElementById('s4k-drawer');
    if (drawer) { css(drawer, { display: 'none' }); }
  }

  function showDrawer() {
    var drawer = document.getElementById('s4k-drawer');
    if (drawer) { css(drawer, { display: 'flex' }); } else { renderDrawer(); }
  }

  // Full viewport via html2canvas
  function captureFullViewport() {
    loadHtml2Canvas(function (h2c) {
      h2c(document.body, {
        useCORS: true,
        allowTaint: true,
        scale: 1,
        logging: false,
      }).then(function (canvas) {
        state.captureDataUrl = canvas.toDataURL('image/png');
        state.captureType = MODES.FULL;
        state.captureIsVideo = false;
        state.step = 'annotate';
        showDrawer();
        renderDrawer();
      }).catch(function (e) {
        alert('Capture failed: ' + e.message);
        state.step = 'mode';
        showDrawer();
        renderDrawer();
      });
    });
  }

  // Area selection
  function startAreaSelect() {
    var overlay = el('div');
    overlay.id = 's4k-overlay';
    css(overlay, {
      position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
      zIndex: '2147483599', cursor: 'crosshair', background: 'rgba(0,0,0,0.3)',
    });

    var selBox = el('div');
    css(selBox, {
      position: 'fixed', border: '2px solid ' + state.primaryColor,
      background: 'rgba(59,130,246,0.1)', display: 'none', pointerEvents: 'none',
    });
    overlay.appendChild(selBox);

    var startX, startY;

    overlay.addEventListener('mousedown', function (e) {
      startX = e.clientX; startY = e.clientY;
      css(selBox, { display: 'block', left: startX + 'px', top: startY + 'px', width: '0', height: '0' });
    });
    overlay.addEventListener('mousemove', function (e) {
      if (!startX) return;
      var x = Math.min(e.clientX, startX), y = Math.min(e.clientY, startY);
      var w = Math.abs(e.clientX - startX), h = Math.abs(e.clientY - startY);
      css(selBox, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
    });
    overlay.addEventListener('mouseup', function (e) {
      var x = Math.min(e.clientX, startX), y = Math.min(e.clientY, startY);
      var w = Math.abs(e.clientX - startX), h = Math.abs(e.clientY - startY);
      overlay.remove();
      if (w < 10 || h < 10) {
        state.step = 'mode';
        showDrawer();
        renderDrawer();
        return;
      }
      captureAreaRegion(x + window.scrollX, y + window.scrollY, w, h, x, y);
    });
    document.body.appendChild(overlay);
  }

  function captureAreaRegion(scrollX, scrollY, w, h, clientX, clientY) {
    loadHtml2Canvas(function (h2c) {
      h2c(document.body, { useCORS: true, allowTaint: true, scale: 1, logging: false })
        .then(function (canvas) {
          var crop = document.createElement('canvas');
          crop.width = w; crop.height = h;
          crop.getContext('2d').drawImage(canvas, clientX, clientY, w, h, 0, 0, w, h);
          state.captureDataUrl = crop.toDataURL('image/png');
          state.captureType = MODES.AREA;
          state.captureIsVideo = false;
          state.step = 'annotate';
          showDrawer();
          renderDrawer();
        }).catch(function (e) {
          alert('Capture failed: ' + e.message);
          state.step = 'mode';
          showDrawer();
          renderDrawer();
        });
    });
  }

  // Element pin
  function startElementPin() {
    var overlay = el('div');
    overlay.id = 's4k-overlay';
    css(overlay, {
      position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
      zIndex: '2147483599', cursor: 'pointer',
    });

    var tooltip = el('div', '', 'Click an element to pin it');
    css(tooltip, {
      position: 'fixed', top: '12px', left: '50%', transform: 'translateX(-50%)',
      background: 'rgba(0,0,0,0.8)', color: '#fff', padding: '6px 14px',
      borderRadius: '20px', fontSize: '13px', zIndex: '2147483602', pointerEvents: 'none',
    });
    document.body.appendChild(tooltip);

    var highlighted = null;
    overlay.addEventListener('mousemove', function (e) {
      overlay.style.display = 'none';
      var target = document.elementFromPoint(e.clientX, e.clientY);
      overlay.style.display = 'block';
      if (highlighted && highlighted !== target) {
        highlighted.style.outline = '';
      }
      if (target && target !== overlay && target !== document.body) {
        target.style.outline = '2px solid ' + state.primaryColor;
        highlighted = target;
      }
    });

    overlay.addEventListener('click', function (e) {
      overlay.style.display = 'none';
      var target = document.elementFromPoint(e.clientX, e.clientY);
      overlay.style.display = 'block';
      if (highlighted) highlighted.style.outline = '';
      if (tooltip.parentNode) tooltip.remove();
      overlay.remove();

      if (!target) {
        state.step = 'mode';
        showDrawer();
        renderDrawer();
        return;
      }
      state.pinTarget = target;
      captureElement(target);
    });

    document.body.appendChild(overlay);
  }

  function captureElement(element) {
    loadHtml2Canvas(function (h2c) {
      h2c(element, { useCORS: true, allowTaint: true, scale: 1, logging: false })
        .then(function (canvas) {
          state.captureDataUrl = canvas.toDataURL('image/png');
          state.captureType = MODES.PIN;
          state.captureIsVideo = false;
          state.step = 'annotate';
          showDrawer();
          renderDrawer();
        }).catch(function () {
          state.step = 'mode';
          showDrawer();
          renderDrawer();
        });
    });
  }

  // Screen recording
  function startScreenRecording() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      alert('Screen recording is not supported in this browser.');
      state.step = 'mode';
      showDrawer();
      renderDrawer();
      return;
    }

    navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'browser', frameRate: 15 },
        audio: true,
        preferCurrentTab: true,
        selfBrowserSurface: 'include',
        surfaceSwitching: 'exclude',
        systemAudio: 'exclude',
      })
      .then(function (stream) {
        var mimeType = 'video/webm;codecs=vp8,opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm;codecs=vp8';
        if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm';
        if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = '';

        var chunks = [];
        var mr = new MediaRecorder(stream, mimeType ? { mimeType: mimeType } : undefined);
        state.mediaRecorder = mr;
        state.recordingChunks = chunks;
        state.recording = true;

        mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
        mr.onstop = function () {
          stream.getTracks().forEach(function (t) { t.stop(); });
          state.recording = false;
          var blob = new Blob(chunks, { type: mr.mimeType || 'video/webm' });
          state.captureBlob = blob;
          state.captureDataUrl = null;
          state.captureType = MODES.RECORDING;
          state.captureIsVideo = true;
          state.step = 'form';
          var ind = document.getElementById('s4k-rec-indicator');
          if (ind) ind.remove();
          showDrawer();
          renderDrawer();
        };

        // If user stops sharing via browser UI, stop the recorder too
        stream.getVideoTracks()[0].addEventListener('ended', function () { stopRecording(); });

        mr.start(500);

        // Recording indicator
        var recIndicator = el('div', '', '● Recording... <button id="s4k-stop-rec" style="margin-left:12px;padding:4px 10px;background:#fff;color:#dc2626;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600">Stop</button>');
        recIndicator.id = 's4k-rec-indicator';
        css(recIndicator, {
          position: 'fixed', bottom: '80px',
          right: state.position === 'bottom-right' ? '20px' : 'auto',
          left: state.position === 'bottom-left' ? '20px' : 'auto',
          background: '#dc2626', color: '#fff', padding: '8px 14px',
          borderRadius: '20px', fontSize: '13px', fontWeight: '600',
          zIndex: '2147483602', display: 'flex', alignItems: 'center',
        });
        document.body.appendChild(recIndicator);

        var timeout = setTimeout(stopRecording, 30000);
        document.getElementById('s4k-stop-rec').addEventListener('click', function () {
          clearTimeout(timeout);
          stopRecording();
        });
      })
      .catch(function (e) {
        // User cancelled the picker — silently go back to mode selection
        state.step = 'mode';
        showDrawer();
        renderDrawer();
      });
  }

  function stopRecording() {
    var indicator = document.getElementById('s4k-rec-indicator');
    if (indicator) indicator.remove();
    if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
      state.mediaRecorder.stop();
    }
    state.recording = false;
  }

  // ── Step: annotate ─────────────────────────────────────────────────────────

  function renderAnnotateStep(container) {
    if (!state.captureDataUrl) {
      state.step = 'form';
      renderFormStep(container);
      return;
    }

    var wrap = el('div', '');
    css(wrap, { padding: '0', display: 'flex', flexDirection: 'column', height: '100%' });

    // Tool bar
    var toolbar = el('div', '');
    css(toolbar, {
      display: 'flex', gap: '6px', padding: '8px 12px',
      borderBottom: '1px solid #e5e7eb', flexWrap: 'wrap', alignItems: 'center',
    });

    var SVG_T_PEN   = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" /></svg>';
    var SVG_T_RECT  = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="16" height="16"><rect x="3" y="3" width="18" height="18" rx="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var SVG_T_ARROW = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" /></svg>';
    var SVG_T_TEXT  = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" /></svg>';
    var SVG_T_BLUR  = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>';
    var SVG_T_UNDO  = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" /></svg>';
    var SVG_T_TRASH = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>';

    var tools = [
      { id: TOOLS.PEN,   icon: SVG_T_PEN,   title: 'Draw' },
      { id: TOOLS.RECT,  icon: SVG_T_RECT,  title: 'Rectangle' },
      { id: TOOLS.ARROW, icon: SVG_T_ARROW, title: 'Arrow' },
      { id: TOOLS.TEXT,  icon: SVG_T_TEXT,  title: 'Text' },
      { id: TOOLS.BLUR,  icon: SVG_T_BLUR,  title: 'Redact' },
    ];

    tools.forEach(function (t) {
      var btn = el('button', '', t.icon);
      btn.title = t.title;
      css(btn, {
        width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: '1.5px solid',
        borderColor: state.currentTool === t.id ? state.primaryColor : '#d1d5db',
        background: state.currentTool === t.id ? '#eff6ff' : '#fff',
        color: state.currentTool === t.id ? state.primaryColor : '#374151',
        borderRadius: '6px', cursor: 'pointer',
      });
      btn.addEventListener('click', function () {
        state.currentTool = t.id;
        renderDrawer();
      });
      toolbar.appendChild(btn);
    });

    // Color swatches
    var colors = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#111827'];
    colors.forEach(function (c) {
      var swatch = el('button', '');
      css(swatch, {
        width: '22px', height: '22px', borderRadius: '50%', background: c,
        border: state.currentColor === c ? '3px solid #111' : '2px solid transparent',
        cursor: 'pointer', flexShrink: '0',
      });
      swatch.addEventListener('click', function () { state.currentColor = c; renderDrawer(); });
      toolbar.appendChild(swatch);
    });

    // Undo + Clear
    var undoBtn = el('button', '', SVG_T_UNDO);
    css(undoBtn, { width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', background: '#fff', color: '#374151' });
    undoBtn.title = 'Undo';
    undoBtn.addEventListener('click', function () { state.annotations.pop(); redrawCanvas(); });
    toolbar.appendChild(undoBtn);

    var clearBtn = el('button', '', SVG_T_TRASH);
    css(clearBtn, { width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', background: '#fff', color: '#374151' });
    clearBtn.title = 'Clear annotations';
    clearBtn.addEventListener('click', function () { state.annotations = []; redrawCanvas(); });
    toolbar.appendChild(clearBtn);

    wrap.appendChild(toolbar);

    // Canvas container
    var imgWrap = el('div', '');
    css(imgWrap, { position: 'relative', overflow: 'auto', maxHeight: '380px' });

    var img = new Image();
    img.src = state.captureDataUrl;
    img.style.display = 'block';
    img.style.maxWidth = '100%';
    imgWrap.appendChild(img);

    var annotCanvas = document.createElement('canvas');
    annotCanvas.id = 's4k-annot-canvas';
    css(annotCanvas, {
      position: 'absolute', top: '0', left: '0',
      width: '100%', height: '100%',
      cursor: 'crosshair',
    });

    img.onload = function () {
      annotCanvas.width = img.naturalWidth;
      annotCanvas.height = img.naturalHeight;
      redrawCanvasEl(annotCanvas);
      setupCanvasEvents(annotCanvas, img);
    };

    imgWrap.appendChild(annotCanvas);
    wrap.appendChild(imgWrap);

    // Next button
    var footer = el('div', '');
    css(footer, { padding: '12px', borderTop: '1px solid #e5e7eb', display: 'flex', gap: '8px' });

    var backBtn = el('button', '', '← Back');
    css(backBtn, { flex: '1', padding: '9px', border: '1px solid #d1d5db', borderRadius: '8px', cursor: 'pointer', background: '#fff', fontSize: '13px' });
    backBtn.addEventListener('click', function () {
      resetCaptureState();
      state.step = 'mode';
      renderDrawer();
    });

    var nextBtn = el('button', '', 'Next →');
    css(nextBtn, { flex: '2', padding: '9px', border: 'none', borderRadius: '8px', cursor: 'pointer', background: state.primaryColor, color: '#fff', fontSize: '13px', fontWeight: '600' });
    nextBtn.addEventListener('click', function () {
      state.step = 'form';
      renderDrawer();
    });

    footer.appendChild(backBtn);
    footer.appendChild(nextBtn);
    wrap.appendChild(footer);
    container.appendChild(wrap);
  }

  function redrawCanvas() {
    var canvas = document.getElementById('s4k-annot-canvas');
    if (canvas) redrawCanvasEl(canvas);
  }

  function redrawCanvasEl(canvas) {
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    state.annotations.forEach(function (s) { drawShape(ctx, s); });
    if (state.currentShape) drawShape(ctx, state.currentShape);
  }

  function drawShape(ctx, shape) {
    ctx.save();
    ctx.strokeStyle = shape.color;
    ctx.fillStyle = shape.color;
    ctx.lineWidth = shape.tool === TOOLS.BLUR ? 0 : 2.5;
    ctx.globalAlpha = 0.85;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    switch (shape.tool) {
      case TOOLS.PEN:
        if (shape.points && shape.points.length > 1) {
          ctx.beginPath();
          ctx.moveTo(shape.points[0].x, shape.points[0].y);
          for (var i = 1; i < shape.points.length; i++) ctx.lineTo(shape.points[i].x, shape.points[i].y);
          ctx.stroke();
        }
        break;
      case TOOLS.RECT:
        ctx.strokeRect(shape.x, shape.y, shape.w, shape.h);
        break;
      case TOOLS.ARROW:
        var x1=shape.x, y1=shape.y, x2=shape.x2, y2=shape.y2;
        ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
        var angle = Math.atan2(y2-y1, x2-x1), len=14;
        ctx.beginPath();
        ctx.moveTo(x2,y2);
        ctx.lineTo(x2-len*Math.cos(angle-0.4), y2-len*Math.sin(angle-0.4));
        ctx.moveTo(x2,y2);
        ctx.lineTo(x2-len*Math.cos(angle+0.4), y2-len*Math.sin(angle+0.4));
        ctx.stroke();
        break;
      case TOOLS.TEXT:
        ctx.font = '14px sans-serif';
        ctx.globalAlpha = 1;
        ctx.fillText(shape.text || '', shape.x, shape.y);
        break;
      case TOOLS.BLUR:
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(shape.x, shape.y, shape.w, shape.h);
        break;
    }
    ctx.restore();
  }

  function setupCanvasEvents(canvas, img) {
    var getPos = function (e) {
      var r = canvas.getBoundingClientRect();
      var scaleX = canvas.width / r.width;
      var scaleY = canvas.height / r.height;
      var clientX = e.touches ? e.touches[0].clientX : e.clientX;
      var clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: (clientX - r.left) * scaleX,
        y: (clientY - r.top) * scaleY,
      };
    };

    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseup', onUp);
    canvas.addEventListener('mouseleave', onUp);
    canvas.addEventListener('touchstart', onDown, { passive: false });
    canvas.addEventListener('touchmove', onMove, { passive: false });
    canvas.addEventListener('touchend', onUp);

    function onDown(e) {
      e.preventDefault();
      state.drawing = true;
      var pos = getPos(e);

      if (state.currentTool === TOOLS.TEXT) {
        var text = prompt('Enter text:');
        if (text) {
          state.annotations.push({ tool: TOOLS.TEXT, x: pos.x, y: pos.y, text: text, color: state.currentColor });
          redrawCanvasEl(canvas);
        }
        state.drawing = false;
        return;
      }

      state.currentShape = {
        tool: state.currentTool,
        color: state.currentColor,
        x: pos.x, y: pos.y,
        x2: pos.x, y2: pos.y,
        w: 0, h: 0,
        points: [pos],
      };
    }

    function onMove(e) {
      e.preventDefault();
      if (!state.drawing || !state.currentShape) return;
      var pos = getPos(e);
      var s = state.currentShape;
      if (s.tool === TOOLS.PEN) {
        s.points.push(pos);
      } else if (s.tool === TOOLS.RECT || s.tool === TOOLS.BLUR) {
        s.w = pos.x - s.x; s.h = pos.y - s.y;
      } else if (s.tool === TOOLS.ARROW) {
        s.x2 = pos.x; s.y2 = pos.y;
      }
      redrawCanvasEl(canvas);
    }

    function onUp(e) {
      if (!state.drawing || !state.currentShape) return;
      state.drawing = false;
      state.annotations.push(state.currentShape);
      state.currentShape = null;
      redrawCanvasEl(canvas);
    }
  }

  // ── Step: form ─────────────────────────────────────────────────────────────

  function renderFormStep(container) {
    var wrap = el('div', '');
    css(wrap, { padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' });

    // HIPAA PHI warning banner
    if (state.hipaaEnabled) {
      var hipaaBanner = el('div', '');
      css(hipaaBanner, {
        background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: '8px',
        padding: '10px 12px', fontSize: '12px', color: '#92400e', lineHeight: '1.5',
      });
      hipaaBanner.innerHTML = '<strong>⚠️ HIPAA Notice:</strong> Do not include patient names, dates of birth, SSNs, medical record numbers, or any other protected health information (PHI) in this submission.';
      wrap.appendChild(hipaaBanner);
    }

    // Screenshot preview
    if (state.captureDataUrl) {
      var preview = el('img', '');
      preview.src = state.captureDataUrl;
      css(preview, { width: '100%', maxHeight: '120px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #e5e7eb' });
      wrap.appendChild(preview);
    }

    // Category
    var catLabel = el('label', '', 'Category');
    css(catLabel, { fontSize: '12px', fontWeight: '600', color: '#374151' });
    var catSelect = el('select', '');
    css(catSelect, {
      width: '100%', padding: '8px 10px', marginTop: '4px',
      border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px',
      background: '#fff', color: '#111',
    });
    (state.categories || ['Bug', 'Feature Request', 'Question', 'Other']).forEach(function (c) {
      var opt = el('option', '', c);
      opt.value = c;
      catSelect.appendChild(opt);
    });
    catLabel.appendChild(catSelect);
    wrap.appendChild(catLabel);

    // Priority
    var prioLabel = el('label', '', 'Priority');
    css(prioLabel, { fontSize: '12px', fontWeight: '600', color: '#374151' });
    var prioSelect = el('select', '');
    css(prioSelect, {
      width: '100%', padding: '8px 10px', marginTop: '4px',
      border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px',
      background: '#fff', color: '#111',
    });
    [['low','Low'],['medium','Medium'],['high','High'],['critical','Critical']].forEach(function(p) {
      var opt = el('option', '', p[1]);
      opt.value = p[0];
      if ((state.formData && state.formData.priority === p[0]) || (!state.formData && p[0] === 'medium')) opt.selected = true;
      prioSelect.appendChild(opt);
    });
    prioLabel.appendChild(prioSelect);
    wrap.appendChild(prioLabel);

    // Description
    var descLabel = el('label', '', 'Description');
    css(descLabel, { fontSize: '12px', fontWeight: '600', color: '#374151' });
    var descTA = el('textarea', '');
    descTA.rows = 4;
    descTA.placeholder = 'Describe what you\'re seeing or what you need help with...';
    css(descTA, {
      width: '100%', padding: '8px 10px', marginTop: '4px',
      border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px',
      resize: 'vertical', boxSizing: 'border-box',
    });
    descLabel.appendChild(descTA);
    wrap.appendChild(descLabel);

    // Include Console checkbox — hidden for HIPAA plugins; shown for all other non-console snaps
    if (state.captureType !== MODES.CONSOLE && !state.hipaaEnabled) {
      var consoleChk = el('label', '');
      css(consoleChk, {
        display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
        fontSize: '12px', color: '#374151', padding: '8px 10px',
        border: '1px solid #d1d5db', borderRadius: '6px', background: '#f9fafb',
      });
      var chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.id = 's4k-attach-console';
      chk.checked = false;
      var countLabel = state.consoleErrors.length > 0
        ? 'Include Console (' + state.consoleErrors.length + ' entries)'
        : 'Include Console';
      consoleChk.appendChild(chk);
      var iconSpan = el('span', '', '&#8964;'); // terminal-ish icon
      css(iconSpan, { fontSize: '14px', lineHeight: '1' });
      consoleChk.appendChild(iconSpan);
      consoleChk.appendChild(document.createTextNode(' ' + countLabel));
      wrap.appendChild(consoleChk);
    }

    // Buttons
    var footer = el('div', '');
    css(footer, { display: 'flex', gap: '8px', marginTop: '4px' });

    var backBtn = el('button', '', '← Back');
    css(backBtn, { flex: '1', padding: '9px', border: '1px solid #d1d5db', borderRadius: '8px', cursor: 'pointer', background: '#fff', fontSize: '13px' });
    backBtn.addEventListener('click', function () {
      if (state.captureDataUrl) {
        state.step = 'annotate';
      } else {
        state.step = 'mode';
        resetCaptureState();
      }
      renderDrawer();
    });

    var submitBtn = el('button', '', 'Send Snap &#9658;');
    css(submitBtn, {
      flex: '2', padding: '9px', border: 'none', borderRadius: '8px',
      cursor: 'pointer', background: state.primaryColor, color: '#fff', fontSize: '13px', fontWeight: '600',
    });
    submitBtn.addEventListener('click', function () {
      var category = catSelect.value;
      var description = descTA.value.trim();
      var attachConsole = false; // default off for HIPAA
      if (!state.hipaaEnabled) {
        var chkEl = document.getElementById('s4k-attach-console');
        if (chkEl) attachConsole = chkEl.checked;
        else attachConsole = true;
      }

      state.formData = { category: category, description: description, priority: prioSelect.value };
      state.attachConsole = attachConsole;
      state.step = 'submitting';
      renderDrawer();
      submitSnap();
    });

    footer.appendChild(backBtn);
    footer.appendChild(submitBtn);
    wrap.appendChild(footer);
    container.appendChild(wrap);
  }

  // ── Step: submitting ───────────────────────────────────────────────────────

  function renderSubmittingStep(container) {
    var wrap = el('div', '');
    css(wrap, { padding: '40px 16px', textAlign: 'center' });
    wrap.innerHTML = '<div style="font-size:36px;margin-bottom:12px">⏳</div><p style="color:#374151;font-weight:600">Sending your snap...</p><p style="color:#9ca3af;font-size:12px;margin-top:8px">Uploading screenshot and metadata.</p>';
    container.appendChild(wrap);
  }

  // ── Step: done ─────────────────────────────────────────────────────────────

  function renderDoneStep(container) {
    var wrap = el('div', '');
    css(wrap, { padding: '40px 16px', textAlign: 'center' });
    wrap.innerHTML = '<div style="font-size:48px;margin-bottom:12px">✅</div><p style="color:#111;font-weight:700;font-size:16px">Snap sent!</p><p style="color:#6b7280;font-size:13px;margin-top:8px">Your feedback has been recorded. Thank you!</p>';
    var closeBtn2 = el('button', '', 'Close');
    css(closeBtn2, {
      marginTop: '20px', padding: '10px 24px', border: 'none',
      borderRadius: '8px', background: state.primaryColor, color: '#fff',
      cursor: 'pointer', fontWeight: '600', fontSize: '14px',
    });
    closeBtn2.addEventListener('click', closeDrawer);
    wrap.appendChild(closeBtn2);
    container.appendChild(wrap);
  }

  // ── Snap submission ────────────────────────────────────────────────────────

  function buildPayload(screenshotUrl, recordingUrl, extraFields) {
    var shapes = state.annotations.map(function (s) {
      return {
        tool: s.tool, color: s.color, points: s.points || null,
        x: s.x, y: s.y, width: s.w, height: s.h,
        x2: s.x2, y2: s.y2, text: s.text || null,
      };
    });
    var context = {
      pageUrl: global.location.href,
      pageTitle: document.title,
      userAgent: navigator.userAgent,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      knackUserId: state.appSource !== 'react' ? (state.knackUser && (state.knackUser.id || state.knackUser.email)) : null,
      knackUserName: state.appSource !== 'react' ? (state.knackUser && state.knackUser.name) : null,
      knackRole: state.appSource !== 'react' ? state.knackRole : null,
      userId: state.appSource === 'react' ? (state.reactUser && state.reactUser.userId) : null,
      userEmail: state.appSource === 'react' ? (state.reactUser && state.reactUser.userEmail) : null,
    };
    var payload = {
      type: state.captureType || MODES.FULL,
      screenshotUrl: screenshotUrl || null,
      recordingUrl: recordingUrl || null,
      annotationData: shapes.length ? { shapes: shapes } : null,
      consoleErrors: (state.attachConsole || state.captureType === MODES.CONSOLE) ? state.consoleErrors.slice() : [],
      formData: state.formData || {},
      context: context,
      priority: (state.formData && state.formData.priority) || 'medium',
    };
    if (extraFields) {
      Object.keys(extraFields).forEach(function (k) { payload[k] = extraFields[k]; });
    }
    return payload;
  }

  function submitSnap() {
    ensureFreshToken().then(function () {
      var isHipaaScreenshot = state.hipaaEnabled && state.captureDataUrl && !state.captureIsVideo;

      if (isHipaaScreenshot) {
        // HIPAA path: submit snap doc first (no screenshotUrl), then upload to staging
        // The Storage trigger will DLP-scan and move to the live path.
        var payload = buildPayload(null, null, { hipaaScreenshot: true });
        return req('POST', FUNCTIONS_BASE + '/submitSnap', payload, state.idToken)
          .then(function (result) {
            var snapId = result && result.id;
            if (!snapId) throw new Error('submitSnap did not return a snap ID');
            return uploadStagingScreenshot(state.captureDataUrl, snapId);
          });
      }

      // Non-HIPAA path: upload first, then submit
      var uploadPromise = Promise.resolve(null);
      if (state.captureDataUrl && !state.captureIsVideo) {
        uploadPromise = uploadScreenshot(state.captureDataUrl);
      } else if (state.captureBlob && state.captureIsVideo) {
        uploadPromise = uploadRecording(state.captureBlob);
      }
      return uploadPromise.then(function (mediaUrl) {
        var screenshotUrl = state.captureIsVideo ? null : mediaUrl;
        var recordingUrl = state.captureIsVideo ? mediaUrl : null;
        return req('POST', FUNCTIONS_BASE + '/submitSnap', buildPayload(screenshotUrl, recordingUrl), state.idToken);
      });
    }).then(function () {
      state.step = 'done';
      renderDrawer();
    }).catch(function (e) {
      state.step = 'form';
      renderDrawer();
      setTimeout(function () { alert('Failed to send snap: ' + e.message); }, 100);
    });
  }

  function uploadStagingScreenshot(dataUrl, snapId) {
    // Upload to staging path named after snap ID — Cloud Function will DLP and move to live path
    var config = state.config;
    var path = 'snap_screenshots_staging/' + config.tenantId + '/' + snapId + '.png';
    var storageBucket = 'snap4knack2.firebasestorage.app';
    var uploadUrl = 'https://firebasestorage.googleapis.com/v0/b/' + storageBucket + '/o?uploadType=media&name=' + encodeURIComponent(path);
    return fetch(dataUrl)
      .then(function (r) { return r.blob(); })
      .then(function (blob) {
        return fetch(uploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'image/png', 'Authorization': 'Bearer ' + state.idToken },
          body: blob,
        });
      })
      .then(function (r) { return r.json(); });
  }

  function uploadScreenshot(dataUrl) {
    // Upload to Firebase Storage via REST API
    var config = state.config;
    var path = 'snap_screenshots/' + config.tenantId + '/' + Date.now() + '.png';
    var storageBucket = 'snap4knack2.firebasestorage.app';
    var uploadUrl = 'https://firebasestorage.googleapis.com/v0/b/' + storageBucket + '/o?uploadType=media&name=' + encodeURIComponent(path);

    return fetch(dataUrl)
      .then(function (r) { return r.blob(); })
      .then(function (blob) {
        return fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'image/png',
            'Authorization': 'Bearer ' + state.idToken,
          },
          body: blob,
        });
      })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var token = data.downloadTokens || '';
        var base = 'https://firebasestorage.googleapis.com/v0/b/' + storageBucket + '/o/' + encodeURIComponent(data.name) + '?alt=media';
        return token ? base + '&token=' + token : base;
      });
  }

  function uploadRecording(blob) {
    var config = state.config;
    var ext = blob.type.indexOf('mp4') !== -1 ? 'mp4' : 'webm';
    var path = 'snap_recordings/' + config.tenantId + '/' + Date.now() + '.' + ext;
    var storageBucket = 'snap4knack2.firebasestorage.app';
    var uploadUrl = 'https://firebasestorage.googleapis.com/v0/b/' + storageBucket + '/o?uploadType=media&name=' + encodeURIComponent(path);

    return fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Type': blob.type || 'video/webm',
        'Authorization': 'Bearer ' + state.idToken,
      },
      body: blob,
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var token = data.downloadTokens || '';
        var base = 'https://firebasestorage.googleapis.com/v0/b/' + storageBucket + '/o/' + encodeURIComponent(data.name) + '?alt=media';
        return token ? base + '&token=' + token : base;
      });
  }

  // ── html2canvas lazy loader ────────────────────────────────────────────────

  var _h2c = null;
  function loadHtml2Canvas(cb) {
    if (_h2c) { cb(_h2c); return; }
    if (global.html2canvas) { _h2c = global.html2canvas; cb(_h2c); return; }
    var s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    s.onload = function () { _h2c = global.html2canvas; cb(_h2c); };
    s.onerror = function () { alert('Could not load html2canvas. Check your network connection.'); };
    document.head.appendChild(s);
  }

  // ── Mount ──────────────────────────────────────────────────────────────────

  function mount(config) {
    state.config = config;
    state.primaryColor = config.primaryColor || '#3b82f6';
    state.position = config.position || 'bottom-right';
    state.categories = config.categories || ['Bug', 'Feature Request', 'Question', 'Other'];

    var mounted = false;

    function doMount(user) {
      if (mounted) return;
      mounted = true;
      var roles = getRoles(user);
      var knackRole = roles.length ? roles[0] : 'authenticated';
      authenticate(user, knackRole);
    }

    // Poll every 300ms for Knack to appear (mirrors Chat4Knack approach)
    var poll = setInterval(function () {
      if (typeof global.Knack === 'undefined') return;

      // Classic Knack API
      if (typeof global.Knack.getUserAttributes === 'function') {
        var user = global.Knack.getUserAttributes();
        if (user && user.id) {
          clearInterval(poll);
          var token = (typeof global.Knack.getUserToken === 'function') ? (global.Knack.getUserToken() || '') : '';
          doMount({ id: user.id, name: user.name, email: user.email, roles: getRoles(user), token: token });
          return;
        }
      }

      // Next-Gen Knack API (Promise-based)
      if (typeof global.Knack.getUser === 'function' && !mounted) {
        clearInterval(poll);
        var fetchUser = function () {
          global.Knack.getUser().then(function (user) {
            if (!user || !user.id) { setTimeout(fetchUser, 1000); return; }
            doMount({ id: user.id, name: user.name || user.email, email: user.email || '', roles: getRoles(user), token: user.token || '' });
          }).catch(function () { setTimeout(fetchUser, 2000); });
        };
        (typeof global.Knack.ready === 'function') ? global.Knack.ready().then(fetchUser) : fetchUser();
      }
    }, 300);

    // Stop polling after 60 seconds
    setTimeout(function () {
      if (!mounted) {
        clearInterval(poll);
        console.warn('[Snap4Knack] No authenticated Knack user found after 60s.');
      }
    }, 60000);
  }

  function authenticate(knackUser, knackRole) {
    state.knackUser = knackUser;
    state.knackRole = knackRole;
    var userId = knackUser.id || knackUser.email || 'anonymous';
    getWidgetToken(state.config.pluginId, state.config.tenantId, userId, knackRole)
      .then(function (idToken) {
        state.idToken = idToken;
        state.idTokenAcquiredAt = Date.now();
        return fetchPluginBranding(state.config.pluginId, state.config.tenantId, idToken);
      })
      .then(function () {
        injectFAB();
      })
      .catch(function (e) {
        // Role not authorized for this plugin — silently do nothing (expected)
        if (e.message && e.message.indexOf('permission-denied') !== -1) return;
        if (e.message && e.message.indexOf('PERMISSION_DENIED') !== -1) return;
        console.warn('[Snap4Knack] Auth error:', e.message);
      });
  }

  function authenticateReact(reactUser) {
    state.reactUser = reactUser;
    var userId = reactUser.userId || reactUser.userEmail || 'anonymous';
    getWidgetToken(state.config.pluginId, state.config.tenantId, userId, 'authenticated')
      .then(function (idToken) {
        state.idToken = idToken;
        state.idTokenAcquiredAt = Date.now();
        return fetchPluginBranding(state.config.pluginId, state.config.tenantId, idToken);
      })
      .then(function () {
        injectFAB();
      })
      .catch(function (e) {
        console.warn('[Snap4Knack] React auth error:', e.message);
      });
  }

  // ── Mount: React/Firebase apps ─────────────────────────────────────────────

  function mountReact(config) {
    if (!config || !config.pluginId || !config.tenantId || !config.userId) {
      console.warn('[Snap4Knack] mountReact() requires pluginId, tenantId, and userId');
      return;
    }
    state.config = config;
    state.appSource = 'react';
    state.primaryColor = config.primaryColor || '#3b82f6';
    state.position = config.position || 'bottom-right';
    state.categories = config.categories || ['Bug', 'Feature Request', 'Question', 'Other'];
    authenticateReact({ userId: config.userId, userEmail: config.userEmail || '' });
  }

  // ── Export ─────────────────────────────────────────────────────────────────

  global.Snap4Knack = { mount: mount, mountReact: mountReact };

}(window));
