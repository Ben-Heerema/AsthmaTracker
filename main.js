/**
 * main.js — Electron Main Process
 *
 * This is the ENTRY POINT of the Electron application. Think of it as the
 * "backend" or "server" of the app. It has full access to Node.js, the
 * filesystem, the SQLite database, and OS-level features like notifications.
 *
 * KEY CONCEPT — Two Processes:
 * Electron apps run in two separate JavaScript environments:
 *
 *   1. MAIN PROCESS (this file):
 *      - Runs Node.js
 *      - Has access to: filesystem, database, OS notifications, etc.
 *      - Creates and manages the application window(s)
 *      - Only ONE instance runs per app launch
 *
 *   2. RENDERER PROCESS (every HTML file):
 *      - Runs inside a sandboxed Chrome browser tab
 *      - Has access to: DOM, CSS, browser APIs
 *      - Cannot directly access Node.js or the database
 *      - Communicates with main.js through IPC (Inter-Process Communication)
 *
 * HOW RENDERER TALKS TO MAIN:
 *   Renderer calls:  window.electronAPI.someFunction(data)
 *   This is defined in preload.js, which sends a message to main.js
 *   Main.js receives it via ipcMain.handle() and sends back a response
 *
 * NAVIGATION:
 *   Pages don't navigate using window.location.href.
 *   They call window.electronAPI.navigate('screen-name').
 *   Main.js receives this and loads the correct HTML file.
 */

// --- Electron Core Imports ---
const { app, BrowserWindow, ipcMain, Notification, dialog, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');

// --- Database Layer ---
// db.js exports an async initialize() that returns a DatabaseWrapper
// queries.js exports a factory function that takes a db instance
const dbModule = require('./src/database/db');
const buildQueries = require('./src/database/queries');
let queries;

// --- Password Hashing ---
// bcryptjs lets us securely hash passwords before storing them
// Never store plain-text passwords!
const bcrypt = require('bcryptjs');

// --- PDF Generation ---
const PDFDocument = require('pdfkit');

// =============================================================================
// CONSTANTS — Configurable values extracted from magic numbers
// =============================================================================
const BCRYPT_ROUNDS = 10;
const ACCESS_CODE_EXPIRY_HOURS = 48;
const NOTIFICATION_EXPIRY_DAYS = 14;
const SCHEDULER_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const LOW_DOSE_THRESHOLD = 20;
const ADHERENCE_LOOKBACK_DAYS = 30;
const NOTIFICATION_DEDUP_MINUTES = 60;
const PEF_MAX_VALUE = 900;

// =============================================================================
// LOGIN RATE LIMITING
// =============================================================================
const loginAttempts = new Map(); // key: username/email, value: { count, lastAttempt }
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

// =============================================================================
// SESSION STATE
// =============================================================================
/**
 * currentSession stores who is currently logged in.
 * This persists across page navigation (unlike renderer variables, which reset
 * every time a new HTML file loads).
 *
 * Fields:
 *   userId    - The ID from the Users table (or null if child login)
 *   childId   - The ID from the Children table (null unless role = 'child')
 *   username  - Display name
 *   role      - 'parent' | 'provider' | 'child'
 */
let currentSession = {
  userId: null,
  childId: null,
  username: null,
  role: null
};

/**
 * saveSessionToDB — Persist the current session to the database so the user
 * stays logged in across app restarts.
 */
function saveSessionToDB() {
  try {
    queries.setSetting('session', JSON.stringify(currentSession));
  } catch (err) {
    console.error('[session] Failed to save session:', err);
  }
}

/**
 * clearSessionFromDB — Remove the persisted session (on logout).
 */
function clearSessionFromDB() {
  try {
    queries.deleteSetting('session');
  } catch (err) {
    console.error('[session] Failed to clear session:', err);
  }
}

/**
 * restoreSession — On startup, check the database for a saved session.
 * Validates that the user/child still exists before restoring.
 * Returns true if a valid session was restored, false otherwise.
 */
function restoreSession() {
  try {
    const raw = queries.getSetting('session');
    if (!raw) return false;

    const saved = JSON.parse(raw);
    if (!saved || (!saved.userId && !saved.childId)) return false;

    // Validate the user/child still exists in the database
    if (saved.role === 'child' && saved.childId) {
      const child = queries.getChildById(saved.childId);
      if (!child) {
        queries.deleteSetting('session');
        return false;
      }
      currentSession = saved;
      return true;
    }

    if (saved.userId) {
      const user = queries.getUserById(saved.userId);
      if (!user) {
        queries.deleteSetting('session');
        return false;
      }
      currentSession = saved;
      return true;
    }

    return false;
  } catch (err) {
    console.error('[session] Failed to restore session:', err);
    return false;
  }
}

// =============================================================================
// WINDOW MANAGEMENT
// =============================================================================
/**
 * mainWindow is the single application window.
 * We use ONE window and swap the HTML content on navigation.
 * This is simpler than managing multiple windows.
 */
let mainWindow = null;

/**
 * createWindow() — Creates the main application window.
 * Called once when the app is ready.
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    minWidth: 800,
    minHeight: 600,
    show: false,  // don't show until maximized
    webPreferences: {
      // preload.js runs before the renderer and sets up window.electronAPI
      preload: path.join(__dirname, 'preload.js'),
      // nodeIntegration: false means renderer can't use require() directly
      // This is a security best practice - all Node.js access goes through preload
      nodeIntegration: false,
      // contextIsolation: true means renderer's window object is separate from Node's
      contextIsolation: true
    },
    // Remove the default menu bar (File, Edit, View...)
    autoHideMenuBar: true,
    // App icon (shown in taskbar and title bar)
    icon: path.join(__dirname, 'assets/icons/app-icon.png')
  });

  // Try to restore a saved session; if valid, go straight to the dashboard
  const restored = restoreSession();
  if (restored && currentSession.role === 'parent') {
    mainWindow.loadFile('src/parent/main.html');
  } else if (restored && currentSession.role === 'provider') {
    mainWindow.loadFile('src/provider/main.html');
  } else if (restored && currentSession.role === 'child') {
    mainWindow.loadFile('src/child/main.html');
  } else {
    mainWindow.loadFile('src/auth/landing.html');
  }

  // Start maximized, then show the window
  mainWindow.maximize();
  mainWindow.show();

  // In development mode (npm run dev), open Chrome DevTools automatically
  // DevTools let you inspect HTML, debug JavaScript, and see console.log output
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  // Clean up the reference when window is closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// =============================================================================
// ROUTE MAP — Maps screen names to HTML file paths
// =============================================================================
/**
 * When a renderer calls window.electronAPI.navigate('screen-name'),
 * we look up the file path here and load it.
 *
 * Format: 'screen-name': 'relative/path/to/file.html'
 */
const routes = {
  // Auth screens
  'landing':              'src/auth/landing.html',
  'signup':               'src/auth/signup.html',
  'login':                'src/auth/login.html',
  'onboarding':           'src/auth/onboarding.html',

  // Parent screens
  'parent-main':          'src/parent/main.html',
  'parent-daily-checkin': 'src/parent/daily-checkin.html',
  'parent-child-overview':      'src/parent/child-overview.html',
  'parent-controller-schedule': 'src/parent/controller-schedule.html',
  'parent-adherence-report':    'src/parent/adherence-report.html',
  'parent-provider-sharing':    'src/parent/provider-sharing.html',
  'parent-set-pb':              'src/parent/set-personal-best.html',
  'parent-enter-pef':     'src/parent/enter-pef.html',
  'parent-add-child':     'src/parent/add-child.html',
  'parent-add-badges':    'src/parent/add-badges.html',
  'parent-medication-inventory': 'src/parent/medication-inventory.html',
  'parent-new-medication':'src/parent/new-medication.html',
  'parent-pdf':           'src/parent/pdf-report.html',
  'parent-todays-zone':   'src/parent/todays-zone.html',
  'parent-medication-logs':'src/parent/medication-logs.html',
  'parent-incident-logs': 'src/parent/incident-logs.html',
  'parent-family':        'src/parent/family.html',
  'parent-notifications': 'src/parent/notifications.html',

  // Provider screens
  'provider-main':        'src/provider/main.html',
  'provider-patient-view':'src/provider/patient-view.html',

  // Child screens
  'child-main':           'src/child/main.html',
  'child-inhaler':        'src/child/inhaler-technique.html',
  'child-take-medication':'src/child/take-medication.html',
  'child-badges':         'src/child/badges.html',
  'child-check-zone':     'src/child/check-zone.html',

  // Shared screens
  'settings':             'src/shared/settings.html',
  'emergency':            'src/shared/emergency.html'
};

// =============================================================================
// APP LIFECYCLE
// =============================================================================

// 'ready' fires when Electron has finished loading
// We must wait for this before creating any windows
app.whenReady().then(async () => {
  // Initialize the database (sql.js WASM) before anything else
  const db = await dbModule.initialize();
  queries = buildQueries(db);

  // Allow Google Fonts to load for the Nunito typeface.
  // The meta CSP tags say 'self', but Electron's session-level header
  // takes precedence and overrides them for font/style resources.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
          "script-src 'self'; " +
          "style-src 'self' https://fonts.googleapis.com; " +
          "font-src 'self' https://fonts.gstatic.com; " +
          "img-src 'self' data:;"
        ]
      }
    });
  });

  createWindow();
  startNotificationScheduler();

  // On macOS, re-create window if dock icon is clicked and no windows are open
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Flush the in-memory database to disk before the app exits
app.on('before-quit', () => {
  dbModule.saveSync();
});

