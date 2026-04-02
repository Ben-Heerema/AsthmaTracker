/**
 * provider-sharing.js — Provider Sharing Settings
 */

const SHARING_FIELDS = [
  { key: 'shareRescueLogs',          label: 'Rescue Inhaler Logs' },
  { key: 'shareControllerAdherence', label: 'Controller Adherence' },
  { key: 'shareSymptomsChart',       label: 'Symptoms Chart' },
  { key: 'shareTriggers',            label: 'Trigger History' },
  { key: 'sharePef',                 label: 'Peak Flow (PEF) Data' },
  { key: 'shareTriageIncidents',     label: 'Triage Incidents' },
  { key: 'shareSummaryCharts',       label: 'Summary Charts' },
];

function buildToggles(currentSettings) {
  const container = document.getElementById('sharing-toggles');
  container.innerHTML = SHARING_FIELDS.map(f => `
    <div class="toggle-wrapper">
      <label class="toggle">
        <input type="checkbox" id="toggle-${f.key}"
          ${currentSettings && currentSettings[f.key] ? 'checked' : ''}
          aria-label="${f.label}">
        <span class="toggle-slider"></span>
      </label>
      <span>${f.label}</span>
    </div>
  `).join('');
}

function getToggledSettings() {
  const s = {};
  SHARING_FIELDS.forEach(f => {
    const el = document.getElementById('toggle-' + f.key);
    s[f.key] = el ? el.checked : false;
  });
  return s;
}

document.addEventListener('DOMContentLoaded', async () => {
  const session = await window.electronAPI.getSession();
  if (!session || !session.userId) { window.electronAPI.navigate('landing'); return; }

  const navData = await window.electronAPI.getNavigationData();
  const childId = navData && navData.childId ? parseInt(navData.childId) : null;
  if (!childId) { window.electronAPI.navigate('parent-child-overview'); return; }

  buildToggles(null);

  document.getElementById('back-btn').addEventListener('click', () => {
    window.electronAPI.navigate('parent-child-overview', { childId });
  });

  document.getElementById('generate-code-btn').addEventListener('click', async () => {
    const btn = document.getElementById('generate-code-btn');
    btn.disabled = true;
    btn.textContent = 'Generating…';

    try {
      const settings = getToggledSettings();
      const result = await window.electronAPI.generateAccessCode({ childId, sharingSettings: settings });
      if (result.success) {
        document.getElementById('code-text').textContent = result.code;
        document.getElementById('code-expiry').textContent = 'Expires: ' + new Date(result.expiresAt).toLocaleString();
        document.getElementById('code-display').classList.remove('hidden');
      } else {
        showToast('Failed to generate code: ' + result.error, 'error');
      }
    } catch (err) {
      console.error('Failed to generate access code:', err);
      showToast('Something went wrong. Please try again.', 'error');
    }

    btn.disabled = false;
    btn.textContent = '🔑 Generate Access Code';
  });

  document.getElementById('save-sharing-btn').addEventListener('click', async () => {
    const btn = document.getElementById('save-sharing-btn');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
      const settings = getToggledSettings();
      await window.electronAPI.updateSharingSettings({
        childId,
        parentId: session.userId,
        ...settings
      });
      showToast('Sharing settings saved!', 'success');
    } catch (err) {
      console.error('Failed to save sharing settings:', err);
      showToast('Failed to save settings. Please try again.', 'error');
    }

    btn.disabled = false;
    btn.textContent = '💾 Save Settings';
  });
});
