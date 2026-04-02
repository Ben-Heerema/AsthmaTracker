/**
 * onboarding.js — Onboarding Tutorial Logic
 *
 * Shows role-specific slides explaining how to use the app.
 * Content differs based on whether the current user is a Parent or Provider.
 *
 * Slide structure:
 *   { icon: '...emoji...', title: '...', text: '...' }
 */

// Slides shown to Parent accounts
const PARENT_SLIDES = [
  {
    icon: '👨‍👧',
    title: 'Welcome, Parent!',
    text: 'Asthma Tracker helps you manage your child\'s asthma from one place — medications, symptoms, and emergency care.'
  },
  {
    icon: '➕',
    title: 'Add Your Children',
    text: 'Start by adding your children in the "Add Child" section. Each child gets their own profile with a username and password so they can log in independently.'
  },
  {
    icon: '💊',
    title: 'Track Medications',
    text: 'Add your child\'s medications (rescue and controller), track doses remaining, and get notified when supplies are running low or about to expire.'
  },
  {
    icon: '📋',
    title: 'Daily Check-ins',
    text: 'Complete a daily check-in to record your child\'s symptoms and any asthma triggers. This builds a history that helps identify patterns.'
  },
  {
    icon: '📊',
    title: 'Monitor Peak Flow',
    text: 'Enter Peak Expiratory Flow (PEF) readings daily. The app calculates your child\'s zone — Green (well-controlled), Yellow (caution), or Red (emergency).'
  },
  {
    icon: '🚨',
    title: 'Emergency Triage',
    text: 'If your child has an asthma emergency, use the Emergency Services button. It guides you through a step-by-step response and always shows a 911 prompt.'
  },
  {
    icon: '👨‍⚕️',
    title: 'Share with Providers',
    text: 'Generate access codes to share your child\'s data with their doctor. You control exactly what they can see using sharing toggles.'
  },
  {
    icon: '✅',
    title: 'You\'re All Set!',
    text: 'Start by adding your child. Then add their medications and complete your first daily check-in. The app will guide you from there!'
  }
];

// Slides shown to Provider (doctor/nurse) accounts
const PROVIDER_SLIDES = [
  {
    icon: '👨‍⚕️',
    title: 'Welcome, Provider!',
    text: 'Asthma Tracker lets you securely access patient asthma data shared by parents — no internet connection required.'
  },
  {
    icon: '🔑',
    title: 'Add Patients',
    text: 'Ask the patient\'s parent to generate an access code from their app. Enter the code in the "Add Patient" section to gain access to their child\'s data.'
  },
  {
    icon: '📊',
    title: 'View Shared Data',
    text: 'Parents control exactly what you can see. Possible views include: symptom charts, PEF scores, medication adherence, triage incidents, and more.'
  },
  {
    icon: '📄',
    title: 'Generate Reports',
    text: 'Create comprehensive PDF reports covering 3-6 months of data. Great for office visits or keeping in patient records.'
  },
  {
    icon: '✅',
    title: 'Ready to Go!',
    text: 'Use the "Add Patient" button on your dashboard to get started. Have the parent\'s access code ready!'
  }
];

// =============================================================================
// SLIDE STATE
// =============================================================================
let slides = [];        // Will be set to PARENT_SLIDES or PROVIDER_SLIDES
let currentSlide = 0;   // Index of the currently displayed slide

/**
 * Initialize the page: load session, pick correct slides, render first slide.
 */
async function initializePage() {
  const session = await window.electronAPI.getSession();

  // Choose slides based on user role
  slides = (session.role === 'provider') ? PROVIDER_SLIDES : PARENT_SLIDES;

  // Build the dot indicators
  renderDots();

  // Show the first slide
  renderSlide(0);
}

// =============================================================================
// RENDERING
// =============================================================================

/**
 * renderSlide — Update the DOM to show a specific slide.
 * @param {number} index - Which slide to show (0-based)
 */
function renderSlide(index) {
  currentSlide = index;
  const slide = slides[index];

  // Update the slide content using safe DOM APIs
  const container = document.getElementById('slide-container');
  container.innerHTML = '';

  const iconEl = document.createElement('div');
  iconEl.className = 'slide-icon';
  iconEl.textContent = slide.icon;

  const titleEl = document.createElement('h1');
  titleEl.className = 'slide-title';
  titleEl.textContent = slide.title;

  const textEl = document.createElement('p');
  textEl.className = 'slide-text';
  textEl.textContent = slide.text;

  container.appendChild(iconEl);
  container.appendChild(titleEl);
  container.appendChild(textEl);

  // Update slide counter text (e.g., "Slide 3 of 8")
  document.getElementById('slide-counter').textContent =
    `${index + 1} of ${slides.length}`;

  // Update dot indicators
  document.querySelectorAll('.slide-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i === index);
  });

  // Update button states
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');

  // Hide "Back" on first slide
  prevBtn.style.visibility = (index === 0) ? 'hidden' : 'visible';

  // Change "Next" to "Start Exploring" on last slide
  if (index === slides.length - 1) {
    nextBtn.textContent = 'Start Exploring ✓';
    nextBtn.classList.add('btn-success');
    nextBtn.classList.remove('btn-primary');
  } else {
    nextBtn.textContent = 'Next →';
    nextBtn.classList.add('btn-primary');
    nextBtn.classList.remove('btn-success');
  }
}

/**
 * renderDots — Build the slide dot indicators.
 */
function renderDots() {
  const container = document.getElementById('slide-dots');
  container.innerHTML = slides.map((_, i) =>
    `<div class="slide-dot ${i === 0 ? 'active' : ''}"></div>`
  ).join('');
}

// =============================================================================
// NAVIGATION
// =============================================================================

/**
 * nextSlide — Move to the next slide, or finish onboarding if on last slide.
 */
async function nextSlide() {
  if (currentSlide < slides.length - 1) {
    renderSlide(currentSlide + 1);
  } else {
    // Last slide — mark onboarding complete and go to main page
    await window.electronAPI.completeOnboarding();

    const session = await window.electronAPI.getSession();
    if (session.role === 'parent') {
      window.electronAPI.navigate('parent-main');
    } else if (session.role === 'provider') {
      window.electronAPI.navigate('provider-main');
    }
  }
}

/**
 * prevSlide — Move to the previous slide.
 */
function prevSlide() {
  if (currentSlide > 0) {
    renderSlide(currentSlide - 1);
  }
}

// Run when DOM is ready
// Also attach button listeners here (not inline onclick) to comply with CSP
document.addEventListener('DOMContentLoaded', () => {
  initializePage();
  document.getElementById('prev-btn').addEventListener('click', prevSlide);
  document.getElementById('next-btn').addEventListener('click', nextSlide);
});
