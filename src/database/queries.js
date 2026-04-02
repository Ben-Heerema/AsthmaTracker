/**
 * queries.js — All SQL Query Functions
 *
 * This file contains every database operation in the app.
 * main.js imports this file and calls these functions from IPC handlers.
 *
 * ORGANIZATION:
 * Functions are grouped into sections, one per database table.
 * Each function is documented with what it takes and returns.
 *
 * HOW THE DATABASE API WORKS:
 *
 *   db.prepare('SQL here')   → Compiles the SQL into a prepared statement
 *   .get(params)             → Returns ONE row (or undefined if not found)
 *   .all(params)             → Returns ALL matching rows as an array
 *   .run(params)             → Executes (INSERT/UPDATE/DELETE), returns { changes, lastInsertRowid }
 *
 * PREPARED STATEMENTS:
 * Instead of writing SQL like: `SELECT * FROM Users WHERE username = '${name}'`
 * We write:                     `SELECT * FROM Users WHERE username = ?`
 * And pass the value separately: .get(name)
 *
 * This is IMPORTANT for security — it prevents SQL injection attacks where
 * a user could type SQL code into a form field to manipulate the database.
 *
 * NAMED PARAMETERS:
 * Instead of ? (position-based), you can use named params:
 *   db.prepare('INSERT INTO Users (username, email) VALUES (@username, @email)')
 *   .run({ username: 'john', email: 'john@test.com' })
 * This is clearer when there are many parameters.
 */

/**
 * getLocalDateString — Returns a date as YYYY-MM-DD in the local timezone.
 * Using toISOString() would return UTC, which is wrong near midnight
 * (e.g. 11:30 PM EST on Jan 15 → Jan 16 in UTC).
 */
