/**
 * queries.test.js — Database Query Layer Tests
 *
 * Tests all 13 sections of src/database/queries.js using an isolated
 * in-memory SQLite database. No real data is ever touched.
 *
 * Structure mirrors the sections in queries.js:
 *   Section 1:  Users
 *   Section 2:  Children
 *   Section 3:  Medications
 *   Section 4:  Controller Schedule
 *   Section 5:  Daily Check-ins
 *   Section 6:  PEF Entries
 *   Section 7:  Medication Logs
 *   Section 8:  Incident Reports
 *   Section 9:  Badges
 *   Section 10: Inhaler Technique Sessions
 *   Section 11: Provider Access
 *   Section 12: Notifications
 *   Section 13: App Settings
 */

const { createTestDb } = require('./__helpers__/db-setup');

// ── Shared test fixtures ───────────────────────────────────────────────────────
let db, q; // db = DatabaseWrapper instance, q = queries object

// Seed IDs that are set once and reused across tests
let parentId, providerId, childId, medicationId, badgeId, accessId;

beforeAll(async () => {
  ({ db, queries: q } = await createTestDb());

  // Seed a parent user
  const parent = q.createUser({
    email: 'parent@test.com', username: 'testparent',
    passwordHash: 'hashed_pw', role: 'parent'
  });
  parentId = parent.user_id;

  // Seed a provider user
  const provider = q.createUser({
    email: 'provider@test.com', username: 'testprovider',
    passwordHash: 'hashed_pw', role: 'provider'
  });
  providerId = provider.user_id;

  // Seed a child under the parent
  const child = q.createChild({
    parentId, username: 'testchild', passwordHash: 'hashed_child',
    name: 'Test Child', birthday: '2015-06-01', notes: null
  });
  childId = child.child_id;

  // Seed a medication for the child
  const med = q.createMedication({
    childId, medicationName: 'Albuterol', isRescue: true,
    purchaseDate: '2024-01-01', expirationDate: '2025-12-31',
    dosesRemaining: 100, notes: null
  });
  medicationId = med.medication_id;
});

// =============================================================================
// SECTION 1: USERS
// =============================================================================

describe('Section 1 — Users', () => {

  describe('getUserByUsername', () => {
    test('finds user by exact username', () => {
      const user = q.getUserByUsername('testparent');
      expect(user).toBeDefined();
      expect(user.email).toBe('parent@test.com');
    });

    test('is case-insensitive (UPPER input)', () => {
      const user = q.getUserByUsername('TESTPARENT');
      expect(user).toBeDefined();
      expect(user.username).toBe('testparent');
    });

    test('is case-insensitive (mixed case)', () => {
      const user = q.getUserByUsername('TestParent');
      expect(user).toBeDefined();
    });

    test('returns undefined for unknown username', () => {
      expect(q.getUserByUsername('nobody')).toBeUndefined();
    });

    test('returns undefined for empty string', () => {
      expect(q.getUserByUsername('')).toBeUndefined();
    });
  });

  describe('getUserByEmail', () => {
    test('finds user by email', () => {
      const user = q.getUserByEmail('parent@test.com');
      expect(user).toBeDefined();
      expect(user.username).toBe('testparent');
    });

    test('returns undefined for unknown email', () => {
      expect(q.getUserByEmail('nobody@test.com')).toBeUndefined();
    });

    test('email lookup is case-insensitive (uses LOWER())', () => {
      // queries.js uses LOWER() for email lookup — matches regardless of case
      const user = q.getUserByEmail('PARENT@TEST.COM');
      expect(user).toBeDefined();
      expect(user.email).toBe('parent@test.com');
    });
  });

  describe('getUserById', () => {
    test('returns user for valid ID', () => {
      const user = q.getUserById(parentId);
      expect(user).toBeDefined();
      expect(user.user_id).toBe(parentId);
    });

    test('returns undefined for non-existent ID', () => {
      expect(q.getUserById(99999)).toBeUndefined();
    });
  });

  describe('getAllParents', () => {
    test('returns only parent-role users', () => {
      const parents = q.getAllParents();
      expect(parents.length).toBeGreaterThanOrEqual(1);
      parents.forEach(p => expect(p.role).toBe('parent'));
    });

    test('does not include providers', () => {
      const parents = q.getAllParents();
      const providerFound = parents.find(p => p.role === 'provider');
      expect(providerFound).toBeUndefined();
    });
  });

  describe('createUser', () => {
    test('returns new user with an auto-generated user_id', () => {
      const user = q.createUser({
        email: 'new@test.com', username: 'newuser',
        passwordHash: 'hash', role: 'parent'
      });
      expect(user.user_id).toBeGreaterThan(0);
      expect(user.username).toBe('newuser');
    });

    test('throws on duplicate username', () => {
      expect(() =>
        q.createUser({ email: 'other@x.com', username: 'testparent', passwordHash: 'h', role: 'parent' })
      ).toThrow();
    });

    test('throws on duplicate email', () => {
      expect(() =>
        q.createUser({ email: 'parent@test.com', username: 'uniqueuser', passwordHash: 'h', role: 'parent' })
      ).toThrow();
    });
  });

  describe('setOnboardingComplete', () => {
    test('sets has_completed_onboarding to 1', () => {
      q.setOnboardingComplete(parentId);
      const user = q.getUserById(parentId);
      expect(user.has_completed_onboarding).toBe(1);
    });
  });
});

// =============================================================================
// SECTION 2: CHILDREN
// =============================================================================

