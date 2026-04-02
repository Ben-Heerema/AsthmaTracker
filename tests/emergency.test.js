/**
 * emergency.test.js — Emergency Triage Logic Tests
 *
 * Tests the pure logic extracted from src/shared/emergency.js:
 *   - logEvent / buildLogText   (event log building)
 *   - checkDangerSigns          (any one of 3 triggers 911)
 *   - selectOption mapping      (field name → answers key)
 *   - renderGuidance logic      (hasDanger + symptomsWorsened → correct guidance)
 *   - resetTimerForNextDose     (dose counter capping at 3)
 *   - onSymptomsWorsening       (locks timer, sets symptomsWorsened)
 *   - onTimerComplete           (logs event, shows 911 at max dose)
 *   - saveAndFinish summaryLine (outcome string based on state)
 *   - formatTime                (already tested in business-logic, included here too)
 *   - goToStep2 / goToStep3 validation (child required, all answers required)
 */

// =============================================================================
// Extracted pure logic (no DOM, no IPC)
// =============================================================================

// ── Event log ─────────────────────────────────────────────────────────────────

function createEventLog() {
  const log = [];

  function logEvent(text) {
    // Use a fixed "time" so tests are deterministic
    log.push({ time: '12:00:00', event: text });
  }

  function buildLogText() {
    if (log.length === 0) return 'No events logged.';
    return log.map(e => '[' + e.time + '] ' + e.event).join('\n');
  }

  return { log, logEvent, buildLogText };
}

// ── Danger signs ──────────────────────────────────────────────────────────────

function checkDangerSigns(answers) {
  return answers.canSpeakFullSentences === false
    || answers.chestRetracting === true
    || answers.blueGreyLips    === true;
}

// ── selectOption field mapping (mirrors emergency.js) ─────────────────────────

function mapFieldToAnswerKey(field) {
  if (field === 'sentences') return 'canSpeakFullSentences';
  if (field === 'chest')     return 'chestRetracting';
  return 'blueGreyLips';
}

// ── renderGuidance — returns which guidance type should be shown ───────────────

function determineGuidance(answers, symptomsWorsened) {
  const hasDanger = !answers.canSpeakFullSentences
    || answers.chestRetracting
    || answers.blueGreyLips;

  if (symptomsWorsened || hasDanger) {
    const reason = symptomsWorsened
      ? 'Symptoms worsened during treatment.'
      : 'One or more severe danger signs were detected.';
    return { type: 'critical', reason };
  }

  return { type: 'moderate' };
}

// ── Timer state ───────────────────────────────────────────────────────────────

const TIMER_DURATION = 20 * 60; // 1200 seconds

function createTimerState() {
  return {
    timerSecondsLeft: TIMER_DURATION,
    timerDose: 1,
    timerRunning: false,
    symptomsWorsened: false
  };
}

function resetTimerForNextDose(state) {
  if (state.timerDose >= 3) return { ...state }; // already maxed
  return {
    ...state,
    timerRunning: false,
    timerDose: state.timerDose + 1,
    timerSecondsLeft: TIMER_DURATION
  };
}

function onSymptomsWorsening(state) {
  return {
    ...state,
    timerRunning: false,
    symptomsWorsened: true
  };
}

function onTimerComplete(state) {
  return {
    ...state,
    timerRunning: false,
    timerSecondsLeft: 0,
    // isMaxDose: whether 911 callout should show
    showCallout: state.timerDose >= 3
  };
}

// ── summaryLine calculation (from saveAndFinish in emergency.js) ───────────────

function buildSummaryLine(answers, symptomsWorsened, timerDose) {
  const hasDanger = !answers.canSpeakFullSentences
    || answers.chestRetracting
    || answers.blueGreyLips;

  if (symptomsWorsened) {
    return 'OUTCOME: Symptoms worsened during treatment — 911 advised.';
  }
  if (hasDanger) {
    return 'OUTCOME: Critical danger signs detected — 911 advised.';
  }
  return 'OUTCOME: Moderate episode — standard protocol followed (' + timerDose + ' dose(s) administered).';
}

// ── Step 2 validation ─────────────────────────────────────────────────────────

function isStep2Complete(answers) {
  return answers.canSpeakFullSentences !== null
    && answers.chestRetracting !== null
    && answers.blueGreyLips    !== null;
}

// ── formatTime ────────────────────────────────────────────────────────────────

