/** Escape HTML special characters to prevent XSS from database content */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/**
 * take-medication.js — Take Medication Page Logic
 *
 * 4-step guided flow:
 *   Step 1: Select which medication
 *   Step 2: Select number of doses (1–10)
 *   Step 3: Rate breathing BEFORE taking medication (0=Very Bad to 4=Very Good)
 *   Step 4: Rate breathing AFTER taking medication
 *
 * After logging:
 *   - Doses remaining decrements in the database
 *   - If breathing declined or stayed bad, parent gets a notification
 */

// Breathing option definitions: value, emoji, label
const BREATHING_OPTIONS = [
  { value: 0, emoji: '😰', label: 'Very Bad' },
  { value: 1, emoji: '😟', label: 'Bad' },
  { value: 2, emoji: '😐', label: 'Normal' },
  { value: 3, emoji: '🙂', label: 'Good' },
  { value: 4, emoji: '😀', label: 'Very Good' }
];

let selectedMedicationId = null;
let selectedDoses        = 1;
let selectedBefore       = null;
let selectedAfter        = null;
let childId              = null;

/** Show a card / hide another card (for step transitions) */
function goBack(showId, hideId) {
  document.getElementById(showId).classList.remove('hidden');
  document.getElementById(hideId).classList.add('hidden');
}

/** Build breathing option buttons inside a container element */
function buildBreathingOptions(containerId, onSelect) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  BREATHING_OPTIONS.forEach(opt => {
    const btn = document.createElement('button');
    btn.className     = 'tm-breathing-btn';
    btn.type          = 'button';
    btn.dataset.value = opt.value;
    btn.innerHTML = `
      <span class="tm-breathing-emoji">${opt.emoji}</span>
      <span class="tm-breathing-label">${opt.label}</span>
    `;
    btn.addEventListener('click', () => {
      // Remove selected from siblings
      container.querySelectorAll('.tm-breathing-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      onSelect(opt.value);
    });
    container.appendChild(btn);
  });
}

/** Increase/decrease dose count (clamped 1–10) */
function changeDoses(delta) {
  selectedDoses = Math.max(1, Math.min(10, selectedDoses + delta));
  document.getElementById('doses-display').textContent = selectedDoses;
}

/** Move from Step 2 (doses) to Step 3 (breathing before) */
function goToBreathing() {
  document.getElementById('step-doses').classList.add('hidden');
  document.getElementById('step-before').classList.remove('hidden');
}

/**
 * selectMedication — Called when the user taps a medication card.
 */
function selectMedication(medId) {
  selectedMedicationId = medId;
  document.getElementById('step-medication').classList.add('hidden');
  document.getElementById('step-doses').classList.remove('hidden');
  selectedDoses = 1;
  document.getElementById('doses-display').textContent = '1';
}

/**
 * Load child's medications and render them as selectable cards.
 */
async function loadMedications() {
  try {
    const meds      = await window.electronAPI.getMedications(childId);
    const container = document.getElementById('med-list');

    if (meds.length === 0) {
      container.innerHTML = `
        <div class="tm-empty">
          <span class="tm-empty-icon">💊</span>
          <p>No medications added yet.</p>
          <p>Ask your parent to add your medications.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = '';
    meds.forEach(med => {
      const badgeClass = med.is_rescue ? 'tm-badge-rescue' : 'tm-badge-controller';
      const badgeLabel = med.is_rescue ? 'Rescue' : 'Controller';

      const btn = document.createElement('button');
      btn.type      = 'button';
      btn.className = 'tm-med-item';
      btn.setAttribute('aria-label', `Take ${med.medication_name}, ${badgeLabel}, ${med.doses_remaining} doses remaining`);
      btn.innerHTML = `
        <span class="tm-med-icon">💊</span>
        <div style="flex:1">
          <div class="tm-med-name">${escapeHtml(med.medication_name)}</div>
          <div class="tm-med-sub">
            ${med.doses_remaining} doses remaining &nbsp;·&nbsp;
            <span class="tm-badge ${badgeClass}">${badgeLabel}</span>
          </div>
        </div>
        <span class="tm-med-arrow">›</span>
      `;
      btn.addEventListener('click', () => selectMedication(med.medication_id));
      container.appendChild(btn);
    });
  } catch (err) {
    console.error('Failed to load medications:', err);
    const container = document.getElementById('med-list');
    container.innerHTML = `
      <div class="tm-empty">
        <span class="tm-empty-icon">⚠️</span>
        <p>Could not load medications.</p>
        <p>Please go back and try again.</p>
      </div>
    `;
  }
}

/**
 * submitLog — Called when user selects their breathing AFTER medication.
 * Submits the full log to the database.
 */
let submitBusy = false;
async function submitLog(afterValue) {
  if (submitBusy) return; // prevent double-submission
  if (!selectedMedicationId) {
    showToast('No medication selected. Please go back and select one.', 'error');
    return;
  }
  submitBusy = true;
  selectedAfter = afterValue;
  document.getElementById('step-after').classList.add('hidden');

  try {
    const result = await window.electronAPI.logMedication({
      childId,
      medicationId:   selectedMedicationId,
      dosesTaken:     selectedDoses,
      breathingBefore: selectedBefore,
      breathingAfter:  selectedAfter
    });

    if (result.breathingDeclined) {
      document.getElementById('decline-warning').classList.remove('hidden');
    }

    document.getElementById('success-screen').classList.remove('hidden');
    submitBusy = false;
  } catch (err) {
    console.error('Failed to log medication:', err);
    showToast('Could not save your medication log. Please try again.', 'error');
    // Show the after step again so the user can retry
    document.getElementById('step-after').classList.remove('hidden');
    submitBusy = false;
  }
}

/**
 * Page initialization.
 */
async function initializePage() {
  try {
    const session = await window.electronAPI.getSession();
    if (!session || !session.childId) { window.electronAPI.navigate('landing'); return; }
    childId = session.childId;

    await loadMedications();

    // Build breathing selection UI for "before" step
    buildBreathingOptions('before-options', (value) => {
      selectedBefore = value;
      // Move to next step after a short delay so the selection animation is visible
      setTimeout(() => {
        document.getElementById('step-before').classList.add('hidden');
        document.getElementById('step-after').classList.remove('hidden');
      }, 300);
    });

    // Build breathing selection UI for "after" step
    buildBreathingOptions('after-options', (value) => {
      submitLog(value);
    });
  } catch (err) {
    console.error('Failed to initialize take-medication page:', err);
    showToast('Could not load this page. Please go back and try again.', 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initializePage();
  document.getElementById('back-btn').addEventListener('click', () => window.electronAPI.navigate('child-main'));
  document.getElementById('doses-minus-btn').addEventListener('click', () => changeDoses(-1));
  document.getElementById('doses-plus-btn').addEventListener('click', () => changeDoses(1));
  document.getElementById('go-to-breathing-btn').addEventListener('click', goToBreathing);
  document.getElementById('back-to-medication-btn').addEventListener('click', () => goBack('step-medication', 'step-doses'));
  document.getElementById('back-to-doses-btn').addEventListener('click', () => goBack('step-doses', 'step-before'));
  document.getElementById('back-to-before-btn').addEventListener('click', () => goBack('step-before', 'step-after'));
  document.getElementById('success-home-btn').addEventListener('click', () => window.electronAPI.navigate('child-main'));
});
