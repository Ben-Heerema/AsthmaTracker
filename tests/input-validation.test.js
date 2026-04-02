/**
 * input-validation.test.js — Server-Side Input Validation Tests
 *
 * Tests the IPC handler input validation logic from main.js.
 * These are the server-side validation checks that protect against
 * invalid or malicious data reaching the database.
 *
 * Covers:
 *   - auth:signup   (username, email, password, role validation)
 *   - auth:login    (input presence checks)
 *   - children:add  (username, password, name, birthday validation)
 *   - children:set-personal-best (PEF range validation)
 *   - children:update (name validation)
 *   - checkins:get-history (days range validation)
 *   - pef:get-history (days range validation)
 */

// =============================================================================
// Extracted validation logic (mirrors main.js IPC handlers)
// =============================================================================

const PEF_MAX_VALUE = 900;

function validateSignup(data) {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Invalid request' };
  }
  if (!data.username || typeof data.username !== 'string' || data.username.trim().length < 3 || data.username.trim().length > 30) {
    return { valid: false, error: 'Username must be 3-30 characters' };
  }
  if (!data.email || typeof data.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return { valid: false, error: 'Please enter a valid email address' };
  }
  if (!data.password || typeof data.password !== 'string' || data.password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters' };
  }
  if (!data.role || !['parent', 'provider'].includes(data.role)) {
    return { valid: false, error: 'Invalid role' };
  }
  return { valid: true };
}

function validateLogin(data) {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Invalid request' };
  }
  if (!data.usernameOrEmail || typeof data.usernameOrEmail !== 'string' || data.usernameOrEmail.trim().length === 0) {
    return { valid: false, error: 'Username or email is required' };
  }
  if (!data.password || typeof data.password !== 'string') {
    return { valid: false, error: 'Password is required' };
  }
  return { valid: true };
}

function validateAddChild(data) {
  if (!data || typeof data !== 'object') return { valid: false, error: 'Invalid request' };
  if (!data.username || typeof data.username !== 'string' || data.username.trim().length < 3) {
    return { valid: false, error: 'Username must be at least 3 characters' };
  }
  if (!data.password || typeof data.password !== 'string' || data.password.length < 6) {
    return { valid: false, error: 'Password must be at least 6 characters' };
  }
  if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
    return { valid: false, error: 'Name is required' };
  }
  if (!data.birthday || typeof data.birthday !== 'string') {
    return { valid: false, error: 'Birthday is required' };
  }
  return { valid: true };
}

function validateSetPersonalBest(data) {
  if (!data || !data.childId) return { valid: false, error: 'Child ID is required' };
  const pef = Number(data.personalBestPef);
  if (isNaN(pef) || pef <= 0 || pef > PEF_MAX_VALUE) {
    return { valid: false, error: `PEF must be between 1 and ${PEF_MAX_VALUE}` };
  }
  return { valid: true };
}

function validateUpdateChild(data) {
  if (!data || !data.childId) return { valid: false, error: 'Child ID is required' };
  if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
    return { valid: false, error: 'Name is required' };
  }
  return { valid: true };
}

function validateDaysParam(days) {
  const d = Number(days);
  if (isNaN(d) || d <= 0 || d > 365) return false;
  return true;
}

// =============================================================================
// TESTS: Signup validation
// =============================================================================

