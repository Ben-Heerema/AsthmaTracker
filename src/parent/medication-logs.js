/**
 * medication-logs.js — Medication Logs Page
 *
 * Shows the last 90 days of medication dose logs across all children.
 * Each entry shows: date/time, medication name, type (rescue/controller),
 * doses taken, and before/after breathing state with a trend indicator.
 *
 * Features:
 *   - Search by medication name (real-time, case-insensitive)
 *   - Filter by week (picks a date, shows that Mon–Sun window)
 *   - Paginated: renders PAGE_SIZE items at a time with a "Show More" button
 */

const PAGE_SIZE = 10;
let allLogs = [];       // raw data from backend
let filteredLogs = [];  // after search/week filter applied
let visibleCount = 0;

/** Escape HTML special characters to prevent XSS from database content */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

const BREATHING_LABELS = ['Very Bad', 'Bad', 'Normal', 'Good', 'Very Good'];

/** Format ISO timestamp to a readable date/time string */
function formatDateTime(iso) {
  if (!iso) return 'Unknown';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    + ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** Get the Monday of the week containing a given date */
function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();           // 0 = Sun, 1 = Mon, ...
  const diff = day === 0 ? -6 : 1 - day;  // shift to Monday
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
  const searchTerm = (document.getElementById('search-med').value || '').trim().toLowerCase();
  const weekDate   = document.getElementById('filter-week').value;  // YYYY-MM-DD or ''

  let weekStart = null;
  let weekEnd   = null;
  if (weekDate) {
    weekStart = getMonday(weekDate + 'T00:00:00');
    weekEnd   = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);  // Mon 00:00 → next Mon 00:00
  }

  filteredLogs = allLogs.filter(log => {
    // Medication name search
    if (searchTerm && !(log.medication_name || '').toLowerCase().includes(searchTerm)) {
      return false;
    }
    // Week filter
    if (weekStart) {
      const logDate = new Date(log.timestamp);
      if (logDate < weekStart || logDate >= weekEnd) return false;
    }
    return true;
  });

  // Show/hide the clear button
  const hasFilters = searchTerm || weekDate;
  document.getElementById('clear-filters-btn').classList.toggle('hidden', !hasFilters);

  // Update the filter summary
  const summary = document.getElementById('filter-summary');
  if (hasFilters) {
    const parts = [];
    if (searchTerm) parts.push(`"${searchTerm}"`);
    if (weekStart)  parts.push(`week of ${shortDate(weekStart)} – ${shortDate(new Date(weekEnd.getTime() - 1))}`);
    summary.textContent = `${filteredLogs.length} result${filteredLogs.length !== 1 ? 's' : ''} for ${parts.join(', ')}`;
    summary.classList.remove('hidden');
  } else {
    summary.classList.add('hidden');
  }

  // Re-render from scratch
  if (filteredLogs.length === 0) {
    const container = document.getElementById('log-list');
    container.innerHTML = `
      <div class="ml-empty">
        <span class="ml-empty-icon" aria-hidden="true">🔍</span>
        <div class="ml-empty-title">No matching logs</div>
        <div class="ml-empty-sub">Try adjusting your search or date filter.</div>
      </div>`;
    const controls = document.getElementById('pagination-controls');
    if (controls) controls.classList.add('hidden');
    return;
  }

  renderPage(0);
}

function clearFilters() {
  document.getElementById('search-med').value = '';
  document.getElementById('filter-week').value = '';
  applyFilters();
}

// ─── Rendering ──────────────────────────────────────────

