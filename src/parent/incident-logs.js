/**
 * incident-logs.js — Incident / Emergency Triage Logs Page
 *
 * Shows all recorded emergency triage incidents across all children,
 * most recent first. Displays danger flags, key notes, and a button
 * to view the full timestamped event log from the emergency session.
 *
 * Paginated: renders PAGE_SIZE items at a time with a "Show More" button.
 */

const PAGE_SIZE = 10;
let allIncidents  = [];
let filteredIncidents = [];
let visibleCount  = 0;

/** Escape HTML special characters to prevent XSS from database content */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/** Format ISO timestamp to a readable string */
function formatDateTime(iso) {
  if (!iso) return 'Unknown';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    + ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** Get the Monday of the week containing a given date */
function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Format a Date to a short readable string (e.g. "Mar 17") */
function shortDate(d) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Filtering ──────────────────────────────────────────

function applyFilters() {
  const childId  = document.getElementById('filter-child').value;
  const weekDate = document.getElementById('filter-week').value;

  let weekStart = null;
  let weekEnd   = null;
  if (weekDate) {
    weekStart = getMonday(weekDate + 'T00:00:00');
    weekEnd   = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
  }

  filteredIncidents = allIncidents.filter(inc => {
    // Child filter
    if (childId && String(inc.child_id) !== childId) return false;
    // Week filter
    if (weekStart) {
      const incDate = new Date(inc.timestamp);
      if (incDate < weekStart || incDate >= weekEnd) return false;
    }
    return true;
  });

  // Show/hide the clear button
  const hasFilters = childId || weekDate;
  document.getElementById('clear-filters-btn').classList.toggle('hidden', !hasFilters);

  // Update the filter summary
  const summary = document.getElementById('filter-summary');
  if (hasFilters) {
    const parts = [];
    if (childId) {
      const opt = document.getElementById('filter-child').selectedOptions[0];
      parts.push(opt ? opt.textContent : 'child');
    }
    if (weekStart) parts.push(`week of ${shortDate(weekStart)} – ${shortDate(new Date(weekEnd.getTime() - 1))}`);
    summary.textContent = `${filteredIncidents.length} result${filteredIncidents.length !== 1 ? 's' : ''} for ${parts.join(', ')}`;
    summary.classList.remove('hidden');
  } else {
    summary.classList.add('hidden');
  }

  // Re-render from scratch
  if (filteredIncidents.length === 0) {
    const container = document.getElementById('incident-list');
    container.innerHTML = `
      <div class="il-empty">
        <span class="il-empty-icon" aria-hidden="true">🔍</span>
        <div class="il-empty-title">No matching incidents</div>
        <div class="il-empty-sub">Try adjusting your filters.</div>
      </div>`;
    const controls = document.getElementById('pagination-controls');
    if (controls) controls.classList.add('hidden');
    return;
  }

  renderPage(0);
}

function clearFilters() {
  document.getElementById('filter-child').value = '';
  document.getElementById('filter-week').value = '';
  applyFilters();
}

/** Element that opened the modal — we restore focus here on close */
let modalTrigger = null;

/** Open the event log modal for a given incident */
function openLogModal(inc, triggerEl) {
  modalTrigger = triggerEl || document.activeElement;

  const guidance = inc.guidance_provided || '';

  // Check whether a proper event log was recorded (new format has "--- EVENT LOG ---")
  const hasLog = guidance.includes('--- EVENT LOG ---');

  document.getElementById('log-modal-subtitle').textContent =
    formatDateTime(inc.timestamp) + ' · ' + (inc.child_name || 'Child');

  document.getElementById('log-modal-content').textContent = hasLog
    ? guidance                                    // show full outcome + log
    : (guidance || 'No event log recorded for this incident.');

  const overlay = document.getElementById('log-modal-overlay');
  overlay.classList.remove('hidden');
  overlay.classList.add('log-modal-visible');

  // Move focus into the modal (close button)
  const closeBtn = document.getElementById('log-modal-close');
  setTimeout(() => closeBtn.focus(), 50);
}

function closeLogModal() {
  const overlay = document.getElementById('log-modal-overlay');
  overlay.classList.remove('log-modal-visible');
  // Wait for fade-out then re-hide
  setTimeout(() => overlay.classList.add('hidden'), 220);

  // Restore focus to the element that triggered the modal
  if (modalTrigger && typeof modalTrigger.focus === 'function') {
    modalTrigger.focus();
    modalTrigger = null;
  }
}

/** Trap Tab key inside the modal so focus doesn't escape */
function trapFocusInModal(e) {
  const overlay = document.getElementById('log-modal-overlay');
  if (overlay.classList.contains('hidden')) return;

  if (e.key !== 'Tab') return;

  const modal = overlay.querySelector('.log-modal');
  const focusable = modal.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])');
  if (focusable.length === 0) return;

  const first = focusable[0];
  const last  = focusable[focusable.length - 1];

  if (e.shiftKey) {
    if (document.activeElement === first) { e.preventDefault(); last.focus(); }
  } else {
    if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
  }
}

