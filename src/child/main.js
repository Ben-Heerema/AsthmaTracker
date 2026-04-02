/**
 * child/main.js — Child Dashboard Logic
 *
 * The child's home screen. Uses large colourful buttons for easy navigation.
 * Children only have access to:
 *   - Inhaler technique tutorial
 *   - Take medication (log doses)
 *   - View badges
 *   - Check today's zone (enters PEF, triggers parent notification if red)
 *   - Emergency services
 */

function goTo(screenName) {
  window.electronAPI.navigate(screenName);
}

async function initializePage() {
  try {
    const session = await window.electronAPI.getSession();

    // Children are identified by childId (not userId)
    if (!session || !session.childId) {
      window.electronAPI.navigate('landing');
      return;
    }

    // Display the child's first name
    document.getElementById('child-name').textContent = session.username.split(' ')[0];
  } catch (err) {
    console.error('Failed to initialize child dashboard:', err);
    document.getElementById('child-name').textContent = 'Error loading page';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initializePage();

  // Grid buttons
  document.getElementById('nav-inhaler').addEventListener('click', () => goTo('child-inhaler'));
  document.getElementById('nav-medication').addEventListener('click', () => goTo('child-take-medication'));
  document.getElementById('nav-badges').addEventListener('click', () => goTo('child-badges'));
  document.getElementById('nav-zone').addEventListener('click', () => goTo('child-check-zone'));

  // Bottom nav bar
  document.getElementById('nav-home').addEventListener('click', () => goTo('child-main'));
  document.getElementById('nav-emergency').addEventListener('click', () => goTo('emergency'));
  document.getElementById('nav-settings').addEventListener('click', () => goTo('settings'));
});
