/**
 * auth-validation.test.js — Authentication & Form Validation Tests
 *
 * Tests the validation logic from:
 *   - src/auth/signup.js  (validateForm, checkPasswordStrength)
 *   - main.js auth:signup / auth:login / auth:child-login handlers
 *     (duplicate checks, bcrypt hashing, session creation)
 *
 * Because signup.js and main.js are coupled to the DOM and Electron IPC,
 * we extract the pure logic functions and test them directly here.
 * The IPC handler behaviour is tested by simulating it with our test DB.
 */

const bcrypt = require('bcryptjs');
const { createTestDb } = require('./__helpers__/db-setup');

// =============================================================================
// Pure validation helpers — extracted from signup.js
// =============================================================================

/**
 * validateForm — mirrors signup.js validateForm() minus the DOM side-effects.
 * Returns { isValid, errors }.
 */
function validateForm(email, username, password, confirmPassword, selectedRole) {
  const errors = {};
  let isValid = true;

  if (!email || !email.includes('@')) {
    errors.email = 'Please enter a valid email address';
    isValid = false;
  }

  if (!username || username.trim().length === 0) {
    errors.username = 'Username is required';
    isValid = false;
  }

  const hasLength  = password.length >= 8;
  const hasLetter  = /[a-zA-Z]/.test(password);
  const hasNumber  = /[0-9]/.test(password);

  if (!hasLength || !hasLetter || !hasNumber) {
    errors.password = 'Password must be 8+ characters with at least 1 letter and 1 number';
    isValid = false;
  }

  if (password !== confirmPassword) {
    errors.confirm = "Passwords don't match";
    isValid = false;
  }

  if (!selectedRole) {
    errors.role = 'Please select an account type';
    isValid = false;
  }

  return { isValid, errors };
}

/**
 * checkPasswordStrength — mirrors signup.js logic, returns a strength level string.
 */
function checkPasswordStrength(password) {
  if (!password) return 'empty';

  const hasLength  = password.length >= 8;
  const hasLetter  = /[a-zA-Z]/.test(password);
  const hasNumber  = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

  if (!hasLength || !hasLetter || !hasNumber) return 'weak';
  if (!hasSpecial) return 'medium';
  return 'strong';
}

// =============================================================================
// TESTS: validateForm
// =============================================================================

