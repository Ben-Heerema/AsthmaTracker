/**
 * daily-checkin.js — Daily Check-in Page Logic
 *
 * Tracks symptom severity (Section A) and triggers (Section B) for a child.
 * Saves to the database via IPC. Loads today's existing check-in if one exists
 * (so re-opening the page pre-fills your earlier answers).
 *
 * KEY FIX NOTES:
 *  - querySelectorAll() MUST receive a CSS selector string — calling it with
 *    no arguments throws a SyntaxError, which was crashing this page.
 *  - The save button is disabled until a child is selected.
 */

// Tracks the currently selected value for each symptom group
const selections = {
  'night-waking':    'none',
  'activity-limits': 'none',
  'coughing':        'none',
  'wheezing':        'none'
};

/**
 * selectOption — Called when a symptom severity button is clicked.
 * Highlights the clicked button and de-highlights the rest in the same group.
 * @param {HTMLElement} btn - The button that was clicked
 */
function selectOption(btn) {
  const group = btn.dataset.group;
  selections[group] = btn.dataset.value;

  // De-select all buttons in the same group, then select this one.
  // The selector `[data-group="night-waking"]` finds all buttons in that group.
  document.querySelectorAll(`[data-group="${group}"]`).forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}

/**
 * setOptionSelected — Pre-fills a group with a saved value (used on page load).
 * @param {string} group - The group name (e.g. 'night-waking')
 * @param {string} value - The saved value (e.g. 'some')
 */
function setOptionSelected(group, value) {
  document.querySelectorAll(`[data-group="${group}"]`).forEach(b => {
    b.classList.toggle('selected', b.dataset.value === value);
  });
  selections[group] = value;
}

/**
 * loadTodaysCheckin — Fetches existing check-in data and pre-fills the form.
 * Also shows/hides the form area depending on whether a child is selected.
 */
async function loadTodaysCheckin() {
  const childId = document.getElementById('child-select').value;

  // Hide form and disable save button if no child selected
  if (!childId) {
    document.getElementById('form-area').classList.add('hidden');
    document.getElementById('no-child-prompt').classList.remove('hidden');
    document.getElementById('save-checkin-btn').disabled = true;
    return;
  }

  // Show form, hide prompt, enable save button
  document.getElementById('form-area').classList.remove('hidden');
  document.getElementById('no-child-prompt').classList.add('hidden');
  document.getElementById('save-checkin-btn').disabled = false;

  // Try to load today's existing check-in to pre-fill
  const checkin = await window.electronAPI.getTodaysCheckin(parseInt(childId));
  if (checkin) {
    setOptionSelected('night-waking',    checkin.night_waking);
    setOptionSelected('activity-limits', checkin.activity_limits);
    setOptionSelected('coughing',        checkin.coughing);
    setOptionSelected('wheezing',        checkin.wheezing);
    document.getElementById('trigger-exercise').checked    = !!checkin.trigger_exercise;
    document.getElementById('trigger-cold-air').checked    = !!checkin.trigger_cold_air;
    document.getElementById('trigger-dust').checked        = !!checkin.trigger_dust;
    document.getElementById('trigger-smoke').checked       = !!checkin.trigger_smoke;
    document.getElementById('trigger-illness').checked     = !!checkin.trigger_illness;
    document.getElementById('trigger-strong-odors').checked = !!checkin.trigger_strong_odors;
  } else {
    // No existing check-in — reset form to defaults
    ['night-waking', 'activity-limits', 'coughing', 'wheezing'].forEach(group => {
      setOptionSelected(group, 'none');
    });
    ['trigger-exercise','trigger-cold-air','trigger-dust',
     'trigger-smoke','trigger-illness','trigger-strong-odors'].forEach(id => {
      document.getElementById(id).checked = false;
    });
  }
}

/**
 * saveCheckin — Submits the check-in data to the database via IPC.
 */
async function saveCheckin() {
  const childId = parseInt(document.getElementById('child-select').value);
  if (!childId) {
    showToast('Please select a child first', 'error');
    return;
  }

  const btn = document.getElementById('save-checkin-btn');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  const result = await window.electronAPI.submitCheckin({
    childId,
    nightWaking:       selections['night-waking'],
    activityLimits:    selections['activity-limits'],
    coughing:          selections['coughing'],
    wheezing:          selections['wheezing'],
    triggerExercise:   document.getElementById('trigger-exercise').checked,
    triggerColdAir:    document.getElementById('trigger-cold-air').checked,
    triggerDust:       document.getElementById('trigger-dust').checked,
    triggerSmoke:      document.getElementById('trigger-smoke').checked,
    triggerIllness:    document.getElementById('trigger-illness').checked,
    triggerStrongOdors: document.getElementById('trigger-strong-odors').checked
  });

  btn.disabled = false;
  btn.textContent = '💾 Save Check-in';

  if (result.success) {
    const select = document.getElementById('child-select');
    const childName = select.options[select.selectedIndex].text;
    showSuccess(
      `Successfully saved check-in for ${childName}!`,
      '← Back to Home',
      () => window.electronAPI.navigate('parent-main')
    );
  } else {
    showToast(result.error || 'Failed to save check-in. Please try again.', 'error');
  }
}

async function initializePage() {
  const session = await window.electronAPI.getSession();
  if (!session || !session.userId) { window.electronAPI.navigate('landing'); return; }

  // Display today's date in the header area
  const dateEl = document.getElementById('today-date');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  }

  const navData  = await window.electronAPI.getNavigationData();
  const children = await window.electronAPI.getChildren();
  const select   = document.getElementById('child-select');

  select.innerHTML = '<option value="">— Select a child —</option>';
  children.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.child_id;
    opt.textContent = c.name;
    select.appendChild(opt);
  });

  // If navigated here with a specific child pre-selected, use it
  if (navData && navData.childId) {
    select.value = navData.childId;
    await loadTodaysCheckin();
  } else {
    // No child pre-selected — keep form hidden and save button disabled
    document.getElementById('save-checkin-btn').disabled = true;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initializePage();

  document.getElementById('back-btn').addEventListener('click', () => window.electronAPI.navigate('parent-main'));
  document.getElementById('child-select').addEventListener('change', loadTodaysCheckin);
  document.getElementById('save-checkin-btn').addEventListener('click', saveCheckin);

  // Event delegation for symptom severity buttons (data-group / data-value pattern)
  // One listener on the parent container catches clicks and keyboard activation
  const formArea = document.getElementById('form-area');
  formArea.addEventListener('click', (e) => {
    const btn = e.target.closest('.sev-btn');
    if (btn) selectOption(btn);
  });
  formArea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const btn = e.target.closest('.sev-btn');
      if (btn) { e.preventDefault(); selectOption(btn); }
    }
  });
});