// Quit when all windows are closed (except on macOS where apps stay open)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// =============================================================================
// IPC HANDLERS — Navigation & Session
// =============================================================================

/**
 * Navigate to a named screen.
 * Renderer calls: window.electronAPI.navigate('screen-name')
 * Optional data can be passed to preload state (e.g., which medication to edit).
 */
ipcMain.on('navigate', (event, screenName, data) => {
  const filePath = routes[screenName];
  if (!filePath) {
    console.error(`[main.js] navigate: Unknown screen "${screenName}"`);
    return;
  }
  // Store any passed data so the next page can retrieve it
  if (data !== undefined) {
    navigationData = data;
  }
  mainWindow.loadFile(filePath);
});

/**
 * navigationData holds temporary data passed between screens.
 * Example: clicking "Edit Medication" sets navigationData = { medicationId: 5 }
 * The new-medication page reads this on load to know which record to edit.
 */
let navigationData = null;

/**
 * Get the data that was passed during navigation.
 * Renderer calls: window.electronAPI.getNavigationData()
 * Returns the data and then clears it (so it's only read once).
 */
ipcMain.handle('navigate:get-data', () => {
  const data = navigationData;
  navigationData = null; // clear after reading
  return data;
});

/**
 * Get the current session (who is logged in).
 * Renderer calls: window.electronAPI.getSession()
 * Every page should call this on load to know the current user.
 */
ipcMain.handle('auth:get-session', () => {
  return currentSession;
});

/**
 * Log out: clear session and go to landing page.
 * Renderer calls: window.electronAPI.logout()
 */
ipcMain.handle('auth:logout', () => {
  currentSession = { userId: null, childId: null, username: null, role: null };
  clearSessionFromDB();
  mainWindow.loadFile(routes['landing']);
  return { success: true };
});

// =============================================================================
// IPC HANDLERS — Authentication
// =============================================================================

/**
 * checkRateLimit — Returns an error message if login attempts exceeded, or null if OK.
 */
function checkRateLimit(identifier) {
  const key = identifier.toLowerCase();
  const record = loginAttempts.get(key);
  if (!record) return null;

  // Reset if lockout period has passed
  if (Date.now() - record.lastAttempt > LOGIN_LOCKOUT_MS) {
    loginAttempts.delete(key);
    return null;
  }

  if (record.count >= MAX_LOGIN_ATTEMPTS) {
    const remainingMs = LOGIN_LOCKOUT_MS - (Date.now() - record.lastAttempt);
    const remainingMin = Math.ceil(remainingMs / 60000);
    return `Too many login attempts. Please try again in ${remainingMin} minute(s).`;
  }
  return null;
}

function recordFailedLogin(identifier) {
  const key = identifier.toLowerCase();
  const record = loginAttempts.get(key) || { count: 0, lastAttempt: 0 };
  record.count++;
  record.lastAttempt = Date.now();
  loginAttempts.set(key, record);
}

function clearLoginAttempts(identifier) {
  loginAttempts.delete(identifier.toLowerCase());
}

/**
 * Sign up a new Parent or Provider account.
 * Renderer calls: window.electronAPI.signup({ email, username, password, role })
 * Returns: { success: true, user } or { success: false, error: 'message' }
 */
ipcMain.handle('auth:signup', async (event, data) => {
  try {
    // --- Input validation ---
    if (!data || typeof data !== 'object') {
      return { success: false, error: 'Invalid request' };
    }
    if (!data.username || typeof data.username !== 'string' || data.username.trim().length < 3 || data.username.trim().length > 30) {
      return { success: false, error: 'Username must be 3-30 characters' };
    }
    if (!data.email || typeof data.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      return { success: false, error: 'Please enter a valid email address' };
    }
    if (!data.password || typeof data.password !== 'string' || data.password.length < 8) {
      return { success: false, error: 'Password must be at least 8 characters' };
    }
    if (!data.role || !['parent', 'provider'].includes(data.role)) {
      return { success: false, error: 'Invalid role' };
    }

    // Check if username already exists in the database
    const existingUsername = queries.getUserByUsername(data.username);
    if (existingUsername) {
      return { success: false, error: 'Username already exists' };
    }

    // Check if email already exists
    const existingEmail = queries.getUserByEmail(data.email);
    if (existingEmail) {
      return { success: false, error: 'Email already registered' };
    }

    // Hash the password before storing it
    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

    // Insert the new user into the database.
    // Store username and email as lowercase so lookups are always consistent.
    const user = queries.createUser({
      email: data.email.toLowerCase(),
      username: data.username.toLowerCase(),
      passwordHash: passwordHash,
      role: data.role
    });

    // Set the session and persist it
    currentSession = {
      userId: user.user_id,
      childId: null,
      username: user.username,
      role: user.role
    };
    saveSessionToDB();

    return { success: true, user };
  } catch (err) {
    console.error('[auth:signup]', err);
    return { success: false, error: 'An error occurred. Please try again.' };
  }
});

/**
 * Log in an existing Parent or Provider.
 * Renderer calls: window.electronAPI.login({ usernameOrEmail, password })
 * Returns: { success: true, user } or { success: false, error: 'message' }
 */
ipcMain.handle('auth:login', async (event, data) => {
  try {
    // --- Input validation ---
    if (!data || typeof data !== 'object') {
      return { success: false, error: 'Invalid request' };
    }
    if (!data.usernameOrEmail || typeof data.usernameOrEmail !== 'string' || data.usernameOrEmail.trim().length === 0) {
      return { success: false, error: 'Username or email is required' };
    }
    if (!data.password || typeof data.password !== 'string') {
      return { success: false, error: 'Password is required' };
    }

    // --- Rate limiting ---
    const rateLimitMsg = checkRateLimit(data.usernameOrEmail);
    if (rateLimitMsg) {
      return { success: false, error: rateLimitMsg };
    }

    // Try to find user by username first, then by email
    let user = queries.getUserByUsername(data.usernameOrEmail)
             || queries.getUserByEmail(data.usernameOrEmail);

    if (!user) {
      recordFailedLogin(data.usernameOrEmail);
      return { success: false, error: 'Invalid username/email or password' };
    }

    // Compare submitted password against the stored hash
    const isValid = await bcrypt.compare(data.password, user.password_hash);
    if (!isValid) {
      recordFailedLogin(data.usernameOrEmail);
      return { success: false, error: 'Invalid username/email or password' };
    }

    // Clear rate limit on successful login
    clearLoginAttempts(data.usernameOrEmail);

    // Set the session and persist it
    currentSession = {
      userId: user.user_id,
      childId: null,
      username: user.username,
      role: user.role
    };
    saveSessionToDB();

    return { success: true, user };
  } catch (err) {
    console.error('[auth:login]', err);
    return { success: false, error: 'An error occurred. Please try again.' };
  }
});

/**
 * Log in as a Child (children are in the Children table, not Users).
 * Renderer calls: window.electronAPI.childLogin({ usernameOrName, password })
 * Returns: { success: true, child } or { success: false, error: 'message' }
 */
ipcMain.handle('auth:child-login', async (event, data) => {
  try {
    if (!data || !data.username || !data.password) {
      return { success: false, error: 'Username and password are required' };
    }

    // --- Rate limiting ---
    const rateLimitMsg = checkRateLimit(data.username);
    if (rateLimitMsg) {
      return { success: false, error: rateLimitMsg };
    }

    const child = queries.getChildByUsername(data.username);
    if (!child) {
      recordFailedLogin(data.username);
      return { success: false, error: 'Invalid username or password' };
    }

    const isValid = await bcrypt.compare(data.password, child.password_hash);
    if (!isValid) {
      recordFailedLogin(data.username);
      return { success: false, error: 'Invalid username or password' };
    }

    clearLoginAttempts(data.username);

    // Set session for child login and persist it
    currentSession = {
      userId: null,       // children don't have a Users record
      childId: child.child_id,
      username: child.name,
      role: 'child'
    };
    saveSessionToDB();

    return { success: true, child };
  } catch (err) {
    console.error('[auth:child-login]', err);
    return { success: false, error: 'An error occurred. Please try again.' };
  }
});

/**
 * Mark onboarding as complete for current user.
 * Renderer calls: window.electronAPI.completeOnboarding()
 */
ipcMain.handle('auth:complete-onboarding', () => {
  try {
    if (currentSession.userId) {
      queries.setOnboardingComplete(currentSession.userId);
    }
    return { success: true };
  } catch (err) {
    console.error('[auth:complete-onboarding]', err);
    return { success: false, error: 'Failed to complete onboarding' };
  }
});

// =============================================================================
// AUTHORIZATION HELPERS
// =============================================================================

