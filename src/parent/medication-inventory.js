// medication-inventory.js — Medication Inventory Page
//
// Layout: medications shown as horizontal bars (name left, child right).
// Clicking a bar reveals a detail panel below it with stats + edit button.
// Inactive medications are hidden by default; a toggle reveals them.

let allMedications   = [];
let selectedMedId    = null;  // ID of the currently expanded medication
let showInactive     = false; // Whether to show inactive medications

/** Escape HTML special characters to prevent XSS */
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ── Navigate to add/edit page ── */
function addMedication() {
  window.electronAPI.navigate('parent-new-medication', { editMode: false });
}

function editMedication(medicationId) {
  window.electronAPI.navigate('parent-new-medication', { editMode: true, medicationId });
}

/* ── Build expiry info for a medication ── */
function getExpiryInfo(med) {
  const expiryDate      = new Date(med.expiration_date);
  const today           = new Date();
  const daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
  const isExpired       = daysUntilExpiry <= 0;
  const isExpiringSoon  = !isExpired && daysUntilExpiry <= 30;

  let expiryText, expiryClass, warningIcon;
  if (isExpired) {
    expiryText  = `⚠️ EXPIRED (${med.expiration_date})`;
    expiryClass = 'expired';
    warningIcon = '⚠️';
  } else if (isExpiringSoon) {
    expiryText  = `⚠️ Expires in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? '' : 's'} (${med.expiration_date})`;
    expiryClass = 'expiring-soon';
    warningIcon = '⚠️';
  } else {
    expiryText  = `Expires ${med.expiration_date}`;
    expiryClass = '';
    warningIcon = '';
  }

  const dosesClass    = med.doses_remaining <= 20 ? 'low-doses' : '';
  const dosesWarning  = med.doses_remaining <= 20 ? '🔴' : '';

  return { expiryText, expiryClass, warningIcon, dosesClass, dosesWarning };
}

/* ── Render the full medication list ── */
function renderMedications(meds) {
  const container = document.getElementById('med-list');

  /* ── Empty state ── */
  if (meds.length === 0) {
    container.innerHTML = `
      <div class="empty-block">
        <div class="empty-icon" aria-hidden="true">💊</div>
        <div class="empty-title">No medications yet</div>
        <p class="empty-sub">Tap <strong>+ Add New</strong> to add a rescue or controller medication.</p>
        <button class="btn btn-primary" id="empty-add-btn" type="button">+ Add New Medication</button>
      </div>`;
    document.getElementById('empty-add-btn').addEventListener('click', addMedication);
    return;
  }

  container.innerHTML = '';

  /* Section label above the list */
  const activeCount = meds.filter(m => m.is_active).length;
  const inactiveCount = meds.filter(m => !m.is_active).length;
  const label = document.createElement('div');
  label.className = 'list-section-label';
  label.textContent = `${activeCount} medication${activeCount !== 1 ? 's' : ''}` +
    (inactiveCount > 0 && showInactive ? ` (${inactiveCount} inactive)` : '');
  container.appendChild(label);

  meds.forEach(med => {
    const { expiryText, expiryClass, warningIcon, dosesClass, dosesWarning } = getExpiryInfo(med);
    const typeClass = med.is_rescue ? 'rescue' : 'controller';
    const typeLabel = med.is_rescue ? '🚑 Rescue' : '💊 Controller';
    const isSelected = (med.medication_id === selectedMedId);
    const isInactive = !med.is_active;

    /* ── Bar element ── */
    const bar = document.createElement('div');
    bar.className = 'med-bar' + (isSelected ? ' selected' : '') + (isInactive ? ' inactive' : '');
    bar.dataset.medId = med.medication_id;
    bar.setAttribute('role', 'button');
    bar.setAttribute('tabindex', '0');
    bar.setAttribute('aria-label', `${med.medication_name}, ${med.is_rescue ? 'rescue' : 'controller'}${isInactive ? ', inactive' : ''}. Click to ${isSelected ? 'collapse' : 'expand'} details.`);
    bar.setAttribute('aria-expanded', isSelected ? 'true' : 'false');
    bar.innerHTML = `
      <div class="med-bar-left">
        <span class="med-bar-icon" aria-hidden="true">\u{1F48A}</span>
        <span class="med-bar-name" title="${escapeHtml(med.medication_name)}">${escapeHtml(med.medication_name)}</span>
        <span class="med-type-badge ${typeClass}">${typeLabel}</span>
        ${isInactive ? '<span class="med-inactive-badge">Inactive</span>' : ''}
      </div>
      <div class="med-bar-right">
        ${warningIcon || dosesWarning ? `<span class="med-bar-warning">${warningIcon || dosesWarning}</span>` : ''}
        ${med.child_name ? `<span class="med-bar-child"><span aria-hidden="true">\u{1F466}</span> ${escapeHtml(med.child_name)}</span>` : ''}
        <span class="med-bar-chevron" aria-hidden="true">\u25BC</span>
      </div>
    `;
    container.appendChild(bar);

    /* ── Detail panel (only shown when this bar is selected) ── */
    if (isSelected) {
      const detail = document.createElement('div');
      detail.className = 'med-detail-panel';
      const toggleLabel = isInactive ? 'Reactivate' : 'Deactivate';
      const toggleIcon  = isInactive ? '✅' : '🚫';
      detail.innerHTML = `
        <div class="med-detail-body">

          <div class="med-stats">
            <div class="med-stat">
              <div class="med-stat-label">Doses Remaining</div>
              <div class="med-stat-value ${dosesClass}">${med.doses_remaining}</div>
            </div>
            <div class="med-stat">
              <div class="med-stat-label">Expiry</div>
              <div class="med-stat-value ${expiryClass}" style="font-size:var(--font-size-sm);">${expiryText}</div>
            </div>
            <div class="med-stat">
              <div class="med-stat-label">Purchase Date</div>
              <div class="med-stat-value" style="font-size:0.875rem;">${med.purchase_date || '—'}</div>
            </div>
            <div class="med-stat">
              <div class="med-stat-label">Type</div>
              <div class="med-stat-value" style="font-size:0.875rem;">${med.is_rescue ? 'Rescue' : 'Controller'}</div>
            </div>
          </div>

          ${med.child_name ? `<div class="med-child-row"><span aria-hidden="true">\u{1F466}</span> Assigned to: <strong>${escapeHtml(med.child_name)}</strong></div>` : ''}
          ${med.notes      ? `<div class="med-notes">${escapeHtml(med.notes)}</div>` : ''}

          <div class="med-action-row">
            <button class="med-edit-btn" type="button" data-edit-medication-id="${med.medication_id}"
                    aria-label="Edit ${escapeHtml(med.medication_name)}">
              ✏️ Edit Medication
            </button>
            <button class="med-toggle-btn ${isInactive ? 'reactivate' : 'deactivate'}" type="button"
                    data-toggle-med-id="${med.medication_id}" data-toggle-active="${isInactive ? '1' : '0'}"
                    aria-label="${toggleLabel} ${escapeHtml(med.medication_name)}">
              ${toggleIcon} ${toggleLabel}
            </button>
          </div>
        </div>
      `;
      container.appendChild(detail);
    }
  });
}