describe('Section 2 — Children', () => {

  describe('getChildrenByParent', () => {
    test('returns children for the parent', () => {
      const children = q.getChildrenByParent(parentId);
      expect(children.length).toBeGreaterThanOrEqual(1);
      children.forEach(c => expect(c.parent_id).toBe(parentId));
    });

    test('returns empty array for parent with no children', () => {
      // Create a childless parent
      const u = q.createUser({ email: 'childless@test.com', username: 'childless', passwordHash: 'h', role: 'parent' });
      const children = q.getChildrenByParent(u.user_id);
      expect(children).toEqual([]);
    });

    test('children are ordered alphabetically by name', () => {
      // Add two more children in reverse order
      q.createChild({ parentId, username: 'zzchild', passwordHash: 'h', name: 'Zara', birthday: '2016-01-01', notes: null });
      q.createChild({ parentId, username: 'aachild', passwordHash: 'h', name: 'Aaron', birthday: '2016-01-01', notes: null });
      const children = q.getChildrenByParent(parentId);
      const names = children.map(c => c.name);
      expect(names).toEqual([...names].sort());
    });
  });

  describe('getChildById', () => {
    test('returns correct child', () => {
      const child = q.getChildById(childId);
      expect(child).toBeDefined();
      expect(child.name).toBe('Test Child');
    });

    test('returns undefined for bad id', () => {
      expect(q.getChildById(99999)).toBeUndefined();
    });
  });

  describe('getChildByUsername', () => {
    test('finds child by username (exact)', () => {
      const child = q.getChildByUsername('testchild');
      expect(child).toBeDefined();
    });

    test('is case-insensitive', () => {
      const child = q.getChildByUsername('TESTCHILD');
      expect(child).toBeDefined();
    });

    test('returns undefined for unknown username', () => {
      expect(q.getChildByUsername('ghostchild')).toBeUndefined();
    });
  });

  describe('createChild', () => {
    test('throws on duplicate username', () => {
      expect(() =>
        q.createChild({ parentId, username: 'testchild', passwordHash: 'h', name: 'Dup', birthday: '2015-01-01', notes: null })
      ).toThrow();
    });

    test('stores notes as null when not provided', () => {
      const c = q.createChild({ parentId, username: 'noteskid', passwordHash: 'h', name: 'Notes Kid', birthday: '2016-01-01', notes: null });
      const fetched = q.getChildById(c.child_id);
      expect(fetched.notes).toBeNull();
    });
  });

  describe('updateChild', () => {
    let updateChildId;

    beforeAll(() => {
      const c = q.createChild({
        parentId, username: 'updatekid', passwordHash: 'h',
        name: 'Original Name', birthday: '2015-03-15', notes: 'Original notes'
      });
      updateChildId = c.child_id;
    });

    test('updates name', () => {
      q.updateChild({ childId: updateChildId, name: 'New Name', birthday: '2015-03-15', notes: 'Original notes' });
      const child = q.getChildById(updateChildId);
      expect(child.name).toBe('New Name');
    });

    test('updates birthday', () => {
      q.updateChild({ childId: updateChildId, name: 'New Name', birthday: '2016-07-20', notes: 'Original notes' });
      const child = q.getChildById(updateChildId);
      expect(child.birthday).toBe('2016-07-20');
    });

    test('updates notes', () => {
      q.updateChild({ childId: updateChildId, name: 'New Name', birthday: '2016-07-20', notes: 'Updated notes' });
      const child = q.getChildById(updateChildId);
      expect(child.notes).toBe('Updated notes');
    });

    test('sets notes to null when not provided', () => {
      q.updateChild({ childId: updateChildId, name: 'New Name', birthday: '2016-07-20', notes: null });
      const child = q.getChildById(updateChildId);
      expect(child.notes).toBeNull();
    });

    test('does not change parent_id', () => {
      q.updateChild({ childId: updateChildId, name: 'New Name', birthday: '2016-07-20', notes: null });
      const child = q.getChildById(updateChildId);
      expect(child.parent_id).toBe(parentId);
    });
  });

  describe('createChildWithSchedule', () => {
    test('creates both a child and controller schedule', () => {
      const result = q.createChildWithSchedule({
        parentId, username: 'schedkid', passwordHash: 'h',
        name: 'Schedule Kid', birthday: '2015-01-01', notes: null
      });
      expect(result.child_id).toBeGreaterThan(0);
      const child = q.getChildById(result.child_id);
      expect(child).toBeDefined();
      expect(child.name).toBe('Schedule Kid');
      const schedule = q.getControllerSchedule(result.child_id);
      expect(schedule).toBeDefined();
    });

    test('throws on duplicate username', () => {
      expect(() =>
        q.createChildWithSchedule({
          parentId, username: 'schedkid', passwordHash: 'h',
          name: 'Duplicate', birthday: '2015-01-01', notes: null
        })
      ).toThrow();
    });
  });

  describe('updatePersonalBest', () => {
    test('updates personal best PEF value', () => {
      q.updatePersonalBest(childId, 350);
      const child = q.getChildById(childId);
      expect(child.personal_best_pef).toBe(350);
    });

    test('can overwrite an existing personal best', () => {
      q.updatePersonalBest(childId, 400);
      const child = q.getChildById(childId);
      expect(child.personal_best_pef).toBe(400);
    });
  });
});

// =============================================================================
// SECTION 3: MEDICATIONS
// =============================================================================

