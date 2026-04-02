/**
 * family.js — Family Page Logic
 *
 * Shows all children as expandable bars (like medication inventory).
 * Clicking a bar reveals child details, edit, and login actions.
 */

let allChildren = [];
let selectedChildId = null;  // ID of the currently expanded child
let editingChildId  = null;  // ID of the child currently being edited inline

// Icon map for child avatars
const ICON_MAP = {
  boy_older:    '\u{1F466}',                              // 👦
  boy_younger:  '\u{1F9D2}',                              // 🧒
  girl_older:   '\u{1F467}',                              // 👧
  girl_younger: '\u{1F471}\u{200D}\u{2640}\u{FE0F}',     // 👱‍♀️
  baby:         '\u{1F476}'                               // 👶
};

const ICON_LABELS = {
  boy_older: 'Boy',
  boy_younger: 'Young Boy',
  girl_older: 'Girl',
  girl_younger: 'Young Girl',
  baby: 'Baby'
};

// Tracks which child username the modal is attempting to log into
let selectedChildUsername = null;
let modalOpenerElement = null;

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

/** Calculate age from birthday string */
function calcAge(birthday) {
  const today = new Date();
  const bday  = new Date(birthday);
  return Math.floor((today - bday) / (365.25 * 24 * 60 * 60 * 1000));
}

