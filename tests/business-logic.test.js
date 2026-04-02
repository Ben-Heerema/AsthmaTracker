/**
 * business-logic.test.js — Pure Business Logic Tests
 *
 * Tests the helper functions extracted from main.js in isolation:
 *   - calculateZone          (PEF zone thresholds)
 *   - generateAccessCode     (format and randomness)
 *   - checkMedicationExpiry  (notification thresholds)
 *   - checkLowDoseCount      (≤20 doses threshold)
 *   - adherence calculation  (schedule + medication log matching)
 *   - checkBadgeCriteria     (technique_sessions badge type)
 *   - breathing decline logic (gotWorse || stillBad)
 */

const { createTestDb } = require('./__helpers__/db-setup');

// =============================================================================
// Extracted pure functions (same logic as main.js, but importable without Electron)
// =============================================================================

/**
 * calculateZone — copied verbatim from main.js
 * Green: >= 80% of personal best
 * Yellow: 50–79%
 * Red: < 50%
 */
function calculateZone(dailyPef, personalBest) {
  const percentage = (dailyPef / personalBest) * 100;
  if (percentage >= 80) return 'green';
  if (percentage >= 50) return 'yellow';
  return 'red';
}

/**
 * generateAccessCode — copied verbatim from main.js
 */
function generateAccessCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * checkMedicationExpiry — returns the threshold label that applies, or null.
 * Mirrors the fixed logic in main.js checkMedicationExpiry().
 * Thresholds are checked in ASCENDING order so the most urgent label wins.
 */
function checkMedicationExpiry(medication) {
  if (!medication.expiration_date) return null;

  const today = new Date();
  const expiry = new Date(medication.expiration_date);
  const daysUntilExpiry = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));

  // Ascending order: most urgent threshold matched first
  const thresholds = [
    { days: 1,  label: '1 day'   },
    { days: 2,  label: '2 days'  },
    { days: 7,  label: '1 week'  },
    { days: 30, label: '1 month' }
  ];

  for (const threshold of thresholds) {
    if (daysUntilExpiry <= threshold.days && daysUntilExpiry > 0) {
      return threshold.label;
    }
  }
  return null; // not expiring soon (or already expired)
}

/**
 * checkLowDoseCount — returns true if doses are ≤ 20.
 * Mirrors the condition in main.js.
 */
function checkLowDoseCount(medication) {
  return medication.doses_remaining <= 20;
}

/**
 * isBreathingDeclined — mirrors medication log alert logic from main.js.
 * Returns true if we should alert the parent.
 */
function isBreathingDeclined(breathingBefore, breathingAfter) {
  const gotWorse  = breathingAfter < breathingBefore;
  const stillBad  = breathingAfter <= 1;
  return gotWorse || stillBad;
}

/**
 * calculateAdherence — mirrors schedule:adherence IPC handler in main.js.
 * Takes a schedule object and a list of dates on which medication was logged.
 */
function calculateAdherence(schedule, loggedDates, numDays = 30) {
  if (!schedule) return { daysPlanned: 0, daysCompleted: 0, percentage: 0 };

  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  let daysPlanned   = 0;
  let daysCompleted = 0;

  for (let i = 0; i < numDays; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dayOfWeek = dayNames[date.getDay()];
    const dateStr   = date.toISOString().split('T')[0];

    if (schedule[dayOfWeek]) {
      daysPlanned++;
      if (loggedDates.includes(dateStr)) daysCompleted++;
    }
  }

  const percentage = daysPlanned > 0
    ? Math.round((daysCompleted / daysPlanned) * 100)
    : 0;

  return { daysPlanned, daysCompleted, percentage };
}

/**
 * checkBadgeCriteria (technique_sessions) — mirrors main.js logic.
 */
function checkBadgeCriteria(badge, sessionCount) {
  if (badge.criteria_type === 'technique_sessions') {
    return sessionCount >= badge.criteria_value;
  }
  return false;
}

/**
 * formatTime — copied verbatim from emergency.js.
 */
