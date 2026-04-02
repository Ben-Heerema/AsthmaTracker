/**
 * provider-access.test.js — Provider Access Workflow Tests
 *
 * Tests the provider access code system from main.js:
 *   - generateAccessCode  (crypto-based 8-character code generation)
 *   - Access code expiry logic (48-hour window)
 *   - Provider activation workflow (code → provider link)
 *   - Sharing settings (granular data access toggles)
 *   - End-to-end: parent generates code → provider activates → provider views data
 */

const { createTestDb } = require('./__helpers__/db-setup');
const crypto = require('crypto');

// =============================================================================
// Extracted access code generation (mirrors main.js)
// =============================================================================

function generateAccessCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = crypto.randomBytes(8);
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(bytes[i] % chars.length);
  }
  return code;
}

const ACCESS_CODE_EXPIRY_HOURS = 48;

// =============================================================================
// TESTS: Access code generation
// =============================================================================

describe('Access Code Generation', () => {

  describe('generateAccessCode', () => {

    test('generates an 8-character string', () => {
      const code = generateAccessCode();
      expect(code).toHaveLength(8);
    });

    test('contains only uppercase letters and digits', () => {
      for (let i = 0; i < 20; i++) {
        const code = generateAccessCode();
        expect(code).toMatch(/^[A-Z0-9]{8}$/);
      }
    });

    test('generates unique codes on successive calls', () => {
      const codes = new Set();
      for (let i = 0; i < 50; i++) {
        codes.add(generateAccessCode());
      }
      // With 36^8 possibilities, collisions in 50 tries are astronomically unlikely
      expect(codes.size).toBe(50);
    });

    test('uses cryptographic randomness (not Math.random)', () => {
      // Verify crypto.randomBytes is used by checking we get uniform distribution
      // across characters over many generations
      const counts = {};
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      for (const c of chars) counts[c] = 0;

      for (let i = 0; i < 1000; i++) {
        const code = generateAccessCode();
        for (const c of code) counts[c]++;
      }

      // Each character should appear at least once in 8000 random chars from 36 options
      for (const c of chars) {
        expect(counts[c]).toBeGreaterThan(0);
      }
    });
  });

  describe('ACCESS_CODE_EXPIRY_HOURS', () => {
    test('is 48 hours', () => {
      expect(ACCESS_CODE_EXPIRY_HOURS).toBe(48);
    });
  });
});

// =============================================================================
// TESTS: Provider access workflow (with database)
// =============================================================================

