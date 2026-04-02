/**
 * landing.js — Landing Page Logic
 *
 * This script runs when landing.html loads.
 * It handles button clicks and checks if a user is already logged in.
 *
 * NOTE: All functions here use window.electronAPI which is defined in preload.js.
 * Never use require() in renderer files — it won't work because nodeIntegration is off.
 *
 * WHY addEventListener INSTEAD OF onclick="...":
 * The Content-Security-Policy header in the HTML uses "script-src 'self'", which
 * blocks inline event handlers like onclick="goToSignup()". To work within this
 * security policy, we attach all click listeners here in the JS file instead.
 */

/**
 * Navigate to the Sign Up screen.
 */
function goToSignup() {
  window.electronAPI.navigate('signup');
}

/**
 * Navigate to the Log In screen.
 */
function goToLogin() {
  window.electronAPI.navigate('login');
}

/**
 * On page load, check if a user is already logged in.
 * If so, redirect them to their role-specific main page.
 * This handles the case where the app was closed and reopened
 * while a session was active.
 *
 * Sessions are persisted to the database, so the user stays logged in
 * across app restarts. On startup, createWindow() restores the session and
 * loads the dashboard directly. This check handles mid-session navigation
 * back to the landing page.
 */
async function initializePage() {
  // Attach button click listeners here (not in HTML) to comply with Content-Security-Policy
  document.getElementById('signup-btn').addEventListener('click', goToSignup);
  document.getElementById('login-btn').addEventListener('click', goToLogin);

  try {
    const session = await window.electronAPI.getSession();

    // If user is already logged in, send them to their dashboard
    if (session && session.userId) {
      if (session.role === 'parent') {
        window.electronAPI.navigate('parent-main');
      } else if (session.role === 'provider') {
        window.electronAPI.navigate('provider-main');
      }
    } else if (session && session.childId) {
      window.electronAPI.navigate('child-main');
    }
    // Otherwise, stay on the landing page and let the user choose
  } catch (err) {
    // Session check failed — stay on landing page (buttons are already attached)
    console.warn('Session check failed on landing page:', err);
  }
}

// Run initialization when DOM is ready
document.addEventListener('DOMContentLoaded', initializePage);
