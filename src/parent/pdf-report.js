/**
 * pdf-report.js — PDF Report Generation Page Logic
 *
 * This page gathers report data, renders Chart.js charts on hidden canvases,
 * exports them as base64 PNG images, and passes everything to main.js via IPC.
 * Main.js uses PDFKit to create the actual PDF file with embedded charts.
 */

let selectedChildId = null;

function onChildSelected() {
  const val = document.getElementById('child-select').value;
  selectedChildId = val ? parseInt(val) : null;
  document.getElementById('form-area').classList.toggle('hidden', !selectedChildId);

  if (selectedChildId) {
    // Enforce 3–6 month range:
    //   min  = 6 months ago (earliest allowed start date)
    //   max  = 3 months ago (latest allowed start date)
    //   default value = 3 months ago (sensible starting point)
    const now    = new Date();

    const sixMonthsAgo   = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const dateInput = document.getElementById('start-date');
    dateInput.min   = sixMonthsAgo.toISOString().split('T')[0];
    dateInput.max   = threeMonthsAgo.toISOString().split('T')[0];
    dateInput.value = threeMonthsAgo.toISOString().split('T')[0];
  }
}

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

  // Chart.js needs animation disabled for immediate rendering
  config.options = config.options || {};
  config.options.animation = false;
  config.options.responsive = false;

  const chart = new Chart(ctx, config);

  // Force a synchronous render
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

  // Add personal best reference line if available
  if (personalBestPef && personalBestPef > 0) {
    datasets.push({
      label: 'Personal Best',
      data: new Array(labels.length).fill(personalBestPef),
      borderColor: '#28a745',
      borderDash: [6, 4],
      pointRadius: 0,
      fill: false
    });
    // Add 80% threshold (green/yellow boundary)
    datasets.push({
      label: '80% (Green/Yellow)',
      data: new Array(labels.length).fill(personalBestPef * 0.8),
      borderColor: '#ffc107',
      borderDash: [4, 4],
      pointRadius: 0,
      fill: false
    });
    // Add 50% threshold (yellow/red boundary)
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
      labels: ['Green Zone (≥80%)', 'Yellow Zone (50–79%)', 'Red Zone (<50%)'],
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

  const severityMap = { none: 0, some: 1, a_lot: 2 };
  const symptoms = ['night_waking', 'activity_limits', 'coughing', 'wheezing'];
  const symptomLabels = ['Night Waking', 'Activity Limits', 'Coughing', 'Wheezing'];

  // Count severity levels per symptom
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

// =============================================================================
// PDF GENERATION
// =============================================================================

async function generatePdf() {
  if (!selectedChildId) return;

  const btn = document.getElementById('generate-btn');
  btn.disabled    = true;
  btn.textContent = '⏳ Gathering data...';

  // Gather all data in parallel for efficiency
  let child, adherence, incidents, logs, checkins, pefHistory, medications, schedule, techniqueSessions;
  try {
    [child, adherence, incidents, logs, checkins, pefHistory, medications, schedule, techniqueSessions] =
      await Promise.all([
        window.electronAPI.getChild(selectedChildId),
        window.electronAPI.getMedicationAdherence(selectedChildId),
        window.electronAPI.getIncidents(selectedChildId),
        window.electronAPI.getMedicationLogs({ childId: selectedChildId, days: 180 }),
        window.electronAPI.getCheckinHistory({ childId: selectedChildId, days: 180 }),
        window.electronAPI.getPefHistory({ childId: selectedChildId, days: 180 }),
        window.electronAPI.getMedications(selectedChildId),
        window.electronAPI.getControllerSchedule(selectedChildId),
        window.electronAPI.countTechniqueSessions(selectedChildId)
      ]);
  } catch (err) {
    console.error('[pdf-report] Failed to gather data:', err);
    btn.disabled = false;
    btn.textContent = '\u{1F4C4} Generate & Save PDF';
    showToast('Failed to gather report data. Please try again.', 'error');
    return;
  }

  if (!child) {
    btn.disabled = false;
    btn.textContent = '\u{1F4C4} Generate & Save PDF';
    showToast('Could not load child data. Please try again.', 'error');
    return;
  }

  const startDate  = document.getElementById('start-date').value;
  const endDate    = new Date().toISOString().split('T')[0];
  const rescueLogs = logs.filter(l => l.is_rescue);
  const controllerLogs = logs.filter(l => !l.is_rescue);

  // Build trigger summary from check-ins
  const triggerNames = [
    'trigger_exercise', 'trigger_cold_air', 'trigger_dust',
    'trigger_smoke', 'trigger_illness', 'trigger_strong_odors'
  ];
  const triggerLabels = {
    trigger_exercise: 'Exercise', trigger_cold_air: 'Cold Air',
    trigger_dust: 'Dust', trigger_smoke: 'Smoke',
    trigger_illness: 'Illness', trigger_strong_odors: 'Strong Odors'
  };
  const triggers = checkins
    .filter(c => triggerNames.some(t => c[t]))
    .map(c => ({
      date: c.date,
      triggersText: triggerNames.filter(t => c[t]).map(t => triggerLabels[t]).join(', ')
    }));

  // Build PEF zone summary
  let pefZoneSummary = null;
  if (pefHistory && pefHistory.length > 0 && child && child.personal_best_pef && child.personal_best_pef > 0) {
    let green = 0, yellow = 0, red = 0;
    for (const entry of pefHistory) {
      if (!entry.daily_pef) continue;
      const pct = (entry.daily_pef / child.personal_best_pef) * 100;
      if (pct >= 80) green++;
      else if (pct >= 50) yellow++;
      else red++;
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
  } catch (err) {
    console.error('[pdf-report] Chart rendering failed (continuing without charts):', err);
  }

  btn.textContent = '📄 Generating PDF...';

  const result = await window.electronAPI.generatePdf({
    childName:  child.name,
    birthday:   child.birthday,
    personalBestPef: child.personal_best_pef,
    startDate,
    endDate,
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
  btn.textContent = '📄 Generate & Save PDF';

  if (result.success) {
    const msg = document.getElementById('success-msg');
    msg.classList.remove('hidden');
    setTimeout(() => msg.classList.add('hidden'), 5000);
  } else if (!result.canceled) {
    showToast('Failed to generate PDF: ' + (result.error || 'Unknown error'), 'error');
  }
}

async function initializePage() {
  const session = await window.electronAPI.getSession();
  if (!session || !session.userId) { window.electronAPI.navigate('landing'); return; }

  const children = await window.electronAPI.getChildren();
  const select   = document.getElementById('child-select');
  select.innerHTML = '<option value="">— Select a child —</option>';
  children.forEach(c => {
    const o = document.createElement('option');
    o.value = c.child_id; o.textContent = c.name; select.appendChild(o);
  });
}
document.addEventListener('DOMContentLoaded', () => {
  initializePage();
  document.getElementById('back-btn').addEventListener('click', () => window.electronAPI.navigate('parent-main'));
  document.getElementById('child-select').addEventListener('change', onChildSelected);
  document.getElementById('generate-btn').addEventListener('click', generatePdf);
});