describe('Signup Input Validation', () => {

  const validData = { username: 'testuser', email: 'test@example.com', password: 'Password1', role: 'parent' };

  describe('valid inputs', () => {
    test('accepts valid parent signup', () => {
      expect(validateSignup(validData).valid).toBe(true);
    });

    test('accepts valid provider signup', () => {
      expect(validateSignup({ ...validData, role: 'provider' }).valid).toBe(true);
    });
  });

  describe('null/undefined/non-object inputs', () => {
    test('rejects null', () => {
      expect(validateSignup(null).valid).toBe(false);
    });

    test('rejects undefined', () => {
      expect(validateSignup(undefined).valid).toBe(false);
    });

    test('rejects string', () => {
      expect(validateSignup('not an object').valid).toBe(false);
    });

    test('rejects number', () => {
      expect(validateSignup(42).valid).toBe(false);
    });
  });

  describe('username validation', () => {
    test('rejects empty username', () => {
      expect(validateSignup({ ...validData, username: '' }).valid).toBe(false);
    });

    test('rejects username shorter than 3 chars', () => {
      expect(validateSignup({ ...validData, username: 'ab' }).valid).toBe(false);
    });

    test('accepts 3-character username', () => {
      expect(validateSignup({ ...validData, username: 'abc' }).valid).toBe(true);
    });

    test('rejects username longer than 30 chars', () => {
      expect(validateSignup({ ...validData, username: 'a'.repeat(31) }).valid).toBe(false);
    });

    test('accepts 30-character username', () => {
      expect(validateSignup({ ...validData, username: 'a'.repeat(30) }).valid).toBe(true);
    });

    test('rejects null username', () => {
      expect(validateSignup({ ...validData, username: null }).valid).toBe(false);
    });

    test('rejects numeric username', () => {
      expect(validateSignup({ ...validData, username: 123 }).valid).toBe(false);
    });

    test('rejects whitespace-only username (trimmed < 3)', () => {
      expect(validateSignup({ ...validData, username: '   ' }).valid).toBe(false);
    });
  });

  describe('email validation', () => {
    test('accepts standard email', () => {
      expect(validateSignup({ ...validData, email: 'user@domain.com' }).valid).toBe(true);
    });

    test('rejects email without @', () => {
      expect(validateSignup({ ...validData, email: 'nodomain' }).valid).toBe(false);
    });

    test('rejects email without domain', () => {
      expect(validateSignup({ ...validData, email: 'user@' }).valid).toBe(false);
    });

    test('rejects email without TLD', () => {
      expect(validateSignup({ ...validData, email: 'user@domain' }).valid).toBe(false);
    });

    test('rejects empty email', () => {
      expect(validateSignup({ ...validData, email: '' }).valid).toBe(false);
    });

    test('rejects null email', () => {
      expect(validateSignup({ ...validData, email: null }).valid).toBe(false);
    });

    test('rejects email with spaces', () => {
      expect(validateSignup({ ...validData, email: 'user @domain.com' }).valid).toBe(false);
    });
  });

  describe('password validation', () => {
    test('rejects password shorter than 8 chars', () => {
      expect(validateSignup({ ...validData, password: 'Short1' }).valid).toBe(false);
    });

    test('accepts 8-character password', () => {
      expect(validateSignup({ ...validData, password: 'LongPas1' }).valid).toBe(true);
    });

    test('rejects empty password', () => {
      expect(validateSignup({ ...validData, password: '' }).valid).toBe(false);
    });

    test('rejects null password', () => {
      expect(validateSignup({ ...validData, password: null }).valid).toBe(false);
    });

    test('rejects numeric password', () => {
      expect(validateSignup({ ...validData, password: 12345678 }).valid).toBe(false);
    });
  });

  describe('role validation', () => {
    test('accepts "parent"', () => {
      expect(validateSignup({ ...validData, role: 'parent' }).valid).toBe(true);
    });

    test('accepts "provider"', () => {
      expect(validateSignup({ ...validData, role: 'provider' }).valid).toBe(true);
    });

    test('rejects "child"', () => {
      expect(validateSignup({ ...validData, role: 'child' }).valid).toBe(false);
    });

    test('rejects "admin"', () => {
      expect(validateSignup({ ...validData, role: 'admin' }).valid).toBe(false);
    });

    test('rejects empty role', () => {
      expect(validateSignup({ ...validData, role: '' }).valid).toBe(false);
    });

    test('rejects null role', () => {
      expect(validateSignup({ ...validData, role: null }).valid).toBe(false);
    });
  });
});

// =============================================================================
// TESTS: Login validation
// =============================================================================

describe('Login Input Validation', () => {

  test('accepts valid login data', () => {
    expect(validateLogin({ usernameOrEmail: 'user', password: 'pass' }).valid).toBe(true);
  });

  test('rejects null data', () => {
    expect(validateLogin(null).valid).toBe(false);
  });

  test('rejects empty usernameOrEmail', () => {
    expect(validateLogin({ usernameOrEmail: '', password: 'pass' }).valid).toBe(false);
  });

  test('rejects whitespace-only usernameOrEmail', () => {
    expect(validateLogin({ usernameOrEmail: '   ', password: 'pass' }).valid).toBe(false);
  });

  test('rejects null usernameOrEmail', () => {
    expect(validateLogin({ usernameOrEmail: null, password: 'pass' }).valid).toBe(false);
  });

  test('rejects missing password', () => {
    expect(validateLogin({ usernameOrEmail: 'user', password: null }).valid).toBe(false);
  });

  test('rejects numeric password', () => {
    expect(validateLogin({ usernameOrEmail: 'user', password: 12345 }).valid).toBe(false);
  });
});

// =============================================================================
// TESTS: Add child validation
// =============================================================================

