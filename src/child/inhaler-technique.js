/**
 * inhaler-technique.js — Inhaler Technique Tutorial Logic
 *
 * Two technique types:
 *   'regular'    — Standard MDI inhaler (no spacer)
 *   'mask_spacer'— Mask with spacer device
 *
 * After completing all steps, records the session in the database
 * so badges (which count technique sessions) can be checked.
 *
 * TIMER SYSTEM:
 *   Some steps have a timed element. Each step object can have a
 *   `timer` property with one of two types:
 *
 *   { type: 'countdown', seconds: N, label: 'text' }
 *     → Counts down from N to 0. The Next button is locked until
 *       the countdown finishes (or the child taps "Skip").
 *
 *   { type: 'counter', count: N, label: 'text' }
 *     → Tap-to-count breaths. Each tap increments a counter.
 *       The Next button is locked until all N taps are done
 *       (or the child taps "Skip").
 *
 *   Steps without a `timer` property show no timer widget.
 */

/* ── Step definitions ─────────────────────────────────────── */

// Steps for regular MDI inhaler technique.
// Steps that need a timer have a `timer` property.
const REGULAR_STEPS = [
  { icon: '🤲', instruction: 'Wash your hands with soap and water first.' },

  {
    icon: '🔩',
    instruction: 'Remove the cap from your inhaler and shake it well for 5 seconds.',
    timer: { type: 'countdown', seconds: 5, label: '⏱ Shake timer' }
  },

  { icon: '🌬️', instruction: 'Breathe out fully to empty your lungs.' },

  { icon: '💨', instruction: 'Place the mouthpiece in your mouth and seal your lips around it tightly.' },

  { icon: '👆', instruction: 'Press down on the inhaler to release the medicine as you slowly breathe in.' },

  {
    icon: '⏸️',
    instruction: 'Hold your breath for 10 seconds to let the medicine reach deep into your lungs.',
    timer: { type: 'countdown', seconds: 10, label: '⏱ Hold your breath' }
  },

  { icon: '😮‍💨', instruction: 'Breathe out slowly through your nose.' },

  { icon: '🔄', instruction: 'If you need a second puff, wait 1 minute then repeat from Step 3.' },

  { icon: '🧼', instruction: 'Rinse your mouth with water and spit it out. This prevents thrush (yeast infection).' },

  { icon: '🔒', instruction: 'Replace the cap on your inhaler. Store it at room temperature, away from heat.' }
];

// Steps for mask + spacer technique (for younger children).
const MASK_SPACER_STEPS = [
  { icon: '🤲', instruction: 'Wash your hands with soap and water first.' },

  { icon: '🔩', instruction: 'Attach the spacer to the inhaler by inserting the mouthpiece into the spacer opening.' },

  {
    icon: '💨',
    instruction: 'Shake the inhaler well for 5 seconds.',
    timer: { type: 'countdown', seconds: 5, label: '⏱ Shake timer' }
  },

  { icon: '😷', instruction: 'Place the mask over your nose and mouth. Make sure it fits snugly with no gaps.' },

  { icon: '🌬️', instruction: 'Breathe out gently through the mask.' },

  { icon: '👆', instruction: 'Press down on the inhaler ONCE to spray the medicine into the spacer.' },

  {
    icon: '🫁',
    instruction: 'Breathe in and out slowly and gently 6 times through the mask.\nKeep the mask sealed.',
    timer: { type: 'counter', count: 6, label: '🫁 Breaths taken' }
  },

  { icon: '😮‍💨', instruction: 'Remove the mask and breathe normally for a moment.' },

  { icon: '🔄', instruction: 'If a second puff is needed, wait 1 minute and repeat from Step 3.' },

  { icon: '🧼', instruction: 'Wash your face where the mask touched it. Rinse the mask and spacer with water.' }
];

/* ── State ────────────────────────────────────────────────── */

let currentSteps = [];
let currentStep  = 0;
let sessionType  = null;

