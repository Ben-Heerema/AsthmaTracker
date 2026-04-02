/**
 * @jest-environment jsdom
 */
const { createMockElectronAPI, setupDOM, fireDOMContentLoaded, flushPromises, setupGlobals, cleanupDOM } = require('./__helpers__/renderer-setup');

// ═══════════════════════════════════════════════════════════════════════════════
// LANDING PAGE
// ═══════════════════════════════════════════════════════════════════════════════
describe('Landing Page (landing.js)', () => {
  beforeEach(() => {
    cleanupDOM();
    setupGlobals();
    window.electronAPI = createMockElectronAPI();
    setupDOM(['signup-btn', 'login-btn']);
  });

  afterEach(() => {
    jest.resetModules();
  });

  test('attaches click listeners and redirects parent to parent-main', async () => {
    window.electronAPI.getSession.mockResolvedValue({ userId: 1, childId: null, role: 'parent' });
    require('../src/auth/landing.js');
    fireDOMContentLoaded();
    await flushPromises();

    expect(window.electronAPI.getSession).toHaveBeenCalled();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('parent-main');
  });

  test('redirects provider to provider-main', async () => {
    window.electronAPI.getSession.mockResolvedValue({ userId: 2, childId: null, role: 'provider' });
    require('../src/auth/landing.js');
    fireDOMContentLoaded();
    await flushPromises();

    expect(window.electronAPI.navigate).toHaveBeenCalledWith('provider-main');
  });

  test('redirects child session to child-main', async () => {
    window.electronAPI.getSession.mockResolvedValue({ userId: null, childId: 5, role: null });
    require('../src/auth/landing.js');
    fireDOMContentLoaded();
    await flushPromises();

    expect(window.electronAPI.navigate).toHaveBeenCalledWith('child-main');
  });

  test('stays on landing page when no session', async () => {
    window.electronAPI.getSession.mockResolvedValue(null);
    require('../src/auth/landing.js');
    fireDOMContentLoaded();
    await flushPromises();

    expect(window.electronAPI.navigate).not.toHaveBeenCalled();
  });

  test('stays on landing page when session has no userId or childId', async () => {
    window.electronAPI.getSession.mockResolvedValue({ userId: null, childId: null, role: null });
    require('../src/auth/landing.js');
    fireDOMContentLoaded();
    await flushPromises();

    expect(window.electronAPI.navigate).not.toHaveBeenCalled();
  });

  test('signup button calls navigate("signup")', async () => {
    window.electronAPI.getSession.mockResolvedValue(null);
    require('../src/auth/landing.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('signup-btn').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('signup');
  });

  test('login button calls navigate("login")', async () => {
    window.electronAPI.getSession.mockResolvedValue(null);
    require('../src/auth/landing.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('login-btn').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('login');
  });

  test('handles session check failure gracefully', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    window.electronAPI.getSession.mockRejectedValue(new Error('IPC failure'));
    require('../src/auth/landing.js');
    fireDOMContentLoaded();
    await flushPromises();

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Session check failed'), expect.any(Error));
    expect(window.electronAPI.navigate).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// LOGIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
describe('Login Page (login.js)', () => {
  beforeEach(() => {
    cleanupDOM();
    setupGlobals();
    window.electronAPI = createMockElectronAPI();
    setupDOM([
      'back-btn',
      { tag: 'form', id: 'login-form' },
      { tag: 'input', id: 'username-email', type: 'text', value: '' },
      { tag: 'input', id: 'password', type: 'password', value: '' },
      'login-error',
      { tag: 'button', id: 'submit-btn' },
    ]);
    // login-error needs hidden class by default
    document.getElementById('login-error').classList.add('hidden');
  });

  afterEach(() => {
    jest.resetModules();
  });

  test('back button navigates to landing', async () => {
    require('../src/auth/login.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('back-btn').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('landing');
  });

  test('shows error when fields are empty', async () => {
    require('../src/auth/login.js');
    fireDOMContentLoaded();
    await flushPromises();

    const form = document.getElementById('login-form');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();

    const errorEl = document.getElementById('login-error');
    expect(errorEl.textContent).toBe('Please enter your username/email and password');
    expect(errorEl.classList.contains('hidden')).toBe(false);
  });

  test('shows error when only username is provided', async () => {
    require('../src/auth/login.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('username-email').value = 'testuser';
    // password is empty
    const form = document.getElementById('login-form');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();

    expect(document.getElementById('login-error').textContent).toBe('Please enter your username/email and password');
  });

  test('successful parent login navigates to parent-main', async () => {
    window.electronAPI.login.mockResolvedValue({ success: true, user: { role: 'parent' } });
    require('../src/auth/login.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('username-email').value = 'testuser';
    document.getElementById('password').value = 'password123';

    const form = document.getElementById('login-form');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();

    expect(window.electronAPI.login).toHaveBeenCalledWith({ usernameOrEmail: 'testuser', password: 'password123' });
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('parent-main');
  });

  test('successful provider login navigates to provider-main', async () => {
    window.electronAPI.login.mockResolvedValue({ success: true, user: { role: 'provider' } });
    require('../src/auth/login.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('username-email').value = 'drsmith';
    document.getElementById('password').value = 'password123';

    const form = document.getElementById('login-form');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();

    expect(window.electronAPI.navigate).toHaveBeenCalledWith('provider-main');
  });

  test('disables submit button during login attempt', async () => {
    let resolveLogin;
    window.electronAPI.login.mockImplementation(() => new Promise(r => { resolveLogin = r; }));
    require('../src/auth/login.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('username-email').value = 'testuser';
    document.getElementById('password').value = 'password123';

    const submitBtn = document.getElementById('submit-btn');
    const form = document.getElementById('login-form');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();

    expect(submitBtn.disabled).toBe(true);
    expect(submitBtn.textContent).toBe('Logging in...');

    resolveLogin({ success: true, user: { role: 'parent' } });
    await flushPromises();
  });

  test('failed login shows error and re-enables button', async () => {
    window.electronAPI.login.mockResolvedValue({ success: false, error: 'Bad credentials' });
    require('../src/auth/login.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('username-email').value = 'testuser';
    document.getElementById('password').value = 'wrongpass';

    const form = document.getElementById('login-form');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();

    const errorEl = document.getElementById('login-error');
    expect(errorEl.textContent).toBe('Bad credentials');
    expect(errorEl.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('submit-btn').disabled).toBe(false);
    expect(document.getElementById('submit-btn').textContent).toBe('Log In');
  });

  test('failed login with no error message shows default', async () => {
    window.electronAPI.login.mockResolvedValue({ success: false });
    require('../src/auth/login.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('username-email').value = 'testuser';
    document.getElementById('password').value = 'wrongpass';

    const form = document.getElementById('login-form');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();

    expect(document.getElementById('login-error').textContent).toBe('Invalid username/email or password');
  });

  test('login exception shows generic error', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    window.electronAPI.login.mockRejectedValue(new Error('Network error'));
    require('../src/auth/login.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('username-email').value = 'testuser';
    document.getElementById('password').value = 'password123';

    const form = document.getElementById('login-form');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();

    const errorEl = document.getElementById('login-error');
    expect(errorEl.textContent).toBe('Something went wrong. Please try again.');
    expect(document.getElementById('submit-btn').disabled).toBe(false);
    expect(document.getElementById('submit-btn').textContent).toBe('Log In');
    errorSpy.mockRestore();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SIGNUP PAGE
// ═══════════════════════════════════════════════════════════════════════════════
describe('Signup Page (signup.js)', () => {
  beforeEach(() => {
    cleanupDOM();
    setupGlobals();
    window.electronAPI = createMockElectronAPI();
    setupDOM([
      { tag: 'form', id: 'signup-form' },
      { tag: 'input', id: 'email', type: 'email', value: '' },
      { tag: 'input', id: 'username', type: 'text', value: '' },
      { tag: 'input', id: 'password', type: 'password', value: '' },
      { tag: 'input', id: 'confirm-password', type: 'password', value: '' },
      { tag: 'button', id: 'submit-btn' },
      'back-btn',
      // Error elements
      'email-error',
      'username-error',
      'password-error',
      'confirm-error',
      'role-error',
      'general-error',
      // Password strength
      'strength-fill',
      'strength-text',
      // Role selector
      {
        tag: 'div',
        id: 'role-selector',
        innerHTML: '<button class="role-btn" data-role="parent">Parent</button><button class="role-btn" data-role="provider">Provider</button>'
      },
    ]);
    document.getElementById('general-error').classList.add('hidden');
  });

  afterEach(() => {
    jest.resetModules();
  });

  test('back button navigates to landing', async () => {
    require('../src/auth/signup.js');
    await flushPromises();

    document.getElementById('back-btn').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('landing');
  });

  test('role selection highlights the clicked button', async () => {
    require('../src/auth/signup.js');
    await flushPromises();

    const parentBtn = document.querySelector('[data-role="parent"]');
    parentBtn.click();

    expect(parentBtn.classList.contains('selected')).toBe(true);
    expect(document.querySelector('[data-role="provider"]').classList.contains('selected')).toBe(false);
  });

  test('role selection via event delegation on child element', async () => {
    // Set up a role button with a child span
    const roleSelector = document.getElementById('role-selector');
    roleSelector.innerHTML = '<button class="role-btn" data-role="parent"><span>Parent Icon</span></button><button class="role-btn" data-role="provider">Provider</button>';

    require('../src/auth/signup.js');
    await flushPromises();

    // Click the span inside the button - closest('.role-btn') should find it
    const span = roleSelector.querySelector('span');
    span.click();
    expect(document.querySelector('[data-role="parent"]').classList.contains('selected')).toBe(true);
  });

  test('role selector click on container itself (no .role-btn) does nothing', async () => {
    require('../src/auth/signup.js');
    await flushPromises();

    // Click directly on the container, not on a role button
    const roleSelector = document.getElementById('role-selector');
    // Dispatch a click event where target is the container itself
    const clickEvent = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(clickEvent, 'target', { value: roleSelector });
    roleSelector.dispatchEvent(clickEvent);

    // Nothing should break - no role selected
  });

  test('password strength shows empty state', async () => {
    require('../src/auth/signup.js');
    await flushPromises();

    const passwordInput = document.getElementById('password');
    passwordInput.value = '';
    passwordInput.dispatchEvent(new Event('input'));

    expect(document.getElementById('strength-text').textContent).toBe('Must be 8+ characters with letters and numbers');
  });

  test('password strength - weak (short)', async () => {
    require('../src/auth/signup.js');
    await flushPromises();

    const passwordInput = document.getElementById('password');
    passwordInput.value = 'abc';
    passwordInput.dispatchEvent(new Event('input'));

    expect(document.getElementById('strength-fill').classList.contains('strength-weak')).toBe(true);
    expect(document.getElementById('strength-text').textContent).toContain('Weak');
  });

  test('password strength - medium (no special chars)', async () => {
    require('../src/auth/signup.js');
    await flushPromises();

    const passwordInput = document.getElementById('password');
    passwordInput.value = 'abcdef123';
    passwordInput.dispatchEvent(new Event('input'));

    expect(document.getElementById('strength-fill').classList.contains('strength-medium')).toBe(true);
    expect(document.getElementById('strength-text').textContent).toContain('Medium');
  });

  test('password strength - strong', async () => {
    require('../src/auth/signup.js');
    await flushPromises();

    const passwordInput = document.getElementById('password');
    passwordInput.value = 'abcdef123!';
    passwordInput.dispatchEvent(new Event('input'));

    expect(document.getElementById('strength-fill').classList.contains('strength-strong')).toBe(true);
    expect(document.getElementById('strength-text').textContent).toContain('Strong');
  });

  test('confirm-password input clears confirm error', async () => {
    require('../src/auth/signup.js');
    await flushPromises();

    const confirmError = document.getElementById('confirm-error');
    confirmError.classList.add('visible');
    document.getElementById('confirm-password').dispatchEvent(new Event('input'));

    expect(confirmError.classList.contains('visible')).toBe(false);
  });

  test('email input clears email error', async () => {
    require('../src/auth/signup.js');
    await flushPromises();

    const emailError = document.getElementById('email-error');
    emailError.classList.add('visible');
    document.getElementById('email').dispatchEvent(new Event('input'));

    expect(emailError.classList.contains('visible')).toBe(false);
  });

  test('validation fails with invalid email', async () => {
    require('../src/auth/signup.js');
    await flushPromises();

    document.getElementById('email').value = 'bademail';
    document.getElementById('username').value = 'validuser';
    document.getElementById('password').value = 'pass1234';
    document.getElementById('confirm-password').value = 'pass1234';

    // Select a role first
    document.querySelector('[data-role="parent"]').click();

    const form = document.getElementById('signup-form');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();

    expect(document.getElementById('email-error').classList.contains('visible')).toBe(true);
    expect(window.electronAPI.signup).not.toHaveBeenCalled();
  });

  test('validation fails with empty email', async () => {
    require('../src/auth/signup.js');
    await flushPromises();

    document.getElementById('email').value = '';
    document.getElementById('username').value = 'validuser';
    document.getElementById('password').value = 'pass1234';
    document.getElementById('confirm-password').value = 'pass1234';
    document.querySelector('[data-role="parent"]').click();

    const form = document.getElementById('signup-form');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();

    expect(document.getElementById('email-error').classList.contains('visible')).toBe(true);
  });

  test('validation fails with invalid username (too short)', async () => {
    require('../src/auth/signup.js');
    await flushPromises();

    document.getElementById('email').value = 'test@test.com';
    document.getElementById('username').value = 'ab';
    document.getElementById('password').value = 'pass1234';
    document.getElementById('confirm-password').value = 'pass1234';
    document.querySelector('[data-role="parent"]').click();

    const form = document.getElementById('signup-form');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();

    expect(document.getElementById('username-error').classList.contains('visible')).toBe(true);
  });

  test('validation fails with empty username', async () => {
    require('../src/auth/signup.js');
    await flushPromises();

    document.getElementById('email').value = 'test@test.com';
    document.getElementById('username').value = '';
    document.getElementById('password').value = 'pass1234';
    document.getElementById('confirm-password').value = 'pass1234';
    document.querySelector('[data-role="parent"]').click();

    const form = document.getElementById('signup-form');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();

    expect(document.getElementById('username-error').classList.contains('visible')).toBe(true);
  });

  test('validation fails with weak password (no number)', async () => {
    require('../src/auth/signup.js');
    await flushPromises();

    document.getElementById('email').value = 'test@test.com';
    document.getElementById('username').value = 'validuser';
    document.getElementById('password').value = 'abcdefgh';
    document.getElementById('confirm-password').value = 'abcdefgh';
    document.querySelector('[data-role="parent"]').click();

    const form = document.getElementById('signup-form');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();

    expect(document.getElementById('password-error').classList.contains('visible')).toBe(true);
  });

  test('validation fails with mismatched passwords', async () => {
    require('../src/auth/signup.js');
    await flushPromises();

    document.getElementById('email').value = 'test@test.com';
    document.getElementById('username').value = 'validuser';
    document.getElementById('password').value = 'pass1234';
    document.getElementById('confirm-password').value = 'pass5678';
    document.querySelector('[data-role="parent"]').click();

    const form = document.getElementById('signup-form');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();

    expect(document.getElementById('confirm-error').classList.contains('visible')).toBe(true);
  });

  test('validation fails with no role selected', async () => {
    require('../src/auth/signup.js');
    await flushPromises();

    document.getElementById('email').value = 'test@test.com';
    document.getElementById('username').value = 'validuser';
    document.getElementById('password').value = 'pass1234';
    document.getElementById('confirm-password').value = 'pass1234';
    // No role selected

    const form = document.getElementById('signup-form');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();

    expect(document.getElementById('role-error').classList.contains('visible')).toBe(true);
  });

  test('successful signup navigates to onboarding', async () => {
    window.electronAPI.signup.mockResolvedValue({ success: true });
    require('../src/auth/signup.js');
    await flushPromises();

    document.getElementById('email').value = 'test@test.com';
    document.getElementById('username').value = 'validuser';
    document.getElementById('password').value = 'pass1234';
    document.getElementById('confirm-password').value = 'pass1234';
    document.querySelector('[data-role="parent"]').click();

    const form = document.getElementById('signup-form');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();

    expect(window.electronAPI.signup).toHaveBeenCalledWith({
      email: 'test@test.com',
      username: 'validuser',
      password: 'pass1234',
      role: 'parent'
    });
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('onboarding');
  });

  test('failed signup shows server error and re-enables button', async () => {
    window.electronAPI.signup.mockResolvedValue({ success: false, error: 'Username taken' });
    require('../src/auth/signup.js');
    await flushPromises();

    document.getElementById('email').value = 'test@test.com';
    document.getElementById('username').value = 'validuser';
    document.getElementById('password').value = 'pass1234';
    document.getElementById('confirm-password').value = 'pass1234';
    document.querySelector('[data-role="parent"]').click();

    const form = document.getElementById('signup-form');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();

    expect(document.getElementById('general-error').textContent).toBe('Username taken');
    expect(document.getElementById('general-error').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('submit-btn').disabled).toBe(false);
    expect(document.getElementById('submit-btn').textContent).toBe('Create Account');
  });

  test('showError adds error class to associated input', async () => {
    require('../src/auth/signup.js');
    await flushPromises();

    // Trigger validation that will call showError for email
    document.getElementById('email').value = '';
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    document.getElementById('confirm-password').value = '';

    const form = document.getElementById('signup-form');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();

    // email input should have error class
    expect(document.getElementById('email').classList.contains('error')).toBe(true);
  });

  test('hideError removes error class from associated input', async () => {
    require('../src/auth/signup.js');
    await flushPromises();

    // First trigger error
    document.getElementById('email').value = 'bad';
    const form = document.getElementById('signup-form');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();

    // Now typing in email should clear the error
    document.getElementById('email').dispatchEvent(new Event('input'));
    expect(document.getElementById('email').classList.contains('error')).toBe(false);
  });

  test('showError sets role attribute for accessibility', async () => {
    require('../src/auth/signup.js');
    await flushPromises();

    // Trigger validation with missing role
    document.getElementById('email').value = 'test@test.com';
    document.getElementById('username').value = 'validuser';
    document.getElementById('password').value = 'pass1234';
    document.getElementById('confirm-password').value = 'pass1234';

    const form = document.getElementById('signup-form');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();

    expect(document.getElementById('role-error').getAttribute('role')).toBe('alert');
  });

  test('selecting role clears role error', async () => {
    require('../src/auth/signup.js');
    await flushPromises();

    // Trigger role error
    const roleError = document.getElementById('role-error');
    roleError.classList.add('visible');

    // Select a role
    document.querySelector('[data-role="provider"]').click();
    expect(roleError.classList.contains('visible')).toBe(false);
  });

  test('submit disables button during submission', async () => {
    let resolveSignup;
    window.electronAPI.signup.mockImplementation(() => new Promise(r => { resolveSignup = r; }));
    require('../src/auth/signup.js');
    await flushPromises();

    document.getElementById('email').value = 'test@test.com';
    document.getElementById('username').value = 'validuser';
    document.getElementById('password').value = 'pass1234';
    document.getElementById('confirm-password').value = 'pass1234';
    document.querySelector('[data-role="parent"]').click();

    const form = document.getElementById('signup-form');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();

    expect(document.getElementById('submit-btn').disabled).toBe(true);
    expect(document.getElementById('submit-btn').textContent).toBe('Creating Account...');

    resolveSignup({ success: true });
    await flushPromises();
  });

  test('multiple validation errors at once', async () => {
    require('../src/auth/signup.js');
    await flushPromises();

    // Everything invalid
    document.getElementById('email').value = '';
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    document.getElementById('confirm-password').value = 'x';

    const form = document.getElementById('signup-form');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();

    expect(document.getElementById('email-error').classList.contains('visible')).toBe(true);
    expect(document.getElementById('username-error').classList.contains('visible')).toBe(true);
    expect(document.getElementById('password-error').classList.contains('visible')).toBe(true);
    expect(document.getElementById('confirm-error').classList.contains('visible')).toBe(true);
    expect(document.getElementById('role-error').classList.contains('visible')).toBe(true);
  });

  test('hideError when no associated input element exists', async () => {
    require('../src/auth/signup.js');
    await flushPromises();

    // role-error has no element with id="role" — hideError should not throw
    const roleError = document.getElementById('role-error');
    roleError.classList.add('visible');

    // Select a role to trigger hideError('role-error')
    document.querySelector('[data-role="parent"]').click();

    expect(roleError.classList.contains('visible')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ONBOARDING PAGE
// ═══════════════════════════════════════════════════════════════════════════════
describe('Onboarding Page (onboarding.js)', () => {
  beforeEach(() => {
    cleanupDOM();
    setupGlobals();
    window.electronAPI = createMockElectronAPI();
    setupDOM([
      'slide-container',
      'slide-counter',
      'slide-dots',
      'prev-btn',
      'next-btn',
    ]);
  });

  afterEach(() => {
    jest.resetModules();
  });

  test('initializes with parent slides when role is parent', async () => {
    window.electronAPI.getSession.mockResolvedValue({ userId: 1, role: 'parent' });
    require('../src/auth/onboarding.js');
    fireDOMContentLoaded();
    await flushPromises();

    expect(document.getElementById('slide-counter').textContent).toBe('1 of 8');
    expect(document.getElementById('slide-container').querySelector('.slide-title').textContent).toContain('Parent');
    expect(document.getElementById('prev-btn').style.visibility).toBe('hidden');
  });

  test('initializes with provider slides when role is provider', async () => {
    window.electronAPI.getSession.mockResolvedValue({ userId: 2, role: 'provider' });
    require('../src/auth/onboarding.js');
    fireDOMContentLoaded();
    await flushPromises();

    expect(document.getElementById('slide-counter').textContent).toBe('1 of 5');
    expect(document.getElementById('slide-container').querySelector('.slide-title').textContent).toContain('Provider');
  });

  test('next button advances slides', async () => {
    window.electronAPI.getSession.mockResolvedValue({ userId: 1, role: 'parent' });
    require('../src/auth/onboarding.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('next-btn').click();
    await flushPromises();

    expect(document.getElementById('slide-counter').textContent).toBe('2 of 8');
    expect(document.getElementById('prev-btn').style.visibility).toBe('visible');
  });

  test('prev button goes back', async () => {
    window.electronAPI.getSession.mockResolvedValue({ userId: 1, role: 'parent' });
    require('../src/auth/onboarding.js');
    fireDOMContentLoaded();
    await flushPromises();

    // Go forward then back
    document.getElementById('next-btn').click();
    await flushPromises();
    document.getElementById('prev-btn').click();
    await flushPromises();

    expect(document.getElementById('slide-counter').textContent).toBe('1 of 8');
    expect(document.getElementById('prev-btn').style.visibility).toBe('hidden');
  });

  test('prev button does nothing on first slide', async () => {
    window.electronAPI.getSession.mockResolvedValue({ userId: 1, role: 'parent' });
    require('../src/auth/onboarding.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('prev-btn').click();
    await flushPromises();

    expect(document.getElementById('slide-counter').textContent).toBe('1 of 8');
  });

  test('last slide shows Start Exploring button', async () => {
    window.electronAPI.getSession.mockResolvedValue({ userId: 2, role: 'provider' });
    require('../src/auth/onboarding.js');
    fireDOMContentLoaded();
    await flushPromises();

    // Provider has 5 slides, advance to last
    for (let i = 0; i < 4; i++) {
      document.getElementById('next-btn').click();
      await flushPromises();
    }

    const nextBtn = document.getElementById('next-btn');
    expect(nextBtn.textContent).toContain('Start Exploring');
    expect(nextBtn.classList.contains('btn-success')).toBe(true);
    expect(nextBtn.classList.contains('btn-primary')).toBe(false);
  });

  test('middle slide shows Next button with btn-primary', async () => {
    window.electronAPI.getSession.mockResolvedValue({ userId: 2, role: 'provider' });
    require('../src/auth/onboarding.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('next-btn').click();
    await flushPromises();

    const nextBtn = document.getElementById('next-btn');
    expect(nextBtn.textContent).toContain('Next');
    expect(nextBtn.classList.contains('btn-primary')).toBe(true);
    expect(nextBtn.classList.contains('btn-success')).toBe(false);
  });

  test('going back from last slide restores Next button', async () => {
    window.electronAPI.getSession.mockResolvedValue({ userId: 2, role: 'provider' });
    require('../src/auth/onboarding.js');
    fireDOMContentLoaded();
    await flushPromises();

    // Go to last slide
    for (let i = 0; i < 4; i++) {
      document.getElementById('next-btn').click();
      await flushPromises();
    }

    // Go back
    document.getElementById('prev-btn').click();
    await flushPromises();

    const nextBtn = document.getElementById('next-btn');
    expect(nextBtn.textContent).toContain('Next');
    expect(nextBtn.classList.contains('btn-primary')).toBe(true);
  });

  test('clicking Next on last slide completes onboarding for parent', async () => {
    window.electronAPI.getSession.mockResolvedValue({ userId: 1, role: 'parent' });
    require('../src/auth/onboarding.js');
    fireDOMContentLoaded();
    await flushPromises();

    // Advance to last slide (8 parent slides)
    for (let i = 0; i < 7; i++) {
      document.getElementById('next-btn').click();
      await flushPromises();
    }

    // Click "Start Exploring" on last slide
    document.getElementById('next-btn').click();
    await flushPromises();

    expect(window.electronAPI.completeOnboarding).toHaveBeenCalled();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('parent-main');
  });

  test('clicking Next on last slide completes onboarding for provider', async () => {
    window.electronAPI.getSession.mockResolvedValue({ userId: 2, role: 'provider' });
    require('../src/auth/onboarding.js');
    fireDOMContentLoaded();
    await flushPromises();

    // Advance to last slide (5 provider slides)
    for (let i = 0; i < 4; i++) {
      document.getElementById('next-btn').click();
      await flushPromises();
    }

    // Click "Start Exploring" on last slide
    document.getElementById('next-btn').click();
    await flushPromises();

    expect(window.electronAPI.completeOnboarding).toHaveBeenCalled();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('provider-main');
  });

  test('dot indicators are rendered correctly', async () => {
    window.electronAPI.getSession.mockResolvedValue({ userId: 2, role: 'provider' });
    require('../src/auth/onboarding.js');
    fireDOMContentLoaded();
    await flushPromises();

    const dots = document.querySelectorAll('.slide-dot');
    expect(dots.length).toBe(5);
    expect(dots[0].classList.contains('active')).toBe(true);
    expect(dots[1].classList.contains('active')).toBe(false);
  });

  test('dot indicators update on slide change', async () => {
    window.electronAPI.getSession.mockResolvedValue({ userId: 2, role: 'provider' });
    require('../src/auth/onboarding.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('next-btn').click();
    await flushPromises();

    const dots = document.querySelectorAll('.slide-dot');
    expect(dots[0].classList.contains('active')).toBe(false);
    expect(dots[1].classList.contains('active')).toBe(true);
  });

  test('slide content elements are created properly', async () => {
    window.electronAPI.getSession.mockResolvedValue({ userId: 1, role: 'parent' });
    require('../src/auth/onboarding.js');
    fireDOMContentLoaded();
    await flushPromises();

    const container = document.getElementById('slide-container');
    expect(container.querySelector('.slide-icon')).not.toBeNull();
    expect(container.querySelector('.slide-title')).not.toBeNull();
    expect(container.querySelector('.slide-text')).not.toBeNull();
  });
});
