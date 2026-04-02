/**
 * @jest-environment jsdom
 */
const {
  createMockElectronAPI,
  setupDOM,
  fireDOMContentLoaded,
  flushPromises,
  setupGlobals,
  cleanupDOM
} = require('./__helpers__/renderer-setup');

/* ================================================================
 *  1. child/main.js — Child Dashboard
 * ================================================================ */
describe('ChildMain (child/main.js)', () => {
  beforeEach(() => {
    cleanupDOM();
    setupGlobals();
    window.electronAPI = createMockElectronAPI({
      getSession: jest.fn().mockResolvedValue({ userId: 1, childId: 5, username: 'Alice Smith', role: 'child' })
    });
    setupDOM([
      'child-name',
      'nav-inhaler',
      'nav-medication',
      'nav-badges',
      'nav-zone',
      'nav-home',
      'nav-emergency',
      'nav-settings'
    ]);
  });

  afterEach(() => { jest.resetModules(); });

  test('initializes page and sets child first name', async () => {
    require('../src/child/main');
    fireDOMContentLoaded();
    await flushPromises();
    expect(document.getElementById('child-name').textContent).toBe('Alice');
  });

  test('redirects to landing when session has no childId', async () => {
    window.electronAPI.getSession.mockResolvedValue({ userId: 1, childId: null, username: 'parent', role: 'parent' });
    require('../src/child/main');
    fireDOMContentLoaded();
    await flushPromises();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('landing');
  });

  test('redirects to landing when session is null', async () => {
    window.electronAPI.getSession.mockResolvedValue(null);
    require('../src/child/main');
    fireDOMContentLoaded();
    await flushPromises();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('landing');
  });

  test('handles error during initialization', async () => {
    window.electronAPI.getSession.mockRejectedValue(new Error('fail'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    require('../src/child/main');
    fireDOMContentLoaded();
    await flushPromises();
    expect(document.getElementById('child-name').textContent).toBe('Error loading page');
    spy.mockRestore();
  });

  test('grid buttons navigate correctly', async () => {
    require('../src/child/main');
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('nav-inhaler').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('child-inhaler');

    document.getElementById('nav-medication').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('child-take-medication');

    document.getElementById('nav-badges').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('child-badges');

    document.getElementById('nav-zone').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('child-check-zone');
  });

  test('bottom nav buttons navigate correctly', async () => {
    require('../src/child/main');
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('nav-home').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('child-main');

    document.getElementById('nav-emergency').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('emergency');

    document.getElementById('nav-settings').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('settings');
  });
});

/* ================================================================
 *  2. child/badges.js — Badge Display
 * ================================================================ */
describe('ChildBadges (child/badges.js)', () => {
  beforeEach(() => {
    cleanupDOM();
    setupGlobals();
    window.electronAPI = createMockElectronAPI({
      getSession: jest.fn().mockResolvedValue({ userId: 1, childId: 5, username: 'Alice', role: 'child' })
    });
    setupDOM(['badges-grid', 'back-btn']);
  });

  afterEach(() => { jest.resetModules(); });

  test('redirects to landing when session has no childId', async () => {
    window.electronAPI.getSession.mockResolvedValue({ userId: 1, childId: null });
    require('../src/child/badges');
    fireDOMContentLoaded();
    await flushPromises();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('landing');
  });

  test('redirects to landing when session is null', async () => {
    window.electronAPI.getSession.mockResolvedValue(null);
    require('../src/child/badges');
    fireDOMContentLoaded();
    await flushPromises();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('landing');
  });

  test('shows empty state when no badges', async () => {
    window.electronAPI.getBadges.mockResolvedValue([]);
    require('../src/child/badges');
    fireDOMContentLoaded();
    await flushPromises();
    expect(document.getElementById('badges-grid').innerHTML).toContain('No badges yet');
    expect(document.getElementById('badges-grid').innerHTML).toContain('Ask your parent to create badges');
  });

  test('renders achieved badges with summary (single badge)', async () => {
    window.electronAPI.getBadges.mockResolvedValue([
      { badge_name: 'First Steps', badge_description: 'Complete first session', is_achieved: true, achieved_at: '2026-01-15T10:00:00Z' }
    ]);
    require('../src/child/badges');
    fireDOMContentLoaded();
    await flushPromises();
    const grid = document.getElementById('badges-grid');
    // "1 badge earned!" (singular)
    expect(grid.innerHTML).toContain('1 badge earned!');
    expect(grid.innerHTML).toContain('First Steps');
    expect(grid.innerHTML).toContain('Complete first session');
    expect(grid.innerHTML).toContain('Earned');
  });

  test('renders multiple achieved badges with plural summary', async () => {
    window.electronAPI.getBadges.mockResolvedValue([
      { badge_name: 'Badge A', badge_description: 'Desc A', is_achieved: true, achieved_at: '2026-01-15T10:00:00Z' },
      { badge_name: 'Badge B', badge_description: 'Desc B', is_achieved: true, achieved_at: '2026-01-16T10:00:00Z' }
    ]);
    require('../src/child/badges');
    fireDOMContentLoaded();
    await flushPromises();
    const grid = document.getElementById('badges-grid');
    expect(grid.innerHTML).toContain('2 badges earned!');
  });

  test('renders unachieved badges with progress bar', async () => {
    window.electronAPI.getBadges.mockResolvedValue([
      {
        badge_name: 'Pro User', badge_description: 'Complete 10 sessions', is_achieved: false,
        progress: { hint: 'Keep going!', current: 3, target: 10 }
      }
    ]);
    require('../src/child/badges');
    fireDOMContentLoaded();
    await flushPromises();
    const grid = document.getElementById('badges-grid');
    expect(grid.innerHTML).toContain('Pro User');
    expect(grid.innerHTML).toContain('Keep going!');
    expect(grid.innerHTML).toContain('3 / 10');
    expect(grid.innerHTML).toContain('Not yet earned');
    // Should NOT contain summary since no achieved badges
    expect(grid.innerHTML).not.toContain('badges earned');
  });

  test('renders unachieved badge with progress hint but no current/target', async () => {
    window.electronAPI.getBadges.mockResolvedValue([
      {
        badge_name: 'Mystery', badge_description: 'Secret badge', is_achieved: false,
        progress: { hint: 'Keep trying', current: null, target: null }
      }
    ]);
    require('../src/child/badges');
    fireDOMContentLoaded();
    await flushPromises();
    const grid = document.getElementById('badges-grid');
    expect(grid.innerHTML).toContain('Keep trying');
    // No progress bar since current is null
    expect(grid.innerHTML).not.toContain('badge-progress-bar');
  });

  test('renders unachieved badge without progress object', async () => {
    window.electronAPI.getBadges.mockResolvedValue([
      { badge_name: 'Hidden', badge_description: 'Unknown', is_achieved: false, progress: null }
    ]);
    require('../src/child/badges');
    fireDOMContentLoaded();
    await flushPromises();
    const grid = document.getElementById('badges-grid');
    expect(grid.innerHTML).toContain('Hidden');
    expect(grid.innerHTML).toContain('Not yet earned');
  });

  test('handles error loading badges', async () => {
    window.electronAPI.getBadges.mockRejectedValue(new Error('db error'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    require('../src/child/badges');
    fireDOMContentLoaded();
    await flushPromises();
    expect(document.getElementById('badges-grid').innerHTML).toContain('Could not load badges');
    spy.mockRestore();
  });

  test('back button navigates to child-main', async () => {
    require('../src/child/badges');
    fireDOMContentLoaded();
    await flushPromises();
    document.getElementById('back-btn').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('child-main');
  });

  test('escapeHtml handles null and undefined', async () => {
    window.electronAPI.getBadges.mockResolvedValue([
      { badge_name: null, badge_description: undefined, is_achieved: true, achieved_at: '2026-01-15T10:00:00Z' }
    ]);
    require('../src/child/badges');
    fireDOMContentLoaded();
    await flushPromises();
    // Should not throw; escapeHtml returns '' for null/undefined
    const grid = document.getElementById('badges-grid');
    expect(grid.innerHTML).toContain('badge-item');
  });

  test('escapeHtml escapes special characters', async () => {
    window.electronAPI.getBadges.mockResolvedValue([
      { badge_name: '<script>alert("xss")</script>', badge_description: 'Test & "quotes" \'apos\'', is_achieved: true, achieved_at: '2026-01-15T10:00:00Z' }
    ]);
    require('../src/child/badges');
    fireDOMContentLoaded();
    await flushPromises();
    const grid = document.getElementById('badges-grid');
    expect(grid.innerHTML).toContain('&lt;script&gt;');
    expect(grid.innerHTML).toContain('&amp;');
    // Quotes and apostrophes are safe in text content; jsdom may not preserve entity encoding in innerHTML
    expect(grid.textContent).toContain('"quotes"');
    expect(grid.textContent).toContain("'apos'");
  });
});

/* ================================================================
 *  3. child/check-zone.js — PEF Zone Checker
 * ================================================================ */
describe('ChildCheckZone (child/check-zone.js)', () => {
  beforeEach(() => {
    cleanupDOM();
    setupGlobals();
    window.electronAPI = createMockElectronAPI({
      getSession: jest.fn().mockResolvedValue({ userId: 1, childId: 5, username: 'Alice', role: 'child' })
    });
    setupDOM([
      'back-btn',
      { tag: 'input', id: 'pef-input', type: 'number' },
      { tag: 'button', id: 'check-zone-btn' },
      'pef-form',
      'zone-result',
      'zone-circle',
      'zone-label',
      'zone-pct',
      'zone-message',
      'zone-instructions',
      { tag: 'button', id: 'emergency-btn' },
      { tag: 'button', id: 'check-again-btn' }
    ]);
  });

  afterEach(() => { jest.resetModules(); });

  test('initializes page and sets childId', async () => {
    require('../src/child/check-zone');
    fireDOMContentLoaded();
    await flushPromises();
    expect(window.electronAPI.getSession).toHaveBeenCalled();
  });

  test('redirects to landing when no childId', async () => {
    window.electronAPI.getSession.mockResolvedValue({ userId: 1, childId: null });
    require('../src/child/check-zone');
    fireDOMContentLoaded();
    await flushPromises();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('landing');
  });

  test('redirects to landing when session is null', async () => {
    window.electronAPI.getSession.mockResolvedValue(null);
    require('../src/child/check-zone');
    fireDOMContentLoaded();
    await flushPromises();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('landing');
  });

  test('handles init error', async () => {
    window.electronAPI.getSession.mockRejectedValue(new Error('fail'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    require('../src/child/check-zone');
    fireDOMContentLoaded();
    await flushPromises();
    expect(window.showToast).toHaveBeenCalledWith(expect.stringContaining('Could not load'), 'error');
    spy.mockRestore();
  });

  test('shows error toast for invalid PEF (NaN)', async () => {
    require('../src/child/check-zone');
    fireDOMContentLoaded();
    await flushPromises();
    document.getElementById('pef-input').value = '';
    document.getElementById('check-zone-btn').click();
    await flushPromises();
    expect(window.showToast).toHaveBeenCalledWith(expect.stringContaining('peak flow number'), 'error');
  });

  test('shows error toast for PEF = 0', async () => {
    require('../src/child/check-zone');
    fireDOMContentLoaded();
    await flushPromises();
    document.getElementById('pef-input').value = '0';
    document.getElementById('check-zone-btn').click();
    await flushPromises();
    expect(window.showToast).toHaveBeenCalledWith(expect.stringContaining('peak flow number'), 'error');
  });

  test('shows error toast for PEF > 900', async () => {
    require('../src/child/check-zone');
    fireDOMContentLoaded();
    await flushPromises();
    document.getElementById('pef-input').value = '901';
    document.getElementById('check-zone-btn').click();
    await flushPromises();
    expect(window.showToast).toHaveBeenCalledWith(expect.stringContaining('peak flow number'), 'error');
  });

  test('shows error toast for negative PEF', async () => {
    require('../src/child/check-zone');
    fireDOMContentLoaded();
    await flushPromises();
    document.getElementById('pef-input').value = '-5';
    document.getElementById('check-zone-btn').click();
    await flushPromises();
    expect(window.showToast).toHaveBeenCalledWith(expect.stringContaining('peak flow number'), 'error');
  });

  test('successful green zone check', async () => {
    window.electronAPI.calculateZone.mockResolvedValue({ zone: 'green', percentage: 95 });
    require('../src/child/check-zone');
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('pef-input').value = '400';
    document.getElementById('check-zone-btn').click();
    await flushPromises();

    expect(window.electronAPI.submitPef).toHaveBeenCalledWith(expect.objectContaining({
      childId: 5,
      dailyPef: 400,
      isChildSubmission: true
    }));
    expect(document.getElementById('pef-form').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('zone-result').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('zone-label').textContent).toBe('Green Zone');
    expect(document.getElementById('zone-pct').textContent).toBe('95% of personal best');
    expect(document.getElementById('zone-message').textContent).toContain('great today');
    expect(document.getElementById('emergency-btn').style.display).toBe('none');
  });

  test('successful yellow zone check', async () => {
    window.electronAPI.calculateZone.mockResolvedValue({ zone: 'yellow', percentage: 65 });
    require('../src/child/check-zone');
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('pef-input').value = '250';
    document.getElementById('check-zone-btn').click();
    await flushPromises();

    expect(document.getElementById('zone-label').textContent).toBe('Yellow Zone');
    expect(document.getElementById('emergency-btn').style.display).toBe('block');
    expect(document.getElementById('zone-instructions').textContent).toContain('Yellow Zone');
  });

  test('successful red zone check', async () => {
    window.electronAPI.calculateZone.mockResolvedValue({ zone: 'red', percentage: 30 });
    require('../src/child/check-zone');
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('pef-input').value = '100';
    document.getElementById('check-zone-btn').click();
    await flushPromises();

    expect(document.getElementById('zone-label').textContent).toBe('Red Zone');
    expect(document.getElementById('emergency-btn').style.display).toBe('block');
    expect(document.getElementById('zone-instructions').textContent).toContain('RED Zone');
  });

  test('grey zone (no personal best)', async () => {
    window.electronAPI.calculateZone.mockResolvedValue({ zone: 'grey', percentage: null });
    require('../src/child/check-zone');
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('pef-input').value = '300';
    document.getElementById('check-zone-btn').click();
    await flushPromises();

    expect(document.getElementById('zone-label').textContent).toBe('Grey Zone');
    expect(document.getElementById('zone-pct').textContent).toBe('');
    expect(document.getElementById('emergency-btn').style.display).toBe('none');
  });

  test('unknown zone falls back to grey config', async () => {
    window.electronAPI.calculateZone.mockResolvedValue({ zone: 'purple', percentage: 50 });
    require('../src/child/check-zone');
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('pef-input').value = '300';
    document.getElementById('check-zone-btn').click();
    await flushPromises();

    // Falls back to grey config
    expect(document.getElementById('zone-message').textContent).toContain('Cannot calculate');
  });

  test('handles checkZone error', async () => {
    window.electronAPI.submitPef.mockRejectedValue(new Error('network error'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    require('../src/child/check-zone');
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('pef-input').value = '300';
    document.getElementById('check-zone-btn').click();
    await flushPromises();

    expect(window.showToast).toHaveBeenCalledWith(expect.stringContaining('Something went wrong'), 'error');
    // Button should be re-enabled
    expect(document.getElementById('check-zone-btn').disabled).toBe(false);
    expect(document.getElementById('check-zone-btn').textContent).toBe('Check My Zone');
    spy.mockRestore();
  });

  test('debounce prevents double submission', async () => {
    // Make submitPef hang to simulate busy state
    let resolveSubmit;
    window.electronAPI.submitPef.mockReturnValue(new Promise(r => { resolveSubmit = r; }));
    window.electronAPI.calculateZone.mockResolvedValue({ zone: 'green', percentage: 95 });

    require('../src/child/check-zone');
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('pef-input').value = '400';
    document.getElementById('check-zone-btn').click();
    // Second click while busy
    document.getElementById('check-zone-btn').click();
    await flushPromises();

    // Only one call
    expect(window.electronAPI.submitPef).toHaveBeenCalledTimes(1);

    resolveSubmit({ success: true });
    await flushPromises();
  });

  test('checkAgain resets the form', async () => {
    window.electronAPI.calculateZone.mockResolvedValue({ zone: 'green', percentage: 95 });
    require('../src/child/check-zone');
    fireDOMContentLoaded();
    await flushPromises();

    document.getElementById('pef-input').value = '400';
    document.getElementById('check-zone-btn').click();
    await flushPromises();

    // Now click check again
    document.getElementById('check-again-btn').click();
    expect(document.getElementById('zone-result').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('pef-form').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('pef-input').value).toBe('');
  });

  test('back button navigates to child-main', async () => {
    require('../src/child/check-zone');
    fireDOMContentLoaded();
    await flushPromises();
    document.getElementById('back-btn').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('child-main');
  });

  test('emergency button navigates to emergency', async () => {
    require('../src/child/check-zone');
    fireDOMContentLoaded();
    await flushPromises();
    document.getElementById('emergency-btn').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('emergency');
  });
});

/* ================================================================
 *  4. child/inhaler-technique.js — Inhaler Technique Tutorial
 * ================================================================ */
describe('InhalerTechnique (child/inhaler-technique.js)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    cleanupDOM();
    setupGlobals();
    window.electronAPI = createMockElectronAPI({
      getSession: jest.fn().mockResolvedValue({ userId: 1, childId: 5, username: 'Alice', role: 'child' })
    });

    // Mock requestAnimationFrame
    window.requestAnimationFrame = jest.fn(cb => setTimeout(cb, 0));

    setupDOM([
      'back-btn',
      'type-selector',
      'step-display',
      'step-counter',
      'step-icon',
      'step-instruction',
      'step-progress',
      'step-timer',
      { tag: 'button', id: 'prev-step-btn' },
      { tag: 'button', id: 'next-step-btn' },
      'completion-screen',
      { tag: 'button', id: 'completion-home-btn' },
      { tag: 'button', id: 'start-regular-btn' },
      { tag: 'button', id: 'start-mask-spacer-btn' },
      { tag: 'button', id: 'video-regular-btn' },
      { tag: 'button', id: 'video-mask-spacer-btn' },
      // Video modal elements
      'video-modal',
      'video-modal-title',
      { tag: 'video', id: 'technique-video' },
      { tag: 'source', id: 'video-source-mp4' },
      'video-placeholder',
      { tag: 'button', id: 'video-to-steps-btn' },
      { tag: 'button', id: 'video-modal-close' },
      'video-modal-backdrop',
      // Custom video controls
      { tag: 'button', id: 'vc-play-btn' },
      { tag: 'button', id: 'vc-mute-btn' },
      { tag: 'input', id: 'vc-volume', type: 'range', value: '1' },
      'vc-progress-bar',
      'vc-progress-fill',
      'vc-time-current',
      'vc-time-duration'
    ]);

    // Mock video element methods
    const video = document.getElementById('technique-video');
    video.play = jest.fn().mockResolvedValue();
    video.pause = jest.fn();
    video.load = jest.fn();
    Object.defineProperty(video, 'paused', { value: true, writable: true, configurable: true });
    Object.defineProperty(video, 'currentTime', { value: 0, writable: true, configurable: true });
    Object.defineProperty(video, 'duration', { value: 60, writable: true, configurable: true });
    Object.defineProperty(video, 'muted', { value: false, writable: true, configurable: true });
    Object.defineProperty(video, 'volume', { value: 1, writable: true, configurable: true });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.resetModules();
  });

  test('initializes page and checks session', async () => {
    require('../src/child/inhaler-technique');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();
    expect(window.electronAPI.getSession).toHaveBeenCalled();
  });

  test('redirects to landing when no childId', async () => {
    window.electronAPI.getSession.mockResolvedValue({ userId: 1, childId: null });
    require('../src/child/inhaler-technique');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('landing');
  });

  test('redirects to landing when session is null', async () => {
    window.electronAPI.getSession.mockResolvedValue(null);
    require('../src/child/inhaler-technique');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('landing');
  });

  test('handles init error', async () => {
    window.electronAPI.getSession.mockRejectedValue(new Error('fail'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    require('../src/child/inhaler-technique');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  test('back button navigates to child-main', async () => {
    require('../src/child/inhaler-technique');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();
    document.getElementById('back-btn').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('child-main');
  });

  test('start regular technique shows step display', async () => {
    require('../src/child/inhaler-technique');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    document.getElementById('start-regular-btn').click();
    expect(document.getElementById('type-selector').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('step-display').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('step-counter').textContent).toBe('Step 1 of 10');
    // First step: wash hands
    expect(document.getElementById('step-instruction').textContent).toContain('Wash your hands');
    // prev button invisible on first step
    expect(document.getElementById('prev-step-btn').classList.contains('invisible')).toBe(true);
  });

  test('start mask_spacer technique shows step display', async () => {
    require('../src/child/inhaler-technique');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    document.getElementById('start-mask-spacer-btn').click();
    expect(document.getElementById('step-counter').textContent).toBe('Step 1 of 10');
    expect(document.getElementById('step-instruction').textContent).toContain('Wash your hands');
  });

  test('navigate through regular steps with next/prev', async () => {
    require('../src/child/inhaler-technique');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    document.getElementById('start-regular-btn').click();

    // Step 1 -> Step 2 (has countdown timer)
    document.getElementById('next-step-btn').click();
    await jest.advanceTimersByTimeAsync(0);
    expect(document.getElementById('step-counter').textContent).toBe('Step 2 of 10');
    expect(document.getElementById('step-instruction').textContent).toContain('shake it well');

    // Prev goes back
    document.getElementById('prev-step-btn').click();
    expect(document.getElementById('step-counter').textContent).toBe('Step 1 of 10');

    // Prev on step 0 does nothing
    document.getElementById('prev-step-btn').click();
    expect(document.getElementById('step-counter').textContent).toBe('Step 1 of 10');
  });

  test('countdown timer on step 2 (shake 5s)', async () => {
    require('../src/child/inhaler-technique');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    document.getElementById('start-regular-btn').click();
    // Go to step 2 (index 1) - has countdown timer
    document.getElementById('next-step-btn').click();
    await jest.advanceTimersByTimeAsync(0);

    // Timer widget should be visible
    const timerDiv = document.getElementById('step-timer');
    expect(timerDiv.classList.contains('hidden')).toBe(false);
    // Next button should be locked
    expect(document.getElementById('next-step-btn').disabled).toBe(true);

    // Start the countdown
    const startBtn = document.getElementById('inh-timer-start-btn');
    expect(startBtn).not.toBeNull();
    startBtn.click();
    expect(startBtn.disabled).toBe(true);
    expect(startBtn.textContent).toBe('Running…');

    // Display should show running class
    const display = document.getElementById('inh-timer-display');
    expect(display.classList.contains('inh-timer-running')).toBe(true);

    // Advance 2 seconds
    jest.advanceTimersByTime(2000);
    expect(document.getElementById('inh-timer-display').textContent).toBe('3s');

    // Advance to <= 3 seconds threshold (already there at 3s)
    expect(document.getElementById('inh-timer-display').classList.contains('inh-timer-urgent')).toBe(true);

    // Advance remaining 3 seconds to finish
    jest.advanceTimersByTime(3000);
    expect(document.getElementById('inh-timer-display').textContent).toBe('✓ Done!');
    // Next button unlocked
    expect(document.getElementById('next-step-btn').disabled).toBe(false);
  });

  test('countdown timer skip button', async () => {
    require('../src/child/inhaler-technique');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    document.getElementById('start-regular-btn').click();
    document.getElementById('next-step-btn').click();
    await jest.advanceTimersByTimeAsync(0);

    // Skip the timer
    const skipBtn = document.getElementById('inh-timer-skip-btn');
    skipBtn.click();

    // Next should be unlocked
    expect(document.getElementById('next-step-btn').disabled).toBe(false);
    // Skip should be hidden
    expect(skipBtn.style.display).toBe('none');
  });

  test('countdown timer for hold breath step (10s)', async () => {
    require('../src/child/inhaler-technique');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    document.getElementById('start-regular-btn').click();
    // Navigate to step 6 (index 5) - hold breath 10s
    for (let i = 0; i < 5; i++) {
      // Unlock next if timer step
      const nextBtn = document.getElementById('next-step-btn');
      if (nextBtn.disabled) {
        const skip = document.getElementById('inh-timer-skip-btn');
        if (skip) skip.click();
      }
      nextBtn.click();
      await jest.advanceTimersByTimeAsync(0);
    }

    expect(document.getElementById('step-counter').textContent).toBe('Step 6 of 10');
    expect(document.getElementById('inh-timer-display').textContent).toBe('10s');

    // Start and run full countdown
    document.getElementById('inh-timer-start-btn').click();
    jest.advanceTimersByTime(7000); // 7 seconds, at 3s left
    expect(document.getElementById('inh-timer-display').textContent).toBe('3s');
    expect(document.getElementById('inh-timer-display').classList.contains('inh-timer-urgent')).toBe(true);

    jest.advanceTimersByTime(3000); // finish
    expect(document.getElementById('inh-timer-display').textContent).toBe('✓ Done!');
  });

  test('last step shows Finish button and completes', async () => {
    require('../src/child/inhaler-technique');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    document.getElementById('start-regular-btn').click();

    // Navigate to last step (index 9)
    for (let i = 0; i < 9; i++) {
      const nextBtn = document.getElementById('next-step-btn');
      if (nextBtn.disabled) {
        const skip = document.getElementById('inh-timer-skip-btn');
        if (skip) skip.click();
      }
      nextBtn.click();
      await jest.advanceTimersByTimeAsync(0);
    }

    expect(document.getElementById('step-counter').textContent).toBe('Step 10 of 10');
    expect(document.getElementById('next-step-btn').textContent).toBe('✓ Finish!');
    expect(document.getElementById('next-step-btn').classList.contains('inh-btn-finish')).toBe(true);

    // Click finish
    document.getElementById('next-step-btn').click();
    // timers run below
    await jest.runAllTimersAsync();

    expect(window.electronAPI.recordTechniqueSession).toHaveBeenCalledWith({ sessionType: 'regular' });
    expect(document.getElementById('step-display').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('completion-screen').classList.contains('hidden')).toBe(false);
  });

  test('handles recordTechniqueSession error on finish', async () => {
    window.electronAPI.recordTechniqueSession.mockRejectedValue(new Error('db error'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    require('../src/child/inhaler-technique');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    document.getElementById('start-regular-btn').click();
    for (let i = 0; i < 9; i++) {
      const nextBtn = document.getElementById('next-step-btn');
      if (nextBtn.disabled) {
        const skip = document.getElementById('inh-timer-skip-btn');
        if (skip) skip.click();
      }
      nextBtn.click();
      await jest.advanceTimersByTimeAsync(0);
    }

    document.getElementById('next-step-btn').click();
    // timers run below
    await jest.runAllTimersAsync();

    // Should still show completion even if recording failed
    expect(document.getElementById('completion-screen').classList.contains('hidden')).toBe(false);
    spy.mockRestore();
  });

  test('nextStep debounce prevents double execution', async () => {
    require('../src/child/inhaler-technique');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    document.getElementById('start-regular-btn').click();

    // Make recordTechniqueSession hang
    let resolveRecord;
    window.electronAPI.recordTechniqueSession.mockReturnValue(new Promise(r => { resolveRecord = r; }));

    // Navigate to last step
    for (let i = 0; i < 9; i++) {
      const nextBtn = document.getElementById('next-step-btn');
      if (nextBtn.disabled) {
        const skip = document.getElementById('inh-timer-skip-btn');
        if (skip) skip.click();
      }
      nextBtn.click();
      await jest.advanceTimersByTimeAsync(0);
    }

    // Click finish twice rapidly
    document.getElementById('next-step-btn').click();
    document.getElementById('next-step-btn').click();
    // timers run below
    await jest.runAllTimersAsync();

    expect(window.electronAPI.recordTechniqueSession).toHaveBeenCalledTimes(1);
    resolveRecord({ success: true });
    await jest.advanceTimersByTimeAsync(0);
  });

  test('completion home button navigates to child-main', async () => {
    require('../src/child/inhaler-technique');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();
    document.getElementById('completion-home-btn').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('child-main');
  });

  test('mask_spacer technique with breath counter', async () => {
    require('../src/child/inhaler-technique');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    document.getElementById('start-mask-spacer-btn').click();

    // Navigate to step 7 (index 6) - breath counter (6 breaths)
    for (let i = 0; i < 6; i++) {
      const nextBtn = document.getElementById('next-step-btn');
      if (nextBtn.disabled) {
        const skip = document.getElementById('inh-timer-skip-btn') || document.getElementById('inh-breath-skip-btn');
        if (skip) skip.click();
      }
      nextBtn.click();
      await jest.advanceTimersByTimeAsync(0);
    }

    expect(document.getElementById('step-counter').textContent).toBe('Step 7 of 10');
    // Breath counter should be shown
    const tapBtn = document.getElementById('inh-breath-tap');
    expect(tapBtn).not.toBeNull();
    expect(document.getElementById('inh-breath-count').textContent).toBe('0');
    expect(document.getElementById('next-step-btn').disabled).toBe(true);

    // Tap 5 times
    for (let i = 0; i < 5; i++) {
      tapBtn.click();
    }
    expect(document.getElementById('inh-breath-count').textContent).toBe('5');
    expect(document.getElementById('next-step-btn').disabled).toBe(true);

    // Tap 6th time — should finish
    tapBtn.click();
    expect(document.getElementById('inh-breath-count').textContent).toBe('6');
    expect(document.getElementById('next-step-btn').disabled).toBe(false);
    expect(tapBtn.disabled).toBe(true);
    expect(tapBtn.classList.contains('inh-counter-done')).toBe(true);

    // Additional taps after done do nothing
    tapBtn.click();
    expect(document.getElementById('inh-breath-count').textContent).toBe('6');
  });

  test('breath counter skip button', async () => {
    require('../src/child/inhaler-technique');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    document.getElementById('start-mask-spacer-btn').click();
    for (let i = 0; i < 6; i++) {
      const nextBtn = document.getElementById('next-step-btn');
      if (nextBtn.disabled) {
        const skip = document.getElementById('inh-timer-skip-btn') || document.getElementById('inh-breath-skip-btn');
        if (skip) skip.click();
      }
      nextBtn.click();
      await jest.advanceTimersByTimeAsync(0);
    }

    // Skip the breath counter
    const skipBtn = document.getElementById('inh-breath-skip-btn');
    skipBtn.click();
    expect(document.getElementById('next-step-btn').disabled).toBe(false);
    expect(skipBtn.style.display).toBe('none');
  });

  /* ── Video modal tests ───────────────────────────────────── */

  test('openVideoModal for regular type', async () => {
    require('../src/child/inhaler-technique');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    document.getElementById('video-regular-btn').click();
    jest.runAllTimers();

    const modal = document.getElementById('video-modal');
    expect(modal.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('video-modal-title').textContent).toBe('Regular MDI Inhaler Technique');
    // Video source should be set
    expect(document.getElementById('video-source-mp4').getAttribute('src')).toContain('inhaler_regular.mp4');
    // Video should be visible, placeholder hidden
    expect(document.getElementById('technique-video').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('video-placeholder').classList.contains('hidden')).toBe(true);
  });

  test('openVideoModal for mask_spacer type', async () => {
    require('../src/child/inhaler-technique');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    document.getElementById('video-mask-spacer-btn').click();
    jest.runAllTimers();

    expect(document.getElementById('video-modal-title').textContent).toBe('Mask & Spacer Technique');
    expect(document.getElementById('video-source-mp4').getAttribute('src')).toContain('inhaler_mask_spacer.mp4');
  });

  test('video onerror shows placeholder', async () => {
    require('../src/child/inhaler-technique');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    document.getElementById('video-regular-btn').click();
    jest.runAllTimers();

    const video = document.getElementById('technique-video');
    // Trigger onerror
    video.onerror();

    expect(video.classList.contains('hidden')).toBe(true);
    expect(document.getElementById('video-placeholder').classList.contains('hidden')).toBe(false);
  });

  test('video-to-steps-btn closes modal and starts technique', async () => {
    require('../src/child/inhaler-technique');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    document.getElementById('video-regular-btn').click();
    jest.runAllTimers();

    // Click the "Practice the Steps" button
    document.getElementById('video-to-steps-btn').click();
    jest.advanceTimersByTime(300);

    // Type selector should be hidden (technique started), step display shown
    expect(document.getElementById('type-selector').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('step-display').classList.contains('hidden')).toBe(false);
  });

  test('closeVideoModal stops playback and resets controls', async () => {
    require('../src/child/inhaler-technique');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    // Open then close
    document.getElementById('video-regular-btn').click();
    jest.runAllTimers();

    document.getElementById('video-modal-close').click();
    jest.advanceTimersByTime(300);

    const modal = document.getElementById('video-modal');
    expect(modal.classList.contains('hidden')).toBe(true);
    expect(document.getElementById('technique-video').pause).toHaveBeenCalled();
    expect(document.getElementById('vc-progress-fill').style.width).toBe('0%');
    expect(document.getElementById('vc-time-current').textContent).toBe('0:00');
  });

  test('closeVideoModal via backdrop click', async () => {
    require('../src/child/inhaler-technique');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    document.getElementById('video-regular-btn').click();
    jest.runAllTimers();

    document.getElementById('video-modal-backdrop').click();
    jest.advanceTimersByTime(300);

    expect(document.getElementById('video-modal').classList.contains('hidden')).toBe(true);
  });

  test('Escape key closes video modal', async () => {
    require('../src/child/inhaler-technique');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    document.getElementById('video-regular-btn').click();
    jest.runAllTimers();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    jest.advanceTimersByTime(300);

    expect(document.getElementById('video-modal').classList.contains('hidden')).toBe(true);
  });

  test('Escape key does nothing when modal is already hidden', async () => {
    require('../src/child/inhaler-technique');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    // Modal starts hidden
    document.getElementById('video-modal').classList.add('hidden');
    const video = document.getElementById('technique-video');
    video.pause.mockClear();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    jest.advanceTimersByTime(300);

    // pause should not have been called since modal was already hidden
    expect(video.pause).not.toHaveBeenCalled();
  });

  /* ── Custom video controls tests ───────────────────────── */

  test('play/pause button toggles video playback', async () => {
    require('../src/child/inhaler-technique');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    const video = document.getElementById('technique-video');
    const playBtn = document.getElementById('vc-play-btn');

    // Click play when paused
    Object.defineProperty(video, 'paused', { value: true, writable: true, configurable: true });
    playBtn.click();
    expect(video.play).toHaveBeenCalled();

    // Click pause when playing
    Object.defineProperty(video, 'paused', { value: false, writable: true, configurable: true });
    playBtn.click();
    expect(video.pause).toHaveBeenCalled();
  });

  test('clicking video toggles play/pause', async () => {
    require('../src/child/inhaler-technique');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    const video = document.getElementById('technique-video');

    Object.defineProperty(video, 'paused', { value: true, writable: true, configurable: true });
    video.click();
    expect(video.play).toHaveBeenCalled();

    Object.defineProperty(video, 'paused', { value: false, writable: true, configurable: true });
    video.click();
    expect(video.pause).toHaveBeenCalled();
  });

  test('video play/pause/ended events update play button', async () => {
    require('../src/child/inhaler-technique');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    const video = document.getElementById('technique-video');
    const playBtn = document.getElementById('vc-play-btn');

    video.dispatchEvent(new Event('play'));
    expect(playBtn.textContent).toBe('⏸');
    expect(playBtn.getAttribute('aria-label')).toBe('Pause video');

    video.dispatchEvent(new Event('pause'));
    expect(playBtn.textContent).toBe('▶');
    expect(playBtn.getAttribute('aria-label')).toBe('Play video');

    video.dispatchEvent(new Event('ended'));
    expect(playBtn.textContent).toBe('▶');
  });

  test('timeupdate updates progress bar and current time', async () => {
    require('../src/child/inhaler-technique');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    const video = document.getElementById('technique-video');
    Object.defineProperty(video, 'currentTime', { value: 30, writable: true, configurable: true });
    Object.defineProperty(video, 'duration', { value: 60, writable: true, configurable: true });

    video.dispatchEvent(new Event('timeupdate'));

    expect(document.getElementById('vc-time-current').textContent).toBe('0:30');
    expect(document.getElementById('vc-progress-fill').style.width).toBe('50%');
  });

  test('timeupdate with no duration does not update fill', async () => {
    require('../src/child/inhaler-technique');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    const video = document.getElementById('technique-video');
    Object.defineProperty(video, 'currentTime', { value: 10, writable: true, configurable: true });
    Object.defineProperty(video, 'duration', { value: 0, writable: true, configurable: true });

    video.dispatchEvent(new Event('timeupdate'));
    // Should not crash, fill stays as-is
    expect(document.getElementById('vc-time-current').textContent).toBe('0:10');
  });

  test('loadedmetadata sets duration display', async () => {
    require('../src/child/inhaler-technique');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    const video = document.getElementById('technique-video');
    Object.defineProperty(video, 'duration', { value: 125, writable: true, configurable: true });

    video.dispatchEvent(new Event('loadedmetadata'));

    expect(document.getElementById('vc-time-duration').textContent).toBe('2:05');
  });

  test('progress bar click seeks video', async () => {
    require('../src/child/inhaler-technique');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    const video = document.getElementById('technique-video');
    const progressBar = document.getElementById('vc-progress-bar');
    Object.defineProperty(video, 'duration', { value: 100, writable: true, configurable: true });

    // Mock getBoundingClientRect
    progressBar.getBoundingClientRect = jest.fn(() => ({ left: 0, width: 200 }));
    progressBar.dispatchEvent(new MouseEvent('click', { clientX: 100, bubbles: true }));

    expect(video.currentTime).toBe(50);
  });

  test('progress bar click with no duration does not seek', async () => {
    require('../src/child/inhaler-technique');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    const video = document.getElementById('technique-video');
    const progressBar = document.getElementById('vc-progress-bar');
    Object.defineProperty(video, 'duration', { value: 0, writable: true, configurable: true });
    Object.defineProperty(video, 'currentTime', { value: 0, writable: true, configurable: true });

    progressBar.getBoundingClientRect = jest.fn(() => ({ left: 0, width: 200 }));
    progressBar.dispatchEvent(new MouseEvent('click', { clientX: 100, bubbles: true }));

    expect(video.currentTime).toBe(0);
  });

  test('mute button toggles mute', async () => {
    require('../src/child/inhaler-technique');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    const video = document.getElementById('technique-video');
    const muteBtn = document.getElementById('vc-mute-btn');
    const volumeEl = document.getElementById('vc-volume');

    // Initially not muted
    Object.defineProperty(video, 'muted', { value: false, writable: true, configurable: true });
    Object.defineProperty(video, 'volume', { value: 1, writable: true, configurable: true });

    muteBtn.click();
    expect(video.muted).toBe(true);
    expect(muteBtn.textContent).toBe('🔇');
    expect(volumeEl.value).toBe('0');

    // Click again to unmute
    muteBtn.click();
    expect(video.muted).toBe(false);
    expect(muteBtn.textContent).toBe('🔊');
  });

  test('volume slider adjusts volume and mute state', async () => {
    require('../src/child/inhaler-technique');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    const video = document.getElementById('technique-video');
    const volumeEl = document.getElementById('vc-volume');
    const muteBtn = document.getElementById('vc-mute-btn');
    Object.defineProperty(video, 'volume', { value: 1, writable: true, configurable: true });
    Object.defineProperty(video, 'muted', { value: false, writable: true, configurable: true });

    // Set volume to 0
    volumeEl.value = '0';
    volumeEl.dispatchEvent(new Event('input'));
    expect(video.volume).toBe(0);
    expect(video.muted).toBe(true);
    expect(muteBtn.textContent).toBe('🔇');

    // Set volume to 0.5
    volumeEl.value = '0.5';
    volumeEl.dispatchEvent(new Event('input'));
    expect(video.volume).toBe(0.5);
    expect(video.muted).toBe(false);
    expect(muteBtn.textContent).toBe('🔊');
  });

  test('formatVideoTime handles NaN and Infinity', async () => {
    require('../src/child/inhaler-technique');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    const video = document.getElementById('technique-video');

    // Test with NaN
    Object.defineProperty(video, 'currentTime', { value: NaN, writable: true, configurable: true });
    video.dispatchEvent(new Event('timeupdate'));
    expect(document.getElementById('vc-time-current').textContent).toBe('0:00');

    // Test with Infinity
    Object.defineProperty(video, 'currentTime', { value: Infinity, writable: true, configurable: true });
    video.dispatchEvent(new Event('timeupdate'));
    expect(document.getElementById('vc-time-current').textContent).toBe('0:00');
  });

  test('formatVideoTime formats seconds with leading zero for s < 10', async () => {
    require('../src/child/inhaler-technique');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    const video = document.getElementById('technique-video');
    Object.defineProperty(video, 'currentTime', { value: 65, writable: true, configurable: true });
    Object.defineProperty(video, 'duration', { value: 120, writable: true, configurable: true });

    video.dispatchEvent(new Event('timeupdate'));
    expect(document.getElementById('vc-time-current').textContent).toBe('1:05');
  });

  test('formatVideoTime formats seconds >= 10 without leading zero', async () => {
    require('../src/child/inhaler-technique');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    const video = document.getElementById('technique-video');
    Object.defineProperty(video, 'currentTime', { value: 75, writable: true, configurable: true });
    Object.defineProperty(video, 'duration', { value: 120, writable: true, configurable: true });

    video.dispatchEvent(new Event('timeupdate'));
    expect(document.getElementById('vc-time-current').textContent).toBe('1:15');
  });

  // lockNextButton with missing button test removed — module requires next-step-btn on init

  test('finishTimer when display element is absent', async () => {
    require('../src/child/inhaler-technique');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    document.getElementById('start-regular-btn').click();
    // Go to step 2 (has countdown)
    document.getElementById('next-step-btn').click();
    await jest.advanceTimersByTimeAsync(0);

    // Remove display element before skip
    const display = document.getElementById('inh-timer-display');
    if (display) display.remove();

    // Skip should still work without crashing
    const skipBtn = document.getElementById('inh-timer-skip-btn');
    skipBtn.click();
    expect(document.getElementById('next-step-btn').disabled).toBe(false);
  });

  test('countdown tick when display element is removed mid-countdown', async () => {
    require('../src/child/inhaler-technique');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    document.getElementById('start-regular-btn').click();
    document.getElementById('next-step-btn').click();
    await jest.advanceTimersByTimeAsync(0);

    // Start countdown
    document.getElementById('inh-timer-start-btn').click();

    // Remove display element
    const display = document.getElementById('inh-timer-display');
    if (display) display.remove();

    // Tick should not crash
    jest.advanceTimersByTime(1000);
    // Finish the rest
    jest.advanceTimersByTime(10000);
  });

  test('clearTimer with no active interval', async () => {
    require('../src/child/inhaler-technique');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    // Start technique (clearTimer is called on each step change)
    document.getElementById('start-regular-btn').click();
    // This calls showStep(0) which calls clearTimer — no active interval
    expect(document.getElementById('step-counter').textContent).toBe('Step 1 of 10');
  });

  test('opening video modal twice replaces event listener on to-steps button', async () => {
    require('../src/child/inhaler-technique');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    // Open for regular
    document.getElementById('video-regular-btn').click();
    jest.runAllTimers();

    // Close
    document.getElementById('video-modal-close').click();
    jest.advanceTimersByTime(300);

    // Open for mask_spacer
    document.getElementById('video-mask-spacer-btn').click();
    jest.runAllTimers();

    // Click "Practice the Steps" — should start mask_spacer, not regular
    document.getElementById('video-to-steps-btn').click();
    jest.advanceTimersByTime(300);

    // mask_spacer steps
    expect(document.getElementById('step-instruction').textContent).toContain('Wash your hands');
  });

  test('step progress bar width updates correctly', async () => {
    require('../src/child/inhaler-technique');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    document.getElementById('start-regular-btn').click();
    // Step 1 of 10: 10%
    expect(document.getElementById('step-progress').style.width).toBe('10%');

    document.getElementById('next-step-btn').click();
    await jest.advanceTimersByTimeAsync(0);
    // Step 2 of 10: 20%
    expect(document.getElementById('step-progress').style.width).toBe('20%');
  });

  test('next button text resets from Finish to Next on non-last step', async () => {
    require('../src/child/inhaler-technique');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    document.getElementById('start-regular-btn').click();

    // Go to last step
    for (let i = 0; i < 9; i++) {
      const nextBtn = document.getElementById('next-step-btn');
      if (nextBtn.disabled) {
        const skip = document.getElementById('inh-timer-skip-btn');
        if (skip) skip.click();
      }
      nextBtn.click();
      await jest.advanceTimersByTimeAsync(0);
    }

    expect(document.getElementById('next-step-btn').textContent).toBe('✓ Finish!');

    // Go back to step 9
    document.getElementById('prev-step-btn').click();
    expect(document.getElementById('next-step-btn').textContent).toBe('Next →');
    expect(document.getElementById('next-step-btn').classList.contains('inh-btn-finish')).toBe(false);
  });

  test('updatePlayButton with no button does not throw', async () => {
    // Remove play button before init
    const btn = document.getElementById('vc-play-btn');
    btn.remove();

    // We need to re-setup the video controls elements except vc-play-btn
    // Actually the file references vc-play-btn directly in initVideoControls which would fail
    // So let's test that updatePlayButton is safe when called after removal
    // This is already implicitly tested via closeVideoModal which calls updatePlayButton
    // Let's just ensure the module loads and the close modal path works

    // Re-add it for loading to succeed
    const newBtn = document.createElement('button');
    newBtn.id = 'vc-play-btn';
    document.body.appendChild(newBtn);

    require('../src/child/inhaler-technique');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    // Now remove it and call close (which calls updatePlayButton)
    document.getElementById('vc-play-btn').remove();

    document.getElementById('video-regular-btn').click();
    jest.runAllTimers();
    document.getElementById('video-modal-close').click();
    jest.advanceTimersByTime(300);

    // Should not throw
    expect(document.getElementById('video-modal').classList.contains('hidden')).toBe(true);
  });
});

/* ================================================================
 *  5. child/take-medication.js — Medication Logging Flow
 * ================================================================ */
describe('TakeMedication (child/take-medication.js)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    cleanupDOM();
    setupGlobals();
    window.electronAPI = createMockElectronAPI({
      getSession: jest.fn().mockResolvedValue({ userId: 1, childId: 5, username: 'Alice', role: 'child' }),
      getMedications: jest.fn().mockResolvedValue([
        { medication_id: 10, medication_name: 'Ventolin', is_rescue: true, doses_remaining: 50 },
        { medication_id: 20, medication_name: 'Flovent', is_rescue: false, doses_remaining: 30 }
      ])
    });

    setupDOM([
      'back-btn',
      'step-medication',
      'med-list',
      'step-doses',
      'doses-display',
      { tag: 'button', id: 'doses-minus-btn' },
      { tag: 'button', id: 'doses-plus-btn' },
      { tag: 'button', id: 'go-to-breathing-btn' },
      { tag: 'button', id: 'back-to-medication-btn' },
      'step-before',
      'before-options',
      { tag: 'button', id: 'back-to-doses-btn' },
      'step-after',
      'after-options',
      { tag: 'button', id: 'back-to-before-btn' },
      'success-screen',
      'decline-warning',
      { tag: 'button', id: 'success-home-btn' }
    ]);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.resetModules();
  });

  test('initializes page, loads medications, and builds breathing options', async () => {
    require('../src/child/take-medication');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    // Medications should be rendered
    const medList = document.getElementById('med-list');
    expect(medList.innerHTML).toContain('Ventolin');
    expect(medList.innerHTML).toContain('Flovent');
    expect(medList.innerHTML).toContain('Rescue');
    expect(medList.innerHTML).toContain('Controller');
    expect(medList.innerHTML).toContain('50 doses remaining');

    // Breathing options should be built
    const beforeOptions = document.getElementById('before-options');
    expect(beforeOptions.children.length).toBe(5);
    const afterOptions = document.getElementById('after-options');
    expect(afterOptions.children.length).toBe(5);
  });

  test('redirects to landing when no childId', async () => {
    window.electronAPI.getSession.mockResolvedValue({ userId: 1, childId: null });
    require('../src/child/take-medication');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('landing');
  });

  test('redirects to landing when session is null', async () => {
    window.electronAPI.getSession.mockResolvedValue(null);
    require('../src/child/take-medication');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('landing');
  });

  test('handles init error', async () => {
    window.electronAPI.getSession.mockRejectedValue(new Error('fail'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    require('../src/child/take-medication');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();
    expect(window.showToast).toHaveBeenCalledWith(expect.stringContaining('Could not load'), 'error');
    spy.mockRestore();
  });

  test('shows empty state when no medications', async () => {
    window.electronAPI.getMedications.mockResolvedValue([]);
    require('../src/child/take-medication');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    const medList = document.getElementById('med-list');
    expect(medList.innerHTML).toContain('No medications added yet');
    expect(medList.innerHTML).toContain('Ask your parent');
  });

  test('handles error loading medications', async () => {
    window.electronAPI.getMedications.mockRejectedValue(new Error('db error'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    require('../src/child/take-medication');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    const medList = document.getElementById('med-list');
    expect(medList.innerHTML).toContain('Could not load medications');
    spy.mockRestore();
  });

  test('clicking a medication card shows doses step', async () => {
    require('../src/child/take-medication');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    // Click first medication (Ventolin)
    const medBtns = document.getElementById('med-list').querySelectorAll('button');
    medBtns[0].click();

    expect(document.getElementById('step-medication').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('step-doses').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('doses-display').textContent).toBe('1');
  });

  test('dose counter increment and decrement', async () => {
    require('../src/child/take-medication');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    // Select a medication first
    const medBtns = document.getElementById('med-list').querySelectorAll('button');
    medBtns[0].click();

    // Increment
    document.getElementById('doses-plus-btn').click();
    expect(document.getElementById('doses-display').textContent).toBe('2');

    document.getElementById('doses-plus-btn').click();
    expect(document.getElementById('doses-display').textContent).toBe('3');

    // Decrement
    document.getElementById('doses-minus-btn').click();
    expect(document.getElementById('doses-display').textContent).toBe('2');

    // Decrement to minimum (1)
    document.getElementById('doses-minus-btn').click();
    document.getElementById('doses-minus-btn').click();
    expect(document.getElementById('doses-display').textContent).toBe('1');
  });

  test('dose counter clamped at max 10', async () => {
    require('../src/child/take-medication');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    const medBtns = document.getElementById('med-list').querySelectorAll('button');
    medBtns[0].click();

    // Click plus 15 times
    for (let i = 0; i < 15; i++) {
      document.getElementById('doses-plus-btn').click();
    }
    expect(document.getElementById('doses-display').textContent).toBe('10');
  });

  test('goToBreathing transitions from doses to before step', async () => {
    require('../src/child/take-medication');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    document.getElementById('go-to-breathing-btn').click();
    expect(document.getElementById('step-doses').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('step-before').classList.contains('hidden')).toBe(false);
  });

  test('selecting breathing before moves to after step', async () => {
    require('../src/child/take-medication');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    // Click a "before" breathing option
    const beforeBtns = document.getElementById('before-options').querySelectorAll('button');
    beforeBtns[2].click(); // "Normal"

    // Check selected class
    expect(beforeBtns[2].classList.contains('selected')).toBe(true);
    // Other buttons should not be selected
    expect(beforeBtns[0].classList.contains('selected')).toBe(false);

    // After 300ms delay, should transition
    jest.advanceTimersByTime(300);
    expect(document.getElementById('step-before').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('step-after').classList.contains('hidden')).toBe(false);
  });

  test('selecting breathing option removes previous selection', async () => {
    require('../src/child/take-medication');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    const beforeBtns = document.getElementById('before-options').querySelectorAll('button');
    beforeBtns[0].click();
    expect(beforeBtns[0].classList.contains('selected')).toBe(true);

    beforeBtns[3].click();
    expect(beforeBtns[0].classList.contains('selected')).toBe(false);
    expect(beforeBtns[3].classList.contains('selected')).toBe(true);
  });

  test('full flow: select medication -> doses -> before -> after -> success', async () => {
    require('../src/child/take-medication');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    // Step 1: Select medication
    const medBtns = document.getElementById('med-list').querySelectorAll('button');
    medBtns[0].click();

    // Step 2: Set doses and proceed
    document.getElementById('doses-plus-btn').click();
    document.getElementById('go-to-breathing-btn').click();

    // Step 3: Select breathing before
    const beforeBtns = document.getElementById('before-options').querySelectorAll('button');
    beforeBtns[2].click(); // Normal (value 2)
    jest.advanceTimersByTime(300);

    // Step 4: Select breathing after
    const afterBtns = document.getElementById('after-options').querySelectorAll('button');
    afterBtns[3].click(); // Good (value 3)
    // timers run below
    await jest.runAllTimersAsync();

    expect(window.electronAPI.logMedication).toHaveBeenCalledWith({
      childId: 5,
      medicationId: 10,
      dosesTaken: 2,
      breathingBefore: 2,
      breathingAfter: 3
    });

    expect(document.getElementById('success-screen').classList.contains('hidden')).toBe(false);
  });

  test('shows decline warning when breathing declined', async () => {
    window.electronAPI.logMedication.mockResolvedValue({ success: true, breathingDeclined: true });
    require('../src/child/take-medication');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    // Quick flow through
    const medBtns = document.getElementById('med-list').querySelectorAll('button');
    medBtns[0].click();
    document.getElementById('go-to-breathing-btn').click();

    const beforeBtns = document.getElementById('before-options').querySelectorAll('button');
    beforeBtns[3].click();
    jest.advanceTimersByTime(300);

    const afterBtns = document.getElementById('after-options').querySelectorAll('button');
    afterBtns[1].click();
    // timers run below
    await jest.runAllTimersAsync();

    expect(document.getElementById('decline-warning').classList.contains('hidden')).toBe(false);
  });

  test('handles submitLog error', async () => {
    window.electronAPI.logMedication.mockRejectedValue(new Error('network error'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    require('../src/child/take-medication');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    // Select medication
    const medBtns = document.getElementById('med-list').querySelectorAll('button');
    medBtns[0].click();
    document.getElementById('go-to-breathing-btn').click();

    const beforeBtns = document.getElementById('before-options').querySelectorAll('button');
    beforeBtns[2].click();
    jest.advanceTimersByTime(300);

    const afterBtns = document.getElementById('after-options').querySelectorAll('button');
    afterBtns[4].click();
    // timers run below
    await jest.runAllTimersAsync();

    expect(window.showToast).toHaveBeenCalledWith(expect.stringContaining('Could not save'), 'error');
    // After step should be shown again for retry
    expect(document.getElementById('step-after').classList.contains('hidden')).toBe(false);
    spy.mockRestore();
  });

  test('submitLog without medication selected shows error toast', async () => {
    require('../src/child/take-medication');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    // Don't select a medication, go directly to after options
    // Build after breathing options and click one — submitLog will be called
    // but selectedMedicationId is null
    const afterBtns = document.getElementById('after-options').querySelectorAll('button');
    afterBtns[0].click();
    // timers run below
    await jest.runAllTimersAsync();

    expect(window.showToast).toHaveBeenCalledWith(expect.stringContaining('No medication selected'), 'error');
  });

  test('submitLog debounce prevents double submission', async () => {
    let resolveLog;
    window.electronAPI.logMedication.mockReturnValue(new Promise(r => { resolveLog = r; }));

    require('../src/child/take-medication');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    const medBtns = document.getElementById('med-list').querySelectorAll('button');
    medBtns[0].click();
    document.getElementById('go-to-breathing-btn').click();

    const beforeBtns = document.getElementById('before-options').querySelectorAll('button');
    beforeBtns[2].click();
    jest.advanceTimersByTime(300);

    // Click after twice rapidly
    const afterBtns = document.getElementById('after-options').querySelectorAll('button');
    afterBtns[3].click();
    afterBtns[4].click();
    // timers run below
    await jest.runAllTimersAsync();

    expect(window.electronAPI.logMedication).toHaveBeenCalledTimes(1);

    resolveLog({ success: true, breathingDeclined: false });
    await jest.advanceTimersByTimeAsync(0);
  });

  test('back button navigates to child-main', async () => {
    require('../src/child/take-medication');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();
    document.getElementById('back-btn').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('child-main');
  });

  test('back-to-medication-btn shows medication step, hides doses', async () => {
    require('../src/child/take-medication');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();
    document.getElementById('back-to-medication-btn').click();
    expect(document.getElementById('step-medication').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('step-doses').classList.contains('hidden')).toBe(true);
  });

  test('back-to-doses-btn shows doses step, hides before', async () => {
    require('../src/child/take-medication');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();
    document.getElementById('back-to-doses-btn').click();
    expect(document.getElementById('step-doses').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('step-before').classList.contains('hidden')).toBe(true);
  });

  test('back-to-before-btn shows before step, hides after', async () => {
    require('../src/child/take-medication');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();
    document.getElementById('back-to-before-btn').click();
    expect(document.getElementById('step-before').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('step-after').classList.contains('hidden')).toBe(true);
  });

  test('success-home-btn navigates to child-main', async () => {
    require('../src/child/take-medication');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();
    document.getElementById('success-home-btn').click();
    expect(window.electronAPI.navigate).toHaveBeenCalledWith('child-main');
  });

  test('escapeHtml in take-medication handles null/undefined and special chars', async () => {
    window.electronAPI.getMedications.mockResolvedValue([
      { medication_id: 1, medication_name: '<b>Test & "Drug"</b>', is_rescue: true, doses_remaining: 5 }
    ]);
    require('../src/child/take-medication');
    fireDOMContentLoaded();
    // timers run below
    await jest.runAllTimersAsync();

    const medList = document.getElementById('med-list');
    expect(medList.innerHTML).toContain('&lt;b&gt;');
    expect(medList.innerHTML).toContain('&amp;');
    expect(medList.innerHTML).toContain('&quot;');
  });
});
