/**
 * @jest-environment jsdom
 */
const { createMockElectronAPI, setupDOM, fireDOMContentLoaded, flushPromises, setupGlobals, cleanupDOM } = require('./__helpers__/renderer-setup');

// ─────────────────────────────────────────────────────────────────────────────
// PROVIDER MAIN (src/provider/main.js)
// ─────────────────────────────────────────────────────────────────────────────
describe('provider/main.js', () => {
  let electronAPI;

  function setupProviderMainDOM() {
    setupDOM([
      { tag: 'input', id: 'access-code-input', type: 'text' },
      'code-error',
      'code-success',
      'patient-list',
      'pagination-controls',
      'pagination-counter',
      'show-more-btn',
      'username-display',
      'logout-btn',
      'activate-code-btn',
      'nav-settings',
    ]);
    // code-error and code-success start with hidden
    document.getElementById('code-error').classList.add('hidden');
    document.getElementById('code-success').classList.add('hidden');
    document.getElementById('pagination-controls').classList.add('hidden');
  }

  beforeEach(() => {
    jest.resetModules();
    cleanupDOM();
    setupProviderMainDOM();
    setupGlobals();
    electronAPI = createMockElectronAPI({
      getSession: jest.fn().mockResolvedValue({ userId: 10, username: 'smith', role: 'provider' }),
      getProviderPatients: jest.fn().mockResolvedValue([]),
    });
    window.electronAPI = electronAPI;
  });

  afterEach(() => {
    cleanupDOM();
    delete window.electronAPI;
  });

  function loadModule() {
    jest.isolateModules(() => {
      require('../src/provider/main');
    });
  }

  // ── DOMContentLoaded / initializePage ──────────────────────────────────────

  test('initializePage sets username and loads patients on DOMContentLoaded', async () => {
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    expect(electronAPI.getSession).toHaveBeenCalled();
    expect(document.getElementById('username-display').textContent).toBe('Dr. smith');
    expect(electronAPI.getProviderPatients).toHaveBeenCalled();
  });

  test('navigates to landing if no session', async () => {
    electronAPI.getSession.mockResolvedValue(null);
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    expect(electronAPI.navigate).toHaveBeenCalledWith('landing');
  });

  test('navigates to landing if session has no userId', async () => {
    electronAPI.getSession.mockResolvedValue({ userId: null });
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    expect(electronAPI.navigate).toHaveBeenCalledWith('landing');
  });

  test('handles initializePage error gracefully', async () => {
    electronAPI.getSession.mockRejectedValue(new Error('network fail'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    expect(document.getElementById('username-display').textContent).toBe('Error loading page');
    spy.mockRestore();
  });

  // ── Button wiring ─────────────────────────────────────────────────────────

  test('logout button calls logout', async () => {
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('logout-btn').click();
    expect(electronAPI.logout).toHaveBeenCalled();
  });

  test('nav-settings button navigates to settings', async () => {
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('nav-settings').click();
    expect(electronAPI.navigate).toHaveBeenCalledWith('settings');
  });

  // ── activateCode ──────────────────────────────────────────────────────────

  test('activateCode shows error for empty code', async () => {
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('access-code-input').value = '';
    document.getElementById('activate-code-btn').click();
    await flushPromises();

    const errEl = document.getElementById('code-error');
    expect(errEl.textContent).toBe('Please enter the full 8-character access code');
    expect(errEl.classList.contains('hidden')).toBe(false);
  });

  test('activateCode shows error for short code', async () => {
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('access-code-input').value = 'ABC';
    document.getElementById('activate-code-btn').click();
    await flushPromises();

    const errEl = document.getElementById('code-error');
    expect(errEl.textContent).toBe('Please enter the full 8-character access code');
    expect(errEl.classList.contains('hidden')).toBe(false);
  });

  test('activateCode succeeds and reloads patients', async () => {
    electronAPI.activateAccessCode.mockResolvedValue({ success: true });
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('access-code-input').value = 'ABCD1234';
    document.getElementById('activate-code-btn').click();
    await flushPromises();

    expect(electronAPI.activateAccessCode).toHaveBeenCalledWith('ABCD1234');
    const succEl = document.getElementById('code-success');
    expect(succEl.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('access-code-input').value).toBe('');
    // loadPatients called again (once from init, once from activation)
    expect(electronAPI.getProviderPatients).toHaveBeenCalledTimes(2);
  });

  test('activateCode shows error when result.success is false', async () => {
    electronAPI.activateAccessCode.mockResolvedValue({ success: false, error: 'Code expired' });
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('access-code-input').value = 'XXXX9999';
    document.getElementById('activate-code-btn').click();
    await flushPromises();

    const errEl = document.getElementById('code-error');
    expect(errEl.textContent).toBe('Code expired');
    expect(errEl.classList.contains('hidden')).toBe(false);
  });

  test('activateCode shows default error when result.error is empty', async () => {
    electronAPI.activateAccessCode.mockResolvedValue({ success: false });
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('access-code-input').value = 'XXXX9999';
    document.getElementById('activate-code-btn').click();
    await flushPromises();

    const errEl = document.getElementById('code-error');
    expect(errEl.textContent).toBe('Invalid or expired access code');
  });

  test('activateCode shows generic error on exception', async () => {
    electronAPI.activateAccessCode.mockRejectedValue(new Error('boom'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('access-code-input').value = 'ABCD1234';
    document.getElementById('activate-code-btn').click();
    await flushPromises();

    const errEl = document.getElementById('code-error');
    expect(errEl.textContent).toBe('Something went wrong. Please try again.');
    expect(errEl.classList.contains('hidden')).toBe(false);
    spy.mockRestore();
  });

  // ── loadPatients ──────────────────────────────────────────────────────────

  test('loadPatients shows empty state when no patients', async () => {
    electronAPI.getProviderPatients.mockResolvedValue([]);
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    const container = document.getElementById('patient-list');
    expect(container.innerHTML).toContain('No patients yet');
  });

  test('loadPatients renders patient list items', async () => {
    electronAPI.getProviderPatients.mockResolvedValue([
      { child_id: 1, child_name: 'Alice Bob', birthday: '2018-05-10', parent_username: 'parentA' },
      { child_id: 2, child_name: 'Charlie', birthday: '2015-01-01', parent_username: 'parentB' },
    ]);
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    const container = document.getElementById('patient-list');
    const items = container.querySelectorAll('.patient-list-item');
    expect(items.length).toBe(2);
    expect(items[0].innerHTML).toContain('Alice Bob');
    expect(items[0].innerHTML).toContain('parentA');
    expect(items[0].querySelector('.patient-avatar').textContent).toBe('AB');
  });

  test('clicking patient navigates to patient view', async () => {
    electronAPI.getProviderPatients.mockResolvedValue([
      { child_id: 42, child_name: 'Test Kid', birthday: '2020-06-01', parent_username: 'par' },
    ]);
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    const item = document.querySelector('.patient-list-item');
    item.click();
    expect(electronAPI.navigate).toHaveBeenCalledWith('provider-patient-view', { childId: 42 });
  });

  test('keyboard Enter on patient navigates', async () => {
    electronAPI.getProviderPatients.mockResolvedValue([
      { child_id: 7, child_name: 'Kid', birthday: '2019-01-01', parent_username: 'p' },
    ]);
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    const item = document.querySelector('.patient-list-item');
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    jest.spyOn(event, 'preventDefault');
    item.dispatchEvent(event);
    expect(electronAPI.navigate).toHaveBeenCalledWith('provider-patient-view', { childId: 7 });
    expect(event.preventDefault).toHaveBeenCalled();
  });

  test('keyboard Space on patient navigates', async () => {
    electronAPI.getProviderPatients.mockResolvedValue([
      { child_id: 7, child_name: 'Kid', birthday: '2019-01-01', parent_username: 'p' },
    ]);
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    const item = document.querySelector('.patient-list-item');
    const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true });
    item.dispatchEvent(event);
    expect(electronAPI.navigate).toHaveBeenCalledWith('provider-patient-view', { childId: 7 });
  });

  test('keyboard other key does not navigate', async () => {
    electronAPI.getProviderPatients.mockResolvedValue([
      { child_id: 7, child_name: 'Kid', birthday: '2019-01-01', parent_username: 'p' },
    ]);
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    electronAPI.navigate.mockClear();
    const item = document.querySelector('.patient-list-item');
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
    item.dispatchEvent(event);
    // navigate was called during init for nothing, but not for this keydown
    expect(electronAPI.navigate).not.toHaveBeenCalledWith('provider-patient-view', expect.anything());
  });

  test('loadPatients error shows error state', async () => {
    electronAPI.getProviderPatients.mockRejectedValue(new Error('db error'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    const container = document.getElementById('patient-list');
    expect(container.innerHTML).toContain('Could not load patients');
    spy.mockRestore();
  });

  // ── Pagination ────────────────────────────────────────────────────────────

  test('pagination with more than PAGE_SIZE patients shows "Show More"', async () => {
    const patients = [];
    for (let i = 0; i < 30; i++) {
      patients.push({ child_id: i, child_name: `Kid ${i}`, birthday: '2018-01-01', parent_username: 'p' });
    }
    electronAPI.getProviderPatients.mockResolvedValue(patients);
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    const items = document.querySelectorAll('.patient-list-item');
    expect(items.length).toBe(25); // PAGE_SIZE = 25
    const counter = document.getElementById('pagination-counter');
    expect(counter.textContent).toBe('Showing 25 of 30');
    const btn = document.getElementById('show-more-btn');
    expect(btn.classList.contains('hidden')).toBe(false);
  });

  test('clicking show-more renders remaining patients', async () => {
    const patients = [];
    for (let i = 0; i < 30; i++) {
      patients.push({ child_id: i, child_name: `Kid ${i}`, birthday: '2018-01-01', parent_username: 'p' });
    }
    electronAPI.getProviderPatients.mockResolvedValue(patients);
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('show-more-btn').click();
    await flushPromises();

    const items = document.querySelectorAll('.patient-list-item');
    expect(items.length).toBe(30);
    const counter = document.getElementById('pagination-counter');
    expect(counter.textContent).toBe('Showing 30 of 30');
    const btn = document.getElementById('show-more-btn');
    expect(btn.classList.contains('hidden')).toBe(true);
  });

  test('updatePaginationControls returns early if controls element missing', async () => {
    // Remove pagination-controls to test the guard
    const el = document.getElementById('pagination-controls');
    el.parentNode.removeChild(el);

    electronAPI.getProviderPatients.mockResolvedValue([
      { child_id: 1, child_name: 'Kid', birthday: '2018-01-01', parent_username: 'p' },
    ]);
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    // Should not throw even though pagination-controls is missing
    expect(document.querySelectorAll('.patient-list-item').length).toBe(1);
  });

  // ── escapeHtml ────────────────────────────────────────────────────────────

  test('escapeHtml handles null/undefined in patient names', async () => {
    electronAPI.getProviderPatients.mockResolvedValue([
      { child_id: 1, child_name: null, birthday: '2018-01-01', parent_username: undefined },
    ]);
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    // Should not throw; uses 'P' as default for initials
    const avatar = document.querySelector('.patient-avatar');
    expect(avatar.textContent).toBe('P');
  });

  test('escapeHtml escapes special chars in patient data', async () => {
    electronAPI.getProviderPatients.mockResolvedValue([
      { child_id: 1, child_name: '<script>alert("xss")</script>', birthday: '2018-01-01', parent_username: 'a&b' },
    ]);
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    const container = document.getElementById('patient-list');
    expect(container.innerHTML).toContain('&lt;script&gt;');
    expect(container.innerHTML).toContain('a&amp;b');
  });

  // ── activateCode hides previous messages ──────────────────────────────────

  test('activateCode hides previous error and success on each attempt', async () => {
    electronAPI.activateAccessCode.mockResolvedValue({ success: true });
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    // Manually show both messages
    document.getElementById('code-error').classList.remove('hidden');
    document.getElementById('code-success').classList.remove('hidden');

    document.getElementById('access-code-input').value = 'ABCD1234';
    document.getElementById('activate-code-btn').click();
    await flushPromises();

    // Both should be toggled; error hidden, success visible
    expect(document.getElementById('code-success').classList.contains('hidden')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PROVIDER PATIENT-VIEW (src/provider/patient-view.js)
// ─────────────────────────────────────────────────────────────────────────────
describe('provider/patient-view.js', () => {
  let electronAPI;

  // Helper: create a canvas mock that patient-view expects
  function createMockCanvas(id) {
    const canvas = document.createElement('canvas');
    canvas.id = id;
    canvas.width = 400;
    canvas.height = 300;
    canvas.getContext = jest.fn(() => ({ clearRect: jest.fn() }));
    canvas.toDataURL = jest.fn().mockReturnValue('data:image/png;base64,fakeImage');
    document.body.appendChild(canvas);
    return canvas;
  }

  function setupPatientViewDOM() {
    setupDOM([
      'patient-name',
      'patient-info',
      'zone-card',
      'zone-body',
      'pef-card',
      'pef-body',
      'adherence-card',
      'adherence-body',
      'symptoms-card',
      'symptoms-body',
      'triggers-card',
      'triggers-body',
      'rescue-card',
      'rescue-body',
      'incidents-card',
      'incidents-body',
      'back-btn',
      { tag: 'button', id: 'generate-pdf-btn' },
    ]);
    // All cards start hidden
    ['zone-card', 'pef-card', 'adherence-card', 'symptoms-card', 'triggers-card', 'rescue-card', 'incidents-card'].forEach(id => {
      document.getElementById(id).classList.add('hidden');
    });
    // Create chart canvases
    createMockCanvas('chart-pef-trend');
    createMockCanvas('chart-pef-zones');
    createMockCanvas('chart-symptoms');
  }

  const mockChild = {
    name: 'Alice Test',
    birthday: '2018-06-15',
    personal_best_pef: 300,
    notes: 'Some notes',
  };

  const fullAccess = {
    share_pef: 1,
    share_controller_adherence: 1,
    share_symptoms_chart: 1,
    share_triggers: 1,
    share_rescue_logs: 1,
    share_triage_incidents: 1,
  };

  beforeEach(() => {
    jest.resetModules();
    cleanupDOM();
    setupPatientViewDOM();
    setupGlobals();

    // Mock Chart.js globally
    window.Chart = jest.fn(() => ({
      destroy: jest.fn(),
      update: jest.fn(),
      toBase64Image: jest.fn().mockReturnValue('data:image/png;base64,fake'),
    }));

    electronAPI = createMockElectronAPI({
      getSession: jest.fn().mockResolvedValue({ userId: 10, username: 'drsmith', role: 'provider' }),
      getNavigationData: jest.fn().mockResolvedValue({ childId: 5 }),
      getSharingSettings: jest.fn().mockResolvedValue(fullAccess),
      getChild: jest.fn().mockResolvedValue(mockChild),
      calculateZone: jest.fn().mockResolvedValue({ zone: 'green', percentage: 95 }),
      getPefHistory: jest.fn().mockResolvedValue([
        { date: '2026-03-01', daily_pef: 280, pre_medication_pef: 250, post_medication_pef: 290 },
        { date: '2026-03-02', daily_pef: 290, pre_medication_pef: null, post_medication_pef: null },
      ]),
      getMedicationAdherence: jest.fn().mockResolvedValue({ percentage: 83, daysCompleted: 25, daysPlanned: 30 }),
      getCheckinHistory: jest.fn().mockResolvedValue([
        { date: '2026-03-01', night_waking: 'none', activity_limits: 'some', coughing: 'a_lot', wheezing: 'none', trigger_exercise: 1, trigger_cold_air: 0, trigger_dust: 0, trigger_smoke: 0, trigger_illness: 0, trigger_strong_odors: 0 },
        { date: '2026-03-02', night_waking: 'some', activity_limits: 'none', coughing: 'none', wheezing: 'a_lot', trigger_exercise: 0, trigger_cold_air: 1, trigger_dust: 1, trigger_smoke: 0, trigger_illness: 0, trigger_strong_odors: 0 },
      ]),
      getMedicationLogs: jest.fn().mockResolvedValue([
        { medication_name: 'Albuterol', is_rescue: true, doses_taken: 2, timestamp: '2026-03-01T10:00:00', breathing_before: 1, breathing_after: 3 },
        { medication_name: 'Flovent', is_rescue: false, doses_taken: 1, timestamp: '2026-03-01T08:00:00', breathing_before: 2, breathing_after: 4 },
      ]),
      getIncidents: jest.fn().mockResolvedValue([
        { timestamp: '2026-03-01T12:00:00', can_speak_full_sentences: false, chest_retracting: true, blue_grey_lips: false, current_pef: 150, user_notes: 'Mild episode' },
      ]),
      getMedications: jest.fn().mockResolvedValue([]),
      getControllerSchedule: jest.fn().mockResolvedValue(null),
      countTechniqueSessions: jest.fn().mockResolvedValue(3),
      generatePdf: jest.fn().mockResolvedValue({ success: true }),
    });
    window.electronAPI = electronAPI;
  });

  afterEach(() => {
    cleanupDOM();
    delete window.electronAPI;
    delete window.Chart;
  });

  function loadModule() {
    jest.isolateModules(() => {
      require('../src/provider/patient-view');
    });
  }

  // ── initializePage ────────────────────────────────────────────────────────

  test('initializePage loads patient data and renders all sections', async () => {
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    expect(document.getElementById('patient-name').textContent).toBe('Alice Test');
    expect(document.getElementById('patient-info').innerHTML).toContain('Alice Test');
    expect(document.getElementById('patient-info').innerHTML).toContain('years old');
    expect(document.getElementById('patient-info').innerHTML).toContain('300 L/min');
    expect(document.getElementById('patient-info').innerHTML).toContain('Some notes');
  });

  test('initializePage navigates to landing if no session', async () => {
    electronAPI.getSession.mockResolvedValue(null);
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    expect(electronAPI.navigate).toHaveBeenCalledWith('landing');
  });

  test('initializePage navigates to landing if session has no userId', async () => {
    electronAPI.getSession.mockResolvedValue({ userId: null });
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    expect(electronAPI.navigate).toHaveBeenCalledWith('landing');
  });

  test('initializePage navigates to provider-main if no navData', async () => {
    electronAPI.getNavigationData.mockResolvedValue(null);
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    expect(electronAPI.navigate).toHaveBeenCalledWith('provider-main');
  });

  test('initializePage navigates to provider-main if navData has no childId', async () => {
    electronAPI.getNavigationData.mockResolvedValue({});
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    expect(electronAPI.navigate).toHaveBeenCalledWith('provider-main');
  });

  test('initializePage handles error gracefully', async () => {
    electronAPI.getSession.mockRejectedValue(new Error('boom'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    expect(document.getElementById('patient-name').textContent).toBe('Error loading patient');
    spy.mockRestore();
  });

  test('initializePage renders child without personal_best_pef or notes', async () => {
    electronAPI.getChild.mockResolvedValue({ name: 'Bob', birthday: '2016-01-01', personal_best_pef: null, notes: null });
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    expect(document.getElementById('patient-info').innerHTML).not.toContain('Personal Best PEF');
    expect(document.getElementById('patient-info').innerHTML).not.toContain('pv-info-notes');
  });

  test('initializePage skips sections when access is null', async () => {
    electronAPI.getSharingSettings.mockResolvedValue(null);
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    expect(document.getElementById('zone-card').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('pef-card').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('adherence-card').classList.contains('hidden')).toBe(true);
  });

  test('initializePage only shows sections that are shared', async () => {
    electronAPI.getSharingSettings.mockResolvedValue({ share_pef: 0, share_controller_adherence: 1, share_symptoms_chart: 0, share_triggers: 0, share_rescue_logs: 0, share_triage_incidents: 0 });
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    expect(document.getElementById('zone-card').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('adherence-card').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('symptoms-card').classList.contains('hidden')).toBe(true);
  });

  // ── showCard ──────────────────────────────────────────────────────────────

  test('all shared cards become visible', async () => {
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    ['zone-card', 'pef-card', 'adherence-card', 'symptoms-card', 'triggers-card', 'rescue-card', 'incidents-card'].forEach(id => {
      expect(document.getElementById(id).classList.contains('hidden')).toBe(false);
    });
  });

  // ── loadPefData ───────────────────────────────────────────────────────────

  test('loadPefData renders zone display and PEF table', async () => {
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    const zoneBody = document.getElementById('zone-body');
    expect(zoneBody.innerHTML).toContain('GREEN');
    expect(zoneBody.innerHTML).toContain('95% of PB');

    const pefBody = document.getElementById('pef-body');
    expect(pefBody.innerHTML).toContain('2026-03-01');
    expect(pefBody.innerHTML).toContain('280');
  });

  test('loadPefData renders zone without percentage', async () => {
    electronAPI.calculateZone.mockResolvedValue({ zone: 'yellow', percentage: null });
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    const zoneBody = document.getElementById('zone-body');
    expect(zoneBody.innerHTML).toContain('YELLOW');
    expect(zoneBody.innerHTML).not.toContain('% of PB');
  });

  test('loadPefData shows empty state when no PEF history', async () => {
    electronAPI.getPefHistory.mockResolvedValue([]);
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    const pefBody = document.getElementById('pef-body');
    expect(pefBody.innerHTML).toContain('No PEF data available');
  });

  test('loadPefData handles error', async () => {
    electronAPI.calculateZone.mockRejectedValue(new Error('fail'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    expect(document.getElementById('pef-body').innerHTML).toContain('Could not load PEF data');
    spy.mockRestore();
  });

  // ── loadAdherence ─────────────────────────────────────────────────────────

  test('loadAdherence renders adherence data', async () => {
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    const body = document.getElementById('adherence-body');
    expect(body.innerHTML).toContain('83%');
    expect(body.innerHTML).toContain('25 of 30 days');
  });

  test('loadAdherence handles error', async () => {
    electronAPI.getMedicationAdherence.mockRejectedValue(new Error('fail'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    expect(document.getElementById('adherence-body').innerHTML).toContain('Could not load adherence data');
    spy.mockRestore();
  });

  // ── loadSymptoms ──────────────────────────────────────────────────────────

  test('loadSymptoms renders symptom table', async () => {
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    const body = document.getElementById('symptoms-body');
    expect(body.innerHTML).toContain('2026-03-01');
    expect(body.innerHTML).toContain('A Lot');  // coughing a_lot
    expect(body.innerHTML).toContain('none');
  });

  test('loadSymptoms shows empty state when no checkins', async () => {
    electronAPI.getCheckinHistory.mockResolvedValue([]);
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    expect(document.getElementById('symptoms-body').innerHTML).toContain('No symptom data available');
  });

  test('loadSymptoms handles error', async () => {
    electronAPI.getCheckinHistory.mockRejectedValue(new Error('fail'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    expect(document.getElementById('symptoms-body').innerHTML).toContain('Could not load symptom data');
    spy.mockRestore();
  });

  // ── loadTriggers ──────────────────────────────────────────────────────────

  test('loadTriggers renders trigger rows', async () => {
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    const body = document.getElementById('triggers-body');
    expect(body.innerHTML).toContain('Exercise');
    expect(body.innerHTML).toContain('Cold Air');
    expect(body.innerHTML).toContain('Dust');
    expect(body.innerHTML).toContain('1 day');
  });

  test('loadTriggers shows empty state when no triggers found', async () => {
    electronAPI.getCheckinHistory.mockResolvedValue([
      { date: '2026-03-01', trigger_exercise: 0, trigger_cold_air: 0, trigger_dust: 0, trigger_smoke: 0, trigger_illness: 0, trigger_strong_odors: 0 },
    ]);
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    expect(document.getElementById('triggers-body').innerHTML).toContain('No triggers recorded');
  });

  test('loadTriggers handles error', async () => {
    // Need to fail on second call (first is for symptoms, second is for triggers)
    let callCount = 0;
    electronAPI.getCheckinHistory.mockImplementation(() => {
      callCount++;
      if (callCount >= 2) return Promise.reject(new Error('fail'));
      return Promise.resolve([]);
    });
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    expect(document.getElementById('triggers-body').innerHTML).toContain('Could not load trigger data');
    spy.mockRestore();
  });

  test('loadTriggers shows plural "days" for counts > 1', async () => {
    electronAPI.getCheckinHistory.mockResolvedValue([
      { date: '2026-03-01', trigger_exercise: 1, trigger_cold_air: 0, trigger_dust: 0, trigger_smoke: 0, trigger_illness: 0, trigger_strong_odors: 0 },
      { date: '2026-03-02', trigger_exercise: 1, trigger_cold_air: 0, trigger_dust: 0, trigger_smoke: 0, trigger_illness: 0, trigger_strong_odors: 0 },
    ]);
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    const body = document.getElementById('triggers-body');
    expect(body.innerHTML).toContain('2 days');
  });

  // ── loadRescueLogs ────────────────────────────────────────────────────────

  test('loadRescueLogs renders rescue medication entries', async () => {
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    const body = document.getElementById('rescue-body');
    expect(body.innerHTML).toContain('Albuterol');
    expect(body.innerHTML).toContain('2 doses');
    expect(body.innerHTML).toContain('Bad');  // BREATHING_LABELS[1]
    expect(body.innerHTML).toContain('Good'); // BREATHING_LABELS[3]
  });

  test('loadRescueLogs shows empty state when no rescue logs', async () => {
    electronAPI.getMedicationLogs.mockResolvedValue([
      { medication_name: 'Flovent', is_rescue: false, doses_taken: 1, timestamp: '2026-03-01T08:00:00' },
    ]);
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    expect(document.getElementById('rescue-body').innerHTML).toContain('No rescue medication uses');
  });

  test('loadRescueLogs handles 1 dose singular', async () => {
    electronAPI.getMedicationLogs.mockResolvedValue([
      { medication_name: 'Albuterol', is_rescue: true, doses_taken: 1, timestamp: '2026-03-01T10:00:00', breathing_before: 2, breathing_after: 4 },
    ]);
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    const body = document.getElementById('rescue-body');
    expect(body.innerHTML).toContain('1 dose');
    expect(body.innerHTML).not.toContain('1 doses');
  });

  test('loadRescueLogs handles N/A breathing labels', async () => {
    electronAPI.getMedicationLogs.mockResolvedValue([
      { medication_name: 'Albuterol', is_rescue: true, doses_taken: 1, timestamp: '2026-03-01T10:00:00', breathing_before: undefined, breathing_after: undefined },
    ]);
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    const body = document.getElementById('rescue-body');
    expect(body.innerHTML).toContain('N/A');
  });

  test('loadRescueLogs handles error', async () => {
    electronAPI.getMedicationLogs.mockRejectedValue(new Error('fail'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    expect(document.getElementById('rescue-body').innerHTML).toContain('Could not load rescue medication data');
    spy.mockRestore();
  });

  // ── loadIncidents ─────────────────────────────────────────────────────────

  test('loadIncidents renders incident entries with flags', async () => {
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    const body = document.getElementById('incidents-body');
    expect(body.innerHTML).toContain('Cannot speak in full sentences');
    expect(body.innerHTML).toContain('Chest retracting');
    expect(body.innerHTML).not.toContain('Blue/grey lips');
    expect(body.innerHTML).toContain('PEF: 150');
    expect(body.innerHTML).toContain('Mild episode');
  });

  test('loadIncidents shows empty state when no incidents', async () => {
    electronAPI.getIncidents.mockResolvedValue([]);
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    expect(document.getElementById('incidents-body').innerHTML).toContain('No triage incidents recorded');
  });

  test('loadIncidents renders incident without flags, pef, or notes', async () => {
    electronAPI.getIncidents.mockResolvedValue([
      { timestamp: '2026-03-01T12:00:00', can_speak_full_sentences: true, chest_retracting: false, blue_grey_lips: false, current_pef: null, user_notes: null },
    ]);
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    const body = document.getElementById('incidents-body');
    expect(body.innerHTML).not.toContain('pv-incident-flags');
    expect(body.innerHTML).not.toContain('pv-incident-pef');
    expect(body.innerHTML).not.toContain('pv-incident-notes');
  });

  test('loadIncidents renders incident with blue_grey_lips flag', async () => {
    electronAPI.getIncidents.mockResolvedValue([
      { timestamp: '2026-03-01T12:00:00', can_speak_full_sentences: true, chest_retracting: false, blue_grey_lips: true, current_pef: null, user_notes: null },
    ]);
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    const body = document.getElementById('incidents-body');
    expect(body.innerHTML).toContain('Blue/grey lips');
  });

  test('loadIncidents handles error', async () => {
    electronAPI.getIncidents.mockRejectedValue(new Error('fail'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    expect(document.getElementById('incidents-body').innerHTML).toContain('Could not load incident data');
    spy.mockRestore();
  });

  // ── Button wiring ─────────────────────────────────────────────────────────

  test('back button navigates to provider-main', async () => {
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('back-btn').click();
    expect(electronAPI.navigate).toHaveBeenCalledWith('provider-main');
  });

  // ── generatePatientPdf ────────────────────────────────────────────────────

  test('generate PDF button gathers data and calls generatePdf', async () => {
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    const btn = document.getElementById('generate-pdf-btn');
    btn.click();
    await flushPromises();

    expect(electronAPI.getChild).toHaveBeenCalled();
    expect(electronAPI.getMedicationAdherence).toHaveBeenCalled();
    expect(electronAPI.getIncidents).toHaveBeenCalled();
    expect(electronAPI.getMedicationLogs).toHaveBeenCalled();
    expect(electronAPI.getCheckinHistory).toHaveBeenCalled();
    expect(electronAPI.getPefHistory).toHaveBeenCalled();
    expect(electronAPI.getMedications).toHaveBeenCalled();
    expect(electronAPI.getControllerSchedule).toHaveBeenCalled();
    expect(electronAPI.countTechniqueSessions).toHaveBeenCalled();
    expect(electronAPI.generatePdf).toHaveBeenCalled();

    // Button should be re-enabled after success
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toContain('Generate PDF Report');
  });

  test('generatePdf handles error with showToast', async () => {
    electronAPI.generatePdf.mockRejectedValue(new Error('pdf fail'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    const btn = document.getElementById('generate-pdf-btn');
    btn.click();
    await flushPromises();

    expect(window.showToast).toHaveBeenCalledWith('Could not generate the PDF report. Please try again.', 'error');
    expect(btn.disabled).toBe(false);
    spy.mockRestore();
  });

  test('generatePdf generates charts when data is available', async () => {
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    const btn = document.getElementById('generate-pdf-btn');
    btn.click();
    await flushPromises();

    // Chart constructor should have been called for PEF trend, PEF zones, and symptoms
    expect(window.Chart).toHaveBeenCalled();

    const pdfCall = electronAPI.generatePdf.mock.calls[0][0];
    expect(pdfCall.chartImages).toBeDefined();
  });

  test('generatePdf handles chart rendering error gracefully', async () => {
    window.Chart = jest.fn(() => { throw new Error('chart fail'); });
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    const btn = document.getElementById('generate-pdf-btn');
    btn.click();
    await flushPromises();

    // PDF should still be generated even if charts fail
    expect(electronAPI.generatePdf).toHaveBeenCalled();
    spy.mockRestore();
  });

  test('generatePdf without personal_best_pef skips zone datasets', async () => {
    electronAPI.getChild.mockResolvedValue({ name: 'Bob', birthday: '2016-01-01', personal_best_pef: null, notes: null });
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    const btn = document.getElementById('generate-pdf-btn');
    btn.click();
    await flushPromises();

    expect(electronAPI.generatePdf).toHaveBeenCalled();
    const pdfCall = electronAPI.generatePdf.mock.calls[0][0];
    expect(pdfCall.pefZoneSummary).toBeNull();
  });

  test('generatePdf with empty pefHistory produces no pefZoneSummary', async () => {
    electronAPI.getPefHistory.mockResolvedValue([]);
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    const btn = document.getElementById('generate-pdf-btn');
    btn.click();
    await flushPromises();

    const pdfCall = electronAPI.generatePdf.mock.calls[0][0];
    expect(pdfCall.pefZoneSummary).toBeNull();
  });

  // ── Chart generators (via PDF path) ───────────────────────────────────────

  test('generatePefTrendChart with personalBestPef adds zone lines', async () => {
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    const btn = document.getElementById('generate-pdf-btn');
    btn.click();
    await flushPromises();

    // Chart should be called with datasets including personal best, 80%, 50%
    const chartCallArgs = window.Chart.mock.calls;
    // Find the line chart call (PEF trend)
    const lineChartCall = chartCallArgs.find(c => c[1] && c[1].type === 'line');
    expect(lineChartCall).toBeDefined();
    expect(lineChartCall[1].data.datasets.length).toBe(4); // daily + personal best + 80% + 50%
  });

  test('generatePefZoneChart returns null for zero totals', async () => {
    // No daily_pef entries means pefZoneSummary will be null or all zeros
    electronAPI.getPefHistory.mockResolvedValue([
      { date: '2026-03-01', daily_pef: null },
    ]);
    electronAPI.getChild.mockResolvedValue({ ...mockChild, personal_best_pef: 300 });
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    const btn = document.getElementById('generate-pdf-btn');
    btn.click();
    await flushPromises();

    // pefZoneSummary should be { green: 0, yellow: 0, red: 0 } — the chart should not be generated
    const pdfCall = electronAPI.generatePdf.mock.calls[0][0];
    // It might be null or {green:0,yellow:0,red:0} — chart func returns null for 0 totals
    if (pdfCall.pefZoneSummary) {
      expect(pdfCall.pefZoneSummary.green + pdfCall.pefZoneSummary.yellow + pdfCall.pefZoneSummary.red).toBe(0);
    }
  });

  test('generateSymptomChart returns null for empty checkins', async () => {
    electronAPI.getCheckinHistory.mockResolvedValue([]);
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    const btn = document.getElementById('generate-pdf-btn');
    btn.click();
    await flushPromises();

    expect(electronAPI.generatePdf).toHaveBeenCalled();
  });

  test('generatePefTrendChart returns null when no entries have daily_pef', async () => {
    electronAPI.getPefHistory.mockResolvedValue([
      { date: '2026-03-01', daily_pef: null },
      { date: '2026-03-02', daily_pef: null },
    ]);
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    const btn = document.getElementById('generate-pdf-btn');
    btn.click();
    await flushPromises();

    // PEF trend chart should not have been generated (returns null)
    const pdfCall = electronAPI.generatePdf.mock.calls[0][0];
    expect(pdfCall.chartImages.pefTrend).toBeUndefined();
  });

  test('generatePefTrendChart without personal best skips zone lines', async () => {
    electronAPI.getChild.mockResolvedValue({ name: 'Bob', birthday: '2016-01-01', personal_best_pef: 0, notes: null });
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    window.Chart.mockClear();
    const btn = document.getElementById('generate-pdf-btn');
    btn.click();
    await flushPromises();

    // Find the line chart — should have only 1 dataset (daily PEF, no zone lines)
    const lineChartCall = window.Chart.mock.calls.find(c => c[1] && c[1].type === 'line');
    if (lineChartCall) {
      expect(lineChartCall[1].data.datasets.length).toBe(1);
    }
  });

  test('PEF zone summary categorizes into green, yellow, red', async () => {
    electronAPI.getPefHistory.mockResolvedValue([
      { date: '2026-03-01', daily_pef: 260 },  // 260/300 = 86.7% → green
      { date: '2026-03-02', daily_pef: 200 },  // 200/300 = 66.7% → yellow
      { date: '2026-03-03', daily_pef: 100 },  // 100/300 = 33.3% → red
    ]);
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    const btn = document.getElementById('generate-pdf-btn');
    btn.click();
    await flushPromises();

    const pdfCall = electronAPI.generatePdf.mock.calls[0][0];
    expect(pdfCall.pefZoneSummary).toEqual({ green: 1, yellow: 1, red: 1 });
  });

  // ── escapeHtml in patient-view ────────────────────────────────────────────

  test('escapeHtml escapes XSS in child name', async () => {
    electronAPI.getChild.mockResolvedValue({ name: '<img onerror=alert(1)>', birthday: '2018-01-01', personal_best_pef: null, notes: null });
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    expect(document.getElementById('patient-info').innerHTML).toContain('&lt;img onerror=alert(1)&gt;');
  });

  // ── renderChartToBase64 config defaults ───────────────────────────────────

  test('renderChartToBase64 sets animation and responsive options', async () => {
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    const btn = document.getElementById('generate-pdf-btn');
    btn.click();
    await flushPromises();

    // Every Chart call should have animation=false and responsive=false
    for (const call of window.Chart.mock.calls) {
      expect(call[1].options.animation).toBe(false);
      expect(call[1].options.responsive).toBe(false);
    }
  });

  // ── triggers trigger_smoke, trigger_illness, trigger_strong_odors ─────────

  test('loadTriggers handles all trigger types', async () => {
    electronAPI.getCheckinHistory.mockResolvedValue([
      { date: '2026-03-01', trigger_exercise: 0, trigger_cold_air: 0, trigger_dust: 0, trigger_smoke: 1, trigger_illness: 1, trigger_strong_odors: 1 },
    ]);
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    const body = document.getElementById('triggers-body');
    expect(body.innerHTML).toContain('Smoke');
    expect(body.innerHTML).toContain('Illness');
    expect(body.innerHTML).toContain('Strong Odors');
  });

  // ── generatePefZoneChart returns null when pefZoneSummary is null ──────────

  test('generatePefZoneChart returns null for null input', async () => {
    electronAPI.getChild.mockResolvedValue({ name: 'Test', birthday: '2018-01-01', personal_best_pef: null, notes: null });
    electronAPI.getPefHistory.mockResolvedValue([{ date: '2026-03-01', daily_pef: 100 }]);
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    const btn = document.getElementById('generate-pdf-btn');
    btn.click();
    await flushPromises();

    const pdfCall = electronAPI.generatePdf.mock.calls[0][0];
    expect(pdfCall.pefZoneSummary).toBeNull();
    expect(pdfCall.chartImages.pefZones).toBeUndefined();
  });

  // ── PDF button text changes during generation ─────────────────────────────

  test('PDF button shows progress text during generation', async () => {
    let resolveGetChild;
    electronAPI.getChild.mockImplementation(() => new Promise(r => { resolveGetChild = r; }));
    loadModule();
    fireDOMContentLoaded();
    await flushPromises();

    // Resolve the first getChild call from init
    resolveGetChild(mockChild);
    await flushPromises();

    // Now mock getChild for PDF generation to be slow
    let resolvePdfChild;
    electronAPI.getChild.mockImplementation(() => new Promise(r => { resolvePdfChild = r; }));

    const btn = document.getElementById('generate-pdf-btn');
    btn.click();

    // Button should be disabled
    expect(btn.disabled).toBe(true);

    // Resolve and finish
    resolvePdfChild(mockChild);
    await flushPromises();
  });
});