/** Render a single medication log entry and append it to the container */
function renderLog(log, container) {
  const badgeClass  = log.is_rescue ? 'rescue' : 'controller';
  const badgeLabel  = log.is_rescue ? '<span aria-hidden="true">🚑</span> Rescue' : '<span aria-hidden="true">💊</span> Controller';

  const beforeIdx   = (log.breathing_before != null && log.breathing_before >= 0) ? log.breathing_before : null;
  const afterIdx    = (log.breathing_after  != null && log.breathing_after  >= 0) ? log.breathing_after  : null;
  const beforeLabel = (beforeIdx !== null && beforeIdx < BREATHING_LABELS.length) ? BREATHING_LABELS[beforeIdx] : '—';
  const afterLabel  = (afterIdx  !== null && afterIdx  < BREATHING_LABELS.length) ? BREATHING_LABELS[afterIdx]  : '—';

  const hasBoth    = beforeIdx !== null && afterIdx !== null;
  const improved   = hasBoth && afterIdx > beforeIdx;
  const declined   = hasBoth && afterIdx < beforeIdx;
  const trendClass = improved ? 'improved' : declined ? 'declined' : 'no-change';
  const trendLabel = improved ? 'Improved' : declined ? 'Declined' : 'No change';
  const trendIcon  = improved ? '↑' : declined ? '↓' : '→';

  const beforeClass = beforeIdx !== null ? ` breathing-${beforeIdx}` : '';
  const afterClass  = afterIdx  !== null ? ` breathing-${afterIdx}`  : '';

  const entry = document.createElement('div');
  entry.className = 'ml-entry';
  entry.innerHTML = `
    <div class="ml-entry-top">
      <div class="ml-entry-name-group">
        <span class="ml-entry-name">${escapeHtml(log.medication_name)}</span>
        <span class="ml-type-badge ${badgeClass}">${badgeLabel}</span>
      </div>
      <span class="ml-entry-date">${formatDateTime(log.timestamp)}</span>
    </div>

    <div class="ml-entry-stats">
      <div class="ml-stat">
        <span class="ml-stat-label">Doses</span>
        <span class="ml-stat-value">${log.doses_taken}</span>
      </div>
      <div class="ml-stat" style="margin-left:8px">
        <span class="ml-stat-label">Before</span>
        <span class="ml-stat-value${beforeClass}">${beforeLabel}</span>
      </div>
      <span class="ml-trend ${trendClass}" aria-label="${trendLabel}">${trendIcon}</span>
      <div class="ml-stat">
        <span class="ml-stat-label">After</span>
        <span class="ml-stat-value${afterClass}">${afterLabel}</span>
      </div>
    </div>

    ${log.child_name
      ? `<div class="ml-entry-child"><span aria-hidden="true">👦</span> ${escapeHtml(log.child_name)}</div>`
      : ''}
  `;

  container.appendChild(entry);
}

let currentPage = 0;

/** Render a specific page of logs */
function renderPage(page) {
  const container = document.getElementById('log-list');
  container.innerHTML = '';

  const totalPages = Math.ceil(filteredLogs.length / PAGE_SIZE);
  currentPage = Math.max(0, Math.min(page, totalPages - 1));

  const start = currentPage * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, filteredLogs.length);

  for (let i = start; i < end; i++) {
    renderLog(filteredLogs[i], container);
  }

  updatePaginationControls();
}

/** Build page number buttons like Google */
function updatePaginationControls() {
  const controls = document.getElementById('pagination-controls');
  if (!controls) return;

  const totalPages = Math.ceil(filteredLogs.length / PAGE_SIZE);
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

// ─── Medication Suggestions ─────────────────────────────

async function populateMedSuggestions() {
  try {
    // Gather unique names from logs
    const namesFromLogs = allLogs.map(l => l.medication_name).filter(Boolean);

    // Also fetch all medications (active + inactive) from inventory
    const allMeds = await window.electronAPI.getAllMedications({ includeInactive: true });
    const namesFromInventory = (allMeds || []).map(m => m.medication_name).filter(Boolean);

    // Combine and deduplicate (case-insensitive)
    const seen = new Set();
    const uniqueNames = [];
    [...namesFromInventory, ...namesFromLogs].forEach(name => {
      const key = name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        uniqueNames.push(name);
      }
    });

    // Sort alphabetically and populate datalist
    uniqueNames.sort((a, b) => a.localeCompare(b));
    const datalist = document.getElementById('med-suggestions');
    datalist.innerHTML = uniqueNames.map(n => `<option value="${escapeHtml(n)}">`).join('');
  } catch (err) {
    console.error('Failed to populate medication suggestions:', err);
  }
}

// ─── Initialization ─────────────────────────────────────

async function initializePage() {
  try {
    const session = await window.electronAPI.getSession();
    if (!session || !session.userId) { window.electronAPI.navigate('landing'); return; }

    const container = document.getElementById('log-list');
    allLogs = await window.electronAPI.getMedicationLogs({ days: 90 });

    if (!allLogs || allLogs.length === 0) {
      container.innerHTML = `
        <div class="ml-empty">
          <span class="ml-empty-icon" aria-hidden="true">📋</span>
          <div class="ml-empty-title">No logs yet</div>
          <div class="ml-empty-sub">Logs appear here when a child takes medication through the app.</div>
        </div>`;
      return;
    }

    container.innerHTML = '';  // remove the loading spinner
    filteredLogs = allLogs;
    renderPage(0);

    // Populate medication name suggestions from logs + full inventory
    populateMedSuggestions();
  } catch (err) {
    console.error('Failed to load medication logs:', err);
    showToast('Could not load medication logs. Please try again.', 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initializePage();
  document.getElementById('back-btn').addEventListener('click', () => window.electronAPI.navigate('parent-main'));
  // Pagination is handled dynamically by renderPage/updatePaginationControls

  // Debounced search — filters as you type after a short pause
  let searchTimer = null;
  document.getElementById('search-med').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(applyFilters, 250);
  });

  // Week filter — triggers immediately on date pick
  document.getElementById('filter-week').addEventListener('change', applyFilters);

  // Clear all filters
  document.getElementById('clear-filters-btn').addEventListener('click', clearFilters);
});