/**
 * isValidId — Returns true if the value is a positive integer (or numeric string).
 */
function isValidId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0;
}

/**
 * isValidDateString — Returns true if the string is a valid YYYY-MM-DD date.
 */
function isValidDateString(str) {
  if (typeof str !== 'string') return false;
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return d.getFullYear() === Number(match[1])
    && d.getMonth() === Number(match[2]) - 1
    && d.getDate() === Number(match[3]);
}

/**
 * requireAuth — Returns an error object if no one is logged in.
 */
function requireAuth() {
  if (!currentSession.userId && !currentSession.childId) {
    return { success: false, error: 'Not authenticated' };
  }
  return null;
}

/**
 * isParentOfChild — Checks if the current user is the parent of the given child.
 */
function isParentOfChild(childId) {
  if (currentSession.role !== 'parent') return false;
  const child = queries.getChildById(childId);
  return child && child.parent_id === currentSession.userId;
}

/**
 * canAccessChild — Checks if the current session can access a child's data.
 * Parents can access their own children; children can access their own data;
 * providers can access children they have been granted access to.
 */
function canAccessChild(childId) {
  if (currentSession.role === 'parent') {
    return isParentOfChild(childId);
  }
  if (currentSession.role === 'child') {
    return currentSession.childId === childId;
  }
  if (currentSession.role === 'provider') {
    const access = queries.getProviderAccess(currentSession.userId, childId);
    return !!access;
  }
  return false;
}

// =============================================================================
// IPC HANDLERS — Children
// =============================================================================

/**
 * Get all children belonging to the current parent.
 * Renderer calls: window.electronAPI.getChildren()
 */
ipcMain.handle('children:get-all', () => {
  try {
    return queries.getChildrenByParent(currentSession.userId);
  } catch (err) {
    console.error('[children:get-all]', err);
    return [];
  }
});

/**
 * Get a single child by ID.
 * Renderer calls: window.electronAPI.getChild(childId)
 */
ipcMain.handle('children:get-one', (event, childId) => {
  try {
    if (!isValidId(childId) || !canAccessChild(childId)) return null;
    return queries.getChildById(childId);
  } catch (err) {
    console.error('[children:get-one]', err);
    return null;
  }
});

/**
 * Add a new child under the current parent.
 * Renderer calls: window.electronAPI.addChild({ username, password, name, birthday, notes })
 */
ipcMain.handle('children:add', async (event, data) => {
  try {
    const authErr = requireAuth();
    if (authErr) return authErr;
    if (currentSession.role !== 'parent') {
      return { success: false, error: 'Only parents can add children' };
    }

    // --- Input validation ---
    if (!data || typeof data !== 'object') return { success: false, error: 'Invalid request' };
    if (!data.username || typeof data.username !== 'string' || data.username.trim().length < 3) {
      return { success: false, error: 'Username must be at least 3 characters' };
    }
    if (!data.password || typeof data.password !== 'string' || data.password.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters' };
    }
    if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
      return { success: false, error: 'Name is required' };
    }
    if (!data.birthday || !isValidDateString(data.birthday)) {
      return { success: false, error: 'Birthday must be a valid date (YYYY-MM-DD)' };
    }

    const existing = queries.getChildByUsername(data.username);
    if (existing) {
      return { success: false, error: 'Username already exists' };
    }

    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

    // Validate icon value
    const VALID_ICONS = ['girl_older', 'girl_younger', 'boy_older', 'boy_younger', 'baby'];
    const icon = VALID_ICONS.includes(data.icon) ? data.icon : 'boy_older';

    // Create child and controller schedule atomically (transaction)
    const child = queries.createChildWithSchedule({
      parentId: currentSession.userId,
      username: data.username.toLowerCase(),
      passwordHash,
      name: data.name.trim(),
      birthday: data.birthday,
      notes: data.notes || null,
      icon
    });

    return { success: true, child };
  } catch (err) {
    console.error('[children:add]', err);
    return { success: false, error: 'Failed to add child' };
  }
});

/**
 * Update a child's personal best PEF value.
 * Renderer calls: window.electronAPI.setPersonalBest({ childId, personalBestPef })
 */
ipcMain.handle('children:set-personal-best', (event, data) => {
  try {
    if (!data || !data.childId) return { success: false, error: 'Child ID is required' };
    if (!isParentOfChild(data.childId)) return { success: false, error: 'Unauthorized' };
    const pef = Number(data.personalBestPef);
    if (isNaN(pef) || pef <= 0 || pef > PEF_MAX_VALUE) {
      return { success: false, error: `PEF must be between 1 and ${PEF_MAX_VALUE}` };
    }
    queries.updatePersonalBest(data.childId, pef);
    return { success: true };
  } catch (err) {
    console.error('[children:set-personal-best]', err);
    return { success: false, error: 'Failed to update personal best' };
  }
});

/**
 * Update a child's profile (name, birthday, notes only — not username/password).
 * Renderer calls: window.electronAPI.updateChild({ childId, name, birthday, notes })
 */
ipcMain.handle('children:update', (event, data) => {
  try {
    if (!data || !data.childId) return { success: false, error: 'Child ID is required' };
    if (!isParentOfChild(data.childId)) return { success: false, error: 'Unauthorized' };
    if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
      return { success: false, error: 'Name is required' };
    }
    // Validate icon value if provided
    const VALID_ICONS = ['girl_older', 'girl_younger', 'boy_older', 'boy_younger', 'baby'];
    if (data.icon && !VALID_ICONS.includes(data.icon)) {
      data.icon = 'boy_older';
    }
    queries.updateChild(data);
    return { success: true };
  } catch (err) {
    console.error('[children:update]', err);
    return { success: false, error: 'Failed to update child profile' };
  }
});

// =============================================================================
// IPC HANDLERS — Medications
// =============================================================================

/**
 * Get all medications for a specific child.
 * Renderer calls: window.electronAPI.getMedications(childId)
 */
ipcMain.handle('medications:get-all', (event, childId) => {
  try {
    if (!isValidId(childId) || !canAccessChild(childId)) return [];
    return queries.getMedicationsByChild(childId);
  } catch (err) {
    console.error('[medications:get-all]', err);
    return [];
  }
});

/**
 * Get all medications across all children (for parent inventory view).
 * Renderer calls: window.electronAPI.getAllMedications()
 */
ipcMain.handle('medications:get-all-parent', (event, options) => {
  try {
    const includeInactive = options && options.includeInactive;
    const children = queries.getChildrenByParent(currentSession.userId);
    const allMeds = [];
    for (const child of children) {
      const meds = queries.getMedicationsByChild(child.child_id, includeInactive);
      // Attach child name to each medication for display
      meds.forEach(m => { m.child_name = child.name; });
      allMeds.push(...meds);
    }
    return allMeds;
  } catch (err) {
    console.error('[medications:get-all-parent]', err);
    return [];
  }
});

/**
 * Get a single medication by ID.
 * Renderer calls: window.electronAPI.getMedication(medicationId)
 */
ipcMain.handle('medications:get-one', (event, medicationId) => {
  try {
    if (!isValidId(medicationId)) return null;
    const med = queries.getMedicationById(medicationId);
    if (!med || !canAccessChild(med.child_id)) return null;
    return med;
  } catch (err) {
    console.error('[medications:get-one]', err);
    return null;
  }
});

/**
 * Add a new medication.
 * Renderer calls: window.electronAPI.addMedication(data)
 */
ipcMain.handle('medications:add', (event, data) => {
  try {
    if (!data || !isValidId(data.childId)) return { success: false, error: 'Child ID is required' };
    if (!isParentOfChild(data.childId)) return { success: false, error: 'Unauthorized' };
    if (!data.medicationName || typeof data.medicationName !== 'string' || data.medicationName.trim().length === 0) {
      return { success: false, error: 'Medication name is required' };
    }
    if (data.medicationName.trim().length > 50) {
      return { success: false, error: 'Medication name must be 50 characters or less' };
    }
    if (!isValidDateString(data.purchaseDate)) {
      return { success: false, error: 'Valid purchase date is required (YYYY-MM-DD)' };
    }
    if (!isValidDateString(data.expirationDate)) {
      return { success: false, error: 'Valid expiration date is required (YYYY-MM-DD)' };
    }
    const doses = Number(data.dosesRemaining);
    if (!Number.isInteger(doses) || doses < 0 || doses > 900) {
      return { success: false, error: 'Doses remaining must be between 0 and 900' };
    }
    const med = queries.createMedication(data);
    return { success: true, medication: med };
  } catch (err) {
    console.error('[medications:add]', err);
    return { success: false, error: 'Failed to add medication' };
  }
});

/**
 * Update an existing medication (cannot change child_id).
 * Renderer calls: window.electronAPI.updateMedication(data)
 */