/** Render a single incident entry and append it to the container */
function renderIncident(inc, container) {
  // Build a list of danger flags that were present
  const flags = [];
  if (!inc.can_speak_full_sentences) flags.push('Cannot speak in full sentences');
  if (inc.chest_retracting)          flags.push('Chest retracting');
  if (inc.blue_grey_lips)            flags.push('Blue/grey lips or nails');

  const hasDanger      = flags.length > 0;
  const severityClass  = hasDanger ? 'critical' : 'moderate';
  const severityText   = hasDanger ? '<span aria-hidden="true">🔴</span> Critical' : '<span aria-hidden="true">🟡</span> Moderate';

  // Determine whether a structured event log exists
  const hasLog = inc.guidance_provided && inc.guidance_provided.includes('--- EVENT LOG ---');

  const entry = document.createElement('div');
  entry.className = 'il-entry' + (hasDanger ? '' : ' moderate');
  entry.innerHTML = `
    <div class="il-entry-top">
      <div>
        <span class="il-entry-name">${escapeHtml(inc.child_name) || 'Child'}</span>
        <span class="il-severity-badge ${severityClass}">${severityText}</span>
      </div>
      <span class="il-entry-date">${formatDateTime(inc.timestamp)}</span>
    </div>
    ${flags.length > 0 ? `
      <div class="il-flags">
        ${flags.map(f => `<span class="il-flag"><span aria-hidden="true">⚠️</span> ${f}</span>`).join('')}
      </div>` : ''}
    ${inc.current_pef ? `<div class="il-pef">PEF reading: <strong>${inc.current_pef} L/min</strong></div>` : ''}
    ${inc.user_notes  ? `<div class="il-notes">"${escapeHtml(inc.user_notes)}"</div>` : ''}
    <button class="il-log-btn" data-id="${inc.incident_id}" type="button">
      ${hasLog ? '<span aria-hidden="true">📋</span> View Event Log' : '<span aria-hidden="true">📄</span> View Guidance Notes'}
    </button>
  `;

  // Wire up the log button for this specific incident
  const logBtn = entry.querySelector('.il-log-btn');
  logBtn.addEventListener('click', () => openLogModal(inc, logBtn));

  container.appendChild(entry);
}

let currentPage = 0;

/** Render a specific page of incidents */
function renderPage(page) {
  const container = document.getElementById('incident-list');
  container.innerHTML = '';

  const totalPages = Math.ceil(filteredIncidents.length / PAGE_SIZE);
  currentPage = Math.max(0, Math.min(page, totalPages - 1));

  const start = currentPage * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, filteredIncidents.length);

  for (let i = start; i < end; i++) {
    renderIncident(filteredIncidents[i], container);
  }

  updatePaginationControls();
}

/** Build page number buttons */
function updatePaginationControls() {
  const controls = document.getElementById('pagination-controls');
  if (!controls) return;

  const totalPages = Math.ceil(filteredIncidents.length / PAGE_SIZE);
  if (totalPages <= 1) {
    controls.classList.add('hidden');
    return;
  }

  controls.classList.remove('hidden');
  controls.innerHTML = '';

  // Previous button
  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'page-btn page-prev';
  prevBtn.textContent = '‹ Prev';
  prevBtn.setAttribute('aria-label', 'Previous page');
  prevBtn.disabled = currentPage === 0;
  prevBtn.addEventListener('click', () => renderPage(currentPage - 1));
  controls.appendChild(prevBtn);

  // Page number buttons
  const pageNums = document.createElement('div');
  pageNums.className = 'page-numbers';

  for (let i = 0; i < totalPages; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'page-btn page-num' + (i === currentPage ? ' active' : '');
    btn.textContent = i + 1;
    btn.setAttribute('aria-label', `Page ${i + 1}`);
    if (i === currentPage) btn.setAttribute('aria-current', 'page');
    btn.addEventListener('click', () => renderPage(i));
    pageNums.appendChild(btn);
  }

  controls.appendChild(pageNums);

  // Next button
  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'page-btn page-next';
  nextBtn.textContent = 'Next ›';
  nextBtn.setAttribute('aria-label', 'Next page');
  nextBtn.disabled = currentPage === totalPages - 1;
  nextBtn.addEventListener('click', () => renderPage(currentPage + 1));
  controls.appendChild(nextBtn);
}

async function initializePage() {
  try {
    const session = await window.electronAPI.getSession();
    if (!session || !session.userId) { window.electronAPI.navigate('landing'); return; }

    // Populate child filter dropdown
    const navData  = await window.electronAPI.getNavigationData();
    const children = await window.electronAPI.getChildren();
    const childSelect = document.getElementById('filter-child');
    children.forEach(c => {
      const o = document.createElement('option');
      o.value = c.child_id;
      o.textContent = c.name;
      childSelect.appendChild(o);
    });

    // Auto-select child from nav data if passed from parent main page
    if (navData && navData.childId) {
      childSelect.value = navData.childId;
    }

    const container = document.getElementById('incident-list');
    allIncidents = await window.electronAPI.getAllIncidents();

    if (!allIncidents || allIncidents.length === 0) {
      container.innerHTML = `
        <div class="il-empty">
          <span class="il-empty-icon" aria-hidden="true">✅</span>
          <div class="il-empty-title">No incidents recorded</div>
          <div class="il-empty-sub">Emergency triage events are logged here automatically.</div>
        </div>`;
      return;
    }

    container.innerHTML = '';
    filteredIncidents = allIncidents;
    visibleCount = 0;

    // Apply filters (will auto-filter by child if one was pre-selected)
    applyFilters();
  } catch (err) {
    console.error('Failed to load incident logs:', err);
    showToast('Could not load incident logs. Please try again.', 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initializePage();
  document.getElementById('back-btn').addEventListener('click', () => window.electronAPI.navigate('parent-main'));
  // Pagination is handled dynamically by renderPage/updatePaginationControls

  // Filter listeners
  document.getElementById('filter-child').addEventListener('change', applyFilters);
  document.getElementById('filter-week').addEventListener('change', applyFilters);
  document.getElementById('clear-filters-btn').addEventListener('click', clearFilters);

  // Modal close button
  document.getElementById('log-modal-close').addEventListener('click', closeLogModal);

  // Click outside modal = close
  document.getElementById('log-modal-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('log-modal-overlay')) closeLogModal();
  });

  // Escape key = close, Tab = trap inside modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLogModal();
    trapFocusInModal(e);
  });
});