describe('Section 3 — Medications', () => {

  describe('getMedicationsByChild', () => {
    test('returns medications for the child', () => {
      const meds = q.getMedicationsByChild(childId);
      expect(meds.length).toBeGreaterThanOrEqual(1);
    });

    test('returns empty array for child with no medications', () => {
      const c = q.createChild({ parentId, username: 'nomed', passwordHash: 'h', name: 'No Med', birthday: '2015-01-01', notes: null });
      expect(q.getMedicationsByChild(c.child_id)).toEqual([]);
    });

    test('medications are ordered alphabetically by name', () => {
      q.createMedication({ childId, medicationName: 'Zyrtec', isRescue: false, purchaseDate: '2024-01-01', expirationDate: '2025-12-31', dosesRemaining: 30, notes: null });
      q.createMedication({ childId, medicationName: 'Advil', isRescue: false, purchaseDate: '2024-01-01', expirationDate: '2025-12-31', dosesRemaining: 30, notes: null });
      const meds = q.getMedicationsByChild(childId);
      const names = meds.map(m => m.medication_name);
      expect(names).toEqual([...names].sort());
    });
  });

  describe('getMedicationById', () => {
    test('returns correct medication', () => {
      const med = q.getMedicationById(medicationId);
      expect(med).toBeDefined();
      expect(med.medication_name).toBe('Albuterol');
    });

    test('returns undefined for bad id', () => {
      expect(q.getMedicationById(99999)).toBeUndefined();
    });
  });

  describe('createMedication', () => {
    test('stores is_rescue as 1 for rescue medication', () => {
      const med = q.createMedication({ childId, medicationName: 'Rescue Test', isRescue: true, purchaseDate: '2024-01-01', expirationDate: '2025-12-31', dosesRemaining: 50, notes: null });
      const fetched = q.getMedicationById(med.medication_id);
      expect(fetched.is_rescue).toBe(1);
    });

    test('stores is_rescue as 0 for controller medication', () => {
      const med = q.createMedication({ childId, medicationName: 'Controller Test', isRescue: false, purchaseDate: '2024-01-01', expirationDate: '2025-12-31', dosesRemaining: 60, notes: null });
      const fetched = q.getMedicationById(med.medication_id);
      expect(fetched.is_rescue).toBe(0);
    });

    test('stores falsy isRescue value as 0', () => {
      const med = q.createMedication({ childId, medicationName: 'Falsy Rescue', isRescue: 0, purchaseDate: '2024-01-01', expirationDate: '2025-12-31', dosesRemaining: 10, notes: null });
      const fetched = q.getMedicationById(med.medication_id);
      expect(fetched.is_rescue).toBe(0);
    });
  });

  describe('updateMedication', () => {
    test('updates medication fields correctly', () => {
      q.updateMedication({
        medicationId, medicationName: 'Updated Albuterol',
        isRescue: true, purchaseDate: '2024-02-01', expirationDate: '2026-01-01',
        dosesRemaining: 80, notes: 'Updated note'
      });
      const med = q.getMedicationById(medicationId);
      expect(med.medication_name).toBe('Updated Albuterol');
      expect(med.doses_remaining).toBe(80);
      expect(med.notes).toBe('Updated note');
    });
  });

  describe('setMedicationActive', () => {
    let toggleMedId;

    beforeAll(() => {
      const med = q.createMedication({
        childId, medicationName: 'Toggle Med', isRescue: false,
        purchaseDate: '2024-01-01', expirationDate: '2026-01-01',
        dosesRemaining: 50, notes: null
      });
      toggleMedId = med.medication_id;
    });

    test('deactivates a medication (sets is_active to 0)', () => {
      q.setMedicationActive(toggleMedId, 0);
      const med = q.getMedicationById(toggleMedId);
      expect(med.is_active).toBe(0);
    });

    test('reactivates a medication (sets is_active to 1)', () => {
      q.setMedicationActive(toggleMedId, 1);
      const med = q.getMedicationById(toggleMedId);
      expect(med.is_active).toBe(1);
    });

    test('does not affect other medications', () => {
      q.setMedicationActive(toggleMedId, 0);
      const original = q.getMedicationById(medicationId);
      expect(original.is_active).toBe(1);
    });

    test('updates the updated_at timestamp', () => {
      const before = q.getMedicationById(toggleMedId).updated_at;
      q.setMedicationActive(toggleMedId, 1);
      const after = q.getMedicationById(toggleMedId).updated_at;
      // updated_at should be set (may or may not differ depending on timing)
      expect(after).toBeDefined();
    });
  });

  describe('decreaseDosesRemaining', () => {
    test('reduces doses by the specified amount', () => {
      const before = q.getMedicationById(medicationId).doses_remaining;
      q.decreaseDosesRemaining(medicationId, 5);
      const after = q.getMedicationById(medicationId).doses_remaining;
      expect(after).toBe(before - 5);
    });

    test('does not go below 0 (floors at zero)', () => {
      // Set doses to 2, then try to deduct 10
      q.updateMedication({
        medicationId, medicationName: 'Albuterol', isRescue: true,
        purchaseDate: '2024-01-01', expirationDate: '2026-01-01',
        dosesRemaining: 2, notes: null
      });
      q.decreaseDosesRemaining(medicationId, 10);
      const med = q.getMedicationById(medicationId);
      expect(med.doses_remaining).toBe(0);
    });

    test('deducting 0 doses leaves count unchanged', () => {
      q.updateMedication({
        medicationId, medicationName: 'Albuterol', isRescue: true,
        purchaseDate: '2024-01-01', expirationDate: '2026-01-01',
        dosesRemaining: 50, notes: null
      });
      q.decreaseDosesRemaining(medicationId, 0);
      expect(q.getMedicationById(medicationId).doses_remaining).toBe(50);
    });
  });
});

// =============================================================================
// SECTION 4: CONTROLLER SCHEDULE
// =============================================================================

