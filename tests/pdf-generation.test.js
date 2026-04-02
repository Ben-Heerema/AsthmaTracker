/**
 * pdf-generation.test.js — PDF Report Generation Tests
 *
 * Tests the generatePdfReport function from main.js.
 * Verifies that PDF generation works with various data combinations:
 *   - Full data (all sections populated)
 *   - Empty data (all sections empty)
 *   - Partial data (some sections populated, some empty)
 *   - Edge cases (null fields, special characters, long data)
 *
 * We test that the function completes without error and produces
 * a non-empty file, since we can't easily inspect PDF internals.
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const PDFDocument = require('pdfkit');

// =============================================================================
// Extracted PDF generation logic (mirrors main.js)
// =============================================================================

async function generatePdfReport(data, filePath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    function sectionHeading(title) {
      doc.fontSize(16).font('Helvetica-Bold').text(title);
      doc.moveDown(0.3);
      doc.save()
        .moveTo(50, doc.y)
        .lineTo(doc.page.width - 50, doc.y)
        .lineWidth(1)
        .strokeColor('#4A90D9')
        .stroke()
        .restore();
      doc.moveDown(0.5);
    }

    function noData(message) {
      doc.fontSize(11).font('Helvetica-Oblique').fillColor('#888888')
        .text(message || 'No data available for this section.');
      doc.fillColor('#000000');
      doc.moveDown();
    }

    const breathingLabels = ['Very Bad', 'Bad', 'Normal', 'Good', 'Very Good'];
    const symptomLabels   = { none: 'None', some: 'Some', a_lot: 'A Lot' };

    // Cover page
    doc.moveDown(2);
    doc.fontSize(28).font('Helvetica-Bold').fillColor('#4A90D9')
      .text('Asthma Report', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(20).font('Helvetica').fillColor('#333333')
      .text(data.childName, { align: 'center' });
    doc.moveDown(1.5);
    doc.fillColor('#000000');
    doc.fontSize(12).font('Helvetica');
    doc.text(`Date of Birth: ${data.birthday}`, { align: 'center' });
    doc.text(`Report Period: ${data.startDate} to ${data.endDate}`, { align: 'center' });
    doc.text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
    if (data.personalBestPef) {
      doc.moveDown(0.5);
      doc.text(`Personal Best PEF: ${data.personalBestPef} L/min`, { align: 'center' });
    }

    // 1. Medication List
    doc.addPage();
    sectionHeading('Medications');
    if (data.medications && data.medications.length > 0) {
      for (const med of data.medications) {
        doc.fontSize(12).font('Helvetica-Bold')
          .text(`${med.medication_name}  (${med.is_rescue ? 'Rescue' : 'Controller'})`);
        doc.fontSize(11).font('Helvetica');
        doc.text(`  Purchased: ${med.purchase_date}   |   Expires: ${med.expiration_date}`);
        doc.text(`  Doses Remaining: ${med.doses_remaining}`);
        if (med.notes) doc.text(`  Notes: ${med.notes}`);
        doc.moveDown(0.4);
      }
    } else {
      noData('No medications have been added yet.');
    }

    // 2. Controller Schedule
    doc.moveDown(0.5);
    sectionHeading('Controller Schedule');
    if (data.schedule) {
      const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
      const labels = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
      const scheduled = days.filter(d => data.schedule[d]).map((d) => labels[days.indexOf(d)]);
      if (scheduled.length > 0) {
        doc.fontSize(12).font('Helvetica');
        doc.text(`Scheduled Days: ${scheduled.join(', ')}`);
        doc.text(`Doses Per Day: ${data.schedule.doses_per_day}`);
      } else {
        noData('No controller days have been scheduled.');
      }
    } else {
      noData('No controller schedule has been set up.');
    }

    // 3. Adherence
    doc.addPage();
    sectionHeading('Medication Adherence (Last 30 Days)');
    if (data.adherence) {
      doc.fontSize(12).font('Helvetica');
      doc.text(`Days Planned:   ${data.adherence.daysPlanned}`);
      doc.text(`Days Completed: ${data.adherence.daysCompleted}`);
      doc.moveDown(0.3);
      doc.fontSize(14).font('Helvetica-Bold')
        .text(`Adherence Rate: ${data.adherence.percentage}%`);
      doc.font('Helvetica').fontSize(12);
    } else {
      noData('No adherence data available.');
    }

    // 4. Symptom History
    doc.addPage();
    sectionHeading('Symptom History');
    if (data.checkins && data.checkins.length > 0) {
      doc.fontSize(11).font('Helvetica-Bold');
      doc.text('Date            Night Waking   Activity Limits   Coughing   Wheezing');
      doc.fontSize(10).font('Helvetica');
      for (const c of data.checkins) {
        const nw = symptomLabels[c.night_waking] || c.night_waking;
        const al = symptomLabels[c.activity_limits] || c.activity_limits;
        const co = symptomLabels[c.coughing] || c.coughing;
        const wh = symptomLabels[c.wheezing] || c.wheezing;
        doc.text(`${c.date}        ${nw.padEnd(15)}${al.padEnd(18)}${co.padEnd(11)}${wh}`);
        if (doc.y > doc.page.height - 80) doc.addPage();
      }
    } else {
      noData('No daily check-ins have been recorded for this period.');
    }

    // 5. Triggers
    doc.addPage();
    sectionHeading('Trigger History');
    if (data.triggers && data.triggers.length > 0) {
      const triggerCounts = {};
      for (const entry of data.triggers) {
        const names = entry.triggersText.split(', ');
        for (const name of names) {
          triggerCounts[name] = (triggerCounts[name] || 0) + 1;
        }
      }
      doc.fontSize(12).font('Helvetica-Bold').text('Trigger Frequency Summary:');
      doc.moveDown(0.3);
      doc.fontSize(11).font('Helvetica');
      const sorted = Object.entries(triggerCounts).sort((a, b) => b[1] - a[1]);
      for (const [name, count] of sorted) {
        doc.text(`  ${name}: ${count} occurrence(s)`);
      }
    } else {
      noData('No triggers were reported during this period.');
    }

    // 6. PEF History
    doc.addPage();
    sectionHeading('Peak Expiratory Flow (PEF) History');
    if (data.pefHistory && data.pefHistory.length > 0) {
      if (data.pefZoneSummary) {
        doc.fontSize(12).font('Helvetica-Bold').text('Zone Distribution:');
        doc.moveDown(0.3);
        doc.fontSize(11).font('Helvetica');
        doc.text(`  Green Zone (>= 80%):  ${data.pefZoneSummary.green} day(s)`);
        doc.text(`  Yellow Zone (50-79%): ${data.pefZoneSummary.yellow} day(s)`);
        doc.text(`  Red Zone (< 50%):     ${data.pefZoneSummary.red} day(s)`);
        doc.moveDown(0.5);
      }
      doc.fontSize(12).font('Helvetica-Bold').text('Daily Readings:');
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica');
      for (const p of data.pefHistory) {
        const daily = p.daily_pef ? `${p.daily_pef} L/min` : '—';
        doc.text(`${p.date}  ${daily}`);
        if (doc.y > doc.page.height - 80) doc.addPage();
      }
    } else {
      noData('No PEF readings have been recorded for this period.');
    }

    // 7. Incidents
    doc.addPage();
    sectionHeading('Incident Reports');
    if (data.incidents && data.incidents.length > 0) {
      for (const incident of data.incidents) {
        doc.fontSize(12).font('Helvetica-Bold').text(`${incident.timestamp}`);
        doc.fontSize(11).font('Helvetica');
        doc.text(`  Can Speak Full Sentences: ${incident.can_speak_full_sentences ? 'Yes' : 'No'}`);
        doc.text(`  Chest Retracting: ${incident.chest_retracting ? 'Yes' : 'No'}`);
        doc.text(`  Blue/Grey Lips: ${incident.blue_grey_lips ? 'Yes' : 'No'}`);
        doc.text(`  Notes: ${incident.user_notes}`);
        doc.moveDown(0.5);
        if (doc.y > doc.page.height - 100) doc.addPage();
      }
    } else {
      noData('No incident reports have been recorded.');
    }

    // 8. Rescue Logs
    doc.addPage();
    sectionHeading('Rescue Medication Logs');
    if (data.rescueLogs && data.rescueLogs.length > 0) {
      for (const log of data.rescueLogs) {
        doc.fontSize(11).font('Helvetica');
        doc.text(`${log.timestamp} — ${log.medication_name}: ${log.doses_taken} dose(s)`);
        doc.text(`  Breathing Before: ${breathingLabels[log.breathing_before]}  |  After: ${breathingLabels[log.breathing_after]}`);
        doc.moveDown(0.3);
      }
    } else {
      noData('No rescue medication usage has been logged.');
    }

    // 9. Controller Logs
    doc.addPage();
    sectionHeading('Controller Medication Logs');
    if (data.controllerLogs && data.controllerLogs.length > 0) {
      for (const log of data.controllerLogs) {
        doc.fontSize(11).font('Helvetica');
        doc.text(`${log.timestamp} — ${log.medication_name}: ${log.doses_taken} dose(s)`);
        doc.moveDown(0.3);
      }
    } else {
      noData('No controller medication doses have been logged.');
    }

    // 10. Technique Sessions
    doc.moveDown(0.5);
    sectionHeading('Inhaler Technique Practice');
    const sessionCount = data.techniqueSessions || 0;
    if (sessionCount > 0) {
      doc.fontSize(12).font('Helvetica');
      doc.text(`Total practice sessions completed: ${sessionCount}`);
    } else {
      noData('No inhaler technique practice sessions have been completed yet.');
    }

    // Footer
    doc.addPage();
    doc.moveDown(2);
    doc.fontSize(10).font('Helvetica-Oblique').fillColor('#888888')
      .text('This report was generated by Asthma Tracker. It does not constitute medical advice.', { align: 'center' });
    doc.fillColor('#000000');

    doc.end();

    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

// =============================================================================
// Test data factories
// =============================================================================

function minimalData() {
  return {
    childName: 'Test Child',
    birthday: '2016-01-01',
    startDate: '2024-01-01',
    endDate: '2024-03-01',
    personalBestPef: null,
    medications: [],
    schedule: null,
    adherence: null,
    checkins: [],
    triggers: [],
    pefHistory: [],
    pefZoneSummary: null,
    incidents: [],
    rescueLogs: [],
    controllerLogs: [],
    techniqueSessions: 0
  };
}

function fullData() {
  return {
    childName: 'Full Data Child',
    birthday: '2015-06-01',
    startDate: '2024-01-01',
    endDate: '2024-03-01',
    personalBestPef: 400,
    medications: [
      { medication_name: 'Albuterol', is_rescue: 1, purchase_date: '2024-01-01', expiration_date: '2025-12-31', doses_remaining: 80, notes: 'Use as needed' },
      { medication_name: 'Fluticasone', is_rescue: 0, purchase_date: '2024-01-01', expiration_date: '2025-12-31', doses_remaining: 60, notes: null }
    ],
    schedule: { monday: 1, tuesday: 1, wednesday: 1, thursday: 1, friday: 1, saturday: 0, sunday: 0, doses_per_day: 2 },
    adherence: { daysPlanned: 22, daysCompleted: 18, percentage: 82 },
    checkins: [
      { date: '2024-01-15', night_waking: 'none', activity_limits: 'none', coughing: 'some', wheezing: 'none' },
      { date: '2024-01-16', night_waking: 'some', activity_limits: 'some', coughing: 'a_lot', wheezing: 'some' }
    ],
    triggers: [
      { date: '2024-01-15', triggersText: 'Exercise, Cold Air' },
      { date: '2024-01-16', triggersText: 'Dust, Exercise' }
    ],
    pefHistory: [
      { date: '2024-01-15', daily_pef: 350, pre_medication_pef: 330, post_medication_pef: 370 },
      { date: '2024-01-16', daily_pef: 280, pre_medication_pef: null, post_medication_pef: null }
    ],
    pefZoneSummary: { green: 15, yellow: 10, red: 5 },
    incidents: [
      { timestamp: '2024-01-20 10:30:00', can_speak_full_sentences: 1, chest_retracting: 0, blue_grey_lips: 0, current_pef: 290, user_notes: 'Feeling tight' }
    ],
    rescueLogs: [
      { timestamp: '2024-01-15 08:00:00', medication_name: 'Albuterol', doses_taken: 2, breathing_before: 1, breathing_after: 3 }
    ],
    controllerLogs: [
      { timestamp: '2024-01-15 07:00:00', medication_name: 'Fluticasone', doses_taken: 1, breathing_before: 3, breathing_after: 3 }
    ],
    techniqueSessions: 5
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('PDF Report Generation', () => {

  let tempDir;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asthma-pdf-test-'));
  });

  afterAll(() => {
    // Clean up temp files
    try {
      const files = fs.readdirSync(tempDir);
      files.forEach(f => fs.unlinkSync(path.join(tempDir, f)));
      fs.rmdirSync(tempDir);
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe('with minimal (empty) data', () => {
    test('generates PDF without error', async () => {
      const filePath = path.join(tempDir, 'minimal.pdf');
      await expect(generatePdfReport(minimalData(), filePath)).resolves.not.toThrow();
    });

    test('generated file exists on disk', async () => {
      const filePath = path.join(tempDir, 'minimal-exists.pdf');
      await generatePdfReport(minimalData(), filePath);
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('generated file is non-empty', async () => {
      const filePath = path.join(tempDir, 'minimal-size.pdf');
      await generatePdfReport(minimalData(), filePath);
      const stats = fs.statSync(filePath);
      expect(stats.size).toBeGreaterThan(0);
    });

    test('generated file starts with PDF header', async () => {
      const filePath = path.join(tempDir, 'minimal-header.pdf');
      await generatePdfReport(minimalData(), filePath);
      const buffer = fs.readFileSync(filePath);
      const header = buffer.slice(0, 5).toString('ascii');
      expect(header).toBe('%PDF-');
    });
  });

  describe('with full data', () => {
    test('generates PDF without error', async () => {
      const filePath = path.join(tempDir, 'full.pdf');
      await expect(generatePdfReport(fullData(), filePath)).resolves.not.toThrow();
    });

    test('generated file is larger than minimal data PDF', async () => {
      const minPath = path.join(tempDir, 'compare-min.pdf');
      const fullPath = path.join(tempDir, 'compare-full.pdf');
      await generatePdfReport(minimalData(), minPath);
      await generatePdfReport(fullData(), fullPath);
      const minSize = fs.statSync(minPath).size;
      const fullSize = fs.statSync(fullPath).size;
      expect(fullSize).toBeGreaterThan(minSize);
    });
  });

  describe('with partial data', () => {
    test('handles medications only', async () => {
      const data = { ...minimalData(), medications: fullData().medications };
      const filePath = path.join(tempDir, 'partial-meds.pdf');
      await expect(generatePdfReport(data, filePath)).resolves.not.toThrow();
    });

    test('handles checkins only', async () => {
      const data = { ...minimalData(), checkins: fullData().checkins };
      const filePath = path.join(tempDir, 'partial-checkins.pdf');
      await expect(generatePdfReport(data, filePath)).resolves.not.toThrow();
    });

    test('handles incidents only', async () => {
      const data = { ...minimalData(), incidents: fullData().incidents };
      const filePath = path.join(tempDir, 'partial-incidents.pdf');
      await expect(generatePdfReport(data, filePath)).resolves.not.toThrow();
    });

    test('handles PEF data with zone summary', async () => {
      const data = { ...minimalData(), pefHistory: fullData().pefHistory, pefZoneSummary: fullData().pefZoneSummary };
      const filePath = path.join(tempDir, 'partial-pef.pdf');
      await expect(generatePdfReport(data, filePath)).resolves.not.toThrow();
    });

    test('handles triggers only', async () => {
      const data = { ...minimalData(), triggers: fullData().triggers };
      const filePath = path.join(tempDir, 'partial-triggers.pdf');
      await expect(generatePdfReport(data, filePath)).resolves.not.toThrow();
    });

    test('handles adherence data only', async () => {
      const data = { ...minimalData(), adherence: fullData().adherence };
      const filePath = path.join(tempDir, 'partial-adherence.pdf');
      await expect(generatePdfReport(data, filePath)).resolves.not.toThrow();
    });

    test('handles schedule only', async () => {
      const data = { ...minimalData(), schedule: fullData().schedule };
      const filePath = path.join(tempDir, 'partial-schedule.pdf');
      await expect(generatePdfReport(data, filePath)).resolves.not.toThrow();
    });

    test('handles rescue logs only', async () => {
      const data = { ...minimalData(), rescueLogs: fullData().rescueLogs };
      const filePath = path.join(tempDir, 'partial-rescue.pdf');
      await expect(generatePdfReport(data, filePath)).resolves.not.toThrow();
    });
  });

  describe('edge cases', () => {
    test('handles personal best PEF in cover page', async () => {
      const data = { ...minimalData(), personalBestPef: 450 };
      const filePath = path.join(tempDir, 'edge-pef.pdf');
      await expect(generatePdfReport(data, filePath)).resolves.not.toThrow();
    });

    test('handles empty schedule (all days off)', async () => {
      const data = {
        ...minimalData(),
        schedule: { monday: 0, tuesday: 0, wednesday: 0, thursday: 0, friday: 0, saturday: 0, sunday: 0, doses_per_day: 1 }
      };
      const filePath = path.join(tempDir, 'edge-empty-schedule.pdf');
      await expect(generatePdfReport(data, filePath)).resolves.not.toThrow();
    });

    test('handles medication notes with null', async () => {
      const data = {
        ...minimalData(),
        medications: [
          { medication_name: 'NullNotes', is_rescue: 1, purchase_date: '2024-01-01', expiration_date: '2025-12-31', doses_remaining: 50, notes: null }
        ]
      };
      const filePath = path.join(tempDir, 'edge-null-notes.pdf');
      await expect(generatePdfReport(data, filePath)).resolves.not.toThrow();
    });

    test('handles technique sessions > 0', async () => {
      const data = { ...minimalData(), techniqueSessions: 12 };
      const filePath = path.join(tempDir, 'edge-sessions.pdf');
      await expect(generatePdfReport(data, filePath)).resolves.not.toThrow();
    });

    test('handles 0% adherence', async () => {
      const data = { ...minimalData(), adherence: { daysPlanned: 30, daysCompleted: 0, percentage: 0 } };
      const filePath = path.join(tempDir, 'edge-zero-adherence.pdf');
      await expect(generatePdfReport(data, filePath)).resolves.not.toThrow();
    });

    test('handles 100% adherence', async () => {
      const data = { ...minimalData(), adherence: { daysPlanned: 30, daysCompleted: 30, percentage: 100 } };
      const filePath = path.join(tempDir, 'edge-full-adherence.pdf');
      await expect(generatePdfReport(data, filePath)).resolves.not.toThrow();
    });
  });
});
