// new-medication.js — Add/Edit Medication Page
let editMode = false;
let editMedicationId = null;

document.getElementById('med-name').addEventListener('input', (e) => {
  document.getElementById('name-count').textContent = e.target.value.length;
});
document.getElementById('med-notes').addEventListener('input', (e) => {
  document.getElementById('notes-count').textContent = e.target.value.length;
});

document.getElementById('med-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const childId = parseInt(document.getElementById('child-select').value);
  const medicationName = document.getElementById('med-name').value.trim();
  const purchaseDate = document.getElementById('purchase-date').value;
  const expirationDate = document.getElementById('expiry-date').value;
  const dosesRemaining = parseInt(document.getElementById('doses-remaining').value);
  const isRescue = document.querySelector('input[name="is-rescue"]:checked').value === '1';
  const notes = document.getElementById('med-notes').value.trim() || null;
  const errEl = document.getElementById('form-error');

  if (!childId || !medicationName || !purchaseDate || !expirationDate || isNaN(dosesRemaining)) {
    errEl.textContent = 'Please fill in all required fields'; errEl.classList.remove('hidden'); return;
  }
  if (expirationDate <= purchaseDate) {
    errEl.textContent = 'Expiration date must be after purchase date'; errEl.classList.remove('hidden'); return;
  }
  errEl.classList.add('hidden');

  const saveBtn = document.getElementById('save-btn');
  const originalLabel = saveBtn.textContent;
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  try {
    let result;
    if (editMode) {
      result = await window.electronAPI.updateMedication({ medicationId: editMedicationId, medicationName, isRescue, purchaseDate, expirationDate, dosesRemaining, notes });
    } else {
      result = await window.electronAPI.addMedication({ childId, medicationName, isRescue, purchaseDate, expirationDate, dosesRemaining, notes });
    }

    if (result.success) {
      const msg = editMode
        ? `Successfully updated ${medicationName}!`
        : `Successfully added ${medicationName}!`;
      showSuccess(msg, '← Back to Inventory', () => window.electronAPI.navigate('parent-medication-inventory'));
    } else {
      saveBtn.disabled = false;
      saveBtn.textContent = originalLabel;
      errEl.textContent = result.error || 'Failed to save medication';
      errEl.classList.remove('hidden');
      errEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  } catch (err) {
    console.error('Failed to save medication:', err);
    showToast('Something went wrong. Please try again.', 'error');
    saveBtn.disabled = false;
    saveBtn.textContent = originalLabel;
  }
});

async function initializePage() {
  try {
    const session = await window.electronAPI.getSession();
    if (!session || !session.userId) { window.electronAPI.navigate('landing'); return; }
    const navData = await window.electronAPI.getNavigationData();
    const children = await window.electronAPI.getChildren();
    const select = document.getElementById('child-select');
    select.innerHTML = '<option value="">&#8212; Select child &#8212;</option>';
    children.forEach(c => { const o=document.createElement('option'); o.value=c.child_id; o.textContent=c.name; select.appendChild(o); });

    if (navData && navData.editMode) {
      editMode = true;
      editMedicationId = navData.medicationId;
      document.getElementById('page-title').textContent = 'Edit Medication';
      document.getElementById('save-btn').textContent = 'Update Medication';
      // Lock child selector when editing
      select.disabled = true;
      const med = await window.electronAPI.getMedication(navData.medicationId);
      if (med) {
        select.value = med.child_id;
        document.getElementById('med-name').value = med.medication_name;
        document.getElementById('name-count').textContent = med.medication_name.length;
        document.getElementById('purchase-date').value = med.purchase_date;
        document.getElementById('expiry-date').value = med.expiration_date;
        document.getElementById('doses-remaining').value = med.doses_remaining;
        document.getElementById(med.is_rescue ? 'rescue-yes' : 'rescue-no').checked = true;
        if (med.notes) { document.getElementById('med-notes').value = med.notes; document.getElementById('notes-count').textContent = med.notes.length; }
      }
    }
  } catch (err) {
    console.error('Failed to initialize medication page:', err);
    showToast('Could not load page data. Please try again.', 'error');
  }
}
document.addEventListener('DOMContentLoaded', () => {
  initializePage();
  document.getElementById('back-btn').addEventListener('click', () => window.electronAPI.navigate('parent-medication-inventory'));
});