/** Format birthday for display */
function formatBirthday(dateStr) {
  const d = new Date(dateStr);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/* ── Modal: child login ── */

function openChildLogin(childName, username) {
  selectedChildUsername = username;
  modalOpenerElement = document.activeElement;
  document.getElementById('modal-child-name').textContent = 'Log In as ' + childName;
  document.getElementById('child-password').value = '';
  document.getElementById('modal-error').classList.add('hidden');
  document.getElementById('login-modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('child-password').focus(), 100);
}

function closeModal() {
  document.getElementById('login-modal').classList.add('hidden');
  selectedChildUsername = null;
  if (modalOpenerElement) {
    modalOpenerElement.focus();
    modalOpenerElement = null;
  }
}

async function confirmChildLogin() {
  const password = document.getElementById('child-password').value;
  if (!password) return;

  const loginBtn = document.getElementById('modal-login-btn');
  loginBtn.disabled = true;
  loginBtn.textContent = 'Logging in\u2026';

  try {
    const result = await window.electronAPI.childLogin({
      username: selectedChildUsername,
      password
    });

    if (result.success) {
      closeModal();
      window.electronAPI.navigate('child-main');
    } else {
      loginBtn.disabled = false;
      loginBtn.textContent = 'Log In';
      document.getElementById('modal-error').classList.remove('hidden');
    }
  } catch (err) {
    console.error('Child login failed:', err);
    loginBtn.disabled = false;
    loginBtn.textContent = 'Log In';
    showToast('Something went wrong. Please try again.', 'error');
  }
}

/* ── Render the children list ── */

function renderChildren(children) {
  const container = document.getElementById('child-list');

  if (children.length === 0) {
    container.innerHTML = `
      <div class="empty-block">
        <div class="empty-icon" aria-hidden="true">\u{1F468}\u{200D}\u{1F467}</div>
        <div class="empty-title">No children added yet</div>
        <p class="empty-sub">Tap <strong>+ Add Child</strong> below to create your first child account.</p>
      </div>`;
    return;
  }

  container.innerHTML = '';

  // Section label
  const label = document.createElement('div');
  label.className = 'list-section-label';
  label.textContent = `${children.length} child${children.length !== 1 ? 'ren' : ''}`;
  container.appendChild(label);

  children.forEach(child => {
    const age = calcAge(child.birthday);
    const icon = ICON_MAP[child.icon] || ICON_MAP.boy_older;
    const isSelected = (child.child_id === selectedChildId);
    const isEditing  = (child.child_id === editingChildId);

    /* ── Bar ── */
    const bar = document.createElement('div');
    bar.className = 'child-bar' + (isSelected ? ' selected' : '');
    bar.dataset.childId = child.child_id;
    bar.setAttribute('role', 'button');
    bar.setAttribute('tabindex', '0');
    bar.setAttribute('aria-label', `${child.name}, age ${age}. Click to ${isSelected ? 'collapse' : 'expand'} details.`);
    bar.setAttribute('aria-expanded', isSelected ? 'true' : 'false');
    bar.innerHTML = `
      <div class="child-bar-left">
        <div class="child-bar-icon" aria-hidden="true">${icon}</div>
        <span class="child-bar-name" title="${escapeHtml(child.name)}">${escapeHtml(child.name)}</span>
        <span class="child-age-badge">Age ${age}</span>
      </div>
      <div class="child-bar-right">
        <span class="child-bar-chevron" aria-hidden="true">\u25BC</span>
      </div>
    `;
    container.appendChild(bar);

    /* ── Detail panel (only when selected) ── */
    if (isSelected) {
      const detail = document.createElement('div');
      detail.className = 'child-detail-panel';

      if (isEditing) {
        // ── Inline edit form ──
        detail.innerHTML = `
          <div class="child-detail-body">
            <div class="child-edit-form">
              <div class="form-group">
                <label for="edit-name-${child.child_id}">Full Name</label>
                <input type="text" class="form-input" id="edit-name-${child.child_id}"
                       value="${escapeHtml(child.name)}">
              </div>
              <div class="form-group">
                <label for="edit-birthday-${child.child_id}">Birthday</label>
                <input type="date" class="form-input" id="edit-birthday-${child.child_id}"
                       value="${child.birthday}">
              </div>
              <div class="form-group">
                <label for="edit-notes-${child.child_id}">Medical Notes</label>
                <textarea class="form-textarea" id="edit-notes-${child.child_id}"
                          maxlength="500" placeholder="Optional medical notes...">${escapeHtml(child.notes || '')}</textarea>
              </div>
              <div class="form-group">
                <label>Icon</label>
                <div class="edit-icon-picker" data-child-id="${child.child_id}">
                  ${Object.entries(ICON_MAP).map(([key, emoji]) => `
                    <button type="button" class="edit-icon-option${(child.icon || 'boy_older') === key ? ' selected' : ''}"
                            data-icon="${key}" aria-label="${ICON_LABELS[key]}">${emoji}</button>
                  `).join('')}
                </div>
                <input type="hidden" id="edit-icon-${child.child_id}" value="${child.icon || 'boy_older'}">
              </div>
              <div class="edit-action-row">
                <button type="button" class="edit-cancel-btn" data-cancel-edit="${child.child_id}">Cancel</button>
                <button type="button" class="edit-save-btn" data-save-edit="${child.child_id}">Save Changes</button>
              </div>
            </div>
          </div>
        `;
      } else {
        // ── Read-only detail view ──
        detail.innerHTML = `
          <div class="child-detail-body">
            <div class="child-stats">
              <div class="child-stat">
                <div class="child-stat-label">Birthday</div>
                <div class="child-stat-value" style="font-size:0.875rem;">${formatBirthday(child.birthday)}</div>
              </div>
              <div class="child-stat">
                <div class="child-stat-label">Age</div>
                <div class="child-stat-value">${age}</div>
              </div>
              <div class="child-stat">
                <div class="child-stat-label">Username</div>
                <div class="child-stat-value" style="font-size:0.875rem;">${escapeHtml(child.username)}</div>
              </div>
              <div class="child-stat">
                <div class="child-stat-label">Icon</div>
                <div class="child-stat-value">${icon} ${ICON_LABELS[child.icon] || 'Boy'}</div>
              </div>
            </div>

            ${child.notes ? `<div class="child-notes">${escapeHtml(child.notes)}</div>` : ''}

            <div class="child-action-row">
              <button class="child-edit-btn" type="button" data-edit-child-id="${child.child_id}"
                      aria-label="Edit ${escapeHtml(child.name)}">
                \u270F\uFE0F Edit Info
              </button>
              <button class="child-login-btn" type="button"
                      data-login-child-name="${escapeHtml(child.name)}"
                      data-login-child-username="${escapeHtml(child.username)}"
                      aria-label="Log in as ${escapeHtml(child.name)}">
                \u{1F511} Log In as Child
              </button>
            </div>
          </div>
        `;
      }

      container.appendChild(detail);
    }
  });
}

/* ── Toggle selection ── */
function handleBarClick(childId) {
  if (selectedChildId === childId) {
    selectedChildId = null;
    editingChildId = null;
  } else {
    selectedChildId = childId;
    editingChildId = null;
  }
  renderChildren(allChildren);
}

/* ── Start editing ── */
function startEditing(childId) {
  editingChildId = childId;
  renderChildren(allChildren);
}

/* ── Cancel editing ── */
function cancelEditing() {
  editingChildId = null;
  renderChildren(allChildren);
}

/* ── Save edit ── */
async function saveEdit(childId) {
  const name     = document.getElementById(`edit-name-${childId}`).value.trim();
  const birthday = document.getElementById(`edit-birthday-${childId}`).value;
  const notes    = document.getElementById(`edit-notes-${childId}`).value.trim();
  const icon     = document.getElementById(`edit-icon-${childId}`).value;

  if (!name) {
    showToast('Name is required.', 'error');
    return;
  }
  if (!birthday) {
    showToast('Birthday is required.', 'error');
    return;
  }

  const saveBtn = document.querySelector(`[data-save-edit="${childId}"]`);
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving\u2026';
  }

  try {
    const result = await window.electronAPI.updateChild({ childId, name, birthday, notes: notes || null, icon });

    if (result.success) {
      // Refresh child data
      allChildren = await window.electronAPI.getChildren();
      editingChildId = null;
      renderChildren(allChildren);
      showToast(`${name} updated!`, 'success');
    } else {
      showToast(result.error || 'Failed to update.', 'error');
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Changes';
      }
    }
  } catch (err) {
    console.error('Failed to update child:', err);
    showToast('Something went wrong.', 'error');
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Changes';
    }
  }
}

