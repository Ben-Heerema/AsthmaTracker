/**
 * authorization.test.js — Authorization Helper Tests
 *
 * Tests the authorization middleware functions from main.js:
 *   - requireAuth      (blocks unauthenticated access)
 *   - isParentOfChild  (verifies parent-child ownership)
 *   - canAccessChild   (role-based child data access control)
 *
 * These functions protect sensitive child health data by ensuring
 * only authorized users can access it.
 */

const { createTestDb } = require('./__helpers__/db-setup');

// =============================================================================
// Extracted authorization logic (mirrors main.js)
// =============================================================================

function createAuthSystem(queries) {
  let currentSession = { userId: null, childId: null, username: null, role: null };

  function setSession(session) {
    currentSession = session;
  }

  function requireAuth() {
    if (!currentSession.userId && !currentSession.childId) {
      return { success: false, error: 'Not authenticated' };
    }
    return null;
  }

  function isParentOfChild(childId) {
    if (currentSession.role !== 'parent') return false;
    const child = queries.getChildById(childId);
    return !!(child && child.parent_id === currentSession.userId);
  }

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

  return { setSession, requireAuth, isParentOfChild, canAccessChild };
}

// =============================================================================
// TESTS
// =============================================================================

describe('Authorization Helpers', () => {

  let q, auth;
  let parentId, providerId, childId, otherParentId, otherChildId;

  beforeAll(async () => {
    ({ queries: q } = await createTestDb());

    // Seed parent
    const parent = q.createUser({ email: 'parent@test.com', username: 'authparent', passwordHash: 'hash', role: 'parent' });
    parentId = parent.user_id;

    // Seed another parent
    const otherParent = q.createUser({ email: 'other@test.com', username: 'otherparent', passwordHash: 'hash', role: 'parent' });
    otherParentId = otherParent.user_id;

    // Seed provider
    const provider = q.createUser({ email: 'prov@test.com', username: 'authprovider', passwordHash: 'hash', role: 'provider' });
    providerId = provider.user_id;

    // Seed child under parent
    const child = q.createChild({ parentId, username: 'authchild', passwordHash: 'hash', name: 'Auth Child', birthday: '2016-01-01', notes: null });
    childId = child.child_id;

    // Seed child under other parent
    const otherChild = q.createChild({ parentId: otherParentId, username: 'otherchild', passwordHash: 'hash', name: 'Other Child', birthday: '2016-01-01', notes: null });
    otherChildId = otherChild.child_id;

    // Give provider access to child
    const futureExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const access = q.createProviderAccess({ parentId, childId, accessCode: 'AUTHTEST', codeExpiresAt: futureExpiry });
    q.activateProviderAccess(access.access_id, providerId);
  });

  beforeEach(() => {
    auth = createAuthSystem(q);
  });

  // ── requireAuth ─────────────────────────────────────────────────────

  describe('requireAuth', () => {

    test('returns error object when no one is logged in', () => {
      auth.setSession({ userId: null, childId: null, username: null, role: null });
      const result = auth.requireAuth();
      expect(result).not.toBeNull();
      expect(result.success).toBe(false);
      expect(result.error).toBe('Not authenticated');
    });

    test('returns null when parent is logged in', () => {
      auth.setSession({ userId: parentId, childId: null, username: 'authparent', role: 'parent' });
      expect(auth.requireAuth()).toBeNull();
    });

    test('returns null when provider is logged in', () => {
      auth.setSession({ userId: providerId, childId: null, username: 'authprovider', role: 'provider' });
      expect(auth.requireAuth()).toBeNull();
    });

    test('returns null when child is logged in', () => {
      auth.setSession({ userId: null, childId, username: 'Auth Child', role: 'child' });
      expect(auth.requireAuth()).toBeNull();
    });

    test('returns error when session has role but no IDs', () => {
      auth.setSession({ userId: null, childId: null, username: 'ghost', role: 'parent' });
      const result = auth.requireAuth();
      expect(result).not.toBeNull();
    });
  });

  // ── isParentOfChild ─────────────────────────────────────────────────

  describe('isParentOfChild', () => {

    test('returns true when parent owns the child', () => {
      auth.setSession({ userId: parentId, childId: null, username: 'authparent', role: 'parent' });
      expect(auth.isParentOfChild(childId)).toBe(true);
    });

    test('returns false when parent does not own the child', () => {
      auth.setSession({ userId: parentId, childId: null, username: 'authparent', role: 'parent' });
      expect(auth.isParentOfChild(otherChildId)).toBe(false);
    });

    test('returns false when user is not a parent (provider)', () => {
      auth.setSession({ userId: providerId, childId: null, username: 'authprovider', role: 'provider' });
      expect(auth.isParentOfChild(childId)).toBe(false);
    });

    test('returns false when user is not a parent (child)', () => {
      auth.setSession({ userId: null, childId, username: 'Auth Child', role: 'child' });
      expect(auth.isParentOfChild(childId)).toBe(false);
    });

    test('returns false for non-existent child ID', () => {
      auth.setSession({ userId: parentId, childId: null, username: 'authparent', role: 'parent' });
      expect(auth.isParentOfChild(99999)).toBe(false);
    });

    test('returns false when no one is logged in', () => {
      auth.setSession({ userId: null, childId: null, username: null, role: null });
      expect(auth.isParentOfChild(childId)).toBe(false);
    });
  });

  // ── canAccessChild ──────────────────────────────────────────────────

  describe('canAccessChild', () => {

    describe('parent role', () => {
      beforeEach(() => {
        auth.setSession({ userId: parentId, childId: null, username: 'authparent', role: 'parent' });
      });

      test('can access own child', () => {
        expect(auth.canAccessChild(childId)).toBe(true);
      });

      test('cannot access another parent\'s child', () => {
        expect(auth.canAccessChild(otherChildId)).toBe(false);
      });

      test('cannot access non-existent child', () => {
        expect(auth.canAccessChild(99999)).toBe(false);
      });
    });

    describe('child role', () => {
      beforeEach(() => {
        auth.setSession({ userId: null, childId, username: 'Auth Child', role: 'child' });
      });

      test('can access own data', () => {
        expect(auth.canAccessChild(childId)).toBe(true);
      });

      test('cannot access another child\'s data', () => {
        expect(auth.canAccessChild(otherChildId)).toBe(false);
      });

      test('cannot access non-existent child', () => {
        expect(auth.canAccessChild(99999)).toBe(false);
      });
    });

    describe('provider role', () => {
      beforeEach(() => {
        auth.setSession({ userId: providerId, childId: null, username: 'authprovider', role: 'provider' });
      });

      test('can access child with granted access', () => {
        expect(auth.canAccessChild(childId)).toBe(true);
      });

      test('cannot access child without access', () => {
        expect(auth.canAccessChild(otherChildId)).toBe(false);
      });

      test('cannot access non-existent child', () => {
        expect(auth.canAccessChild(99999)).toBe(false);
      });
    });

    describe('no role / unauthenticated', () => {
      test('returns false when no session', () => {
        auth.setSession({ userId: null, childId: null, username: null, role: null });
        expect(auth.canAccessChild(childId)).toBe(false);
      });

      test('returns false for unknown role', () => {
        auth.setSession({ userId: 1, childId: null, username: 'hacker', role: 'admin' });
        expect(auth.canAccessChild(childId)).toBe(false);
      });
    });
  });
});
