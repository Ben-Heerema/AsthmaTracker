/**
 * tests/ui/auth.spec.js — Authentication UI Tests
 *
 * Covers:
 *  - Landing page renders both buttons
 *  - Signup: full happy path, duplicate username, duplicate email,
 *    weak password, mismatched confirm, missing role, missing email @
 *  - Login: happy path (username), happy path (email), wrong password,
 *    unknown user, generic error message
 *  - Child login: happy path, wrong password
 *  - Onboarding: renders after signup, can advance slides
 *  - Logout: clears session and returns to landing
 *
 * These tests create real accounts in the SQLite DB.  A suffix based on
 * Date.now() keeps each run's data unique so re-runs don't collide.
 */

const {
  test, expect,
  launchApp, navigateTo,
  loginAsParent, loginAsChild,
  PARENT, CHILD,
} = require('./helpers/app');

// ── Landing page ───────────────────────────────────────────────────────────────

test.describe('Landing page', () => {
  test('shows Sign Up and Log In buttons', async ({ window }) => {
    await expect(window.locator('#signup-btn')).toBeVisible();
    await expect(window.locator('#login-btn')).toBeVisible();
  });

  test('Sign Up button navigates to signup page', async ({ window }) => {
    await window.click('#signup-btn');
    await window.waitForSelector('#signup-form');
    await expect(window.locator('#signup-form')).toBeVisible();
  });

  test('Log In button navigates to login page', async ({ window }) => {
    await window.click('#login-btn');
    await window.waitForSelector('#login-form');
    await expect(window.locator('#login-form')).toBeVisible();
  });
});

// ── Signup page ────────────────────────────────────────────────────────────────

test.describe('Signup page', () => {
  test.beforeEach(async ({ window }) => {
    await navigateTo(window, 'signup');
  });

  test('shows all form fields', async ({ window }) => {
    await expect(window.locator('#email')).toBeVisible();
    await expect(window.locator('#username')).toBeVisible();
    await expect(window.locator('#password')).toBeVisible();
    await expect(window.locator('#confirm-password')).toBeVisible();
    await expect(window.locator('#role-selector')).toBeVisible();
    await expect(window.locator('#submit-btn')).toBeVisible();
  });

  test('back button returns to landing', async ({ window }) => {
    await window.click('#back-btn');
    await expect(window.locator('#signup-btn')).toBeVisible();
  });

  test('password strength indicator responds to typing', async ({ window }) => {
    // Weak password — no number
    await window.fill('#password', 'weakpass');
    await expect(window.locator('#strength-fill')).toHaveClass(/strength-weak/);

    // Medium — 8+ chars with letter and number but no special
    await window.fill('#password', 'Medium99');
    await expect(window.locator('#strength-fill')).toHaveClass(/strength-medium/);

    // Strong — has special character
    await window.fill('#password', 'Strong99!');
    await expect(window.locator('#strength-fill')).toHaveClass(/strength-strong/);
  });

  test('shows email error when @ is missing', async ({ window }) => {
    await window.fill('#email', 'notanemail');
    await window.fill('#username', 'someuser');
    await window.fill('#password', 'Password1');
    await window.fill('#confirm-password', 'Password1');
    await window.click('[data-role="parent"]');
    await window.click('#submit-btn');
    await expect(window.locator('#email-error')).toHaveClass(/visible/);
  });

  test('shows username error when blank', async ({ window }) => {
    await window.fill('#email', 'a@b.com');
    await window.fill('#username', '   ');
    await window.fill('#password', 'Password1');
    await window.fill('#confirm-password', 'Password1');
    await window.click('[data-role="parent"]');
    await window.click('#submit-btn');
    await expect(window.locator('#username-error')).toHaveClass(/visible/);
  });

  test('shows password error for too-short password', async ({ window }) => {
    await window.fill('#email', 'a@b.com');
    await window.fill('#username', 'valid');
    await window.fill('#password', 'short1');
    await window.fill('#confirm-password', 'short1');
    await window.click('[data-role="parent"]');
    await window.click('#submit-btn');
    await expect(window.locator('#password-error')).toHaveClass(/visible/);
  });

  test('shows password error for letters-only password', async ({ window }) => {
    await window.fill('#email', 'a@b.com');
    await window.fill('#username', 'valid');
    await window.fill('#password', 'NoNumbers');
    await window.fill('#confirm-password', 'NoNumbers');
    await window.click('[data-role="parent"]');
    await window.click('#submit-btn');
    await expect(window.locator('#password-error')).toHaveClass(/visible/);
  });

  test('shows confirm error when passwords do not match', async ({ window }) => {
    await window.fill('#email', 'a@b.com');
    await window.fill('#username', 'valid');
    await window.fill('#password', 'Password1');
    await window.fill('#confirm-password', 'Password2');
    await window.click('[data-role="parent"]');
    await window.click('#submit-btn');
    await expect(window.locator('#confirm-error')).toHaveClass(/visible/);
  });

  test('shows role error when no role selected', async ({ window }) => {
    await window.fill('#email', 'a@b.com');
    await window.fill('#username', 'valid');
    await window.fill('#password', 'Password1');
    await window.fill('#confirm-password', 'Password1');
    // deliberately do NOT click a role button
    await window.click('#submit-btn');
    await expect(window.locator('#role-error')).toHaveClass(/visible/);
  });

  test('role button highlights on click', async ({ window }) => {
    await window.click('[data-role="parent"]');
    await expect(window.locator('[data-role="parent"]')).toHaveClass(/selected/);
    // Switch to provider
    await window.click('[data-role="provider"]');
    await expect(window.locator('[data-role="provider"]')).toHaveClass(/selected/);
    await expect(window.locator('[data-role="parent"]')).not.toHaveClass(/selected/);
  });

  test('successful signup navigates to onboarding', async ({ window }) => {
    const ts = Date.now();
    await window.fill('#email', `newuser${ts}@test.com`);
    await window.fill('#username', `newuser${ts}`);
    await window.fill('#password', 'UITest123');
    await window.fill('#confirm-password', 'UITest123');
    await window.click('[data-role="parent"]');
    await window.click('#submit-btn');
    // Should land on the onboarding page
    await window.waitForSelector('#slide-container', { timeout: 8000 });
    await expect(window.locator('#slide-container')).toBeVisible();
  });

  test('server-side duplicate username shows general error', async ({ window }) => {
    // Use the known seeded parent account username
    await window.fill('#email', 'different@test.com');
    await window.fill('#username', PARENT.username);
    await window.fill('#password', 'UITest123');
    await window.fill('#confirm-password', 'UITest123');
    await window.click('[data-role="parent"]');
    await window.click('#submit-btn');
    await window.waitForSelector('#general-error:not(.hidden)', { timeout: 5000 });
    await expect(window.locator('#general-error')).toContainText('already exists');
  });

  test('server-side duplicate email shows general error', async ({ window }) => {
    // Use a unique username each run to avoid collisions, but reuse the known parent email
    await window.fill('#email', PARENT.email);
    await window.fill('#username', `uniqueuser${Date.now()}`);
    await window.fill('#password', 'UITest123');
    await window.fill('#confirm-password', 'UITest123');
    await window.click('[data-role="parent"]');
    await window.click('#submit-btn');
    await window.waitForSelector('#general-error:not(.hidden)', { timeout: 5000 });
    await expect(window.locator('#general-error')).toContainText('already registered');
  });
});

