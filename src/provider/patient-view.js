/**
 * patient-view.js — Provider's Patient View Logic
 *
 * Shows a patient's data based on what the parent has permitted sharing.
 * Each section is only visible if the corresponding sharing toggle is on.
 *
 * Data is read-only — providers cannot modify any patient information.
 */

/** Escape HTML special characters to prevent XSS from database content */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

let childId    = null;
let providerId = null;
const BREATHING_LABELS = ['Very Bad', 'Bad', 'Normal', 'Good', 'Very Good'];

// =============================================================================
// CHART RENDERING — Renders charts on hidden canvases and exports as base64 PNG
// =============================================================================

/**
 * Render a Chart.js chart on a canvas and return a base64 PNG data URL.
 * Destroys the chart instance after export so the canvas can be reused.
 */
function renderChartToBase64(canvasId, config) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  config.options = config.options || {};
  config.options.animation = false;
  config.options.responsive = false;

  const chart = new Chart(ctx, config);
  chart.update('none');

  const dataUrl = canvas.toDataURL('image/png');
  chart.destroy();
  return dataUrl;
}

/**
 * Generate PEF trend line chart (daily PEF values over time).
 */
function generatePefTrendChart(pefHistory, personalBestPef) {
  const entries = pefHistory.filter(p => p.daily_pef);
  if (entries.length === 0) return null;

  const labels = entries.map(p => p.date);
  const values = entries.map(p => p.daily_pef);

  const datasets = [
    {
      label: 'Daily PEF (L/min)',
      data: values,
      borderColor: '#4A90D9',
      backgroundColor: 'rgba(74, 144, 217, 0.1)',
      fill: true,
      tension: 0.3,
      pointRadius: 3
    }
  ];

  if (personalBestPef && personalBestPef > 0) {
    datasets.push({
      label: 'Personal Best',
      data: new Array(labels.length).fill(personalBestPef),
      borderColor: '#28a745',
      borderDash: [6, 4],
      pointRadius: 0,
      fill: false
    });
    datasets.push({
      label: '80% (Green/Yellow)',
      data: new Array(labels.length).fill(personalBestPef * 0.8),
      borderColor: '#ffc107',
      borderDash: [4, 4],
      pointRadius: 0,
      fill: false
    });
    datasets.push({
      label: '50% (Yellow/Red)',
      data: new Array(labels.length).fill(personalBestPef * 0.5),
      borderColor: '#dc3545',
      borderDash: [4, 4],
      pointRadius: 0,
      fill: false
    });
  }

  return renderChartToBase64('chart-pef-trend', {
    type: 'line',
    data: { labels, datasets },
    options: {
      plugins: {
        title: { display: true, text: 'Peak Expiratory Flow Over Time', font: { size: 14 } },
        legend: { position: 'bottom', labels: { font: { size: 10 } } }
      },
      scales: {
        x: {
          title: { display: true, text: 'Date' },
          ticks: { maxTicksLimit: 12, maxRotation: 45 }
        },
        y: {
          title: { display: true, text: 'PEF (L/min)' },
          beginAtZero: false
        }
      }
    }
  });
}

/**
 * Generate PEF zone distribution doughnut chart.
 */
function generatePefZoneChart(pefZoneSummary) {
  if (!pefZoneSummary) return null;
  const { green, yellow, red } = pefZoneSummary;
  if (green + yellow + red === 0) return null;

  return renderChartToBase64('chart-pef-zones', {
    type: 'doughnut',
    data: {
      labels: ['Green Zone (\u226580%)', 'Yellow Zone (50\u201379%)', 'Red Zone (<50%)'],
      datasets: [{
        data: [green, yellow, red],
        backgroundColor: ['#28a745', '#ffc107', '#dc3545']
      }]
    },
    options: {
      plugins: {
        title: { display: true, text: 'PEF Zone Distribution', font: { size: 14 } },
        legend: { position: 'bottom', labels: { font: { size: 11 } } }
      }
    }
  });
}

/**
 * Generate symptom severity stacked bar chart from check-in history.
 */
