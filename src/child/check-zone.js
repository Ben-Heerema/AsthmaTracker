/**
 * check-zone.js — Check Zone Page Logic
 *
 * Child enters their peak flow reading.
 * The app calculates their zone (green/yellow/red) using personal best PEF.
 *
 * IMPORTANT: When a child enters PEF here, it IS treated as a child submission
 * (isChildSubmission: true). If they are in the red zone, main.js automatically
 * sends a notification to their parent.
 *
 * Zone definitions:
 *   Green  (>= 80% of personal best) — Well controlled
 *   Yellow (50-79%)                   — Caution
 *   Red    (< 50%)                    — Emergency
 *   Grey   (no personal best set)     — Cannot calculate
 */

let childId = null;
let checkBusy = false;

const ZONE_CONFIG = {
  green: {
    message: 'Your breathing is great today! 😊',
    instructions: 'You are in the Green Zone. Continue taking your medications as usual.',
    instructionsBg: '#C8E6C9',
    showEmergency: false
  },
  yellow: {
    message: 'Your breathing needs attention today.',
    instructions: 'You are in the Yellow Zone. Take your rescue inhaler and tell an adult how you feel. If it does not improve, move to the Red Zone plan.',
    instructionsBg: '#FFE0B2',
    showEmergency: true
  },
  red: {
    message: 'This is a medical emergency. Act now!',
    instructions: 'You are in the RED Zone. Take your rescue inhaler RIGHT NOW and tell an adult immediately. Call 911 if you cannot breathe.',
    instructionsBg: '#FFCDD2',
    showEmergency: true
  },
  grey: {
    message: 'Cannot calculate your zone.',
    instructions: 'Ask your parent to set your personal best PEF value so the app can calculate your zone.',
    instructionsBg: '#EEEEEE',
    showEmergency: false
  }
};

async function checkZone() {
  if (checkBusy) return;

  const pefValue = parseFloat(document.getElementById('pef-input').value);

  if (isNaN(pefValue) || pefValue <= 0 || pefValue > 900) {
    showToast('Please enter a peak flow number between 1 and 900', 'error');
    return;
  }

  checkBusy = true;
  const btn = document.getElementById('check-zone-btn');
  btn.disabled = true;
  btn.textContent = 'Checking…';

  try {
    // Submit PEF to database (isChildSubmission: true triggers parent notification if red)
    await window.electronAPI.submitPef({
      childId,
      dailyPef:         pefValue,
      preMedPef:        null,
      postMedPef:       null,
      isChildSubmission: true
    });

    // Calculate zone
    const result = await window.electronAPI.calculateZone(childId);
    const config = ZONE_CONFIG[result.zone] || ZONE_CONFIG.grey;

    // Show the result
    document.getElementById('pef-form').classList.add('hidden');
    document.getElementById('zone-result').classList.remove('hidden');

    // Update zone badge colour and text
    const circle = document.getElementById('zone-circle');
    circle.className = 'zone-badge zone-' + result.zone;
    const zoneName = result.zone.charAt(0).toUpperCase() + result.zone.slice(1) + ' Zone';
    document.getElementById('zone-label').textContent = zoneName;
    const pctText = result.percentage ? result.percentage + '% of personal best' : '';
    document.getElementById('zone-pct').textContent = pctText;
    circle.setAttribute('aria-label', zoneName + (pctText ? ' — ' + pctText : ''));

    document.getElementById('zone-message').textContent = config.message;

    // Instruction box — swap class to match zone colour
    const instrEl = document.getElementById('zone-instructions');
    instrEl.textContent = config.instructions;
    instrEl.className   = 'zone-instructions-box zone-' + result.zone;

    // Show/hide Emergency button based on zone severity
    document.getElementById('emergency-btn').style.display =
      config.showEmergency ? 'block' : 'none';

    // Move focus to the zone result for screen readers
    circle.setAttribute('tabindex', '-1');
    circle.focus();
  } catch (err) {
    console.error('Failed to check zone:', err);
    showToast('Something went wrong while checking your zone. Please try again.', 'error');
  } finally {
    checkBusy = false;
    btn.disabled = false;
    btn.textContent = 'Check My Zone';
  }
}

function checkAgain() {
  document.getElementById('zone-result').classList.add('hidden');
  document.getElementById('pef-form').classList.remove('hidden');
  document.getElementById('pef-input').value = '';
  document.getElementById('pef-input').focus();
}

async function initializePage() {
  try {
    const session = await window.electronAPI.getSession();
    if (!session || !session.childId) { window.electronAPI.navigate('landing'); return; }
    childId = session.childId;
  } catch (err) {
    console.error('Failed to initialize check-zone page:', err);
    showToast('Could not load this page. Please go back and try again.', 'error');
  }
}
document.addEventListener('DOMContentLoaded', () => {
  initializePage();
  document.getElementById('back-btn').addEventListener('click', () => window.electronAPI.navigate('child-main'));
  document.getElementById('check-zone-btn').addEventListener('click', checkZone);
  document.getElementById('emergency-btn').addEventListener('click', () => window.electronAPI.navigate('emergency'));
  document.getElementById('check-again-btn').addEventListener('click', checkAgain);
});