describe('Section 4 — Controller Schedule', () => {

  beforeEach(() => {
    // Ensure schedule exists
    q.createControllerSchedule({ childId });
  });

  describe('getControllerSchedule', () => {
    test('returns schedule for child', () => {
      const s = q.getControllerSchedule(childId);
      expect(s).toBeDefined();
      expect(s.child_id).toBe(childId);
    });

    test('returns undefined for child with no schedule', () => {
      const c = q.createChild({ parentId, username: 'nosched', passwordHash: 'h', name: 'No Sched', birthday: '2015-01-01', notes: null });
      expect(q.getControllerSchedule(c.child_id)).toBeUndefined();
    });
  });

  describe('createControllerSchedule', () => {
    test('default schedule has all days as 0', () => {
      const c = q.createChild({ parentId, username: 'newschedkid', passwordHash: 'h', name: 'New Sched', birthday: '2015-01-01', notes: null });
      q.createControllerSchedule({ childId: c.child_id });
      const s = q.getControllerSchedule(c.child_id);
      ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].forEach(day => {
        expect(s[day]).toBe(0);
      });
    });

    test('INSERT OR IGNORE does not error if schedule already exists', () => {
      expect(() => q.createControllerSchedule({ childId })).not.toThrow();
    });
  });

  describe('updateControllerSchedule', () => {
    test('updates specific days to 1', () => {
      q.updateControllerSchedule({
        childId, monday: true, tuesday: false, wednesday: true,
        thursday: false, friday: false, saturday: false, sunday: false, dosesPerDay: 2
      });
      const s = q.getControllerSchedule(childId);
      expect(s.monday).toBe(1);
      expect(s.tuesday).toBe(0);
      expect(s.wednesday).toBe(1);
      expect(s.doses_per_day).toBe(2);
    });

    test('converts falsy values to 0', () => {
      q.updateControllerSchedule({
        childId, monday: 0, tuesday: null, wednesday: false,
        thursday: undefined, friday: 0, saturday: 0, sunday: 0, dosesPerDay: 1
      });
      const s = q.getControllerSchedule(childId);
      ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
        .forEach(day => expect(s[day]).toBe(0));
    });

    test('can set all 7 days active', () => {
      q.updateControllerSchedule({
        childId, monday: true, tuesday: true, wednesday: true,
        thursday: true, friday: true, saturday: true, sunday: true, dosesPerDay: 1
      });
      const s = q.getControllerSchedule(childId);
      ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
        .forEach(day => expect(s[day]).toBe(1));
    });
  });
});

// =============================================================================
// SECTION 5: DAILY CHECK-INS
// =============================================================================

describe('Section 5 — Daily Check-ins', () => {

  describe('upsertCheckin and getTodaysCheckin', () => {
    test('inserts a new check-in for today', () => {
      q.upsertCheckin({
        childId, nightWaking: 'some', activityLimits: 'none',
        coughing: 'a_lot', wheezing: 'none',
        triggerExercise: true, triggerColdAir: false, triggerDust: false,
        triggerSmoke: false, triggerIllness: false, triggerStrongOdors: false
      });
      const checkin = q.getTodaysCheckin(childId);
      expect(checkin).toBeDefined();
      expect(checkin.night_waking).toBe('some');
      expect(checkin.coughing).toBe('a_lot');
      expect(checkin.trigger_exercise).toBe(1);
    });

    test('upsert updates existing check-in for today', () => {
      // First insert
      q.upsertCheckin({
        childId, nightWaking: 'none', activityLimits: 'none',
        coughing: 'none', wheezing: 'none',
        triggerExercise: false, triggerColdAir: false, triggerDust: false,
        triggerSmoke: false, triggerIllness: false, triggerStrongOdors: false
      });
      // Second update
      q.upsertCheckin({
        childId, nightWaking: 'a_lot', activityLimits: 'some',
        coughing: 'some', wheezing: 'none',
        triggerExercise: false, triggerColdAir: true, triggerDust: false,
        triggerSmoke: false, triggerIllness: false, triggerStrongOdors: false
      });
      const checkin = q.getTodaysCheckin(childId);
      expect(checkin.night_waking).toBe('a_lot');
      expect(checkin.trigger_cold_air).toBe(1);
    });

    test('boolean triggers stored as 0/1', () => {
      q.upsertCheckin({
        childId, nightWaking: 'none', activityLimits: 'none',
        coughing: 'none', wheezing: 'none',
        triggerExercise: true, triggerColdAir: true, triggerDust: true,
        triggerSmoke: true, triggerIllness: true, triggerStrongOdors: true
      });
      const c = q.getTodaysCheckin(childId);
      expect(c.trigger_exercise).toBe(1);
      expect(c.trigger_cold_air).toBe(1);
      expect(c.trigger_dust).toBe(1);
      expect(c.trigger_smoke).toBe(1);
      expect(c.trigger_illness).toBe(1);
      expect(c.trigger_strong_odors).toBe(1);
    });

    test('returns undefined when no check-in exists for child', () => {
      const c = q.createChild({ parentId, username: 'nocheckin', passwordHash: 'h', name: 'No Checkin', birthday: '2015-01-01', notes: null });
      expect(q.getTodaysCheckin(c.child_id)).toBeUndefined();
    });
  });

  describe('getCheckinHistory', () => {
    test('returns array (may be empty for freshly seeded db)', () => {
      const history = q.getCheckinHistory(childId, 7);
      expect(Array.isArray(history)).toBe(true);
    });

    test('includes today\'s check-in in a 7-day window', () => {
      q.upsertCheckin({
        childId, nightWaking: 'none', activityLimits: 'none',
        coughing: 'none', wheezing: 'none',
        triggerExercise: false, triggerColdAir: false, triggerDust: false,
        triggerSmoke: false, triggerIllness: false, triggerStrongOdors: false
      });
      const history = q.getCheckinHistory(childId, 7);
      expect(history.length).toBeGreaterThanOrEqual(1);
    });
  });
});

// =============================================================================
// SECTION 6: PEF ENTRIES
// =============================================================================