describe('Add Child Input Validation', () => {

  const validChild = { username: 'kiddo', password: 'KidPass', name: 'Kiddo', birthday: '2016-01-01' };

  test('accepts valid child data', () => {
    expect(validateAddChild(validChild).valid).toBe(true);
  });

  test('rejects null data', () => {
    expect(validateAddChild(null).valid).toBe(false);
  });

  describe('username', () => {
    test('rejects username shorter than 3 chars', () => {
      expect(validateAddChild({ ...validChild, username: 'ab' }).valid).toBe(false);
    });

    test('accepts 3-character username', () => {
      expect(validateAddChild({ ...validChild, username: 'abc' }).valid).toBe(true);
    });

    test('rejects null username', () => {
      expect(validateAddChild({ ...validChild, username: null }).valid).toBe(false);
    });
  });

  describe('password', () => {
    test('rejects password shorter than 6 chars', () => {
      expect(validateAddChild({ ...validChild, password: '12345' }).valid).toBe(false);
    });

    test('accepts 6-character password', () => {
      expect(validateAddChild({ ...validChild, password: '123456' }).valid).toBe(true);
    });

    test('rejects null password', () => {
      expect(validateAddChild({ ...validChild, password: null }).valid).toBe(false);
    });
  });

  describe('name', () => {
    test('rejects empty name', () => {
      expect(validateAddChild({ ...validChild, name: '' }).valid).toBe(false);
    });

    test('rejects whitespace-only name', () => {
      expect(validateAddChild({ ...validChild, name: '   ' }).valid).toBe(false);
    });

    test('rejects null name', () => {
      expect(validateAddChild({ ...validChild, name: null }).valid).toBe(false);
    });
  });

  describe('birthday', () => {
    test('rejects null birthday', () => {
      expect(validateAddChild({ ...validChild, birthday: null }).valid).toBe(false);
    });

    test('rejects missing birthday', () => {
      expect(validateAddChild({ ...validChild, birthday: undefined }).valid).toBe(false);
    });

    test('accepts valid date string', () => {
      expect(validateAddChild({ ...validChild, birthday: '2018-06-15' }).valid).toBe(true);
    });
  });
});

// =============================================================================
// TESTS: Set personal best validation
// =============================================================================

describe('Set Personal Best Validation', () => {

  test('accepts valid PEF value', () => {
    expect(validateSetPersonalBest({ childId: 1, personalBestPef: 350 }).valid).toBe(true);
  });

  test('rejects missing childId', () => {
    expect(validateSetPersonalBest({ personalBestPef: 350 }).valid).toBe(false);
  });

  test('rejects null data', () => {
    expect(validateSetPersonalBest(null).valid).toBe(false);
  });

  test('rejects PEF of 0', () => {
    expect(validateSetPersonalBest({ childId: 1, personalBestPef: 0 }).valid).toBe(false);
  });

  test('rejects negative PEF', () => {
    expect(validateSetPersonalBest({ childId: 1, personalBestPef: -50 }).valid).toBe(false);
  });

  test('rejects PEF above 900', () => {
    expect(validateSetPersonalBest({ childId: 1, personalBestPef: 901 }).valid).toBe(false);
  });

  test('accepts PEF of exactly 900', () => {
    expect(validateSetPersonalBest({ childId: 1, personalBestPef: 900 }).valid).toBe(true);
  });

  test('accepts PEF of 1', () => {
    expect(validateSetPersonalBest({ childId: 1, personalBestPef: 1 }).valid).toBe(true);
  });

  test('rejects NaN PEF', () => {
    expect(validateSetPersonalBest({ childId: 1, personalBestPef: 'abc' }).valid).toBe(false);
  });

  test('accepts string number PEF (coerced)', () => {
    expect(validateSetPersonalBest({ childId: 1, personalBestPef: '350' }).valid).toBe(true);
  });
});

// =============================================================================
// TESTS: Update child validation
// =============================================================================

describe('Update Child Validation', () => {

  test('accepts valid update data', () => {
    expect(validateUpdateChild({ childId: 1, name: 'New Name' }).valid).toBe(true);
  });

  test('rejects missing childId', () => {
    expect(validateUpdateChild({ name: 'Test' }).valid).toBe(false);
  });

  test('rejects empty name', () => {
    expect(validateUpdateChild({ childId: 1, name: '' }).valid).toBe(false);
  });

  test('rejects whitespace-only name', () => {
    expect(validateUpdateChild({ childId: 1, name: '   ' }).valid).toBe(false);
  });

  test('rejects null name', () => {
    expect(validateUpdateChild({ childId: 1, name: null }).valid).toBe(false);
  });

  test('rejects null data', () => {
    expect(validateUpdateChild(null).valid).toBe(false);
  });
});

// =============================================================================
// TESTS: Days parameter validation (checkins/PEF history)
// =============================================================================

describe('Days Parameter Validation', () => {

  test('accepts 7 days', () => {
    expect(validateDaysParam(7)).toBe(true);
  });

  test('accepts 30 days', () => {
    expect(validateDaysParam(30)).toBe(true);
  });

  test('accepts 365 days', () => {
    expect(validateDaysParam(365)).toBe(true);
  });

  test('rejects 0 days', () => {
    expect(validateDaysParam(0)).toBe(false);
  });

  test('rejects negative days', () => {
    expect(validateDaysParam(-1)).toBe(false);
  });

  test('rejects 366 days (over max)', () => {
    expect(validateDaysParam(366)).toBe(false);
  });

  test('rejects NaN', () => {
    expect(validateDaysParam('abc')).toBe(false);
  });

  test('rejects null', () => {
    expect(validateDaysParam(null)).toBe(false);
  });

  test('accepts string number (coerced)', () => {
    expect(validateDaysParam('14')).toBe(true);
  });
});