// Timer state — reset on every step change
let timerInterval   = null;  // setInterval handle for countdown
let timerSecondsLeft = 0;    // current countdown value
let timerDone       = false; // true once timer/counter finishes

/* ── Timer helpers ────────────────────────────────────────── */

/**
 * clearTimer — stops any running interval and resets timer state.
 * Called whenever we move to a new step.
 */
function clearTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  timerSecondsLeft = 0;
  timerDone = false;
}

/**
 * renderTimerWidget — builds the timer HTML inside #step-timer
 * and attaches its event listeners.
 *
 * @param {{ type: string, seconds?: number, count?: number, label: string }} timer
 */
function renderTimerWidget(timer) {
  const container = document.getElementById('step-timer');
  container.classList.remove('hidden');

  if (timer.type === 'countdown') {
    renderCountdown(container, timer);
  } else if (timer.type === 'counter') {
    renderBreathCounter(container, timer);
  }
}

/* ── Countdown timer (e.g. "Hold 10s", "Shake 5s") ─────── */

/**
 * renderCountdown — injects a countdown timer widget.
 * The Next button is disabled until the timer reaches 0
 * (or the user clicks Skip).
 */
function renderCountdown(container, timer) {
  timerSecondsLeft = timer.seconds;

  container.innerHTML =
    '<div class="inh-timer-label">' + timer.label + '</div>' +
    '<div class="inh-timer-display" id="inh-timer-display">' + timer.seconds + 's</div>' +
    '<div class="inh-timer-btns">' +
      '<button class="inh-timer-btn-start" id="inh-timer-start-btn" type="button">▶ Start</button>' +
      '<button class="inh-timer-btn-skip"  id="inh-timer-skip-btn"  type="button">Skip ›</button>' +
    '</div>';

  // Lock the Next button until the timer finishes
  lockNextButton(true);

  document.getElementById('inh-timer-start-btn').addEventListener('click', function () {
    startCountdown(timer.seconds);
    this.disabled = true;
    this.textContent = 'Running…';
  });

  document.getElementById('inh-timer-skip-btn').addEventListener('click', function () {
    finishTimer();
  });
}

/**
 * startCountdown — begins the setInterval tick.
 */
function startCountdown(seconds) {
  timerSecondsLeft = seconds;
  const display = document.getElementById('inh-timer-display');
  if (display) display.classList.add('inh-timer-running');

  timerInterval = setInterval(function () {
    timerSecondsLeft--;

    const disp = document.getElementById('inh-timer-display');
    if (disp) {
      disp.textContent = timerSecondsLeft + 's';

      // Change colour when time is nearly up (≤ 3 seconds)
      if (timerSecondsLeft <= 3) {
        disp.classList.add('inh-timer-urgent');
      }
    }

    if (timerSecondsLeft <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      finishTimer();
    }
  }, 1000);
}

/* ── Breath counter (6 breaths for mask step) ───────────── */

/**
 * renderBreathCounter — injects a tap-to-count breath widget.
 * Child taps the big button once per breath.
 * Next is unlocked when count reaches the target.
 */
function renderBreathCounter(container, timer) {
  let breathsDone = 0;
  const total = timer.count;

  container.innerHTML =
    '<div class="inh-timer-label">' + timer.label + '</div>' +
    '<button class="inh-counter-tap-btn" id="inh-breath-tap" type="button">' +
      '<span class="inh-counter-num" id="inh-breath-count">0</span>' +
      '<span class="inh-counter-of">/ ' + total + '</span>' +
    '</button>' +
    '<div class="inh-counter-hint">Tap each breath</div>' +
    '<button class="inh-timer-btn-skip" id="inh-breath-skip-btn" type="button">Skip ›</button>';

  // Lock Next until all breaths counted
  lockNextButton(true);

  document.getElementById('inh-breath-tap').addEventListener('click', function () {
    if (breathsDone >= total) return;
    breathsDone++;

    const countEl = document.getElementById('inh-breath-count');
    if (countEl) countEl.textContent = breathsDone;

    // Visual pulse on tap
    this.classList.remove('inh-counter-pulse');
    void this.offsetWidth; // reflow to restart animation
    this.classList.add('inh-counter-pulse');

    if (breathsDone >= total) {
      this.disabled = true;
      this.classList.add('inh-counter-done');
      finishTimer();
    }
  });

  document.getElementById('inh-breath-skip-btn').addEventListener('click', function () {
    finishTimer();
  });
}