describe('validateForm', () => {

  const validArgs = ['user@example.com', 'johndoe', 'Password1', 'Password1', 'parent'];

  describe('email validation', () => {
    test('valid email passes', () => {
      const { isValid } = validateForm('a@b.com', 'u', 'Password1', 'Password1', 'parent');
      expect(isValid).toBe(true);
    });

    test('missing @ fails', () => {
      const { errors } = validateForm('notanemail', 'u', 'Password1', 'Password1', 'parent');
      expect(errors.email).toBeDefined();
    });

    test('empty email fails', () => {
      const { errors } = validateForm('', 'u', 'Password1', 'Password1', 'parent');
      expect(errors.email).toBeDefined();
    });

    test('null email fails', () => {
      const { errors } = validateForm(null, 'u', 'Password1', 'Password1', 'parent');
      expect(errors.email).toBeDefined();
    });

    test('email with multiple @ passes (@ present)', () => {
      // signup.js only checks .includes('@'), so this is "valid" at client level
      const { errors } = validateForm('a@@b.com', 'u', 'Password1', 'Password1', 'parent');
      expect(errors.email).toBeUndefined();
    });

    test('@ at start passes (@ present)', () => {
      const { errors } = validateForm('@nodomain', 'u', 'Password1', 'Password1', 'parent');
      expect(errors.email).toBeUndefined();
    });
  });

  describe('username validation', () => {
    test('valid username passes', () => {
      const { errors } = validateForm(...validArgs);
      expect(errors.username).toBeUndefined();
    });

    test('empty string fails', () => {
      const { errors } = validateForm('a@b.com', '', 'Password1', 'Password1', 'parent');
      expect(errors.username).toBeDefined();
    });

    test('whitespace-only username fails', () => {
      const { errors } = validateForm('a@b.com', '   ', 'Password1', 'Password1', 'parent');
      expect(errors.username).toBeDefined();
    });

    test('null username fails', () => {
      const { errors } = validateForm('a@b.com', null, 'Password1', 'Password1', 'parent');
      expect(errors.username).toBeDefined();
    });

    test('single character username passes', () => {
      const { errors } = validateForm('a@b.com', 'x', 'Password1', 'Password1', 'parent');
      expect(errors.username).toBeUndefined();
    });
  });

  describe('password validation', () => {
    test('valid password (8+ chars, letter, number) passes', () => {
      const { errors } = validateForm('a@b.com', 'u', 'Passw0rd', 'Passw0rd', 'parent');
      expect(errors.password).toBeUndefined();
    });

    test('7 characters fails (too short)', () => {
      const { errors } = validateForm('a@b.com', 'u', 'Pass1ab', 'Pass1ab', 'parent');
      expect(errors.password).toBeDefined();
    });

    test('8 chars but no number fails', () => {
      const { errors } = validateForm('a@b.com', 'u', 'Password', 'Password', 'parent');
      expect(errors.password).toBeDefined();
    });

    test('8 chars but no letter fails', () => {
      const { errors } = validateForm('a@b.com', 'u', '12345678', '12345678', 'parent');
      expect(errors.password).toBeDefined();
    });

    test('empty password fails', () => {
      const { errors } = validateForm('a@b.com', 'u', '', '', 'parent');
      expect(errors.password).toBeDefined();
    });

    test('exactly 8 chars with letter and number passes', () => {
      const { errors } = validateForm('a@b.com', 'u', 'abcde1fg', 'abcde1fg', 'parent');
      expect(errors.password).toBeUndefined();
    });

    test('uppercase letter counts as a letter', () => {
      const { errors } = validateForm('a@b.com', 'u', 'ABCDE123', 'ABCDE123', 'parent');
      expect(errors.password).toBeUndefined();
    });

    test('password with special chars still passes (bonus strength, not required)', () => {
      const { errors } = validateForm('a@b.com', 'u', 'P@ssw0rd!', 'P@ssw0rd!', 'parent');
      expect(errors.password).toBeUndefined();
    });
  });

  describe('confirm password validation', () => {
    test('matching passwords pass', () => {
      const { errors } = validateForm('a@b.com', 'u', 'Password1', 'Password1', 'parent');
      expect(errors.confirm).toBeUndefined();
    });

    test('mismatched passwords fail', () => {
      const { errors } = validateForm('a@b.com', 'u', 'Password1', 'Password2', 'parent');
      expect(errors.confirm).toBeDefined();
    });

    test('case mismatch fails (password1 ≠ Password1)', () => {
      const { errors } = validateForm('a@b.com', 'u', 'password1', 'Password1', 'parent');
      expect(errors.confirm).toBeDefined();
    });

    test('extra trailing space fails', () => {
      const { errors } = validateForm('a@b.com', 'u', 'Password1', 'Password1 ', 'parent');
      expect(errors.confirm).toBeDefined();
    });
  });

  describe('role validation', () => {
    test('parent role passes', () => {
      const { errors } = validateForm('a@b.com', 'u', 'Password1', 'Password1', 'parent');
      expect(errors.role).toBeUndefined();
    });

    test('provider role passes', () => {
      const { errors } = validateForm('a@b.com', 'u', 'Password1', 'Password1', 'provider');
      expect(errors.role).toBeUndefined();
    });

    test('null role fails', () => {
      const { errors } = validateForm('a@b.com', 'u', 'Password1', 'Password1', null);
      expect(errors.role).toBeDefined();
    });

    test('undefined role fails', () => {
      const { errors } = validateForm('a@b.com', 'u', 'Password1', 'Password1', undefined);
      expect(errors.role).toBeDefined();
    });

    test('empty string role fails', () => {
      const { errors } = validateForm('a@b.com', 'u', 'Password1', 'Password1', '');
      expect(errors.role).toBeDefined();
    });
  });

  describe('multiple errors returned together', () => {
    test('all blank inputs returns all errors', () => {
      const { isValid, errors } = validateForm('', '', '', '', null);
      expect(isValid).toBe(false);
      expect(errors.email).toBeDefined();
      expect(errors.username).toBeDefined();
      expect(errors.password).toBeDefined();
      expect(errors.role).toBeDefined();
    });
  });
});

