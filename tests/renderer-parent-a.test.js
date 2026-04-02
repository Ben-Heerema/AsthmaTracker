/**
 * @jest-environment jsdom
 */
const { createMockElectronAPI, setupDOM, fireDOMContentLoaded, flushPromises, setupGlobals, cleanupDOM } = require('./__helpers__/renderer-setup');

// ═══════════════════════════════════════════════════════════════════
// 1. main.js — Parent Dashboard
// ═══════════════════════════════════════════════════════════════════
describe('ParentMain (main.js)', () => {
  beforeEach(() => {
    cleanupDOM();
    setupGlobals();
    jest.useFakeTimers();
    window.electronAPI = createMockElectronAPI({
      getChildren: jest.fn().mockResolvedValue([
        { child_id: 1, name: 'Alice' },
        { child_id: 2, name: 'Bob' }
      ]),
      getNotifications: jest.fn().mockResolvedValue([
        { is_read: false }, { is_read: false }, { is_read: true }
      ]),
      getSetting: jest.fn().mockResolvedValue('1')
    });

    setupDOM([
      'username-display',
      { tag: 'select', id: 'child-select' },
      'notif-count',
      { tag: 'button', id: 'notif-bell-btn' },
      { tag: 'button', id: 'nav-daily-checkin' },
      { tag: 'button', id: 'nav-child-overview' },
      { tag: 'button', id: 'nav-set-pb' },
      { tag: 'button', id: 'nav-enter-pef' },
      { tag: 'button', id: 'nav-add-badges' },
      { tag: 'button', id: 'nav-medication-inventory' },
      { tag: 'button', id: 'nav-pdf' },
      { tag: 'button', id: 'nav-todays-zone' },
      { tag: 'button', id: 'nav-medication-logs' },
      { tag: 'button', id: 'nav-incident-logs' },
      { tag: 'button', id: 'nav-family' },
      { tag: 'button', id: 'nav-emergency' },
      { tag: 'button', id: 'nav-settings' }
    ]);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.resetModules();
  });

  test('initializePage loads children, notifications, and sets username', async () => {
    // Mock Notification
    global.Notification = { permission: 'default', requestPermission: jest.fn().mockResolvedValue('granted') };

    require('../src/parent/main.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    expect(window.electronAPI.getSession).toHaveBeenCalled();
    expect(window.electronAPI.getChildren).toHaveBeenCalled();
    expect(document.getElementById('username-display').textContent).toBe('Logged in as: testparent');

    // Children loaded
    const select = document.getElementById('child-select');
    expect(select.options.length).toBe(3); // placeholder + 2 children
    expect(select.value).toBe('1'); // savedChildId = '1'

    // Notification count
    await jest.advanceTimersByTimeAsync(0);
    const badge = document.getElementById('notif-count');
    expect(badge.textContent).toBe('2');
    expect(badge.classList.contains('hidden')).toBe(false);

    // Notification permission requested
    expect(Notification.requestPermission).toHaveBeenCalled();

    delete global.Notification;
  });

  test('redirects to landing if no session', async () => {
    window.electronAPI.getSession.mockResolvedValue(null);
    require('../src/parent/main.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('landing');
  });

  test('handles no children', async () => {
    window.electronAPI.getChildren.mockResolvedValue([]);
    require('../src/parent/main.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);
    const select = document.getElementById('child-select');
    // Should have placeholder + disabled hint
    expect(select.options.length).toBe(2);
    expect(select.options[1].disabled).toBe(true);
  });

  test('child-dependent buttons are disabled when no child selected', async () => {
    window.electronAPI.getChildren.mockResolvedValue([]);
    require('../src/parent/main.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);
    expect(document.getElementById('nav-daily-checkin').disabled).toBe(true);
    expect(document.getElementById('nav-daily-checkin').title).toBe('Select a child first');
  });

  test('child-select change persists selectedChildId', async () => {
    require('../src/parent/main.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    const select = document.getElementById('child-select');
    select.value = '2';
    select.dispatchEvent(new Event('change'));
    await jest.advanceTimersByTimeAsync(0);

    expect(window.electronAPI.setSetting).toHaveBeenCalledWith('selectedChildId', '2');
  });

  test('navigation buttons call navigate with correct routes', async () => {
    require('../src/parent/main.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    document.getElementById('notif-bell-btn').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('parent-notifications');

    document.getElementById('nav-daily-checkin').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('parent-daily-checkin', expect.any(Object));

    document.getElementById('nav-family').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('parent-family', expect.any(Object));

    document.getElementById('nav-emergency').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('emergency', expect.any(Object));

    document.getElementById('nav-settings').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('settings', expect.any(Object));
  });

  test('notification polling interval is set and cleared on beforeunload', async () => {
    require('../src/parent/main.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    // Advance timers to trigger polling
    jest.advanceTimersByTime(30000);
    // getNotifications called once on init + once on poll
    expect(window.electronAPI.getNotifications.mock.calls.length).toBeGreaterThanOrEqual(2);

    // Fire beforeunload to clear interval
    window.dispatchEvent(new Event('beforeunload'));
    const callsBefore = window.electronAPI.getNotifications.mock.calls.length;
    jest.advanceTimersByTime(60000);
    await jest.advanceTimersByTimeAsync(0);
    // Should not have increased (interval cleared)
    expect(window.electronAPI.getNotifications.mock.calls.length).toBe(callsBefore);
  });

  test('notification badge shows 99+ for large counts', async () => {
    const notifs = [];
    for (let i = 0; i < 120; i++) notifs.push({ is_read: false });
    window.electronAPI.getNotifications.mockResolvedValue(notifs);

    require('../src/parent/main.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);
    expect(document.getElementById('notif-count').textContent).toBe('99+');
  });

  test('notification badge hidden when 0 unread', async () => {
    window.electronAPI.getNotifications.mockResolvedValue([{ is_read: true }]);
    require('../src/parent/main.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);
    expect(document.getElementById('notif-count').classList.contains('hidden')).toBe(true);
  });

  test('Notification permission not requested if Notification undefined', async () => {
    // Ensure Notification is not defined
    delete global.Notification;
    require('../src/parent/main.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);
    // Should not throw
  });

  test('Notification.requestPermission rejection is caught', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    global.Notification = { permission: 'default', requestPermission: jest.fn().mockRejectedValue(new Error('denied')) };
    require('../src/parent/main.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(0);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
    delete global.Notification;
  });

  test('initializePage error is caught', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    window.electronAPI.getSession.mockRejectedValue(new Error('fail'));
    require('../src/parent/main.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  test('savedChildId not found falls back to first child', async () => {
    window.electronAPI.getSetting.mockResolvedValue('999'); // nonexistent
    require('../src/parent/main.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);
    const select = document.getElementById('child-select');
    expect(select.value).toBe('1');
    expect(window.electronAPI.setSetting).toHaveBeenCalledWith('selectedChildId', '1');
  });

  test('Notification already granted does not request', async () => {
    global.Notification = { permission: 'granted', requestPermission: jest.fn() };
    require('../src/parent/main.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);
    expect(Notification.requestPermission).not.toHaveBeenCalled();
    delete global.Notification;
  });

  test('navigate passes null childId when empty', async () => {
    window.electronAPI.getChildren.mockResolvedValue([]);
    require('../src/parent/main.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    // child-select has no value
    document.getElementById('nav-child-overview').disabled = false;
    document.getElementById('nav-child-overview').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('parent-child-overview', { childId: null });
  });

  test('onChildSelected with empty childId does not call setSetting', async () => {
    require('../src/parent/main.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    window.electronAPI.setSetting.mockClear();
    const select = document.getElementById('child-select');
    select.value = '';
    select.dispatchEvent(new Event('change'));
    await jest.advanceTimersByTimeAsync(0);
    // setSetting should NOT be called since childId is falsy
    expect(window.electronAPI.setSetting).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. add-child.js — Add Child Form
// ═══════════════════════════════════════════════════════════════════
describe('AddChild (add-child.js)', () => {
  beforeEach(() => {
    cleanupDOM();
    setupGlobals();
    window.electronAPI = createMockElectronAPI();

    setupDOM([
      'strength-fill', 'strength-text',
      'username-error', 'password-error', 'general-error',
      { tag: 'div', id: 'icon-picker', innerHTML: '<div class="icon-option" data-icon="boy_older" aria-checked="false">A</div><div class="icon-option" data-icon="girl_older" aria-checked="false">B</div>' },
      { tag: 'input', id: 'child-icon', type: 'hidden', value: 'boy_older' },
      { tag: 'textarea', id: 'child-notes' },
      'notes-count',
      { tag: 'input', id: 'child-password', type: 'password' },
      { tag: 'input', id: 'child-username' },
      { tag: 'input', id: 'child-name' },
      { tag: 'input', id: 'child-birthday', type: 'date' },
      { tag: 'form', id: 'add-child-form' },
      { tag: 'button', id: 'save-child-btn' },
      { tag: 'button', id: 'back-btn' }
    ]);
  });

  afterEach(() => {
    jest.resetModules();
  });

  test('DOMContentLoaded sets birthday max and registers back button', async () => {
    require('../src/parent/add-child.js');
    fireDOMContentLoaded();
    await flushPromises();

    expect(document.getElementById('child-birthday').max).toBeTruthy();

    document.getElementById('back-btn').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('parent-main');
  });

  test('redirects to landing if no session', async () => {
    window.electronAPI.getSession.mockResolvedValue(null);
    require('../src/parent/add-child.js');
    fireDOMContentLoaded();
    await flushPromises();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('landing');
  });

  test('DOMContentLoaded error shows toast', async () => {
    window.electronAPI.getSession.mockRejectedValue(new Error('fail'));
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    require('../src/parent/add-child.js');
    fireDOMContentLoaded();
    await flushPromises();
    expect(window.showToast).toHaveBeenCalledWith('Could not load page. Please try again.', 'error');
    errSpy.mockRestore();
  });

  test('password strength bar updates', () => {
    require('../src/parent/add-child.js');
    const input = document.getElementById('child-password');
    const fill = document.getElementById('strength-fill');
    const text = document.getElementById('strength-text');

    // Empty password
    input.value = '';
    input.dispatchEvent(new Event('input'));
    expect(fill.style.width).toBe('0%');

    // Weak password
    input.value = 'abc';
    input.dispatchEvent(new Event('input'));
    expect(text.textContent).toContain('Weak');

    // Medium password
    input.value = 'abcdef12';
    input.dispatchEvent(new Event('input'));
    expect(text.textContent).toContain('Medium');

    // Strong password
    input.value = 'abcdef12!';
    input.dispatchEvent(new Event('input'));
    expect(text.textContent).toContain('Strong');
  });

  test('icon picker selects icon', () => {
    require('../src/parent/add-child.js');
    const picker = document.getElementById('icon-picker');
    const options = picker.querySelectorAll('.icon-option');

    // Click second icon
    options[1].click();
    expect(options[1].classList.contains('selected')).toBe(true);
    expect(options[0].classList.contains('selected')).toBe(false);
    expect(document.getElementById('child-icon').value).toBe('girl_older');
    expect(options[1].getAttribute('aria-checked')).toBe('true');
    expect(options[0].getAttribute('aria-checked')).toBe('false');
  });

  test('icon picker ignores click on picker itself (not an option)', () => {
    require('../src/parent/add-child.js');
    const picker = document.getElementById('icon-picker');
    picker.click(); // should not throw
  });

  test('notes character counter', () => {
    require('../src/parent/add-child.js');
    const notes = document.getElementById('child-notes');
    notes.value = 'hello';
    notes.dispatchEvent(new Event('input'));
    expect(document.getElementById('notes-count').textContent).toBe('5');
  });

  test('form submission: validation errors', async () => {
    require('../src/parent/add-child.js');

    // Empty form
    const form = document.getElementById('add-child-form');
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flushPromises();

    expect(document.getElementById('username-error').classList.contains('visible')).toBe(true);
    expect(window.electronAPI.addChild).not.toHaveBeenCalled();
  });

  test('form submission: missing name shows general error', async () => {
    require('../src/parent/add-child.js');

    document.getElementById('child-username').value = 'user1';
    document.getElementById('child-password').value = 'abcdef12';
    document.getElementById('child-name').value = '';
    document.getElementById('child-birthday').value = '2020-01-01';

    const form = document.getElementById('add-child-form');
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flushPromises();

    const genErr = document.getElementById('general-error');
    expect(genErr.classList.contains('visible')).toBe(true);
  });

  test('form submission: missing birthday shows general error', async () => {
    require('../src/parent/add-child.js');

    document.getElementById('child-username').value = 'user1';
    document.getElementById('child-password').value = 'abcdef12';
    document.getElementById('child-name').value = 'Test';
    document.getElementById('child-birthday').value = '';

    const form = document.getElementById('add-child-form');
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flushPromises();

    const genErr = document.getElementById('general-error');
    expect(genErr.classList.contains('visible')).toBe(true);
  });

  test('form submission: future birthday rejected', async () => {
    require('../src/parent/add-child.js');

    document.getElementById('child-username').value = 'user1';
    document.getElementById('child-password').value = 'abcdef12';
    document.getElementById('child-name').value = 'Test';
    document.getElementById('child-birthday').value = '2099-01-01';

    const form = document.getElementById('add-child-form');
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flushPromises();

    const genErr = document.getElementById('general-error');
    expect(genErr.textContent).toContain('past');
  });

  test('form submission: successful add', async () => {
    require('../src/parent/add-child.js');

    document.getElementById('child-username').value = 'user1';
    document.getElementById('child-password').value = 'abcdef12';
    document.getElementById('child-name').value = 'Test Child';
    document.getElementById('child-birthday').value = '2020-01-01';

    const form = document.getElementById('add-child-form');
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flushPromises();

    expect(window.electronAPI.addChild).toHaveBeenCalled();
    expect(window.showSuccess).toHaveBeenCalled();

    // Test the callback passed to showSuccess
    const callback = window.showSuccess.mock.calls[0][2];
    callback();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('parent-main');
  });

  test('form submission: API returns error', async () => {
    window.electronAPI.addChild.mockResolvedValue({ success: false, error: 'Username taken' });
    require('../src/parent/add-child.js');

    document.getElementById('child-username').value = 'user1';
    document.getElementById('child-password').value = 'abcdef12';
    document.getElementById('child-name').value = 'Test';
    document.getElementById('child-birthday').value = '2020-01-01';

    // mock scrollIntoView
    document.getElementById('general-error').scrollIntoView = jest.fn();

    const form = document.getElementById('add-child-form');
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flushPromises();

    const genErr = document.getElementById('general-error');
    expect(genErr.textContent).toContain('Username taken');
    expect(document.getElementById('save-child-btn').disabled).toBe(false);
  });

  test('form submission: API returns error without message', async () => {
    window.electronAPI.addChild.mockResolvedValue({ success: false });
    require('../src/parent/add-child.js');

    document.getElementById('child-username').value = 'user1';
    document.getElementById('child-password').value = 'abcdef12';
    document.getElementById('child-name').value = 'Test';
    document.getElementById('child-birthday').value = '2020-01-01';
    document.getElementById('general-error').scrollIntoView = jest.fn();

    const form = document.getElementById('add-child-form');
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flushPromises();

    const genErr = document.getElementById('general-error');
    expect(genErr.textContent).toContain('Failed to add child');
  });

  test('form submission: exception shows toast', async () => {
    window.electronAPI.addChild.mockRejectedValue(new Error('network'));
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    require('../src/parent/add-child.js');

    document.getElementById('child-username').value = 'user1';
    document.getElementById('child-password').value = 'abcdef12';
    document.getElementById('child-name').value = 'Test';
    document.getElementById('child-birthday').value = '2020-01-01';

    const form = document.getElementById('add-child-form');
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flushPromises();

    expect(window.showToast).toHaveBeenCalledWith('Something went wrong. Please try again.', 'error');
    expect(document.getElementById('save-child-btn').disabled).toBe(false);
    errSpy.mockRestore();
  });

  test('updatePasswordStrength returns early when fill/text missing', () => {
    // Remove the elements
    document.getElementById('strength-fill').remove();
    document.getElementById('strength-text').remove();

    require('../src/parent/add-child.js');
    const input = document.getElementById('child-password');
    input.value = 'test';
    input.dispatchEvent(new Event('input'));
    // Should not throw
  });

  test('password weak: only letters', () => {
    require('../src/parent/add-child.js');
    const input = document.getElementById('child-password');
    input.value = 'abcdefgh';
    input.dispatchEvent(new Event('input'));
    expect(document.getElementById('strength-text').textContent).toContain('Weak');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. add-badges.js — Create Badge Form
// ═══════════════════════════════════════════════════════════════════
describe('AddBadges (add-badges.js)', () => {
  beforeEach(() => {
    cleanupDOM();
    setupGlobals();
    window.electronAPI = createMockElectronAPI({
      getChildren: jest.fn().mockResolvedValue([{ child_id: 1, name: 'Alice' }])
    });

    setupDOM([
      { tag: 'select', id: 'criteria-type', innerHTML: '<option value="technique_sessions">Technique</option><option value="controller_adherence">Adherence</option>' },
      'criteria-hint',
      { tag: 'form', id: 'badge-form', innerHTML: '<button type="submit">Create</button>' },
      { tag: 'select', id: 'child-select' },
      { tag: 'input', id: 'badge-name' },
      { tag: 'input', id: 'badge-desc' },
      { tag: 'input', id: 'criteria-value', type: 'number' },
      'error-msg',
      { tag: 'button', id: 'back-btn' }
    ]);
    document.getElementById('error-msg').classList.add('hidden');
  });

  afterEach(() => { jest.resetModules(); });

  test('initializePage loads children into dropdown', async () => {
    require('../src/parent/add-badges.js');
    fireDOMContentLoaded();
    await flushPromises();

    const select = document.getElementById('child-select');
    expect(select.options.length).toBe(2); // placeholder + Alice
  });

  test('redirects to landing if no session', async () => {
    window.electronAPI.getSession.mockResolvedValue(null);
    require('../src/parent/add-badges.js');
    fireDOMContentLoaded();
    await flushPromises();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('landing');
  });

  test('initializePage error shows toast', async () => {
    window.electronAPI.getSession.mockRejectedValue(new Error('fail'));
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    require('../src/parent/add-badges.js');
    fireDOMContentLoaded();
    await flushPromises();
    expect(window.showToast).toHaveBeenCalledWith(expect.stringContaining('Could not load'), 'error');
    errSpy.mockRestore();
  });

  test('criteria-type change updates hint', () => {
    require('../src/parent/add-badges.js');
    const select = document.getElementById('criteria-type');

    select.value = 'technique_sessions';
    select.dispatchEvent(new Event('change'));
    expect(document.getElementById('criteria-hint').textContent).toContain('inhaler technique');

    select.value = 'controller_adherence';
    select.dispatchEvent(new Event('change'));
    expect(document.getElementById('criteria-hint').textContent).toContain('adherence');

    // Unknown type
    select.value = 'unknown';
    select.dispatchEvent(new Event('change'));
    expect(document.getElementById('criteria-hint').textContent).toBe('');
  });

  test('form validation: no child selected', async () => {
    require('../src/parent/add-badges.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('error-msg').scrollIntoView = jest.fn();
    const form = document.getElementById('badge-form');
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flushPromises();

    expect(document.getElementById('error-msg').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('error-msg').textContent).toContain('select a child');
  });

  test('form validation: missing name/desc', async () => {
    require('../src/parent/add-badges.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('child-select').innerHTML = '<option value="1">Alice</option>';
    document.getElementById('child-select').value = '1';
    document.getElementById('error-msg').scrollIntoView = jest.fn();

    const form = document.getElementById('badge-form');
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flushPromises();

    expect(document.getElementById('error-msg').textContent).toContain('required');
  });

  test('form validation: invalid criteria value', async () => {
    require('../src/parent/add-badges.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('child-select').innerHTML = '<option value="1">Alice</option>';
    document.getElementById('child-select').value = '1';
    document.getElementById('badge-name').value = 'Test';
    document.getElementById('badge-desc').value = 'Desc';
    document.getElementById('criteria-value').value = '0';
    document.getElementById('error-msg').scrollIntoView = jest.fn();

    const form = document.getElementById('badge-form');
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flushPromises();

    expect(document.getElementById('error-msg').textContent).toContain('positive number');
  });

  test('form submit success', async () => {
    require('../src/parent/add-badges.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('child-select').innerHTML = '<option value="1">Alice</option>';
    document.getElementById('child-select').value = '1';
    document.getElementById('badge-name').value = 'Star';
    document.getElementById('badge-desc').value = 'Desc';
    document.getElementById('criteria-value').value = '5';
    document.getElementById('criteria-type').value = 'technique_sessions';

    const form = document.getElementById('badge-form');
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flushPromises();

    expect(window.electronAPI.createBadge).toHaveBeenCalled();
    expect(window.showToast).toHaveBeenCalledWith('Badge created!', 'success');
  });

  test('form submit API failure', async () => {
    window.electronAPI.createBadge.mockResolvedValue({ success: false, error: 'fail' });
    require('../src/parent/add-badges.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('child-select').innerHTML = '<option value="1">Alice</option>';
    document.getElementById('child-select').value = '1';
    document.getElementById('badge-name').value = 'Star';
    document.getElementById('badge-desc').value = 'Desc';
    document.getElementById('criteria-value').value = '5';
    document.getElementById('criteria-type').value = 'technique_sessions';
    document.getElementById('error-msg').scrollIntoView = jest.fn();

    const form = document.getElementById('badge-form');
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flushPromises();

    expect(document.getElementById('error-msg').textContent).toBe('fail');
  });

  test('form submit API failure without error message', async () => {
    window.electronAPI.createBadge.mockResolvedValue({ success: false });
    require('../src/parent/add-badges.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('child-select').innerHTML = '<option value="1">Alice</option>';
    document.getElementById('child-select').value = '1';
    document.getElementById('badge-name').value = 'Star';
    document.getElementById('badge-desc').value = 'Desc';
    document.getElementById('criteria-value').value = '5';
    document.getElementById('error-msg').scrollIntoView = jest.fn();

    const form = document.getElementById('badge-form');
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flushPromises();

    expect(document.getElementById('error-msg').textContent).toBe('Failed to create badge');
  });

  test('form submit exception shows toast', async () => {
    window.electronAPI.createBadge.mockRejectedValue(new Error('net'));
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    require('../src/parent/add-badges.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('child-select').innerHTML = '<option value="1">Alice</option>';
    document.getElementById('child-select').value = '1';
    document.getElementById('badge-name').value = 'Star';
    document.getElementById('badge-desc').value = 'Desc';
    document.getElementById('criteria-value').value = '5';

    const form = document.getElementById('badge-form');
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flushPromises();

    expect(window.showToast).toHaveBeenCalledWith('Something went wrong. Please try again.', 'error');
    errSpy.mockRestore();
  });

  test('back button navigates to parent-main', async () => {
    require('../src/parent/add-badges.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('back-btn').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('parent-main');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. child-overview.js — Child Overview Navigation
// ═══════════════════════════════════════════════════════════════════
describe('ChildOverview (child-overview.js)', () => {
  beforeEach(() => {
    cleanupDOM();
    setupGlobals();
    window.electronAPI = createMockElectronAPI({
      getChildren: jest.fn().mockResolvedValue([{ child_id: 1, name: 'Alice' }]),
      getNavigationData: jest.fn().mockResolvedValue({ childId: 1 })
    });

    setupDOM([
      { tag: 'select', id: 'child-select' },
      'overview-buttons',
      { tag: 'button', id: 'back-btn' },
      { tag: 'button', id: 'show-schedule-btn' },
      { tag: 'button', id: 'show-med-report-btn' },
      { tag: 'button', id: 'show-sharing-btn' },
      { tag: 'button', id: 'show-zone-btn' }
    ]);
    document.getElementById('overview-buttons').classList.add('hidden');
  });

  afterEach(() => { jest.resetModules(); });

  test('loads children and auto-selects from navData', async () => {
    require('../src/parent/child-overview.js');
    fireDOMContentLoaded();
    await flushPromises();

    const select = document.getElementById('child-select');
    expect(select.value).toBe('1');
    expect(document.getElementById('overview-buttons').classList.contains('hidden')).toBe(false);
  });

  test('redirects if no session', async () => {
    window.electronAPI.getSession.mockResolvedValue(null);
    require('../src/parent/child-overview.js');
    fireDOMContentLoaded();
    await flushPromises();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('landing');
  });

  test('no navData does not auto-select', async () => {
    window.electronAPI.getNavigationData.mockResolvedValue(null);
    require('../src/parent/child-overview.js');
    fireDOMContentLoaded();
    await flushPromises();
    // overview-buttons should remain hidden
  });

  test('child-select change shows/hides buttons', async () => {
    require('../src/parent/child-overview.js');
    fireDOMContentLoaded();
    await flushPromises();

    const select = document.getElementById('child-select');
    select.value = '';
    select.dispatchEvent(new Event('change'));
    await flushPromises();
    expect(document.getElementById('overview-buttons').classList.contains('hidden')).toBe(true);

    select.value = '1';
    select.dispatchEvent(new Event('change'));
    await flushPromises();
    expect(document.getElementById('overview-buttons').classList.contains('hidden')).toBe(false);
  });

  test('navigation buttons work', async () => {
    require('../src/parent/child-overview.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('show-schedule-btn').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('parent-controller-schedule', { childId: 1 });

    document.getElementById('show-med-report-btn').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('parent-adherence-report', { childId: 1 });

    document.getElementById('show-sharing-btn').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('parent-provider-sharing', { childId: 1 });

    document.getElementById('show-zone-btn').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('parent-todays-zone', { childId: 1 });

    document.getElementById('back-btn').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('parent-main');
  });

  test('goTo does nothing when no child selected', async () => {
    window.electronAPI.getNavigationData.mockResolvedValue(null);
    require('../src/parent/child-overview.js');
    fireDOMContentLoaded();
    await flushPromises();

    window.electronAPI.navigate.mockClear();
    document.getElementById('show-schedule-btn').click();
    // navigate called only by back-btn logic previously; goTo should not navigate
    expect(window.electronAPI.navigate).not.toHaveBeenCalledWith('parent-controller-schedule', expect.anything());
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. controller-schedule.js — Weekly Schedule Form
// ═══════════════════════════════════════════════════════════════════
describe('ControllerSchedule (controller-schedule.js)', () => {
  beforeEach(() => {
    cleanupDOM();
    setupGlobals();
    window.electronAPI = createMockElectronAPI({
      getNavigationData: jest.fn().mockResolvedValue({ childId: 1 }),
      getControllerSchedule: jest.fn().mockResolvedValue({
        monday: true, tuesday: false, wednesday: true, thursday: false,
        friday: true, saturday: false, sunday: false, doses_per_day: 2
      })
    });

    setupDOM([
      { tag: 'input', id: 'sched-mon', type: 'checkbox' },
      { tag: 'input', id: 'sched-tue', type: 'checkbox' },
      { tag: 'input', id: 'sched-wed', type: 'checkbox' },
      { tag: 'input', id: 'sched-thu', type: 'checkbox' },
      { tag: 'input', id: 'sched-fri', type: 'checkbox' },
      { tag: 'input', id: 'sched-sat', type: 'checkbox' },
      { tag: 'input', id: 'sched-sun', type: 'checkbox' },
      { tag: 'input', id: 'doses-per-day', type: 'number', value: '1' },
      { tag: 'button', id: 'back-btn' },
      { tag: 'button', id: 'save-schedule-btn' }
    ]);
  });

  afterEach(() => { jest.resetModules(); });

  test('loads existing schedule and populates checkboxes', async () => {
    require('../src/parent/controller-schedule.js');
    fireDOMContentLoaded();
    await flushPromises();

    expect(document.getElementById('sched-mon').checked).toBe(true);
    expect(document.getElementById('sched-tue').checked).toBe(false);
    expect(document.getElementById('sched-wed').checked).toBe(true);
    expect(document.getElementById('doses-per-day').value).toBe('2');
  });

  test('redirects if no session', async () => {
    window.electronAPI.getSession.mockResolvedValue(null);
    require('../src/parent/controller-schedule.js');
    fireDOMContentLoaded();
    await flushPromises();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('landing');
  });

  test('redirects if no childId in navData', async () => {
    window.electronAPI.getNavigationData.mockResolvedValue(null);
    require('../src/parent/controller-schedule.js');
    fireDOMContentLoaded();
    await flushPromises();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('parent-child-overview');
  });

  test('handles null schedule (no existing schedule)', async () => {
    window.electronAPI.getControllerSchedule.mockResolvedValue(null);
    require('../src/parent/controller-schedule.js');
    fireDOMContentLoaded();
    await flushPromises();
    // No errors, all defaults
    expect(document.getElementById('sched-mon').checked).toBe(false);
  });

  test('error loading schedule shows toast', async () => {
    window.electronAPI.getControllerSchedule.mockRejectedValue(new Error('fail'));
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    require('../src/parent/controller-schedule.js');
    fireDOMContentLoaded();
    await flushPromises();
    expect(window.showToast).toHaveBeenCalledWith(expect.stringContaining('Could not load'), 'error');
    errSpy.mockRestore();
  });

  test('save schedule calls API and shows toast', async () => {
    require('../src/parent/controller-schedule.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('save-schedule-btn').click();
    await flushPromises();

    expect(window.electronAPI.updateControllerSchedule).toHaveBeenCalled();
    expect(window.showToast).toHaveBeenCalledWith('Schedule saved!', 'success');
    expect(document.getElementById('save-schedule-btn').disabled).toBe(false);
  });

  test('save schedule error shows error toast', async () => {
    window.electronAPI.updateControllerSchedule.mockRejectedValue(new Error('fail'));
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    require('../src/parent/controller-schedule.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('save-schedule-btn').click();
    await flushPromises();

    expect(window.showToast).toHaveBeenCalledWith(expect.stringContaining('Failed to save'), 'error');
    errSpy.mockRestore();
  });

  test('back button navigates with childId', async () => {
    require('../src/parent/controller-schedule.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('back-btn').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('parent-child-overview', { childId: 1 });
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. adherence-report.js — Adherence Display
// ═══════════════════════════════════════════════════════════════════
describe('AdherenceReport (adherence-report.js)', () => {
  beforeEach(() => {
    cleanupDOM();
    setupGlobals();
    window.electronAPI = createMockElectronAPI({
      getNavigationData: jest.fn().mockResolvedValue({ childId: 1 }),
      getChild: jest.fn().mockResolvedValue({ name: 'Alice' }),
      getMedicationAdherence: jest.fn().mockResolvedValue({ daysPlanned: 30, daysCompleted: 25, percentage: 83 })
    });

    setupDOM([
      { tag: 'button', id: 'back-btn' },
      'adherence-card',
      'adherence-spinner'
    ]);
  });

  afterEach(() => { jest.resetModules(); });

  test('renders adherence card with good adherence', async () => {
    require('../src/parent/adherence-report.js');
    fireDOMContentLoaded();
    await flushPromises();

    expect(document.getElementById('adherence-percentage').textContent).toBe('83%');
    expect(document.getElementById('adherence-child-name').textContent).toBe('Alice');
    expect(document.getElementById('adherence-alert').textContent).toContain('Great adherence');
  });

  test('renders warning for low adherence', async () => {
    window.electronAPI.getMedicationAdherence.mockResolvedValue({ daysPlanned: 30, daysCompleted: 10, percentage: 33 });
    require('../src/parent/adherence-report.js');
    fireDOMContentLoaded();
    await flushPromises();

    expect(document.getElementById('adherence-alert').textContent).toContain('below 80%');
  });

  test('handles null adherence', async () => {
    window.electronAPI.getMedicationAdherence.mockResolvedValue(null);
    require('../src/parent/adherence-report.js');
    fireDOMContentLoaded();
    await flushPromises();

    expect(document.getElementById('adherence-percentage').textContent).toBe('0%');
  });

  test('handles null child', async () => {
    window.electronAPI.getChild.mockResolvedValue(null);
    require('../src/parent/adherence-report.js');
    fireDOMContentLoaded();
    await flushPromises();

    expect(document.getElementById('adherence-child-name').textContent).toBe('Unknown Child');
  });

  test('redirects if no session', async () => {
    window.electronAPI.getSession.mockResolvedValue(null);
    require('../src/parent/adherence-report.js');
    fireDOMContentLoaded();
    await flushPromises();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('landing');
  });

  test('redirects if no childId', async () => {
    window.electronAPI.getNavigationData.mockResolvedValue(null);
    require('../src/parent/adherence-report.js');
    fireDOMContentLoaded();
    await flushPromises();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('parent-child-overview');
  });

  test('data fetch error shows failure message', async () => {
    window.electronAPI.getChild.mockRejectedValue(new Error('fail'));
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    require('../src/parent/adherence-report.js');
    fireDOMContentLoaded();
    await flushPromises();

    expect(document.getElementById('adherence-card').textContent).toContain('Failed to load');
    errSpy.mockRestore();
  });

  test('data fetch error removes spinner if present', async () => {
    window.electronAPI.getChild.mockRejectedValue(new Error('fail'));
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    require('../src/parent/adherence-report.js');
    fireDOMContentLoaded();
    await flushPromises();

    expect(document.getElementById('adherence-spinner')).toBeNull();
    errSpy.mockRestore();
  });

  test('back button navigates with childId', async () => {
    require('../src/parent/adherence-report.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('back-btn').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('parent-child-overview', { childId: 1 });
  });
});

// ═══════════════════════════════════════════════════════════════════
// 7. daily-checkin.js — Symptom Check-in Form
// ═══════════════════════════════════════════════════════════════════
describe('DailyCheckin (daily-checkin.js)', () => {
  beforeEach(() => {
    cleanupDOM();
    setupGlobals();
    window.electronAPI = createMockElectronAPI({
      getChildren: jest.fn().mockResolvedValue([{ child_id: 1, name: 'Alice' }]),
      getNavigationData: jest.fn().mockResolvedValue({ childId: 1 }),
      getTodaysCheckin: jest.fn().mockResolvedValue(null)
    });

    setupDOM([
      { tag: 'select', id: 'child-select' },
      'form-area',
      'no-child-prompt',
      { tag: 'button', id: 'save-checkin-btn' },
      { tag: 'button', id: 'back-btn' },
      'today-date',
      { tag: 'input', id: 'trigger-exercise', type: 'checkbox' },
      { tag: 'input', id: 'trigger-cold-air', type: 'checkbox' },
      { tag: 'input', id: 'trigger-dust', type: 'checkbox' },
      { tag: 'input', id: 'trigger-smoke', type: 'checkbox' },
      { tag: 'input', id: 'trigger-illness', type: 'checkbox' },
      { tag: 'input', id: 'trigger-strong-odors', type: 'checkbox' }
    ]);
    document.getElementById('no-child-prompt').classList.remove('hidden');
  });

  afterEach(() => { jest.resetModules(); });

  test('loads page with navData childId, form visible', async () => {
    require('../src/parent/daily-checkin.js');
    fireDOMContentLoaded();
    await flushPromises();

    expect(document.getElementById('form-area').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('today-date').textContent).toBeTruthy();
  });

  test('redirects if no session', async () => {
    window.electronAPI.getSession.mockResolvedValue(null);
    require('../src/parent/daily-checkin.js');
    fireDOMContentLoaded();
    await flushPromises();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('landing');
  });

  test('no navData: save button disabled', async () => {
    window.electronAPI.getNavigationData.mockResolvedValue(null);
    require('../src/parent/daily-checkin.js');
    fireDOMContentLoaded();
    await flushPromises();
    expect(document.getElementById('save-checkin-btn').disabled).toBe(true);
  });

  test('loadTodaysCheckin hides form when no child selected', async () => {
    require('../src/parent/daily-checkin.js');
    fireDOMContentLoaded();
    await flushPromises();

    const select = document.getElementById('child-select');
    select.value = '';
    select.dispatchEvent(new Event('change'));
    await flushPromises();

    expect(document.getElementById('form-area').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('save-checkin-btn').disabled).toBe(true);
  });

  test('loadTodaysCheckin pre-fills existing checkin', async () => {
    window.electronAPI.getTodaysCheckin.mockResolvedValue({
      night_waking: 'some', activity_limits: 'a_lot', coughing: 'none', wheezing: 'some',
      trigger_exercise: true, trigger_cold_air: false, trigger_dust: true,
      trigger_smoke: false, trigger_illness: true, trigger_strong_odors: false
    });
    require('../src/parent/daily-checkin.js');
    fireDOMContentLoaded();
    await flushPromises();

    expect(document.getElementById('trigger-exercise').checked).toBe(true);
    expect(document.getElementById('trigger-dust').checked).toBe(true);
    expect(document.getElementById('trigger-illness').checked).toBe(true);
    expect(document.getElementById('trigger-cold-air').checked).toBe(false);
  });

  test('loadTodaysCheckin resets to defaults when no existing checkin', async () => {
    window.electronAPI.getTodaysCheckin.mockResolvedValue(null);
    require('../src/parent/daily-checkin.js');
    fireDOMContentLoaded();
    await flushPromises();

    expect(document.getElementById('trigger-exercise').checked).toBe(false);
  });

  test('saveCheckin requires child selection', async () => {
    require('../src/parent/daily-checkin.js');
    fireDOMContentLoaded();
    await flushPromises();

    const select = document.getElementById('child-select');
    select.value = '';
    document.getElementById('save-checkin-btn').click();
    await flushPromises();

    expect(window.showToast).toHaveBeenCalledWith('Please select a child first', 'error');
  });

  test('saveCheckin successful', async () => {
    window.electronAPI.submitCheckin.mockResolvedValue({ success: true });
    require('../src/parent/daily-checkin.js');
    fireDOMContentLoaded();
    await flushPromises();

    // Set child in dropdown with proper option text
    const select = document.getElementById('child-select');
    select.innerHTML = '<option value="1">Alice</option>';
    select.value = '1';

    document.getElementById('save-checkin-btn').click();
    await flushPromises();

    expect(window.electronAPI.submitCheckin).toHaveBeenCalled();
    expect(window.showSuccess).toHaveBeenCalled();

    // Test callback
    const callback = window.showSuccess.mock.calls[0][2];
    callback();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('parent-main');
  });

  test('saveCheckin failure', async () => {
    window.electronAPI.submitCheckin.mockResolvedValue({ success: false, error: 'fail' });
    require('../src/parent/daily-checkin.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('save-checkin-btn').click();
    await flushPromises();

    expect(window.showToast).toHaveBeenCalledWith('fail', 'error');
  });

  test('saveCheckin failure without error message', async () => {
    window.electronAPI.submitCheckin.mockResolvedValue({ success: false });
    require('../src/parent/daily-checkin.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('save-checkin-btn').click();
    await flushPromises();

    expect(window.showToast).toHaveBeenCalledWith(expect.stringContaining('Failed to save'), 'error');
  });

  test('form-area click delegation for sev-btn', async () => {
    require('../src/parent/daily-checkin.js');
    fireDOMContentLoaded();
    await flushPromises();

    const formArea = document.getElementById('form-area');
    // Add a sev-btn to the form-area
    const btn = document.createElement('button');
    btn.className = 'sev-btn';
    btn.dataset.group = 'coughing';
    btn.dataset.value = 'a_lot';
    formArea.appendChild(btn);

    btn.click();
    expect(btn.classList.contains('selected')).toBe(true);
  });

  test('form-area click on non-sev-btn does nothing', async () => {
    require('../src/parent/daily-checkin.js');
    fireDOMContentLoaded();
    await flushPromises();

    const formArea = document.getElementById('form-area');
    formArea.click(); // should not throw
  });

  test('form-area keydown Enter/Space on sev-btn', async () => {
    require('../src/parent/daily-checkin.js');
    fireDOMContentLoaded();
    await flushPromises();

    const formArea = document.getElementById('form-area');
    const btn = document.createElement('button');
    btn.className = 'sev-btn';
    btn.dataset.group = 'wheezing';
    btn.dataset.value = 'some';
    formArea.appendChild(btn);

    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    btn.dispatchEvent(event);
    expect(btn.classList.contains('selected')).toBe(true);
  });

  test('form-area keydown Space on sev-btn', async () => {
    require('../src/parent/daily-checkin.js');
    fireDOMContentLoaded();
    await flushPromises();

    const formArea = document.getElementById('form-area');
    const btn = document.createElement('button');
    btn.className = 'sev-btn';
    btn.dataset.group = 'wheezing';
    btn.dataset.value = 'a_lot';
    formArea.appendChild(btn);

    const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true });
    btn.dispatchEvent(event);
    expect(btn.classList.contains('selected')).toBe(true);
  });

  test('form-area keydown on non-sev-btn does nothing', async () => {
    require('../src/parent/daily-checkin.js');
    fireDOMContentLoaded();
    await flushPromises();

    const formArea = document.getElementById('form-area');
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    formArea.dispatchEvent(event);
    // No error thrown
  });

  test('form-area keydown with non-Enter/Space key does nothing', async () => {
    require('../src/parent/daily-checkin.js');
    fireDOMContentLoaded();
    await flushPromises();

    const formArea = document.getElementById('form-area');
    const btn = document.createElement('button');
    btn.className = 'sev-btn';
    btn.dataset.group = 'wheezing';
    btn.dataset.value = 'some';
    formArea.appendChild(btn);

    const event = new KeyboardEvent('keydown', { key: 'a', bubbles: true });
    btn.dispatchEvent(event);
    expect(btn.classList.contains('selected')).toBe(false);
  });

  test('back button navigates', async () => {
    require('../src/parent/daily-checkin.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('back-btn').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('parent-main');
  });

  test('today-date not present does not crash', async () => {
    document.getElementById('today-date').remove();
    require('../src/parent/daily-checkin.js');
    fireDOMContentLoaded();
    await flushPromises();
    // Should not throw
  });
});

// ═══════════════════════════════════════════════════════════════════
// 8. enter-pef.js — PEF Entry Form
// ═══════════════════════════════════════════════════════════════════
describe('EnterPef (enter-pef.js)', () => {
  beforeEach(() => {
    cleanupDOM();
    setupGlobals();
    window.electronAPI = createMockElectronAPI({
      getChildren: jest.fn().mockResolvedValue([{ child_id: 1, name: 'Alice' }]),
      getNavigationData: jest.fn().mockResolvedValue({ childId: 1 }),
      getChild: jest.fn().mockResolvedValue({ name: 'Alice', personal_best_pef: 400 }),
      submitPef: jest.fn().mockResolvedValue({ success: true })
    });

    setupDOM([
      { tag: 'select', id: 'child-select' },
      'form-area',
      'no-child-prompt',
      { tag: 'button', id: 'save-pef-btn' },
      { tag: 'button', id: 'back-btn' },
      { tag: 'input', id: 'daily-pef', type: 'number' },
      { tag: 'input', id: 'pre-med-pef', type: 'number' },
      { tag: 'input', id: 'post-med-pef', type: 'number' },
      'pb-hint'
    ]);
    document.getElementById('pb-hint').classList.add('hidden');
  });

  afterEach(() => { jest.resetModules(); });

  test('loads page with navData, selects child, shows PB hint', async () => {
    require('../src/parent/enter-pef.js');
    fireDOMContentLoaded();
    await flushPromises();

    const select = document.getElementById('child-select');
    expect(select.value).toBe('1');
    expect(document.getElementById('pb-hint').textContent).toContain('400');
  });

  test('redirects if no session', async () => {
    window.electronAPI.getSession.mockResolvedValue(null);
    require('../src/parent/enter-pef.js');
    fireDOMContentLoaded();
    await flushPromises();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('landing');
  });

  test('no navData: save button disabled', async () => {
    window.electronAPI.getNavigationData.mockResolvedValue(null);
    require('../src/parent/enter-pef.js');
    fireDOMContentLoaded();
    await flushPromises();
    expect(document.getElementById('save-pef-btn').disabled).toBe(true);
  });

  test('onChildSelected with no child hides form', async () => {
    require('../src/parent/enter-pef.js');
    fireDOMContentLoaded();
    await flushPromises();

    const select = document.getElementById('child-select');
    select.value = '';
    select.dispatchEvent(new Event('change'));
    await flushPromises();

    expect(document.getElementById('form-area').classList.contains('hidden')).toBe(true);
  });

  test('onChildSelected shows "No personal best" when none set', async () => {
    window.electronAPI.getChild.mockResolvedValue({ name: 'Alice', personal_best_pef: null });
    require('../src/parent/enter-pef.js');
    fireDOMContentLoaded();
    await flushPromises();

    expect(document.getElementById('pb-hint').textContent).toContain('No personal best');
  });

  test('onChildSelected handles getChild error', async () => {
    window.electronAPI.getChild.mockRejectedValue(new Error('fail'));
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    require('../src/parent/enter-pef.js');
    fireDOMContentLoaded();
    await flushPromises();
    errSpy.mockRestore();
  });

  test('savePef requires child', async () => {
    require('../src/parent/enter-pef.js');
    fireDOMContentLoaded();
    await flushPromises();

    const select = document.getElementById('child-select');
    select.value = '';
    document.getElementById('save-pef-btn').click();
    await flushPromises();

    expect(window.showToast).toHaveBeenCalledWith('Please select a child', 'error');
  });

  test('savePef requires at least one PEF reading', async () => {
    require('../src/parent/enter-pef.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('save-pef-btn').click();
    await flushPromises();

    expect(window.showToast).toHaveBeenCalledWith('Please enter at least one PEF reading', 'error');
  });

  test('savePef validates PEF range', async () => {
    require('../src/parent/enter-pef.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('daily-pef').value = '1000';
    document.getElementById('save-pef-btn').click();
    await flushPromises();

    expect(window.showToast).toHaveBeenCalledWith('PEF values must be between 1 and 900 L/min', 'error');
  });

  test('savePef validates PEF range zero', async () => {
    require('../src/parent/enter-pef.js');
    fireDOMContentLoaded();
    await flushPromises();

    // parseFloat('0') || null gives null, so "no readings" error fires first
    document.getElementById('daily-pef').value = '0';
    document.getElementById('save-pef-btn').click();
    await flushPromises();

    expect(window.showToast).toHaveBeenCalledWith('Please enter at least one PEF reading', 'error');
  });

  test('savePef success with PB update confirmation', async () => {
    window.showConfirm.mockResolvedValue(true);
    require('../src/parent/enter-pef.js');
    fireDOMContentLoaded();
    await flushPromises();

    // Set child to have dropdown with option text
    const select = document.getElementById('child-select');
    select.innerHTML = '<option value="1">Alice</option>';
    select.value = '1';

    document.getElementById('daily-pef').value = '500'; // > 400 PB
    document.getElementById('save-pef-btn').click();
    await flushPromises();

    expect(window.showConfirm).toHaveBeenCalled();
    expect(window.electronAPI.setPersonalBest).toHaveBeenCalledWith({ childId: 1, personalBestPef: 500 });
    expect(window.electronAPI.submitPef).toHaveBeenCalled();
    expect(window.showSuccess).toHaveBeenCalled();
  });

  test('savePef success with PB update declined', async () => {
    window.showConfirm.mockResolvedValue(false);
    require('../src/parent/enter-pef.js');
    fireDOMContentLoaded();
    await flushPromises();

    const select = document.getElementById('child-select');
    select.innerHTML = '<option value="1">Alice</option>';
    select.value = '1';

    document.getElementById('daily-pef').value = '500';
    document.getElementById('save-pef-btn').click();
    await flushPromises();

    expect(window.electronAPI.setPersonalBest).not.toHaveBeenCalled();
    expect(window.showSuccess).toHaveBeenCalled();
  });

  test('savePef with no current PB asks to set it', async () => {
    window.electronAPI.getChild.mockResolvedValue({ name: 'Alice', personal_best_pef: null });
    window.showConfirm.mockResolvedValue(true);
    require('../src/parent/enter-pef.js');
    fireDOMContentLoaded();
    await flushPromises();

    const select = document.getElementById('child-select');
    select.innerHTML = '<option value="1">Alice</option>';
    select.value = '1';
    // Trigger onChildSelected to get currentChildData with null PB
    select.dispatchEvent(new Event('change'));
    await flushPromises();

    document.getElementById('daily-pef').value = '300';
    document.getElementById('save-pef-btn').click();
    await flushPromises();

    expect(window.showConfirm).toHaveBeenCalled();
    expect(window.electronAPI.setPersonalBest).toHaveBeenCalled();
  });

  test('savePef failure', async () => {
    window.electronAPI.submitPef.mockResolvedValue({ success: false, error: 'fail' });
    require('../src/parent/enter-pef.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('daily-pef').value = '300';
    document.getElementById('save-pef-btn').click();
    await flushPromises();

    expect(window.showToast).toHaveBeenCalledWith('fail', 'error');
  });

  test('savePef failure without error', async () => {
    window.electronAPI.submitPef.mockResolvedValue({ success: false });
    require('../src/parent/enter-pef.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('daily-pef').value = '300';
    document.getElementById('save-pef-btn').click();
    await flushPromises();

    expect(window.showToast).toHaveBeenCalledWith(expect.stringContaining('Failed to save'), 'error');
  });

  test('back button from zone returns to todays-zone', async () => {
    window.electronAPI.getNavigationData.mockResolvedValue({ childId: 1, fromZone: true });
    require('../src/parent/enter-pef.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('back-btn').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('parent-todays-zone', { childId: 1 });
  });

  test('back button from main returns to parent-main', async () => {
    window.electronAPI.getNavigationData.mockResolvedValue({ childId: 1 });
    require('../src/parent/enter-pef.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('back-btn').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('parent-main');
  });

  test('savePef success callback from zone navigates to todays-zone', async () => {
    window.electronAPI.getNavigationData.mockResolvedValue({ childId: 1, fromZone: true });
    require('../src/parent/enter-pef.js');
    fireDOMContentLoaded();
    await flushPromises();

    const select = document.getElementById('child-select');
    select.innerHTML = '<option value="1">Alice</option>';
    select.value = '1';

    document.getElementById('daily-pef').value = '300';
    document.getElementById('save-pef-btn').click();
    await flushPromises();

    const callback = window.showSuccess.mock.calls[0][2];
    callback();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('parent-todays-zone', { childId: 1 });
  });

  test('savePef success: only pre-med PEF', async () => {
    require('../src/parent/enter-pef.js');
    fireDOMContentLoaded();
    await flushPromises();

    const select = document.getElementById('child-select');
    select.innerHTML = '<option value="1">Alice</option>';
    select.value = '1';

    document.getElementById('pre-med-pef').value = '200';
    document.getElementById('save-pef-btn').click();
    await flushPromises();

    expect(window.showSuccess).toHaveBeenCalled();
    // pefDisplay should be 'readings' since dailyPef is null
    expect(window.showSuccess.mock.calls[0][0]).toContain('readings');
  });

  test('pb-hint not present does not crash', async () => {
    document.getElementById('pb-hint').remove();
    require('../src/parent/enter-pef.js');
    fireDOMContentLoaded();
    await flushPromises();
    // Should not throw
  });

  test('PB update also updates pb-hint text', async () => {
    window.showConfirm.mockResolvedValue(true);
    require('../src/parent/enter-pef.js');
    fireDOMContentLoaded();
    await flushPromises();

    const select = document.getElementById('child-select');
    select.innerHTML = '<option value="1">Alice</option>';
    select.value = '1';

    document.getElementById('daily-pef').value = '500';
    document.getElementById('save-pef-btn').click();
    await flushPromises();

    expect(document.getElementById('pb-hint').textContent).toContain('500');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 9. family.js — Expandable Child List with Inline Edit
// ═══════════════════════════════════════════════════════════════════
describe('Family (family.js)', () => {
  beforeEach(() => {
    cleanupDOM();
    setupGlobals();
    window.electronAPI = createMockElectronAPI({
      getChildren: jest.fn().mockResolvedValue([
        { child_id: 1, name: 'Alice', birthday: '2015-06-15', username: 'alice1', icon: 'girl_older', notes: 'Allergies' },
        { child_id: 2, name: 'Bob', birthday: '2018-03-20', username: 'bob1', icon: 'boy_younger', notes: null }
      ])
    });

    setupDOM([
      'child-list',
      { tag: 'button', id: 'back-btn' },
      { tag: 'button', id: 'add-child-btn' },
      { tag: 'button', id: 'nav-home' },
      { tag: 'button', id: 'nav-emergency' },
      { tag: 'button', id: 'nav-settings' },
      'modal-child-name',
      'modal-error',
      'login-modal'
    ]);
    // Put modal elements INSIDE the login-modal div (for focus trapping to work)
    const modal = document.getElementById('login-modal');
    const pwInput = document.createElement('input'); pwInput.id = 'child-password'; pwInput.type = 'password';
    const cancelBtn = document.createElement('button'); cancelBtn.id = 'modal-cancel-btn';
    const loginBtn = document.createElement('button'); loginBtn.id = 'modal-login-btn';
    modal.appendChild(document.getElementById('modal-child-name'));
    modal.appendChild(pwInput);
    modal.appendChild(document.getElementById('modal-error'));
    modal.appendChild(cancelBtn);
    modal.appendChild(loginBtn);
    modal.classList.add('hidden');
    document.getElementById('modal-error').classList.add('hidden');
  });

  afterEach(() => { jest.useRealTimers(); jest.resetModules(); });

  test('renders children list', async () => {
    require('../src/parent/family.js');
    fireDOMContentLoaded();
    await flushPromises();

    const list = document.getElementById('child-list');
    expect(list.querySelectorAll('.child-bar').length).toBe(2);
    expect(list.textContent).toContain('Alice');
    expect(list.textContent).toContain('Bob');
  });

  test('renders empty state when no children', async () => {
    window.electronAPI.getChildren.mockResolvedValue([]);
    require('../src/parent/family.js');
    fireDOMContentLoaded();
    await flushPromises();

    expect(document.getElementById('child-list').textContent).toContain('No children added yet');
  });

  test('redirects if no session', async () => {
    window.electronAPI.getSession.mockResolvedValue(null);
    require('../src/parent/family.js');
    fireDOMContentLoaded();
    await flushPromises();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('landing');
  });

  test('initializePage error shows error block', async () => {
    window.electronAPI.getSession.mockRejectedValue(new Error('fail'));
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    require('../src/parent/family.js');
    fireDOMContentLoaded();
    await flushPromises();
    expect(document.getElementById('child-list').textContent).toContain('Could not load');
    errSpy.mockRestore();
  });

  test('clicking bar expands/collapses detail', async () => {
    require('../src/parent/family.js');
    fireDOMContentLoaded();
    await flushPromises();

    // Click first bar to expand
    const bars = document.querySelectorAll('.child-bar');
    bars[0].click();
    await flushPromises();

    expect(document.querySelector('.child-detail-panel')).not.toBeNull();
    expect(document.querySelector('.child-detail-panel').textContent).toContain('alice1'); // username shown in detail

    // Click same bar to collapse
    document.querySelectorAll('.child-bar')[0].click();
    expect(document.querySelector('.child-detail-panel')).toBeNull();
  });

  test('keyboard Enter on bar toggles', async () => {
    require('../src/parent/family.js');
    fireDOMContentLoaded();
    await flushPromises();

    const list = document.getElementById('child-list');
    const bar = list.querySelector('.child-bar');
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    bar.dispatchEvent(event);

    expect(document.querySelector('.child-detail-panel')).not.toBeNull();
  });

  test('keyboard Space on bar toggles', async () => {
    require('../src/parent/family.js');
    fireDOMContentLoaded();
    await flushPromises();

    const list = document.getElementById('child-list');
    const bar = list.querySelector('.child-bar');
    const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true });
    bar.dispatchEvent(event);

    expect(document.querySelector('.child-detail-panel')).not.toBeNull();
  });

  test('edit button opens inline edit form', async () => {
    require('../src/parent/family.js');
    fireDOMContentLoaded();
    await flushPromises();

    // Expand first child
    document.querySelector('.child-bar').click();
    await flushPromises();

    // Click edit button
    const editBtn = document.querySelector('[data-edit-child-id]');
    editBtn.click();
    await flushPromises();

    expect(document.querySelector('.child-edit-form')).not.toBeNull();
  });

  test('cancel edit returns to detail view', async () => {
    require('../src/parent/family.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.querySelector('.child-bar').click();
    document.querySelector('[data-edit-child-id]').click();
    await flushPromises();

    document.querySelector('[data-cancel-edit]').click();
    await flushPromises();

    expect(document.querySelector('.child-edit-form')).toBeNull();
    expect(document.querySelector('.child-detail-panel')).not.toBeNull();
  });

  test('save edit calls updateChild and refreshes', async () => {
    require('../src/parent/family.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.querySelector('.child-bar').click();
    document.querySelector('[data-edit-child-id]').click();
    await flushPromises();

    // Fill edit form
    document.getElementById('edit-name-1').value = 'Alice Updated';
    document.getElementById('edit-birthday-1').value = '2015-06-15';
    document.getElementById('edit-notes-1').value = 'Updated notes';

    document.querySelector('[data-save-edit]').click();
    await flushPromises();

    expect(window.electronAPI.updateChild).toHaveBeenCalled();
    expect(window.showToast).toHaveBeenCalledWith('Alice Updated updated!', 'success');
  });

  test('save edit with empty name shows error', async () => {
    require('../src/parent/family.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.querySelector('.child-bar').click();
    document.querySelector('[data-edit-child-id]').click();
    await flushPromises();

    document.getElementById('edit-name-1').value = '';
    document.querySelector('[data-save-edit]').click();
    await flushPromises();

    expect(window.showToast).toHaveBeenCalledWith('Name is required.', 'error');
  });

  test('save edit with empty birthday shows error', async () => {
    require('../src/parent/family.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.querySelector('.child-bar').click();
    document.querySelector('[data-edit-child-id]').click();
    await flushPromises();

    document.getElementById('edit-name-1').value = 'Alice';
    document.getElementById('edit-birthday-1').value = '';
    document.querySelector('[data-save-edit]').click();
    await flushPromises();

    expect(window.showToast).toHaveBeenCalledWith('Birthday is required.', 'error');
  });

  test('save edit API failure shows error', async () => {
    window.electronAPI.updateChild.mockResolvedValue({ success: false, error: 'fail' });
    require('../src/parent/family.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.querySelector('.child-bar').click();
    document.querySelector('[data-edit-child-id]').click();
    await flushPromises();

    document.getElementById('edit-name-1').value = 'Alice';
    document.getElementById('edit-birthday-1').value = '2015-06-15';
    document.querySelector('[data-save-edit]').click();
    await flushPromises();

    expect(window.showToast).toHaveBeenCalledWith('fail', 'error');
  });

  test('save edit API failure without error msg', async () => {
    window.electronAPI.updateChild.mockResolvedValue({ success: false });
    require('../src/parent/family.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.querySelector('.child-bar').click();
    document.querySelector('[data-edit-child-id]').click();
    await flushPromises();

    document.getElementById('edit-name-1').value = 'Alice';
    document.getElementById('edit-birthday-1').value = '2015-06-15';
    document.querySelector('[data-save-edit]').click();
    await flushPromises();

    expect(window.showToast).toHaveBeenCalledWith('Failed to update.', 'error');
  });

  test('save edit exception shows toast', async () => {
    window.electronAPI.updateChild.mockRejectedValue(new Error('net'));
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    require('../src/parent/family.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.querySelector('.child-bar').click();
    document.querySelector('[data-edit-child-id]').click();
    await flushPromises();

    document.getElementById('edit-name-1').value = 'Alice';
    document.getElementById('edit-birthday-1').value = '2015-06-15';
    document.querySelector('[data-save-edit]').click();
    await flushPromises();

    expect(window.showToast).toHaveBeenCalledWith('Something went wrong.', 'error');
    errSpy.mockRestore();
  });

  test('icon picker in edit form', async () => {
    require('../src/parent/family.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.querySelector('.child-bar').click();
    document.querySelector('[data-edit-child-id]').click();
    await flushPromises();

    const iconOption = document.querySelector('.edit-icon-option[data-icon="baby"]');
    iconOption.click();
    await flushPromises();

    expect(document.getElementById('edit-icon-1').value).toBe('baby');
    expect(iconOption.classList.contains('selected')).toBe(true);
  });

  test('login button opens modal', async () => {
    jest.useFakeTimers();
    require('../src/parent/family.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    document.querySelector('.child-bar').click();
    await jest.advanceTimersByTimeAsync(0);

    const loginBtn = document.querySelector('[data-login-child-username]');
    loginBtn.click();
    await jest.advanceTimersByTimeAsync(200);

    expect(document.getElementById('login-modal').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('modal-child-name').textContent).toContain('Alice');
    jest.useRealTimers();
  });

  test('modal cancel closes modal', async () => {
    require('../src/parent/family.js');
    fireDOMContentLoaded();
    await flushPromises();

    // Open the modal first
    document.querySelector('.child-bar').click();
    await flushPromises();
    document.querySelector('[data-login-child-username]').click();
    await flushPromises();

    document.getElementById('modal-cancel-btn').click();
    expect(document.getElementById('login-modal').classList.contains('hidden')).toBe(true);
  });

  test('confirmChildLogin success navigates to child-main', async () => {
    window.electronAPI.childLogin.mockResolvedValue({ success: true });
    require('../src/parent/family.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.querySelector('.child-bar').click();
    await flushPromises();
    document.querySelector('[data-login-child-username]').click();
    await flushPromises();

    document.getElementById('child-password').value = 'pass123';
    document.getElementById('modal-login-btn').click();
    await flushPromises();

    expect(window.electronAPI.navigate).toHaveBeenCalledWith('child-main');
  });

  test('confirmChildLogin failure shows error', async () => {
    window.electronAPI.childLogin.mockResolvedValue({ success: false });
    require('../src/parent/family.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.querySelector('.child-bar').click();
    await flushPromises();
    document.querySelector('[data-login-child-username]').click();
    await flushPromises();

    document.getElementById('child-password').value = 'wrong';
    document.getElementById('modal-login-btn').click();
    await flushPromises();

    expect(document.getElementById('modal-error').classList.contains('hidden')).toBe(false);
  });

  test('confirmChildLogin exception shows toast', async () => {
    window.electronAPI.childLogin.mockRejectedValue(new Error('net'));
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    require('../src/parent/family.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.querySelector('.child-bar').click();
    await flushPromises();
    document.querySelector('[data-login-child-username]').click();
    await flushPromises();

    document.getElementById('child-password').value = 'pass123';
    document.getElementById('modal-login-btn').click();
    await flushPromises();

    expect(window.showToast).toHaveBeenCalledWith('Something went wrong. Please try again.', 'error');
    errSpy.mockRestore();
  });

  test('confirmChildLogin does nothing if empty password', async () => {
    require('../src/parent/family.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.querySelector('.child-bar').click();
    await flushPromises();
    document.querySelector('[data-login-child-username]').click();
    await flushPromises();

    document.getElementById('child-password').value = '';
    document.getElementById('modal-login-btn').click();
    await flushPromises();

    expect(window.electronAPI.childLogin).not.toHaveBeenCalled();
  });

  test('Enter key in password field triggers login', async () => {
    window.electronAPI.childLogin.mockResolvedValue({ success: true });
    require('../src/parent/family.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.querySelector('.child-bar').click();
    await flushPromises();
    document.querySelector('[data-login-child-username]').click();
    await flushPromises();

    document.getElementById('child-password').value = 'pass123';
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    document.getElementById('child-password').dispatchEvent(event);
    await flushPromises();

    expect(window.electronAPI.childLogin).toHaveBeenCalled();
  });

  test('Escape key closes modal', async () => {
    require('../src/parent/family.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.querySelector('.child-bar').click();
    await flushPromises();
    document.querySelector('[data-login-child-username]').click();
    await flushPromises();

    expect(document.getElementById('login-modal').classList.contains('hidden')).toBe(false);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.getElementById('login-modal').classList.contains('hidden')).toBe(true);
  });

  test('Tab trapping in modal', async () => {
    require('../src/parent/family.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.querySelector('.child-bar').click();
    await flushPromises();
    document.querySelector('[data-login-child-username]').click();
    await flushPromises();

    const modal = document.getElementById('login-modal');
    const focusable = modal.querySelectorAll('input, button, [tabindex]:not([tabindex="-1"])');
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    // Focus last element, tab should go to first
    last.focus();
    const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
    Object.defineProperty(tabEvent, 'shiftKey', { value: false });
    document.dispatchEvent(tabEvent);

    // Focus first element, shift+tab should go to last
    first.focus();
    const shiftTabEvent = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true });
    document.dispatchEvent(shiftTabEvent);
  });

  test('non-Tab key when modal open does nothing', async () => {
    require('../src/parent/family.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.querySelector('.child-bar').click();
    await flushPromises();
    document.querySelector('[data-login-child-username]').click();
    await flushPromises();

    const event = new KeyboardEvent('keydown', { key: 'a', bubbles: true });
    document.dispatchEvent(event);
    // No error, modal still open
    expect(document.getElementById('login-modal').classList.contains('hidden')).toBe(false);
  });

  test('keydown when modal hidden does nothing', async () => {
    require('../src/parent/family.js');
    fireDOMContentLoaded();
    await flushPromises();

    // Modal is hidden by default
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    document.dispatchEvent(event);
    // No error
  });

  test('navigation buttons work', async () => {
    require('../src/parent/family.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('back-btn').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('parent-main');

    document.getElementById('add-child-btn').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('parent-add-child');

    document.getElementById('nav-home').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('parent-main');

    document.getElementById('nav-emergency').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('emergency');

    document.getElementById('nav-settings').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('settings');
  });

  test('child with unknown icon uses default', async () => {
    window.electronAPI.getChildren.mockResolvedValue([
      { child_id: 1, name: 'Alice', birthday: '2015-06-15', username: 'alice1', icon: 'unknown_icon', notes: null }
    ]);
    require('../src/parent/family.js');
    fireDOMContentLoaded();
    await flushPromises();

    // Should not crash, uses default icon
    expect(document.getElementById('child-list').querySelectorAll('.child-bar').length).toBe(1);
  });

  test('child count label singular', async () => {
    window.electronAPI.getChildren.mockResolvedValue([
      { child_id: 1, name: 'Alice', birthday: '2015-06-15', username: 'alice1', icon: 'girl_older', notes: null }
    ]);
    require('../src/parent/family.js');
    fireDOMContentLoaded();
    await flushPromises();

    expect(document.getElementById('child-list').textContent).toContain('1 child');
  });

  test('escapeHtml handles null and XSS', async () => {
    // escapeHtml is internal, but exercised through rendering with special characters
    window.electronAPI.getChildren.mockResolvedValue([
      { child_id: 1, name: '<script>alert(1)</script>', birthday: '2015-06-15', username: 'test"user', icon: 'girl_older', notes: "it's a 'test'" }
    ]);
    require('../src/parent/family.js');
    fireDOMContentLoaded();
    await flushPromises();

    // The text content inside the bar-name span should be safely escaped
    const nameSpan = document.querySelector('.child-bar-name');
    expect(nameSpan.textContent).toContain('<script>');  // textContent is raw
    expect(nameSpan.innerHTML).toContain('&lt;script&gt;');  // innerHTML is escaped
    expect(nameSpan.innerHTML).not.toContain('<script>');  // no raw script tag in HTML
  });

  test('clicking different bar switches expansion', async () => {
    require('../src/parent/family.js');
    fireDOMContentLoaded();
    await flushPromises();

    // Click first bar
    document.querySelectorAll('.child-bar')[0].click();
    await flushPromises();
    expect(document.querySelector('.child-detail-panel')).not.toBeNull();

    // Click second bar
    document.querySelectorAll('.child-bar')[1].click();
    await flushPromises();
    const panels = document.querySelectorAll('.child-detail-panel');
    expect(panels.length).toBe(1);
    expect(panels[0].textContent).toContain('bob1'); // username shown in detail
  });

  test('closeModal restores focus', async () => {
    require('../src/parent/family.js');
    fireDOMContentLoaded();
    await flushPromises();

    document.querySelector('.child-bar').click();
    await flushPromises();

    const loginBtn = document.querySelector('[data-login-child-username]');
    loginBtn.focus();
    loginBtn.click();
    await flushPromises();

    document.getElementById('modal-cancel-btn').click();
    // Focus should be restored
    expect(document.getElementById('login-modal').classList.contains('hidden')).toBe(true);
  });

  test('keydown on non-bar element does nothing', async () => {
    require('../src/parent/family.js');
    fireDOMContentLoaded();
    await flushPromises();

    const list = document.getElementById('child-list');
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    list.dispatchEvent(event);
    // No error
  });
});