ipcMain.handle('medications:update', (event, data) => {
  try {
    if (!data || !isValidId(data.medicationId)) return { success: false, error: 'Medication ID is required' };
    const existing = queries.getMedicationById(data.medicationId);
    if (!existing) return { success: false, error: 'Medication not found' };
    if (!isParentOfChild(existing.child_id)) return { success: false, error: 'Unauthorized' };
    if (!data.medicationName || typeof data.medicationName !== 'string' || data.medicationName.trim().length === 0) {
      return { success: false, error: 'Medication name is required' };
    }
    if (data.medicationName.trim().length > 50) {
      return { success: false, error: 'Medication name must be 50 characters or less' };
    }
    if (!isValidDateString(data.purchaseDate)) {
      return { success: false, error: 'Valid purchase date is required (YYYY-MM-DD)' };
    }
    if (!isValidDateString(data.expirationDate)) {
      return { success: false, error: 'Valid expiration date is required (YYYY-MM-DD)' };
    }
    const doses = Number(data.dosesRemaining);
    if (!Number.isInteger(doses) || doses < 0 || doses > 900) {
      return { success: false, error: 'Doses remaining must be between 0 and 900' };
    }
    queries.updateMedication(data);
    return { success: true };
  } catch (err) {
    console.error('[medications:update]', err);
    return { success: false, error: 'Failed to update medication' };
  }
});

/**
 * Toggle a medication's active status (soft-delete / restore).
 * Renderer calls: window.electronAPI.setMedicationActive({ medicationId, isActive })
 */
ipcMain.handle('medications:set-active', (event, data) => {
  try {
    // Verify the medication belongs to a child of the current parent
    const existing = queries.getMedicationById(data.medicationId);
    if (!existing) return { success: false, error: 'Medication not found' };
    if (!canAccessChild(existing.child_id)) return { success: false, error: 'Unauthorized' };

    queries.setMedicationActive(data.medicationId, data.isActive);
    return { success: true };
  } catch (err) {
    console.error('[medications:set-active]', err);
    return { success: false, error: 'Failed to update medication status' };
  }
});

// =============================================================================
// IPC HANDLERS — Daily Check-ins
// =============================================================================

/**
 * Submit or update today's check-in for a child.
 * Renderer calls: window.electronAPI.submitCheckin(data)
 */
ipcMain.handle('checkins:submit', (event, data) => {
  try {
    if (!canAccessChild(data.childId)) return { success: false, error: 'Unauthorized' };

    queries.upsertCheckin(data); // INSERT or UPDATE (upsert = insert or update)
    return { success: true };
  } catch (err) {
    console.error('[checkins:submit]', err);
    return { success: false, error: 'Failed to save check-in' };
  }
});

/**
 * Get today's check-in for a child (if it exists).
 * Renderer calls: window.electronAPI.getTodaysCheckin(childId)
 */
ipcMain.handle('checkins:get-today', (event, childId) => {
  try {
    if (!isValidId(childId) || !canAccessChild(childId)) return null;
    return queries.getTodaysCheckin(childId);
  } catch (err) {
    console.error('[checkins:get-today]', err);
    return null;
  }
});

/**
 * Get check-in history for a child over a date range.
 * Renderer calls: window.electronAPI.getCheckinHistory({ childId, days })
 */
ipcMain.handle('checkins:get-history', (event, data) => {
  try {
    if (!data || !canAccessChild(data.childId)) return [];
    const days = Number(data.days);
    if (isNaN(days) || days <= 0 || days > 365) return [];
    return queries.getCheckinHistory(data.childId, days);
  } catch (err) {
    console.error('[checkins:get-history]', err);
    return [];
  }
});

// =============================================================================
// IPC HANDLERS — PEF Entries
// =============================================================================

/**
 * Submit or update today's PEF entry for a child.
 * When a child submits PEF and enters the red zone, sends notification to parent.
 * Renderer calls: window.electronAPI.submitPef(data)
 * data = { childId, dailyPef, preMedPef, postMedPef, isChildSubmission }
 */
ipcMain.handle('pef:submit', (event, data) => {
  try {
    if (!canAccessChild(data.childId)) return { success: false, error: 'Unauthorized' };

    queries.upsertPefEntry(data);

    // When submitted BY THE CHILD, notify the parent with zone-specific messaging
    // (parent's "Enter PEF" screen does NOT trigger notifications)
    if (data.isChildSubmission && data.dailyPef) {
      const child = queries.getChildById(data.childId);
      if (child) {
        const parent = queries.getUserById(child.parent_id);
        if (parent) {
          // Determine zone for notification messaging
          let zone = 'grey';
          let pctText = '';
          if (child.personal_best_pef) {
            zone = calculateZone(data.dailyPef, child.personal_best_pef);
            const pct = Math.round((data.dailyPef / child.personal_best_pef) * 100);
            pctText = ` (${pct}% of personal best)`;
          }

          if (zone === 'red') {
            sendNotification(parent.user_id, 'red_zone_alert', {
              title: 'Red Zone Alert!',
              message: `${child.name}'s PEF is in the red zone. PEF: ${data.dailyPef} L/min${pctText}`,
              relatedChildId: data.childId
            });
          } else {
            // Green, yellow, or grey — inform parent their child checked in
            const zoneLabel = zone.charAt(0).toUpperCase() + zone.slice(1);
            sendNotification(parent.user_id, 'pef_submitted', {
              title: `${child.name} checked their PEF`,
              message: `${child.name} recorded a PEF of ${data.dailyPef} L/min — ${zoneLabel} Zone${pctText}`,
              relatedChildId: data.childId
            });
          }
        }
      }
    }

    return { success: true };
  } catch (err) {
    console.error('[pef:submit]', err);
    return { success: false, error: 'Failed to save PEF entry' };
  }
});

/**
 * Get PEF history for chart display.
 * Renderer calls: window.electronAPI.getPefHistory({ childId, days })
 */
ipcMain.handle('pef:get-history', (event, data) => {
  try {
    if (!data || !canAccessChild(data.childId)) return [];
    const days = Number(data.days);
    if (isNaN(days) || days <= 0 || days > 365) return [];
    return queries.getPefHistory(data.childId, days);
  } catch (err) {
    console.error('[pef:get-history]', err);
    return [];
  }
});

/**
 * Calculate a child's current zone based on today's PEF.
 * Renderer calls: window.electronAPI.calculateZone(childId)
 * Returns: { zone: 'green'|'yellow'|'red'|'grey', percentage: number }
 */
ipcMain.handle('pef:calculate-zone', (event, childId) => {
  try {
    if (!isValidId(childId) || !canAccessChild(childId)) return { zone: 'grey', percentage: null };

    const child = queries.getChildById(childId);
    const todayPef = queries.getTodaysPef(childId);

    if (!child || !todayPef || !todayPef.daily_pef || !child.personal_best_pef) {
      return { zone: 'grey', percentage: null };
    }

    const zone = calculateZone(todayPef.daily_pef, child.personal_best_pef);
    const percentage = Math.round((todayPef.daily_pef / child.personal_best_pef) * 100);
    return { zone, percentage };
  } catch (err) {
    console.error('[pef:calculate-zone]', err);
    return { zone: 'grey', percentage: null };
  }
});

// =============================================================================
// IPC HANDLERS — Medication Logs
// =============================================================================

/**
 * Log a medication dose taken by a child.
 * Also checks if breathing declined and sends parent notification.
 * Renderer calls: window.electronAPI.logMedication(data)
 * data = { childId, medicationId, dosesTaken, breathingBefore, breathingAfter }
 */
ipcMain.handle('medications:log', (event, data) => {
  try {
    if (!canAccessChild(data.childId)) return { success: false, error: 'Unauthorized' };

    // Insert the log entry
    queries.createMedicationLog(data);

    // Decrease doses remaining in the medication record
    queries.decreaseDosesRemaining(data.medicationId, data.dosesTaken);

    // Check breathing decline logic:
    // If breathing got worse OR stayed at 0 (Very Bad) or 1 (Bad)
    const gotWorse = data.breathingAfter < data.breathingBefore;
    const stillBad = data.breathingAfter <= 1;

    if (gotWorse || stillBad) {
      // Get child info to find their parent
      const child = queries.getChildById(data.childId);
      if (child) {
        const parent = queries.getUserById(child.parent_id);
        if (parent) {
          const breathingLabels = ['Very Bad', 'Bad', 'Normal', 'Good', 'Very Good'];
          sendNotification(parent.user_id, 'breathing_decline', {
            title: "Breathing Decline Alert",
            message: `${child.name}'s breathing hasn't improved. Before: ${breathingLabels[data.breathingBefore]}, After: ${breathingLabels[data.breathingAfter]}`,
            relatedChildId: data.childId
          });
        }
      }
    }

    return {
      success: true,
      breathingDeclined: gotWorse || stillBad
    };
  } catch (err) {
    console.error('[medications:log]', err);
    return { success: false, error: 'Failed to log medication' };
  }
});

/**
 * Get medication logs for display (filtered by parent's children).
 * Renderer calls: window.electronAPI.getMedicationLogs({ childId, days })
 */
ipcMain.handle('medications:get-logs', (event, data) => {
  try {
    if (!data) return [];
    return queries.getMedicationLogs(data.childId || null, data.days || 30, currentSession.userId);
  } catch (err) {
    console.error('[medications:get-logs]', err);
    return [];
  }
});

// =============================================================================
// IPC HANDLERS — Controller Schedule
// =============================================================================