function generateSymptomChart(checkins) {
  if (!checkins || checkins.length === 0) return null;

  const symptoms = ['night_waking', 'activity_limits', 'coughing', 'wheezing'];
  const symptomLabels = ['Night Waking', 'Activity Limits', 'Coughing', 'Wheezing'];

  const noneCounts = [];
  const someCounts = [];
  const aLotCounts = [];

  for (const symptom of symptoms) {
    let none = 0, some = 0, aLot = 0;
    for (const c of checkins) {
      const val = c[symptom];
      if (val === 'none') none++;
      else if (val === 'some') some++;
      else if (val === 'a_lot') aLot++;
    }
    noneCounts.push(none);
    someCounts.push(some);
    aLotCounts.push(aLot);
  }

  return renderChartToBase64('chart-symptoms', {
    type: 'bar',
    data: {
      labels: symptomLabels,
      datasets: [
        { label: 'None', data: noneCounts, backgroundColor: '#28a745' },
        { label: 'Some', data: someCounts, backgroundColor: '#ffc107' },
        { label: 'A Lot', data: aLotCounts, backgroundColor: '#dc3545' }
      ]
    },
    options: {
      plugins: {
        title: { display: true, text: 'Symptom Severity Distribution', font: { size: 14 } },
        legend: { position: 'bottom', labels: { font: { size: 11 } } }
      },
      scales: {
        x: { stacked: true },
        y: { stacked: true, title: { display: true, text: 'Number of Days' }, beginAtZero: true }
      }
    }
  });
}

/** Show a card section */
function showCard(id) {
  document.getElementById(id).classList.remove('hidden');
}

async function initializePage() {
  try {
    const session = await window.electronAPI.getSession();
    if (!session || !session.userId) { window.electronAPI.navigate('landing'); return; }
    providerId = session.userId;

    const navData = await window.electronAPI.getNavigationData();
    if (!navData || !navData.childId) { window.electronAPI.navigate('provider-main'); return; }
    childId = navData.childId;

    // Load sharing permissions for this provider-child pair
    const access = await window.electronAPI.getSharingSettings({ providerId, childId });

    // Always show basic patient info
    const child = await window.electronAPI.getChild(childId);
    document.getElementById('patient-name').textContent = child.name;
    const today = new Date();
    const age   = Math.floor((today - new Date(child.birthday)) / (365.25 * 24 * 60 * 60 * 1000));
    document.getElementById('patient-info').innerHTML = `
      <div class="pv-info-grid">
        <div class="pv-info-item">
          <span class="pv-info-label">Name</span>
          <span class="pv-info-value">${escapeHtml(child.name)}</span>
        </div>
        <div class="pv-info-item">
          <span class="pv-info-label">Age</span>
          <span class="pv-info-value">${age} years old</span>
        </div>
        <div class="pv-info-item">
          <span class="pv-info-label">Birthday</span>
          <span class="pv-info-value">${escapeHtml(child.birthday)}</span>
        </div>
        ${child.personal_best_pef ? `
        <div class="pv-info-item">
          <span class="pv-info-label">Personal Best PEF</span>
          <span class="pv-info-value">${child.personal_best_pef} L/min</span>
        </div>` : ''}
        ${child.notes ? `<div class="pv-info-notes">${escapeHtml(child.notes)}</div>` : ''}
      </div>
    `;

    // Conditionally load each section based on sharing settings
    if (access) {
      if (access.share_pef) {
        showCard('zone-card');
        showCard('pef-card');
        await loadPefData(child);
      }
      if (access.share_controller_adherence) {
        showCard('adherence-card');
        await loadAdherence();
      }
      if (access.share_symptoms_chart) {
        showCard('symptoms-card');
        await loadSymptoms();
      }
      if (access.share_triggers) {
        showCard('triggers-card');
        await loadTriggers();
      }
      if (access.share_rescue_logs) {
        showCard('rescue-card');
        await loadRescueLogs();
      }
      if (access.share_triage_incidents) {
        showCard('incidents-card');
        await loadIncidents();
      }
    }
  } catch (err) {
    console.error('Failed to initialize patient view:', err);
    document.getElementById('patient-name').textContent = 'Error loading patient';
  }
}