/* ── Toggle selection: clicking the same bar collapses it; clicking another expands it ── */
function handleBarClick(medicationId) {
  if (selectedMedId === medicationId) {
    selectedMedId = null;  // collapse
  } else {
    selectedMedId = medicationId;  // expand new
  }
  renderMedications(allMedications);
}

/* ── Toggle active/inactive status ── */
async function handleToggleActive(medicationId, newActive) {
  const med = allMedications.find(m => m.medication_id === medicationId);
  const medName = med ? med.medication_name : 'this medication';

  // Deactivating requires confirmation; reactivating does not
  if (!newActive) {
    const confirmed = await showConfirm(
      `Are you sure you want to deactivate "${medName}"?\n\nIt will no longer appear in dose tracking or schedules.`,
      'Yes, deactivate',
      'Cancel'
    );
    if (!confirmed) return;
  }

  // Show loading state on the toggle button
  const toggleBtn = document.querySelector(`[data-toggle-med-id="${medicationId}"]`);
  if (toggleBtn) {
    toggleBtn.disabled = true;
    toggleBtn.textContent = newActive ? 'Reactivating…' : 'Deactivating…';
  }

  await window.electronAPI.setMedicationActive({ medicationId, isActive: !!newActive });
  allMedications = await window.electronAPI.getAllMedications({ includeInactive: showInactive });
  renderMedications(allMedications);

  showToast(newActive ? `${medName} reactivated` : `${medName} deactivated`, 'success');
}

async function initializePage() {
  const session = await window.electronAPI.getSession();
  if (!session || !session.userId) { window.electronAPI.navigate('landing'); return; }
  allMedications = await window.electronAPI.getAllMedications({ includeInactive: showInactive });
  renderMedications(allMedications);
}

document.addEventListener('DOMContentLoaded', () => {
  initializePage();

  document.getElementById('back-btn').addEventListener('click', () => window.electronAPI.navigate('parent-main'));
  document.getElementById('add-medication-btn').addEventListener('click', addMedication);

  /* Show Inactive toggle */
  document.getElementById('show-inactive-toggle').addEventListener('change', async (e) => {
    const toggle = e.target;
    toggle.disabled = true;
    showInactive = toggle.checked;
    allMedications = await window.electronAPI.getAllMedications({ includeInactive: showInactive });
    selectedMedId = null;
    renderMedications(allMedications);
    toggle.disabled = false;
  });

  /* Event delegation: handle clicks on bars, edit buttons, and toggle buttons */
  document.getElementById('med-list').addEventListener('click', (e) => {
    // Check if toggle active button was clicked
    const toggleBtn = e.target.closest('[data-toggle-med-id]');
    if (toggleBtn) {
      handleToggleActive(parseInt(toggleBtn.dataset.toggleMedId), parseInt(toggleBtn.dataset.toggleActive));
      return;
    }

    // Check if an edit button was clicked
    const editBtn = e.target.closest('[data-edit-medication-id]');
    if (editBtn) {
      editMedication(parseInt(editBtn.dataset.editMedicationId));
      return;
    }

    // Check if a medication bar was clicked
    const bar = e.target.closest('.med-bar');
    if (bar) {
      handleBarClick(parseInt(bar.dataset.medId));
    }
  });

  /* Keyboard accessibility: allow Enter/Space on bars */
  document.getElementById('med-list').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const bar = e.target.closest('.med-bar');
      if (bar) {
        e.preventDefault();
        handleBarClick(parseInt(bar.dataset.medId));
      }
    }
  });
});