/**
 * Get controller schedule for a child.
 * Renderer calls: window.electronAPI.getControllerSchedule(childId)
 */
ipcMain.handle('schedule:get', (event, childId) => {
  try {
    if (!isValidId(childId) || !canAccessChild(childId)) return null;
    return queries.getControllerSchedule(childId);
  } catch (err) {
    console.error('[schedule:get]', err);
    return null;
  }
});

/**
 * Update the controller schedule for a child.
 * Renderer calls: window.electronAPI.updateControllerSchedule(data)
 */
ipcMain.handle('schedule:update', (event, data) => {
  try {
    if (!data || !isValidId(data.childId)) return { success: false, error: 'Child ID is required' };
    if (!isParentOfChild(data.childId)) return { success: false, error: 'Unauthorized' };
    queries.updateControllerSchedule(data);
    return { success: true };
  } catch (err) {
    console.error('[schedule:update]', err);
    return { success: false, error: 'Failed to update schedule' };
  }
});

/**
 * Calculate medication adherence for the last 30 days.
 * Renderer calls: window.electronAPI.getMedicationAdherence(childId)
 */
ipcMain.handle('schedule:adherence', (event, childId) => {
  try {
    if (!isValidId(childId) || !canAccessChild(childId)) return { daysPlanned: 0, daysCompleted: 0, percentage: 0 };
    const schedule = queries.getControllerSchedule(childId);
    if (!schedule) return { daysPlanned: 0, daysCompleted: 0, percentage: 0 };

    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    let daysPlanned = 0;
    let daysCompleted = 0;

    // Look back N days
    for (let i = 0; i < ADHERENCE_LOOKBACK_DAYS; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dayOfWeek = dayNames[date.getDay()];

      // Is this day scheduled for medication?
      if (schedule[dayOfWeek]) {
        daysPlanned++;

        // Was medication logged on this date?
        // Use local date format to match how dates are stored
        const d = date;
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const wasLogged = queries.wasMedicationLoggedOnDate(childId, dateStr);
        if (wasLogged) daysCompleted++;
      }
    }

    const percentage = daysPlanned > 0
      ? Math.round((daysCompleted / daysPlanned) * 100)
      : 0;

    return { daysPlanned, daysCompleted, percentage };
  } catch (err) {
    console.error('[schedule:adherence]', err);
    return { daysPlanned: 0, daysCompleted: 0, percentage: 0 };
  }
});

// =============================================================================
// IPC HANDLERS — Incident Reports (Emergency Triage)
// =============================================================================

/**
 * Notify parent immediately when a child STARTS an emergency triage.
 * Called as soon as the emergency page loads for a child user.
 * Renderer calls: window.electronAPI.emergencyStarted()
 */
ipcMain.handle('emergency:started', () => {
  try {
    if (currentSession.role !== 'child' || !currentSession.childId) return;

    const child = queries.getChildById(currentSession.childId);
    if (child) {
      const parent = queries.getUserById(child.parent_id);
      if (parent) {
        sendNotification(parent.user_id, 'child_emergency', {
          title: 'EMERGENCY: Child Started Triage',
          message: `${child.name} has started an emergency response. Please check on them immediately.`,
          relatedChildId: currentSession.childId
        });
        // Show OS-level notification immediately (not just database)
        showOSNotification(
          'EMERGENCY: Child Started Triage',
          `${child.name} has started an emergency response!`
        );
      }
    }
  } catch (err) {
    console.error('[emergency:started]', err);
  }
});

/**
 * Create a new incident (triage) report.
 * Renderer calls: window.electronAPI.createIncident(data)
 */
ipcMain.handle('incidents:create', (event, data) => {
  try {
    if (!canAccessChild(data.childId)) return { success: false, error: 'Unauthorized' };

    // The logged_by_user_id is the current session's user
    const loggedByUserId = currentSession.userId;

    const incident = queries.createIncident({
      ...data,
      loggedByUserId
    });

    return { success: true, incident };
  } catch (err) {
    console.error('[incidents:create]', err);
    return { success: false, error: 'Failed to create incident report' };
  }
});

/**
 * Get all incident reports for a child.
 * Renderer calls: window.electronAPI.getIncidents(childId)
 */
ipcMain.handle('incidents:get-all', (event, childId) => {
  try {
    if (!isValidId(childId) || !canAccessChild(childId)) return [];
    return queries.getIncidentsByChild(childId);
  } catch (err) {
    console.error('[incidents:get-all]', err);
    return [];
  }
});

/**
 * Get all incidents across all of parent's children.
 */
ipcMain.handle('incidents:get-all-parent', () => {
  try {
    const children = queries.getChildrenByParent(currentSession.userId);
    const allIncidents = [];
    for (const child of children) {
      const incidents = queries.getIncidentsByChild(child.child_id);
      incidents.forEach(i => { i.child_name = child.name; });
      allIncidents.push(...incidents);
    }
    return allIncidents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  } catch (err) {
    console.error('[incidents:get-all-parent]', err);
    return [];
  }
});

// =============================================================================
// IPC HANDLERS — Badges
// =============================================================================

/**
 * Create a new badge for a child.
 * Renderer calls: window.electronAPI.createBadge(data)
 */
ipcMain.handle('badges:create', (event, data) => {
  try {
    if (!data || !data.childId) return { success: false, error: 'Child ID is required' };
    if (!isParentOfChild(data.childId)) return { success: false, error: 'Unauthorized' };
    const badge = queries.createBadge(data);
    return { success: true, badge };
  } catch (err) {
    console.error('[badges:create]', err);
    return { success: false, error: 'Failed to create badge' };
  }
});

/**
 * Get all badges for a child (and check which are newly achieved).
 * Renderer calls: window.electronAPI.getBadges(childId)
 */
ipcMain.handle('badges:get-all', (event, data) => {
  try {
    // Support passing { childId, includeInactive } or just childId (number)
    const childId = typeof data === 'object' ? data.childId : data;
    const includeInactive = typeof data === 'object' ? data.includeInactive : false;

    if (!canAccessChild(childId)) return [];

    const badges = queries.getBadgesByChild(childId, includeInactive);

    // Only check criteria for active badges that aren't yet achieved
    // Also attach progress info for display
    for (const badge of badges) {
      if (!badge.is_achieved && badge.is_active) {
        const achieved = checkBadgeCriteria(badge, childId);
        if (achieved) {
          queries.markBadgeAchieved(badge.badge_id);
          badge.is_achieved = 1;
          badge.achieved_at = new Date().toISOString();
        }
      }

      // Attach current progress for unachieved badges
      if (!badge.is_achieved) {
        badge.progress = getBadgeProgress(badge, childId);
      }
    }

    return badges;
  } catch (err) {
    console.error('[badges:get-all]', err);
    return [];
  }
});

/**
 * Toggle a badge's active status (soft-delete / restore).
 * Renderer calls: window.electronAPI.setBadgeActive({ badgeId, isActive })
 */
ipcMain.handle('badges:set-active', (event, data) => {
  try {
    // Verify the badge belongs to a child the user can access
    const badge = queries.getBadgeById(data.badgeId);
    if (!badge) return { success: false, error: 'Badge not found' };
    if (!canAccessChild(badge.child_id)) return { success: false, error: 'Unauthorized' };

    queries.setBadgeActive(data.badgeId, data.isActive);
    return { success: true };
  } catch (err) {
    console.error('[badges:set-active]', err);
    return { success: false, error: 'Failed to update badge status' };
  }
});

/**
 * Check if a badge's criteria have been met.
 * Returns true if the badge should be marked as achieved.
 */
function checkBadgeCriteria(badge, childId) {
  switch (badge.criteria_type) {
    case 'technique_sessions': {
      // Count completed inhaler technique sessions
      const count = queries.countTechniqueSessions(childId);
      return count >= badge.criteria_value;
    }
    case 'controller_adherence': {
      // Count how many of the last N months had >= 80% controller adherence.
      // badge.criteria_value = number of months required (e.g. 3 = "3 good months").
      const schedule = queries.getControllerSchedule(childId);
      if (!schedule) return false;

      const dayNames   = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
      const required   = badge.criteria_value;  // months needed
      let   goodMonths = 0;

      for (let m = 0; m < required; m++) {
        // Build first and last day of the target month (m months ago).
        // We use explicit year/month arithmetic to avoid setMonth() unreliability
        // near month boundaries (e.g. Jan 31 → Feb 31 overflows to March).
        const now = new Date();
        let targetMonth = now.getMonth() - m;
        let targetYear = now.getFullYear();
        // Normalise negative months (e.g. month -1 → December of previous year)
        while (targetMonth < 0) {
          targetMonth += 12;
          targetYear--;
        }

        const firstDay = new Date(targetYear, targetMonth, 1);
        const lastDay  = new Date(targetYear, targetMonth + 1, 0); // last day of month

        let planned   = 0;
        let completed = 0;

        // Walk every day of that month
        const cursor = new Date(firstDay);
        while (cursor <= lastDay) {
          const dow = dayNames[cursor.getDay()];
          if (schedule[dow]) {
            planned++;
            const dateStr = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
            if (queries.wasMedicationLoggedOnDate(childId, dateStr)) completed++;
          }
          cursor.setDate(cursor.getDate() + 1);
        }

        const pct = planned > 0 ? (completed / planned) * 100 : 0;
        if (pct >= 80) goodMonths++;
      }

      return goodMonths >= required;
    }
    default:
      return false;
  }
}

