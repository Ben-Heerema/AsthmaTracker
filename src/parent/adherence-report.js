/**
 * adherence-report.js — Medication Adherence Report (Last 30 Days)
 *
 * Displays a circular progress ring showing the child's controller
 * medication adherence percentage, along with stats and an alert.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const session = await window.electronAPI.getSession();
  if (!session || !session.userId) { window.electronAPI.navigate('landing'); return; }

  const navData = await window.electronAPI.getNavigationData();
  const childId = navData && navData.childId ? parseInt(navData.childId) : null;
  if (!childId) { window.electronAPI.navigate('parent-child-overview'); return; }

  document.getElementById('back-btn').addEventListener('click', () => {
    window.electronAPI.navigate('parent-child-overview', { childId });
  });

  // Fetch child info and adherence data in parallel
  let child, adherence;
  try {
    [child, adherence] = await Promise.all([
      window.electronAPI.getChild(childId),
      window.electronAPI.getMedicationAdherence(childId),
    ]);
  } catch (err) {
    console.error('[adherence-report] Failed to load data:', err);
    const card = document.getElementById('adherence-card');
    const spinner = document.getElementById('adherence-spinner');
    if (spinner) spinner.remove();
    card.textContent = 'Failed to load adherence data. Please try again.';
    return;
  }

  if (!adherence) adherence = { daysPlanned: 0, daysCompleted: 0, percentage: 0 };

  const alertClass = adherence.percentage >= 80 ? 'alert-success' : 'alert-warning';
  const alertMsg   = adherence.percentage >= 80
    ? 'Great adherence! Keep it up.'
    : 'Adherence below 80%. Consider reviewing the schedule with your provider.';

  // ── Build the card content using DOM API ──

  const card = document.getElementById('adherence-card');

  // Remove spinner
  const spinner = document.getElementById('adherence-spinner');
  if (spinner) spinner.remove();

  // Card header (blue gradient banner)
  const header = document.createElement('div');
  header.className = 'adh-card-header';
  header.innerHTML = '<span>\u{1F4CA}</span> Last 30 Days';
  card.appendChild(header);

  // Child name sub-header
  const childNameEl = document.createElement('div');
  childNameEl.className = 'adh-child-name';
  childNameEl.id = 'adherence-child-name';
  childNameEl.textContent = child ? child.name : 'Unknown Child';
  card.appendChild(childNameEl);

  // Card body
  const body = document.createElement('div');
  body.className = 'adh-card-body';

  // Adherence circle (conic-gradient progress ring)
  const display = document.createElement('div');
  display.className = 'adherence-display';

  const circle = document.createElement('div');
  circle.className = 'adherence-circle';
  circle.style.setProperty('--pct', adherence.percentage + '%');
  circle.setAttribute('role', 'img');
  circle.setAttribute('aria-label',
    'Medication adherence: ' + adherence.percentage + '%. ' +
    adherence.daysCompleted + ' of ' + adherence.daysPlanned + ' scheduled days completed.');

  const pctText = document.createElement('span');
  pctText.className = 'adherence-percent';
  pctText.id = 'adherence-percentage';
  pctText.textContent = adherence.percentage + '%';
  pctText.setAttribute('aria-hidden', 'true');

  circle.appendChild(pctText);
  display.appendChild(circle);
  body.appendChild(display);

  // Stats grid (2 columns)
  const stats = document.createElement('div');
  stats.className = 'adh-stats';

  // Days planned stat
  const plannedStat = document.createElement('div');
  plannedStat.className = 'adh-stat';
  plannedStat.innerHTML =
    '<div class="adh-stat-label">Days Scheduled</div>' +
    '<div class="adh-stat-value" id="adherence-days-planned">' + adherence.daysPlanned + '</div>';

  // Days completed stat
  const completedStat = document.createElement('div');
  completedStat.className = 'adh-stat';
  completedStat.innerHTML =
    '<div class="adh-stat-label">Days Completed</div>' +
    '<div class="adh-stat-value" id="adherence-days-completed">' + adherence.daysCompleted + '</div>';

  stats.appendChild(plannedStat);
  stats.appendChild(completedStat);
  body.appendChild(stats);

  // Alert message
  const alert = document.createElement('div');
  alert.className = 'alert ' + alertClass + ' adh-alert';
  alert.id = 'adherence-alert';
  alert.textContent = alertMsg;
  body.appendChild(alert);

  card.appendChild(body);
});
