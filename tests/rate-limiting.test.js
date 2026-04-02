/**
 * rate-limiting.test.js — Login Rate Limiting Tests
 *
 * Tests the rate limiting logic extracted from main.js:
 *   - checkRateLimit     (returns error message or null)
 *   - recordFailedLogin  (increments attempt counter)
 *   - clearLoginAttempts (resets counter on successful login)
 *
 * These functions protect against brute-force password attacks
 * by locking accounts after too many failed attempts.
 */

// =============================================================================
// Extracted rate limiting logic (mirrors main.js)
// =============================================================================

const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

function createRateLimiter() {
  const loginAttempts = new Map();

  function checkRateLimit(identifier) {
    const key = identifier.toLowerCase();
    const record = loginAttempts.get(key);
    if (!record) return null;

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

  return { checkRateLimit, recordFailedLogin, clearLoginAttempts, loginAttempts };
}

// =============================================================================
// TESTS
// =============================================================================

describe('Login Rate Limiting', () => {

  let rl;

  beforeEach(() => {
    rl = createRateLimiter();
  });

  // ── checkRateLimit ──────────────────────────────────────────────────────

  describe('checkRateLimit', () => {

    test('returns null for a new identifier (no prior attempts)', () => {
      expect(rl.checkRateLimit('newuser')).toBeNull();
    });

    test('returns null after 1 failed attempt (below threshold)', () => {
      rl.recordFailedLogin('testuser');
      expect(rl.checkRateLimit('testuser')).toBeNull();
    });

    test('returns null after 4 failed attempts (still below max)', () => {
      for (let i = 0; i < 4; i++) {
        rl.recordFailedLogin('testuser');
      }
      expect(rl.checkRateLimit('testuser')).toBeNull();
    });

    test('returns error message after 5 failed attempts (at max)', () => {
      for (let i = 0; i < 5; i++) {
        rl.recordFailedLogin('testuser');
      }
      const result = rl.checkRateLimit('testuser');
      expect(result).not.toBeNull();
      expect(result).toContain('Too many login attempts');
      expect(result).toContain('minute(s)');
    });

    test('returns error message after 6 failed attempts (above max)', () => {
      for (let i = 0; i < 6; i++) {
        rl.recordFailedLogin('testuser');
      }
      expect(rl.checkRateLimit('testuser')).not.toBeNull();
    });

    test('is case-insensitive (TESTUSER matches testuser)', () => {
      for (let i = 0; i < 5; i++) {
        rl.recordFailedLogin('TestUser');
      }
      expect(rl.checkRateLimit('testuser')).not.toBeNull();
      expect(rl.checkRateLimit('TESTUSER')).not.toBeNull();
    });

    test('resets after lockout period expires', () => {
      for (let i = 0; i < 5; i++) {
        rl.recordFailedLogin('testuser');
      }
      // Simulate lockout period passing by manipulating the record
      const record = rl.loginAttempts.get('testuser');
      record.lastAttempt = Date.now() - LOGIN_LOCKOUT_MS - 1;
      expect(rl.checkRateLimit('testuser')).toBeNull();
    });

    test('lockout reset removes the record from the map', () => {
      for (let i = 0; i < 5; i++) {
        rl.recordFailedLogin('testuser');
      }
      const record = rl.loginAttempts.get('testuser');
      record.lastAttempt = Date.now() - LOGIN_LOCKOUT_MS - 1;
      rl.checkRateLimit('testuser');
      expect(rl.loginAttempts.has('testuser')).toBe(false);
    });

    test('different users tracked independently', () => {
      for (let i = 0; i < 5; i++) {
        rl.recordFailedLogin('user_a');
      }
      expect(rl.checkRateLimit('user_a')).not.toBeNull();
      expect(rl.checkRateLimit('user_b')).toBeNull();
    });
  });

  // ── recordFailedLogin ─────────────────────────────────────────────────

  describe('recordFailedLogin', () => {

    test('creates a new record for unknown identifier', () => {
      rl.recordFailedLogin('newuser');
      expect(rl.loginAttempts.has('newuser')).toBe(true);
      expect(rl.loginAttempts.get('newuser').count).toBe(1);
    });

    test('increments count on successive failures', () => {
      rl.recordFailedLogin('testuser');
      rl.recordFailedLogin('testuser');
      rl.recordFailedLogin('testuser');
      expect(rl.loginAttempts.get('testuser').count).toBe(3);
    });

    test('stores the identifier as lowercase', () => {
      rl.recordFailedLogin('MixedCase');
      expect(rl.loginAttempts.has('mixedcase')).toBe(true);
      expect(rl.loginAttempts.has('MixedCase')).toBe(false);
    });

    test('updates lastAttempt timestamp', () => {
      const before = Date.now();
      rl.recordFailedLogin('testuser');
      const after = Date.now();
      const record = rl.loginAttempts.get('testuser');
      expect(record.lastAttempt).toBeGreaterThanOrEqual(before);
      expect(record.lastAttempt).toBeLessThanOrEqual(after);
    });
  });

  // ── clearLoginAttempts ────────────────────────────────────────────────

  describe('clearLoginAttempts', () => {

    test('removes the record for the identifier', () => {
      rl.recordFailedLogin('testuser');
      rl.clearLoginAttempts('testuser');
      expect(rl.loginAttempts.has('testuser')).toBe(false);
    });

    test('is case-insensitive', () => {
      rl.recordFailedLogin('testuser');
      rl.clearLoginAttempts('TESTUSER');
      expect(rl.loginAttempts.has('testuser')).toBe(false);
    });

    test('does not throw if identifier was never recorded', () => {
      expect(() => rl.clearLoginAttempts('nonexistent')).not.toThrow();
    });

    test('allows login again after clearing', () => {
      for (let i = 0; i < 5; i++) {
        rl.recordFailedLogin('testuser');
      }
      expect(rl.checkRateLimit('testuser')).not.toBeNull();
      rl.clearLoginAttempts('testuser');
      expect(rl.checkRateLimit('testuser')).toBeNull();
    });
  });

  // ── Remaining minutes calculation ─────────────────────────────────────

  describe('remaining minutes in lockout message', () => {

    test('shows 15 minutes at the start of lockout', () => {
      for (let i = 0; i < 5; i++) {
        rl.recordFailedLogin('testuser');
      }
      const msg = rl.checkRateLimit('testuser');
      expect(msg).toContain('15 minute(s)');
    });

    test('shows fewer minutes as lockout period progresses', () => {
      for (let i = 0; i < 5; i++) {
        rl.recordFailedLogin('testuser');
      }
      // Simulate 10 minutes passing
      const record = rl.loginAttempts.get('testuser');
      record.lastAttempt = Date.now() - (10 * 60 * 1000);
      const msg = rl.checkRateLimit('testuser');
      expect(msg).toContain('5 minute(s)');
    });

    test('shows 1 minute when almost expired', () => {
      for (let i = 0; i < 5; i++) {
        rl.recordFailedLogin('testuser');
      }
      const record = rl.loginAttempts.get('testuser');
      // 14 minutes and 30 seconds ago
      record.lastAttempt = Date.now() - (14 * 60 * 1000 + 30 * 1000);
      const msg = rl.checkRateLimit('testuser');
      expect(msg).toContain('1 minute(s)');
    });
  });

  // ── Constants ─────────────────────────────────────────────────────────

  describe('constants', () => {
    test('MAX_LOGIN_ATTEMPTS is 5', () => {
      expect(MAX_LOGIN_ATTEMPTS).toBe(5);
    });

    test('LOGIN_LOCKOUT_MS is 15 minutes', () => {
      expect(LOGIN_LOCKOUT_MS).toBe(15 * 60 * 1000);
    });
  });
});
