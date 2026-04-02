/**
 * session-guard.js — Periodic Session Validity Check
 *
 * Checks every 60 seconds that the user's session is still valid.
 * If the session has expired or been cleared (e.g. logged out from another
 * window, or the database was reset), the user is redirected to the
 * landing page with a friendly toast message.
 *
 * Usage:
 *   <script src="../shared/session-guard.js" defer></script>
 *
 * Load AFTER toast.js so showToast is available for the expiry message.
 * Safe to include on any page — it only runs if window.electronAPI exists.
 */

(function () {
  const CHECK_INTERVAL_MS = 60000; // 1 minute

  // Don't run on the landing or auth pages (no session expected)
  const noGuardPages = ['landing', 'login', 'signup'];
  const currentPage = document.title.toLowerCase();
  if (noGuardPages.some(p => currentPage.includes(p))) return;

  // Don't run if electronAPI isn't available (e.g. in tests)
  if (typeof window === 'undefined' || !window.electronAPI) return;

  let guardTimer = null;

  async function checkSession() {
    try {
      const session = await window.electronAPI.getSession();
      if (!session || (!session.userId && !session.childId)) {
        clearInterval(guardTimer);
        // Show a message if toast is available
        if (typeof showToast === 'function') {
          showToast('Your session has expired. Please log in again.', 'warning');
        }
        // Brief delay so the toast is visible before redirect
        setTimeout(() => window.electronAPI.navigate('landing'), 1200);
      }
    } catch (err) {
      // IPC failure — don't redirect, just log (could be a transient issue)
      console.warn('[session-guard] Session check failed:', err);
    }
  }

  // Start checking after the page has loaded and had time to initialise.
  // Initial delay of 5 seconds (to let the page fully init), then check
  // immediately and repeat every CHECK_INTERVAL_MS.
  setTimeout(() => {
    checkSession(); // check immediately on first run
    guardTimer = setInterval(checkSession, CHECK_INTERVAL_MS);
  }, 5000);
})();
