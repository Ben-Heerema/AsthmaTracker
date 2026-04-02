/**
 * notifications.js — Notifications Page Logic
 *
 * Displays all notifications for the parent, with unread ones highlighted.
 * Notifications are created by:
 *   - The scheduler (medication expiry, low dose count)
 *   - Real-time events (red zone alert, pef submitted, breathing decline, child emergency)
 *
 * Features:
 *   - Toggle to show/hide read notifications (default: hide read)
 *   - Paginated with page numbers
 *   - Click to mark individual notifications as read
 */

const PAGE_SIZE = 10;
let allNotifications = [];
let filteredNotifications = [];
let currentPage = 0;
let showRead = false;

/** Escape HTML special characters to prevent XSS from database content */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// Icon mapping for each notification type
const NOTIF_ICONS = {
  medication_expiry:  '💊',
  low_dose_count:     '⚠️',
  child_emergency:    '🚨',
  breathing_decline:  '😮‍💨',
  red_zone_alert:     '🔴',
  pef_submitted:      '📊'
};

// Badge class mapping
function getBadgeClass(type) {
  if (type === 'child_emergency' || type === 'red_zone_alert') return 'emergency';
  if (type === 'medication_expiry' || type === 'low_dose_count' || type === 'breathing_decline') return 'warning';
  return 'info';
}

// Friendly type labels
const TYPE_LABELS = {
  medication_expiry:  'Expiry',
  low_dose_count:     'Low Supply',
  child_emergency:    'Emergency',
  breathing_decline:  'Decline',
  red_zone_alert:     'Red Zone',
  pef_submitted:      'PEF Update'
};

// ─── Filtering ──────────────────────────────────────────

function applyFilters() {
  if (showRead) {
    filteredNotifications = allNotifications;
  } else {
    filteredNotifications = allNotifications.filter(n => !n.is_read);
  }

  // Update count label
  const unreadCount = allNotifications.filter(n => !n.is_read).length;
  const label = document.getElementById('notif-count-label');
  label.textContent = unreadCount > 0 ? `${unreadCount} unread` : 'All read';

  // Render
  if (filteredNotifications.length === 0) {
    const container = document.getElementById('notif-list');
    container.innerHTML = `
      <div class="notif-empty">
        <span class="notif-empty-icon" aria-hidden="true">${showRead ? '🔔' : '✅'}</span>
        <div class="notif-empty-title">${showRead ? 'No notifications yet' : 'All caught up!'}</div>
        <div class="notif-empty-sub">${showRead
          ? 'Notifications appear here when medications are expiring, doses are low, or emergency events occur.'
          : 'No unread notifications. Toggle "Show read" to see past notifications.'
        }</div>
      </div>`;
    const controls = document.getElementById('pagination-controls');
    if (controls) controls.classList.add('hidden');
    return;
  }

  renderPage(0);
}

// ─── Mark as read ───────────────────────────────────────

async function markAllRead() {
  try {
    await window.electronAPI.markAllNotificationsRead();
    allNotifications.forEach(n => { n.is_read = 1; });
    applyFilters();
    showToast('All notifications marked as read', 'success');
  } catch (err) {
    console.error('Failed to mark all notifications as read:', err);
    showToast('Could not mark notifications as read. Please try again.', 'error');
  }
}

// ─── Rendering ──────────────────────────────────────────

/** Render a single notification item and append it to the container */
function renderNotification(n, container) {
  const item = document.createElement('div');
  const readClass = n.is_read ? 'read' : 'unread';
  item.className = `notif-entry ${readClass}`;
  item.setAttribute('tabindex', '0');
  item.setAttribute('role', 'button');
  item.setAttribute('aria-label', `${n.is_read ? '' : 'Unread: '}${n.title}`);

  const icon = NOTIF_ICONS[n.notification_type] || '🔔';
  const badgeClass = getBadgeClass(n.notification_type);
  const typeLabel = TYPE_LABELS[n.notification_type] || 'Notification';

  item.innerHTML = `
    <div class="notif-icon" aria-hidden="true">${icon}</div>
    <div class="notif-content">
      <div class="notif-title">
        ${escapeHtml(n.title)}
        <span class="notif-type-badge ${badgeClass}">${typeLabel}</span>
      </div>
      <div class="notif-message">${escapeHtml(n.message)}</div>
      <div class="notif-time">${new Date(n.created_at).toLocaleString()}</div>
    </div>
  `;

  async function markRead() {
    if (!n.is_read) {
      try {
        await window.electronAPI.markNotificationRead(n.notification_id);
        n.is_read = 1;
        item.className = 'notif-entry read';
        item.setAttribute('aria-label', n.title);

        // Update count label
        const unreadCount = allNotifications.filter(x => !x.is_read).length;
        document.getElementById('notif-count-label').textContent =
          unreadCount > 0 ? `${unreadCount} unread` : 'All read';

        // If hiding read, re-filter after a brief visual delay
        if (!showRead) {
          setTimeout(() => applyFilters(), 300);
        }
      } catch (err) {
        console.error('Failed to mark notification as read:', err);
      }
    }
  }

  item.addEventListener('click', markRead);
  item.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); markRead(); }
  });

  container.appendChild(item);
}

/** Render a specific page */
function renderPage(page) {
  const container = document.getElementById('notif-list');
  container.innerHTML = '';

  const totalPages = Math.ceil(filteredNotifications.length / PAGE_SIZE);
  currentPage = Math.max(0, Math.min(page, totalPages - 1));

  const start = currentPage * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, filteredNotifications.length);

  for (let i = start; i < end; i++) {
    renderNotification(filteredNotifications[i], container);
  }

  updatePaginationControls();
}

/** Build page number buttons */
function updatePaginationControls() {
  const controls = document.getElementById('pagination-controls');
  if (!controls) return;

  const totalPages = Math.ceil(filteredNotifications.length / PAGE_SIZE);
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

// ─── Initialization ─────────────────────────────────────

async function initializePage() {
  try {
    const session = await window.electronAPI.getSession();
    if (!session || !session.userId) { window.electronAPI.navigate('landing'); return; }

    allNotifications = await window.electronAPI.getNotifications();

    if (!allNotifications) allNotifications = [];

    applyFilters();
  } catch (err) {
    console.error('Failed to load notifications:', err);
    showToast('Could not load notifications. Please try again.', 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initializePage();
  document.getElementById('back-btn').addEventListener('click', () => window.electronAPI.navigate('parent-main'));
  document.getElementById('mark-all-read-btn').addEventListener('click', markAllRead);

  // Show read toggle
  document.getElementById('show-read-toggle').addEventListener('change', (e) => {
    showRead = e.target.checked;
    applyFilters();
  });
});