function formatTime(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

// =============================================================================
// TESTS: calculateZone
// =============================================================================

describe('calculateZone', () => {

  describe('Green zone (≥ 80%)', () => {
    test('exactly 80% is GREEN', () => {
      expect(calculateZone(80, 100)).toBe('green');
    });

    test('100% is GREEN', () => {
      expect(calculateZone(400, 400)).toBe('green');
    });

    test('over 100% (very high reading) is GREEN', () => {
      expect(calculateZone(420, 400)).toBe('green');
    });

    test('79.99% is NOT green (boundary check)', () => {
      expect(calculateZone(319.96, 400)).not.toBe('green');
    });

    test('personal best 350, reading 280 is exactly 80%', () => {
      expect(calculateZone(280, 350)).toBe('green');
    });
  });

  describe('Yellow zone (50–79%)', () => {
    test('exactly 50% is YELLOW', () => {
      expect(calculateZone(50, 100)).toBe('yellow');
    });

    test('79% is YELLOW', () => {
      expect(calculateZone(79, 100)).toBe('yellow');
    });

    test('65% is YELLOW', () => {
      expect(calculateZone(260, 400)).toBe('yellow');
    });

    test('49.99% is NOT yellow (boundary check)', () => {
      expect(calculateZone(199.96, 400)).not.toBe('yellow');
    });
  });

  describe('Red zone (< 50%)', () => {
    test('exactly 49% is RED', () => {
      expect(calculateZone(49, 100)).toBe('red');
    });

    test('0% is RED', () => {
      expect(calculateZone(0, 100)).toBe('red');
    });

    test('1% is RED', () => {
      expect(calculateZone(1, 100)).toBe('red');
    });

    test('very low PEF (30 L/min out of 400 personal best) is RED', () => {
      expect(calculateZone(30, 400)).toBe('red');
    });
  });

  describe('Edge cases', () => {
    test('same value for both parameters is GREEN (100%)', () => {
      expect(calculateZone(350, 350)).toBe('green');
    });

    test('non-integer values work correctly', () => {
      // 79.5 / 100 = 79.5% → yellow
      expect(calculateZone(79.5, 100)).toBe('yellow');
    });

    test('large PEF values work correctly', () => {
      // 800/1000 = 80% → green
      expect(calculateZone(800, 1000)).toBe('green');
      // 700/1000 = 70% → yellow
      expect(calculateZone(700, 1000)).toBe('yellow');
    });
  });
});

// =============================================================================
// TESTS: generateAccessCode
// =============================================================================

describe('generateAccessCode', () => {

  test('returns a string', () => {
    expect(typeof generateAccessCode()).toBe('string');
  });

  test('is exactly 8 characters long', () => {
    expect(generateAccessCode().length).toBe(8);
  });

  test('contains only uppercase letters and digits', () => {
    for (let i = 0; i < 20; i++) {
      const code = generateAccessCode();
      expect(code).toMatch(/^[A-Z0-9]{8}$/);
    }
  });

  test('produces different codes on successive calls (probabilistic)', () => {
    const codes = new Set();
    for (let i = 0; i < 20; i++) codes.add(generateAccessCode());
    // Probability of all 20 being identical is astronomically small
    expect(codes.size).toBeGreaterThan(1);
  });

  test('never contains lowercase letters', () => {
    for (let i = 0; i < 10; i++) {
      expect(generateAccessCode()).toMatch(/^[^a-z]+$/);
    }
  });

  test('never contains special characters', () => {
    for (let i = 0; i < 10; i++) {
      expect(generateAccessCode()).toMatch(/^[A-Z0-9]+$/);
    }
  });
});

// =============================================================================
// TESTS: checkMedicationExpiry
// =============================================================================

describe('checkMedicationExpiry', () => {

  function makeDate(daysFromNow) {
    // Add exact days in ms then extract UTC components — matches how
    // checkMedicationExpiry parses dates (new Date("YYYY-MM-DD") = midnight UTC)
    const d = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
    const yyyy = d.getUTCFullYear();
    const mm   = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd   = String(d.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  test('returns null when expiration_date is null/missing', () => {
    expect(checkMedicationExpiry({ expiration_date: null })).toBeNull();
    expect(checkMedicationExpiry({ expiration_date: undefined })).toBeNull();
  });

  test('expiring in 1 day → "1 day"', () => {
    const med = { expiration_date: makeDate(1), medication_name: 'Test' };
    expect(checkMedicationExpiry(med)).toBe('1 day');
  });

  test('expiring in 2 days → "2 days"', () => {
    const med = { expiration_date: makeDate(2) };
    expect(checkMedicationExpiry(med)).toBe('2 days');
  });

  test('expiring in 7 days → "1 week"', () => {
    const med = { expiration_date: makeDate(7) };
    expect(checkMedicationExpiry(med)).toBe('1 week');
  });

  test('expiring in 30 days → "1 month"', () => {
    const med = { expiration_date: makeDate(30) };
    expect(checkMedicationExpiry(med)).toBe('1 month');
  });

  test('expiring in 4 days → "1 week" (safely within 3-7 range)', () => {
    const med = { expiration_date: makeDate(4) };
    expect(checkMedicationExpiry(med)).toBe('1 week');
  });

  test('expiring in 10 days → "1 month" (safely within 8-30 range)', () => {
    const med = { expiration_date: makeDate(10) };
    expect(checkMedicationExpiry(med)).toBe('1 month');
  });

  test('expiring in 32 days → null (safely beyond 30-day threshold)', () => {
    const med = { expiration_date: makeDate(32) };
    expect(checkMedicationExpiry(med)).toBeNull();
  });

  test('already expired (past date) → null (daysUntilExpiry ≤ 0)', () => {
    const med = { expiration_date: makeDate(-1) };
    expect(checkMedicationExpiry(med)).toBeNull();
  });

  test('expires today (0 days) → null (daysUntilExpiry = 0, not > 0)', () => {
    const med = { expiration_date: makeDate(0) };
    // Math.ceil of 0 ms difference could be 0 or 1 depending on ms; we test behaviour
    const result = checkMedicationExpiry(med);
    // It should be either null or '1 day', both are acceptable boundary behaviours
    expect(['1 day', null]).toContain(result);
  });
});

// =============================================================================
// TESTS: checkLowDoseCount
// =============================================================================

describe('checkLowDoseCount', () => {

  test('20 doses triggers alert (≤ 20)', () => {
    expect(checkLowDoseCount({ doses_remaining: 20 })).toBe(true);
  });

  test('1 dose triggers alert', () => {
    expect(checkLowDoseCount({ doses_remaining: 1 })).toBe(true);
  });

  test('0 doses triggers alert', () => {
    expect(checkLowDoseCount({ doses_remaining: 0 })).toBe(true);
  });

  test('21 doses does NOT trigger alert', () => {
    expect(checkLowDoseCount({ doses_remaining: 21 })).toBe(false);
  });

  test('100 doses does NOT trigger alert', () => {
    expect(checkLowDoseCount({ doses_remaining: 100 })).toBe(false);
  });

  test('boundary: exactly 20 is low', () => {
    expect(checkLowDoseCount({ doses_remaining: 20 })).toBe(true);
  });

  test('boundary: exactly 21 is NOT low', () => {
    expect(checkLowDoseCount({ doses_remaining: 21 })).toBe(false);
  });
});

// =============================================================================
// TESTS: isBreathingDeclined (medication log alert)
// =============================================================================

describe('isBreathingDeclined', () => {

  // Scale: 0=Very Bad, 1=Bad, 2=Normal, 3=Good, 4=Very Good

  test('breathing improved AND above 1 → no alert', () => {
    expect(isBreathingDeclined(2, 3)).toBe(false);
    expect(isBreathingDeclined(1, 2)).toBe(false);
  });

  test('breathing worsened → alert', () => {
    expect(isBreathingDeclined(3, 2)).toBe(true);
    expect(isBreathingDeclined(4, 1)).toBe(true);
  });

  test('breathing unchanged at ≤ 1 → alert (stillBad)', () => {
    expect(isBreathingDeclined(1, 1)).toBe(true); // unchanged at Bad
    expect(isBreathingDeclined(0, 0)).toBe(true); // unchanged at Very Bad
  });

  test('breathing "improved" from 0 to 1 still alerts (stillBad)', () => {
    expect(isBreathingDeclined(0, 1)).toBe(true); // improved but still Bad
  });

  test('breathing "improved" from 1 to 2 → no alert', () => {
    expect(isBreathingDeclined(1, 2)).toBe(false); // improved past Bad
  });

  test('breathing at max (4→4) → no alert', () => {
    expect(isBreathingDeclined(4, 4)).toBe(false);
  });

  test('breathing dropped to 0 (Very Bad) → alert', () => {
    expect(isBreathingDeclined(3, 0)).toBe(true);
  });

  test('before=2, after=2 (no change, normal) → no alert', () => {
    expect(isBreathingDeclined(2, 2)).toBe(false);
  });
});

// =============================================================================
// TESTS: calculateAdherence
// =============================================================================

describe('calculateAdherence', () => {

  test('no schedule → 0%', () => {
    const result = calculateAdherence(null, []);
    expect(result).toEqual({ daysPlanned: 0, daysCompleted: 0, percentage: 0 });
  });

  test('no scheduled days → 0%', () => {
    const emptySchedule = {
      monday: 0, tuesday: 0, wednesday: 0, thursday: 0,
      friday: 0, saturday: 0, sunday: 0
    };
    const result = calculateAdherence(emptySchedule, []);
    expect(result.daysPlanned).toBe(0);
    expect(result.percentage).toBe(0);
  });

  test('all 7 days scheduled, none logged → 0%', () => {
    const allDays = {
      monday: 1, tuesday: 1, wednesday: 1, thursday: 1,
      friday: 1, saturday: 1, sunday: 1
    };
    const result = calculateAdherence(allDays, [], 30);
    expect(result.daysPlanned).toBe(30);
    expect(result.daysCompleted).toBe(0);
    expect(result.percentage).toBe(0);
  });

  test('100% adherence: every scheduled day logged', () => {
    // Build list of last 30 dates
    const allDays = {
      monday: 1, tuesday: 1, wednesday: 1, thursday: 1,
      friday: 1, saturday: 1, sunday: 1
    };
    const loggedDates = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      loggedDates.push(d.toISOString().split('T')[0]);
    }
    const result = calculateAdherence(allDays, loggedDates, 30);
    expect(result.percentage).toBe(100);
    expect(result.daysCompleted).toBe(result.daysPlanned);
  });

  test('percentage rounds correctly — logs all scheduled days = 100%', () => {
    // Schedule every day and log every day in the last 30 → 100%
    const allDays = {
      monday: 1, tuesday: 1, wednesday: 1, thursday: 1,
      friday: 1, saturday: 1, sunday: 1
    };
    const loggedDates = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      loggedDates.push(d.toISOString().split('T')[0]);
    }
    const result = calculateAdherence(allDays, loggedDates, 30);
    expect(result.percentage).toBe(100);
    expect(result.daysCompleted).toBe(result.daysPlanned);
  });

  test('returns whole number percentage (rounded)', () => {
    const allDays = {
      monday: 1, tuesday: 1, wednesday: 1, thursday: 1,
      friday: 1, saturday: 1, sunday: 1
    };
    const loggedDates = [];
    for (let i = 0; i < 15; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      loggedDates.push(d.toISOString().split('T')[0]);
    }
    const result = calculateAdherence(allDays, loggedDates, 30);
    expect(Number.isInteger(result.percentage)).toBe(true);
  });
});

// =============================================================================
// TESTS: checkBadgeCriteria
// =============================================================================

describe('checkBadgeCriteria', () => {

  describe('technique_sessions type', () => {
    test('not achieved when count < criteria_value', () => {
      const badge = { criteria_type: 'technique_sessions', criteria_value: 10 };
      expect(checkBadgeCriteria(badge, 9)).toBe(false);
    });

    test('achieved when count === criteria_value', () => {
      const badge = { criteria_type: 'technique_sessions', criteria_value: 10 };
      expect(checkBadgeCriteria(badge, 10)).toBe(true);
    });

    test('achieved when count > criteria_value', () => {
      const badge = { criteria_type: 'technique_sessions', criteria_value: 5 };
      expect(checkBadgeCriteria(badge, 100)).toBe(true);
    });

    test('criteria_value of 1 achieved after first session', () => {
      const badge = { criteria_type: 'technique_sessions', criteria_value: 1 };
      expect(checkBadgeCriteria(badge, 0)).toBe(false);
      expect(checkBadgeCriteria(badge, 1)).toBe(true);
    });
  });

  describe('unknown criteria type', () => {
    test('returns false for unknown type', () => {
      const badge = { criteria_type: 'controller_adherence', criteria_value: 6 };
      expect(checkBadgeCriteria(badge, 100)).toBe(false);
    });

    test('returns false for completely unknown type', () => {
      const badge = { criteria_type: 'magic_unicorn', criteria_value: 1 };
      expect(checkBadgeCriteria(badge, 99)).toBe(false);
    });
  });
});

// =============================================================================
// TESTS: formatTime (emergency timer display)
// =============================================================================

describe('formatTime', () => {

  test('formats 1200 seconds (20:00)', () => {
    expect(formatTime(1200)).toBe('20:00');
  });

  test('formats 0 seconds (00:00)', () => {
    expect(formatTime(0)).toBe('00:00');
  });

  test('formats 60 seconds (01:00)', () => {
    expect(formatTime(60)).toBe('01:00');
  });

  test('formats 59 seconds (00:59)', () => {
    expect(formatTime(59)).toBe('00:59');
  });

  test('formats 61 seconds (01:01)', () => {
    expect(formatTime(61)).toBe('01:01');
  });

  test('always pads minutes to 2 digits', () => {
    expect(formatTime(5 * 60)).toBe('05:00');
  });

  test('always pads seconds to 2 digits', () => {
    expect(formatTime(5)).toBe('00:05');
  });

  test('formats 1199 seconds (19:59)', () => {
    expect(formatTime(1199)).toBe('19:59');
  });
});

// =============================================================================
// TESTS: PEF Zone percentage calculation (from pef:calculate-zone handler)
// =============================================================================

describe('PEF percentage calculation', () => {

  function calcPercentage(dailyPef, personalBest) {
    return Math.round((dailyPef / personalBest) * 100);
  }

  test('400/500 = 80%', () => {
    expect(calcPercentage(400, 500)).toBe(80);
  });

  test('rounds 83.33% to 83', () => {
    expect(calcPercentage(250, 300)).toBe(83);
  });

  test('200/400 = 50%', () => {
    expect(calcPercentage(200, 400)).toBe(50);
  });

  test('handles decimal PEF values', () => {
    expect(calcPercentage(319.5, 400)).toBe(80);
  });
});

// =============================================================================
// TESTS: Video section configuration and logic
// =============================================================================

/**
 * VIDEO_FILES and VIDEO_TITLES — copied from inhaler-technique.js
 * These map technique types to filenames and display titles.
 */
const VIDEO_FILES = {
  regular:     'inhaler_regular.mp4',
  mask_spacer: 'inhaler_mask_spacer.mp4'
};

const VIDEO_TITLES = {
  regular:     'Regular MDI Inhaler Technique',
  mask_spacer: 'Mask & Spacer Technique'
};

describe('Video configuration', () => {

  describe('VIDEO_FILES mapping', () => {
    test('has entry for regular type', () => {
      expect(VIDEO_FILES.regular).toBeDefined();
    });

    test('has entry for mask_spacer type', () => {
      expect(VIDEO_FILES.mask_spacer).toBeDefined();
    });

    test('regular video has .mp4 extension', () => {
      expect(VIDEO_FILES.regular).toMatch(/\.mp4$/);
    });

    test('mask_spacer video has .mp4 extension', () => {
      expect(VIDEO_FILES.mask_spacer).toMatch(/\.mp4$/);
    });

    test('regular filename is inhaler_regular.mp4', () => {
      expect(VIDEO_FILES.regular).toBe('inhaler_regular.mp4');
    });

    test('mask_spacer filename is inhaler_mask_spacer.mp4', () => {
      expect(VIDEO_FILES.mask_spacer).toBe('inhaler_mask_spacer.mp4');
    });

    test('only has two entries (regular and mask_spacer)', () => {
      expect(Object.keys(VIDEO_FILES)).toHaveLength(2);
      expect(Object.keys(VIDEO_FILES).sort()).toEqual(['mask_spacer', 'regular']);
    });
  });

  describe('VIDEO_TITLES mapping', () => {
    test('has title for regular type', () => {
      expect(VIDEO_TITLES.regular).toBeDefined();
    });

    test('has title for mask_spacer type', () => {
      expect(VIDEO_TITLES.mask_spacer).toBeDefined();
    });

    test('regular title contains "Regular"', () => {
      expect(VIDEO_TITLES.regular).toContain('Regular');
    });

    test('mask_spacer title contains "Spacer"', () => {
      expect(VIDEO_TITLES.mask_spacer).toContain('Spacer');
    });

    test('titles are non-empty strings', () => {
      expect(typeof VIDEO_TITLES.regular).toBe('string');
      expect(VIDEO_TITLES.regular.length).toBeGreaterThan(0);
      expect(typeof VIDEO_TITLES.mask_spacer).toBe('string');
      expect(VIDEO_TITLES.mask_spacer.length).toBeGreaterThan(0);
    });

    test('keys match VIDEO_FILES keys', () => {
      expect(Object.keys(VIDEO_TITLES).sort()).toEqual(Object.keys(VIDEO_FILES).sort());
    });
  });

  describe('Video path construction', () => {
    // Mirrors the path logic in openVideoModal(): '../assets/videos/' + VIDEO_FILES[type]
    function buildVideoPath(type) {
      return '../assets/videos/' + VIDEO_FILES[type];
    }

    test('regular path is correct', () => {
      expect(buildVideoPath('regular')).toBe('../assets/videos/inhaler_regular.mp4');
    });

    test('mask_spacer path is correct', () => {
      expect(buildVideoPath('mask_spacer')).toBe('../assets/videos/inhaler_mask_spacer.mp4');
    });

    test('unknown type returns undefined in filename', () => {
      const path = '../assets/videos/' + VIDEO_FILES['unknown'];
      expect(path).toContain('undefined');
    });
  });
});

describe('Video file existence', () => {
  const fs   = require('fs');
  const path = require('path');
  const videoDir = path.join(__dirname, '..', 'src', 'assets', 'videos');

  test('assets/videos directory exists', () => {
    expect(fs.existsSync(videoDir)).toBe(true);
  });

  test('inhaler_regular.mp4 exists', () => {
    expect(fs.existsSync(path.join(videoDir, 'inhaler_regular.mp4'))).toBe(true);
  });

  test('inhaler_mask_spacer.mp4 exists', () => {
    expect(fs.existsSync(path.join(videoDir, 'inhaler_mask_spacer.mp4'))).toBe(true);
  });

  test('video files are non-empty', () => {
    const regularSize = fs.statSync(path.join(videoDir, 'inhaler_regular.mp4')).size;
    const maskSize    = fs.statSync(path.join(videoDir, 'inhaler_mask_spacer.mp4')).size;
    expect(regularSize).toBeGreaterThan(0);
    expect(maskSize).toBeGreaterThan(0);
  });
});