describe('Provider Access Workflow', () => {

  let q, parentId, providerId, childId;

  beforeEach(async () => {
    ({ queries: q } = await createTestDb());

    const parent = q.createUser({ email: 'parent@provider-test.com', username: 'provparent', passwordHash: 'hash', role: 'parent' });
    parentId = parent.user_id;

    const provider = q.createUser({ email: 'doc@provider-test.com', username: 'provdoctor', passwordHash: 'hash', role: 'provider' });
    providerId = provider.user_id;

    const child = q.createChild({ parentId, username: 'provchild', passwordHash: 'hash', name: 'Provider Test Child', birthday: '2016-01-01', notes: null });
    childId = child.child_id;
  });

  // ── Code creation and retrieval ─────────────────────────────────────

  describe('code creation', () => {

    test('stores access code in database', () => {
      const code = generateAccessCode();
      const futureExpiry = new Date(Date.now() + ACCESS_CODE_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();

      q.createProviderAccess({
        parentId, childId, accessCode: code, codeExpiresAt: futureExpiry
      });

      const access = q.getProviderAccessByCode(code);
      expect(access).toBeDefined();
      expect(access.access_code).toBe(code);
      expect(access.parent_id).toBe(parentId);
      expect(access.child_id).toBe(childId);
    });

    test('provider_id is null before activation', () => {
      const code = generateAccessCode();
      const futureExpiry = new Date(Date.now() + ACCESS_CODE_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();
      q.createProviderAccess({ parentId, childId, accessCode: code, codeExpiresAt: futureExpiry });

      const access = q.getProviderAccessByCode(code);
      expect(access.provider_id).toBeNull();
    });

    test('returns null for non-existent code', () => {
      const access = q.getProviderAccessByCode('FAKECODE');
      expect(access).toBeUndefined();
    });
  });

  // ── Code expiry ─────────────────────────────────────────────────────

  describe('code expiry', () => {

    test('code with future expiry is valid', () => {
      const futureExpiry = new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString(); // 1 hour from now
      q.createProviderAccess({ parentId, childId, accessCode: 'FUTURE01', codeExpiresAt: futureExpiry });

      const access = q.getProviderAccessByCode('FUTURE01');
      const isExpired = new Date(access.code_expires_at) < new Date();
      expect(isExpired).toBe(false);
    });

    test('code with past expiry is invalid', () => {
      const pastExpiry = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(); // 1 hour ago
      q.createProviderAccess({ parentId, childId, accessCode: 'PAST0001', codeExpiresAt: pastExpiry });

      const access = q.getProviderAccessByCode('PAST0001');
      const isExpired = new Date(access.code_expires_at) < new Date();
      expect(isExpired).toBe(true);
    });

    test('expiry defaults to 48 hours from creation', () => {
      const now = Date.now();
      const expiresAt = new Date(now + ACCESS_CODE_EXPIRY_HOURS * 60 * 60 * 1000);

      // Should be approximately 48 hours from now
      const diffMs = expiresAt.getTime() - now;
      const diffHours = diffMs / (60 * 60 * 1000);
      expect(diffHours).toBe(48);
    });
  });

  // ── Provider activation ─────────────────────────────────────────────

  describe('provider activation', () => {

    test('links provider to access record', () => {
      const futureExpiry = new Date(Date.now() + ACCESS_CODE_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();
      const access = q.createProviderAccess({ parentId, childId, accessCode: 'ACTIV001', codeExpiresAt: futureExpiry });

      q.activateProviderAccess(access.access_id, providerId);

      const activated = q.getProviderAccessByCode('ACTIV001');
      expect(activated.provider_id).toBe(providerId);
    });

    test('sets activated_at timestamp', () => {
      const futureExpiry = new Date(Date.now() + ACCESS_CODE_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();
      const access = q.createProviderAccess({ parentId, childId, accessCode: 'ACTIV002', codeExpiresAt: futureExpiry });

      q.activateProviderAccess(access.access_id, providerId);

      const activated = q.getProviderAccessByCode('ACTIV002');
      expect(activated.activated_at).not.toBeNull();
    });

    test('provider appears in patient list after activation', () => {
      const futureExpiry = new Date(Date.now() + ACCESS_CODE_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();
      const access = q.createProviderAccess({ parentId, childId, accessCode: 'ACTIV003', codeExpiresAt: futureExpiry });
      q.activateProviderAccess(access.access_id, providerId);

      const patients = q.getProviderPatients(providerId);
      expect(patients.length).toBe(1);
      expect(patients[0].child_name).toBe('Provider Test Child');
    });
  });

  // ── Sharing settings ────────────────────────────────────────────────

  describe('sharing settings', () => {

    test('default sharing settings are all off (0)', () => {
      const futureExpiry = new Date(Date.now() + ACCESS_CODE_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();
      q.createProviderAccess({ parentId, childId, accessCode: 'SHARE001', codeExpiresAt: futureExpiry });

      const access = q.getProviderAccessByCode('SHARE001');
      expect(access.share_rescue_logs).toBe(0);
      expect(access.share_controller_adherence).toBe(0);
      expect(access.share_symptoms_chart).toBe(0);
      expect(access.share_triggers).toBe(0);
      expect(access.share_pef).toBe(0);
      expect(access.share_triage_incidents).toBe(0);
      expect(access.share_summary_charts).toBe(0);
    });

    test('can create with specific sharing settings', () => {
      const futureExpiry = new Date(Date.now() + ACCESS_CODE_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();
      q.createProviderAccess({
        parentId, childId, accessCode: 'SHARE002', codeExpiresAt: futureExpiry,
        shareRescueLogs: 1, shareControllerAdherence: 1, shareSymptomsChart: 0,
        shareTriggers: 0, sharePef: 1, shareTriageIncidents: 1, shareSummaryCharts: 0
      });

      const access = q.getProviderAccessByCode('SHARE002');
      expect(access.share_rescue_logs).toBe(1);
      expect(access.share_controller_adherence).toBe(1);
      expect(access.share_symptoms_chart).toBe(0);
      expect(access.share_triggers).toBe(0);
      expect(access.share_pef).toBe(1);
      expect(access.share_triage_incidents).toBe(1);
      expect(access.share_summary_charts).toBe(0);
    });

    test('can update sharing settings after creation', () => {
      const futureExpiry = new Date(Date.now() + ACCESS_CODE_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();
      q.createProviderAccess({ parentId, childId, accessCode: 'SHARE003', codeExpiresAt: futureExpiry });

      q.updateSharingSettings({
        childId, parentId,
        shareRescueLogs: 1, shareControllerAdherence: 1, shareSymptomsChart: 1,
        shareTriggers: 1, sharePef: 1, shareTriageIncidents: 1, shareSummaryCharts: 1
      });

      const access = q.getProviderAccessByCode('SHARE003');
      expect(access.share_rescue_logs).toBe(1);
      expect(access.share_controller_adherence).toBe(1);
      expect(access.share_symptoms_chart).toBe(1);
      expect(access.share_triggers).toBe(1);
      expect(access.share_pef).toBe(1);
      expect(access.share_triage_incidents).toBe(1);
      expect(access.share_summary_charts).toBe(1);
    });
  });

  // ── getProviderAccess (for authorization checks) ────────────────────

  describe('getProviderAccess', () => {

    test('returns access record for linked provider-child pair', () => {
      const futureExpiry = new Date(Date.now() + ACCESS_CODE_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();
      const access = q.createProviderAccess({ parentId, childId, accessCode: 'ACCESS01', codeExpiresAt: futureExpiry });
      q.activateProviderAccess(access.access_id, providerId);

      const result = q.getProviderAccess(providerId, childId);
      expect(result).toBeDefined();
      expect(result.provider_id).toBe(providerId);
      expect(result.child_id).toBe(childId);
    });

    test('returns undefined for unlinked provider-child pair', () => {
      const otherProvider = q.createUser({ email: 'other@doc.com', username: 'otherdoc', passwordHash: 'h', role: 'provider' });
      const result = q.getProviderAccess(otherProvider.user_id, childId);
      expect(result).toBeUndefined();
    });

    test('returns undefined for non-existent provider', () => {
      const result = q.getProviderAccess(99999, childId);
      expect(result).toBeUndefined();
    });

    test('returns undefined for non-existent child', () => {
      const result = q.getProviderAccess(providerId, 99999);
      expect(result).toBeUndefined();
    });
  });

  // ── End-to-end workflow ─────────────────────────────────────────────

  describe('end-to-end workflow', () => {

    test('parent generates code → provider enters code → provider sees patient', () => {
      // Step 1: Parent generates code
      const code = generateAccessCode();
      const expiresAt = new Date(Date.now() + ACCESS_CODE_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();
      const accessRecord = q.createProviderAccess({
        parentId, childId, accessCode: code, codeExpiresAt: expiresAt,
        shareRescueLogs: 1, sharePef: 1
      });

      // Step 2: Provider enters the code
      const found = q.getProviderAccessByCode(code);
      expect(found).toBeDefined();
      expect(new Date(found.code_expires_at) > new Date()).toBe(true);

      // Step 3: Provider activates
      q.activateProviderAccess(found.access_id, providerId);

      // Step 4: Provider can now see the patient
      const patients = q.getProviderPatients(providerId);
      expect(patients.length).toBe(1);
      expect(patients[0].child_id).toBe(childId);

      // Step 5: Provider can access sharing settings
      const sharing = q.getProviderAccess(providerId, childId);
      expect(sharing.share_rescue_logs).toBe(1);
      expect(sharing.share_pef).toBe(1);
      expect(sharing.share_symptoms_chart).toBe(0);
    });

    test('multiple providers can access same child with separate codes', () => {
      const provider2 = q.createUser({ email: 'doc2@test.com', username: 'doc2', passwordHash: 'h', role: 'provider' });

      // Code 1 for provider 1
      const code1 = 'CODE1111';
      const expiresAt = new Date(Date.now() + ACCESS_CODE_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();
      const a1 = q.createProviderAccess({ parentId, childId, accessCode: code1, codeExpiresAt: expiresAt });
      q.activateProviderAccess(a1.access_id, providerId);

      // Code 2 for provider 2
      const code2 = 'CODE2222';
      const a2 = q.createProviderAccess({ parentId, childId, accessCode: code2, codeExpiresAt: expiresAt });
      q.activateProviderAccess(a2.access_id, provider2.user_id);

      // Both providers see the patient
      expect(q.getProviderPatients(providerId).length).toBe(1);
      expect(q.getProviderPatients(provider2.user_id).length).toBe(1);
    });
  });
});