// ── Login page ─────────────────────────────────────────────────────────────────

test.describe('Login page', () => {
  test.beforeEach(async ({ window }) => {
    await navigateTo(window, 'login');
  });

  test('shows username/email input, password input, and submit', async ({ window }) => {
    await expect(window.locator('#username-email')).toBeVisible();
    await expect(window.locator('#password')).toBeVisible();
    await expect(window.locator('#submit-btn')).toBeVisible();
  });

  test('back button returns to landing', async ({ window }) => {
    await window.click('#back-btn');
    await expect(window.locator('#signup-btn')).toBeVisible();
  });

  test('login with correct username succeeds', async ({ window }) => {
    await window.fill('#username-email', PARENT.username);
    await window.fill('#password', PARENT.password);
    await window.click('#submit-btn');
    // Parent dashboard has #nav-grid
    await window.waitForSelector('#nav-grid', { timeout: 8000 });
    await expect(window.locator('#nav-grid')).toBeVisible();
  });

  test('login with correct email succeeds', async ({ window }) => {
    await window.fill('#username-email', PARENT.email);
    await window.fill('#password', PARENT.password);
    await window.click('#submit-btn');
    await window.waitForSelector('#nav-grid', { timeout: 8000 });
    await expect(window.locator('#nav-grid')).toBeVisible();
  });

  test('login with UPPERCASE username succeeds (case-insensitive)', async ({ window }) => {
    await window.fill('#username-email', PARENT.username.toUpperCase());
    await window.fill('#password', PARENT.password);
    await window.click('#submit-btn');
    await window.waitForSelector('#nav-grid', { timeout: 8000 });
    await expect(window.locator('#nav-grid')).toBeVisible();
  });

  test('wrong password shows error', async ({ window }) => {
    await window.fill('#username-email', PARENT.username);
    await window.fill('#password', 'WrongPassword1');
    await window.click('#submit-btn');
    await window.waitForSelector('#login-error:not(.hidden)', { timeout: 5000 });
    await expect(window.locator('#login-error')).toBeVisible();
  });

  test('unknown username shows error', async ({ window }) => {
    await window.fill('#username-email', 'doesnotexist');
    await window.fill('#password', 'UITest123');
    await window.click('#submit-btn');
    await window.waitForSelector('#login-error:not(.hidden)', { timeout: 5000 });
    await expect(window.locator('#login-error')).toBeVisible();
  });

  test('error message is the same for bad user vs bad password (no info leak)', async ({ window }) => {
    // Bad username
    await window.fill('#username-email', 'nobody');
    await window.fill('#password', 'UITest123');
    await window.click('#submit-btn');
    await window.waitForSelector('#login-error:not(.hidden)', { timeout: 5000 });
    const msg1 = await window.textContent('#login-error');

    // Correct username, wrong password
    await window.fill('#username-email', PARENT.username);
    await window.fill('#password', 'WrongPass1');
    await window.click('#submit-btn');
    await window.waitForSelector('#login-error:not(.hidden)', { timeout: 5000 });
    const msg2 = await window.textContent('#login-error');

    expect(msg1.trim()).toBe(msg2.trim());
  });
});