/* ── Shared finish ───────────────────────────────────────── */

/**
 * finishTimer — called when a timer completes (naturally or skipped).
 * Shows a ✓ done message and unlocks the Next button.
 */
function finishTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  timerDone = true;

  // Update the display to show "Done!"
  const display = document.getElementById('inh-timer-display');
  if (display) {
    display.textContent = '✓ Done!';
    display.classList.remove('inh-timer-running', 'inh-timer-urgent');
    display.classList.add('inh-timer-done');
  }

  // Hide skip button now that it's over
  const skip = document.getElementById('inh-timer-skip-btn');
  if (skip) skip.style.display = 'none';
  const breathSkip = document.getElementById('inh-breath-skip-btn');
  if (breathSkip) breathSkip.style.display = 'none';

  // Unlock the Next / Finish button
  lockNextButton(false);
}

/**
 * lockNextButton — enables or disables the Next step button.
 * When locked we also visually dim it so the child knows to wait.
 */
function lockNextButton(locked) {
  const btn = document.getElementById('next-step-btn');
  if (!btn) return;
  btn.disabled = locked;
  if (locked) {
    btn.classList.add('inh-btn-next-locked');
  } else {
    btn.classList.remove('inh-btn-next-locked');
  }
}

/* ── Step display ─────────────────────────────────────────── */

/**
 * startTechnique — Called when user picks their inhaler type.
 * @param {string} type - 'regular' or 'mask_spacer'
 */
function startTechnique(type) {
  sessionType   = type;
  currentSteps  = type === 'regular' ? REGULAR_STEPS : MASK_SPACER_STEPS;
  currentStep   = 0;

  document.getElementById('type-selector').classList.add('hidden');
  document.getElementById('step-display').classList.remove('hidden');

  showStep(0);
}

/** Update the UI to show a specific step */
function showStep(index) {
  // Stop any running timer from the previous step
  clearTimer();

  currentStep = index;
  const step  = currentSteps[index];
  const total = currentSteps.length;

  document.getElementById('step-counter').textContent     = `Step ${index + 1} of ${total}`;
  document.getElementById('step-icon').textContent        = step.icon;
  document.getElementById('step-instruction').textContent = step.instruction;

  // Progress bar fill: goes from ~10% on step 1 to 100% on last step
  const pct = Math.round(((index + 1) / total) * 100);
  document.getElementById('step-progress').style.width = pct + '%';

  // Back button: invisible on first step
  const prevBtn = document.getElementById('prev-step-btn');
  prevBtn.classList.toggle('invisible', index === 0);

  // Next button: turn green on last step, always start unlocked
  const nextBtn = document.getElementById('next-step-btn');
  nextBtn.disabled = false;
  nextBtn.classList.remove('inh-btn-next-locked');
  if (index === total - 1) {
    nextBtn.textContent = '✓ Finish!';
    nextBtn.classList.add('inh-btn-finish');
  } else {
    nextBtn.textContent = 'Next →';
    nextBtn.classList.remove('inh-btn-finish');
  }

  // Timer widget — hide first, then re-render if this step has one
  const timerDiv = document.getElementById('step-timer');
  timerDiv.classList.add('hidden');
  timerDiv.innerHTML = '';

  if (step.timer) {
    renderTimerWidget(step.timer);
  }

  // Move focus to the step instruction for screen readers
  const instrEl = document.getElementById('step-instruction');
  instrEl.setAttribute('tabindex', '-1');
  instrEl.focus();
}

/* ── Navigation ──────────────────────────────────────────── */

