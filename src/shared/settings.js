/**
 * settings.js — Settings Page Logic
 *
 * Shared by all three roles (parent, provider, child).
 * Shows basic account info and a logout button.
 */

async function logOut() {
  try {
    const confirmed = await showConfirm('Are you sure you want to log out?', 'Log Out', 'Cancel');
    if (confirmed) {
      await window.electronAPI.logout();
    }
  } catch (err) {
    console.error('Failed to log out:', err);
    showToast('Could not log out. Please try again.', 'error');
  }
}

async function initializePage() {
  const session = await window.electronAPI.getSession();

  // Determine home target based on role
  let homeTarget = 'landing';
  if (session && session.role === 'parent')        homeTarget = 'parent-main';
  else if (session && session.role === 'provider') homeTarget = 'provider-main';
  else if (session && session.childId)             homeTarget = 'child-main';

  // Back button
  const backBtn = document.getElementById('back-btn');
  backBtn.addEventListener('click', () => window.electronAPI.navigate(homeTarget));

  // Bottom nav bar
  document.getElementById('nav-home').addEventListener('click', () => window.electronAPI.navigate(homeTarget));
  document.getElementById('nav-emergency').addEventListener('click', () => window.electronAPI.navigate('emergency'));
  // Settings is current page — no-op
  document.getElementById('nav-settings').addEventListener('click', () => { /* already on settings */ });

  // Display account info
  document.getElementById('account-username').textContent = session.username || '—';
  const roleLabels = { parent: 'Parent', provider: 'Healthcare Provider', child: 'Child' };
  document.getElementById('account-role').textContent =
    roleLabels[session.role] || (session.childId ? 'Child' : '—');

  // Check notification permission
  const notifEl = document.getElementById('notif-status');
  if (typeof Notification !== 'undefined') {
    notifEl.textContent = Notification.permission === 'granted'
      ? '✅ Enabled'
      : '⚠️ ' + Notification.permission;
  } else {
    notifEl.textContent = 'Not supported';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initializePage();
  document.getElementById('logout-btn').addEventListener('click', logOut);
});
