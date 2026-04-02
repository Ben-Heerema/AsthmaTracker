/**
 * emergency.js — Emergency Triage Page Logic
 *
 * 5-step triage flow accessible by both parents AND children.
 * 911 is always displayed at the top (cannot be dismissed or hidden).
 *
 * FLOW:
 *   Step 1: Select which child is having the emergency (or auto-fill for child login)
 *   Step 2: Check danger signs (sentences, chest retracting, blue/grey lips)
 *           If ANY danger sign → show 911 callout prominently
 *   Step 3: Optional PEF reading
 *   Step 4: Record rescue medication use + 20-minute countdown timer + notes
 *   Step 5: Display guidance + save incident report
 *
 * EVENT LOG:
 *   Every significant action is timestamped and stored in `eventLog`.
 *   The full log is saved into the incident report as `guidanceProvided`,
 *   giving clinicians a clear timeline of exactly what happened and what
 *   the app instructed the user to do.
 *
 * TIMER:
 *   20-minute countdown per dose (standard protocol: up to 3 doses).
 *   User can skip via "Symptoms worsening" button which shows a 911 callout.
 *
 * All data is saved as an Incident_Report in the database.
 * If triggered by a child, the parent gets an immediate notification.
 */

/** Escape HTML special characters to prevent XSS from database content */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

let session         = null;
let selectedChildId = null;

// Tracks user answers for the incident report
const answers = {
  canSpeakFullSentences: null,
  chestRetracting:       null,
  blueGreyLips:          null
};

// ── Event log ─────────────────────────────────────────────────────────────────
// Every entry: { time: "HH:MM:SS", event: "human-readable string" }
const eventLog = [];

function logEvent(text) {
  const now  = new Date();
  const pad  = n => String(n).padStart(2, '0');
  const time = pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
  eventLog.push({ time, event: text });
}

function buildLogText() {
  if (eventLog.length === 0) return 'No events logged.';
  return eventLog.map(e => '[' + e.time + '] ' + e.event).join('\n');
}

// ── Timer state ───────────────────────────────────────────────────────────────
const TIMER_DURATION = 20 * 60; // 20 minutes in seconds
let timerSecondsLeft = TIMER_DURATION;
let timerInterval    = null;
let timerDose        = 1;       // current dose number (1-3)
let timerRunning     = false;
let symptomsWorsened = false;

