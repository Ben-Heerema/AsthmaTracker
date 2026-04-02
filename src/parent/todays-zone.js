/**
 * todays-zone.js — Today's Zone Display
 *
 * Calculates and displays the child's current asthma control zone based
 * on today's PEF reading vs their personal best:
 *   Green  = ≥80% of personal best — well controlled
 *   Yellow = 50–79%               — caution
 *   Red    = <50%                 — medical emergency
 *   Grey   = no PEF data today
 *
 * Hides all content and shows a prompt until a child is selected.
 */

/* Messages and emojis for each zone */
const ZONE_CONFIG = {
  green:  { message: "Your child's asthma is well-controlled today. ✅",           emoji: '✅' },
  yellow: { message: "Caution — your child's asthma may be worsening. Monitor closely. ⚠️", emoji: '⚠️' },
  red:    { message: "Medical emergency — seek immediate care or call 911. 🚨",     emoji: '🚨' }
};

async function loadZone() {
  const childId = document.getElementById('child-select').value;

  const noChildPrompt = document.getElementById('no-child-prompt');
  const zoneDisplay   = document.getElementById('zone-display');
  const noZone        = document.getElementById('no-zone');

  /* ── No child selected: show prompt, hide everything else ── */
  if (!childId) {
    noChildPrompt.classList.remove('hidden');
    zoneDisplay.classList.add('hidden');
    noZone.classList.add('hidden');
    return;
  }

  /* ── Child selected: hide the "select a child" prompt ── */
  noChildPrompt.classList.add('hidden');

  const result = await window.electronAPI.calculateZone(parseInt(childId));

  /* ── No PEF data entered today ── */
  if (result.zone === 'grey') {
    zoneDisplay.classList.add('hidden');
    noZone.classList.remove('hidden');
    return;
  }

  /* ── PEF data exists — show the zone bar ── */
  noZone.classList.add('hidden');
  zoneDisplay.classList.remove('hidden');

  const config = ZONE_CONFIG[result.zone] || ZONE_CONFIG.green;
  const pct    = result.percentage || 0;

  // ── Segmented bar proportions (fixed visual thirds)
  document.getElementById('seg-green').style.flex  = '30';
  document.getElementById('seg-yellow').style.flex = '30';
  document.getElementById('seg-red').style.flex    = '40';

  // ── Sliding marker: bar is now red(left) | yellow(middle) | green(right)
  // Red   = 0–49  maps to 0–40% of bar  (left side)
  // Yellow= 50–79 maps to 40–70% of bar (middle)
  // Green = 80–100 maps to 70–100% of bar (right side)
  let markerLeft;
  if (pct >= 80) {
    markerLeft = 70 + ((pct - 80) / 20) * 30;   // 80–100 → 70–100%
  } else if (pct >= 50) {
    markerLeft = 40 + ((pct - 50) / 30) * 30;   // 50–79  → 40–70%
  } else {
    markerLeft = (pct / 50) * 40;                // 0–49   → 0–40%
  }
  document.getElementById('zone-marker').style.left = markerLeft + '%';

  // ── Zone name (zone-circle left blank, zone-label shows the name)
  document.getElementById('zone-circle').textContent = '';
  const labelEl = document.getElementById('zone-label');
  const zoneName = result.zone.charAt(0).toUpperCase() + result.zone.slice(1) + ' Zone';
  labelEl.textContent = zoneName;
  labelEl.className   = 'zone-name-badge ' + result.zone;

  // ── Percentage
  const pctLabel = pct ? pct + '% of personal best' : '';
  document.getElementById('zone-pct').textContent = pctLabel;
  labelEl.setAttribute('aria-label', zoneName + (pctLabel ? ' — ' + pctLabel : ''));

  // ── Message card
  const msgEl = document.getElementById('zone-message');
  msgEl.textContent = config.message;
  msgEl.className   = 'zone-message-card ' + result.zone;
}


async function initializePage() {
  const session = await window.electronAPI.getSession();
  if (!session || !session.userId) { window.electronAPI.navigate('landing'); return; }

  const navData  = await window.electronAPI.getNavigationData();
  const children = await window.electronAPI.getChildren();
  const select   = document.getElementById('child-select');

  /* Populate dropdown */
  select.innerHTML = '<option value="">— Select a child —</option>';
  children.forEach(c => {
    const o = document.createElement('option');
    o.value = c.child_id;
    o.textContent = c.name;
    select.appendChild(o);
  });

  /* Auto-select if navigated here with a child in context */
  if (navData && navData.childId) {
    select.value = navData.childId;
    loadZone();
  }
  /* Otherwise the "select a child" prompt is already visible (default state) */
}

document.addEventListener('DOMContentLoaded', () => {
  initializePage();
  document.getElementById('back-btn').addEventListener('click', () => window.electronAPI.navigate('parent-main'));
  document.getElementById('child-select').addEventListener('change', loadZone);
  // Navigate to Enter PEF — used by both "Enter PEF Now" and "Re-enter PEF" buttons
  function goToEnterPef() {
    const childId = parseInt(document.getElementById('child-select').value);
    window.electronAPI.navigate('parent-enter-pef', { childId, fromZone: true });
  }

  document.getElementById('enter-pef-btn').addEventListener('click', goToEnterPef);
  document.getElementById('reenter-pef-btn').addEventListener('click', goToEnterPef);
});