async function loadPefData(child) {
  try {
    const zone = await window.electronAPI.calculateZone(childId);
    document.getElementById('zone-body').innerHTML = `
      <div class="zone-display zone-${zone.zone}" style="width:150px;height:150px;font-size:var(--font-size-lg)">
        <div>${zone.zone.toUpperCase()}</div>
        ${zone.percentage ? `<div style="font-size:0.875rem">${zone.percentage}% of PB</div>` : ''}
      </div>
    `;

    const pefHistory = await window.electronAPI.getPefHistory({ childId, days: 30 });
    if (pefHistory.length === 0) {
      document.getElementById('pef-body').innerHTML = '<p class="pv-empty">No PEF data available</p>';
      return;
    }
    const rows = pefHistory.slice(-10).reverse().map(p => `
      <tr>
        <td>${p.date}</td>
        <td>${p.daily_pef || '-'}</td>
        <td>${p.pre_medication_pef || '-'}</td>
        <td>${p.post_medication_pef || '-'}</td>
      </tr>
    `).join('');
    document.getElementById('pef-body').innerHTML = `
      <table class="pv-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Daily PEF</th>
            <th>Pre-Med</th>
            <th>Post-Med</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  } catch (err) {
    console.error('Failed to load PEF data:', err);
    document.getElementById('pef-body').innerHTML = '<p class="text-muted">Could not load PEF data</p>';
  }
}

async function loadAdherence() {
  try {
    const a = await window.electronAPI.getMedicationAdherence(childId);
    document.getElementById('adherence-body').innerHTML = `
      <div class="pv-adherence">
        <div class="pv-adherence-pct">${a.percentage}%</div>
        <div class="pv-adherence-detail">${a.daysCompleted} of ${a.daysPlanned} days (last 30 days)</div>
      </div>
    `;
  } catch (err) {
    console.error('Failed to load adherence data:', err);
    document.getElementById('adherence-body').innerHTML = '<p class="text-muted">Could not load adherence data</p>';
  }
}

async function loadSymptoms() {
  try {
    const history = await window.electronAPI.getCheckinHistory({ childId, days: 14 });
    if (history.length === 0) {
      document.getElementById('symptoms-body').innerHTML = '<p class="pv-empty">No symptom data available</p>';
      return;
    }
    const rows = history.slice(-7).reverse().map(c => `
      <tr>
        <td>${c.date}</td>
        <td><span class="pv-symptom-badge ${c.night_waking}">${c.night_waking === 'a_lot' ? 'A Lot' : c.night_waking}</span></td>
        <td><span class="pv-symptom-badge ${c.coughing}">${c.coughing === 'a_lot' ? 'A Lot' : c.coughing}</span></td>
        <td><span class="pv-symptom-badge ${c.wheezing}">${c.wheezing === 'a_lot' ? 'A Lot' : c.wheezing}</span></td>
      </tr>
    `).join('');
    document.getElementById('symptoms-body').innerHTML = `
      <table class="pv-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Night Waking</th>
            <th>Coughing</th>
            <th>Wheezing</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  } catch (err) {
    console.error('Failed to load symptoms data:', err);
    document.getElementById('symptoms-body').innerHTML = '<p class="text-muted">Could not load symptom data</p>';
  }
}