/* ── Page init ── */

async function initializePage() {
  try {
    const session = await window.electronAPI.getSession();
    if (!session || !session.userId) { window.electronAPI.navigate('landing'); return; }

    allChildren = await window.electronAPI.getChildren();
    renderChildren(allChildren);
  } catch (err) {
    console.error('Failed to load family page:', err);
    const container = document.getElementById('child-list');
    container.innerHTML = `
      <div class="empty-block">
        <div class="empty-icon">\u26A0\uFE0F</div>
        <div class="empty-title">Could not load children</div>
        <p class="empty-sub">Please go back and try again.</p>
      </div>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initializePage();

  // Header buttons
  document.getElementById('back-btn').addEventListener('click', () => window.electronAPI.navigate('parent-main'));
  document.getElementById('add-child-btn').addEventListener('click', () => window.electronAPI.navigate('parent-add-child'));

  // Modal buttons
  document.getElementById('modal-cancel-btn').addEventListener('click', closeModal);
  document.getElementById('modal-login-btn').addEventListener('click', confirmChildLogin);
  document.getElementById('child-password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmChildLogin();
  });

  // Nav bar
  document.getElementById('nav-home').addEventListener('click', () => window.electronAPI.navigate('parent-main'));
  document.getElementById('nav-emergency').addEventListener('click', () => window.electronAPI.navigate('emergency'));
  document.getElementById('nav-settings').addEventListener('click', () => window.electronAPI.navigate('settings'));

  // Escape key closes the modal, Tab traps focus inside
  document.addEventListener('keydown', (e) => {
    const modal = document.getElementById('login-modal');
    if (modal.classList.contains('hidden')) return;

    if (e.key === 'Escape') { closeModal(); return; }

    if (e.key === 'Tab') {
      const focusable = modal.querySelectorAll('input, button, [tabindex]:not([tabindex="-1"])');
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last  = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
  });

  // Event delegation for all clicks inside child-list
  document.getElementById('child-list').addEventListener('click', (e) => {
    // Edit icon picker
    const iconOption = e.target.closest('.edit-icon-option');
    if (iconOption) {
      const picker = iconOption.closest('.edit-icon-picker');
      const childId = picker.dataset.childId;
      picker.querySelectorAll('.edit-icon-option').forEach(el => el.classList.remove('selected'));
      iconOption.classList.add('selected');
      document.getElementById(`edit-icon-${childId}`).value = iconOption.dataset.icon;
      return;
    }

    // Save edit
    const saveBtn = e.target.closest('[data-save-edit]');
    if (saveBtn) {
      saveEdit(parseInt(saveBtn.dataset.saveEdit));
      return;
    }

    // Cancel edit
    const cancelBtn = e.target.closest('[data-cancel-edit]');
    if (cancelBtn) {
      cancelEditing();
      return;
    }

    // Edit button
    const editBtn = e.target.closest('[data-edit-child-id]');
    if (editBtn) {
      startEditing(parseInt(editBtn.dataset.editChildId));
      return;
    }

    // Login button
    const loginBtn = e.target.closest('[data-login-child-username]');
    if (loginBtn) {
      openChildLogin(loginBtn.dataset.loginChildName, loginBtn.dataset.loginChildUsername);
      return;
    }

    // Bar click (expand/collapse)
    const bar = e.target.closest('.child-bar');
    if (bar) {
      handleBarClick(parseInt(bar.dataset.childId));
    }
  });

  // Keyboard accessibility for bars
  document.getElementById('child-list').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const bar = e.target.closest('.child-bar');
      if (bar) {
        e.preventDefault();
        handleBarClick(parseInt(bar.dataset.childId));
      }
    }
  });
});