/**
 * Get current progress towards a badge's criteria.
 * Returns { current, target, hint } for display to the child.
 */
function getBadgeProgress(badge, childId) {
  switch (badge.criteria_type) {
    case 'technique_sessions': {
      const count = queries.countTechniqueSessions(childId);
      return {
        current: count,
        target: badge.criteria_value,
        hint: `Complete ${badge.criteria_value} inhaler technique practice session${badge.criteria_value !== 1 ? 's' : ''}`
      };
    }
    case 'controller_adherence': {
      return {
        current: null,
        target: badge.criteria_value,
        hint: `Take your controller medication on time for ${badge.criteria_value} month${badge.criteria_value !== 1 ? 's' : ''} (80%+ each month)`
      };
    }
    default:
      return { current: null, target: badge.criteria_value, hint: badge.badge_description };
  }
}

// =============================================================================
// IPC HANDLERS — Inhaler Technique Sessions
// =============================================================================

/**
 * Record a completed inhaler technique session.
 * Renderer calls: window.electronAPI.recordTechniqueSession({ sessionType })
 */
ipcMain.handle('technique:record', (event, data) => {
  try {
    if (!data || !['regular', 'mask_spacer'].includes(data.sessionType)) {
      return { success: false, error: 'Invalid session type' };
    }
    queries.createTechniqueSession({
      childId: currentSession.childId,
      sessionType: data.sessionType
    });
    return { success: true };
  } catch (err) {
    console.error('[technique:record]', err);
    return { success: false, error: 'Failed to record technique session' };
  }
});

/**
 * Count technique sessions for a child.
 * Renderer calls: window.electronAPI.countTechniqueSessions(childId)
 * Only accessible by the child themselves, their parent, or a provider with access.
 */
ipcMain.handle('technique:count', (event, childId) => {
  try {
    if (!isValidId(childId)) return 0;
    // Children can only query their own session count
    if (currentSession.role === 'child') {
      if (currentSession.childId !== childId) return 0;
    }
    // Parents can only query their own children
    if (currentSession.role === 'parent') {
      const child = queries.getChildById(childId);
      if (!child || child.parent_id !== currentSession.userId) return 0;
    }
    return queries.countTechniqueSessions(childId);
  } catch (err) {
    console.error('[technique:count]', err);
    return 0;
  }
});

// =============================================================================
// IPC HANDLERS — Provider Access
// =============================================================================

/**
 * Generate a new access code for a provider to access a child's data.
 * Renderer calls: window.electronAPI.generateAccessCode({ childId, sharingSettings })
 */
ipcMain.handle('provider:generate-access-code', (event, data) => {
  try {
    if (!data || !isValidId(data.childId)) return { success: false, error: 'Child ID is required' };
    if (!isParentOfChild(data.childId)) return { success: false, error: 'Unauthorized' };

    // Generate random 8-character alphanumeric code
    const code = generateAccessCode();

    // Set expiry to N hours from now
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + ACCESS_CODE_EXPIRY_HOURS);

    const access = queries.createProviderAccess({
      parentId: currentSession.userId,
      childId: data.childId,
      accessCode: code,
      codeExpiresAt: expiresAt.toISOString(),
      ...data.sharingSettings
    });

    return { success: true, code, expiresAt: expiresAt.toISOString() };
  } catch (err) {
    console.error('[provider:generate-access-code]', err);
    return { success: false, error: 'Failed to generate code' };
  }
});

/**
 * Update sharing settings for an existing provider access record.
 * Renderer calls: window.electronAPI.updateSharingSettings(data)
 */
ipcMain.handle('provider:update-sharing', (event, data) => {
  try {
    if (!data || !data.childId) return { success: false, error: 'Child ID is required' };
    if (!isParentOfChild(data.childId)) return { success: false, error: 'Unauthorized' };
    queries.updateSharingSettings(data);
    return { success: true };
  } catch (err) {
    console.error('[provider:update-sharing]', err);
    return { success: false, error: 'Failed to update sharing settings' };
  }
});

/**
 * Provider activates an access code to gain access to a child's data.
 * Renderer calls: window.electronAPI.activateAccessCode(code)
 */
ipcMain.handle('provider:activate-access', (event, code) => {
  try {
    if (currentSession.role !== 'provider') {
      return { success: false, error: 'Only providers can activate access codes' };
    }

    const access = queries.getProviderAccessByCode(code);

    if (!access) {
      return { success: false, error: 'Invalid access code' };
    }

    // Check if code has expired
    if (new Date(access.code_expires_at) < new Date()) {
      return { success: false, error: 'Access code has expired' };
    }

    // Link the provider to this child
    queries.activateProviderAccess(access.access_id, currentSession.userId);

    return { success: true, access };
  } catch (err) {
    console.error('[provider:activate-access]', err);
    return { success: false, error: 'Failed to activate access code' };
  }
});

/**
 * Get all children a provider has access to.
 * Renderer calls: window.electronAPI.getProviderPatients()
 */
ipcMain.handle('provider:get-patients', () => {
  try {
    return queries.getProviderPatients(currentSession.userId);
  } catch (err) {
    console.error('[provider:get-patients]', err);
    return [];
  }
});

/**
 * Get the sharing settings for a provider's access to a child.
 * Renderer calls: window.electronAPI.getSharingSettings({ providerId, childId })
 */
ipcMain.handle('provider:get-sharing', (event, data) => {
  try {
    // Only the parent who owns the child or the linked provider may view sharing settings
    if (currentSession.role === 'parent') {
      if (!isParentOfChild(data.childId)) return null;
    } else if (currentSession.role === 'provider') {
      if (data.providerId !== currentSession.userId) return null;
    } else {
      return null;
    }

    return queries.getProviderAccess(data.providerId, data.childId);
  } catch (err) {
    console.error('[provider:get-sharing]', err);
    return null;
  }
});

// =============================================================================
// IPC HANDLERS — Notifications
// =============================================================================

/**
 * Get all notifications for the current user (last 2 weeks).
 * Renderer calls: window.electronAPI.getNotifications()
 */
ipcMain.handle('notifications:get-all', () => {
  try {
    return queries.getNotifications(currentSession.userId);
  } catch (err) {
    console.error('[notifications:get-all]', err);
    return [];
  }
});

/**
 * Mark a single notification as read.
 * Renderer calls: window.electronAPI.markNotificationRead(notificationId)
 */
ipcMain.handle('notifications:mark-read', (event, notificationId) => {
  try {
    queries.markNotificationRead(notificationId);
    return { success: true };
  } catch (err) {
    console.error('[notifications:mark-read]', err);
    return { success: false, error: 'Failed to mark notification as read' };
  }
});

/**
 * Mark all notifications as read.
 * Renderer calls: window.electronAPI.markAllNotificationsRead()
 */
ipcMain.handle('notifications:mark-all-read', () => {
  try {
    queries.markAllNotificationsRead(currentSession.userId);
    return { success: true };
  } catch (err) {
    console.error('[notifications:mark-all-read]', err);
    return { success: false, error: 'Failed to mark notifications as read' };
  }
});

// =============================================================================
// IPC HANDLERS — App Settings (key-value persistence)
// =============================================================================

ipcMain.handle('settings:get', (event, key) => {
  try {
    return queries.getSetting(key);
  } catch (err) {
    console.error('[settings:get]', err);
    return null;
  }
});

ipcMain.handle('settings:set', (event, key, value) => {
  try {
    queries.setSetting(key, String(value));
    return { success: true };
  } catch (err) {
    console.error('[settings:set]', err);
    return { success: false };
  }
});

// =============================================================================
// IPC HANDLERS — PDF Generation
// =============================================================================

/**
 * Generate a PDF report and save it to disk.
 * Renderer calls: window.electronAPI.generatePdf(data)
 * data includes chart image data (base64) and report data
 */
ipcMain.handle('pdf:generate', async (event, data) => {
  try {
    // Show "Save As" dialog so user picks where to save the PDF
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Asthma Report',
      defaultPath: `asthma-report-${data.childName}-${Date.now()}.pdf`,
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
    });

    if (result.canceled) {
      return { success: false, canceled: true };
    }

    await generatePdfReport(data, result.filePath);

    // Open the file after saving
    shell.openPath(result.filePath);

    return { success: true, filePath: result.filePath };
  } catch (err) {
    console.error('[pdf:generate]', err);
    return { success: false, error: 'Failed to generate PDF' };
  }
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * calculateZone — Determine PEF zone based on personal best.
 * @param {number} dailyPef - Today's PEF reading
 * @param {number} personalBest - Child's personal best PEF
 * @returns {string} 'green' | 'yellow' | 'red'
 */
