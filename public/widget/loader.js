/**
 * Snap4Knack Widget Loader v1.0.0
 * Minimal bootstrap — loads the full widget bundle and initializes it.
 * Usage: paste into Knack app JS area
 *
 * (function(){var s=document.createElement('script');
 * s.src='https://snap4knack2.web.app/widget/loader.js';
 * s.onload=function(){Snap4KnackLoader.init({pluginId:'...',tenantId:'...',appId:'...'})};
 * document.head.appendChild(s)})();
 */
(function (global) {
  'use strict';

  if (global.Snap4KnackLoader) return; // prevent double-load

  var BASE_URL = 'https://snap4knack2.web.app';
  var WIDGET_BUNDLE = BASE_URL + '/widget/snap4knack.js?v=' + Date.now();
  var _config = null;
  var _loaded = false;

  function loadScript(src, cb) {
    if (document.querySelector('script[data-snap4knack]')) {
      cb();
      return;
    }
    var s = document.createElement('script');
    s.src = src;
    s.setAttribute('data-snap4knack', '1');
    s.onload = cb;
    s.onerror = function () {
      console.error('[Snap4Knack] Failed to load widget bundle from', src);
    };
    document.head.appendChild(s);
  }

  function init(config) {
    console.log('[Snap4Knack] loader init() called', config);
    if (!config || !config.pluginId || !config.tenantId || !config.appId) {
      console.warn('[Snap4Knack] init() requires pluginId, tenantId, and appId');
      return;
    }
    _config = config;
    _config.baseUrl = BASE_URL;

    if (_loaded && global.Snap4Knack) {
      global.Snap4Knack.mount(_config);
      return;
    }

    console.log('[Snap4Knack] loading bundle:', WIDGET_BUNDLE);
    loadScript(WIDGET_BUNDLE, function () {
      _loaded = true;
      console.log('[Snap4Knack] bundle loaded, Snap4Knack on window:', !!global.Snap4Knack);
      if (global.Snap4Knack) {
        global.Snap4Knack.mount(_config);
      } else {
        console.error('[Snap4Knack] Widget bundle loaded but Snap4Knack not found on window.');
      }
    });
  }

  global.Snap4KnackLoader = { init: init };
}(window));