function getLocalDateString(date) {
  const d = date || new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// =============================================================================
// SECTION 1: USERS
// =============================================================================

/**
 * buildQueries(db) — Factory function that creates all query methods
 * bound to the given database wrapper instance.
 */
module.exports = function buildQueries(db) {

const queries = {

  // ---------------------------------------------------------------------------
  // Get a user by their username (used for login lookup)
  // LOWER() on both sides makes this case-insensitive:
  //   "Admin", "admin", "ADMIN" all find the same account.
  // Returns: { user_id, username, email, password_hash, role, ... } or undefined
  // ---------------------------------------------------------------------------
  getUserByUsername: (username) => {
    return db.prepare('SELECT * FROM Users WHERE LOWER(username) = LOWER(?)').get(username);
  },

  // ---------------------------------------------------------------------------
  // Get a user by their email address (used for login lookup)
  // LOWER() on both sides makes this case-insensitive,
  // matching the username lookup behaviour.
  // Returns: user row or undefined
  // ---------------------------------------------------------------------------
  getUserByEmail: (email) => {
    return db.prepare('SELECT * FROM Users WHERE LOWER(email) = LOWER(?)').get(email);
  },

  // ---------------------------------------------------------------------------
  // Get a user by their ID
  // Returns: user row or undefined
  // ---------------------------------------------------------------------------
  getUserById: (userId) => {
    return db.prepare('SELECT * FROM Users WHERE user_id = ?').get(userId);
  },

  // ---------------------------------------------------------------------------
  // Get all users with the 'parent' role (used by notification scheduler)
  // Returns: array of parent user rows
  // ---------------------------------------------------------------------------
  getAllParents: () => {
    return db.prepare("SELECT * FROM Users WHERE role = 'parent'").all();
  },

  // ---------------------------------------------------------------------------
  // Insert a new user (parent or provider) into the Users table
  // Returns: { user_id, username, role } of the newly created user
  // ---------------------------------------------------------------------------
  createUser: ({ email, username, passwordHash, role }) => {
    const result = db.prepare(`
      INSERT INTO Users (email, username, password_hash, role)
      VALUES (@email, @username, @passwordHash, @role)
    `).run({ email, username, passwordHash, role });

    // result.lastInsertRowid is the auto-generated user_id for the new row
    return { user_id: result.lastInsertRowid, username, role };
  },

  // ---------------------------------------------------------------------------
  // Mark a user's onboarding tutorial as complete
  // ---------------------------------------------------------------------------
  setOnboardingComplete: (userId) => {
    db.prepare('UPDATE Users SET has_completed_onboarding = 1 WHERE user_id = ?').run(userId);
  },

  // =============================================================================
  // SECTION 2: CHILDREN
  // =============================================================================

  // ---------------------------------------------------------------------------
  // Get all children belonging to a parent
  // Returns: array of children rows
  // ---------------------------------------------------------------------------
  getChildrenByParent: (parentId) => {
    return db.prepare('SELECT * FROM Children WHERE parent_id = ? ORDER BY name').all(parentId);
  },

  // ---------------------------------------------------------------------------
  // Get a single child by their ID
  // Returns: child row or undefined
  // ---------------------------------------------------------------------------
  getChildById: (childId) => {
    return db.prepare('SELECT * FROM Children WHERE child_id = ?').get(childId);
  },

  // ---------------------------------------------------------------------------
  // Get a child by their username (for login) — case-insensitive match
  // Returns: child row or undefined
  // ---------------------------------------------------------------------------
  getChildByUsername: (username) => {
    return db.prepare('SELECT * FROM Children WHERE LOWER(username) = LOWER(?)').get(username);
  },

  // ---------------------------------------------------------------------------
  // Insert a new child record
  // Returns: { child_id, name } of the new child
  // ---------------------------------------------------------------------------
  createChild: ({ parentId, username, passwordHash, name, birthday, notes, icon }) => {
    const result = db.prepare(`
      INSERT INTO Children (parent_id, username, password_hash, name, birthday, notes, icon)
      VALUES (@parentId, @username, @passwordHash, @name, @birthday, @notes, @icon)
    `).run({ parentId, username, passwordHash, name, birthday, notes, icon: icon || 'boy_older' });

    return { child_id: result.lastInsertRowid, name };
  },

  // ---------------------------------------------------------------------------
  // Create a child and their default controller schedule atomically.
  // Uses a transaction so both succeed or both fail — no orphaned records.
  // ---------------------------------------------------------------------------
  createChildWithSchedule: ({ parentId, username, passwordHash, name, birthday, notes, icon }) => {
    const txn = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO Children (parent_id, username, password_hash, name, birthday, notes, icon)
        VALUES (@parentId, @username, @passwordHash, @name, @birthday, @notes, @icon)
      `).run({ parentId, username, passwordHash, name, birthday, notes, icon: icon || 'boy_older' });

      const childId = result.lastInsertRowid;
      db.prepare(`
        INSERT OR IGNORE INTO Controller_Schedule (child_id, doses_per_day)
        VALUES (?, 1)
      `).run(childId);

      return { child_id: childId, name };
    });
    return txn();
  },

  // ---------------------------------------------------------------------------
  // Update a child's profile (name, birthday, notes — no username/password changes)
  // ---------------------------------------------------------------------------
  updateChild: ({ childId, name, birthday, notes, icon }) => {
    db.prepare(`
      UPDATE Children
      SET name = @name, birthday = @birthday, notes = @notes, icon = @icon
      WHERE child_id = @childId
    `).run({ childId, name, birthday, notes: notes || null, icon: icon || 'boy_older' });
  },

  // ---------------------------------------------------------------------------
  // Update a child's personal best PEF value
  // ---------------------------------------------------------------------------
  updatePersonalBest: (childId, personalBestPef) => {
    db.prepare('UPDATE Children SET personal_best_pef = ? WHERE child_id = ?')
      .run(personalBestPef, childId);
  },

  // =============================================================================
  // SECTION 3: MEDICATIONS
  // =============================================================================

  // ---------------------------------------------------------------------------
  // Get all medications for a child, ordered by name
  // includeInactive: if true, returns inactive medications too (active first)
  // Returns: array of medication rows
  // ---------------------------------------------------------------------------
  getMedicationsByChild: (childId, includeInactive = false) => {
    if (includeInactive) {
      return db.prepare(`
        SELECT * FROM Medications
        WHERE child_id = ?
        ORDER BY is_active DESC, medication_name
      `).all(childId);
    }
    return db.prepare(`
      SELECT * FROM Medications
      WHERE child_id = ? AND is_active = 1
      ORDER BY medication_name
    `).all(childId);
  },

  // ---------------------------------------------------------------------------
  // Get a single medication by ID
  // Returns: medication row or undefined
  // ---------------------------------------------------------------------------
  getMedicationById: (medicationId) => {
    return db.prepare('SELECT * FROM Medications WHERE medication_id = ?').get(medicationId);
  },

  // ---------------------------------------------------------------------------
  // Insert a new medication record
  // Returns: { medication_id } of the new medication
  // ---------------------------------------------------------------------------
  createMedication: ({ childId, medicationName, isRescue, purchaseDate, expirationDate, dosesRemaining, notes }) => {
    const result = db.prepare(`
      INSERT INTO Medications
        (child_id, medication_name, is_rescue, purchase_date, expiration_date, doses_remaining, notes)
      VALUES
        (@childId, @medicationName, @isRescue, @purchaseDate, @expirationDate, @dosesRemaining, @notes)
    `).run({ childId, medicationName, isRescue: isRescue ? 1 : 0, purchaseDate, expirationDate, dosesRemaining, notes });

    return { medication_id: result.lastInsertRowid };
  },

  // ---------------------------------------------------------------------------
  // Update an existing medication record
  // Note: child_id is intentionally NOT updatable
  // ---------------------------------------------------------------------------
  updateMedication: ({ medicationId, medicationName, isRescue, purchaseDate, expirationDate, dosesRemaining, notes }) => {
    db.prepare(`
      UPDATE Medications
      SET medication_name = @medicationName,
          is_rescue = @isRescue,
          purchase_date = @purchaseDate,
          expiration_date = @expirationDate,
          doses_remaining = @dosesRemaining,
          notes = @notes,
          updated_at = datetime('now')
      WHERE medication_id = @medicationId
    `).run({ medicationId, medicationName, isRescue: isRescue ? 1 : 0, purchaseDate, expirationDate, dosesRemaining, notes });
  },

  // ---------------------------------------------------------------------------
  // Set a medication's active status (soft-delete / restore)
  // ---------------------------------------------------------------------------
  setMedicationActive: (medicationId, isActive) => {
    db.prepare(`
      UPDATE Medications
      SET is_active = ?, updated_at = datetime('now')
      WHERE medication_id = ?
    `).run(isActive ? 1 : 0, medicationId);
  },

  // ---------------------------------------------------------------------------
  // Reduce doses remaining after a child takes medication
  // Ensures doses_remaining doesn't go below 0
  // ---------------------------------------------------------------------------
  decreaseDosesRemaining: (medicationId, dosesUsed) => {
    // Ensure dosesUsed is a positive number to prevent accidental inventory increase
    const amount = Math.max(0, Number(dosesUsed) || 0);
    db.prepare(`
      UPDATE Medications
      SET doses_remaining = MAX(0, doses_remaining - ?),
          updated_at = datetime('now')
      WHERE medication_id = ?
    `).run(amount, medicationId);
  },

  // =============================================================================
  // SECTION 4: CONTROLLER SCHEDULE
  // =============================================================================

  // ---------------------------------------------------------------------------
  // Get the controller schedule for a child
  // Returns: schedule row or undefined
  // ---------------------------------------------------------------------------
  getControllerSchedule: (childId) => {
    return db.prepare('SELECT * FROM Controller_Schedule WHERE child_id = ?').get(childId);
  },

  // ---------------------------------------------------------------------------
  // Create a default (all false) controller schedule for a new child
  // ---------------------------------------------------------------------------
  createControllerSchedule: ({ childId }) => {
    db.prepare(`
      INSERT OR IGNORE INTO Controller_Schedule (child_id, doses_per_day)
      VALUES (?, 1)
    `).run(childId);
  },

  // ---------------------------------------------------------------------------
  // Update the controller schedule for a child
  // ---------------------------------------------------------------------------
  updateControllerSchedule: ({ childId, monday, tuesday, wednesday, thursday, friday, saturday, sunday, dosesPerDay }) => {
    db.prepare(`
      UPDATE Controller_Schedule
      SET monday = @monday,
          tuesday = @tuesday,
          wednesday = @wednesday,
          thursday = @thursday,
          friday = @friday,
          saturday = @saturday,
          sunday = @sunday,
          doses_per_day = @dosesPerDay,
          updated_at = datetime('now')
      WHERE child_id = @childId
    `).run({
      childId,
      monday: monday ? 1 : 0,
      tuesday: tuesday ? 1 : 0,
      wednesday: wednesday ? 1 : 0,
      thursday: thursday ? 1 : 0,
      friday: friday ? 1 : 0,
      saturday: saturday ? 1 : 0,
      sunday: sunday ? 1 : 0,
      dosesPerDay
    });
  },

  // =============================================================================
  // SECTION 5: DAILY CHECK-INS
  // =============================================================================

  // ---------------------------------------------------------------------------
  // Insert or update today's check-in for a child
  // INSERT OR REPLACE: if a row exists with same child_id+date, it replaces it
  // ---------------------------------------------------------------------------
  upsertCheckin: ({ childId, nightWaking, activityLimits, coughing, wheezing,
                    triggerExercise, triggerColdAir, triggerDust, triggerSmoke,
                    triggerIllness, triggerStrongOdors }) => {
    // Get today's date in YYYY-MM-DD format (local timezone)
    const today = getLocalDateString();

    db.prepare(`
      INSERT INTO Daily_Checkins
        (child_id, date, night_waking, activity_limits, coughing, wheezing,
         trigger_exercise, trigger_cold_air, trigger_dust, trigger_smoke,
         trigger_illness, trigger_strong_odors)
      VALUES
        (@childId, @date, @nightWaking, @activityLimits, @coughing, @wheezing,
         @triggerExercise, @triggerColdAir, @triggerDust, @triggerSmoke,
         @triggerIllness, @triggerStrongOdors)
      ON CONFLICT(child_id, date) DO UPDATE SET
        night_waking = @nightWaking,
        activity_limits = @activityLimits,
        coughing = @coughing,
        wheezing = @wheezing,
        trigger_exercise = @triggerExercise,
        trigger_cold_air = @triggerColdAir,
        trigger_dust = @triggerDust,
        trigger_smoke = @triggerSmoke,
        trigger_illness = @triggerIllness,
        trigger_strong_odors = @triggerStrongOdors
    `).run({
      childId, date: today, nightWaking, activityLimits, coughing, wheezing,
      triggerExercise: triggerExercise ? 1 : 0,
      triggerColdAir: triggerColdAir ? 1 : 0,
      triggerDust: triggerDust ? 1 : 0,
      triggerSmoke: triggerSmoke ? 1 : 0,
      triggerIllness: triggerIllness ? 1 : 0,
      triggerStrongOdors: triggerStrongOdors ? 1 : 0
    });
  },

  // ---------------------------------------------------------------------------
  // Get today's check-in for a child (to pre-fill the form)
  // Returns: checkin row or undefined
  // ---------------------------------------------------------------------------
  getTodaysCheckin: (childId) => {
    const today = getLocalDateString();
    return db.prepare('SELECT * FROM Daily_Checkins WHERE child_id = ? AND date = ?').get(childId, today);
  },

  // ---------------------------------------------------------------------------
  // Get check-in history for the last N days (for chart display)
  // Returns: array of checkin rows, ordered by date ascending
  // ---------------------------------------------------------------------------
  getCheckinHistory: (childId, days) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = getLocalDateString(cutoff);
    return db.prepare(`
      SELECT * FROM Daily_Checkins
      WHERE child_id = ?
        AND date >= ?
      ORDER BY date ASC
    `).all(childId, cutoffStr);
  },

  // =============================================================================
  // SECTION 6: PEF ENTRIES
  // =============================================================================

  // ---------------------------------------------------------------------------
  // Insert or update today's PEF entry for a child
  // ---------------------------------------------------------------------------
  upsertPefEntry: ({ childId, dailyPef, preMedPef, postMedPef }) => {
    // Use local date (not UTC) so a late-night entry stays on the correct day
    const today = getLocalDateString();

    // Use ?? instead of || so a valid value of 0 is not converted to null.
    // COALESCE on the UPDATE side preserves an existing value when the new one is null,
    // preventing a child's dailyPef submission from overwriting a parent's pre/post values.
    db.prepare(`
      INSERT INTO PEF_Entries
        (child_id, date, daily_pef, pre_medication_pef, post_medication_pef)
      VALUES
        (@childId, @date, @dailyPef, @preMedPef, @postMedPef)
      ON CONFLICT(child_id, date) DO UPDATE SET
        daily_pef           = CASE WHEN @dailyPef IS NOT NULL THEN MAX(COALESCE(daily_pef, 0), @dailyPef) ELSE daily_pef END,
        pre_medication_pef  = COALESCE(@preMedPef, pre_medication_pef),
        post_medication_pef = COALESCE(@postMedPef, post_medication_pef),
        updated_at = datetime('now')
    `).run({ childId, date: today, dailyPef: dailyPef ?? null, preMedPef: preMedPef ?? null, postMedPef: postMedPef ?? null });
  },

  // ---------------------------------------------------------------------------
  // Get today's PEF for a child (for zone calculation)
  // Returns: pef row or undefined
  // ---------------------------------------------------------------------------
  getTodaysPef: (childId) => {
    const today = getLocalDateString();
    return db.prepare('SELECT * FROM PEF_Entries WHERE child_id = ? AND date = ?').get(childId, today);
  },

  // ---------------------------------------------------------------------------
  // Get PEF history for chart display
  // Returns: array of pef rows ordered by date
  // ---------------------------------------------------------------------------
  getPefHistory: (childId, days) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = getLocalDateString(cutoff);
    return db.prepare(`
      SELECT * FROM PEF_Entries
      WHERE child_id = ?
        AND date >= ?
      ORDER BY date ASC
    `).all(childId, cutoffStr);
  },

  // =============================================================================
  // SECTION 7: MEDICATION LOGS
  // =============================================================================

  // ---------------------------------------------------------------------------
  // Insert a new medication log entry
  // ---------------------------------------------------------------------------
  createMedicationLog: ({ childId, medicationId, dosesTaken, breathingBefore, breathingAfter }) => {
    db.prepare(`
      INSERT INTO Medication_Logs
        (child_id, medication_id, doses_taken, breathing_before, breathing_after)
      VALUES (?, ?, ?, ?, ?)
    `).run(childId, medicationId, dosesTaken, breathingBefore, breathingAfter);
  },

  // ---------------------------------------------------------------------------
  // Get medication log history, optionally filtered by child and date range
  // Also joins with Medications to get medication name
  // Returns: array of log rows with medication_name attached
  // ---------------------------------------------------------------------------
  getMedicationLogs: (childId, days, parentId) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = getLocalDateString(cutoff);
    if (childId) {
      return db.prepare(`
        SELECT ml.*, m.medication_name, m.is_rescue, c.name AS child_name
        FROM Medication_Logs ml
        JOIN Medications m ON ml.medication_id = m.medication_id
        JOIN Children c ON ml.child_id = c.child_id
        WHERE ml.child_id = ?
          AND ml.timestamp >= ?
        ORDER BY ml.timestamp DESC
      `).all(childId, cutoffStr);
    } else if (parentId) {
      // When no childId is given, scope to the current parent's children only
      return db.prepare(`
        SELECT ml.*, m.medication_name, m.is_rescue, c.name AS child_name
        FROM Medication_Logs ml
        JOIN Medications m ON ml.medication_id = m.medication_id
        JOIN Children c ON ml.child_id = c.child_id
        WHERE c.parent_id = ?
          AND ml.timestamp >= ?
        ORDER BY ml.timestamp DESC
      `).all(parentId, cutoffStr);
    } else {
      // Fallback: return empty array if no scope is provided
      return [];
    }
  },

  // ---------------------------------------------------------------------------
  // Check if medication was logged on a specific date (for adherence calc)
  // Returns: { count: number } — count > 0 means medication was taken
  // ---------------------------------------------------------------------------
  wasMedicationLoggedOnDate: (childId, dateStr) => {
    const result = db.prepare(`
      SELECT COUNT(*) as count FROM Medication_Logs
      WHERE child_id = ?
        AND date(timestamp) = ?
    `).get(childId, dateStr);
    return result.count > 0;
  },

  // =============================================================================
  // SECTION 8: INCIDENT REPORTS
  // =============================================================================

  // ---------------------------------------------------------------------------
  // Insert a new incident (triage) report
  // Returns: { incident_id } of the new record
  // ---------------------------------------------------------------------------
  createIncident: ({ childId, loggedByUserId, canSpeakFullSentences, chestRetracting,
                     blueGreyLips, currentPef, userNotes, guidanceProvided, medicationsAdministered }) => {
    const result = db.prepare(`
      INSERT INTO Incident_Reports
        (child_id, logged_by_user_id, can_speak_full_sentences, chest_retracting,
         blue_grey_lips, current_pef, user_notes, guidance_provided, medications_administered)
      VALUES
        (@childId, @loggedByUserId, @canSpeakFullSentences, @chestRetracting,
         @blueGreyLips, @currentPef, @userNotes, @guidanceProvided, @medicationsAdministered)
    `).run({
      childId,
      loggedByUserId: loggedByUserId || null,
      canSpeakFullSentences: canSpeakFullSentences ? 1 : 0,
      chestRetracting: chestRetracting ? 1 : 0,
      blueGreyLips: blueGreyLips ? 1 : 0,
      currentPef: currentPef || null,
      userNotes,
      guidanceProvided,
      medicationsAdministered: medicationsAdministered ? JSON.stringify(medicationsAdministered) : null
    });

    return { incident_id: result.lastInsertRowid };
  },

  // ---------------------------------------------------------------------------
  // Get all incident reports for a child, most recent first
  // Returns: array of incident rows
  // ---------------------------------------------------------------------------
  getIncidentsByChild: (childId) => {
    return db.prepare(`
      SELECT * FROM Incident_Reports
      WHERE child_id = ?
      ORDER BY timestamp DESC
    `).all(childId);
  },

  // =============================================================================
  // SECTION 9: BADGES
  // =============================================================================

  // ---------------------------------------------------------------------------
  // Insert a new badge for a child
  // Returns: { badge_id }
  // ---------------------------------------------------------------------------
  createBadge: ({ childId, badgeName, badgeDescription, criteriaType, criteriaValue }) => {
    const result = db.prepare(`
      INSERT INTO Badges
        (child_id, badge_name, badge_description, criteria_type, criteria_value)
      VALUES (?, ?, ?, ?, ?)
    `).run(childId, badgeName, badgeDescription, criteriaType, criteriaValue);

    return { badge_id: result.lastInsertRowid };
  },

  // ---------------------------------------------------------------------------
  // Get all badges for a child
  // includeInactive: if true, returns inactive badges too (active first)
  // Returns: array of badge rows
  // ---------------------------------------------------------------------------
  getBadgesByChild: (childId, includeInactive = false) => {
    if (includeInactive) {
      return db.prepare('SELECT * FROM Badges WHERE child_id = ? ORDER BY is_active DESC, created_at').all(childId);
    }
    return db.prepare('SELECT * FROM Badges WHERE child_id = ? AND is_active = 1 ORDER BY created_at').all(childId);
  },

  // ---------------------------------------------------------------------------
  // Get a single badge by ID (used for ownership validation)
  // Returns: badge row or undefined
  // ---------------------------------------------------------------------------
  getBadgeById: (badgeId) => {
    return db.prepare('SELECT * FROM Badges WHERE badge_id = ?').get(badgeId);
  },

  // ---------------------------------------------------------------------------
  // Mark a badge as achieved with the current timestamp
  // ---------------------------------------------------------------------------
  markBadgeAchieved: (badgeId) => {
    db.prepare(`
      UPDATE Badges
      SET is_achieved = 1, achieved_at = datetime('now')
      WHERE badge_id = ?
    `).run(badgeId);
  },

  // ---------------------------------------------------------------------------
  // Set a badge's active status (soft-delete / restore)
  // ---------------------------------------------------------------------------
  setBadgeActive: (badgeId, isActive) => {
    db.prepare('UPDATE Badges SET is_active = ? WHERE badge_id = ?').run(isActive ? 1 : 0, badgeId);
  },

  // =============================================================================
  // SECTION 10: INHALER TECHNIQUE SESSIONS
  // =============================================================================

  // ---------------------------------------------------------------------------
  // Record a completed inhaler technique session
  // ---------------------------------------------------------------------------
  createTechniqueSession: ({ childId, sessionType }) => {
    db.prepare(`
      INSERT INTO Inhaler_Technique_Sessions (child_id, session_type)
      VALUES (?, ?)
    `).run(childId, sessionType);
  },

  // ---------------------------------------------------------------------------
  // Count how many technique sessions a child has completed
  // Used for badge criteria checking
  // Returns: number
  // ---------------------------------------------------------------------------
  countTechniqueSessions: (childId) => {
    const result = db.prepare(`
      SELECT COUNT(*) as count FROM Inhaler_Technique_Sessions WHERE child_id = ?
    `).get(childId);
    return result.count;
  },

  // =============================================================================
  // SECTION 11: PROVIDER ACCESS
  // =============================================================================

  // ---------------------------------------------------------------------------
  // Create a new provider access record (before a provider activates the code)
  // Returns: { access_id }
  // ---------------------------------------------------------------------------
  createProviderAccess: ({
    parentId, childId, accessCode, codeExpiresAt,
    shareRescueLogs = 0, shareControllerAdherence = 0, shareSymptomsChart = 0,
    shareTriggers = 0, sharePef = 0, shareTriageIncidents = 0, shareSummaryCharts = 0
  }) => {
    const result = db.prepare(`
      INSERT INTO Provider_Access
        (parent_id, child_id, access_code, code_expires_at,
         share_rescue_logs, share_controller_adherence, share_symptoms_chart,
         share_triggers, share_pef, share_triage_incidents, share_summary_charts)
      VALUES
        (@parentId, @childId, @accessCode, @codeExpiresAt,
         @shareRescueLogs, @shareControllerAdherence, @shareSymptomsChart,
         @shareTriggers, @sharePef, @shareTriageIncidents, @shareSummaryCharts)
    `).run({
      parentId, childId, accessCode, codeExpiresAt,
      shareRescueLogs: shareRescueLogs ? 1 : 0,
      shareControllerAdherence: shareControllerAdherence ? 1 : 0,
      shareSymptomsChart: shareSymptomsChart ? 1 : 0,
      shareTriggers: shareTriggers ? 1 : 0,
      sharePef: sharePef ? 1 : 0,
      shareTriageIncidents: shareTriageIncidents ? 1 : 0,
      shareSummaryCharts: shareSummaryCharts ? 1 : 0
    });

    return { access_id: result.lastInsertRowid };
  },

  // ---------------------------------------------------------------------------
  // Look up an access record by its code (used when provider enters the code)
  // Returns: access row or undefined
  // ---------------------------------------------------------------------------
  getProviderAccessByCode: (code) => {
    return db.prepare('SELECT * FROM Provider_Access WHERE access_code = ?').get(code);
  },

  // ---------------------------------------------------------------------------
  // Link a provider to an access record after they enter the code
  // ---------------------------------------------------------------------------
  activateProviderAccess: (accessId, providerId) => {
    db.prepare(`
      UPDATE Provider_Access
      SET provider_id = ?, activated_at = datetime('now')
      WHERE access_id = ?
    `).run(providerId, accessId);
  },

  // ---------------------------------------------------------------------------
  // Get all children a provider can see, with child and parent info
  // Returns: array with child and parent info attached
  // ---------------------------------------------------------------------------
  getProviderPatients: (providerId) => {
    return db.prepare(`
      SELECT
        pa.*,
        c.name AS child_name,
        c.birthday,
        u.email AS parent_email,
        u.username AS parent_username
      FROM Provider_Access pa
      JOIN Children c ON pa.child_id = c.child_id
      JOIN Users u ON pa.parent_id = u.user_id
      WHERE pa.provider_id = ?
      ORDER BY c.name
    `).all(providerId);
  },

  // ---------------------------------------------------------------------------
  // Get sharing settings for a specific provider-child pair
  // Returns: access row or undefined
  // ---------------------------------------------------------------------------
  getProviderAccess: (providerId, childId) => {
    return db.prepare(`
      SELECT * FROM Provider_Access
      WHERE provider_id = ? AND child_id = ?
    `).get(providerId, childId);
  },

  // ---------------------------------------------------------------------------
  // Update sharing settings for a provider access record
  // ---------------------------------------------------------------------------
  updateSharingSettings: ({
    childId, parentId,
    shareRescueLogs, shareControllerAdherence, shareSymptomsChart,
    shareTriggers, sharePef, shareTriageIncidents, shareSummaryCharts
  }) => {
    db.prepare(`
      UPDATE Provider_Access
      SET share_rescue_logs = @shareRescueLogs,
          share_controller_adherence = @shareControllerAdherence,
          share_symptoms_chart = @shareSymptomsChart,
          share_triggers = @shareTriggers,
          share_pef = @sharePef,
          share_triage_incidents = @shareTriageIncidents,
          share_summary_charts = @shareSummaryCharts
      WHERE child_id = @childId AND parent_id = @parentId
    `).run({
      childId, parentId,
      shareRescueLogs: shareRescueLogs ? 1 : 0,
      shareControllerAdherence: shareControllerAdherence ? 1 : 0,
      shareSymptomsChart: shareSymptomsChart ? 1 : 0,
      shareTriggers: shareTriggers ? 1 : 0,
      sharePef: sharePef ? 1 : 0,
      shareTriageIncidents: shareTriageIncidents ? 1 : 0,
      shareSummaryCharts: shareSummaryCharts ? 1 : 0
    });
  },

  // =============================================================================
  // SECTION 12: NOTIFICATIONS
  // =============================================================================

  // ---------------------------------------------------------------------------
  // Insert a new notification record
  // ---------------------------------------------------------------------------
  createNotification: ({ userId, notificationType, title, message,
                         relatedChildId, relatedMedicationId, expiresAt }) => {
    db.prepare(`
      INSERT INTO Notifications
        (user_id, notification_type, title, message,
         related_child_id, related_medication_id, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, notificationType, title, message,
           relatedChildId || null, relatedMedicationId || null, expiresAt);
  },

  // ---------------------------------------------------------------------------
  // Get all non-expired notifications for a user, most recent first
  // Returns: array of notification rows
  // ---------------------------------------------------------------------------
  getNotifications: (userId) => {
    return db.prepare(`
      SELECT * FROM Notifications
      WHERE user_id = ?
        AND expires_at > datetime('now')
      ORDER BY created_at DESC
    `).all(userId);
  },

  // ---------------------------------------------------------------------------
  // Check if a notification of this type was sent recently (deduplication)
  // minutesAgo: how many minutes back to check
  // Returns: notification row or undefined (undefined = safe to send)
  // ---------------------------------------------------------------------------
  getRecentNotification: (userId, notificationType, relatedChildId, minutesAgo) => {
    // Whitelist allowed minute values to prevent injection via datetime modifier
    const ALLOWED_MINUTES = { 5: '-5 minutes', 15: '-15 minutes', 30: '-30 minutes', 60: '-60 minutes', 120: '-120 minutes' };
    const modifier = ALLOWED_MINUTES[minutesAgo];
    if (!modifier) throw new Error(`getRecentNotification: invalid minutesAgo value: ${minutesAgo}`);

    if (relatedChildId) {
      return db.prepare(`
        SELECT * FROM Notifications
        WHERE user_id = ?
          AND notification_type = ?
          AND related_child_id = ?
          AND created_at >= datetime('now', ?)
      `).get(userId, notificationType, relatedChildId, modifier);
    } else {
      return db.prepare(`
        SELECT * FROM Notifications
        WHERE user_id = ?
          AND notification_type = ?
          AND created_at >= datetime('now', ?)
      `).get(userId, notificationType, modifier);
    }
  },

  // ---------------------------------------------------------------------------
  // Mark a single notification as read
  // ---------------------------------------------------------------------------
  markNotificationRead: (notificationId) => {
    db.prepare('UPDATE Notifications SET is_read = 1 WHERE notification_id = ?').run(notificationId);
  },

  // ---------------------------------------------------------------------------
  // Mark all notifications for a user as read
  // ---------------------------------------------------------------------------
  markAllNotificationsRead: (userId) => {
    db.prepare('UPDATE Notifications SET is_read = 1 WHERE user_id = ?').run(userId);
  },

  // ---------------------------------------------------------------------------
  // Delete notifications that have passed their expiry date (2 weeks old)
  // Called by the notification scheduler daily
  // ---------------------------------------------------------------------------
  deleteExpiredNotifications: () => {
    db.prepare("DELETE FROM Notifications WHERE expires_at < datetime('now')").run();
  },

  // ===========================================================================
  // APP SETTINGS (key-value store)
  // ===========================================================================

  // ---------------------------------------------------------------------------
  // Get a setting value by key. Returns the value string or null.
  // ---------------------------------------------------------------------------
  getSetting: (key) => {
    const row = db.prepare('SELECT value FROM App_Settings WHERE key = ?').get(key);
    return row ? row.value : null;
  },

  // ---------------------------------------------------------------------------
  // Set a setting value (insert or update).
  // ---------------------------------------------------------------------------
  setSetting: (key, value) => {
    db.prepare('INSERT OR REPLACE INTO App_Settings (key, value) VALUES (?, ?)').run(key, value);
  },

  // ---------------------------------------------------------------------------
  // Delete a setting by key.
  // ---------------------------------------------------------------------------
  deleteSetting: (key) => {
    db.prepare('DELETE FROM App_Settings WHERE key = ?').run(key);
  }

};

return queries;

}; // end buildQueries
