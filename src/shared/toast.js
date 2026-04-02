/**
 * toast.js — Shared toast notification + confirm dialog system
 *
 * Replaces native alert() and confirm() with styled, non-blocking UI.
 *
 * Usage:
 *   showToast('message')                  — red error toast (default)
 *   showToast('message', 'success')       — green success toast
 *   showToast('message', 'info')          — blue info toast
 *   showToast('message', 'warning')       — amber warning toast
 *
 *   showConfirm('Question?', 'Yes label', 'No label')
 *     .then(confirmed => { if (confirmed) { ... } })
 *
 * Load this script with:
 *   <script src="../shared/toast.js" defer></script>
 *   (or  <script src="toast.js" defer></script>  from same folder)
 */

(function () {

  // ── Inject the container once ──────────────────────────────────────────
  function getContainer() {
    let c = document.getElementById('toast-container');
    if (!c) {
      c = document.createElement('div');
      c.id = 'toast-container';
      document.body.appendChild(c);
    }
    return c;
  }

  // ── Escape HTML to prevent XSS ────────────────────────────────────────
  function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  // ── showToast ──────────────────────────────────────────────────────────
  window.showToast = function (message, type = 'error', duration = 3500) {
    const container = getContainer();

    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;

    const icons = { error: '⚠️', success: '✅', info: 'ℹ️', warning: '⚠️' };
    toast.innerHTML =
      '<span class="toast-icon">' + (icons[type] || '⚠️') + '</span>' +
      '<span class="toast-msg">' + esc(message) + '</span>' +
      '<button class="toast-close" aria-label="Dismiss">✕</button>';

    toast.querySelector('.toast-close').addEventListener('click', () => dismiss(toast));
    container.appendChild(toast);

    // Accessible: add role + aria-live so screen readers announce the toast
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');

    // Trigger enter animation on next frame
    requestAnimationFrame(() => toast.classList.add('toast-visible'));

    // Auto-dismiss with pause-on-hover (WCAG 2.2.1 Timing Adjustable)
    let remaining = duration;
    let startTime = Date.now();
    let timer = setTimeout(() => dismiss(toast), remaining);

    toast._timer = timer;

    function pauseTimer() {
      clearTimeout(toast._timer);
      remaining -= (Date.now() - startTime);
      if (remaining < 0) remaining = 0;
    }

    function resumeTimer() {
      startTime = Date.now();
      toast._timer = setTimeout(() => dismiss(toast), remaining);
    }

    toast.addEventListener('mouseenter', pauseTimer);
    toast.addEventListener('mouseleave', resumeTimer);
    // Also pause when toast receives keyboard focus
    toast.addEventListener('focusin', pauseTimer);
    toast.addEventListener('focusout', resumeTimer);
  };

  function dismiss(toast) {
    clearTimeout(toast._timer);
    toast.classList.remove('toast-visible');
    toast.classList.add('toast-hiding');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }

  // ── showConfirm ────────────────────────────────────────────────────────
  // Returns a Promise<boolean> — resolves true if confirmed, false if cancelled.
  window.showConfirm = function (message, confirmLabel = 'Confirm', cancelLabel = 'Cancel') {
    return new Promise((resolve) => {
      // Backdrop
      const overlay = document.createElement('div');
      overlay.className = 'confirm-overlay';

      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', message);

      overlay.innerHTML =
        '<div class="confirm-dialog">' +
          '<div class="confirm-msg">' + esc(message) + '</div>' +
          '<div class="confirm-btns">' +
            '<button class="confirm-btn-cancel">' + esc(cancelLabel) + '</button>' +
            '<button class="confirm-btn-ok">' + esc(confirmLabel) + '</button>' +
          '</div>' +
        '</div>';

      document.body.appendChild(overlay);

      // Animate in
      requestAnimationFrame(() => overlay.classList.add('confirm-visible'));

      function close(result) {
        overlay.classList.remove('confirm-visible');
        overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
        resolve(result);
      }

      const okBtn = overlay.querySelector('.confirm-btn-ok');
      const cancelBtn = overlay.querySelector('.confirm-btn-cancel');
      okBtn.addEventListener('click', () => close(true));
      cancelBtn.addEventListener('click', () => close(false));
      // Focus the cancel button by default (safer default)
      requestAnimationFrame(() => cancelBtn.focus());
      // Click outside = cancel
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
    });
  };

  // ── showSuccess ───────────────────────────────────────────────────────
  // Displays a success completion popup with an icon, message, and a
  // single button that navigates away (or calls a callback).
  //   showSuccess('Successfully added Luna!', 'Back to Home', () => navigate('parent-main'))
  window.showSuccess = function (message, buttonLabel = 'Continue', onConfirm) {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay success-overlay';

    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', message);

    overlay.innerHTML =
      '<div class="confirm-dialog success-dialog">' +
        '<div class="success-icon" aria-hidden="true">✅</div>' +
        '<div class="success-message">' + esc(message) + '</div>' +
        '<button class="success-btn">' + esc(buttonLabel) + '</button>' +
      '</div>';

    document.body.appendChild(overlay);

    // Animate in
    requestAnimationFrame(() => overlay.classList.add('confirm-visible'));

    function close() {
      overlay.classList.remove('confirm-visible');
      overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
      if (typeof onConfirm === 'function') onConfirm();
    }

    overlay.querySelector('.success-btn').addEventListener('click', close);
    // Focus the button
    requestAnimationFrame(() => overlay.querySelector('.success-btn').focus());
  };

})();