// ── Child login ────────────────────────────────────────────────────────────────
// Children log in through the parent's Family page, not the main login screen.

test.describe('Child login', () => {
  // Navigate to family page as parent before each test
  test.beforeEach(async ({ window }) => {
    await loginAsParent(window);
    await navigateTo(window, 'parent-family');
    await window.waitForSelector('#child-list', { timeout: 8000 });
    await window.waitForTimeout(500);
  });

  test('family page shows child list', async ({ window }) => {
    await expect(window.locator('#child-list')).toBeVisible();
  });

  test('clicking a child opens the login modal', async ({ window }) => {
    const items = await window.locator('#child-list .child-login-btn').count();
    if (items === 0) { test.skip(); return; }
    await window.locator('#child-list .child-login-btn').first().click();
    await window.waitForSelector('#child-password', { timeout: 5000 });
    await expect(window.locator('#child-password')).toBeVisible();
    await expect(window.locator('#modal-login-btn')).toBeVisible();
  });

  test('correct child password navigates to child dashboard', async ({ window }) => {
    const items = await window.locator('#child-list .child-login-btn').count();
    if (items === 0) { test.skip(); return; }
    await window.locator('#child-list .child-login-btn').first().click();
    await window.waitForSelector('#child-password', { timeout: 5000 });
    await window.fill('#child-password', CHILD.password);
    await window.click('#modal-login-btn');
    await window.waitForSelector('#child-name', { timeout: 8000 });
    await expect(window.locator('#child-name')).toBeVisible();
  });

  test('wrong child password shows modal error', async ({ window }) => {
    const items = await window.locator('#child-list .child-login-btn').count();
    if (items === 0) { test.skip(); return; }
    await window.locator('#child-list .child-login-btn').first().click();
    await window.waitForSelector('#child-password', { timeout: 5000 });
    await window.fill('#child-password', 'WrongPassword1');
    await window.click('#modal-login-btn');
    await window.waitForSelector('#modal-error:not(.hidden)', { timeout: 5000 });
    await expect(window.locator('#modal-error')).toBeVisible();
  });

  test('cancel button closes the modal', async ({ window }) => {
    const items = await window.locator('#child-list .child-login-btn').count();
    if (items === 0) { test.skip(); return; }
    await window.locator('#child-list .child-login-btn').first().click();
    await window.waitForSelector('#child-password', { timeout: 5000 });
    await window.click('#modal-cancel-btn');
    await window.waitForTimeout(300);
    // Modal should be gone / hidden
    const modalVisible = await window.locator('#login-modal:not(.hidden)').count();
    expect(modalVisible).toBe(0);
  });
});

// ── Onboarding ─────────────────────────────────────────────────────────────────

test.describe('Onboarding', () => {
  test.beforeEach(async ({ window }) => {
    // Log in as the seeded parent then navigate to onboarding directly
    // (avoids creating a new account every run)
    await loginAsParent(window);
    await navigateTo(window, 'onboarding');
  });

  test('slide container is visible', async ({ window }) => {
    await expect(window.locator('#slide-container')).toBeVisible();
  });

  test('next button advances the slide counter', async ({ window }) => {
    const before = await window.textContent('#slide-counter');
    await window.click('#next-btn');
    await window.waitForTimeout(200);
    const after = await window.textContent('#slide-counter');
    // Counter text like "1 / 4" → "2 / 4"
    expect(before).not.toBe(after);
  });

  test('previous button is hidden on first slide', async ({ window }) => {
    // The prev button uses visibility:hidden (not disabled) on the first slide
    const visibility = await window.locator('#prev-btn').evaluate(
      el => window.getComputedStyle(el).visibility
    );
    expect(visibility).toBe('hidden');
  });
});

// ── Logout ─────────────────────────────────────────────────────────────────────

test.describe('Logout', () => {
  test('logout from settings returns to landing page', async ({ window }) => {
    await loginAsParent(window);
    await navigateTo(window, 'settings');
    await window.waitForSelector('#logout-btn');
    await window.click('#logout-btn');
    // A custom confirm dialog appears — click the confirm "Log Out" button
    await window.waitForSelector('.confirm-btn-ok', { timeout: 5000 });
    await window.click('.confirm-btn-ok');
    // Should return to landing
    await window.waitForSelector('#signup-btn', { timeout: 8000 });
    await expect(window.locator('#signup-btn')).toBeVisible();
  });
});