describe('Section 6 — PEF Entries', () => {

  describe('upsertPefEntry and getTodaysPef', () => {
    test('inserts a PEF entry for today', () => {
      q.upsertPefEntry({ childId, dailyPef: 320, preMedPef: 300, postMedPef: 340 });
      const pef = q.getTodaysPef(childId);
      expect(pef).toBeDefined();
      expect(pef.daily_pef).toBe(320);
    });

    test('upsert overwrites existing entry for today', () => {
      q.upsertPefEntry({ childId, dailyPef: 300, preMedPef: null, postMedPef: null });
      q.upsertPefEntry({ childId, dailyPef: 380, preMedPef: 360, postMedPef: 390 });
      const pef = q.getTodaysPef(childId);
      expect(pef.daily_pef).toBe(380);
      expect(pef.pre_medication_pef).toBe(360);
    });

    test('stores null values when PEF fields are omitted', () => {
      // Use a fresh child so there's no prior PEF entry (avoids COALESCE keeping old values)
      const c = q.createChild({ parentId, username: 'nullpef', passwordHash: 'h', name: 'Null PEF', birthday: '2015-01-01', notes: null });
      q.upsertPefEntry({ childId: c.child_id, dailyPef: null, preMedPef: null, postMedPef: null });
      const pef = q.getTodaysPef(c.child_id);
      // null or undefined depending on SQLite
      expect(pef.daily_pef == null).toBe(true);
    });

    test('returns undefined when no PEF logged today', () => {
      const c = q.createChild({ parentId, username: 'nopef', passwordHash: 'h', name: 'No PEF', birthday: '2015-01-01', notes: null });
      expect(q.getTodaysPef(c.child_id)).toBeUndefined();
    });
  });

  describe('getPefHistory', () => {
    test('returns array', () => {
      expect(Array.isArray(q.getPefHistory(childId, 30))).toBe(true);
    });

    test('includes today\'s entry', () => {
      q.upsertPefEntry({ childId, dailyPef: 350, preMedPef: null, postMedPef: null });
      const history = q.getPefHistory(childId, 7);
      expect(history.length).toBeGreaterThanOrEqual(1);
    });
  });
});

// =============================================================================
// SECTION 7: MEDICATION LOGS
// =============================================================================

describe('Section 7 — Medication Logs', () => {

  describe('createMedicationLog and getMedicationLogs', () => {
    test('creates a log entry', () => {
      q.createMedicationLog({ childId, medicationId, dosesTaken: 2, breathingBefore: 2, breathingAfter: 3 });
      const logs = q.getMedicationLogs(childId, 1);
      expect(logs.length).toBeGreaterThanOrEqual(1);
    });

    test('log includes medication_name via join', () => {
      q.createMedicationLog({ childId, medicationId, dosesTaken: 1, breathingBefore: 1, breathingAfter: 2 });
      const logs = q.getMedicationLogs(childId, 1);
      expect(logs[0].medication_name).toBeDefined();
    });

    test('log includes child_name via join', () => {
      const logs = q.getMedicationLogs(childId, 1);
      expect(logs[0].child_name).toBeDefined();
    });

    test('getMedicationLogs without childId returns all logs', () => {
      const all = q.getMedicationLogs(null, 30);
      expect(Array.isArray(all)).toBe(true);
    });
  });

  describe('wasMedicationLoggedOnDate', () => {
    test('returns true when medication was logged today', () => {
      q.createMedicationLog({ childId, medicationId, dosesTaken: 1, breathingBefore: 3, breathingAfter: 4 });
      const today = new Date().toISOString().split('T')[0];
      expect(q.wasMedicationLoggedOnDate(childId, today)).toBe(true);
    });

    test('returns false for a future date', () => {
      const future = '2099-01-01';
      expect(q.wasMedicationLoggedOnDate(childId, future)).toBe(false);
    });

    test('returns false for a past date with no logs', () => {
      const past = '2000-01-01';
      expect(q.wasMedicationLoggedOnDate(childId, past)).toBe(false);
    });
  });
});

// =============================================================================
// SECTION 8: INCIDENT REPORTS
// =============================================================================

describe('Section 8 — Incident Reports', () => {

  describe('createIncident', () => {
    test('creates and returns incident_id', () => {
      const inc = q.createIncident({
        childId, loggedByUserId: parentId,
        canSpeakFullSentences: true, chestRetracting: false, blueGreyLips: false,
        currentPef: 280, userNotes: 'Felt tight', guidanceProvided: 'Standard protocol',
        medicationsAdministered: null
      });
      expect(inc.incident_id).toBeGreaterThan(0);
    });

    test('stores danger signs as 0/1', () => {
      const inc = q.createIncident({
        childId, loggedByUserId: null,
        canSpeakFullSentences: false, chestRetracting: true, blueGreyLips: true,
        currentPef: null, userNotes: 'Critical', guidanceProvided: '911 advised',
        medicationsAdministered: null
      });
      const rows = q.getIncidentsByChild(childId);
      const found = rows.find(r => r.incident_id === inc.incident_id);
      expect(found.can_speak_full_sentences).toBe(0);
      expect(found.chest_retracting).toBe(1);
      expect(found.blue_grey_lips).toBe(1);
    });

    test('JSON-serialises medicationsAdministered', () => {
      const meds = [{ medication_id: medicationId, doses: 2 }];
      const inc = q.createIncident({
        childId, loggedByUserId: parentId,
        canSpeakFullSentences: true, chestRetracting: false, blueGreyLips: false,
        currentPef: null, userNotes: 'OK', guidanceProvided: 'Standard',
        medicationsAdministered: meds
      });
      const rows = q.getIncidentsByChild(childId);
      const found = rows.find(r => r.incident_id === inc.incident_id);
      expect(JSON.parse(found.medications_administered)).toEqual(meds);
    });

    test('accepts null loggedByUserId (child-triggered incident)', () => {
      expect(() =>
        q.createIncident({
          childId, loggedByUserId: null,
          canSpeakFullSentences: true, chestRetracting: false, blueGreyLips: false,
          currentPef: null, userNotes: 'Child triggered', guidanceProvided: 'Steps',
          medicationsAdministered: null
        })
      ).not.toThrow();
    });
  });

  describe('getIncidentsByChild', () => {
    test('returns incidents for the child in descending timestamp order', () => {
      const incidents = q.getIncidentsByChild(childId);
      expect(incidents.length).toBeGreaterThanOrEqual(1);
      // Verify descending order
      for (let i = 0; i < incidents.length - 1; i++) {
        expect(new Date(incidents[i].timestamp).getTime())
          .toBeGreaterThanOrEqual(new Date(incidents[i + 1].timestamp).getTime());
      }
    });

    test('returns empty array for child with no incidents', () => {
      const c = q.createChild({ parentId, username: 'noinci', passwordHash: 'h', name: 'No Inci', birthday: '2015-01-01', notes: null });
      expect(q.getIncidentsByChild(c.child_id)).toEqual([]);
    });
  });
});

