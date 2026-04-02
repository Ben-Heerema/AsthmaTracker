/**
 * login.js — Login Page Logic
 *
 * Handles:
 *   - Form submission and credential validation via IPC
 *   - Routing to the correct main page based on user role
 *   - Error display
 *
 * NOTE: Buttons are wired up with addEventListener (not inline onclick="...")
 * because the Content-Security-Policy in login.html blocks inline event handlers.
 */

function goBack() {
  window.electronAPI.navigate('landing');
}

// Attach the Back button listener once the DOM is ready.
// The form submit listener below is also safe because <form> submit events
// are NOT blocked by CSP — only inline onclick attributes are blocked.
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('back-btn').addEventListener('click', goBack);
});

document.getElementById('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();

  const usernameOrEmail = document.getElementById('username-email').value.trim();
  const password        = document.getElementById('password').value;
  const errorEl         = document.getElementById('login-error');
  const submitBtn       = document.getElementById('submit-btn');

  // Basic client-side check: ensure fields aren't empty
  if (!usernameOrEmail || !password) {
    errorEl.textContent = 'Please enter your username/email and password';
    errorEl.classList.remove('hidden');
    return;
  }

  // Disable button while request is processing
  submitBtn.disabled = true;
  submitBtn.textContent = 'Logging in...';
  errorEl.classList.add('hidden');

  // Send credentials to main.js for verification against the database
  try {
    const result = await window.electronAPI.login({ usernameOrEmail, password });

    if (result.success) {
      // Login successful — route to the correct main page based on role
      if (result.user.role === 'parent') {
        window.electronAPI.navigate('parent-main');
      } else if (result.user.role === 'provider') {
        window.electronAPI.navigate('provider-main');
      }
    } else {
      // Show generic error (don't reveal whether username or password was wrong)
      errorEl.textContent = result.error || 'Invalid username/email or password';
      errorEl.classList.remove('hidden');

      // Re-enable button for retry
      submitBtn.disabled = false;
      submitBtn.textContent = 'Log In';
    }
  } catch (err) {
    console.error('Login failed:', err);
    errorEl.textContent = 'Something went wrong. Please try again.';
    errorEl.classList.remove('hidden');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Log In';
  }
});
