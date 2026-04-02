/**
 * @jest-environment jsdom
 */
const { createMockElectronAPI, setupDOM, fireDOMContentLoaded, flushPromises, setupGlobals, cleanupDOM } = require('./__helpers__/renderer-setup');

// ═══════════════════════════════════════════════════════════════════
// 1. set-personal-best.js
// ═══════════════════════════════════════════════════════════════════
describe('SetPersonalBest (set-personal-best.js)', () => {
  beforeEach(() => {
    cleanupDOM();
    setupGlobals();
    jest.useFakeTimers();
    window.electronAPI = createMockElectronAPI({
      getChildren: jest.fn().mockResolvedValue([
        { child_id: 1, name: 'Alice' },
        { child_id: 2, name: 'Bob' }
      ]),
      getChild: jest.fn().mockResolvedValue({ child_id: 1, name: 'Alice', personal_best_pef: 350 })
    });

    setupDOM([
      { tag: 'select', id: 'child-select' },
      'pb-section',
      'no-child-prompt',
      { tag: 'button', id: 'save-pb-btn' },
      { tag: 'input', id: 'pb-value', type: 'number' },
      'success-msg',
      { tag: 'button', id: 'back-btn' }
    ]);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.resetModules();
  });

  test('initializePage loads children into dropdown', async () => {
    require('../src/parent/set-personal-best.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    expect(window.electronAPI.getSession).toHaveBeenCalled();
    expect(window.electronAPI.getChildren).toHaveBeenCalled();
    const select = document.getElementById('child-select');
    expect(select.options.length).toBe(3); // placeholder + 2 children
  });

  test('redirects to landing if no session', async () => {
    window.electronAPI.getSession.mockResolvedValue(null);
    require('../src/parent/set-personal-best.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('landing');
  });

  test('auto-selects child from navData and loads personal best', async () => {
    window.electronAPI.getNavigationData.mockResolvedValue({ childId: 1 });
    require('../src/parent/set-personal-best.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    // loadPersonalBest was called, which calls getChild
    expect(window.electronAPI.getChild).toHaveBeenCalledWith(1);
    await jest.advanceTimersByTimeAsync(0);
    expect(document.getElementById('pb-value').value).toBe('350');
  });

  test('save button disabled when no child selected via navData', async () => {
    require('../src/parent/set-personal-best.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);
    expect(document.getElementById('save-pb-btn').disabled).toBe(true);
  });

  test('loadPersonalBest hides form when no child selected', async () => {
    require('../src/parent/set-personal-best.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    const select = document.getElementById('child-select');
    select.value = '';
    select.dispatchEvent(new Event('change'));
    await jest.advanceTimersByTimeAsync(0);

    expect(document.getElementById('pb-section').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('no-child-prompt').classList.contains('hidden')).toBe(false);
  });

  test('loadPersonalBest shows form when child selected', async () => {
    require('../src/parent/set-personal-best.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    const select = document.getElementById('child-select');
    select.value = '1';
    select.dispatchEvent(new Event('change'));
    await jest.advanceTimersByTimeAsync(0);

    expect(document.getElementById('pb-section').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('no-child-prompt').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('save-pb-btn').disabled).toBe(false);
  });

  test('savePersonalBest validates input and shows error', async () => {
    window.electronAPI.getNavigationData.mockResolvedValue({ childId: 1 });
    require('../src/parent/set-personal-best.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(0);

    // Child is selected but PEF value is empty
    document.getElementById('pb-value').value = '';
    document.getElementById('save-pb-btn').click();
    await jest.advanceTimersByTimeAsync(0);
    expect(window.showToast).toHaveBeenCalledWith(expect.stringContaining('PEF value'), 'error');
  });

  test('savePersonalBest calls API and shows success message', async () => {
    window.electronAPI.getNavigationData.mockResolvedValue({ childId: 1 });
    require('../src/parent/set-personal-best.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(0);

    document.getElementById('pb-value').value = '400';
    document.getElementById('save-pb-btn').click();
    await jest.advanceTimersByTimeAsync(0);

    expect(window.electronAPI.setPersonalBest).toHaveBeenCalledWith({ childId: 1, personalBestPef: 400 });
    expect(document.getElementById('success-msg').classList.contains('hidden')).toBe(false);
  });

  test('back button navigates to parent-main', async () => {
    require('../src/parent/set-personal-best.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    document.getElementById('back-btn').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('parent-main');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. todays-zone.js
// ═══════════════════════════════════════════════════════════════════
describe('TodaysZone (todays-zone.js)', () => {
  beforeEach(() => {
    cleanupDOM();
    setupGlobals();
    jest.useFakeTimers();
    window.electronAPI = createMockElectronAPI({
      getChildren: jest.fn().mockResolvedValue([
        { child_id: 1, name: 'Alice' }
      ]),
      calculateZone: jest.fn().mockResolvedValue({ zone: 'green', percentage: 95 })
    });

    setupDOM([
      { tag: 'select', id: 'child-select' },
      'no-child-prompt',
      'zone-display',
      'no-zone',
      'seg-green',
      'seg-yellow',
      'seg-red',
      'zone-marker',
      'zone-circle',
      'zone-label',
      'zone-pct',
      'zone-message',
      { tag: 'button', id: 'back-btn' },
      { tag: 'button', id: 'enter-pef-btn' },
      { tag: 'button', id: 'reenter-pef-btn' }
    ]);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.resetModules();
  });

  test('initializePage loads children', async () => {
    require('../src/parent/todays-zone.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    expect(window.electronAPI.getChildren).toHaveBeenCalled();
    const select = document.getElementById('child-select');
    expect(select.options.length).toBe(2); // placeholder + 1 child
  });

  test('redirects to landing if no session', async () => {
    window.electronAPI.getSession.mockResolvedValue(null);
    require('../src/parent/todays-zone.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('landing');
  });

  test('auto-selects child from navData and loads zone', async () => {
    window.electronAPI.getNavigationData.mockResolvedValue({ childId: 1 });
    require('../src/parent/todays-zone.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(0);

    expect(window.electronAPI.calculateZone).toHaveBeenCalledWith(1);
    expect(document.getElementById('zone-display').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('zone-label').textContent).toBe('Green Zone');
  });

  test('shows no-zone when zone is grey', async () => {
    window.electronAPI.getNavigationData.mockResolvedValue({ childId: 1 });
    window.electronAPI.calculateZone.mockResolvedValue({ zone: 'grey', percentage: 0 });
    require('../src/parent/todays-zone.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(0);

    expect(document.getElementById('no-zone').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('zone-display').classList.contains('hidden')).toBe(true);
  });

  test('displays yellow zone correctly', async () => {
    window.electronAPI.getNavigationData.mockResolvedValue({ childId: 1 });
    window.electronAPI.calculateZone.mockResolvedValue({ zone: 'yellow', percentage: 65 });
    require('../src/parent/todays-zone.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(0);

    expect(document.getElementById('zone-label').textContent).toBe('Yellow Zone');
    expect(document.getElementById('zone-pct').textContent).toBe('65% of personal best');
  });

  test('displays red zone correctly', async () => {
    window.electronAPI.getNavigationData.mockResolvedValue({ childId: 1 });
    window.electronAPI.calculateZone.mockResolvedValue({ zone: 'red', percentage: 30 });
    require('../src/parent/todays-zone.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(0);

    expect(document.getElementById('zone-label').textContent).toBe('Red Zone');
    expect(document.getElementById('zone-message').textContent).toContain('emergency');
  });

  test('no child selected shows prompt', async () => {
    require('../src/parent/todays-zone.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    // Manually trigger change with empty value
    const select = document.getElementById('child-select');
    select.value = '';
    select.dispatchEvent(new Event('change'));
    await jest.advanceTimersByTimeAsync(0);

    expect(document.getElementById('no-child-prompt').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('zone-display').classList.contains('hidden')).toBe(true);
  });

  test('enter-pef-btn navigates with childId', async () => {
    window.electronAPI.getNavigationData.mockResolvedValue({ childId: 1 });
    require('../src/parent/todays-zone.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    document.getElementById('enter-pef-btn').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('parent-enter-pef', { childId: 1, fromZone: true });
  });

  test('back button navigates to parent-main', async () => {
    require('../src/parent/todays-zone.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);
    document.getElementById('back-btn').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('parent-main');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. new-medication.js
// ═══════════════════════════════════════════════════════════════════
describe('NewMedication (new-medication.js)', () => {
  beforeEach(() => {
    cleanupDOM();
    setupGlobals();
    jest.useFakeTimers();
    window.electronAPI = createMockElectronAPI({
      getChildren: jest.fn().mockResolvedValue([
        { child_id: 1, name: 'Alice' }
      ])
    });

    setupDOM([
      { tag: 'select', id: 'child-select' },
      { tag: 'input', id: 'med-name', type: 'text' },
      'name-count',
      { tag: 'textarea', id: 'med-notes' },
      'notes-count',
      { tag: 'form', id: 'med-form' },
      { tag: 'input', id: 'purchase-date', type: 'date' },
      { tag: 'input', id: 'expiry-date', type: 'date' },
      { tag: 'input', id: 'doses-remaining', type: 'number' },
      'form-error',
      { tag: 'button', id: 'save-btn' },
      'page-title',
      { tag: 'button', id: 'back-btn' }
    ]);

    // Add radio buttons for is-rescue
    const radioYes = document.createElement('input');
    radioYes.type = 'radio'; radioYes.name = 'is-rescue'; radioYes.value = '1'; radioYes.id = 'rescue-yes';
    document.body.appendChild(radioYes);
    const radioNo = document.createElement('input');
    radioNo.type = 'radio'; radioNo.name = 'is-rescue'; radioNo.value = '0'; radioNo.id = 'rescue-no';
    radioNo.checked = true;
    document.body.appendChild(radioNo);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.resetModules();
  });

  test('initializePage loads children into dropdown', async () => {
    require('../src/parent/new-medication.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    expect(window.electronAPI.getChildren).toHaveBeenCalled();
    const select = document.getElementById('child-select');
    // placeholder + 1 child
    expect(select.options.length).toBe(2);
  });

  test('redirects to landing if no session', async () => {
    window.electronAPI.getSession.mockResolvedValue(null);
    require('../src/parent/new-medication.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('landing');
  });

  test('edit mode loads existing medication data', async () => {
    window.electronAPI.getNavigationData.mockResolvedValue({ editMode: true, medicationId: 5 });
    window.electronAPI.getMedication.mockResolvedValue({
      child_id: 1,
      medication_name: 'Albuterol',
      purchase_date: '2025-01-01',
      expiration_date: '2026-01-01',
      doses_remaining: 100,
      is_rescue: true,
      notes: 'Test notes'
    });

    require('../src/parent/new-medication.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    expect(document.getElementById('page-title').textContent).toBe('Edit Medication');
    expect(document.getElementById('med-name').value).toBe('Albuterol');
    expect(document.getElementById('purchase-date').value).toBe('2025-01-01');
    expect(document.getElementById('doses-remaining').value).toBe('100');
    expect(document.getElementById('rescue-yes').checked).toBe(true);
    expect(document.getElementById('med-notes').value).toBe('Test notes');
  });

  test('character count updates on input', async () => {
    require('../src/parent/new-medication.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    const nameInput = document.getElementById('med-name');
    nameInput.value = 'Hello';
    nameInput.dispatchEvent(new Event('input'));
    expect(document.getElementById('name-count').textContent).toBe('5');

    const notesInput = document.getElementById('med-notes');
    notesInput.value = 'Some notes here';
    notesInput.dispatchEvent(new Event('input'));
    expect(document.getElementById('notes-count').textContent).toBe('15');
  });

  test('form submit validates required fields', async () => {
    require('../src/parent/new-medication.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    // Submit with empty fields
    const form = document.getElementById('med-form');
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await jest.advanceTimersByTimeAsync(0);

    const errEl = document.getElementById('form-error');
    expect(errEl.textContent).toContain('Please fill in all required fields');
    expect(errEl.classList.contains('hidden')).toBe(false);
  });

  test('form submit validates expiry > purchase date', async () => {
    require('../src/parent/new-medication.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    document.getElementById('child-select').value = '1';
    document.getElementById('med-name').value = 'Albuterol';
    document.getElementById('purchase-date').value = '2026-01-01';
    document.getElementById('expiry-date').value = '2025-01-01';
    document.getElementById('doses-remaining').value = '100';

    const form = document.getElementById('med-form');
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await jest.advanceTimersByTimeAsync(0);

    expect(document.getElementById('form-error').textContent).toContain('Expiration date must be after');
  });

  test('successful add calls addMedication and shows success', async () => {
    require('../src/parent/new-medication.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    document.getElementById('child-select').value = '1';
    document.getElementById('med-name').value = 'Albuterol';
    document.getElementById('purchase-date').value = '2025-01-01';
    document.getElementById('expiry-date').value = '2026-06-01';
    document.getElementById('doses-remaining').value = '200';

    const form = document.getElementById('med-form');
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await jest.advanceTimersByTimeAsync(0);

    expect(window.electronAPI.addMedication).toHaveBeenCalled();
    expect(window.showSuccess).toHaveBeenCalledWith(
      expect.stringContaining('Successfully added Albuterol'),
      expect.any(String),
      expect.any(Function)
    );
  });

  test('failed save shows error on form', async () => {
    window.electronAPI.addMedication.mockResolvedValue({ success: false, error: 'DB error' });
    require('../src/parent/new-medication.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    document.getElementById('child-select').value = '1';
    document.getElementById('med-name').value = 'Albuterol';
    document.getElementById('purchase-date').value = '2025-01-01';
    document.getElementById('expiry-date').value = '2026-06-01';
    document.getElementById('doses-remaining').value = '200';

    const form = document.getElementById('med-form');
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await jest.advanceTimersByTimeAsync(0);

    expect(document.getElementById('form-error').textContent).toBe('DB error');
    expect(document.getElementById('save-btn').disabled).toBe(false);
  });

  test('API exception shows toast error', async () => {
    window.electronAPI.addMedication.mockRejectedValue(new Error('network'));
    require('../src/parent/new-medication.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    document.getElementById('child-select').value = '1';
    document.getElementById('med-name').value = 'Albuterol';
    document.getElementById('purchase-date').value = '2025-01-01';
    document.getElementById('expiry-date').value = '2026-06-01';
    document.getElementById('doses-remaining').value = '200';

    const form = document.getElementById('med-form');
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await jest.advanceTimersByTimeAsync(0);

    expect(window.showToast).toHaveBeenCalledWith('Something went wrong. Please try again.', 'error');
    expect(document.getElementById('save-btn').disabled).toBe(false);
  });

  test('back button navigates to medication inventory', async () => {
    require('../src/parent/new-medication.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    document.getElementById('back-btn').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('parent-medication-inventory');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. provider-sharing.js
// ═══════════════════════════════════════════════════════════════════
describe('ProviderSharing (provider-sharing.js)', () => {
  beforeEach(() => {
    cleanupDOM();
    setupGlobals();
    jest.useFakeTimers();
    window.electronAPI = createMockElectronAPI({
      getNavigationData: jest.fn().mockResolvedValue({ childId: 5 })
    });

    setupDOM([
      'sharing-toggles',
      { tag: 'button', id: 'back-btn' },
      { tag: 'button', id: 'generate-code-btn' },
      { tag: 'button', id: 'save-sharing-btn' },
      'code-text',
      'code-expiry',
      'code-display'
    ]);
    // code-display starts hidden
    document.getElementById('code-display').classList.add('hidden');
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.resetModules();
  });

  test('initializePage builds toggles and sets up listeners', async () => {
    require('../src/parent/provider-sharing.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    expect(window.electronAPI.getSession).toHaveBeenCalled();
    // Toggles should be built
    const toggles = document.getElementById('sharing-toggles');
    expect(toggles.innerHTML).toContain('toggle-shareRescueLogs');
  });

  test('redirects to landing if no session', async () => {
    window.electronAPI.getSession.mockResolvedValue(null);
    require('../src/parent/provider-sharing.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('landing');
  });

  test('redirects to child-overview if no childId', async () => {
    window.electronAPI.getNavigationData.mockResolvedValue(null);
    require('../src/parent/provider-sharing.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('parent-child-overview');
  });

  test('generate code button calls API and shows code', async () => {
    require('../src/parent/provider-sharing.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    document.getElementById('generate-code-btn').click();
    await jest.advanceTimersByTimeAsync(0);

    expect(window.electronAPI.generateAccessCode).toHaveBeenCalledWith(
      expect.objectContaining({ childId: 5 })
    );
    expect(document.getElementById('code-text').textContent).toBe('ABCD1234');
    expect(document.getElementById('code-display').classList.contains('hidden')).toBe(false);
  });

  test('generate code failure shows toast', async () => {
    window.electronAPI.generateAccessCode.mockResolvedValue({ success: false, error: 'limit reached' });
    require('../src/parent/provider-sharing.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    document.getElementById('generate-code-btn').click();
    await jest.advanceTimersByTimeAsync(0);

    expect(window.showToast).toHaveBeenCalledWith(expect.stringContaining('limit reached'), 'error');
  });

  test('generate code exception shows toast', async () => {
    window.electronAPI.generateAccessCode.mockRejectedValue(new Error('network'));
    require('../src/parent/provider-sharing.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    document.getElementById('generate-code-btn').click();
    await jest.advanceTimersByTimeAsync(0);

    expect(window.showToast).toHaveBeenCalledWith('Something went wrong. Please try again.', 'error');
  });

  test('save sharing settings calls API', async () => {
    require('../src/parent/provider-sharing.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    document.getElementById('save-sharing-btn').click();
    await jest.advanceTimersByTimeAsync(0);

    expect(window.electronAPI.updateSharingSettings).toHaveBeenCalledWith(
      expect.objectContaining({ childId: 5, parentId: 1 })
    );
    expect(window.showToast).toHaveBeenCalledWith('Sharing settings saved!', 'success');
  });

  test('save sharing settings failure shows error toast', async () => {
    window.electronAPI.updateSharingSettings.mockRejectedValue(new Error('fail'));
    require('../src/parent/provider-sharing.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    document.getElementById('save-sharing-btn').click();
    await jest.advanceTimersByTimeAsync(0);

    expect(window.showToast).toHaveBeenCalledWith('Failed to save settings. Please try again.', 'error');
  });

  test('back button navigates with childId', async () => {
    require('../src/parent/provider-sharing.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    document.getElementById('back-btn').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('parent-child-overview', { childId: 5 });
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. notifications.js
// ═══════════════════════════════════════════════════════════════════
describe('Notifications (notifications.js)', () => {
  const sampleNotifications = [
    { notification_id: 1, title: 'Low Supply', message: 'Albuterol running low', notification_type: 'low_dose_count', is_read: 0, created_at: '2026-01-15T10:00:00Z' },
    { notification_id: 2, title: 'Expired', message: 'Inhaler expired', notification_type: 'medication_expiry', is_read: 0, created_at: '2026-01-14T10:00:00Z' },
    { notification_id: 3, title: 'PEF Update', message: 'New PEF', notification_type: 'pef_submitted', is_read: 1, created_at: '2026-01-13T10:00:00Z' }
  ];

  beforeEach(() => {
    cleanupDOM();
    setupGlobals();
    jest.useFakeTimers();
    window.electronAPI = createMockElectronAPI({
      getNotifications: jest.fn().mockResolvedValue(sampleNotifications.map(n => ({ ...n })))
    });

    setupDOM([
      'notif-list',
      'notif-count-label',
      'pagination-controls',
      { tag: 'button', id: 'back-btn' },
      { tag: 'button', id: 'mark-all-read-btn' },
      { tag: 'input', id: 'show-read-toggle', type: 'checkbox' }
    ]);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.resetModules();
  });

  test('initializePage loads and renders unread notifications', async () => {
    require('../src/parent/notifications.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    expect(window.electronAPI.getNotifications).toHaveBeenCalled();
    // Default: showRead is false, so only 2 unread shown
    const entries = document.querySelectorAll('.notif-entry');
    expect(entries.length).toBe(2);
    expect(document.getElementById('notif-count-label').textContent).toBe('2 unread');
  });

  test('redirects to landing if no session', async () => {
    window.electronAPI.getSession.mockResolvedValue(null);
    require('../src/parent/notifications.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('landing');
  });

  test('shows empty state when no unread notifications', async () => {
    window.electronAPI.getNotifications.mockResolvedValue([
      { notification_id: 1, title: 'Read', message: 'msg', notification_type: 'pef_submitted', is_read: 1, created_at: '2026-01-01T00:00:00Z' }
    ]);
    require('../src/parent/notifications.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    expect(document.getElementById('notif-list').innerHTML).toContain('All caught up');
  });

  test('show read toggle reveals all notifications', async () => {
    require('../src/parent/notifications.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    const toggle = document.getElementById('show-read-toggle');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    await jest.advanceTimersByTimeAsync(0);

    const entries = document.querySelectorAll('.notif-entry');
    expect(entries.length).toBe(3); // all 3 now shown
  });

  test('mark all read updates UI', async () => {
    require('../src/parent/notifications.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    document.getElementById('mark-all-read-btn').click();
    await jest.advanceTimersByTimeAsync(0);

    expect(window.electronAPI.markAllNotificationsRead).toHaveBeenCalled();
    expect(window.showToast).toHaveBeenCalledWith('All notifications marked as read', 'success');
    // Now showing "All caught up" since showRead is false and all are read
    expect(document.getElementById('notif-list').innerHTML).toContain('All caught up');
  });

  test('clicking unread notification marks it as read', async () => {
    require('../src/parent/notifications.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    const firstEntry = document.querySelector('.notif-entry');
    firstEntry.click();
    await jest.advanceTimersByTimeAsync(0);

    expect(window.electronAPI.markNotificationRead).toHaveBeenCalledWith(1);
    expect(firstEntry.className).toContain('read');
    expect(document.getElementById('notif-count-label').textContent).toBe('1 unread');
  });

  test('handles null notifications gracefully', async () => {
    window.electronAPI.getNotifications.mockResolvedValue(null);
    require('../src/parent/notifications.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    // Should not throw; shows empty state
    expect(document.getElementById('notif-list').innerHTML).toContain('All caught up');
  });

  test('API error shows toast', async () => {
    window.electronAPI.getNotifications.mockRejectedValue(new Error('fail'));
    require('../src/parent/notifications.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    expect(window.showToast).toHaveBeenCalledWith(expect.stringContaining('Could not load notifications'), 'error');
  });

  test('back button navigates to parent-main', async () => {
    require('../src/parent/notifications.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);
    document.getElementById('back-btn').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('parent-main');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. medication-inventory.js
// ═══════════════════════════════════════════════════════════════════
describe('MedicationInventory (medication-inventory.js)', () => {
  const sampleMeds = [
    {
      medication_id: 1, medication_name: 'Albuterol', is_rescue: true, is_active: 1,
      child_name: 'Alice', doses_remaining: 50, purchase_date: '2025-01-01',
      expiration_date: '2027-01-01', notes: null
    },
    {
      medication_id: 2, medication_name: 'Flovent', is_rescue: false, is_active: 1,
      child_name: 'Alice', doses_remaining: 10, purchase_date: '2025-01-01',
      expiration_date: '2027-01-01', notes: 'Take daily'
    }
  ];

  beforeEach(() => {
    cleanupDOM();
    setupGlobals();
    jest.useFakeTimers();
    window.electronAPI = createMockElectronAPI({
      getAllMedications: jest.fn().mockResolvedValue(sampleMeds.map(m => ({ ...m })))
    });

    setupDOM([
      'med-list',
      { tag: 'button', id: 'back-btn' },
      { tag: 'button', id: 'add-medication-btn' },
      { tag: 'input', id: 'show-inactive-toggle', type: 'checkbox' }
    ]);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.resetModules();
  });

  test('initializePage loads and renders medications', async () => {
    require('../src/parent/medication-inventory.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    expect(window.electronAPI.getAllMedications).toHaveBeenCalled();
    const bars = document.querySelectorAll('.med-bar');
    expect(bars.length).toBe(2);
  });

  test('redirects to landing if no session', async () => {
    window.electronAPI.getSession.mockResolvedValue(null);
    require('../src/parent/medication-inventory.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('landing');
  });

  test('empty state shown when no medications', async () => {
    window.electronAPI.getAllMedications.mockResolvedValue([]);
    require('../src/parent/medication-inventory.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    expect(document.getElementById('med-list').innerHTML).toContain('No medications yet');
  });

  test('clicking a medication bar expands detail panel', async () => {
    require('../src/parent/medication-inventory.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    const bar = document.querySelector('.med-bar');
    bar.click();
    await jest.advanceTimersByTimeAsync(0);

    const detail = document.querySelector('.med-detail-panel');
    expect(detail).not.toBeNull();
    expect(detail.innerHTML).toContain('Doses Remaining');
  });

  test('clicking same bar again collapses detail', async () => {
    require('../src/parent/medication-inventory.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    const bar = document.querySelector('.med-bar');
    bar.click();
    await jest.advanceTimersByTimeAsync(0);
    expect(document.querySelector('.med-detail-panel')).not.toBeNull();

    // Re-query bar after re-render
    const barAgain = document.querySelector('.med-bar');
    barAgain.click();
    await jest.advanceTimersByTimeAsync(0);
    expect(document.querySelector('.med-detail-panel')).toBeNull();
  });

  test('edit button navigates to new-medication in edit mode', async () => {
    require('../src/parent/medication-inventory.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    // Expand first medication
    const bar = document.querySelector('.med-bar');
    bar.click();
    await jest.advanceTimersByTimeAsync(0);

    const editBtn = document.querySelector('[data-edit-medication-id]');
    editBtn.click();
    await jest.advanceTimersByTimeAsync(0);

    expect(window.electronAPI.navigate).toHaveBeenCalledWith('parent-new-medication', { editMode: true, medicationId: 1 });
  });

  test('deactivate button calls API after confirm', async () => {
    require('../src/parent/medication-inventory.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    // Expand first medication
    document.querySelector('.med-bar').click();
    await jest.advanceTimersByTimeAsync(0);

    const toggleBtn = document.querySelector('[data-toggle-med-id]');
    toggleBtn.click();
    await jest.advanceTimersByTimeAsync(0);

    expect(window.showConfirm).toHaveBeenCalled();
    expect(window.electronAPI.setMedicationActive).toHaveBeenCalledWith({ medicationId: 1, isActive: false });
    expect(window.showToast).toHaveBeenCalledWith(expect.stringContaining('deactivated'), 'success');
  });

  test('add medication button navigates', async () => {
    require('../src/parent/medication-inventory.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    document.getElementById('add-medication-btn').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('parent-new-medication', { editMode: false });
  });

  test('show inactive toggle reloads with inactive meds', async () => {
    require('../src/parent/medication-inventory.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    const toggle = document.getElementById('show-inactive-toggle');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    await jest.advanceTimersByTimeAsync(0);

    expect(window.electronAPI.getAllMedications).toHaveBeenCalledWith({ includeInactive: true });
  });

  test('back button navigates to parent-main', async () => {
    require('../src/parent/medication-inventory.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);
    document.getElementById('back-btn').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('parent-main');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 7. medication-logs.js
// ═══════════════════════════════════════════════════════════════════
describe('MedicationLogs (medication-logs.js)', () => {
  const sampleLogs = [
    { medication_name: 'Albuterol', is_rescue: true, timestamp: '2026-01-15T10:00:00Z', doses_taken: 2, breathing_before: 1, breathing_after: 3, child_name: 'Alice' },
    { medication_name: 'Flovent', is_rescue: false, timestamp: '2026-01-14T09:00:00Z', doses_taken: 1, breathing_before: 2, breathing_after: 2, child_name: 'Alice' },
    { medication_name: 'Albuterol', is_rescue: true, timestamp: '2026-01-13T08:00:00Z', doses_taken: 1, breathing_before: null, breathing_after: null, child_name: 'Bob' }
  ];

  beforeEach(() => {
    cleanupDOM();
    setupGlobals();
    jest.useFakeTimers();
    window.electronAPI = createMockElectronAPI({
      getMedicationLogs: jest.fn().mockResolvedValue(sampleLogs.map(l => ({ ...l }))),
      getAllMedications: jest.fn().mockResolvedValue([{ medication_name: 'Albuterol' }, { medication_name: 'Flovent' }])
    });

    setupDOM([
      'log-list',
      { tag: 'input', id: 'search-med', type: 'text' },
      { tag: 'input', id: 'filter-week', type: 'date' },
      { tag: 'button', id: 'clear-filters-btn' },
      'filter-summary',
      'pagination-controls',
      { tag: 'button', id: 'back-btn' },
      { tag: 'datalist', id: 'med-suggestions' }
    ]);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.resetModules();
  });

  test('initializePage loads and renders logs', async () => {
    require('../src/parent/medication-logs.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    expect(window.electronAPI.getMedicationLogs).toHaveBeenCalledWith({ days: 90 });
    const entries = document.querySelectorAll('.ml-entry');
    expect(entries.length).toBe(3);
  });

  test('redirects to landing if no session', async () => {
    window.electronAPI.getSession.mockResolvedValue(null);
    require('../src/parent/medication-logs.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('landing');
  });

  test('shows empty state when no logs', async () => {
    window.electronAPI.getMedicationLogs.mockResolvedValue([]);
    require('../src/parent/medication-logs.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    expect(document.getElementById('log-list').innerHTML).toContain('No logs yet');
  });

  test('search filters logs by medication name', async () => {
    require('../src/parent/medication-logs.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    const searchInput = document.getElementById('search-med');
    searchInput.value = 'flovent';
    searchInput.dispatchEvent(new Event('input'));
    // Debounce is 250ms
    await jest.advanceTimersByTimeAsync(300);

    const entries = document.querySelectorAll('.ml-entry');
    expect(entries.length).toBe(1);
    expect(document.getElementById('filter-summary').textContent).toContain('1 result');
  });

  test('clear filters resets search and week', async () => {
    require('../src/parent/medication-logs.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    // Set a filter first
    document.getElementById('search-med').value = 'flovent';
    document.getElementById('clear-filters-btn').click();
    await jest.advanceTimersByTimeAsync(0);

    expect(document.getElementById('search-med').value).toBe('');
    const entries = document.querySelectorAll('.ml-entry');
    expect(entries.length).toBe(3);
  });

  test('week filter narrows results by date range', async () => {
    require('../src/parent/medication-logs.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    const weekInput = document.getElementById('filter-week');
    weekInput.value = '2026-01-15';
    weekInput.dispatchEvent(new Event('change'));
    await jest.advanceTimersByTimeAsync(0);

    // Jan 15 2026 is a Thursday. Monday = Jan 12, Sunday = Jan 18.
    // All 3 logs (Jan 13, 14, 15) fall in that week.
    const entries = document.querySelectorAll('.ml-entry');
    expect(entries.length).toBe(3);
    expect(document.getElementById('filter-summary').classList.contains('hidden')).toBe(false);
  });

  test('no matching logs shows empty state', async () => {
    require('../src/parent/medication-logs.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    const searchInput = document.getElementById('search-med');
    searchInput.value = 'nonexistent';
    searchInput.dispatchEvent(new Event('input'));
    await jest.advanceTimersByTimeAsync(300);

    expect(document.getElementById('log-list').innerHTML).toContain('No matching logs');
  });

  test('populates medication suggestions datalist', async () => {
    require('../src/parent/medication-logs.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    expect(window.electronAPI.getAllMedications).toHaveBeenCalledWith({ includeInactive: true });
    const datalist = document.getElementById('med-suggestions');
    expect(datalist.innerHTML).toContain('Albuterol');
    expect(datalist.innerHTML).toContain('Flovent');
  });

  test('API error shows toast', async () => {
    window.electronAPI.getMedicationLogs.mockRejectedValue(new Error('fail'));
    require('../src/parent/medication-logs.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    expect(window.showToast).toHaveBeenCalledWith(expect.stringContaining('Could not load medication logs'), 'error');
  });

  test('renders breathing trend indicators correctly', async () => {
    require('../src/parent/medication-logs.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    const entries = document.querySelectorAll('.ml-entry');
    // First log: before=1(Bad), after=3(Good) -> improved
    expect(entries[0].querySelector('.ml-trend').classList.contains('improved')).toBe(true);
    // Second log: before=2, after=2 -> no-change
    expect(entries[1].querySelector('.ml-trend').classList.contains('no-change')).toBe(true);
  });

  test('back button navigates to parent-main', async () => {
    require('../src/parent/medication-logs.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);
    document.getElementById('back-btn').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('parent-main');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 8. incident-logs.js
// ═══════════════════════════════════════════════════════════════════
describe('IncidentLogs (incident-logs.js)', () => {
  const sampleIncidents = [
    {
      incident_id: 1, child_id: 1, child_name: 'Alice', timestamp: '2026-01-15T10:00:00Z',
      can_speak_full_sentences: false, chest_retracting: true, blue_grey_lips: false,
      current_pef: 150, user_notes: 'Was playing outside',
      guidance_provided: 'OUTCOME: Called 911\n--- EVENT LOG ---\n10:00 Started\n10:05 Called 911'
    },
    {
      incident_id: 2, child_id: 2, child_name: 'Bob', timestamp: '2026-01-14T09:00:00Z',
      can_speak_full_sentences: true, chest_retracting: false, blue_grey_lips: false,
      current_pef: null, user_notes: null,
      guidance_provided: 'Some guidance text without event log'
    }
  ];

  beforeEach(() => {
    cleanupDOM();
    setupGlobals();
    jest.useFakeTimers();
    window.electronAPI = createMockElectronAPI({
      getAllIncidents: jest.fn().mockResolvedValue(sampleIncidents.map(i => ({ ...i }))),
      getChildren: jest.fn().mockResolvedValue([
        { child_id: 1, name: 'Alice' },
        { child_id: 2, name: 'Bob' }
      ])
    });

    setupDOM([
      'incident-list',
      { tag: 'select', id: 'filter-child', innerHTML: '<option value="">All children</option>' },
      { tag: 'input', id: 'filter-week', type: 'date' },
      { tag: 'button', id: 'clear-filters-btn' },
      'filter-summary',
      'pagination-controls',
      { tag: 'button', id: 'back-btn' },
      { tag: 'button', id: 'log-modal-close' },
      'log-modal-subtitle',
      'log-modal-content'
    ]);

    // Create modal overlay with inner modal div
    const overlay = document.createElement('div');
    overlay.id = 'log-modal-overlay';
    overlay.classList.add('hidden');
    overlay.innerHTML = '<div class="log-modal"><button id="log-modal-close-inner">Close</button></div>';
    document.body.appendChild(overlay);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.resetModules();
  });

  test('initializePage loads incidents and children into filter', async () => {
    require('../src/parent/incident-logs.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    expect(window.electronAPI.getAllIncidents).toHaveBeenCalled();
    expect(window.electronAPI.getChildren).toHaveBeenCalled();

    const filterChild = document.getElementById('filter-child');
    // "All children" + 2 children
    expect(filterChild.options.length).toBe(3);

    const entries = document.querySelectorAll('.il-entry');
    expect(entries.length).toBe(2);
  });

  test('redirects to landing if no session', async () => {
    window.electronAPI.getSession.mockResolvedValue(null);
    require('../src/parent/incident-logs.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('landing');
  });

  test('shows empty state when no incidents', async () => {
    window.electronAPI.getAllIncidents.mockResolvedValue([]);
    require('../src/parent/incident-logs.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    expect(document.getElementById('incident-list').innerHTML).toContain('No incidents recorded');
  });

  test('renders critical incident with danger flags', async () => {
    require('../src/parent/incident-logs.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    const entries = document.querySelectorAll('.il-entry');
    // First incident has danger flags
    expect(entries[0].innerHTML).toContain('Cannot speak in full sentences');
    expect(entries[0].innerHTML).toContain('Chest retracting');
    expect(entries[0].querySelector('.il-severity-badge').classList.contains('critical')).toBe(true);

    // Second incident is moderate
    expect(entries[1].querySelector('.il-severity-badge').classList.contains('moderate')).toBe(true);
  });

  test('child filter narrows incidents', async () => {
    require('../src/parent/incident-logs.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    const filterChild = document.getElementById('filter-child');
    filterChild.value = '1';
    filterChild.dispatchEvent(new Event('change'));
    await jest.advanceTimersByTimeAsync(0);

    const entries = document.querySelectorAll('.il-entry');
    expect(entries.length).toBe(1);
    expect(document.getElementById('filter-summary').textContent).toContain('1 result');
  });

  test('clear filters resets child and week filters', async () => {
    require('../src/parent/incident-logs.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    // Set filter
    document.getElementById('filter-child').value = '1';
    document.getElementById('clear-filters-btn').click();
    await jest.advanceTimersByTimeAsync(0);

    expect(document.getElementById('filter-child').value).toBe('');
    const entries = document.querySelectorAll('.il-entry');
    expect(entries.length).toBe(2);
  });

  test('clicking log button opens modal', async () => {
    require('../src/parent/incident-logs.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    const logBtn = document.querySelector('.il-log-btn');
    logBtn.click();
    await jest.advanceTimersByTimeAsync(100);

    const overlay = document.getElementById('log-modal-overlay');
    expect(overlay.classList.contains('hidden')).toBe(false);
    expect(overlay.classList.contains('log-modal-visible')).toBe(true);
    expect(document.getElementById('log-modal-content').textContent).toContain('EVENT LOG');
  });

  test('close modal button hides overlay', async () => {
    require('../src/parent/incident-logs.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    // Open modal
    document.querySelector('.il-log-btn').click();
    await jest.advanceTimersByTimeAsync(100);

    // Close modal
    document.getElementById('log-modal-close').click();
    await jest.advanceTimersByTimeAsync(300);

    const overlay = document.getElementById('log-modal-overlay');
    expect(overlay.classList.contains('log-modal-visible')).toBe(false);
  });

  test('escape key closes modal', async () => {
    require('../src/parent/incident-logs.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    // Open modal
    document.querySelector('.il-log-btn').click();
    await jest.advanceTimersByTimeAsync(100);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await jest.advanceTimersByTimeAsync(300);

    expect(document.getElementById('log-modal-overlay').classList.contains('log-modal-visible')).toBe(false);
  });

  test('no matching filter results shows empty state', async () => {
    require('../src/parent/incident-logs.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    const weekInput = document.getElementById('filter-week');
    weekInput.value = '2020-01-01';
    weekInput.dispatchEvent(new Event('change'));
    await jest.advanceTimersByTimeAsync(0);

    expect(document.getElementById('incident-list').innerHTML).toContain('No matching incidents');
  });

  test('auto-selects child from navData', async () => {
    window.electronAPI.getNavigationData.mockResolvedValue({ childId: 2 });
    require('../src/parent/incident-logs.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    expect(document.getElementById('filter-child').value).toBe('2');
    // Only Bob's incident should show
    const entries = document.querySelectorAll('.il-entry');
    expect(entries.length).toBe(1);
  });

  test('API error shows toast', async () => {
    window.electronAPI.getAllIncidents.mockRejectedValue(new Error('fail'));
    require('../src/parent/incident-logs.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    expect(window.showToast).toHaveBeenCalledWith(expect.stringContaining('Could not load incident logs'), 'error');
  });

  test('back button navigates to parent-main', async () => {
    require('../src/parent/incident-logs.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);
    document.getElementById('back-btn').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('parent-main');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 9. pdf-report.js
// ═══════════════════════════════════════════════════════════════════
describe('PdfReport (pdf-report.js)', () => {
  beforeEach(() => {
    cleanupDOM();
    setupGlobals();
    jest.useFakeTimers();
    window.electronAPI = createMockElectronAPI({
      getChildren: jest.fn().mockResolvedValue([
        { child_id: 1, name: 'Alice' },
        { child_id: 2, name: 'Bob' }
      ])
    });

    setupDOM([
      { tag: 'select', id: 'child-select' },
      'form-area',
      { tag: 'input', id: 'start-date', type: 'date' },
      { tag: 'button', id: 'generate-btn' },
      'success-msg',
      { tag: 'button', id: 'back-btn' },
      { tag: 'canvas', id: 'chart-pef-trend' },
      { tag: 'canvas', id: 'chart-pef-zones' },
      { tag: 'canvas', id: 'chart-symptoms' }
    ]);
    // form-area starts hidden
    document.getElementById('form-area').classList.add('hidden');
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.resetModules();
  });

  test('initializePage loads children into dropdown', async () => {
    require('../src/parent/pdf-report.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    expect(window.electronAPI.getChildren).toHaveBeenCalled();
    const select = document.getElementById('child-select');
    expect(select.options.length).toBe(3); // placeholder + 2 children
  });

  test('redirects to landing if no session', async () => {
    window.electronAPI.getSession.mockResolvedValue(null);
    require('../src/parent/pdf-report.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('landing');
  });

  test('selecting a child shows the form area with date constraints', async () => {
    require('../src/parent/pdf-report.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    const select = document.getElementById('child-select');
    select.value = '1';
    select.dispatchEvent(new Event('change'));
    await jest.advanceTimersByTimeAsync(0);

    expect(document.getElementById('form-area').classList.contains('hidden')).toBe(false);
    const dateInput = document.getElementById('start-date');
    expect(dateInput.min).toBeTruthy();
    expect(dateInput.max).toBeTruthy();
    expect(dateInput.value).toBeTruthy();
  });

  test('deselecting child hides the form area', async () => {
    require('../src/parent/pdf-report.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    const select = document.getElementById('child-select');
    // Select, then deselect
    select.value = '1';
    select.dispatchEvent(new Event('change'));
    await jest.advanceTimersByTimeAsync(0);

    select.value = '';
    select.dispatchEvent(new Event('change'));
    await jest.advanceTimersByTimeAsync(0);

    expect(document.getElementById('form-area').classList.contains('hidden')).toBe(true);
  });

  test('generate button does nothing when no child selected', async () => {
    require('../src/parent/pdf-report.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    document.getElementById('generate-btn').click();
    await jest.advanceTimersByTimeAsync(0);

    // generatePdf returns early — no API calls for data gathering
    expect(window.electronAPI.getChild).not.toHaveBeenCalled();
  });

  test('back button navigates to parent-main', async () => {
    require('../src/parent/pdf-report.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);
    document.getElementById('back-btn').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('parent-main');
  });

  test('generate PDF handles data gather failure gracefully', async () => {
    window.electronAPI.getChild.mockRejectedValue(new Error('network'));
    require('../src/parent/pdf-report.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    // Select a child
    const select = document.getElementById('child-select');
    select.value = '1';
    select.dispatchEvent(new Event('change'));
    await jest.advanceTimersByTimeAsync(0);

    // Click generate
    document.getElementById('generate-btn').click();
    await jest.advanceTimersByTimeAsync(0);

    expect(window.showToast).toHaveBeenCalledWith(expect.stringContaining('Failed to gather report data'), 'error');
    expect(document.getElementById('generate-btn').disabled).toBe(false);
  });

  test('generate PDF handles null child gracefully', async () => {
    window.electronAPI.getChild.mockResolvedValue(null);
    window.electronAPI.getMedicationAdherence.mockResolvedValue({ daysPlanned: 0, daysCompleted: 0, percentage: 0 });
    window.electronAPI.getIncidents.mockResolvedValue([]);
    window.electronAPI.getMedicationLogs.mockResolvedValue([]);
    window.electronAPI.getCheckinHistory.mockResolvedValue([]);
    window.electronAPI.getPefHistory.mockResolvedValue([]);
    window.electronAPI.getMedications.mockResolvedValue([]);
    window.electronAPI.getControllerSchedule.mockResolvedValue(null);
    window.electronAPI.countTechniqueSessions.mockResolvedValue(0);

    require('../src/parent/pdf-report.js');
    fireDOMContentLoaded();
    await jest.advanceTimersByTimeAsync(0);

    const select = document.getElementById('child-select');
    select.value = '1';
    select.dispatchEvent(new Event('change'));
    await jest.advanceTimersByTimeAsync(0);

    document.getElementById('generate-btn').click();
    await jest.advanceTimersByTimeAsync(0);

    expect(window.showToast).toHaveBeenCalledWith(expect.stringContaining('Could not load child data'), 'error');
    expect(document.getElementById('generate-btn').disabled).toBe(false);
  });
});