function formatTime(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function updateTimerDisplay() {
  const display = document.getElementById('timer-display');
  if (!display) return;
  display.textContent = formatTime(timerSecondsLeft);
  // Turn display red when under 1 minute remaining
  display.classList.toggle('emg-timer-urgent', timerSecondsLeft <= 60 && timerRunning);
}

function startTimer() {
  if (timerRunning) return;
  timerRunning = true;

  const startBtn = document.getElementById('timer-start-btn');
  startBtn.textContent = '⏸ Running…';
  startBtn.disabled = true;

  logEvent('Dose ' + timerDose + ' administered. 20-minute timer started.');

  timerInterval = setInterval(() => {
    timerSecondsLeft--;
    updateTimerDisplay();

    if (timerSecondsLeft <= 0) {
      clearInterval(timerInterval);
      timerRunning = false;
      timerSecondsLeft = 0;
      updateTimerDisplay();
      onTimerComplete();
    }
  }, 1000);
}

function onTimerComplete() {
  const display = document.getElementById('timer-display');
  display.textContent = '00:00';
  display.classList.add('emg-timer-done');

  logEvent('20-minute wait complete after dose ' + timerDose + '. Time to reassess.');

  const startBtn = document.getElementById('timer-start-btn');
  startBtn.textContent = "✓ Time's up — Reassess now";
  startBtn.disabled = true;

  // If max doses reached, advise 911
  if (timerDose >= 3) {
    logEvent('App instruction: 3 doses administered with no improvement. Advised to call 911.');
    const callout = document.getElementById('timer-911-callout');
    callout.classList.remove('hidden');
    callout.querySelector('.emg-critical-sub').textContent =
      '3 doses given — no improvement. Call 911 now.';
  }
}

function resetTimerForNextDose() {
  if (timerDose >= 3) return; // no more doses

  clearInterval(timerInterval);
  timerRunning     = false;
  timerDose++;
  timerSecondsLeft = TIMER_DURATION;

  document.getElementById('timer-dose-count').textContent = timerDose + ' / 3';
  document.getElementById('timer-display').classList.remove('emg-timer-urgent', 'emg-timer-done');

  const startBtn = document.getElementById('timer-start-btn');
  startBtn.textContent = '▶ Start Timer';
  startBtn.disabled    = false;

  logEvent('Moved to dose ' + timerDose + '. Timer reset to 20:00.');
  updateTimerDisplay();

  // Disable "Next Dose" once we're on dose 3 (the last dose)
  if (timerDose >= 3) {
    document.getElementById('timer-reset-btn').disabled = true;
    document.getElementById('timer-reset-btn').textContent = 'Max doses reached';
  }
}

function onSymptomsWorsening() {
  clearInterval(timerInterval);
  timerRunning     = false;
  symptomsWorsened = true;

  logEvent('CRITICAL: User reported symptoms worsening. App instructed: Call 911 immediately.');

  document.getElementById('timer-911-callout').classList.remove('hidden');
  document.getElementById('timer-worsen-btn').disabled    = true;
  document.getElementById('timer-worsen-btn').textContent = '⚠️ 911 recommended — see below';
  document.getElementById('timer-start-btn').disabled     = true;
  document.getElementById('timer-reset-btn').disabled     = true;
}

// ── Step display ──────────────────────────────────────────────────────────────

function showStep(stepNum) {
  for (let i = 1; i <= 5; i++) {
    document.getElementById('step-' + i).classList.toggle('hidden', i !== stepNum);
  }
}

// ── Danger sign Yes/No buttons ────────────────────────────────────────────────

function selectOption(field, value) {
  answers[field === 'sentences' ? 'canSpeakFullSentences'
        : field === 'chest'     ? 'chestRetracting'
                                : 'blueGreyLips'] = value;

  const yesBtn = document.getElementById(field + '-yes');
  const noBtn  = document.getElementById(field + '-no');
  yesBtn.classList.toggle('selected', value === true);
  noBtn.classList.toggle('selected', value === false);

  checkDangerSigns();
}

function checkDangerSigns() {
  const hasDanger = answers.canSpeakFullSentences === false
    || answers.chestRetracting === true
    || answers.blueGreyLips    === true;

  document.getElementById('call-911-now').classList.toggle('hidden', !hasDanger);
}

// ── Step navigation ───────────────────────────────────────────────────────────

function goToStep2() {
  if (!selectedChildId && session && session.userId) {
    selectedChildId = document.getElementById('child-select').value;
    if (!selectedChildId) {
      document.getElementById('step1-error').classList.remove('hidden');
      return;
    }
    document.getElementById('step1-error').classList.add('hidden');
    selectedChildId = parseInt(selectedChildId);
  }
  logEvent('Step 1 complete. Child identified. Proceeding to danger sign assessment.');
  showStep(2);
}

function goToStep3() {
  if (answers.canSpeakFullSentences === null
   || answers.chestRetracting       === null
   || answers.blueGreyLips          === null) {
    document.getElementById('step2-error').classList.remove('hidden');
    return;
  }
  document.getElementById('step2-error').classList.add('hidden');

  // Log all three danger sign answers
  const hasDanger = answers.canSpeakFullSentences === false
    || answers.chestRetracting === true
    || answers.blueGreyLips    === true;

  logEvent(
    'Step 2 — Danger signs assessed: ' +
    'Can speak in sentences: ' + (answers.canSpeakFullSentences ? 'Yes' : 'NO') + '; ' +
    'Chest retracting: '       + (answers.chestRetracting       ? 'YES' : 'No') + '; ' +
    'Blue/grey lips: '         + (answers.blueGreyLips           ? 'YES' : 'No') + '.'
  );

  if (hasDanger) {
    logEvent('CRITICAL: Danger signs present. App instructed: Call 911 immediately.');
  } else {
    logEvent('No critical danger signs detected. Proceeding with standard protocol.');
  }

  showStep(3);
}

async function goToStep4() {
  try {
    const pefVal = document.getElementById('emergency-pef').value;
    if (pefVal) {
      logEvent('Step 3 — Peak flow reading recorded: ' + pefVal + ' L/min.');
    } else {
      logEvent('Step 3 — Peak flow reading: not taken (skipped).');
    }

    showStep(4);
    await loadRescueMedications();
    logEvent('Step 4 reached. App instructed: Administer rescue inhaler (2–4 puffs). Start 20-minute timer.');
  } catch (err) {
    console.error('Failed to proceed to step 4:', err);
    logEvent('ERROR: Failed to load step 4 data.');
    showStep(4);
  }
}

function goToStep5() {
  const notes      = document.getElementById('notes').value.trim();
  const notesError = document.getElementById('notes-error');
  if (!notes) {
    notesError.classList.remove('hidden');
    document.getElementById('notes').focus();
    return;
  }
  notesError.classList.add('hidden');

  logEvent('Step 4 complete. User notes recorded. Proceeding to guidance.');
  showStep(5);
  renderGuidance();
}

// ── Guidance (Step 5) ─────────────────────────────────────────────────────────

function renderGuidance() {
  const hasDanger = !answers.canSpeakFullSentences
    || answers.chestRetracting
    || answers.blueGreyLips;

  let guidance = '';

  if (symptomsWorsened || hasDanger) {
    const reason = symptomsWorsened
      ? 'Symptoms worsened during treatment.'
      : 'One or more severe danger signs were detected.';
    guidance = `
      <div class="alert alert-danger">
        <strong>⚠️ CRITICAL — CALL 911 IMMEDIATELY</strong><br>
        ${reason} Do not wait for medication to work.
      </div>
      <ul class="emg-guidance-list">
        <li>Call 911 right now</li>
        <li>Keep the child calm and sitting upright</li>
        <li>Do NOT lay the child flat</li>
        <li>Give rescue inhaler while waiting for ambulance</li>
        <li>Stay with the child — do not leave them alone</li>
      </ul>
    `;
    logEvent('Step 5 — App guidance: CRITICAL. 911 advised. Keep child upright and calm.');
  } else {
    guidance = `
      <div class="alert alert-warning">
        <strong>Moderate episode — monitor closely</strong>
      </div>
      <ul class="emg-guidance-list">
        <li>Give rescue inhaler (2–4 puffs) every 20 minutes, up to 3 doses</li>
        <li>Stay with the child and keep them calm</li>
        <li>Have the child sit upright — do not lay flat</li>
        <li>Remove any known triggers from the environment</li>
        <li>If no improvement after 3 doses — call 911 immediately</li>
        <li>Contact the child's doctor or nurse line</li>
      </ul>
    `;
    logEvent('Step 5 — App guidance: Moderate episode. Standard protocol provided. Monitor closely.');
  }

  document.getElementById('guidance-text').innerHTML = guidance;
}

// ── Rescue medications ────────────────────────────────────────────────────────

async function loadRescueMedications() {
  try {
    const meds      = await window.electronAPI.getMedications(selectedChildId);
    const rescue    = meds.filter(m => m.is_rescue);
    const container = document.getElementById('rescue-med-list');

    if (rescue.length === 0) {
      container.innerHTML = '<p class="text-muted">No rescue medications on file. Use standard protocol.</p>';
      logEvent('Rescue medications: none on file. Standard Albuterol protocol applied.');
      return;
    }

    container.innerHTML = rescue.map(m => `
      <div class="emg-rescue-item">
        <div>
          <div class="emg-rescue-name">${escapeHtml(m.medication_name)}</div>
          <div class="emg-rescue-doses">${m.doses_remaining} doses remaining</div>
        </div>
      </div>
    `).join('');

    const medNames = rescue.map(m => m.medication_name).join(', ');
    logEvent('Rescue medications on file: ' + medNames + '.');
  } catch (err) {
    console.error('Failed to load rescue medications:', err);
    const container = document.getElementById('rescue-med-list');
    container.innerHTML = '<p class="text-muted">Could not load medications. Use standard protocol.</p>';
    logEvent('Rescue medications: failed to load. Standard protocol applied.');
  }
}

// ── Save and finish ───────────────────────────────────────────────────────────

async function saveAndFinish() {
  const notes      = document.getElementById('notes').value.trim();
  const pefInput   = document.getElementById('emergency-pef').value;
  const currentPef = pefInput ? parseFloat(pefInput) : null;

  // Final log entry before saving
  logEvent('Incident report saved. Session ended at ' + new Date().toLocaleTimeString() + '.');

  // Build the complete guidance string that goes into the incident report.
  // This includes a one-line outcome summary + the full timestamped event log.
  const hasDanger = !answers.canSpeakFullSentences
    || answers.chestRetracting
    || answers.blueGreyLips;

  const summaryLine = symptomsWorsened
    ? 'OUTCOME: Symptoms worsened during treatment — 911 advised.'
    : hasDanger
      ? 'OUTCOME: Critical danger signs detected — 911 advised.'
      : 'OUTCOME: Moderate episode — standard protocol followed (' + timerDose + ' dose(s) administered).';

  const fullGuidance = summaryLine + '\n\n--- EVENT LOG ---\n' + buildLogText();

  try {
    await window.electronAPI.createIncident({
      childId:                 selectedChildId,
      canSpeakFullSentences:   answers.canSpeakFullSentences ?? true,
      chestRetracting:         answers.chestRetracting ?? false,
      blueGreyLips:            answers.blueGreyLips ?? false,
      currentPef,
      userNotes:               notes,
      guidanceProvided:        fullGuidance,
      medicationsAdministered: timerDose + ' dose(s) via rescue inhaler'
    });
  } catch (err) {
    console.error('Failed to save incident report:', err);
    showToast('Could not save the incident report, but please follow the guidance provided.', 'error');
  }

  // Clear the timer if still running
  clearInterval(timerInterval);

  // Return to the correct home screen
  if (session && session.childId) {
    window.electronAPI.navigate('child-main');
  } else if (session && session.role === 'parent') {
    window.electronAPI.navigate('parent-main');
  } else {
    window.electronAPI.navigate('landing');
  }
}

// ── Page initialisation ───────────────────────────────────────────────────────

async function initializePage() {
  try {
    session = await window.electronAPI.getSession();

    logEvent('Emergency triage session started.');

    const backBtn = document.getElementById('back-btn');
    if (session && session.childId) {
      backBtn.addEventListener('click', () => window.electronAPI.navigate('child-main'));
    } else if (session && session.role === 'parent') {
      backBtn.addEventListener('click', () => window.electronAPI.navigate('parent-main'));
    } else {
      backBtn.addEventListener('click', () => window.electronAPI.navigate('landing'));
    }

    if (session && session.childId) {
      selectedChildId = session.childId;
      logEvent('User is a child (ID: ' + selectedChildId + '). Step 1 skipped.');
      document.getElementById('child-selector-area').innerHTML =
        '<p>You are logged in as a child. Continuing to Step 2...</p>';

      // Notify parent immediately that child started emergency triage
      window.electronAPI.emergencyStarted().catch(err =>
        console.error('Failed to send emergency notification:', err)
      );
    } else if (session && session.userId) {
      const children = await window.electronAPI.getChildren();
      const select   = document.getElementById('child-select');
      select.innerHTML = '<option value="">— Select a child —</option>';
      children.forEach(c => {
        const o = document.createElement('option');
        o.value = c.child_id; o.textContent = c.name; select.appendChild(o);
      });
    }
    // Wire up nav bar now that session is known
    initNavBar();
  } catch (err) {
    console.error('Failed to initialize emergency page:', err);
    logEvent('ERROR: Failed to initialize emergency page.');
  }
}

// ── DOMContentLoaded ──────────────────────────────────────────────────────────

function initNavBar() {
  const homeBtn     = document.getElementById('nav-home');
  const emergBtn    = document.getElementById('nav-emergency');
  const settingsBtn = document.getElementById('nav-settings');

  // Determine home target based on role
  let homeTarget = 'landing';
  if (session && session.childId)             homeTarget = 'child-main';
  else if (session && session.role === 'parent')   homeTarget = 'parent-main';
  else if (session && session.role === 'provider') homeTarget = 'provider-main';

  homeBtn.addEventListener('click', () => window.electronAPI.navigate(homeTarget));
  // Emergency is current page — no-op but keep button for visual consistency
  emergBtn.addEventListener('click', () => { /* already on emergency */ });
  settingsBtn.addEventListener('click', () => window.electronAPI.navigate('settings'));
}

document.addEventListener('DOMContentLoaded', () => {
  initializePage();

  // Step 1
  document.getElementById('step1-continue-btn').addEventListener('click', goToStep2);

  // Step 2: Yes/No option buttons
  document.getElementById('sentences-yes').addEventListener('click', () => selectOption('sentences', true));
  document.getElementById('sentences-no').addEventListener('click',  () => selectOption('sentences', false));
  document.getElementById('chest-yes').addEventListener('click',     () => selectOption('chest', true));
  document.getElementById('chest-no').addEventListener('click',      () => selectOption('chest', false));
  document.getElementById('blue-yes').addEventListener('click',      () => selectOption('blue', true));
  document.getElementById('blue-no').addEventListener('click',       () => selectOption('blue', false));
  document.getElementById('step2-continue-btn').addEventListener('click', goToStep3);
  document.getElementById('step2-back-btn').addEventListener('click', () => {
    // Reset danger sign selections when going back to Step 1
    answers.canSpeakFullSentences = null;
    answers.chestRetracting       = null;
    answers.blueGreyLips          = null;
    ['sentences', 'chest', 'blue'].forEach(field => {
      document.getElementById(field + '-yes').classList.remove('selected');
      document.getElementById(field + '-no').classList.remove('selected');
    });
    document.getElementById('call-911-now').classList.add('hidden');
    document.getElementById('step2-error').classList.add('hidden');
    showStep(1);
  });

  // Step 3
  document.getElementById('step3-continue-btn').addEventListener('click', goToStep4);
  document.getElementById('step3-back-btn').addEventListener('click', () => showStep(2));

  // Step 4 — timer buttons
  document.getElementById('timer-start-btn').addEventListener('click', startTimer);
  document.getElementById('timer-reset-btn').addEventListener('click', resetTimerForNextDose);
  document.getElementById('timer-worsen-btn').addEventListener('click', onSymptomsWorsening);

  // Step 4 — continue / back
  document.getElementById('step4-continue-btn').addEventListener('click', goToStep5);
  document.getElementById('step4-back-btn').addEventListener('click', () => {
    // Fully reset timer state so returning to Step 4 starts fresh
    clearInterval(timerInterval);
    timerRunning     = false;
    timerSecondsLeft = TIMER_DURATION;
    timerDose        = 1;
    symptomsWorsened = false;

    // Reset timer UI elements
    document.getElementById('timer-display').textContent = formatTime(TIMER_DURATION);
    document.getElementById('timer-display').classList.remove('emg-timer-urgent', 'emg-timer-done');
    document.getElementById('timer-dose-count').textContent = '1 / 3';
    const startBtn = document.getElementById('timer-start-btn');
    startBtn.textContent = '▶ Start Timer';
    startBtn.disabled    = false;
    const resetBtn = document.getElementById('timer-reset-btn');
    resetBtn.textContent = 'Next Dose';
    resetBtn.disabled    = false;
    const worsenBtn = document.getElementById('timer-worsen-btn');
    worsenBtn.textContent = '⚠️ Symptoms worsening';
    worsenBtn.disabled    = false;
    document.getElementById('timer-911-callout').classList.add('hidden');

    showStep(3);
  });

  // Step 5
  document.getElementById('save-finish-btn').addEventListener('click', saveAndFinish);
});
