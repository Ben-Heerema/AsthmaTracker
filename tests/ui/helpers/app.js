/**
 * tests/ui/helpers/app.js
 *
 * Shared Playwright fixture that launches the Electron app, returns a Page
 * object pointing at the first BrowserWindow, then closes everything cleanly.
 *
 * Usage in any spec file:
 *
 *   const { test, expect } = require('./helpers/app');
 *
 *   test('something', async ({ window }) => {
 *     await window.click('#some-btn');
 *   });
 *
 * The `window` fixture is a Playwright Page object for the Electron renderer.
 * The `app` fixture is the ElectronApplication if you need main-process access.
 *
 * SEEDED CREDENTIALS (inserted by the app's own signup flow before each suite):
 *   Parent   — username: uitestparent  / email: uitestparent@test.com  / password: UITest123
 *   Provider — username: uitestprovider / email: uitestprovider@test.com / password: UITest123
 *   Child    — username: uitestchild   / password: UITest123  (added under uitestparent)
 *
 * Because the app uses a real SQLite file (asthma_tracker.db) we can't easily
 * use an in-memory DB here, so credentials are created via the UI on first run
 * and remain in the database for subsequent runs.  Any test that creates data
 * should use unique-enough values (e.g. Date.now() suffixes) to stay idempotent.
 */

const { _electron: electron, test: base, expect } = require('@playwright/test');
const path = require('path');

// Path to the Electron binary installed as a devDependency
const ELECTRON_BIN = require('electron');
// Entry point for the app
const APP_MAIN = path.join(__dirname, '../../../main.js');

// ── Seeded test credentials ────────────────────────────────────────────────────
const PARENT = {
  email:    'uitestparent@test.com',
  username: 'uitestparent',
  password: 'UITest123',
};

const PROVIDER = {
  email:    'uitestprovider@test.com',
  username: 'uitestprovider',
  password: 'UITest123',
};

const CHILD = {
  username: 'uitestchild',
  name:     'UI Test Child',
  birthday: '2015-06-01',
  password: 'UITest123',
};

// ── App launch helper ──────────────────────────────────────────────────────────

/**
 * Launch the Electron app and return { electronApp, window }.
 * The window is already loaded at the landing page.
 */
async function launchApp() {
  const electronApp = await electron.launch({
    executablePath: ELECTRON_BIN,
    args: [APP_MAIN],
  });

  // Wait for the first BrowserWindow to be ready
  const window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');

  return { electronApp, window };
}

// ── Navigation helper (goes via IPC so it works without clicking through nav) ──

/**
 * Navigate to a named screen using the app's IPC navigate channel.
 * Equivalent to window.electronAPI.navigate(screenName) from the renderer.
 */
async function navigateTo(window, screenName) {
  await window.evaluate((name) => window.electronAPI.navigate(name), screenName);
  await window.waitForLoadState('domcontentloaded');
  // Small grace period for JS to run after load
  await window.waitForTimeout(300);
}

// ── Login helpers ──────────────────────────────────────────────────────────────

async function loginAsParent(window) {
  await navigateTo(window, 'login');
  await window.fill('#username-email', PARENT.username);
  await window.fill('#password', PARENT.password);
  await window.click('#submit-btn');
  await window.waitForSelector('#nav-grid', { timeout: 8000 });
}

async function loginAsProvider(window) {
  await navigateTo(window, 'login');
  await window.fill('#username-email', PROVIDER.username);
  await window.fill('#password', PROVIDER.password);
  await window.click('#submit-btn');
  await window.waitForSelector('#patient-list', { timeout: 8000 });
}

async function loginAsChild(window) {
  // Children log in through the parent's Family page:
  // 1. Log in as the parent first
  await loginAsParent(window);
  // 2. Navigate to the family page
  await navigateTo(window, 'parent-family');
  // 3. Wait for the child list to load, then click the seeded child
  await window.waitForSelector('#child-list', { timeout: 8000 });
  await window.waitForTimeout(500);
  // Click the "Log In as Child" button for the first child in the list
  await window.locator('#child-list .child-login-btn').first().click();
  // 4. The login modal appears — enter the child password
  await window.waitForSelector('#child-password', { timeout: 5000 });
  await window.fill('#child-password', CHILD.password);
  await window.click('#modal-login-btn');
  // 5. Should land on child dashboard
  await window.waitForSelector('#child-name', { timeout: 8000 });
}

// ── Playwright extended fixture ────────────────────────────────────────────────

/**
 * `test` — drop-in replacement for Playwright's test() that injects:
 *   { electronApp, window }
 *
 * Each test gets a fresh app launch and a clean close.
 */
const test = base.extend({
  electronApp: async ({}, use) => {
    const { electronApp, window: _w } = await launchApp();
    await use(electronApp);
    await electronApp.close();
  },

  window: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await use(window);
  },
});

module.exports = {
  test,
  expect,
  launchApp,
  navigateTo,
  loginAsParent,
  loginAsProvider,
  loginAsChild,
  PARENT,
  PROVIDER,
  CHILD,
};