function calculateZone(dailyPef, personalBest) {
  if (!personalBest || personalBest <= 0) return 'grey';
  const percentage = (dailyPef / personalBest) * 100;
  if (percentage >= 80) return 'green';
  if (percentage >= 50) return 'yellow';
  return 'red';
}

/**
 * generateAccessCode — Creates a cryptographically secure random 8-character code.
 * Uses crypto.randomBytes instead of Math.random() for unpredictability,
 * important since these codes grant access to a child's medical data.
 * @returns {string} e.g. "AB3XY72Z"
 */
function generateAccessCode() {
  const crypto = require('crypto');
  const chars  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes  = crypto.randomBytes(8);
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(bytes[i] % chars.length);
  }
  return code;
}

/**
 * sendNotification — Insert a notification into the database and show OS notification.
 * @param {number} userId - Who receives the notification
 * @param {string} type - Notification type (see schema for valid types)
 * @param {object} data - { title, message, relatedChildId, relatedMedicationId }
 */
function sendNotification(userId, type, data) {
  // Check if we already sent this same type of notification in the last hour
  // to prevent duplicate notifications from the scheduler
  const recent = queries.getRecentNotification(userId, type, data.relatedChildId || null, NOTIFICATION_DEDUP_MINUTES);
  if (recent) return; // Skip if already sent recently

  // Store in database (shows in the notifications bell)
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + NOTIFICATION_EXPIRY_DAYS);

  queries.createNotification({
    userId,
    notificationType: type,
    title: data.title,
    message: data.message,
    relatedChildId: data.relatedChildId || null,
    relatedMedicationId: data.relatedMedicationId || null,
    expiresAt: expiresAt.toISOString()
  });

  // Only show OS-level notification popup if this user is currently logged in
  if (currentSession && currentSession.userId === userId) {
    showOSNotification(data.title, data.message);
  }
}

/**
 * showOSNotification — Shows a native OS notification popup.
 * Works even when the app window is not in focus.
 * @param {string} title
 * @param {string} body
 */
function showOSNotification(title, body) {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
}

// =============================================================================
// NOTIFICATION SCHEDULER
// =============================================================================
/**
 * startNotificationScheduler — Runs background checks every 30 minutes.
 * Checks for:
 *   - Medications expiring soon (1 month, 1 week, 2 days, 1 day)
 *   - Low dose count (≤ 20 doses remaining)
 *   - Cleans up old notifications (> 2 weeks)
 */
function startNotificationScheduler() {
  // Run immediately on startup, then on the configured interval
  runScheduledChecks();
  setInterval(runScheduledChecks, SCHEDULER_INTERVAL_MS);
}

function runScheduledChecks() {
  try {
    // Get all users who are parents
    const parents = queries.getAllParents();

    for (const parent of parents) {
      const children = queries.getChildrenByParent(parent.user_id);

      for (const child of children) {
        const medications = queries.getMedicationsByChild(child.child_id);

        for (const med of medications) {
          checkMedicationExpiry(parent.user_id, med);
          checkLowDoseCount(parent.user_id, med);
        }
      }
    }

    // Clean up expired notifications (older than 2 weeks)
    queries.deleteExpiredNotifications();
  } catch (err) {
    console.error('[scheduler]', err);
  }
}

/**
 * Check if a medication is expiring soon and send notification if needed.
 */
function checkMedicationExpiry(userId, medication) {
  if (!medication.expiration_date) return;

  const today = new Date();
  const expiry = new Date(medication.expiration_date);
  const daysUntilExpiry = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));

  // Check each threshold in ASCENDING order so the most urgent label wins.
  // e.g. 1 day remaining → "1 day" (not "1 month")
  const thresholds = [
    { days: 1,  label: '1 day' },
    { days: 2,  label: '2 days' },
    { days: 7,  label: '1 week' },
    { days: 30, label: '1 month' }
  ];

  for (const threshold of thresholds) {
    if (daysUntilExpiry <= threshold.days && daysUntilExpiry > 0) {
      sendNotification(userId, 'medication_expiry', {
        title: 'Medication Expiring Soon',
        message: `${medication.medication_name} expires in ${threshold.label} (${medication.expiration_date})`,
        relatedMedicationId: medication.medication_id
      });
      break; // Only send one notification per medication per check cycle
    }
  }
}

/**
 * Check if a medication is running low and send notification if needed.
 */
function checkLowDoseCount(userId, medication) {
  // Skip fully depleted medications (0 doses) — only notify when low but not empty
  if (medication.doses_remaining > 0 && medication.doses_remaining <= LOW_DOSE_THRESHOLD) {
    sendNotification(userId, 'low_dose_count', {
      title: 'Low Medication Supply',
      message: `${medication.medication_name} only has ${medication.doses_remaining} doses remaining`,
      relatedMedicationId: medication.medication_id
    });
  }
}

// =============================================================================
// PDF GENERATION
// =============================================================================
/**
 * generatePdfReport — Creates a PDF with PDFKit and saves it to disk.
 * @param {object} data - Report data including chart images as base64 strings
 * @param {string} filePath - Where to save the PDF
 */
