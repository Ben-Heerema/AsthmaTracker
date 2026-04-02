/**
 * main.js — Parent Dashboard Logic
 *
 * This is the parent's home screen.
 * On load it:
 *   1. Verifies the user is logged in (redirects if not)
 *   2. Loads all children into the selector dropdown
 *   3. Checks notification permissions
 *   4. Loads unread notification count
 */

// IDs of nav buttons that require a child to be selected
const CHILD_REQUIRED_BTNS = [
  'nav-daily-checkin', 'nav-child-overview', 'nav-set-pb', 'nav-enter-pef',
  'nav-add-badges', 'nav-medication-inventory', 'nav-pdf',
  'nav-todays-zone', 'nav-medication-logs', 'nav-incident-logs'
];

/**
 * Enable or disable child-dependent buttons based on whether a child is selected.
 */
function updateChildButtons() {
  const hasChild = !!document.getElementById('child-select').value;
  for (const id of CHILD_REQUIRED_BTNS) {
    const btn = document.getElementById(id);
    if (btn) {
      btn.disabled = !hasChild;
      btn.title = hasChild ? '' : 'Select a child first';
    }
  }
}

/**
 * Navigate to a screen by name.
 * Also stores the currently selected child ID so other screens can access it.
 */
function navigate(screenName) {
  const childId = document.getElementById('child-select').value;
  // Pass the selected child ID as navigation data
  window.electronAPI.navigate(screenName, { childId: childId ? parseInt(childId) : null });
}

function goToNotifications() {
  window.electronAPI.navigate('parent-notifications');
}

/**
 * Called when user selects a different child in the dropdown.
 * Saves the selection so it persists across page navigations.
 */
function onChildSelected() {
  const childId = document.getElementById('child-select').value;
  // Persist the selected child so it's remembered when returning to this page
  if (childId) {
    window.electronAPI.setSetting('selectedChildId', childId);
  }
  updateChildButtons();
}

/**
 * initializePage — Main setup function.
 * Runs when the DOM is ready.
 */
async function initializePage() {
  try {
    // Step 1: Get session and verify login
    const session = await window.electronAPI.getSession();
    if (!session || !session.userId) {
      window.electronAPI.navigate('landing');
      return;
    }

    // Step 2: Display username
    document.getElementById('username-display').textContent = `Logged in as: ${session.username}`;

    // Step 3: Load children into dropdown
    await loadChildren();

    // Step 3b: Disable child-dependent buttons until a child is selected
    updateChildButtons();

    // Step 4: Load notification count for bell icon
    await loadNotificationCount();

    // Step 5: Check if Electron notifications are enabled
    checkNotificationPermission();
  } catch (err) {
    console.error('[parent/main.js] initializePage error:', err);
  }
}

/**
 * loadChildren — Fetches children from the database and populates the dropdown.
 */
async function loadChildren() {
  const children = await window.electronAPI.getChildren();
  const select = document.getElementById('child-select');

  // Clear existing options (except the placeholder)
  select.innerHTML = '<option value="">— Select a child —</option>';

  if (children.length === 0) {
    // Show hint if no children added yet
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No children added yet — click "Add Child"';
    opt.disabled = true;
    select.appendChild(opt);
    return;
  }

  // Add one option per child
  for (const child of children) {
    const opt = document.createElement('option');
    opt.value = child.child_id;
    opt.textContent = child.name;
    select.appendChild(opt);
  }

  // Restore previously selected child, or default to the first one
  const savedChildId = await window.electronAPI.getSetting('selectedChildId');
  const savedExists = savedChildId && children.some(c => String(c.child_id) === String(savedChildId));

  if (savedExists) {
    select.value = savedChildId;
  } else if (children.length > 0) {
    select.value = children[0].child_id;
    window.electronAPI.setSetting('selectedChildId', String(children[0].child_id));
  }
}

/**
 * loadNotificationCount — Checks for unread notifications and shows the count badge.
 */
async function loadNotificationCount() {
  const notifications = await window.electronAPI.getNotifications();
  const unread = notifications.filter(n => !n.is_read).length;

  const badge = document.getElementById('notif-count');
  if (unread > 0) {
    badge.textContent = unread > 99 ? '99+' : unread;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

/**
 * checkNotificationPermission — Shows a prompt if notifications are disabled.
 * Electron's Notification API requires OS-level permission.
 */
function checkNotificationPermission() {
  // Notification.permission can be 'granted', 'denied', or 'default'
  if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
    // In Electron, we typically request permission proactively
    Notification.requestPermission().catch(err => {
      console.warn('[parent/main.js] Notification permission denied:', err);
    });
  }
}

// Track the notification polling interval so it can be cleaned up
let notifPollInterval = null;

// Run on page load
document.addEventListener('DOMContentLoaded', () => {
  initializePage();

  // Poll for new notifications every 30 seconds so the bell badge
  // updates in real-time without needing to navigate away and back.
  notifPollInterval = setInterval(loadNotificationCount, 30000);

  // Clean up interval when navigating away to prevent memory leaks
  window.addEventListener('beforeunload', () => {
    if (notifPollInterval) clearInterval(notifPollInterval);
  });

  // Navigation grid buttons
  document.getElementById('notif-bell-btn').addEventListener('click', goToNotifications);
  document.getElementById('nav-daily-checkin').addEventListener('click', () => navigate('parent-daily-checkin'));
  document.getElementById('nav-child-overview').addEventListener('click', () => navigate('parent-child-overview'));
  document.getElementById('nav-set-pb').addEventListener('click', () => navigate('parent-set-pb'));
  document.getElementById('nav-enter-pef').addEventListener('click', () => navigate('parent-enter-pef'));
  document.getElementById('nav-add-badges').addEventListener('click', () => navigate('parent-add-badges'));
  document.getElementById('nav-medication-inventory').addEventListener('click', () => navigate('parent-medication-inventory'));
  document.getElementById('nav-pdf').addEventListener('click', () => navigate('parent-pdf'));
  document.getElementById('nav-todays-zone').addEventListener('click', () => navigate('parent-todays-zone'));
  document.getElementById('nav-medication-logs').addEventListener('click', () => navigate('parent-medication-logs'));
  document.getElementById('nav-incident-logs').addEventListener('click', () => navigate('parent-incident-logs'));

  // Bottom nav bar buttons
  document.getElementById('nav-family').addEventListener('click', () => navigate('parent-family'));
  document.getElementById('nav-emergency').addEventListener('click', () => navigate('emergency'));
  document.getElementById('nav-settings').addEventListener('click', () => navigate('settings'));

  // Child selector change
  document.getElementById('child-select').addEventListener('change', onChildSelected);
});