let nextStepBusy = false;
async function nextStep() {
  if (nextStepBusy) return; // debounce rapid clicks
  nextStepBusy = true;
  try {
    if (currentStep < currentSteps.length - 1) {
      showStep(currentStep + 1);
    } else {
      // All steps complete — record session and show completion screen
      try {
        await window.electronAPI.recordTechniqueSession({ sessionType });
      } catch (err) {
        console.error('Failed to record technique session:', err);
      }
      document.getElementById('step-display').classList.add('hidden');
      document.getElementById('completion-screen').classList.remove('hidden');
      document.getElementById('completion-home-btn').focus();
    }
  } finally {
    nextStepBusy = false;
  }
}

function prevStep() {
  if (currentStep > 0) showStep(currentStep - 1);
}

/* ── Video player ─────────────────────────────────────────── */

/**
 * VIDEO_FILES — maps technique type to the video filename.
 * Videos are stored in src/assets/videos/.
 */
const VIDEO_FILES = {
  regular:     'inhaler_regular.mp4',
  mask_spacer: 'inhaler_mask_spacer.mp4'
};

const VIDEO_TITLES = {
  regular:     'Regular MDI Inhaler Technique',
  mask_spacer: 'Mask & Spacer Technique'
};

/**
 * openVideoModal — shows the video player modal for the given technique type.
 * @param {string} type - 'regular' or 'mask_spacer'
 */
function openVideoModal(type) {
  const modal       = document.getElementById('video-modal');
  const title       = document.getElementById('video-modal-title');
  const video       = document.getElementById('technique-video');
  const source      = document.getElementById('video-source-mp4');
  const placeholder = document.getElementById('video-placeholder');
  const toStepsBtn  = document.getElementById('video-to-steps-btn');

  // Set title
  title.textContent = VIDEO_TITLES[type] || 'Inhaler Technique';

  // Set video source (path relative to the HTML file location)
  const videoPath = '../assets/videos/' + VIDEO_FILES[type];
  source.setAttribute('src', videoPath);
  video.load();

  // Show the video element, hide placeholder initially
  video.classList.remove('hidden');
  placeholder.classList.add('hidden');

  // If the video fails to load, show a friendly placeholder instead
  video.onerror = function () {
    video.classList.add('hidden');
    placeholder.classList.remove('hidden');
  };

  // "Practice the Steps" button — close video and start the step-by-step
  // Remove previous listener by cloning, then add fresh one
  const newBtn = toStepsBtn.cloneNode(true);
  toStepsBtn.parentNode.replaceChild(newBtn, toStepsBtn);
  newBtn.addEventListener('click', () => {
    closeVideoModal();
    startTechnique(type);
  });

  // Show the modal
  modal.classList.remove('hidden');
  // Small delay so the CSS transition can kick in
  requestAnimationFrame(() => modal.classList.add('inh-video-modal-open'));
  // Move focus into the modal for screen readers and keyboard users
  setTimeout(() => document.getElementById('video-modal-close').focus(), 300);
}

/**
 * closeVideoModal — hides the video modal and stops playback.
 */
function closeVideoModal() {
  const modal = document.getElementById('video-modal');
  const video = document.getElementById('technique-video');

  // Stop playback
  video.pause();
  video.currentTime = 0;

  // Reset custom controls
  updatePlayButton(false);
  const fill = document.getElementById('vc-progress-fill');
  if (fill) fill.style.width = '0%';
  const curTime = document.getElementById('vc-time-current');
  if (curTime) curTime.textContent = '0:00';

  // Animate out
  modal.classList.remove('inh-video-modal-open');
  // After transition, fully hide and return focus
  setTimeout(() => {
    modal.classList.add('hidden');
    // Return focus to the button that opened the modal
    const opener = document.getElementById('video-regular-btn');
    if (opener) opener.focus();
  }, 250);
}

/* ── Custom video controls ─────────────────────────────── */

/** Format seconds as M:SS */
function formatVideoTime(seconds) {
  if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m + ':' + (s < 10 ? '0' : '') + s;
}