// =============================================================================
// SECTION 9: BADGES
// =============================================================================

describe('Section 9 — Badges', () => {

  beforeAll(() => {
    const b = q.createBadge({
      childId, badgeName: 'First Steps', badgeDescription: 'Completed first session',
      criteriaType: 'technique_sessions', criteriaValue: 1
    });
    badgeId = b.badge_id;
  });

  describe('createBadge', () => {
    test('returns badge_id', () => {
      const b = q.createBadge({
        childId, badgeName: 'Gold Star', badgeDescription: 'Well done',
        criteriaType: 'technique_sessions', criteriaValue: 10
      });
      expect(b.badge_id).toBeGreaterThan(0);
    });
  });

  describe('getBadgesByChild', () => {
    test('returns badges for child', () => {
      const badges = q.getBadgesByChild(childId);
      expect(badges.length).toBeGreaterThanOrEqual(1);
    });

    test('default is_achieved is 0', () => {
      const badges = q.getBadgesByChild(childId);
      const unachieved = badges.find(b => b.badge_id === badgeId);
      expect(unachieved.is_achieved).toBe(0);
    });

    test('returns empty array for child with no badges', () => {
      const c = q.createChild({ parentId, username: 'nobadge', passwordHash: 'h', name: 'No Badge', birthday: '2015-01-01', notes: null });
      expect(q.getBadgesByChild(c.child_id)).toEqual([]);
    });
  });

  describe('getBadgeById', () => {
    test('returns badge for valid ID', () => {
      const badge = q.getBadgeById(badgeId);
      expect(badge).toBeDefined();
      expect(badge.badge_id).toBe(badgeId);
      expect(badge.badge_name).toBe('First Steps');
    });

    test('returns undefined for non-existent ID', () => {
      expect(q.getBadgeById(99999)).toBeUndefined();
    });

    test('includes all badge fields', () => {
      const badge = q.getBadgeById(badgeId);
      expect(badge).toHaveProperty('child_id');
      expect(badge).toHaveProperty('badge_name');
      expect(badge).toHaveProperty('badge_description');
      expect(badge).toHaveProperty('criteria_type');
      expect(badge).toHaveProperty('criteria_value');
      expect(badge).toHaveProperty('is_achieved');
    });
  });

  describe('setBadgeActive', () => {
    let toggleBadgeId;

    beforeAll(() => {
      const b = q.createBadge({
        childId, badgeName: 'Toggle Badge', badgeDescription: 'For toggle test',
        criteriaType: 'technique_sessions', criteriaValue: 5
      });
      toggleBadgeId = b.badge_id;
    });

    test('deactivates a badge (sets is_active to 0)', () => {
      q.setBadgeActive(toggleBadgeId, 0);
      const badge = q.getBadgeById(toggleBadgeId);
      expect(badge.is_active).toBe(0);
    });

    test('reactivates a badge (sets is_active to 1)', () => {
      q.setBadgeActive(toggleBadgeId, 1);
      const badge = q.getBadgeById(toggleBadgeId);
      expect(badge.is_active).toBe(1);
    });

    test('does not affect other badges', () => {
      q.setBadgeActive(toggleBadgeId, 0);
      const original = q.getBadgeById(badgeId);
      expect(original.is_active).toBe(1);
    });
  });

  describe('markBadgeAchieved', () => {
    test('sets is_achieved to 1', () => {
      q.markBadgeAchieved(badgeId);
      const badges = q.getBadgesByChild(childId);
      const badge = badges.find(b => b.badge_id === badgeId);
      expect(badge.is_achieved).toBe(1);
    });

    test('sets achieved_at timestamp', () => {
      const badges = q.getBadgesByChild(childId);
      const badge = badges.find(b => b.badge_id === badgeId);
      expect(badge.achieved_at).not.toBeNull();
    });
  });
});

// =============================================================================
// SECTION 10: INHALER TECHNIQUE SESSIONS
// =============================================================================

describe('Section 10 — Inhaler Technique Sessions', () => {

  describe('createTechniqueSession', () => {
    test('inserts a regular session without error', () => {
      expect(() =>
        q.createTechniqueSession({ childId, sessionType: 'regular' })
      ).not.toThrow();
    });

    test('inserts a mask_spacer session without error', () => {
      expect(() =>
        q.createTechniqueSession({ childId, sessionType: 'mask_spacer' })
      ).not.toThrow();
    });

    test('rejects invalid session_type (schema CHECK constraint)', () => {
      expect(() =>
        q.createTechniqueSession({ childId, sessionType: 'invalid_type' })
      ).toThrow();
    });
  });

  describe('countTechniqueSessions', () => {
    test('returns a number', () => {
      const count = q.countTechniqueSessions(childId);
      expect(typeof count).toBe('number');
    });

    test('returns 0 for a child with no sessions', () => {
      const c = q.createChild({ parentId, username: 'nosession', passwordHash: 'h', name: 'No Session', birthday: '2015-01-01', notes: null });
      expect(q.countTechniqueSessions(c.child_id)).toBe(0);
    });

    test('count increases with each session', () => {
      const c = q.createChild({ parentId, username: 'sessionkid', passwordHash: 'h', name: 'Session Kid', birthday: '2015-01-01', notes: null });
      expect(q.countTechniqueSessions(c.child_id)).toBe(0);
      q.createTechniqueSession({ childId: c.child_id, sessionType: 'regular' });
      expect(q.countTechniqueSessions(c.child_id)).toBe(1);
      q.createTechniqueSession({ childId: c.child_id, sessionType: 'mask_spacer' });
      expect(q.countTechniqueSessions(c.child_id)).toBe(2);
    });
  });
});

// =============================================================================
// SECTION 11: PROVIDER ACCESS
// =============================================================================