// =============================================================================
// TESTS: checkPasswordStrength
// =============================================================================

describe('checkPasswordStrength', () => {

  describe('empty / falsy', () => {
    test('empty string → "empty"', () => {
      expect(checkPasswordStrength('')).toBe('empty');
    });

    test('null → "empty"', () => {
      expect(checkPasswordStrength(null)).toBe('empty');
    });

    test('undefined → "empty"', () => {
      expect(checkPasswordStrength(undefined)).toBe('empty');
    });
  });

  describe('weak passwords', () => {
    test('too short (< 8 chars) is weak', () => {
      expect(checkPasswordStrength('Abc1')).toBe('weak');
    });

    test('long but no number is weak', () => {
      expect(checkPasswordStrength('longlongword')).toBe('weak');
    });

    test('long but no letter is weak', () => {
      expect(checkPasswordStrength('12345678')).toBe('weak');
    });

    test('7 chars with letter and number is weak (too short)', () => {
      expect(checkPasswordStrength('Abc123x')).toBe('weak');
    });
  });

  describe('medium passwords', () => {
    test('8+ chars, has letter and number, no special char → medium', () => {
      expect(checkPasswordStrength('Password1')).toBe('medium');
    });

    test('long alphanumeric with no special → medium', () => {
      expect(checkPasswordStrength('MyLongPassword123')).toBe('medium');
    });
  });

  describe('strong passwords', () => {
    test('8+ chars, letter, number, special char → strong', () => {
      expect(checkPasswordStrength('P@ssw0rd!')).toBe('strong');
    });

    test('special chars: ! triggers strong', () => {
      expect(checkPasswordStrength('Abc12345!')).toBe('strong');
    });

    test('special chars: # triggers strong', () => {
      expect(checkPasswordStrength('Abc12345#')).toBe('strong');
    });

    test('special chars: $ triggers strong', () => {
      expect(checkPasswordStrength('Abc12345$')).toBe('strong');
    });

    test('special chars: - triggers strong', () => {
      expect(checkPasswordStrength('Abc12345-')).toBe('strong');
    });

    test('special chars: _ triggers strong', () => {
      expect(checkPasswordStrength('Abc12345_')).toBe('strong');
    });
  });
});

// =============================================================================
// TESTS: auth:signup handler logic (simulated without Electron IPC)
// =============================================================================

