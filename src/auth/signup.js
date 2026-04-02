/**
 * signup.js — Sign Up Page Logic
 *
 * Handles:
 *   - Real-time password strength feedback
 *   - Form validation (client-side first, then server-side via IPC)
 *   - Account creation via window.electronAPI.signup()
 *   - Navigation to onboarding after success
 *
 * NOTE: All button click handlers are attached with addEventListener (not onclick="...")
 * because the Content-Security-Policy in signup.html blocks inline event handlers.
 * Role buttons use "event delegation" — one listener on the parent container reads
 * the data-role attribute of whichever button was clicked.
 */

// Track the selected role ('parent' or 'provider')
let selectedRole = null;

/**
 * selectRole — Called when user clicks a role button (Parent or Provider).
 * Updates the visual selection and stores the role.
 * @param {string} role - 'parent' or 'provider'
 */
function selectRole(role) {
  selectedRole = role;

  // Update visual state: highlight selected, de-highlight other
  document.querySelectorAll('.role-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.role === role);
  });

  // Clear any role error message
  hideError('role-error');
}

/**
 * goBack — Navigate back to the landing page.
 */
function goBack() {
  window.electronAPI.navigate('landing');
}

// =============================================================================
// PASSWORD STRENGTH CHECKER
// =============================================================================
/**
 * checkPasswordStrength — Evaluates password and updates the strength indicator.
 * Called every time the user types in the password field.
 */
function checkPasswordStrength(password) {
  const fill = document.getElementById('strength-fill');
  const text = document.getElementById('strength-text');

  // Remove all strength classes
  fill.className = 'password-strength-fill';

  if (!password) {
    text.textContent = 'Must be 8+ characters with letters and numbers';
    return;
  }

  const hasLength  = password.length >= 8;
  const hasLetter  = /[a-zA-Z]/.test(password);
  const hasNumber  = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

  if (!hasLength || !hasLetter || !hasNumber) {
    fill.classList.add('strength-weak');
    text.textContent = 'Weak — needs letters, numbers, and 8+ characters';
  } else if (!hasSpecial) {
    fill.classList.add('strength-medium');
    text.textContent = 'Medium — add special characters to strengthen';
  } else {
    fill.classList.add('strength-strong');
    text.textContent = 'Strong password!';
  }
}

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/** Show an error message for a specific field */
function showError(elementId, message) {
  const el = document.getElementById(elementId);
  el.textContent = message;
  el.classList.add('visible');
  el.setAttribute('role', 'alert');
  // Also add error class to the associated input (if it exists)
  const inputId = elementId.replace('-error', '');
  const input = document.getElementById(inputId);
  if (input) input.classList.add('error');
}

/** Hide an error message */
function hideError(elementId) {
  const el = document.getElementById(elementId);
  el.classList.remove('visible');
  const inputId = elementId.replace('-error', '');
  const input = document.getElementById(inputId);
  if (input) input.classList.remove('error');
}

/**
 * validateForm — Validates all form fields before submission.
 * Returns true if valid, false otherwise.
 */
function validateForm(email, username, password, confirmPassword) {
  let isValid = true;

  // Clear all errors first
  ['email-error', 'username-error', 'password-error', 'confirm-error', 'role-error'].forEach(hideError);

  // Validate email: must be a proper email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    showError('email-error', 'Please enter a valid email address');
    isValid = false;
  }

  // Validate username: 3-30 chars, alphanumeric with underscores/hyphens
  const usernameRegex = /^[a-zA-Z0-9_-]{3,30}$/;
  if (!username || !usernameRegex.test(username)) {
    showError('username-error', 'Username must be 3-30 characters (letters, numbers, _ or -)');
    isValid = false;
  }

  // Validate password: 8+ chars, must have letter AND number
  const hasLength = password.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);

  if (!hasLength || !hasLetter || !hasNumber) {
    showError('password-error', 'Password must be 8+ characters with at least 1 letter and 1 number');
    isValid = false;
  }

  // Validate confirm password: must match
  if (password !== confirmPassword) {
    showError('confirm-error', "Passwords don't match");
    isValid = false;
  }

  // Validate role selection
  if (!selectedRole) {
    showError('role-error', 'Please select an account type');
    isValid = false;
  }

  return isValid;
}

// =============================================================================
// FORM SUBMISSION
// =============================================================================
/**
 * Handle the form submission.
 * event.preventDefault() stops the browser from doing a page reload
 * (which is the default form behavior — we want to handle it ourselves).
 */
document.getElementById('signup-form').addEventListener('submit', async (event) => {
  event.preventDefault();

  const email           = document.getElementById('email').value.trim();
  const username        = document.getElementById('username').value.trim();
  const password        = document.getElementById('password').value;
  const confirmPassword = document.getElementById('confirm-password').value;

  // Run client-side validation first
  if (!validateForm(email, username, password, confirmPassword)) {
    return; // Stop here if validation failed
  }

  // Disable submit button to prevent double-clicks
  const submitBtn = document.getElementById('submit-btn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Creating Account...';

  // Hide any previous general error
  document.getElementById('general-error').classList.add('hidden');

  // Call the signup function via IPC (goes to main.js → queries.js)
  const result = await window.electronAPI.signup({
    email,
    username,
    password,
    role: selectedRole
  });

  if (result.success) {
    // Account created! Navigate to onboarding tutorial
    window.electronAPI.navigate('onboarding');
  } else {
    // Show the server-side error (e.g., "Username already exists")
    const errorEl = document.getElementById('general-error');
    errorEl.textContent = result.error;
    errorEl.classList.remove('hidden');

    // Re-enable the submit button
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create Account';
  }
});

// =============================================================================
// EVENT LISTENERS
// =============================================================================

// Update password strength as user types
document.getElementById('password').addEventListener('input', (e) => {
  checkPasswordStrength(e.target.value);
});

// Clear confirm password error as user types
document.getElementById('confirm-password').addEventListener('input', () => {
  hideError('confirm-error');
});

// Clear email error as user types
document.getElementById('email').addEventListener('input', () => {
  hideError('email-error');
});

// =============================================================================
// BUTTON LISTENERS (attached here instead of inline onclick to satisfy CSP)
// =============================================================================

// Back button — navigate to landing page
document.getElementById('back-btn').addEventListener('click', goBack);

/**
 * Role selector — event delegation pattern:
 * Instead of putting onclick on each role button, we put ONE listener on the
 * parent container. When any button inside is clicked, the event "bubbles up"
 * to the container, and we read the data-role attribute to know which was clicked.
 * This avoids inline handlers AND is more maintainable (adding more roles is easy).
 */
document.getElementById('role-selector').addEventListener('click', (event) => {
  // event.target is the exact element that was clicked.
  // .closest('.role-btn') finds the button even if a child element (like the icon span) was clicked.
  const btn = event.target.closest('.role-btn');
  if (btn) {
    selectRole(btn.dataset.role);
  }
});
