/**
 * add-badges.js — Add Badge Page Logic
 * Allows parents to create achievement badges for their children.
 * Badge achievement is checked automatically when a child views their badges page.
 */

// Update hint text when criteria type changes
document.getElementById('criteria-type').addEventListener('change', (e) => {
  const hints = {
    technique_sessions: 'Number of inhaler technique sessions the child must complete',
    controller_adherence: 'Number of months with 80%+ controller medication adherence'
  };
  document.getElementById('criteria-hint').textContent = hints[e.target.value] || '';
});

document.getElementById('badge-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const childId       = parseInt(document.getElementById('child-select').value);
  const badgeName     = document.getElementById('badge-name').value.trim();
  const badgeDescription = document.getElementById('badge-desc').value.trim();
  const criteriaType  = document.getElementById('criteria-type').value;
  const criteriaValue = parseInt(document.getElementById('criteria-value').value);
  const errEl         = document.getElementById('error-msg');

  errEl.classList.add('hidden');

  if (!childId)                          { errEl.textContent = 'Please select a child'; errEl.classList.remove('hidden'); errEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  if (!badgeName || !badgeDescription)   { errEl.textContent = 'Name and description are required'; errEl.classList.remove('hidden'); errEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  if (isNaN(criteriaValue) || criteriaValue < 1) { errEl.textContent = 'Target must be a positive number'; errEl.classList.remove('hidden'); errEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }

  const saveBtn = document.querySelector('#badge-form button[type="submit"]');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

  try {
    const result = await window.electronAPI.createBadge({ childId, badgeName, badgeDescription, criteriaType, criteriaValue });

    if (result.success) {
      showToast('Badge created!', 'success');
      document.getElementById('badge-form').reset();
    } else {
      errEl.textContent = result.error || 'Failed to create badge';
      errEl.classList.remove('hidden');
      errEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  } catch (err) {
    console.error('Failed to create badge:', err);
    showToast('Something went wrong. Please try again.', 'error');
  }

  if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '🏅 Create Badge'; }
});

async function initializePage() {
  try {
    const session = await window.electronAPI.getSession();
    if (!session || !session.userId) { window.electronAPI.navigate('landing'); return; }
    const children = await window.electronAPI.getChildren();
    const select = document.getElementById('child-select');
    select.innerHTML = '<option value="">— Select a child —</option>';
    children.forEach(c => {
      const o = document.createElement('option');
      o.value = c.child_id; o.textContent = c.name; select.appendChild(o);
    });
  } catch (err) {
    console.error('Failed to initialize add-badges page:', err);
    showToast('Could not load page data. Please go back and try again.', 'error');
  }
}
document.addEventListener('DOMContentLoaded', () => {
  initializePage();
  document.getElementById('back-btn').addEventListener('click', () => window.electronAPI.navigate('parent-main'));
});