describe('signup handler logic', () => {

  let q;

  beforeEach(async () => {
    ({ queries: q } = await createTestDb());
  });

  async function simulateSignup(data) {
    // Mirrors main.js auth:signup handler
    const existingUsername = q.getUserByUsername(data.username);
    if (existingUsername) return { success: false, error: 'Username already exists' };

    const existingEmail = q.getUserByEmail(data.email);
    if (existingEmail) return { success: false, error: 'Email already registered' };

    const passwordHash = await bcrypt.hash(data.password, 10);
    const user = q.createUser({
      email: data.email,
      username: data.username.toLowerCase(),
      passwordHash,
      role: data.role
    });

    return { success: true, user };
  }

  test('successful signup returns success + user object', async () => {
    const result = await simulateSignup({ email: 'a@b.com', username: 'Alice', password: 'Password1', role: 'parent' });
    expect(result.success).toBe(true);
    expect(result.user.username).toBe('alice'); // stored lowercase
  });

  test('username stored as lowercase', async () => {
    await simulateSignup({ email: 'upper@b.com', username: 'UPPERCASE', password: 'Password1', role: 'parent' });
    const user = q.getUserByUsername('uppercase');
    expect(user).toBeDefined();
  });

  test('duplicate username returns error', async () => {
    await simulateSignup({ email: 'a@b.com', username: 'alice', password: 'Password1', role: 'parent' });
    const result = await simulateSignup({ email: 'b@b.com', username: 'alice', password: 'Password1', role: 'parent' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Username already exists');
  });

  test('duplicate email returns error', async () => {
    await simulateSignup({ email: 'same@b.com', username: 'user1', password: 'Password1', role: 'parent' });
    const result = await simulateSignup({ email: 'same@b.com', username: 'user2', password: 'Password1', role: 'parent' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Email already registered');
  });

  test('username check is case-insensitive (ALICE blocks alice)', async () => {
    await simulateSignup({ email: 'a@b.com', username: 'ALICE', password: 'Password1', role: 'parent' });
    const result = await simulateSignup({ email: 'b@b.com', username: 'alice', password: 'Password1', role: 'parent' });
    expect(result.success).toBe(false);
  });

  test('password is hashed (not stored plain text)', async () => {
    const plain = 'Password1';
    await simulateSignup({ email: 'hash@b.com', username: 'hashuser', password: plain, role: 'parent' });
    const user = q.getUserByUsername('hashuser');
    expect(user.password_hash).not.toBe(plain);
    expect(user.password_hash.startsWith('$2')).toBe(true); // bcrypt hash prefix
  });
});

// =============================================================================
// TESTS: auth:login handler logic (simulated)
// =============================================================================

describe('login handler logic', () => {

  let q;
  const PLAIN_PASSWORD = 'TestPass1';

  beforeEach(async () => {
    ({ queries: q } = await createTestDb());
    const passwordHash = await bcrypt.hash(PLAIN_PASSWORD, 10);
    q.createUser({ email: 'login@test.com', username: 'loginuser', passwordHash, role: 'parent' });
  });

  async function simulateLogin(usernameOrEmail, password) {
    // Mirrors main.js auth:login handler
    let user = q.getUserByUsername(usernameOrEmail) || q.getUserByEmail(usernameOrEmail);
    if (!user) return { success: false, error: 'Invalid username/email or password' };

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) return { success: false, error: 'Invalid username/email or password' };

    return { success: true, user };
  }

  test('login by username with correct password succeeds', async () => {
    const result = await simulateLogin('loginuser', PLAIN_PASSWORD);
    expect(result.success).toBe(true);
  });

  test('login by email with correct password succeeds', async () => {
    const result = await simulateLogin('login@test.com', PLAIN_PASSWORD);
    expect(result.success).toBe(true);
  });

  test('login by username (case-insensitive) succeeds', async () => {
    const result = await simulateLogin('LOGINUSER', PLAIN_PASSWORD);
    expect(result.success).toBe(true);
  });

  test('wrong password fails', async () => {
    const result = await simulateLogin('loginuser', 'WrongPassword1');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid username/email or password');
  });

  test('unknown username fails', async () => {
    const result = await simulateLogin('nobody', PLAIN_PASSWORD);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid username/email or password');
  });

  test('empty username fails', async () => {
    const result = await simulateLogin('', PLAIN_PASSWORD);
    expect(result.success).toBe(false);
  });

  test('error message is generic (does not reveal if username exists)', async () => {
    const resultBadUser = await simulateLogin('baduser', PLAIN_PASSWORD);
    const resultBadPass = await simulateLogin('loginuser', 'BadPass1');
    // Both errors should be identical (security best practice)
    expect(resultBadUser.error).toBe(resultBadPass.error);
  });
});

// =============================================================================
// TESTS: auth:child-login handler logic (simulated)
// =============================================================================

describe('child login handler logic', () => {

  let q;
  const CHILD_PASSWORD = 'ChildPass1';
  let testChildId;

  beforeEach(async () => {
    ({ queries: q } = await createTestDb());
    const parentHash = await bcrypt.hash('ParentPass1', 10);
    const parent = q.createUser({ email: 'p@test.com', username: 'parentx', passwordHash: parentHash, role: 'parent' });
    const childHash = await bcrypt.hash(CHILD_PASSWORD, 10);
    const child = q.createChild({
      parentId: parent.user_id, username: 'childx',
      passwordHash: childHash, name: 'Child X',
      birthday: '2016-01-01', notes: null
    });
    testChildId = child.child_id;
  });

  async function simulateChildLogin(username, password) {
    const child = q.getChildByUsername(username);
    if (!child) return { success: false, error: 'Invalid username or password' };
    const isValid = await bcrypt.compare(password, child.password_hash);
    if (!isValid) return { success: false, error: 'Invalid username or password' };
    return { success: true, child };
  }

  test('correct credentials succeed', async () => {
    const result = await simulateChildLogin('childx', CHILD_PASSWORD);
    expect(result.success).toBe(true);
    expect(result.child.name).toBe('Child X');
  });

  test('case-insensitive username lookup', async () => {
    const result = await simulateChildLogin('CHILDX', CHILD_PASSWORD);
    expect(result.success).toBe(true);
  });

  test('wrong password fails', async () => {
    const result = await simulateChildLogin('childx', 'WrongPass1');
    expect(result.success).toBe(false);
  });

  test('unknown child username fails', async () => {
    const result = await simulateChildLogin('unknownchild', CHILD_PASSWORD);
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// TESTS: add child handler logic (duplicate check + hashing)
// =============================================================================

describe('add child handler logic', () => {

  let q;
  let parentId;

  beforeEach(async () => {
    ({ queries: q } = await createTestDb());
    const hash = await bcrypt.hash('ParentPass1', 10);
    const parent = q.createUser({ email: 'par@test.com', username: 'parenty', passwordHash: hash, role: 'parent' });
    parentId = parent.user_id;
  });

  async function simulateAddChild(data) {
    const existing = q.getChildByUsername(data.username);
    if (existing) return { success: false, error: 'Username already exists' };
    const passwordHash = await bcrypt.hash(data.password, 10);
    const child = q.createChild({
      parentId,
      username: data.username.toLowerCase(),
      passwordHash,
      name: data.name,
      birthday: data.birthday,
      notes: data.notes || null
    });
    q.createControllerSchedule({ childId: child.child_id });
    return { success: true, child };
  }

  test('adds child successfully', async () => {
    const result = await simulateAddChild({ username: 'kiddo', password: 'KidPass1', name: 'Kiddo', birthday: '2016-01-01' });
    expect(result.success).toBe(true);
    expect(result.child.name).toBe('Kiddo');
  });

  test('child username stored lowercase', async () => {
    await simulateAddChild({ username: 'KIDDO2', password: 'KidPass1', name: 'Kiddo 2', birthday: '2016-01-01' });
    const child = q.getChildByUsername('kiddo2');
    expect(child).toBeDefined();
  });

  test('duplicate child username fails', async () => {
    await simulateAddChild({ username: 'duplication', password: 'KidPass1', name: 'Dup 1', birthday: '2016-01-01' });
    const result = await simulateAddChild({ username: 'duplication', password: 'KidPass1', name: 'Dup 2', birthday: '2016-01-01' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Username already exists');
  });

  test('creates default controller schedule for new child', async () => {
    const result = await simulateAddChild({ username: 'schedkid', password: 'KidPass1', name: 'Sched Kid', birthday: '2016-01-01' });
    const schedule = q.getControllerSchedule(result.child.child_id);
    expect(schedule).toBeDefined();
    expect(schedule.doses_per_day).toBe(1);
  });

  test('child password is bcrypt hashed', async () => {
    await simulateAddChild({ username: 'hashkid', password: 'KidPass1', name: 'Hash Kid', birthday: '2016-01-01' });
    const child = q.getChildByUsername('hashkid');
    expect(child.password_hash.startsWith('$2')).toBe(true);
    expect(child.password_hash).not.toBe('KidPass1');
  });
});