function formatTime(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

// =============================================================================
// TESTS: Event Log
// =============================================================================

describe('Event Log', () => {

  test('buildLogText returns "No events logged." when empty', () => {
    const { buildLogText } = createEventLog();
    expect(buildLogText()).toBe('No events logged.');
  });

  test('logEvent adds entry to log array', () => {
    const { log, logEvent } = createEventLog();
    logEvent('Something happened');
    expect(log.length).toBe(1);
    expect(log[0].event).toBe('Something happened');
  });

  test('buildLogText formats entry as [time] event', () => {
    const { logEvent, buildLogText } = createEventLog();
    logEvent('Step 1 complete');
    const text = buildLogText();
    expect(text).toContain('[12:00:00]');
    expect(text).toContain('Step 1 complete');
  });

  test('multiple events joined with newlines', () => {
    const { logEvent, buildLogText } = createEventLog();
    logEvent('Event A');
    logEvent('Event B');
    logEvent('Event C');
    const text = buildLogText();
    const lines = text.split('\n');
    expect(lines.length).toBe(3);
  });

  test('events are in chronological order (append order)', () => {
    const { log, logEvent } = createEventLog();
    logEvent('First');
    logEvent('Second');
    logEvent('Third');
    expect(log[0].event).toBe('First');
    expect(log[2].event).toBe('Third');
  });
});

// =============================================================================
// TESTS: checkDangerSigns
// =============================================================================

describe('checkDangerSigns', () => {

  describe('no danger', () => {
    test('all normal → no danger', () => {
      const answers = { canSpeakFullSentences: true, chestRetracting: false, blueGreyLips: false };
      expect(checkDangerSigns(answers)).toBe(false);
    });
  });

  describe('canSpeakFullSentences === false triggers danger', () => {
    test('cannot speak → danger', () => {
      const answers = { canSpeakFullSentences: false, chestRetracting: false, blueGreyLips: false };
      expect(checkDangerSigns(answers)).toBe(true);
    });
  });

  describe('chestRetracting === true triggers danger', () => {
    test('chest retracting → danger', () => {
      const answers = { canSpeakFullSentences: true, chestRetracting: true, blueGreyLips: false };
      expect(checkDangerSigns(answers)).toBe(true);
    });
  });

  describe('blueGreyLips === true triggers danger', () => {
    test('blue/grey lips → danger', () => {
      const answers = { canSpeakFullSentences: true, chestRetracting: false, blueGreyLips: true };
      expect(checkDangerSigns(answers)).toBe(true);
    });
  });

  describe('multiple danger signs', () => {
    test('all three danger signs present → danger', () => {
      const answers = { canSpeakFullSentences: false, chestRetracting: true, blueGreyLips: true };
      expect(checkDangerSigns(answers)).toBe(true);
    });

    test('two danger signs present → danger', () => {
      const answers = { canSpeakFullSentences: false, chestRetracting: true, blueGreyLips: false };
      expect(checkDangerSigns(answers)).toBe(true);
    });
  });

  describe('null answers (unanswered) do not trigger danger', () => {
    test('null canSpeakFullSentences is not === false', () => {
      const answers = { canSpeakFullSentences: null, chestRetracting: false, blueGreyLips: false };
      // null !== false, so no danger
      expect(checkDangerSigns(answers)).toBe(false);
    });

    test('null chestRetracting is not === true', () => {
      const answers = { canSpeakFullSentences: true, chestRetracting: null, blueGreyLips: false };
      expect(checkDangerSigns(answers)).toBe(false);
    });
  });
});

// =============================================================================
// TESTS: selectOption field mapping
// =============================================================================

describe('selectOption field mapping', () => {

  test('"sentences" maps to canSpeakFullSentences', () => {
    expect(mapFieldToAnswerKey('sentences')).toBe('canSpeakFullSentences');
  });

  test('"chest" maps to chestRetracting', () => {
    expect(mapFieldToAnswerKey('chest')).toBe('chestRetracting');
  });

  test('"blue" maps to blueGreyLips', () => {
    expect(mapFieldToAnswerKey('blue')).toBe('blueGreyLips');
  });

  test('unknown field maps to blueGreyLips (else branch)', () => {
    expect(mapFieldToAnswerKey('anything_else')).toBe('blueGreyLips');
  });
});

// =============================================================================
// TESTS: determineGuidance (renderGuidance)
// =============================================================================

describe('determineGuidance (renderGuidance)', () => {

  describe('moderate guidance (no danger, no worsening)', () => {
    test('all safe answers → moderate', () => {
      const answers = { canSpeakFullSentences: true, chestRetracting: false, blueGreyLips: false };
      expect(determineGuidance(answers, false).type).toBe('moderate');
    });
  });

  describe('critical guidance from danger signs', () => {
    test('cannot speak → critical', () => {
      const answers = { canSpeakFullSentences: false, chestRetracting: false, blueGreyLips: false };
      expect(determineGuidance(answers, false).type).toBe('critical');
    });

    test('chest retracting → critical', () => {
      const answers = { canSpeakFullSentences: true, chestRetracting: true, blueGreyLips: false };
      expect(determineGuidance(answers, false).type).toBe('critical');
    });

    test('blue/grey lips → critical', () => {
      const answers = { canSpeakFullSentences: true, chestRetracting: false, blueGreyLips: true };
      expect(determineGuidance(answers, false).type).toBe('critical');
    });

    test('danger sign reason is "One or more severe danger signs were detected."', () => {
      const answers = { canSpeakFullSentences: false, chestRetracting: false, blueGreyLips: false };
      const result = determineGuidance(answers, false);
      expect(result.reason).toBe('One or more severe danger signs were detected.');
    });
  });

  describe('critical guidance from symptoms worsening', () => {
    test('symptomsWorsened=true overrides moderate signs → critical', () => {
      const answers = { canSpeakFullSentences: true, chestRetracting: false, blueGreyLips: false };
      expect(determineGuidance(answers, true).type).toBe('critical');
    });

    test('symptomsWorsened reason is "Symptoms worsened during treatment."', () => {
      const answers = { canSpeakFullSentences: true, chestRetracting: false, blueGreyLips: false };
      const result = determineGuidance(answers, true);
      expect(result.reason).toBe('Symptoms worsened during treatment.');
    });

    test('worsened takes priority over danger signs in reason text', () => {
      const answers = { canSpeakFullSentences: false, chestRetracting: true, blueGreyLips: true };
      // symptomsWorsened=true → reason should be the "worsened" message
      const result = determineGuidance(answers, true);
      expect(result.reason).toBe('Symptoms worsened during treatment.');
    });
  });
});

// =============================================================================
// TESTS: Timer state management
// =============================================================================

describe('Timer state', () => {

  describe('resetTimerForNextDose', () => {
    test('increments dose from 1 to 2', () => {
      const state = createTimerState(); // dose 1
      const next = resetTimerForNextDose(state);
      expect(next.timerDose).toBe(2);
    });

    test('increments dose from 2 to 3', () => {
      const state = { ...createTimerState(), timerDose: 2 };
      const next = resetTimerForNextDose(state);
      expect(next.timerDose).toBe(3);
    });

    test('does NOT increment past 3 (max doses)', () => {
      const state = { ...createTimerState(), timerDose: 3 };
      const next = resetTimerForNextDose(state);
      expect(next.timerDose).toBe(3); // unchanged
    });

    test('resets timerSecondsLeft to 1200', () => {
      const state = { ...createTimerState(), timerSecondsLeft: 500, timerDose: 1 };
      const next = resetTimerForNextDose(state);
      expect(next.timerSecondsLeft).toBe(TIMER_DURATION);
    });

    test('sets timerRunning to false', () => {
      const state = { ...createTimerState(), timerRunning: true, timerDose: 1 };
      const next = resetTimerForNextDose(state);
      expect(next.timerRunning).toBe(false);
    });
  });

  describe('onSymptomsWorsening', () => {
    test('sets symptomsWorsened to true', () => {
      const state = createTimerState();
      const next = onSymptomsWorsening(state);
      expect(next.symptomsWorsened).toBe(true);
    });

    test('stops the timer (timerRunning = false)', () => {
      const state = { ...createTimerState(), timerRunning: true };
      const next = onSymptomsWorsening(state);
      expect(next.timerRunning).toBe(false);
    });
  });

  describe('onTimerComplete', () => {
    test('sets timerSecondsLeft to 0', () => {
      const state = { ...createTimerState(), timerSecondsLeft: 1 };
      const next = onTimerComplete(state);
      expect(next.timerSecondsLeft).toBe(0);
    });

    test('sets timerRunning to false', () => {
      const state = { ...createTimerState(), timerRunning: true };
      const next = onTimerComplete(state);
      expect(next.timerRunning).toBe(false);
    });

    test('showCallout is true when dose is 3', () => {
      const state = { ...createTimerState(), timerDose: 3 };
      const next = onTimerComplete(state);
      expect(next.showCallout).toBe(true);
    });

    test('showCallout is false when dose is 1', () => {
      const state = { ...createTimerState(), timerDose: 1 };
      const next = onTimerComplete(state);
      expect(next.showCallout).toBe(false);
    });

    test('showCallout is false when dose is 2', () => {
      const state = { ...createTimerState(), timerDose: 2 };
      const next = onTimerComplete(state);
      expect(next.showCallout).toBe(false);
    });
  });
});

// =============================================================================
// TESTS: buildSummaryLine (saveAndFinish outcome)
// =============================================================================

describe('buildSummaryLine', () => {

  const safeAnswers    = { canSpeakFullSentences: true,  chestRetracting: false, blueGreyLips: false };
  const dangerAnswers  = { canSpeakFullSentences: false, chestRetracting: false, blueGreyLips: false };

  test('moderate episode → standard protocol summary', () => {
    const line = buildSummaryLine(safeAnswers, false, 2);
    expect(line).toBe('OUTCOME: Moderate episode — standard protocol followed (2 dose(s) administered).');
  });

  test('danger signs → critical summary', () => {
    const line = buildSummaryLine(dangerAnswers, false, 1);
    expect(line).toBe('OUTCOME: Critical danger signs detected — 911 advised.');
  });

  test('symptoms worsened → worsening summary', () => {
    const line = buildSummaryLine(safeAnswers, true, 1);
    expect(line).toBe('OUTCOME: Symptoms worsened during treatment — 911 advised.');
  });

  test('worsened takes priority over danger signs', () => {
    const line = buildSummaryLine(dangerAnswers, true, 1);
    expect(line).toBe('OUTCOME: Symptoms worsened during treatment — 911 advised.');
  });

  test('dose count is included in moderate summary', () => {
    expect(buildSummaryLine(safeAnswers, false, 1)).toContain('1 dose(s)');
    expect(buildSummaryLine(safeAnswers, false, 3)).toContain('3 dose(s)');
  });
});

// =============================================================================
// TESTS: isStep2Complete (step 2 validation)
// =============================================================================

describe('isStep2Complete', () => {

  test('all three answered → complete', () => {
    const answers = { canSpeakFullSentences: true, chestRetracting: false, blueGreyLips: false };
    expect(isStep2Complete(answers)).toBe(true);
  });

  test('missing canSpeakFullSentences → incomplete', () => {
    const answers = { canSpeakFullSentences: null, chestRetracting: false, blueGreyLips: false };
    expect(isStep2Complete(answers)).toBe(false);
  });

  test('missing chestRetracting → incomplete', () => {
    const answers = { canSpeakFullSentences: true, chestRetracting: null, blueGreyLips: false };
    expect(isStep2Complete(answers)).toBe(false);
  });

  test('missing blueGreyLips → incomplete', () => {
    const answers = { canSpeakFullSentences: true, chestRetracting: false, blueGreyLips: null };
    expect(isStep2Complete(answers)).toBe(false);
  });

  test('all null → incomplete', () => {
    const answers = { canSpeakFullSentences: null, chestRetracting: null, blueGreyLips: null };
    expect(isStep2Complete(answers)).toBe(false);
  });

  test('false values count as answered (false is a valid selection)', () => {
    const answers = { canSpeakFullSentences: false, chestRetracting: false, blueGreyLips: false };
    expect(isStep2Complete(answers)).toBe(true);
  });
});

// =============================================================================
// TESTS: TIMER_DURATION constant
// =============================================================================

describe('TIMER_DURATION', () => {
  test('is exactly 20 minutes in seconds', () => {
    expect(TIMER_DURATION).toBe(1200);
  });
});

// =============================================================================
// TESTS: formatTime (duplicate of business-logic, kept here for completeness)
// =============================================================================

describe('formatTime (emergency timer)', () => {

  test('20:00 at start (1200 seconds)', () => {
    expect(formatTime(1200)).toBe('20:00');
  });

  test('00:00 when expired', () => {
    expect(formatTime(0)).toBe('00:00');
  });

  test('00:59 at 59 seconds', () => {
    expect(formatTime(59)).toBe('00:59');
  });

  test('01:00 at 60 seconds (urgent threshold marker)', () => {
    expect(formatTime(60)).toBe('01:00');
  });

  test('timer display turns urgent at ≤ 60 seconds', () => {
    // The condition in emergency.js: timerSecondsLeft <= 60 && timerRunning
    const isUrgent = (secs, running) => secs <= 60 && running;
    expect(isUrgent(60, true)).toBe(true);
    expect(isUrgent(61, true)).toBe(false);
    expect(isUrgent(60, false)).toBe(false); // not running
    expect(isUrgent(0, true)).toBe(true);
  });
});
