/**
 * set-personal-best.js — Set Personal Best PEF
 *
 * The child's personal best PEF is the highest reading they ever achieved
 * when fully healthy. It is used to calculate zone percentages:
 *   Green  = ≥80% of personal best
 *   Yellow = 50–79%
 *   Red    = <50%
 *
 * The form is hidden and the Save button is disabled until a child is selected.
 */

async function loadPersonalBest() {
  const childId = document.getElementById('child-select').value;

  if (!childId) {
    // No child chosen — hide form, show prompt, disable save
    document.getElementById('pb-section').classList.add('hidden');
    document.getElementById('no-child-prompt').classList.remove('hidden');
    document.getElementById('save-pb-btn').disabled = true;
    return;
  }

  // Child selected — show form, hide prompt, enable save
  document.getElementById('pb-section').classList.remove('hidden');
  document.getElementById('no-child-prompt').classList.add('hidden');
  document.getElementById('save-pb-btn').disabled = false;

  const child = await window.electronAPI.getChild(parseInt(childId));
  document.getElementById('pb-value').value = (child && child.personal_best_pef) ? child.personal_best_pef : '';
}

async function savePersonalBest() {
  const childId = parseInt(document.getElementById('child-select').value);
  const value   = parseFloat(document.getElementById('pb-value').value);

  if (!childId || isNaN(value) || value <= 0 || value > 900) {
    showToast('Please enter a PEF value between 1 and 900 L/min', 'error');
    return;
  }

  const btn = document.getElementById('save-pb-btn');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  await window.electronAPI.setPersonalBest({ childId, personalBestPef: value });

  btn.disabled = false;
  btn.textContent = '💾 Save Personal Best';

  const msg = document.getElementById('success-msg');
  msg.classList.remove('hidden');
  setTimeout(() => msg.classList.add('hidden'), 3000);
}

async function initializePage() {
  const session = await window.electronAPI.getSession();
  if (!session || !session.userId) { window.electronAPI.navigate('landing'); return; }

  const navData  = await window.electronAPI.getNavigationData();
  const children = await window.electronAPI.getChildren();
  const select   = document.getElementById('child-select');

  select.innerHTML = '<option value="">— Select a child —</option>';
  children.forEach(c => {
    const o = document.createElement('option');
    o.value = c.child_id;
    o.textContent = c.name;
    select.appendChild(o);
  });

  if (navData && navData.childId) {
    select.value = navData.childId;
    loadPersonalBest();
  } else {
    document.getElementById('save-pb-btn').disabled = true;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initializePage();
  document.getElementById('back-btn').addEventListener('click', () => window.electronAPI.navigate('parent-main'));
  document.getElementById('child-select').addEventListener('change', loadPersonalBest);
  document.getElementById('save-pb-btn').addEventListener('click', savePersonalBest);
});