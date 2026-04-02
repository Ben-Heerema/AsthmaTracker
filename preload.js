/**
 * preload.js — The Security Bridge Between Main and Renderer
 *
 * WHAT THIS FILE DOES:
 * This file runs in a special context: it has access to Node.js (like main.js),
 * but it runs INSIDE the renderer process (like the HTML pages).
 *
 * Its only job is to define what functions the HTML pages can call.
 * It uses contextBridge.exposeInMainWorld() to safely expose specific
 * functions from Node.js to the browser-side HTML/JS.
 *
 * SECURITY:
 * By exposing only specific functions (not all of Node.js), we prevent
 * web content from having unrestricted access to the filesystem or OS.
 * Even if a malicious script ran in the renderer, it could only call
 * the specific functions we expose here.
 *
 * HOW TO READ THIS FILE:
 * Every entry in the electronAPI object follows this pattern:
 *
 *   functionName: (args) => ipcRenderer.invoke('channel:name', args)
 *
 * - 'invoke' sends a message to main.js and waits for a response (async)
 * - 'send' sends a message to main.js with no response expected (fire-and-forget)
 * - The channel name must match a 'ipcMain.handle(...)' call in main.js
 *
 * IN HTML/JS FILES, you call these like:
 *   const result = await window.electronAPI.login(credentials);
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose all app functions to the renderer process under window.electronAPI
contextBridge.exposeInMainWorld('electronAPI', {

  // ===========================================================================
  // NAVIGATION
  // ===========================================================================

  /**
   * Navigate to a named screen.
   * @param {string} screenName - Must match a key in the routes object in main.js
   * @param {any} [data] - Optional data to pass to the next screen
   * Example: window.electronAPI.navigate('parent-main')
   * Example: window.electronAPI.navigate('parent-new-medication', { medicationId: 5 })
   */
  navigate: (screenName, data) => ipcRenderer.send('navigate', screenName, data),

  /**
   * Get data passed from the previous screen during navigation.
   * @returns {any} The data passed to navigate(), or null
   * Example: const data = await window.electronAPI.getNavigationData()
   */
  getNavigationData: () => ipcRenderer.invoke('navigate:get-data'),

  // ===========================================================================
  // AUTHENTICATION
  // ===========================================================================

  /**
   * Get the current session (who is logged in).
   * @returns {{ userId, childId, username, role } | null}
   * Example: const session = await window.electronAPI.getSession()
   */
  getSession: () => ipcRenderer.invoke('auth:get-session'),

  /**
   * Log out the current user and return to the landing page.
   * Example: await window.electronAPI.logout()
   */
  logout: () => ipcRenderer.invoke('auth:logout'),

  /**
   * Sign up a new parent or provider account.
   * @param {{ email, username, password, role }} data
   * @returns {{ success: boolean, user?, error? }}
   */
  signup: (data) => ipcRenderer.invoke('auth:signup', data),

  /**
   * Log in an existing parent or provider.
   * @param {{ usernameOrEmail, password }} data
   * @returns {{ success: boolean, user?, error? }}
   */
  login: (data) => ipcRenderer.invoke('auth:login', data),

  /**
   * Log in as a child (children are in a separate table).
   * @param {{ username, password }} data
   * @returns {{ success: boolean, child?, error? }}
   */
  childLogin: (data) => ipcRenderer.invoke('auth:child-login', data),

  /**
   * Mark the onboarding tutorial as complete for the current user.
   */
  completeOnboarding: () => ipcRenderer.invoke('auth:complete-onboarding'),

  // ===========================================================================
  // CHILDREN MANAGEMENT (Parent role)
  // ===========================================================================

  /**
   * Get all children belonging to the current parent.
   * @returns {Array<{child_id, name, birthday, personal_best_pef, ...}>}
   */
  getChildren: () => ipcRenderer.invoke('children:get-all'),

  /**
   * Get a single child by their ID.
   * @param {number} childId
   * @returns {{ child_id, name, birthday, personal_best_pef, notes, ... }}
   */
  getChild: (childId) => ipcRenderer.invoke('children:get-one', childId),

  /**
   * Add a new child under the current parent.
   * @param {{ username, password, name, birthday, notes }} data
   * @returns {{ success: boolean, child?, error? }}
   */
  addChild: (data) => ipcRenderer.invoke('children:add', data),

  /**
   * Update a child's personal best PEF value.
   * @param {{ childId, personalBestPef }} data
   * @returns {{ success: boolean }}
   */
  setPersonalBest: (data) => ipcRenderer.invoke('children:set-personal-best', data),

  /**
   * Update a child's profile (name, birthday, notes — not username/password).
   * @param {{ childId, name, birthday, notes }} data
   * @returns {{ success: boolean, error? }}
   */
  updateChild: (data) => ipcRenderer.invoke('children:update', data),

  // ===========================================================================
  // MEDICATIONS
  // ===========================================================================

  /**
   * Get all medications for a specific child.
   * @param {number} childId
   * @returns {Array<medication>}
   */
  getMedications: (childId) => ipcRenderer.invoke('medications:get-all', childId),

  /**
   * Get all medications across all of parent's children (for inventory view).
   * @returns {Array<medication & { child_name }>}
   */
  getAllMedications: (options) => ipcRenderer.invoke('medications:get-all-parent', options),

  /**
   * Get a single medication by ID.
   * @param {number} medicationId
   * @returns {medication}
   */
  getMedication: (medicationId) => ipcRenderer.invoke('medications:get-one', medicationId),

  /**
   * Add a new medication record.
   * @param {{ childId, medicationName, isRescue, purchaseDate, expirationDate, dosesRemaining, notes }} data
   * @returns {{ success: boolean, medication?, error? }}
   */
  addMedication: (data) => ipcRenderer.invoke('medications:add', data),

  /**
   * Update an existing medication (cannot change which child it belongs to).
   * @param {{ medicationId, medicationName, isRescue, purchaseDate, expirationDate, dosesRemaining, notes }} data
   * @returns {{ success: boolean }}
   */
  updateMedication: (data) => ipcRenderer.invoke('medications:update', data),

  /**
   * Toggle a medication's active status (soft-delete / restore).
   * @param {{ medicationId: number, isActive: boolean }} data
   * @returns {{ success: boolean }}
   */
  setMedicationActive: (data) => ipcRenderer.invoke('medications:set-active', data),

  /**
   * Log a medication dose taken by a child.
   * @param {{ childId, medicationId, dosesTaken, breathingBefore, breathingAfter }} data
   * @returns {{ success: boolean, breathingDeclined: boolean }}
   */
  logMedication: (data) => ipcRenderer.invoke('medications:log', data),

  /**
   * Get medication log entries.
   * @param {{ childId?: number, days?: number }} data
   * @returns {Array<log>}
   */
  getMedicationLogs: (data) => ipcRenderer.invoke('medications:get-logs', data),

  // ===========================================================================
  // DAILY CHECK-INS
  // ===========================================================================

  /**
   * Submit or update today's daily check-in.
   * @param {{ childId, nightWaking, activityLimits, coughing, wheezing,
   *           triggerExercise, triggerColdAir, triggerDust, triggerSmoke,
   *           triggerIllness, triggerStrongOdors }} data
   * @returns {{ success: boolean }}
   */
  submitCheckin: (data) => ipcRenderer.invoke('checkins:submit', data),

  /**
   * Get today's check-in data for pre-filling the form.
   * @param {number} childId
   * @returns {checkin | null}
   */
  getTodaysCheckin: (childId) => ipcRenderer.invoke('checkins:get-today', childId),

  /**
   * Get check-in history for symptom chart.
   * @param {{ childId: number, days: number }} data - days = 7, 14, or 30
   * @returns {Array<checkin>}
   */
  getCheckinHistory: (data) => ipcRenderer.invoke('checkins:get-history', data),

  // ===========================================================================
  // PEF ENTRIES (Peak Expiratory Flow)
  // ===========================================================================

  /**
   * Submit or update today's PEF entry.
   * @param {{ childId, dailyPef, preMedPef, postMedPef, isChildSubmission }} data
   * @returns {{ success: boolean }}
   */
  submitPef: (data) => ipcRenderer.invoke('pef:submit', data),

  /**
   * Get PEF history for chart display.
   * @param {{ childId: number, days: number }} data
   * @returns {Array<pef_entry>}
   */
  getPefHistory: (data) => ipcRenderer.invoke('pef:get-history', data),

  /**
   * Calculate the current PEF zone for a child.
   * @param {number} childId
   * @returns {{ zone: 'green'|'yellow'|'red'|'grey', percentage: number|null }}
   */
  calculateZone: (childId) => ipcRenderer.invoke('pef:calculate-zone', childId),

  // ===========================================================================
  // CONTROLLER SCHEDULE
  // ===========================================================================

  /**
   * Get the controller medication schedule for a child.
   * @param {number} childId
   * @returns {{ schedule_id, monday, tuesday, ..., sunday, doses_per_day }}
   */
  getControllerSchedule: (childId) => ipcRenderer.invoke('schedule:get', childId),

  /**
   * Update the controller schedule for a child.
   * @param {{ childId, monday, tuesday, wednesday, thursday, friday, saturday, sunday, dosesPerDay }} data
   * @returns {{ success: boolean }}
   */
  updateControllerSchedule: (data) => ipcRenderer.invoke('schedule:update', data),

  /**
   * Calculate medication adherence for the last 30 days.
   * @param {number} childId
   * @returns {{ daysPlanned, daysCompleted, percentage }}
   */
  getMedicationAdherence: (childId) => ipcRenderer.invoke('schedule:adherence', childId),

  // ===========================================================================
  // INCIDENT REPORTS (Emergency Triage)
  // ===========================================================================

  /**
   * Notify parent that a child has started an emergency triage.
   * Should be called immediately when the emergency page loads for a child user.
   */
  emergencyStarted: () => ipcRenderer.invoke('emergency:started'),

  /**
   * Create a new incident (triage) report.
   * @param {{ childId, canSpeakFullSentences, chestRetracting, blueGreyLips,
   *           currentPef?, userNotes, guidanceProvided, medicationsAdministered? }} data
   * @returns {{ success: boolean, incident?, error? }}
   */
  createIncident: (data) => ipcRenderer.invoke('incidents:create', data),

  /**
   * Get all incident reports for a specific child.
   * @param {number} childId
   * @returns {Array<incident>}
   */
  getIncidents: (childId) => ipcRenderer.invoke('incidents:get-all', childId),

  /**
   * Get all incidents across all of parent's children.
   * @returns {Array<incident & { child_name }>}
   */
  getAllIncidents: () => ipcRenderer.invoke('incidents:get-all-parent'),

  // ===========================================================================
  // BADGES
  // ===========================================================================

  /**
   * Create a new badge for a child.
   * @param {{ childId, badgeName, badgeDescription, criteriaType, criteriaValue }} data
   * @returns {{ success: boolean, badge?, error? }}
   */
  createBadge: (data) => ipcRenderer.invoke('badges:create', data),

  /**
   * Get all badges for a child (and check for newly achieved ones).
   * @param {number} childId
   * @returns {Array<badge>}
   */
  getBadges: (data) => ipcRenderer.invoke('badges:get-all', data),

  /**
   * Toggle a badge's active status (soft-delete / restore).
   * @param {{ badgeId: number, isActive: boolean }} data
   * @returns {{ success: boolean }}
   */
  setBadgeActive: (data) => ipcRenderer.invoke('badges:set-active', data),

  // ===========================================================================
  // INHALER TECHNIQUE SESSIONS
  // ===========================================================================

  /**
   * Record a completed inhaler technique session for the current child.
   * @param {{ sessionType: 'regular'|'mask_spacer' }} data
   * @returns {{ success: boolean }}
   */
  recordTechniqueSession: (data) => ipcRenderer.invoke('technique:record', data),

  /**
   * Count technique sessions for a specific child.
   * @param {number} childId
   * @returns {number}
   */
  countTechniqueSessions: (childId) => ipcRenderer.invoke('technique:count', childId),

  // ===========================================================================
  // PROVIDER ACCESS
  // ===========================================================================

  /**
   * Generate an access code for a provider to access a child's data.
   * @param {{ childId, sharingSettings: { shareRescueLogs, shareControllerAdherence,
   *           shareSymptomsChart, shareTriggers, sharePef, shareTriageIncidents,
   *           shareSummaryCharts } }} data
   * @returns {{ success: boolean, code?, expiresAt?, error? }}
   */
  generateAccessCode: (data) => ipcRenderer.invoke('provider:generate-access-code', data),

  /**
   * Update sharing settings for a provider access record.
   * @param {{ childId, providerId?, ...sharingSettings }} data
   * @returns {{ success: boolean }}
   */
  updateSharingSettings: (data) => ipcRenderer.invoke('provider:update-sharing', data),

  /**
   * Provider enters an access code to link to a patient.
   * @param {string} code - The 8-character access code
   * @returns {{ success: boolean, access?, error? }}
   */
  activateAccessCode: (code) => ipcRenderer.invoke('provider:activate-access', code),

  /**
   * Get all patients (children) the current provider has access to.
   * @returns {Array<{ child_id, name, birthday, parent_email, ... }>}
   */
  getProviderPatients: () => ipcRenderer.invoke('provider:get-patients'),

  /**
   * Get sharing settings between the current provider and a child.
   * @param {{ providerId: number, childId: number }} data
   * @returns {provider_access | null}
   */
  getSharingSettings: (data) => ipcRenderer.invoke('provider:get-sharing', data),

  // ===========================================================================
  // NOTIFICATIONS
  // ===========================================================================

  /**
   * Get all notifications for the current user (last 2 weeks).
   * @returns {Array<notification>}
   */
  getNotifications: () => ipcRenderer.invoke('notifications:get-all'),

  /**
   * Mark a single notification as read.
   * @param {number} notificationId
   * @returns {{ success: boolean }}
   */
  markNotificationRead: (id) => ipcRenderer.invoke('notifications:mark-read', id),

  /**
   * Mark all notifications as read.
   * @returns {{ success: boolean }}
   */
  markAllNotificationsRead: () => ipcRenderer.invoke('notifications:mark-all-read'),

  // ===========================================================================
  // PDF GENERATION
  // ===========================================================================

  /**
   * Generate a PDF report and prompt the user to save it.
   * @param {{
   *   childName: string,
   *   birthday: string,
   *   startDate: string,
   *   endDate: string,
   *   personalBestPef: number|null,
   *   medications: Array<medication>,
   *   schedule: object|null,
   *   checkins: Array<checkin>,
   *   pefHistory: Array<pef_entry>,
   *   pefZoneSummary: { green: number, yellow: number, red: number },
   *   triggers: Array<{ label: string, count: number }>,
   *   rescueLogs: Array<log>,
   *   controllerLogs: Array<log>,
   *   incidents: Array<incident>,
   *   techniqueSessions: number
   * }} data
   * @returns {{ success: boolean, filePath?, canceled?, error? }}
   */
  generatePdf: (data) => ipcRenderer.invoke('pdf:generate', data),

  // ===========================================================================
  // APP SETTINGS (key-value persistence)
  // ===========================================================================

  /**
   * Get a persisted setting by key.
   * @param {string} key
   * @returns {string|null}
   */
  getSetting: (key) => ipcRenderer.invoke('settings:get', key),

  /**
   * Set a persisted setting (key-value).
   * @param {string} key
   * @param {string} value
   */
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value)

});
