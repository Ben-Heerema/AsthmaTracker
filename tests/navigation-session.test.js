/**
 * navigation-session.test.js — Navigation & Session Management Tests
 *
 * Tests the navigation route map and session state logic from main.js:
 *   - Route map completeness (all screens have valid file paths)
 *   - Session state management (login, logout, role tracking)
 *   - Navigation data passing between screens
 */

const fs   = require('fs');
const path = require('path');

// =============================================================================
// Route map — copied from main.js
// =============================================================================

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
// Session state — mirrors main.js
// =============================================================================

function createSession() {
  let currentSession = { userId: null, childId: null, username: null, role: null };
  let navigationData = null;

  return {
    getSession: () => currentSession,

    setSession: (session) => { currentSession = session; },

    logout: () => {
      currentSession = { userId: null, childId: null, username: null, role: null };
      return { success: true };
    },

    setNavigationData: (data) => { navigationData = data; },

    getNavigationData: () => {
      const data = navigationData;
      navigationData = null;
      return data;
    },

    loginAsParent: (userId, username) => {
      currentSession = { userId, childId: null, username, role: 'parent' };
    },

    loginAsProvider: (userId, username) => {
      currentSession = { userId, childId: null, username, role: 'provider' };
    },

    loginAsChild: (childId, name) => {
      currentSession = { userId: null, childId, username: name, role: 'child' };
    }
  };
}

// =============================================================================
// TESTS: Route map
// =============================================================================

describe('Route Map', () => {

  const projectRoot = path.join(__dirname, '..');

  describe('completeness', () => {
    test('has auth routes', () => {
      expect(routes['landing']).toBeDefined();
      expect(routes['signup']).toBeDefined();
      expect(routes['login']).toBeDefined();
      expect(routes['onboarding']).toBeDefined();
    });

    test('has parent routes', () => {
      const parentRoutes = Object.keys(routes).filter(k => k.startsWith('parent-'));
      expect(parentRoutes.length).toBeGreaterThanOrEqual(14);
    });

    test('has provider routes', () => {
      expect(routes['provider-main']).toBeDefined();
      expect(routes['provider-patient-view']).toBeDefined();
    });

    test('has child routes', () => {
      const childRoutes = Object.keys(routes).filter(k => k.startsWith('child-'));
      expect(childRoutes.length).toBeGreaterThanOrEqual(4);
    });

    test('has shared routes', () => {
      expect(routes['settings']).toBeDefined();
      expect(routes['emergency']).toBeDefined();
    });
  });

  describe('file paths', () => {
    test('all route values end with .html', () => {
      Object.values(routes).forEach(filePath => {
        expect(filePath).toMatch(/\.html$/);
      });
    });

    test('all route files exist on disk', () => {
      Object.entries(routes).forEach(([screenName, filePath]) => {
        const fullPath = path.join(projectRoot, filePath);
        const exists = fs.existsSync(fullPath);
        if (!exists) {
          throw new Error(`Route "${screenName}" points to missing file: ${filePath}`);
        }
        expect(exists).toBe(true);
      });
    });

    test('all route file paths use forward slashes', () => {
      Object.values(routes).forEach(filePath => {
        expect(filePath).not.toContain('\\');
      });
    });

    test('all route file paths start with src/', () => {
      Object.values(routes).forEach(filePath => {
        expect(filePath).toMatch(/^src\//);
      });
    });
  });

  describe('route naming conventions', () => {
    test('route names use kebab-case', () => {
      Object.keys(routes).forEach(name => {
        expect(name).toMatch(/^[a-z0-9-]+$/);
      });
    });

    test('no duplicate file paths', () => {
      const paths = Object.values(routes);
      const uniquePaths = new Set(paths);
      expect(uniquePaths.size).toBe(paths.length);
    });
  });

  describe('unknown route handling', () => {
    test('unknown screen name returns undefined', () => {
      expect(routes['nonexistent-screen']).toBeUndefined();
      expect(routes['']).toBeUndefined();
      expect(routes['parent-unknown']).toBeUndefined();
    });
  });
});

// =============================================================================
// TESTS: Session management
// =============================================================================

describe('Session Management', () => {

  let session;

  beforeEach(() => {
    session = createSession();
  });

  describe('initial state', () => {
    test('session starts with all null fields', () => {
      const s = session.getSession();
      expect(s.userId).toBeNull();
      expect(s.childId).toBeNull();
      expect(s.username).toBeNull();
      expect(s.role).toBeNull();
    });
  });

  describe('parent login', () => {
    test('sets userId, username, and role', () => {
      session.loginAsParent(1, 'parentuser');
      const s = session.getSession();
      expect(s.userId).toBe(1);
      expect(s.username).toBe('parentuser');
      expect(s.role).toBe('parent');
      expect(s.childId).toBeNull();
    });
  });

  describe('provider login', () => {
    test('sets userId, username, and role', () => {
      session.loginAsProvider(2, 'docsmith');
      const s = session.getSession();
      expect(s.userId).toBe(2);
      expect(s.username).toBe('docsmith');
      expect(s.role).toBe('provider');
      expect(s.childId).toBeNull();
    });
  });

  describe('child login', () => {
    test('sets childId, username/name, and role', () => {
      session.loginAsChild(5, 'Little Timmy');
      const s = session.getSession();
      expect(s.childId).toBe(5);
      expect(s.username).toBe('Little Timmy');
      expect(s.role).toBe('child');
      expect(s.userId).toBeNull();
    });
  });

  describe('logout', () => {
    test('clears all session fields', () => {
      session.loginAsParent(1, 'parentuser');
      session.logout();
      const s = session.getSession();
      expect(s.userId).toBeNull();
      expect(s.childId).toBeNull();
      expect(s.username).toBeNull();
      expect(s.role).toBeNull();
    });

    test('returns success', () => {
      const result = session.logout();
      expect(result.success).toBe(true);
    });
  });

  describe('session overwrite', () => {
    test('new login replaces previous session', () => {
      session.loginAsParent(1, 'parent1');
      session.loginAsChild(5, 'child1');
      const s = session.getSession();
      expect(s.role).toBe('child');
      expect(s.userId).toBeNull();
      expect(s.childId).toBe(5);
    });
  });
});

// =============================================================================
// TESTS: Navigation data
// =============================================================================

describe('Navigation Data', () => {

  let session;

  beforeEach(() => {
    session = createSession();
  });

  test('getNavigationData returns null when no data set', () => {
    expect(session.getNavigationData()).toBeNull();
  });

  test('setNavigationData + getNavigationData round-trips correctly', () => {
    session.setNavigationData({ medicationId: 5 });
    expect(session.getNavigationData()).toEqual({ medicationId: 5 });
  });

  test('getNavigationData clears data after reading (read-once)', () => {
    session.setNavigationData({ childId: 3 });
    session.getNavigationData(); // first read
    expect(session.getNavigationData()).toBeNull(); // second read
  });

  test('can pass complex objects', () => {
    const data = { childId: 1, medications: [{ id: 1, name: 'Albuterol' }], mode: 'edit' };
    session.setNavigationData(data);
    expect(session.getNavigationData()).toEqual(data);
  });

  test('can pass null explicitly', () => {
    session.setNavigationData(null);
    expect(session.getNavigationData()).toBeNull();
  });

  test('can pass primitive values', () => {
    session.setNavigationData(42);
    expect(session.getNavigationData()).toBe(42);
  });

  test('last setNavigationData wins', () => {
    session.setNavigationData({ first: true });
    session.setNavigationData({ second: true });
    expect(session.getNavigationData()).toEqual({ second: true });
  });
});
