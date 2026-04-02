/**
 * controller-schedule.js — Edit Controller Medication Schedule
 */

document.addEventListener('DOMContentLoaded', async () => {
  let childId = null;

  try {
    const session = await window.electronAPI.getSession();
    if (!session || !session.userId) { window.electronAPI.navigate('landing'); return; }

    const navData = await window.electronAPI.getNavigationData();
    childId = navData && navData.childId ? parseInt(navData.childId) : null;
    if (!childId) { window.electronAPI.navigate('parent-child-overview'); return; }

    // Load existing schedule
    const sched = await window.electronAPI.getControllerSchedule(childId);
    if (sched) {
      const dayMap = { mon: 'monday', tue: 'tuesday', wed: 'wednesday', thu: 'thursday', fri: 'friday', sat: 'saturday', sun: 'sunday' };
      Object.keys(dayMap).forEach(k => {
        const el = document.getElementById('sched-' + k);
        if (el) el.checked = !!sched[dayMap[k]];
      });
      document.getElementById('doses-per-day').value = sched.doses_per_day || 1;
    }
  } catch (err) {
    console.error('Failed to load schedule:', err);
    showToast('Could not load schedule. Please go back and try again.', 'error');
    return;
  }

  // Back button — pass childId so child-overview auto-selects the same child
  document.getElementById('back-btn').addEventListener('click', () => {
    window.electronAPI.navigate('parent-child-overview', { childId });
  });

  // Save
  document.getElementById('save-schedule-btn').addEventListener('click', async () => {
    const saveBtn = document.getElementById('save-schedule-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';

    try {
      const dayMap = { mon: 'monday', tue: 'tuesday', wed: 'wednesday', thu: 'thursday', fri: 'friday', sat: 'saturday', sun: 'sunday' };
      const data = { childId, dosesPerDay: parseInt(document.getElementById('doses-per-day').value) };
      Object.keys(dayMap).forEach(k => {
        data[dayMap[k]] = document.getElementById('sched-' + k).checked;
      });
      await window.electronAPI.updateControllerSchedule(data);
      showToast('Schedule saved!', 'success');
    } catch (err) {
      console.error('Failed to save schedule:', err);
      showToast('Failed to save schedule. Please try again.', 'error');
    }

    saveBtn.disabled = false;
    saveBtn.textContent = '💾 Save Schedule';
  });
});