/** Update the play/pause button icon and aria-label */
function updatePlayButton(isPlaying) {
  const btn = document.getElementById('vc-play-btn');
  if (btn) {
    btn.textContent = isPlaying ? '⏸' : '▶';
    btn.setAttribute('aria-label', isPlaying ? 'Pause video' : 'Play video');
  }
}

/** Wire up all custom video controls — called once on DOMContentLoaded */
function initVideoControls() {
  const video     = document.getElementById('technique-video');
  const playBtn   = document.getElementById('vc-play-btn');
  const muteBtn   = document.getElementById('vc-mute-btn');
  const volumeEl  = document.getElementById('vc-volume');
  const progress  = document.getElementById('vc-progress-bar');
  const fill      = document.getElementById('vc-progress-fill');
  const curTimeEl = document.getElementById('vc-time-current');
  const durEl     = document.getElementById('vc-time-duration');

  // Play / Pause toggle
  playBtn.addEventListener('click', () => {
    if (video.paused) { video.play(); } else { video.pause(); }
  });

  // Clicking the video itself toggles play/pause
  video.addEventListener('click', () => {
    if (video.paused) { video.play(); } else { video.pause(); }
  });

  // Sync button icon with actual video state
  video.addEventListener('play',  () => updatePlayButton(true));
  video.addEventListener('pause', () => updatePlayButton(false));
  video.addEventListener('ended', () => updatePlayButton(false));

  // Update progress bar + timestamps as video plays
  video.addEventListener('timeupdate', () => {
    curTimeEl.textContent = formatVideoTime(video.currentTime);
    if (video.duration) {
      const pct = (video.currentTime / video.duration) * 100;
      fill.style.width = pct + '%';
    }
  });

  // Set duration display once metadata loads
  video.addEventListener('loadedmetadata', () => {
    durEl.textContent = formatVideoTime(video.duration);
  });

  // Click-to-seek on the progress bar
  progress.addEventListener('click', (e) => {
    const rect = progress.getBoundingClientRect();
    const pct  = (e.clientX - rect.left) / rect.width;
    if (video.duration) {
      video.currentTime = pct * video.duration;
    }
  });

  // Mute / Unmute
  muteBtn.addEventListener('click', () => {
    video.muted = !video.muted;
    muteBtn.textContent = video.muted ? '🔇' : '🔊';
    volumeEl.value = video.muted ? 0 : video.volume;
  });

  // Volume slider
  volumeEl.addEventListener('input', () => {
    video.volume = parseFloat(volumeEl.value);
    video.muted  = video.volume === 0;
    muteBtn.textContent = video.muted ? '🔇' : '🔊';
  });
}

/* ── Page init ───────────────────────────────────────────── */

async function initializePage() {
  try {
    const session = await window.electronAPI.getSession();
    if (!session || !session.childId) { window.electronAPI.navigate('landing'); return; }
  } catch (err) {
    console.error('Failed to initialize inhaler-technique page:', err);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initializePage();
  document.getElementById('back-btn').addEventListener('click', () => window.electronAPI.navigate('child-main'));
  document.getElementById('start-regular-btn').addEventListener('click', () => startTechnique('regular'));
  document.getElementById('start-mask-spacer-btn').addEventListener('click', () => startTechnique('mask_spacer'));
  document.getElementById('prev-step-btn').addEventListener('click', prevStep);
  document.getElementById('next-step-btn').addEventListener('click', nextStep);
  document.getElementById('completion-home-btn').addEventListener('click', () => window.electronAPI.navigate('child-main'));

  // Video buttons
  document.getElementById('video-regular-btn').addEventListener('click', () => openVideoModal('regular'));
  document.getElementById('video-mask-spacer-btn').addEventListener('click', () => openVideoModal('mask_spacer'));

  // Video modal close
  document.getElementById('video-modal-close').addEventListener('click', closeVideoModal);
  document.getElementById('video-modal-backdrop').addEventListener('click', closeVideoModal);

  // Close modal on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('video-modal');
      if (!modal.classList.contains('hidden')) closeVideoModal();
    }
  });

  // Wire up custom video player controls
  initVideoControls();
});
