/**
 * child-overview.js — Child Overview Page Logic
 *
 * Shows a 2×2 grid of buttons. Each button navigates to its own page,
 * passing the selected childId via navigation data so the sub-page
 * knows which child to load.
 */

let currentChildId = null;

/** Called when child dropdown changes */
async function onChildSelected() {
  const val = document.getElementById('child-select').value;
  currentChildId = val ? parseInt(val) : null;
  const btns = document.getElementById('overview-buttons');
  if (!currentChildId) {
    btns.classList.add('hidden');
  } else {
    btns.classList.remove('hidden');
  }
}

/** Navigate to a sub-page, passing the current childId as context */
function goTo(route) {
  if (!currentChildId) return;
  window.electronAPI.navigate(route, { childId: currentChildId });
}

// =============================================================================
// PAGE INIT
// =============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  const session = await window.electronAPI.getSession();
  if (!session || !session.userId) {
    window.electronAPI.navigate('landing');
    return;
  }

  // Populate child dropdown
  const navData  = await window.electronAPI.getNavigationData();
  const children = await window.electronAPI.getChildren();
  const select   = document.getElementById('child-select');
  select.innerHTML = '<option value="">— Select a child —</option>';
  children.forEach(c => {
    const o = document.createElement('option');
    o.value = c.child_id;
    o.textContent = c.name;
    select.appendChild(o);
  });

  // Auto-select if navigated here with a child in context
  if (navData && navData.childId) {
    select.value = navData.childId;
    await onChildSelected();
  }

  // Wire up buttons
  document.getElementById('back-btn').addEventListener('click', () => window.electronAPI.navigate('parent-main'));
  document.getElementById('child-select').addEventListener('change', onChildSelected);
  document.getElementById('show-schedule-btn').addEventListener('click', () => goTo('parent-controller-schedule'));
  document.getElementById('show-med-report-btn').addEventListener('click', () => goTo('parent-adherence-report'));
  document.getElementById('show-sharing-btn').addEventListener('click', () => goTo('parent-provider-sharing'));
  document.getElementById('show-zone-btn').addEventListener('click', () => goTo('parent-todays-zone'));
});