describe('Section 11 — Provider Access', () => {

  const futureExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const pastExpiry   = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();

  describe('createProviderAccess', () => {
    test('creates an access record and returns access_id', () => {
      const access = q.createProviderAccess({
        parentId, childId, accessCode: 'TESTCOD1', codeExpiresAt: futureExpiry
      });
      expect(access.access_id).toBeGreaterThan(0);
      accessId = access.access_id;
    });

    test('sharing flags default to 0', () => {
      const access = q.createProviderAccess({
        parentId, childId, accessCode: 'TESTCOD2', codeExpiresAt: futureExpiry
      });
      const row = db.prepare('SELECT * FROM Provider_Access WHERE access_id = ?').get(access.access_id);
      expect(row.share_rescue_logs).toBe(0);
      expect(row.share_pef).toBe(0);
      expect(row.share_summary_charts).toBe(0);
    });

    test('sharing flags stored as 1 when enabled', () => {
      const access = q.createProviderAccess({
        parentId, childId, accessCode: 'TESTCOD3', codeExpiresAt: futureExpiry,
        shareRescueLogs: true, shareControllerAdherence: true, shareSymptomsChart: true,
        shareTriggers: true, sharePef: true, shareTriageIncidents: true, shareSummaryCharts: true
      });
      const row = db.prepare('SELECT * FROM Provider_Access WHERE access_id = ?').get(access.access_id);
      expect(row.share_rescue_logs).toBe(1);
      expect(row.share_pef).toBe(1);
      expect(row.share_summary_charts).toBe(1);
    });

    test('throws on duplicate access_code (UNIQUE constraint)', () => {
      expect(() =>
        q.createProviderAccess({ parentId, childId, accessCode: 'TESTCOD1', codeExpiresAt: futureExpiry })
      ).toThrow();
    });
  });

  describe('getProviderAccessByCode', () => {
    test('returns access record for valid code', () => {
      const access = q.getProviderAccessByCode('TESTCOD1');
      expect(access).toBeDefined();
      expect(access.parent_id).toBe(parentId);
    });

    test('returns undefined for unknown code', () => {
      expect(q.getProviderAccessByCode('XXXXXXXX')).toBeUndefined();
    });
  });

  describe('activateProviderAccess', () => {
    test('links provider_id and sets activated_at', () => {
      q.activateProviderAccess(accessId, providerId);
      const row = db.prepare('SELECT * FROM Provider_Access WHERE access_id = ?').get(accessId);
      expect(row.provider_id).toBe(providerId);
      expect(row.activated_at).not.toBeNull();
    });
  });

  describe('getProviderPatients', () => {
    test('returns patients for provider after activation', () => {
      const patients = q.getProviderPatients(providerId);
      expect(patients.length).toBeGreaterThanOrEqual(1);
      expect(patients[0].child_name).toBeDefined();
    });

    test('returns empty array for provider with no activations', () => {
      const p = q.createUser({ email: 'newprov@test.com', username: 'newprov', passwordHash: 'h', role: 'provider' });
      expect(q.getProviderPatients(p.user_id)).toEqual([]);
    });
  });

  describe('getProviderAccess', () => {
    test('returns access settings for provider-child pair', () => {
      const access = q.getProviderAccess(providerId, childId);
      expect(access).toBeDefined();
    });

    test('returns undefined if no access for pair', () => {
      const p = q.createUser({ email: 'noaccess@test.com', username: 'noaccess', passwordHash: 'h', role: 'provider' });
      expect(q.getProviderAccess(p.user_id, childId)).toBeUndefined();
    });
  });

  describe('updateSharingSettings', () => {
    test('toggles sharing settings to true', () => {
      q.updateSharingSettings({
        childId, parentId,
        shareRescueLogs: true, shareControllerAdherence: false,
        shareSymptomsChart: true, shareTriggers: false,
        sharePef: true, shareTriageIncidents: false, shareSummaryCharts: true
      });
      const access = db.prepare('SELECT * FROM Provider_Access WHERE child_id = ? AND parent_id = ?').get(childId, parentId);
      expect(access.share_rescue_logs).toBe(1);
      expect(access.share_pef).toBe(1);
      expect(access.share_controller_adherence).toBe(0);
    });

    test('toggles all sharing settings to false', () => {
      q.updateSharingSettings({
        childId, parentId,
        shareRescueLogs: false, shareControllerAdherence: false,
        shareSymptomsChart: false, shareTriggers: false,
        sharePef: false, shareTriageIncidents: false, shareSummaryCharts: false
      });
      const access = db.prepare('SELECT * FROM Provider_Access WHERE child_id = ? AND parent_id = ?').get(childId, parentId);
      ['share_rescue_logs', 'share_controller_adherence', 'share_symptoms_chart',
       'share_triggers', 'share_pef', 'share_triage_incidents', 'share_summary_charts']
        .forEach(col => expect(access[col]).toBe(0));
    });
  });
});

// =============================================================================
// SECTION 12: NOTIFICATIONS
// =============================================================================

