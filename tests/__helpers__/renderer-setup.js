/**
 * renderer-setup.js — Shared test helpers for renderer (browser-side) JS files
 *
 * Provides:
 *   - createMockElectronAPI()  — returns a mock window.electronAPI with all methods
 *   - setupDOM(elementIds)     — creates DOM elements by ID
 *   - fireDOMContentLoaded()   — triggers the DOMContentLoaded event
 *   - loadRenderer(filePath)   — require() a renderer file in a jsdom-safe way
 */

/**
 * Build a mock electronAPI object with jest.fn() stubs for every method
 * used across all renderer files.
 */
function createMockElectronAPI(overrides = {}) {
  const api = {
    // Navigation
    navigate: jest.fn(),
    getNavigationData: jest.fn().mockResolvedValue(null),

    // Auth
    getSession: jest.fn().mockResolvedValue({ userId: 1, childId: null, username: 'testparent', role: 'parent' }),
    logout: jest.fn().mockResolvedValue(),
    signup: jest.fn().mockResolvedValue({ success: true }),
    login: jest.fn().mockResolvedValue({ success: true, user: { role: 'parent' } }),
    childLogin: jest.fn().mockResolvedValue({ success: true }),
    completeOnboarding: jest.fn().mockResolvedValue(),

    // Children
    getChildren: jest.fn().mockResolvedValue([]),
    getChild: jest.fn().mockResolvedValue(null),
    addChild: jest.fn().mockResolvedValue({ success: true }),
    updateChild: jest.fn().mockResolvedValue({ success: true }),
    setPersonalBest: jest.fn().mockResolvedValue({ success: true }),

    // Medications
    getMedications: jest.fn().mockResolvedValue([]),
    getAllMedications: jest.fn().mockResolvedValue([]),
    getMedication: jest.fn().mockResolvedValue(null),
    addMedication: jest.fn().mockResolvedValue({ success: true }),
    updateMedication: jest.fn().mockResolvedValue({ success: true }),
    setMedicationActive: jest.fn().mockResolvedValue({ success: true }),
    logMedication: jest.fn().mockResolvedValue({ success: true, breathingDeclined: false }),

    // Check-ins
    submitCheckin: jest.fn().mockResolvedValue({ success: true }),
    getTodaysCheckin: jest.fn().mockResolvedValue(null),
    getCheckinHistory: jest.fn().mockResolvedValue([]),

    // PEF
    submitPef: jest.fn().mockResolvedValue({ success: true }),
    getPefHistory: jest.fn().mockResolvedValue([]),
    calculateZone: jest.fn().mockResolvedValue({ zone: 'green', percentage: 95 }),

    // Schedule
    getControllerSchedule: jest.fn().mockResolvedValue(null),
    updateControllerSchedule: jest.fn().mockResolvedValue({ success: true }),
    getMedicationAdherence: jest.fn().mockResolvedValue({ daysPlanned: 30, daysCompleted: 25, percentage: 83 }),

    // Incidents
    emergencyStarted: jest.fn().mockResolvedValue(),
    createIncident: jest.fn().mockResolvedValue({ success: true }),
    getIncidents: jest.fn().mockResolvedValue([]),
    getAllIncidents: jest.fn().mockResolvedValue([]),

    // Badges
    createBadge: jest.fn().mockResolvedValue({ success: true }),
    getBadges: jest.fn().mockResolvedValue([]),
    setBadgeActive: jest.fn().mockResolvedValue({ success: true }),

    // Technique
    recordTechniqueSession: jest.fn().mockResolvedValue({ success: true }),
    countTechniqueSessions: jest.fn().mockResolvedValue(0),

    // Provider
    generateAccessCode: jest.fn().mockResolvedValue({ success: true, code: 'ABCD1234', expiresAt: '2026-04-01' }),
    updateSharingSettings: jest.fn().mockResolvedValue({ success: true }),
    activateAccessCode: jest.fn().mockResolvedValue({ success: true }),
    getProviderPatients: jest.fn().mockResolvedValue([]),
    getSharingSettings: jest.fn().mockResolvedValue(null),

    // Notifications
    getNotifications: jest.fn().mockResolvedValue([]),
    markNotificationRead: jest.fn().mockResolvedValue({ success: true }),
    markAllNotificationsRead: jest.fn().mockResolvedValue({ success: true }),

    // PDF
    generatePdf: jest.fn().mockResolvedValue({ success: true }),

    // Settings
    getSetting: jest.fn().mockResolvedValue(null),
    setSetting: jest.fn().mockResolvedValue(),

    // Medication logs
    getMedicationLogs: jest.fn().mockResolvedValue([]),
  };

  // Apply overrides
  Object.assign(api, overrides);
  return api;
}

/**
 * Create DOM elements by ID. Accepts an array of { tag, id, type?, className?, innerHTML? } descriptors,
 * or just strings (creates a <div> with that id).
 */
function setupDOM(elements) {
  for (const el of elements) {
    if (typeof el === 'string') {
      const div = document.createElement('div');
      div.id = el;
      document.body.appendChild(div);
    } else {
      const node = document.createElement(el.tag || 'div');
      if (el.id) node.id = el.id;
      if (el.type) node.type = el.type;
      if (el.className) node.className = el.className;
      if (el.innerHTML) node.innerHTML = el.innerHTML;
      if (el.value !== undefined) node.value = el.value;
      if (el.tag === 'select' && !el.innerHTML) {
        node.innerHTML = '<option value="">—</option>';
      }
      document.body.appendChild(node);
    }
  }
}

/**
 * Dispatch DOMContentLoaded event on document.
 */
function fireDOMContentLoaded() {
  const event = new Event('DOMContentLoaded', { bubbles: true, cancelable: false });
  document.dispatchEvent(event);
}

/**
 * Flush all pending microtasks / promises.
 */
async function flushPromises() {
  // Use a real setTimeout to let promises resolve
  await new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Set up window globals that renderer files expect (showToast, showConfirm, showSuccess).
 */
function setupGlobals() {
  window.showToast = jest.fn();
  window.showConfirm = jest.fn().mockResolvedValue(true);
  window.showSuccess = jest.fn();
}

/**
 * Track document event listeners so we can remove them between test groups.
 * This prevents DOMContentLoaded handlers from module A leaking into module B tests.
 */
let _trackedListeners = [];
let _interceptInstalled = false;
const _origAddEventListener = typeof Document !== 'undefined'
  ? Document.prototype.addEventListener
  : null;

function _installListenerIntercept() {
  if (_interceptInstalled || !_origAddEventListener) return;
  _interceptInstalled = true;
  Document.prototype.addEventListener = function (type, handler, options) {
    _trackedListeners.push({ target: this, type, handler, options });
    return _origAddEventListener.call(this, type, handler, options);
  };
}

function _removeTrackedListeners() {
  for (const { target, type, handler, options } of _trackedListeners) {
    try { target.removeEventListener(type, handler, options); } catch (_) { /* ignore */ }
  }
  _trackedListeners = [];
}

/**
 * Clean up after a renderer test.
 */
function cleanupDOM() {
  _removeTrackedListeners();
  document.body.innerHTML = '';
  document.title = '';
  jest.restoreAllMocks();
  _installListenerIntercept();     // ensure intercept is active for next beforeEach
}

module.exports = {
  createMockElectronAPI,
  setupDOM,
  fireDOMContentLoaded,
  flushPromises,
  setupGlobals,
  cleanupDOM
};
