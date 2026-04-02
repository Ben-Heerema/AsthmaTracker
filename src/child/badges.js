/** Escape HTML special characters to prevent XSS from database content */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/**
 * badges.js — Child Badges Page Logic
 *
 * Fetches badges from main.js (which checks criteria and marks newly achieved ones).
 * Achieved badges are shown with gold border and emoji icon.
 * Unachieved badges are greyed out with lock icon.
 */

async function initializePage() {
  try {
    const session = await window.electronAPI.getSession();
    if (!session || !session.childId) { window.electronAPI.navigate('landing'); return; }

    // getBadges also auto-checks if any badges are newly achieved
    const badges    = await window.electronAPI.getBadges(session.childId);
    const container = document.getElementById('badges-grid');

    if (badges.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon" aria-hidden="true">🏅</div>
          <p>No badges yet</p>
          <p class="badges-empty-hint">Ask your parent to create badges for you!</p>
        </div>
      `;
      return;
    }

    const achieved   = badges.filter(b => b.is_achieved);
    const unachieved = badges.filter(b => !b.is_achieved);

    container.innerHTML = '';

    // Show achieved count summary if any
    if (achieved.length > 0) {
      container.innerHTML += `
        <div class="badges-summary">
          <div class="badges-summary-icon" aria-hidden="true">🏆</div>
          <div class="badges-summary-text">
            ${achieved.length} badge${achieved.length !== 1 ? 's' : ''} earned!
          </div>
        </div>
      `;
    }

    container.innerHTML += '<div class="badge-grid" id="badge-items"></div>';
    const grid = document.getElementById('badge-items');

    // Render achieved first, then unachieved
    [...achieved, ...unachieved].forEach(badge => {
      const item = document.createElement('div');
      item.className = 'badge-item' + (badge.is_achieved ? ' achieved' : '');

      // Build progress bar for unachieved badges with trackable progress
      let progressHtml = '';
      if (!badge.is_achieved && badge.progress) {
        const p = badge.progress;
        progressHtml += `<div class="badge-hint"><span aria-hidden="true">💡</span> ${escapeHtml(p.hint)}</div>`;
        if (p.current !== null && p.target) {
          const pct = Math.min(100, Math.round((p.current / p.target) * 100));
          progressHtml += `
            <div class="badge-progress">
              <div class="badge-progress-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${p.current} of ${p.target} completed">
                <div class="badge-progress-fill" style="width:${pct}%"></div>
              </div>
              <div class="badge-progress-label">${p.current} / ${p.target}</div>
            </div>
          `;
        }
      }

      item.innerHTML = `
        <div class="badge-icon ${badge.is_achieved ? '' : 'grey'}" aria-hidden="true">
          ${badge.is_achieved ? '🏅' : '🔒'}
        </div>
        <div class="badge-name">${escapeHtml(badge.badge_name)}</div>
        <div class="badge-desc">${escapeHtml(badge.badge_description)}</div>
        ${progressHtml}
        <div class="badge-status ${badge.is_achieved ? 'achieved' : 'text-muted'}">
          ${badge.is_achieved
            ? '<span aria-hidden="true">✅</span> Earned ' + new Date(badge.achieved_at).toLocaleDateString()
            : 'Not yet earned'}
        </div>
      `;
      grid.appendChild(item);
    });
  } catch (err) {
    console.error('Failed to initialize badges page:', err);
    const container = document.getElementById('badges-grid');
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon" aria-hidden="true">⚠️</div>
        <p>Could not load badges</p>
        <p class="badges-empty-hint">Please go back and try again.</p>
      </div>
    `;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initializePage();
  document.getElementById('back-btn').addEventListener('click', () => window.electronAPI.navigate('child-main'));
});
