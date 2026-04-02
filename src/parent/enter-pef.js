/**
 * enter-pef.js — Enter PEF Page (Parent view)
 *
 * Allows a parent to manually enter Peak Expiratory Flow readings.
 * NOTE: PEF entered here does NOT trigger red-zone notifications
 *       (isChildSubmission = false). Use the child's "Check Zone" screen for that.
 *
 * If the entered Daily PEF exceeds the child's current personal best, a
 * confirmation dialog is shown. If confirmed, the personal best is updated.
 *
 * The form is hidden and Save is disabled until a child is selected.
 */

// Track where we came from so the back button can return to the right page.
// When opened from Today's Zone, back should return there (not parent-main)
// so the user sees their freshly-saved zone result immediately.
let cameFromZone = false;
let savedChildId = null;
let currentChildData = null; // holds the child record (including personal_best_pef)

function onChildSelected() {
  const childId = document.getElementById('child-select').value;
  const hasChild = !!childId;
  // Show/hide the form and the "select a child" prompt
  document.getElementById('form-area').classList.toggle('hidden', !hasChild);
  document.getElementById('no-child-prompt').classList.toggle('hidden', hasChild);
  document.getElementById('save-pef-btn').disabled = !hasChild;

  // Load child data so we can check personal best on save
  if (hasChild) {
    window.electronAPI.getChild(parseInt(childId)).then(child => {
      currentChildData = child;
      // Update the personal best hint if present
      const pbHint = document.getElementById('pb-hint');
      if (pbHint && child && child.personal_best_pef) {
        pbHint.textContent = `Current personal best: ${child.personal_best_pef} L/min`;
        pbHint.classList.remove('hidden');
      } else if (pbHint) {
        pbHint.textContent = 'No personal best set yet.';
        pbHint.classList.remove('hidden');
      }
    }).catch(err => {
      console.error('Failed to load child data:', err);
      currentChildData = null;
    });
  } else {
    currentChildData = null;
  }
}

async function savePef() {
  const childId    = parseInt(document.getElementById('child-select').value);
  const dailyPef   = parseFloat(document.getElementById('daily-pef').value)    || null;
  const preMedPef  = parseFloat(document.getElementById('pre-med-pef').value)  || null;
  const postMedPef = parseFloat(document.getElementById('post-med-pef').value) || null;

  if (!childId) { showToast('Please select a child', 'error'); return; }
  if (!dailyPef && !preMedPef && !postMedPef) {
    showToast('Please enter at least one PEF reading', 'error');
    return;
  }

  // Validate PEF range (clinically reasonable: 1–900 L/min)
  const pefValues = [dailyPef, preMedPef, postMedPef].filter(v => v !== null);
  if (pefValues.some(v => v <= 0 || v > 900)) {
    showToast('PEF values must be between 1 and 900 L/min', 'error');
    return;
  }

  // ── Check if Daily PEF exceeds the child's personal best ──
  // If it does, ask the parent to confirm whether this should become the new PB
  let shouldUpdatePB = false;
  if (dailyPef && currentChildData) {
    const currentPB = currentChildData.personal_best_pef;
    if (!currentPB || dailyPef > currentPB) {
      const pbMsg = currentPB
        ? `The Daily PEF you entered (${dailyPef} L/min) is higher than ${currentChildData.name}'s current personal best (${currentPB} L/min).

Would you like to update their personal best to ${dailyPef} L/min?`
        : `No personal best has been set for ${currentChildData.name} yet.

Would you like to set their personal best to ${dailyPef} L/min?`;
      shouldUpdatePB = await showConfirm(pbMsg, 'Yes, update it', 'No thanks');
    }
  }

  const btn = document.getElementById('save-pef-btn');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  // isChildSubmission = false → no red-zone push notification
  const result = await window.electronAPI.submitPef({
    childId, dailyPef, preMedPef, postMedPef, isChildSubmission: false
  });

  // If user confirmed PB update, set the new personal best
  if (shouldUpdatePB && dailyPef) {
    await window.electronAPI.setPersonalBest({ childId, personalBestPef: dailyPef });
    // Update our local copy so the hint stays correct
    if (currentChildData) currentChildData.personal_best_pef = dailyPef;
    const pbHint = document.getElementById('pb-hint');
    if (pbHint) pbHint.textContent = `Current personal best: ${dailyPef} L/min`;
  }

  btn.disabled = false;
  btn.textContent = '💾 Save PEF';

  if (result.success) {
    const select = document.getElementById('child-select');
    const childName = select.options[select.selectedIndex].text;
    const pefDisplay = dailyPef ? `${dailyPef} L/min` : 'readings';
    showSuccess(
      `Successfully recorded PEF ${pefDisplay} for ${childName}!`,
      cameFromZone ? '← Back to Today\'s Zone' : '← Back to Home',
      () => {
        if (cameFromZone) {
          const cId = parseInt(select.value) || savedChildId;
          window.electronAPI.navigate('parent-todays-zone', { childId: cId });
        } else {
          window.electronAPI.navigate('parent-main');
        }
      }
    );
  } else {
    showToast(result.error || 'Failed to save PEF. Please try again.', 'error');
  }
}

async function initializePage() {
  const session = await window.electronAPI.getSession();
  if (!session || !session.userId) { window.electronAPI.navigate('landing'); return; }

  const navData  = await window.electronAPI.getNavigationData();
  const children = await window.electronAPI.getChildren();
  const select   = document.getElementById('child-select');

  // Remember if we came from Today's Zone (fromZone flag set by todays-zone.js)
  cameFromZone = !!(navData && navData.fromZone);

  select.innerHTML = '<option value="">— Select a child —</option>';
  children.forEach(c => {
    const o = document.createElement('option');
    o.value = c.child_id;
    o.textContent = c.name;
    select.appendChild(o);
  });

  if (navData && navData.childId) {
    select.value = navData.childId;
    savedChildId = navData.childId;  // keep a copy for the back button
    onChildSelected();
  } else {
    document.getElementById('save-pef-btn').disabled = true;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initializePage();

  document.getElementById('back-btn').addEventListener('click', () => {
    // If we came from Today's Zone, return there with childId so it auto-loads
    // the updated zone without the user having to re-select the child.
    if (cameFromZone) {
      const childId = parseInt(document.getElementById('child-select').value) || savedChildId;
      window.electronAPI.navigate('parent-todays-zone', { childId });
    } else {
      window.electronAPI.navigate('parent-main');
    }
  });

  document.getElementById('child-select').addEventListener('change', onChildSelected);
  document.getElementById('save-pef-btn').addEventListener('click', savePef);
});
