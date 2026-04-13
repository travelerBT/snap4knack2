/**
 * Knack Character Limit Enforcer
 * Works for both regular text fields (input/textarea) and rich text fields (CKEditor).
 *
 * Usage:
 *   Paste this entire script into your Knack app's JavaScript area.
 *   Edit the CHAR_LIMITS array below to configure which fields to limit.
 */

// ── Configuration ──────────────────────────────────────────────────────────
// Add one entry per field you want to limit.
var CHAR_LIMITS = [
  { fieldId: 'field_123', maxChars: 100 },
  // { fieldId: 'field_456', maxChars: 250 },
];

// ── Shared styles for the counter ──────────────────────────────────────────
var COUNTER_STYLE = 'display:block;margin-top:4px;font-size:12px;';
var COLOR_NORMAL = '#888';
var COLOR_LIMIT  = '#cc0000';

// ── Bootstrap on every scene render ────────────────────────────────────────
$(document).on('knack-scene-render.any', function () {
  CHAR_LIMITS.forEach(function (cfg) {
    enforceCharLimit(cfg.fieldId, cfg.maxChars);
  });
});

// ── Main entry point per field ─────────────────────────────────────────────
function enforceCharLimit(fieldId, maxChars) {
  // Try regular text first, then fall back to rich text (CKEditor).
  var $plain = $('input[name="' + fieldId + '"], textarea[name="' + fieldId + '"]');

  if ($plain.length) {
    initPlainTextLimit($plain, fieldId, maxChars);
  } else {
    // Rich text fields — Knack loads CKEditor asynchronously, so we may
    // need to wait for the instance to appear.
    initRichTextLimit(fieldId, maxChars);
  }
}

// ── Regular text / textarea ────────────────────────────────────────────────
function initPlainTextLimit($el, fieldId, maxChars) {
  var counterId = 'char-counter-' + fieldId;

  // Inject counter once
  if (!$('#' + counterId).length) {
    var currentLen = ($el.val() || '').length;
    $el.after(
      '<small id="' + counterId + '" style="' + COUNTER_STYLE + 'color:' + COLOR_NORMAL + ';">' +
        currentLen + ' / ' + maxChars + ' characters</small>'
    );
  }

  // Use a namespaced event so we can safely re-bind without stacking handlers.
  var ns = 'input.charlimit_' + fieldId;
  $(document).off(ns).on(ns, 'input[name="' + fieldId + '"], textarea[name="' + fieldId + '"]', function () {
    var len = $(this).val().length;
    if (len > maxChars) {
      $(this).val($(this).val().substring(0, maxChars));
      len = maxChars;
    }
    updateCounter(counterId, len, maxChars);
  });
}

// ── Rich text (CKEditor) ──────────────────────────────────────────────────
function initRichTextLimit(fieldId, maxChars) {
  // CKEditor instances are keyed by the textarea id that Knack generates.
  // The id pattern is typically the fieldId itself, but it can also appear as
  // "view_XX-field_YY".  We search CKEDITOR.instances for a key containing
  // the fieldId.
  if (typeof CKEDITOR === 'undefined') {
    // CKEditor hasn't loaded yet — retry shortly.
    setTimeout(function () { initRichTextLimit(fieldId, maxChars); }, 500);
    return;
  }

  var editor = findCKEditorInstance(fieldId);

  if (!editor) {
    // The instance may not have been created yet (Knack is still rendering).
    // Retry a few times, then give up.
    var retries = 0;
    var timer = setInterval(function () {
      editor = findCKEditorInstance(fieldId);
      if (editor) {
        clearInterval(timer);
        attachRichTextHandlers(editor, fieldId, maxChars);
      } else if (++retries > 20) {
        clearInterval(timer);
      }
    }, 300);
    return;
  }

  attachRichTextHandlers(editor, fieldId, maxChars);
}

function findCKEditorInstance(fieldId) {
  if (typeof CKEDITOR === 'undefined' || !CKEDITOR.instances) return null;
  for (var name in CKEDITOR.instances) {
    if (name.indexOf(fieldId) !== -1) {
      return CKEDITOR.instances[name];
    }
  }
  return null;
}

function attachRichTextHandlers(editor, fieldId, maxChars) {
  var counterId = 'char-counter-' + fieldId;

  // Wait until the editor is fully ready before attaching events.
  function onReady() {
    // Inject the counter below the editor container.
    if (!$('#' + counterId).length) {
      var $container = $(editor.container.$);
      var currentLen = getPlainTextLength(editor);
      $container.after(
        '<small id="' + counterId + '" style="' + COUNTER_STYLE + 'color:' + COLOR_NORMAL + ';">' +
          currentLen + ' / ' + maxChars + ' characters</small>'
      );
    }

    // Listen for keystrokes and changes inside CKEditor.
    editor.on('change', function () { enforceRichLimit(editor, counterId, maxChars); });
    editor.on('key',    function () {
      // Small delay so the DOM reflects the keystroke.
      setTimeout(function () { enforceRichLimit(editor, counterId, maxChars); }, 0);
    });
    editor.on('paste',  function (evt) {
      // After paste is applied, re-check.
      setTimeout(function () { enforceRichLimit(editor, counterId, maxChars); }, 0);
    });
  }

  if (editor.status === 'ready') {
    onReady();
  } else {
    editor.on('instanceReady', onReady);
  }
}

function enforceRichLimit(editor, counterId, maxChars) {
  var plainText = getPlainText(editor);
  var len = plainText.length;

  if (len > maxChars) {
    // Truncate the plain text and set it back as HTML to preserve minimal
    // structure.  This is intentionally aggressive — when at the limit the
    // user must delete before typing more.
    var truncated = plainText.substring(0, maxChars);
    // Preserve line breaks by converting them back to <br> / <p> tags.
    var html = truncated.replace(/\n/g, '<br>');
    editor.setData(html);
    len = maxChars;
  }

  updateCounter(counterId, len, maxChars);
}

// ── Helpers ────────────────────────────────────────────────────────────────
function getPlainText(editor) {
  // Get the editor content and strip HTML to count only visible characters.
  var html = editor.getData();
  return stripHtml(html);
}

function getPlainTextLength(editor) {
  return getPlainText(editor).length;
}

function stripHtml(html) {
  // Use a temporary element to reliably strip tags and decode entities.
  var tmp = document.createElement('div');
  tmp.innerHTML = html;
  // innerText preserves line breaks from block elements, textContent does not.
  // We use textContent and manually handle <br>/<p> to get a consistent count.
  return (tmp.textContent || tmp.innerText || '').replace(/\s+$/g, '');
}

function updateCounter(counterId, len, maxChars) {
  var $counter = $('#' + counterId);
  $counter.text(len + ' / ' + maxChars + ' characters');
  $counter.css('color', len >= maxChars ? COLOR_LIMIT : COLOR_NORMAL);
}
