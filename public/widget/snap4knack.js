/**
 * Snap4Knack Widget v1.0.0
 * Visual feedback capture tool for Knack applications.
 * Full vanilla JS — no external dependencies.
 */
;(function (global) {
  'use strict';
  console.log('[Snap4Knack] snap4knack.js IIFE running');
  if (global.Snap4Knack) { console.log('[Snap4Knack] already loaded, returning'); return; }

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
  };

  // ── Console error capture ──────────────────────────────────────────────────

  var _origError = console.error.bind(console);
  console.error = function () {
    try {
      var args = Array.prototype.slice.call(arguments);
      state.consoleErrors.push({
        message: args.map(function(a){ return String(a); }).join(' '),
        source: new Error().stack || '',
        timestamp: Date.now(),
      });
      if (state.consoleErrors.length > 50) state.consoleErrors.shift();
    } catch (e) { /* ignore */ }
    _origError.apply(console, arguments);
  };

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

  function getWidgetToken(pluginId, tenantId, knackUserId, knackUserRole) {
    // onRequest — send data directly, response is { token: "..." }
    return req('POST', FUNCTIONS_BASE + '/issueWidgetToken', {
      pluginId: pluginId,
      tenantId: tenantId,
      knackUserId: knackUserId,
      knackUserRole: knackUserRole,
    }).then(function (resp) {
      // Exchange custom token for Firebase ID token
      return exchangeCustomToken(resp.token);
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

  function injectFAB() {
    if (document.getElementById('s4k-fab')) return;
    var fab = el('button', '', '&#128247;');
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
      fontSize: '22px',
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
    var title = el('span', '', '&#128247; Send Feedback');
    css(title, { fontWeight: '600', fontSize: '15px' });
    var closeBtn = el('button', '', '&#10005;');
    css(closeBtn, {
      background: 'rgba(255,255,255,0.2)',
      border: 'none',
      color: '#fff',
      width: '28px', height: '28px',
      borderRadius: '50%',
      cursor: 'pointer',
      fontSize: '14px',
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

    var modes = [
      { id: MODES.FULL, icon: '&#128444;', label: 'Full Page', desc: 'Capture the entire visible page' },
      { id: MODES.AREA, icon: '&#9635;', label: 'Select Area', desc: 'Draw a region to capture' },
      { id: MODES.PIN, icon: '&#128204;', label: 'Pin Element', desc: 'Click on a specific element' },
      { id: MODES.RECORDING, icon: '&#9654;', label: 'Record Screen', desc: 'Record up to 30 seconds' },
      { id: MODES.CONSOLE, icon: '&#128187;', label: 'Console Errors', desc: 'Attach recent JS errors (' + state.consoleErrors.length + ')' },
    ];

    modes.forEach(function (m) {
      var btn = el('button', '', '');
      css(btn, {
        display: 'flex', alignItems: 'flex-start', gap: '12px',
        width: '100%', padding: '12px', marginBottom: '8px',
        background: '#f9fafb', border: '2px solid #e5e7eb',
        borderRadius: '8px', cursor: 'pointer', textAlign: 'left',
        transition: 'border-color 0.15s',
      });
      btn.innerHTML = '<span style="font-size:22px;flex-shrink:0">' + m.icon + '</span>' +
        '<span><strong style="display:block;font-size:13px;color:#111">' + m.label + '</strong>' +
        '<span style="font-size:12px;color:#6b7280">' + m.desc + '</span></span>';
      btn.addEventListener('mouseenter', function(){ btn.style.borderColor = state.primaryColor; });
      btn.addEventListener('mouseleave', function(){ btn.style.borderColor = '#e5e7eb'; });
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
    var stream = null;
    var chunks = [];

    try {
      var canvas = document.createElement('canvas');
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      stream = canvas.captureStream(15);
    } catch (e) {
      alert('Screen recording not supported in this context.');
      state.step = 'mode';
      showDrawer();
      renderDrawer();
      return;
    }

    var mr = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
    state.mediaRecorder = mr;
    state.recordingChunks = chunks;
    state.recording = true;

    mr.ondataavailable = function (e) { if (e.data.size) chunks.push(e.data); };
    mr.onstop = function () {
      state.recording = false;
      var blob = new Blob(chunks, { type: 'video/webm' });
      state.captureBlob = blob;
      state.captureDataUrl = null;
      state.captureType = MODES.RECORDING;
      state.captureIsVideo = true;
      state.step = 'form';
      showDrawer();
      renderDrawer();
    };
    mr.start(500);

    // Recording in progress — show a minimal recording indicator
    var recIndicator = el('div', '', '&#9679; Recording... <button id="s4k-stop-rec" style="margin-left:12px;padding:4px 10px;background:#fff;color:#dc2626;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600">Stop</button>');
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

    // Auto-stop after 30s
    var timeout = setTimeout(stopRecording, 30000);

    document.getElementById('s4k-stop-rec').addEventListener('click', function () {
      clearTimeout(timeout);
      stopRecording();
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

    var tools = [
      { id: TOOLS.PEN, label: '✏️', title: 'Draw' },
      { id: TOOLS.RECT, label: '⬜', title: 'Rectangle' },
      { id: TOOLS.ARROW, label: '➡️', title: 'Arrow' },
      { id: TOOLS.TEXT, label: '🔤', title: 'Text' },
      { id: TOOLS.BLUR, label: '🔲', title: 'Redact' },
    ];

    tools.forEach(function (t) {
      var btn = el('button', '', t.label);
      btn.title = t.title;
      css(btn, {
        padding: '5px 8px', border: '2px solid',
        borderColor: state.currentTool === t.id ? state.primaryColor : '#d1d5db',
        background: state.currentTool === t.id ? '#eff6ff' : '#fff',
        borderRadius: '6px', cursor: 'pointer', fontSize: '14px',
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
        width: '20px', height: '20px', borderRadius: '50%', background: c,
        border: state.currentColor === c ? '3px solid #111' : '2px solid transparent',
        cursor: 'pointer',
      });
      swatch.addEventListener('click', function () { state.currentColor = c; renderDrawer(); });
      toolbar.appendChild(swatch);
    });

    // Undo + Clear
    var undoBtn = el('button', '', '↩');
    css(undoBtn, { padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' });
    undoBtn.title = 'Undo';
    undoBtn.addEventListener('click', function () { state.annotations.pop(); redrawCanvas(); });
    toolbar.appendChild(undoBtn);

    var clearBtn = el('button', '', '🗑');
    css(clearBtn, { padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' });
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

    // Console errors indicator
    if (state.captureType !== MODES.CONSOLE && state.consoleErrors.length > 0) {
      var consoleChk = el('label', '');
      css(consoleChk, { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#374151' });
      var chk = document.createElement('input');
      chk.type = 'checkbox'; chk.id = 's4k-attach-console'; chk.checked = true;
      consoleChk.appendChild(chk);
      consoleChk.appendChild(document.createTextNode('Attach console errors (' + state.consoleErrors.length + ')'));
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
      var attachConsole = true;
      var chkEl = document.getElementById('s4k-attach-console');
      if (chkEl) attachConsole = chkEl.checked;

      state.formData = { category: category, description: description };
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

  function submitSnap() {
    // Upload screenshot to Firebase Storage if needed
    var uploadPromise = Promise.resolve(null);

    if (state.captureDataUrl && !state.captureIsVideo) {
      uploadPromise = uploadScreenshot(state.captureDataUrl);
    } else if (state.captureBlob && state.captureIsVideo) {
      uploadPromise = uploadRecording(state.captureBlob);
    }

    uploadPromise.then(function (mediaUrl) {
      var screenshotUrl = state.captureIsVideo ? null : mediaUrl;
      var recordingUrl = state.captureIsVideo ? mediaUrl : null;

      // Flatten annotations to plain shapes array
      var shapes = state.annotations.map(function (s) {
        return {
          tool: s.tool,
          color: s.color,
          points: s.points || null,
          x: s.x, y: s.y,
          width: s.w, height: s.h,
          x2: s.x2, y2: s.y2,
          text: s.text || null,
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
        knackUserId: state.knackUser && (state.knackUser.id || state.knackUser.email),
        knackRole: state.knackRole,
      };

      var payload = {
        type: state.captureType || MODES.FULL,
        screenshotUrl: screenshotUrl,
        recordingUrl: recordingUrl,
        annotationData: shapes.length ? { shapes: shapes } : null,
        consoleErrors: state.attachConsole ? state.consoleErrors.slice(-20) : [],
        formData: state.formData || {},
        context: context,
        priority: 'medium',
      };

      return req('POST', FUNCTIONS_BASE + '/submitSnap', payload, state.idToken);
    }).then(function () {
      state.step = 'done';
      renderDrawer();
    }).catch(function (e) {
      state.step = 'form';
      renderDrawer();
      setTimeout(function () { alert('Failed to send snap: ' + e.message); }, 100);
    });
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
        return 'https://firebasestorage.googleapis.com/v0/b/' + storageBucket + '/o/' +
          encodeURIComponent(data.name) + '?alt=media&token=' + data.downloadTokens;
      });
  }

  function uploadRecording(blob) {
    var config = state.config;
    var path = 'snap_recordings/' + config.tenantId + '/' + Date.now() + '.webm';
    var storageBucket = 'snap4knack2.firebasestorage.app';
    var uploadUrl = 'https://firebasestorage.googleapis.com/v0/b/' + storageBucket + '/o?uploadType=media&name=' + encodeURIComponent(path);

    return fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'video/webm',
        'Authorization': 'Bearer ' + state.idToken,
      },
      body: blob,
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        return 'https://firebasestorage.googleapis.com/v0/b/' + storageBucket + '/o/' +
          encodeURIComponent(data.name) + '?alt=media&token=' + data.downloadTokens;
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
      console.log('[Snap4Knack] User found. id:', user.id, 'role:', knackRole);
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
        injectFAB();
      })
      .catch(function (e) {
        // Role not authorized for this plugin — silently do nothing (expected)
        if (e.message && e.message.indexOf('permission-denied') !== -1) return;
        if (e.message && e.message.indexOf('PERMISSION_DENIED') !== -1) return;
        console.warn('[Snap4Knack] Auth error:', e.message);
      });
  }

  // ── Export ─────────────────────────────────────────────────────────────────

  global.Snap4Knack = { mount: mount };

}(window));