async function loadTriggers() {
  try {
    const history = await window.electronAPI.getCheckinHistory({ childId, days: 30 });
    const triggers = { exercise: 0, cold_air: 0, dust: 0, smoke: 0, illness: 0, strong_odors: 0 };
    history.forEach(c => {
      if (c.trigger_exercise)    triggers.exercise++;
      if (c.trigger_cold_air)    triggers.cold_air++;
      if (c.trigger_dust)        triggers.dust++;
      if (c.trigger_smoke)       triggers.smoke++;
      if (c.trigger_illness)     triggers.illness++;
      if (c.trigger_strong_odors) triggers.strong_odors++;
    });
    const labels = { exercise: 'Exercise', cold_air: 'Cold Air', dust: 'Dust/Allergens', smoke: 'Smoke', illness: 'Illness', strong_odors: 'Strong Odors' };
    const triggerIcons = { exercise: '🏃', cold_air: '🥶', dust: '🌫️', smoke: '💨', illness: '🤒', strong_odors: '👃' };
    const items = Object.keys(triggers)
      .filter(k => triggers[k] > 0)
      .sort((a, b) => triggers[b] - triggers[a])
      .map(k => `
        <div class="pv-trigger-row">
          <span class="pv-trigger-name">
            <span aria-hidden="true">${triggerIcons[k] || ''}</span>
            ${labels[k]}
          </span>
          <span class="pv-trigger-count">${triggers[k]} day${triggers[k] !== 1 ? 's' : ''}</span>
        </div>`).join('');
    document.getElementById('triggers-body').innerHTML = items || '<p class="pv-empty">No triggers recorded</p>';
  } catch (err) {
    console.error('Failed to load triggers data:', err);
    document.getElementById('triggers-body').innerHTML = '<p class="text-muted">Could not load trigger data</p>';
  }
}

