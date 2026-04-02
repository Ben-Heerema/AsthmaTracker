# Asthma Tracker

An offline-first Electron desktop application for managing childhood asthma.
Supports three user roles: **Parent**, **Healthcare Provider**, and **Child**.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Installation](#2-installation)
3. [Running the App](#3-running-the-app)
4. [How Electron Works — The Two-Process Model](#4-how-electron-works)
5. [Project Structure](#5-project-structure)
6. [Testing](#6-testing)
7. [The IPC Pattern — How Pages Talk to the Database](#7-the-ipc-pattern)
8. [Navigation Pattern](#8-navigation-pattern)
9. [Database Guide](#9-database-guide)
10. [How to Add a New Screen](#10-how-to-add-a-new-screen)
11. [Building for Distribution](#11-building-for-distribution)
12. [Troubleshooting](#12-troubleshooting)
13. [IPC Channel Reference](#13-ipc-channel-reference)

---

## 1. Prerequisites

You need **Node.js** installed. Node.js includes **npm** (the package manager).

### Install Node.js on Windows:
1. Go to [https://nodejs.org](https://nodejs.org)
2. Download the **LTS version** (Long-Term Support — more stable)
3. Run the installer, accept all defaults
4. Restart your terminal/command prompt after installing
5. Verify with: `node --version` and `npm --version`

You should see version numbers (e.g., `v20.11.0` and `10.2.0`).

---

## 2. Installation

Open a terminal/command prompt in the project folder and run:

```bash
cd C:\Users\gobli\OneDrive\Documents\UNIVERSITY\GambitProject\asthma-tracker
npm install
```

This downloads all dependencies listed in `package.json` into a `node_modules/` folder.

> **Note:** The first install may take 1-3 minutes as it downloads Electron (~150MB).

### What gets installed:

**Runtime dependencies:**
| Package | Purpose |
|---|---|
| `sql.js` | SQLite compiled to WASM (pure JS, no native rebuild needed) |
| `bcryptjs` | Password hashing |
| `pdfkit` | PDF report generation |
| `chart.js` | Charts for PEF trends, zone distribution, and symptom severity |

**Dev dependencies (testing, building, packaging):**
| Package | Purpose |
|---|---|
| `electron` | The desktop app framework |
| `electron-builder` | Packaging into an installer |
| `jest` | Unit test framework |
| `@playwright/test` | End-to-end UI test framework |

---

## 3. Running the App

### Development mode (recommended while building):
```bash
npm start
```
This opens the app window. Reload the window with `Ctrl+R` after making changes.

### Development mode with DevTools open:
```bash
npm run dev
```
This automatically opens the Chrome DevTools panel (Console, Elements, Network tabs).
DevTools are essential for debugging JavaScript errors.

### Keyboard shortcuts in the running app:
- `Ctrl+Shift+I` — Open DevTools (if enabled in main.js)
- `Ctrl+R` — Reload the current page
- `F5` — Also reloads the current page

---

## 4. How Electron Works

Electron is a framework for building **desktop apps using web technologies** (HTML, CSS, JavaScript).
Understanding its two-process architecture is critical to understanding this codebase.

### The Two Processes

```
┌─────────────────────────────────────────┐
│           MAIN PROCESS (main.js)        │
│  • Runs Node.js                         │
│  • Has access to: filesystem, SQLite,   │
│    OS notifications, PDF generation     │
│  • Creates the app window               │
│  • ONE instance runs per app launch     │
└──────────────┬──────────────────────────┘
               │  IPC (Inter-Process Communication)
               │  Messages go through preload.js
┌──────────────▼──────────────────────────┐
│        RENDERER PROCESS (HTML files)    │
│  • Runs in a sandboxed Chrome browser   │
│  • Has access to: DOM, CSS, browser APIs│
│  • Cannot directly access Node.js       │
│  • ONE renderer per loaded HTML file    │
└─────────────────────────────────────────┘
```

### Why two processes?
Security. If a renderer could run Node.js directly, a malicious script in an HTML
file could access your entire filesystem. The sandbox prevents this.

### How they communicate: IPC

When an HTML page needs database data, it sends a message to the main process
and waits for a reply. This is called IPC (Inter-Process Communication).

In code:
```
HTML page:
  const data = await window.electronAPI.getMedications(childId);

preload.js (defines window.electronAPI):
  getMedications: (childId) => ipcRenderer.invoke('medications:get-all', childId)

main.js (listens for messages):
  ipcMain.handle('medications:get-all', (event, childId) => {
    return queries.getMedicationsByChild(childId);
  });

queries.js (runs the SQL):
  getMedicationsByChild: (childId) => {
    return db.prepare('SELECT * FROM Medications WHERE child_id = ?').all(childId);
  }
```

### preload.js — The Security Bridge

`preload.js` runs with Node.js privileges but in the renderer context.
It uses `contextBridge.exposeInMainWorld('electronAPI', {...})` to expose
a controlled set of functions to HTML pages.

HTML pages can ONLY call what's listed in preload.js — nothing else.

---

## 5. Project Structure

```
asthma-tracker/
├── main.js              ← ENTRY POINT. Main process. All IPC handlers.
├── preload.js           ← Defines window.electronAPI for all HTML pages.
├── package.json         ← Dependencies and npm scripts.
├── asthma_tracker.db    ← SQLite database (auto-created on first run).
├── playwright.config.js ← Playwright UI test configuration.
│
├── src/
│   ├── database/
│   │   ├── db.js        ← Opens SQLite connection, runs schema on startup.
│   │   ├── schema.sql   ← 13 table definitions. Run once at startup.
│   │   └── queries.js   ← Every SQL query in the app, grouped by table.
│   │
│   ├── auth/            ← Landing, Sign Up, Log In, Onboarding screens.
│   ├── parent/          ← 18 screens for the Parent role.
│   ├── provider/        ← 2 screens for the Provider role.
│   ├── child/           ← 5 screens for the Child role.
│   ├── shared/          ← Settings and Emergency (used by all roles).
│   └── styles/
│       ├── global.css   ← Design system (colours, buttons, forms, etc.).
│       ├── auth.css     ← Auth screen styles.
│       ├── parent.css   ← Parent screen styles.
│       ├── provider.css ← Provider screen styles.
│       └── child.css    ← Child screen styles.
│
├── tests/                      ← All test files (Jest unit tests).
│   ├── __helpers__/
│   │   ├── db-setup.js         ← In-memory SQLite fixture for tests.
│   │   └── renderer-setup.js   ← jsdom helpers for renderer (browser-side) tests.
│   │
│   ├── — Backend / logic tests (run in Node.js) ——————————————————
│   ├── auth-validation.test.js      ← Signup/login form validation + bcrypt.
│   ├── queries.test.js              ← CRUD for all 13 DB tables.
│   ├── business-logic.test.js       ← Zones, adherence, badges, breathing.
│   ├── emergency.test.js            ← Emergency triage step logic.
│   ├── rate-limiting.test.js        ← Login rate limiting / lockout.
│   ├── navigation-session.test.js   ← Route map, session, nav data.
│   ├── authorization.test.js        ← requireAuth, isParentOfChild, canAccessChild.
│   ├── notification-scheduler.test.js ← Notification dedup, expiry, low dose.
│   ├── input-validation.test.js     ← Server-side IPC input validation.
│   ├── pdf-generation.test.js       ← PDF report output for all data combos.
│   ├── provider-access.test.js      ← Access codes, activation, sharing.
│   ├── db-coverage.test.js          ← Database layer edge cases (pragma, WAL, migrations).
│   ├── main-ipc.test.js             ← All 50+ IPC handlers in main.js.
│   │
│   ├── — Renderer tests (run in jsdom, simulate the browser) ———————
│   ├── renderer-auth.test.js        ← landing.js, login.js, signup.js, onboarding.js.
│   ├── renderer-shared.test.js      ← toast.js, session-guard.js, settings.js, emergency.js.
│   ├── renderer-child.test.js       ← child/main.js, badges.js, check-zone.js,
│   │                                   inhaler-technique.js, take-medication.js.
│   ├── renderer-parent-a.test.js    ← parent/main.js, add-child.js, add-badges.js,
│   │                                   child-overview.js, controller-schedule.js,
│   │                                   adherence-report.js, daily-checkin.js,
│   │                                   enter-pef.js, family.js.
│   ├── renderer-parent-b.test.js    ← set-personal-best.js, todays-zone.js,
│   │                                   new-medication.js, provider-sharing.js,
│   │                                   notifications.js, medication-inventory.js,
│   │                                   medication-logs.js, incident-logs.js,
│   │                                   pdf-report.js.
│   ├── renderer-provider.test.js    ← provider/main.js, patient-view.js.
│   │
│   └── ui/                     ← Playwright end-to-end UI tests.
│       ├── auth.spec.js        ← Auth flow UI tests.
│       ├── parent.spec.js      ← Parent feature UI tests.
│       ├── child.spec.js       ← Child feature UI tests.
│       ├── provider.spec.js    ← Provider feature UI tests.
│       └── emergency.spec.js   ← Emergency triage UI tests.
│
├── assets/
│   ├── icons/           ← App icon (needs real .ico/.icns/.png for builds).
│   └── videos/          ← Video placeholders for inhaler instruction videos.
│
└── README.md            ← This file.
```

### File naming convention:
Every screen has a pair of files:
- `screen-name.html` — The layout and HTML elements
- `screen-name.js`  — The JavaScript logic for that screen

The HTML loads the JS at the bottom: `<script src="screen-name.js" defer></script>`

---

## 6. Testing

The project uses **Jest** for unit tests and **Playwright** for end-to-end UI tests. Unit tests run against isolated in-memory SQLite databases (or jsdom for renderer files), so they never touch your real data.

### Running all unit tests:
```bash
npm test
```
Runs all 19 test suites (1,477 tests) and reports pass/fail.

### Running tests in watch mode (re-runs on file changes):
```bash
npm run test:watch
```

### Running tests with coverage report:
```bash
npm run test:coverage
```
This outputs a summary to the terminal and generates an HTML report in `coverage/`.
Current coverage: **~92% statements, ~94% lines** across all source files.

### Running a single test suite:

Each area of the application has its own dedicated test suite. Use these scripts to run tests for a specific component without waiting for the full suite:

```bash
# Backend / logic tests
npm run test:auth            # Signup/login validation and bcrypt hashing
npm run test:queries         # Database CRUD operations (all 13 tables)
npm run test:business        # Business logic (zones, adherence, badges, breathing)
npm run test:emergency       # Emergency triage step logic
npm run test:ratelimit       # Login rate limiting and lockout
npm run test:navigation      # Route map, session state, navigation data
npm run test:authorization   # Role-based access control (requireAuth, canAccessChild)
npm run test:notifications   # Notification scheduler, dedup, expiry/low-dose alerts
npm run test:validation      # Server-side input validation for all IPC handlers
npm run test:pdf             # PDF report generation with various data combinations
npm run test:provider        # Provider access codes, activation, sharing settings

# Or run individual files directly
npx jest tests/renderer-auth.test.js        # Auth screen renderer tests
npx jest tests/renderer-shared.test.js      # Shared screens (toast, session guard, emergency)
npx jest tests/renderer-child.test.js       # Child screens
npx jest tests/renderer-parent-a.test.js    # Parent screens (part A)
npx jest tests/renderer-parent-b.test.js    # Parent screens (part B)
npx jest tests/renderer-provider.test.js    # Provider screens
npx jest tests/main-ipc.test.js             # Main process IPC handlers
npx jest tests/db-coverage.test.js          # Database layer edge cases
```

### Running UI (end-to-end) tests:

UI tests use Playwright and launch the full Electron app. They require the app to be built first.

```bash
npm run test:ui              # Run all Playwright tests (headless)
npm run test:ui:headed       # Run with a visible browser window (for debugging)
npm run test:ui:report       # Open the last Playwright HTML test report
```

### Running everything (unit + UI):
```bash
npm run test:all
```

### Test architecture:

```
Unit Tests (Jest)                         UI Tests (Playwright)
──────────────────────────────────────    ────────────────────
Backend tests  → run in Node.js           Launch the full Electron app
Renderer tests → run in jsdom             Use the real database
Use in-memory SQLite / mock APIs          Test user-facing workflows
1,477 tests, ~19 suites, ~92% coverage   Tests signup, navigation, forms
No Electron required                      Requires app to be running
```

**Two types of Jest tests:**
- **Backend tests** test `main.js`, `queries.js`, `db.js`, and all IPC handler logic in a pure Node.js environment with mocked Electron APIs.
- **Renderer tests** use `jest-environment-jsdom` to simulate a browser environment, mount the DOM elements each page expects, and exercise the page's JavaScript directly — without Electron or a real browser.

### Unit test suites and what they cover:

**Backend tests (Node.js environment):**

| Test Suite | File | What It Tests |
|---|---|---|
| Auth Validation | `auth-validation.test.js` | Email/username/password validation, bcrypt hashing, signup duplicates, login success/failure |
| Database Queries | `queries.test.js` | All 13 database tables: Users, Children, Medications, Controller_Schedule, Daily_Checkins, PEF_Entries, Medication_Logs, Incident_Reports, Badges, Inhaler_Technique_Sessions, Provider_Access, Notifications, App_Settings |
| Business Logic | `business-logic.test.js` | PEF zone calculation, access code format, medication expiry thresholds, low dose detection, adherence calculation, badge criteria, breathing decline alerts |
| Emergency | `emergency.test.js` | Event log building, danger sign detection, guidance selection, dose counting, timer logic, symptom worsening |
| Rate Limiting | `rate-limiting.test.js` | Failed attempt tracking, 5-attempt lockout, 15-minute cooldown, case insensitivity, lockout reset |
| Navigation & Session | `navigation-session.test.js` | Route map completeness, all HTML files exist, session state (login/logout/roles), navigation data read-once semantics |
| Authorization | `authorization.test.js` | `requireAuth` blocks unauthenticated users, `isParentOfChild` ownership checks, `canAccessChild` for parent/child/provider roles |
| Notifications | `notification-scheduler.test.js` | Deduplication (same notification within 60 min), expiry threshold alerts (1 day/2 days/1 week/1 month), low dose alerts, scheduled check loop |
| Input Validation | `input-validation.test.js` | Server-side validation for signup, login, add-child, set-personal-best, update-child, and date range parameters |
| PDF Generation | `pdf-generation.test.js` | PDF output with full/empty/partial data, file format verification, edge cases (0% adherence, null fields, empty schedules) |
| Provider Access | `provider-access.test.js` | Crypto access code generation, 48-hour expiry, provider activation, sharing settings, end-to-end parent-to-provider workflow |
| Database Coverage | `db-coverage.test.js` | WAL pragma, database close, saveSync, auto-save flush, transactions, migration runner edge cases |
| Main IPC Handlers | `main-ipc.test.js` | All 50+ IPC channels in main.js: auth, children, medications, check-ins, PEF, schedules, incidents, badges, technique sessions, provider sharing, notifications, PDF generation, settings |

**Renderer tests (jsdom environment — simulates the browser):**

| Test Suite | File | What It Tests |
|---|---|---|
| Auth Screens | `renderer-auth.test.js` | landing.js (session redirect, buttons), login.js (form submit, error states, role routing), signup.js (validation, password strength, role selection), onboarding.js (slides, navigation, completion) |
| Shared Screens | `renderer-shared.test.js` | toast.js (showToast, showConfirm, dismiss, XSS escaping), session-guard.js (periodic checks, expiry redirect), settings.js (account info, logout, notification status), emergency.js (all 5 steps, timer, danger sign detection, save & finish) |
| Child Screens | `renderer-child.test.js` | child/main.js (zone badge, nav), badges.js (grid render, achievement state), check-zone.js (zone circle, PEF history), inhaler-technique.js (step navigation, countdown timers, video modal controls), take-medication.js (medication picker, dose logging, breathing decline) |
| Parent Screens A | `renderer-parent-a.test.js` | parent/main.js (child selector, notification badge, polling), add-child.js (form validation, icon picker), add-badges.js (criteria hints, form submit), child-overview.js, controller-schedule.js, adherence-report.js, daily-checkin.js, enter-pef.js, family.js (child cards, login modal, edit form) |
| Parent Screens B | `renderer-parent-b.test.js` | set-personal-best.js, todays-zone.js, new-medication.js, provider-sharing.js (access code, sharing toggles), notifications.js (list, mark read/all), medication-inventory.js (filter, toggle active), medication-logs.js, incident-logs.js, pdf-report.js |
| Provider Screens | `renderer-provider.test.js` | provider/main.js (patient list, add patient), patient-view.js (tab switching, sharing settings, chart rendering) |

### Writing new tests:

**Backend test (Node.js):**
1. Create `tests/my-feature.test.js`
2. Import the database helper if needed:
   ```javascript
   const { createTestDb } = require('./__helpers__/db-setup');
   const { queries } = createTestDb();  // fresh in-memory DB per test
   ```

**Renderer test (jsdom — for a browser-side `.js` file):**
1. Create `tests/renderer-my-screen.test.js` with the jsdom docblock:
   ```javascript
   /**
    * @jest-environment jsdom
    */
   const { createMockElectronAPI, setupDOM, fireDOMContentLoaded,
           flushPromises, setupGlobals, cleanupDOM } = require('./__helpers__/renderer-setup');
   ```
2. Follow the pattern: `cleanupDOM()` → `setupGlobals()` → set `window.electronAPI` → `setupDOM([...])` → `require('../src/...')` → `fireDOMContentLoaded()` → `await flushPromises()`
3. If using `jest.useFakeTimers()`, replace `await flushPromises()` with `await jest.advanceTimersByTimeAsync(0)` to avoid hangs

**Both types:**
```bash
# Add a dedicated npm script in package.json (optional)
"test:myfeature": "jest --testPathPatterns=tests/my-feature --forceExit"

# Or run directly
npx jest tests/my-file.test.js
npm test   # run everything
```

---

## 7. The IPC Pattern

Every piece of data the HTML pages need comes through this pattern.
All 4 files must be updated when adding new functionality:

```
1. HTML/JS (renderer)   calls:   window.electronAPI.functionName(args)
                                     ↓
2. preload.js           sends:   ipcRenderer.invoke('channel:name', args)
                                     ↓
3. main.js              handles: ipcMain.handle('channel:name', (e, args) => ...)
                                     ↓
4. queries.js           runs:    db.prepare('SQL...').get(args)
```

### Channel naming convention:
`domain:action` — e.g., `medications:get-all`, `auth:login`, `pef:calculate-zone`

### invoke vs send:
- `ipcRenderer.invoke` → Returns a value (use for data fetching and actions that need results)
- `ipcRenderer.send` → Fire and forget (use for navigation)

---

## 8. Navigation Pattern

HTML pages **never** use `window.location.href` or `<a href="...">`.

Instead they call:
```javascript
window.electronAPI.navigate('screen-name');
// OR with data for the next screen:
window.electronAPI.navigate('screen-name', { childId: 5 });
```

The route map in `main.js` maps screen names to HTML file paths.
The next page retrieves the passed data with:
```javascript
const data = await window.electronAPI.getNavigationData();
```

### Session state:
The current user is stored in `currentSession` inside `main.js`.
Every page retrieves it on load:
```javascript
const session = await window.electronAPI.getSession();
// session = { userId, childId, username, role }
```
If `session.userId` is null and `session.childId` is null → user is not logged in.

---

## 9. Database Guide

### File location:
`asthma_tracker.db` — in the project root folder.
Created automatically on first run. Binary format (not human-readable as text).

### View the database with a GUI:
Install **DB Browser for SQLite** (free): [https://sqlitebrowser.org](https://sqlitebrowser.org)
Open `asthma_tracker.db` to browse tables, run queries, and inspect data.

### Reset the database (development only):
```bash
# Windows
del asthma_tracker.db
npm start    # Creates fresh database

# Mac/Linux
rm asthma_tracker.db
npm start
```
⚠️ This deletes ALL data permanently.

### Schema changes:
1. Edit `src/database/schema.sql`
2. Delete `asthma_tracker.db`
3. Restart with `npm start` — new schema is applied automatically

For production, write a migration script instead of deleting the database.

### Enable SQL query logging (for debugging):
In `src/database/db.js`, uncomment this line:
```javascript
// verbose: console.log
```
Every SQL query will print to the terminal. Comment it out before shipping.

### The 13 tables:
| Table | Purpose |
|---|---|
| `Users` | Parent and Provider accounts |
| `Children` | Child profiles (belong to a parent) |
| `Medications` | Medications for each child |
| `Controller_Schedule` | Which days child takes controller medication |
| `Daily_Checkins` | Symptom severity and trigger records |
| `PEF_Entries` | Peak flow readings |
| `Medication_Logs` | Records of doses taken |
| `Incident_Reports` | Emergency triage records |
| `Badges` | Achievement badges for children |
| `Inhaler_Technique_Sessions` | Completed tutorial records |
| `Provider_Access` | Provider-patient links with sharing settings |
| `Notifications` | Notification history (last 2 weeks) |
| `App_Settings` | Key-value store for persistent app settings |

---

## 10. How to Add a New Screen

Follow this checklist every time:

### Step 1: Create the HTML file
```
src/parent/my-screen.html   (or /provider/ or /child/ or /shared/)
```
Copy the structure from an existing HTML file. Always include:
- `<link rel="stylesheet" href="../styles/global.css">`
- `<link rel="stylesheet" href="../styles/parent.css">` (or relevant role CSS)
- `<script src="my-screen.js" defer></script>` at the bottom of body

### Step 2: Create the JS file
```
src/parent/my-screen.js
```
Always start with this pattern:
```javascript
async function initializePage() {
  const session = await window.electronAPI.getSession();
  if (!session || !session.userId) {
    window.electronAPI.navigate('landing');  // Redirect if not logged in
    return;
  }
  // ... rest of initialization
}
document.addEventListener('DOMContentLoaded', initializePage);
```

### Step 3: Add the route to main.js
In the `routes` object in `main.js`:
```javascript
'parent-my-screen': 'src/parent/my-screen.html',
```

### Step 4: Add new IPC handlers to main.js (if needed)
```javascript
ipcMain.handle('my-feature:do-something', (event, data) => {
  return queries.myNewQuery(data);
});
```

### Step 5: Add API exposure to preload.js (if needed)
```javascript
myNewFunction: (data) => ipcRenderer.invoke('my-feature:do-something', data),
```

### Step 6: Add SQL queries to queries.js (if needed)
```javascript
myNewQuery: (data) => {
  return db.prepare('SELECT * FROM MyTable WHERE id = ?').all(data.id);
},
```

### Step 7: Add navigation links from other screens
```javascript
window.electronAPI.navigate('parent-my-screen', { childId: currentChildId });
```

---

## 11. Building for Distribution

### Build commands:
```bash
npm run build:win    # Creates installer in dist/ folder
npm run build:mac    # Must run on a Mac
npm run build:linux  # Creates AppImage
```

### What the build produces (Windows):
`dist/Asthma Tracker Setup 1.0.0.exe` — NSIS installer ready to share.

### Icons required for builds:
Replace the placeholder files in `assets/icons/` with:
- `app-icon.ico` — Windows (256x256 pixels)
- `app-icon.icns` — macOS
- `app-icon.png` — Linux (512x512 pixels)

Free tool to convert PNG to ICO: [https://icoconvert.com](https://icoconvert.com)

### Before shipping:
- Comment out `verbose: console.log` in `db.js`
- Ensure `--dev` flag doesn't auto-open DevTools in production (check `main.js`)
- Test on a clean machine with no Node.js installed

---

## 12. Troubleshooting

### "Cannot find module 'sql.js'" or other missing module errors
Run `npm install` — dependencies haven't been installed yet.

### App opens but shows a blank white screen
1. Open DevTools (`Ctrl+Shift+I`)
2. Check the **Console** tab for red error messages
3. Most common cause: syntax error or missing file in the page's `.js` file
4. Check that the HTML file's `<script>` tag path is correct

### "window.electronAPI is undefined"
- The page is missing a `preload.js` reference, OR
- `nodeIntegration: true` was accidentally set in main.js (should be `false`)
- Check `mainWindow.webPreferences.preload` points to the correct path

### "Cannot read properties of undefined" on page load
- `getSession()` returned null (user not logged in, or session cleared)
- Make sure every page calls `getSession()` inside `initializePage()` before using session data
- Make sure there's a redirect to 'landing' if session is empty

### Database error: "UNIQUE constraint failed"
- Trying to insert a duplicate row
- For check-ins and PEF: both use `ON CONFLICT ... DO UPDATE` (upsert) — should be automatic
- For other tables: check if the record already exists before inserting

### Notifications not appearing
- Check OS notification settings — Windows requires app to be in the notification allowlist
- In development, notifications need the app to have focus on some systems
- Test notification support: add `console.log(Notification.isSupported())` in main.js

### PDF opens but is empty or garbled
- Make sure the data passed to `generatePdf()` is not null/undefined
- Check the terminal for PDFKit errors
- Verify `result.filePath` is a valid writable path

### Navigation doesn't work / blank page after navigate
- Check the `routes` object in `main.js` — is the screen name spelled exactly right?
- The route key is case-sensitive

---

## 13. IPC Channel Reference

All functions available on `window.electronAPI` and their backend channels:

| Function | Channel | Description |
|---|---|---|
| `navigate(screen, data)` | `navigate` | Load a new HTML page |
| `getNavigationData()` | `navigate:get-data` | Get data from previous page |
| `getSession()` | `auth:get-session` | Get current user session |
| `logout()` | `auth:logout` | Clear session, go to landing |
| `signup(data)` | `auth:signup` | Create new parent/provider account |
| `login(data)` | `auth:login` | Log in as parent/provider |
| `childLogin(data)` | `auth:child-login` | Log in as child |
| `completeOnboarding()` | `auth:complete-onboarding` | Mark onboarding done |
| `getChildren()` | `children:get-all` | All children for current parent |
| `getChild(id)` | `children:get-one` | Single child by ID |
| `addChild(data)` | `children:add` | Create new child profile |
| `setPersonalBest(data)` | `children:set-personal-best` | Update child's personal best PEF |
| `getMedications(childId)` | `medications:get-all` | Child's medications |
| `getAllMedications()` | `medications:get-all-parent` | All medications (across children) |
| `getMedication(id)` | `medications:get-one` | Single medication |
| `addMedication(data)` | `medications:add` | Create medication |
| `updateMedication(data)` | `medications:update` | Edit medication |
| `logMedication(data)` | `medications:log` | Record dose taken |
| `getMedicationLogs(data)` | `medications:get-logs` | Medication history |
| `submitCheckin(data)` | `checkins:submit` | Save/update daily check-in |
| `getTodaysCheckin(childId)` | `checkins:get-today` | Today's check-in for pre-fill |
| `getCheckinHistory(data)` | `checkins:get-history` | Check-in history for chart |
| `submitPef(data)` | `pef:submit` | Save/update PEF entry |
| `getPefHistory(data)` | `pef:get-history` | PEF history for chart |
| `calculateZone(childId)` | `pef:calculate-zone` | Calculate today's zone |
| `getControllerSchedule(id)` | `schedule:get` | Get schedule |
| `updateControllerSchedule(data)` | `schedule:update` | Save schedule |
| `getMedicationAdherence(id)` | `schedule:adherence` | 30-day adherence % |
| `createIncident(data)` | `incidents:create` | Save triage report |
| `getIncidents(childId)` | `incidents:get-all` | All incidents for child |
| `getAllIncidents()` | `incidents:get-all-parent` | All incidents (all children) |
| `createBadge(data)` | `badges:create` | Create badge |
| `getBadges(childId)` | `badges:get-all` | All badges (checks criteria) |
| `recordTechniqueSession(data)` | `technique:record` | Log technique session |
| `generateAccessCode(data)` | `provider:generate-access-code` | Generate provider code |
| `updateSharingSettings(data)` | `provider:update-sharing` | Update sharing toggles |
| `activateAccessCode(code)` | `provider:activate-access` | Provider uses code |
| `getProviderPatients()` | `provider:get-patients` | All provider's patients |
| `getSharingSettings(data)` | `provider:get-sharing` | Sharing settings for pair |
| `getNotifications()` | `notifications:get-all` | All notifications |
| `markNotificationRead(id)` | `notifications:mark-read` | Mark one as read |
| `markAllNotificationsRead()` | `notifications:mark-all-read` | Mark all as read |
| `generatePdf(data)` | `pdf:generate` | Generate and save PDF |

---

## Quick Start Checklist

After running `npm install` and `npm start`:

1. ✅ Click **Sign Up** → Create a **Parent** account
2. ✅ Complete the onboarding slides
3. ✅ Click **Add Child** → Fill in name, birthday, username, password
4. ✅ Click **Medication Inventory** → **+ Add New** → Add a rescue inhaler
5. ✅ Click **Set Personal Best** → Enter a PEF value (e.g. 350)
6. ✅ Click **Daily Check-in** → Fill in symptoms and save
7. ✅ Click **Enter PEF** → Enter a reading
8. ✅ Click **Today's Zone** → See green/yellow/red circle
9. ✅ Click **Family** → **Log In as Child** (enter child's password)
10. ✅ From child home → Try **Inhaler Technique** and **Check My Zone**
11. ✅ Sign up a **Provider** account → Use the access code from Family page
