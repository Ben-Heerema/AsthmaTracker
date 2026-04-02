/**
 * add-child.js — Add Child Page Logic
 *
 * Styled to match the signup page (auth-card layout, password strength bar).
 * Validates input, calls IPC to store the child in the DB, then navigates back.
 */

/* ─── Password strength bar (same logic as signup.js) ─── */
function updatePasswordStrength(password) {
  const fill = document.getElementById('strength-fill');
  const text = document.getElementById('strength-text');
  if (!fill || !text) return;

  const hasLength  = password.length >= 8;
  const hasLetter  = /[a-zA-Z]/.test(password);
  const hasNumber  = /[0-9]/.test(password);
  const hasSpecial = /[^a-zA-Z0-9]/.test(password);

  const score = [hasLength, hasLetter, hasNumber, hasSpecial].filter(Boolean).length;

  fill.className = 'password-strength-fill';
  if (password.length === 0) {
    fill.style.width = '0%';
    text.textContent = 'Must be 8+ characters with letters and numbers';
  } else if (score <= 2) {
    fill.classList.add('strength-weak');
    text.textContent = 'Weak — add numbers or symbols';
  } else if (score === 3) {
    fill.classList.add('strength-medium');
    text.textContent = 'Medium — almost there!';
  } else {
    fill.classList.add('strength-strong');
    text.textContent = 'Strong password ✅';
  }
}

/* ─── Helper: show / hide inline field errors ─── */
function showFieldError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.add('visible');
  // Highlight the relevant input using the global .error class
  const inputId = id.replace('-error', '');
  const input = document.getElementById(inputId);
  if (input) input.classList.add('error');
}

function hideFieldError(id) {
  const el = document.getElementById(id);
  el.classList.remove('visible');
  const inputId = id.replace('-error', '');
  const input = document.getElementById(inputId);
  if (input) input.classList.remove('error');
}

function clearAllErrors() {
  ['username-error', 'password-error'].forEach(hideFieldError);
  const genErr = document.getElementById('general-error');
  genErr.textContent = '';
  genErr.classList.remove('visible');
}

/* ─── Icon picker ─── */
document.getElementById('icon-picker').addEventListener('click', (e) => {
  const option = e.target.closest('.icon-option');
  if (!option) return;
  // Deselect all
  document.querySelectorAll('.icon-option').forEach(el => {
    el.classList.remove('selected');
    el.setAttribute('aria-checked', 'false');
  });
  // Select clicked
  option.classList.add('selected');
  option.setAttribute('aria-checked', 'true');
  document.getElementById('child-icon').value = option.dataset.icon;
});

/* ─── Notes character counter ─── */
document.getElementById('child-notes').addEventListener('input', (e) => {
  document.getElementById('notes-count').textContent = e.target.value.length;
});

/* ─── Password strength updates as user types ─── */
document.getElementById('child-password').addEventListener('input', (e) => {
  updatePasswordStrength(e.target.value);
});

/* ─── Form submission ─── */
document.getElementById('add-child-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAllErrors();

  const username = document.getElementById('child-username').value.trim();
  const password = document.getElementById('child-password').value;
  const name     = document.getElementById('child-name').value.trim();
  const birthday = document.getElementById('child-birthday').value;
  const notes    = document.getElementById('child-notes').value.trim();
  const icon     = document.getElementById('child-icon').value;

  /* ─── Client-side validation ─── */
  let valid = true;

  if (!username) {
    showFieldError('username-error', 'Username is required');
    valid = false;
  }

  if (!password || password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    showFieldError('password-error', 'Password must be 8+ characters and include letters and numbers');
    valid = false;
  }

  if (!name) {
    showFieldError('username-error', '');   // clear username highlight
    const genErr = document.getElementById('general-error');
    genErr.textContent = '❌ Full name is required';
    genErr.classList.add('visible');
    valid = false;
  }

  if (!birthday) {
    const genErr = document.getElementById('general-error');
    genErr.textContent = '❌ Birthday is required';
    genErr.classList.add('visible');
    valid = false;
  }

  if (!valid) return;

  /* ─── Birthday must be in the past ─── */
  const today = new Date().toISOString().split('T')[0];
  if (birthday > today) {
    const genErr = document.getElementById('general-error');
    genErr.textContent = '❌ Birthday must be a date in the past';
    genErr.classList.add('visible');
    return;
  }

  /* ─── Show loading state ─── */
  const btn = document.getElementById('save-child-btn');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  /* ─── IPC: create the child in the DB ─── */
  try {
    const result = await window.electronAPI.addChild({
      username,
      password,
      name,
      birthday,
      notes: notes || null,
      icon
    });

    if (result.success) {
      showSuccess(
        `Successfully added ${name}!`,
        '← Back to Home',
        () => window.electronAPI.navigate('parent-main')
      );
    } else {
      const genErr = document.getElementById('general-error');
      genErr.textContent = '❌ ' + (result.error || 'Failed to add child. Please try again.');
      genErr.classList.add('visible');
      btn.disabled = false;
      btn.textContent = '💾 Save Child';
      genErr.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } catch (err) {
    console.error('Failed to add child:', err);
    showToast('Something went wrong. Please try again.', 'error');
    btn.disabled = false;
    btn.textContent = '💾 Save Child';
  }
});

/* ─── Page initialisation ─── */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const session = await window.electronAPI.getSession();
    if (!session || !session.userId) {
      window.electronAPI.navigate('landing');
      return;
    }
  } catch (err) {
    console.error('Failed to initialize add-child page:', err);
    showToast('Could not load page. Please try again.', 'error');
  }

  /* Cap birthday to today */
  /* Cap birthday to today (use local date to avoid timezone issues with toISOString) */
  const today = new Date();
  document.getElementById('child-birthday').max =
    today.getFullYear() + '-' +
    String(today.getMonth() + 1).padStart(2, '0') + '-' +
    String(today.getDate()).padStart(2, '0');

  /* Back button */
  document.getElementById('back-btn').addEventListener('click', () => {
    window.electronAPI.navigate('parent-main');
  });
});