async function loadRescueLogs() {
  try {
    const logs = await window.electronAPI.getMedicationLogs({ childId, days: 30 });
    const rescue = logs.filter(l => l.is_rescue);
    if (rescue.length === 0) {
      document.getElementById('rescue-body').innerHTML = '<p class="pv-empty">No rescue medication uses</p>';
      return;
    }
    document.getElementById('rescue-body').innerHTML = rescue.slice(0, 10).map(l => `
      <div class="pv-rescue-entry">
        <div class="pv-rescue-top">
          <span class="pv-rescue-name">${escapeHtml(l.medication_name)}</span>
          <span class="pv-rescue-doses">${l.doses_taken} dose${l.doses_taken !== 1 ? 's' : ''}</span>
        </div>
        <div class="pv-rescue-time">${new Date(l.timestamp).toLocaleString()}</div>
        <div class="pv-rescue-breathing">
          <span class="pv-breathing-tag">${BREATHING_LABELS[l.breathing_before] ?? 'N/A'}</span>
          <span class="pv-breathing-arrow" aria-hidden="true">\u2192</span>
          <span class="pv-breathing-tag">${BREATHING_LABELS[l.breathing_after] ?? 'N/A'}</span>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Failed to load rescue logs:', err);
    document.getElementById('rescue-body').innerHTML = '<p class="text-muted">Could not load rescue medication data</p>';
  }
}

async function loadIncidents() {
  try {
    const incidents = await window.electronAPI.getIncidents(childId);
    if (incidents.length === 0) {
      document.getElementById('incidents-body').innerHTML = '<p class="pv-empty">No triage incidents recorded</p>';
      return;
    }
    document.getElementById('incidents-body').innerHTML = incidents.slice(0, 5).map(inc => {
      const flags = [];
      if (!inc.can_speak_full_sentences) flags.push('Cannot speak in full sentences');
      if (inc.chest_retracting)          flags.push('Chest retracting');
      if (inc.blue_grey_lips)            flags.push('Blue/grey lips');
      return `
      <div class="pv-incident">
        <div class="pv-incident-time">${new Date(inc.timestamp).toLocaleString()}</div>
        ${flags.length ? `<div class="pv-incident-flags">
          ${flags.map(f => `<span class="pv-incident-flag"><span aria-hidden="true">\u26A0\uFE0F</span> ${f}</span>`).join('')}
        </div>` : ''}
        ${inc.current_pef ? `<div class="pv-incident-pef">PEF: ${inc.current_pef} L/min</div>` : ''}
        ${inc.user_notes ? `<div class="pv-incident-notes">${escapeHtml(inc.user_notes)}</div>` : ''}
      </div>`;
    }).join('');
  } catch (err) {
    console.error('Failed to load incidents:', err);
    document.getElementById('incidents-body').innerHTML = '<p class="text-muted">Could not load incident data</p>';
  }
}

async function generatePatientPdf() {
  const btn = document.getElementById('generate-pdf-btn');
  btn.disabled    = true;
  btn.textContent = '⏳ Gathering data...';

  try {
    // Gather all data sources in parallel — mirrors the parent PDF page
    const [child, adherence, incidents, logs, checkins, pefHistory, medications, schedule, techniqueSessions] =
      await Promise.all([
        window.electronAPI.getChild(childId),
        window.electronAPI.getMedicationAdherence(childId),
        window.electronAPI.getIncidents(childId),
        window.electronAPI.getMedicationLogs({ childId, days: 180 }),
        window.electronAPI.getCheckinHistory({ childId, days: 180 }),
        window.electronAPI.getPefHistory({ childId, days: 180 }),
        window.electronAPI.getMedications(childId),
        window.electronAPI.getControllerSchedule(childId),
        window.electronAPI.countTechniqueSessions(childId)
      ]);

    const rescueLogs     = logs.filter(l => l.is_rescue);
    const controllerLogs = logs.filter(l => !l.is_rescue);
    const start          = new Date(); start.setMonth(start.getMonth() - 3);

    // Build trigger summary from check-ins
    const triggerNames  = ['trigger_exercise','trigger_cold_air','trigger_dust','trigger_smoke','trigger_illness','trigger_strong_odors'];
    const triggerLabels = { trigger_exercise:'Exercise', trigger_cold_air:'Cold Air', trigger_dust:'Dust', trigger_smoke:'Smoke', trigger_illness:'Illness', trigger_strong_odors:'Strong Odors' };
    const triggers = checkins
      .filter(c => triggerNames.some(t => c[t]))
      .map(c => ({ date: c.date, triggersText: triggerNames.filter(t => c[t]).map(t => triggerLabels[t]).join(', ') }));

    // Build PEF zone summary
    let pefZoneSummary = null;
    if (pefHistory.length > 0 && child.personal_best_pef) {
      let green = 0, yellow = 0, red = 0;
      for (const entry of pefHistory) {
        if (!entry.daily_pef) continue;
        const pct = (entry.daily_pef / child.personal_best_pef) * 100;
        if (pct >= 80) green++; else if (pct >= 50) yellow++; else red++;
      }
      pefZoneSummary = { green, yellow, red };
    }

    // Render charts on hidden canvases and export as base64 images
    btn.textContent = '📊 Rendering charts...';

    const chartImages = {};
    try {
      const pefTrend = generatePefTrendChart(pefHistory || [], child.personal_best_pef);
      if (pefTrend) chartImages.pefTrend = pefTrend;

      const pefZones = generatePefZoneChart(pefZoneSummary);
      if (pefZones) chartImages.pefZones = pefZones;

      const symptomChart = generateSymptomChart(checkins);
      if (symptomChart) chartImages.symptoms = symptomChart;
    } catch (chartErr) {
      console.error('[patient-view] Chart rendering failed (continuing without charts):', chartErr);
    }

    btn.textContent = '📄 Generating PDF...';

    await window.electronAPI.generatePdf({
      childName:       child.name,
      birthday:        child.birthday,
      personalBestPef: child.personal_best_pef,
      startDate:       start.toISOString().split('T')[0],
      endDate:         new Date().toISOString().split('T')[0],
      adherence,
      incidents,
      rescueLogs,
      controllerLogs,
      checkins,
      pefHistory,
      pefZoneSummary,
      medications,
      schedule,
      techniqueSessions,
      triggers,
      chartImages
    });

    btn.disabled    = false;
    btn.textContent = '📄 Generate PDF Report';
  } catch (err) {
    console.error('Failed to generate PDF report:', err);
    btn.disabled    = false;
    btn.textContent = '📄 Generate PDF Report';
    showToast('Could not generate the PDF report. Please try again.', 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initializePage();
  document.getElementById('back-btn').addEventListener('click', () => window.electronAPI.navigate('provider-main'));
  document.getElementById('generate-pdf-btn').addEventListener('click', generatePatientPdf);
});