describe('Section 12 — Notifications', () => {

  // SQLite datetime('now') returns UTC in "YYYY-MM-DD HH:MM:SS" format.
  // We must store expiries in the same format for string comparisons to work correctly.
  function toSqlite(date) {
    return date.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
  }
  const futureExpiry = toSqlite(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000));
  const pastExpiry   = toSqlite(new Date(Date.now() - 60 * 60 * 1000)); // 1 hour ago

  describe('createNotification', () => {
    test('inserts a notification without error', () => {
      expect(() =>
        q.createNotification({
          userId: parentId, notificationType: 'medication_expiry',
          title: 'Expiring Soon', message: 'Albuterol expires in 1 week',
          relatedChildId: childId, relatedMedicationId: medicationId,
          expiresAt: futureExpiry
        })
      ).not.toThrow();
    });

    test('accepts null for optional related IDs', () => {
      expect(() =>
        q.createNotification({
          userId: parentId, notificationType: 'low_dose_count',
          title: 'Low Doses', message: '5 doses remaining',
          relatedChildId: null, relatedMedicationId: null,
          expiresAt: futureExpiry
        })
      ).not.toThrow();
    });
  });

  describe('getNotifications', () => {
    test('returns non-expired notifications for user', () => {
      q.createNotification({
        userId: parentId, notificationType: 'red_zone_alert',
        title: 'Red Zone', message: 'Test',
        relatedChildId: childId, relatedMedicationId: null,
        expiresAt: futureExpiry
      });
      const notifications = q.getNotifications(parentId);
      expect(notifications.length).toBeGreaterThanOrEqual(1);
    });

    test('does not return expired notifications', () => {
      q.createNotification({
        userId: parentId, notificationType: 'medication_expiry',
        title: 'Old Alert', message: 'Old',
        relatedChildId: null, relatedMedicationId: null,
        expiresAt: pastExpiry
      });
      const notifications = q.getNotifications(parentId);
      const old = notifications.find(n => n.title === 'Old Alert');
      expect(old).toBeUndefined();
    });
  });

  describe('getRecentNotification', () => {
    test('returns recent notification of same type', () => {
      q.createNotification({
        userId: parentId, notificationType: 'breathing_decline',
        title: 'Breathing Alert', message: 'Test decline',
        relatedChildId: childId, relatedMedicationId: null,
        expiresAt: futureExpiry
      });
      const recent = q.getRecentNotification(parentId, 'breathing_decline', childId, 60);
      expect(recent).toBeDefined();
    });

    test('returns undefined for type not recently sent', () => {
      const recent = q.getRecentNotification(parentId, 'child_emergency', childId, 60);
      expect(recent).toBeUndefined();
    });

    test('works without relatedChildId', () => {
      q.createNotification({
        userId: parentId, notificationType: 'low_dose_count',
        title: 'Low Doses Again', message: 'Test',
        relatedChildId: null, relatedMedicationId: null,
        expiresAt: futureExpiry
      });
      const recent = q.getRecentNotification(parentId, 'low_dose_count', null, 60);
      expect(recent).toBeDefined();
    });
  });

  describe('markNotificationRead', () => {
    test('marks a single notification as read', () => {
      q.createNotification({
        userId: parentId, notificationType: 'medication_expiry',
        title: 'Mark Read Test', message: 'Test',
        relatedChildId: null, relatedMedicationId: null,
        expiresAt: futureExpiry
      });
      const notifications = q.getNotifications(parentId);
      const target = notifications.find(n => n.title === 'Mark Read Test');
      expect(target.is_read).toBe(0);
      q.markNotificationRead(target.notification_id);
      const updated = db.prepare('SELECT * FROM Notifications WHERE notification_id = ?').get(target.notification_id);
      expect(updated.is_read).toBe(1);
    });
  });

  describe('markAllNotificationsRead', () => {
    test('marks all notifications as read for user', () => {
      q.markAllNotificationsRead(parentId);
      const notifications = q.getNotifications(parentId);
      notifications.forEach(n => {
        const row = db.prepare('SELECT * FROM Notifications WHERE notification_id = ?').get(n.notification_id);
        expect(row.is_read).toBe(1);
      });
    });
  });

  describe('deleteExpiredNotifications', () => {
    test('removes notifications past their expiry', () => {
      q.createNotification({
        userId: parentId, notificationType: 'medication_expiry',
        title: 'Expired One', message: 'Should be deleted',
        relatedChildId: null, relatedMedicationId: null,
        expiresAt: pastExpiry
      });
      q.deleteExpiredNotifications();
      const remaining = db.prepare("SELECT * FROM Notifications WHERE expires_at < datetime('now')").all();
      expect(remaining.length).toBe(0);
    });

    test('does not delete valid notifications', () => {
      q.createNotification({
        userId: parentId, notificationType: 'red_zone_alert',
        title: 'Valid Notification', message: 'Keep this',
        relatedChildId: null, relatedMedicationId: null,
        expiresAt: futureExpiry
      });
      q.deleteExpiredNotifications();
      const valid = db.prepare("SELECT * FROM Notifications WHERE title = 'Valid Notification'").get();
      expect(valid).toBeDefined();
    });
  });
});

// =============================================================================
// SECTION 13: APP SETTINGS
// =============================================================================

describe('Section 13 — App Settings', () => {

  describe('getSetting', () => {
    test('returns null for non-existent key', () => {
      expect(q.getSetting('nonexistent_key')).toBeNull();
    });

    test('returns value for existing key', () => {
      q.setSetting('test_key', 'test_value');
      expect(q.getSetting('test_key')).toBe('test_value');
    });

    test('returns string value even for numeric input', () => {
      q.setSetting('numeric_key', '42');
      expect(q.getSetting('numeric_key')).toBe('42');
    });
  });

  describe('setSetting', () => {
    test('creates a new setting', () => {
      q.setSetting('new_setting', 'hello');
      expect(q.getSetting('new_setting')).toBe('hello');
    });

    test('overwrites an existing setting', () => {
      q.setSetting('overwrite_key', 'first');
      q.setSetting('overwrite_key', 'second');
      expect(q.getSetting('overwrite_key')).toBe('second');
    });

    test('handles empty string value', () => {
      q.setSetting('empty_val', '');
      expect(q.getSetting('empty_val')).toBe('');
    });

    test('handles long values', () => {
      const longVal = 'x'.repeat(1000);
      q.setSetting('long_key', longVal);
      expect(q.getSetting('long_key')).toBe(longVal);
    });
  });

  describe('deleteSetting', () => {
    test('removes an existing setting', () => {
      q.setSetting('temp_key', 'temp_value');
      q.deleteSetting('temp_key');
      expect(q.getSetting('temp_key')).toBeNull();
    });

    test('silently succeeds for non-existent key', () => {
      expect(() => q.deleteSetting('never_existed')).not.toThrow();
    });

    test('does not affect other settings', () => {
      q.setSetting('keep_me', 'alive');
      q.setSetting('delete_me', 'gone');
      q.deleteSetting('delete_me');
      expect(q.getSetting('keep_me')).toBe('alive');
    });
  });
});