async function generatePdfReport(data, filePath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });

    // Pipe the PDF output to a file
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // Helper: print a section heading
    function sectionHeading(title) {
      doc.fontSize(16).font('Helvetica-Bold').text(title);
      doc.moveDown(0.3);
      // Draw a thin line under the heading
      doc.save()
        .moveTo(50, doc.y)
        .lineTo(doc.page.width - 50, doc.y)
        .lineWidth(1)
        .strokeColor('#4A90D9')
        .stroke()
        .restore();
      doc.moveDown(0.5);
    }

    // Helper: print "No data available" message for empty sections
    function noData(message) {
      doc.fontSize(11).font('Helvetica-Oblique').fillColor('#888888')
        .text(message || 'No data available for this section.');
      doc.fillColor('#000000'); // reset colour
      doc.moveDown();
    }

    const breathingLabels = ['Very Bad', 'Bad', 'Normal', 'Good', 'Very Good'];
    const symptomLabels   = { none: 'None', some: 'Some', a_lot: 'A Lot' };

    // =====================================================================
    // COVER PAGE
    // =====================================================================
    doc.moveDown(2);
    doc.fontSize(28).font('Helvetica-Bold').fillColor('#4A90D9')
      .text('Asthma Report', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(20).font('Helvetica').fillColor('#333333')
      .text(data.childName, { align: 'center' });
    doc.moveDown(1.5);
    doc.fillColor('#000000');
    doc.fontSize(12).font('Helvetica');
    doc.text(`Date of Birth: ${data.birthday}`, { align: 'center' });
    doc.text(`Report Period: ${data.startDate} to ${data.endDate}`, { align: 'center' });
    doc.text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
    if (data.personalBestPef) {
      doc.moveDown(0.5);
      doc.text(`Personal Best PEF: ${data.personalBestPef} L/min`, { align: 'center' });
    }

    // =====================================================================
    // 1. MEDICATION LIST
    // =====================================================================
    doc.addPage();
    sectionHeading('Medications');

    if (data.medications && data.medications.length > 0) {
      for (const med of data.medications) {
        doc.fontSize(12).font('Helvetica-Bold')
          .text(`${med.medication_name}  (${med.is_rescue ? 'Rescue' : 'Controller'})`);
        doc.fontSize(11).font('Helvetica');
        doc.text(`  Purchased: ${med.purchase_date}   |   Expires: ${med.expiration_date}`);
        doc.text(`  Doses Remaining: ${med.doses_remaining}`);
        if (med.notes) doc.text(`  Notes: ${med.notes}`);
        doc.moveDown(0.4);
      }
    } else {
      noData('No medications have been added yet.');
    }

    // =====================================================================
    // 2. CONTROLLER SCHEDULE
    // =====================================================================
    doc.moveDown(0.5);
    sectionHeading('Controller Schedule');

    if (data.schedule) {
      const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
      const labels = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
      const scheduled = days.filter(d => data.schedule[d]).map((d,i) => labels[days.indexOf(d)]);
      if (scheduled.length > 0) {
        doc.fontSize(12).font('Helvetica');
        doc.text(`Scheduled Days: ${scheduled.join(', ')}`);
        doc.text(`Doses Per Day: ${data.schedule.doses_per_day}`);
      } else {
        noData('No controller days have been scheduled.');
      }
    } else {
      noData('No controller schedule has been set up.');
    }

    // =====================================================================
    // 3. MEDICATION ADHERENCE
    // =====================================================================
    doc.addPage();
    sectionHeading('Medication Adherence (Last 30 Days)');

    if (data.adherence) {
      doc.fontSize(12).font('Helvetica');
      doc.text(`Days Planned:   ${data.adherence.daysPlanned}`);
      doc.text(`Days Completed: ${data.adherence.daysCompleted}`);
      doc.moveDown(0.3);
      doc.fontSize(14).font('Helvetica-Bold')
        .text(`Adherence Rate: ${data.adherence.percentage}%`);
      doc.font('Helvetica').fontSize(12);
    } else {
      noData('No adherence data available. Ensure a controller schedule is set up.');
    }

    // =====================================================================
    // 4. SYMPTOM HISTORY (Daily Check-ins)
    // =====================================================================
    doc.addPage();
    sectionHeading('Symptom History');

    // Embed symptom severity chart if available
    if (data.chartImages && data.chartImages.symptoms) {
      try {
        const imgData = data.chartImages.symptoms.replace(/^data:image\/png;base64,/, '');
        doc.image(Buffer.from(imgData, 'base64'), {
          fit: [500, 250],
          align: 'center'
        });
        doc.moveDown(1);
      } catch (e) {
        console.error('[pdf] Failed to embed symptom chart:', e);
      }
    }

    if (data.checkins && data.checkins.length > 0) {
      // Summary table
      doc.fontSize(11).font('Helvetica-Bold');
      doc.text('Date            Night Waking   Activity Limits   Coughing   Wheezing');
      doc.fontSize(10).font('Helvetica');
      for (const c of data.checkins) {
        const nw = symptomLabels[c.night_waking] || c.night_waking;
        const al = symptomLabels[c.activity_limits] || c.activity_limits;
        const co = symptomLabels[c.coughing] || c.coughing;
        const wh = symptomLabels[c.wheezing] || c.wheezing;
        doc.text(`${c.date}        ${nw.padEnd(15)}${al.padEnd(18)}${co.padEnd(11)}${wh}`);

        // Page break safety: if we're near the bottom, add a new page
        if (doc.y > doc.page.height - 80) {
          doc.addPage();
        }
      }
      doc.moveDown(0.5);
      doc.fontSize(11).font('Helvetica')
        .text(`Total check-ins in report period: ${data.checkins.length}`);
    } else {
      noData('No daily check-ins have been recorded for this period.');
    }

    // =====================================================================
    // 5. TRIGGER HISTORY
    // =====================================================================
    doc.addPage();
    sectionHeading('Trigger History');

    if (data.triggers && data.triggers.length > 0) {
      // Count trigger frequency
      const triggerCounts = {};
      for (const entry of data.triggers) {
        const names = entry.triggersText.split(', ');
        for (const name of names) {
          triggerCounts[name] = (triggerCounts[name] || 0) + 1;
        }
      }

      doc.fontSize(12).font('Helvetica-Bold').text('Trigger Frequency Summary:');
      doc.moveDown(0.3);
      doc.fontSize(11).font('Helvetica');
      const sorted = Object.entries(triggerCounts).sort((a, b) => b[1] - a[1]);
      for (const [name, count] of sorted) {
        doc.text(`  ${name}: ${count} occurrence(s)`);
      }

      doc.moveDown(0.5);
      doc.fontSize(12).font('Helvetica-Bold').text('Daily Trigger Log:');
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica');
      for (const entry of data.triggers) {
        doc.text(`${entry.date}: ${entry.triggersText}`);
        if (doc.y > doc.page.height - 80) doc.addPage();
      }
    } else {
      noData('No triggers were reported during this period.');
    }

    // =====================================================================
    // 6. PEF (Peak Expiratory Flow) HISTORY
    // =====================================================================
    doc.addPage();
    sectionHeading('Peak Expiratory Flow (PEF) History');

    if (data.pefHistory && data.pefHistory.length > 0) {
      // Embed PEF trend chart if available
      if (data.chartImages && data.chartImages.pefTrend) {
        try {
          const imgData = data.chartImages.pefTrend.replace(/^data:image\/png;base64,/, '');
          doc.image(Buffer.from(imgData, 'base64'), {
            fit: [500, 250],
            align: 'center'
          });
          doc.moveDown(1);
        } catch (e) {
          console.error('[pdf] Failed to embed PEF trend chart:', e);
        }
      }

      // Zone summary
      if (data.pefZoneSummary) {
        // Embed PEF zone doughnut chart if available
        if (data.chartImages && data.chartImages.pefZones) {
          try {
            const imgData = data.chartImages.pefZones.replace(/^data:image\/png;base64,/, '');
            doc.image(Buffer.from(imgData, 'base64'), {
              fit: [300, 200],
              align: 'center'
            });
            doc.moveDown(0.5);
          } catch (e) {
            console.error('[pdf] Failed to embed PEF zone chart:', e);
          }
        }

        doc.fontSize(12).font('Helvetica-Bold').text('Zone Distribution:');
        doc.moveDown(0.3);
        doc.fontSize(11).font('Helvetica');
        doc.text(`  Green Zone (>= 80%):  ${data.pefZoneSummary.green} day(s)`);
        doc.text(`  Yellow Zone (50-79%): ${data.pefZoneSummary.yellow} day(s)`);
        doc.text(`  Red Zone (< 50%):     ${data.pefZoneSummary.red} day(s)`);
        doc.moveDown(0.5);
      }

      // PEF readings table — start on a new page since charts may fill the previous one
      if (doc.y > doc.page.height - 200) doc.addPage();
      doc.fontSize(12).font('Helvetica-Bold').text('Daily Readings:');
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica-Bold');
      doc.text('Date            Daily PEF     Pre-Med PEF    Post-Med PEF');
      doc.fontSize(10).font('Helvetica');
      for (const p of data.pefHistory) {
        const daily = p.daily_pef ? `${p.daily_pef} L/min` : '—';
        const pre   = p.pre_medication_pef ? `${p.pre_medication_pef} L/min` : '—';
        const post  = p.post_medication_pef ? `${p.post_medication_pef} L/min` : '—';
        doc.text(`${p.date}        ${daily.padEnd(14)}${pre.padEnd(15)}${post}`);
        if (doc.y > doc.page.height - 80) doc.addPage();
      }
    } else {
      noData('No PEF readings have been recorded for this period.');
    }

    // =====================================================================
    // 7. INCIDENT REPORTS
    // =====================================================================
    doc.addPage();
    sectionHeading('Incident Reports');

    if (data.incidents && data.incidents.length > 0) {
      for (const incident of data.incidents) {
        doc.fontSize(12).font('Helvetica-Bold').text(`${incident.timestamp}`);
        doc.fontSize(11).font('Helvetica');
        doc.text(`  Can Speak Full Sentences: ${incident.can_speak_full_sentences ? 'Yes' : 'No'}`);
        doc.text(`  Chest Retracting: ${incident.chest_retracting ? 'Yes' : 'No'}`);
        doc.text(`  Blue/Grey Lips: ${incident.blue_grey_lips ? 'Yes' : 'No'}`);
        if (incident.current_pef) doc.text(`  PEF at Time of Incident: ${incident.current_pef} L/min`);
        doc.text(`  Notes: ${incident.user_notes}`);
        doc.moveDown(0.5);
        if (doc.y > doc.page.height - 100) doc.addPage();
      }
    } else {
      noData('No incident reports have been recorded. This is a good sign!');
    }

    // =====================================================================
    // 8. RESCUE MEDICATION LOGS
    // =====================================================================
    doc.addPage();
    sectionHeading('Rescue Medication Logs');

    if (data.rescueLogs && data.rescueLogs.length > 0) {
      for (const log of data.rescueLogs) {
        doc.fontSize(11).font('Helvetica');
        doc.text(`${log.timestamp} — ${log.medication_name}: ${log.doses_taken} dose(s)`);
        doc.text(`  Breathing Before: ${breathingLabels[log.breathing_before]}  |  After: ${breathingLabels[log.breathing_after]}`);
        doc.moveDown(0.3);
        if (doc.y > doc.page.height - 80) doc.addPage();
      }
    } else {
      noData('No rescue medication usage has been logged for this period.');
    }

    // =====================================================================
    // 9. CONTROLLER MEDICATION LOGS
    // =====================================================================
    doc.addPage();
    sectionHeading('Controller Medication Logs');

    if (data.controllerLogs && data.controllerLogs.length > 0) {
      for (const log of data.controllerLogs) {
        doc.fontSize(11).font('Helvetica');
        doc.text(`${log.timestamp} — ${log.medication_name}: ${log.doses_taken} dose(s)`);
        doc.text(`  Breathing Before: ${breathingLabels[log.breathing_before]}  |  After: ${breathingLabels[log.breathing_after]}`);
        doc.moveDown(0.3);
        if (doc.y > doc.page.height - 80) doc.addPage();
      }
    } else {
      noData('No controller medication doses have been logged for this period.');
    }

    // =====================================================================
    // 10. INHALER TECHNIQUE PRACTICE
    // =====================================================================
    doc.moveDown(0.5);
    sectionHeading('Inhaler Technique Practice');

    const sessionCount = data.techniqueSessions || 0;
    if (sessionCount > 0) {
      doc.fontSize(12).font('Helvetica');
      doc.text(`Total practice sessions completed: ${sessionCount}`);
    } else {
      noData('No inhaler technique practice sessions have been completed yet.');
    }

    // =====================================================================
    // FOOTER NOTE
    // =====================================================================
    doc.addPage();
    doc.moveDown(2);
    doc.fontSize(10).font('Helvetica-Oblique').fillColor('#888888')
      .text('This report was generated by Asthma Tracker. It does not constitute medical advice.', { align: 'center' });
    doc.text('Always consult a qualified healthcare professional for medical guidance.', { align: 'center' });
    doc.fillColor('#000000');

    doc.end();

    // Resolve promise when file is finished writing
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}
