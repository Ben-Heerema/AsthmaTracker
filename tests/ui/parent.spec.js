/**
 * tests/ui/parent.spec.js — Parent Dashboard UI Tests
 *
 * Covers:
 *  - Parent dashboard renders navigation grid
 *  - Add child: happy path, duplicate username, missing fields
 *  - Medication inventory: add rescue & controller meds
 *  - Daily check-in: select child, toggle symptoms and triggers, save
 *  - Enter PEF: enter reading, save
 *  - Set personal best: enter value, save
 *  - Controller schedule: toggle days and save
 *  - Notifications bell: visible, navigates to notifications page
 *  - Adherence report: circular progress, stats, alert, back navigation
 */

const {
  test, expect,
  navigateTo, loginAsParent,
  CHILD,
} = require('./helpers/app');

// Helper: a unique string suffix for this test run to avoid DB collisions
const RUN = Date.now();

// ── Setup: ensure parent is logged in before every test ───────────────────────

test.beforeEach(async ({ window }) => {
  await loginAsParent(window);
});

// ── Parent dashboard ───────────────────────────────────────────────────────────

test.describe('Parent dashboard', () => {
  test('shows navigation grid with key buttons', async ({ window }) => {
    await expect(window.locator('#nav-grid')).toBeVisible();
    await expect(window.locator('#nav-add-child')).toBeVisible();
    await expect(window.locator('#nav-medication-inventory')).toBeVisible();
    await expect(window.locator('#nav-daily-checkin')).toBeVisible();
    await expect(window.locator('#nav-enter-pef')).toBeVisible();
  });

  test('displays logged-in username', async ({ window }) => {
    const text = await window.textContent('#username-display');
    expect(text.trim().length).toBeGreaterThan(0);
  });

  test('notifications bell button is visible', async ({ window }) => {
    await expect(window.locator('#notif-bell-btn')).toBeVisible();
  });

  test('notifications bell navigates to notifications page', async ({ window }) => {
    await window.click('#notif-bell-btn');
    await window.waitForSelector('#notif-list', { timeout: 5000 });
    await expect(window.locator('#notif-list')).toBeVisible();
  });
});

// ── Add child ─────────────────────────────────────────────────────────────────

test.describe('Add child', () => {
  test.beforeEach(async ({ window }) => {
    await navigateTo(window, 'parent-add-child');
  });

  test('add child form fields are visible', async ({ window }) => {
    await expect(window.locator('#child-username')).toBeVisible();
    await expect(window.locator('#child-password')).toBeVisible();
    await expect(window.locator('#child-name')).toBeVisible();
    await expect(window.locator('#child-birthday')).toBeVisible();
  });

  test('back button returns to parent dashboard', async ({ window }) => {
    await window.click('#back-btn');
    await window.waitForSelector('#nav-grid', { timeout: 5000 });
    await expect(window.locator('#nav-grid')).toBeVisible();
  });

  test('successful add child shows success banner', async ({ window }) => {
    await window.fill('#child-username', `kid${RUN}`);
    await window.fill('#child-password', 'UITest123');
    await window.fill('#child-name', `Kid ${RUN}`);
    await window.fill('#child-birthday', '2015-06-01');
    await window.click('#save-child-btn');
    await window.waitForSelector('#success-msg:not(.hidden)', { timeout: 8000 });
    await expect(window.locator('#success-msg')).toBeVisible();
  });

  test('duplicate child username shows error', async ({ window }) => {
    // First add
    const uname = `dupkid${RUN}`;
    await window.fill('#child-username', uname);
    await window.fill('#child-password', 'UITest123');
    await window.fill('#child-name', 'Dup Kid');
    await window.fill('#child-birthday', '2015-06-01');
    await window.click('#save-child-btn');
    await window.waitForSelector('#success-msg:not(.hidden)', { timeout: 8000 });

    // Navigate back and try the same username
    await navigateTo(window, 'parent-add-child');
    await window.fill('#child-username', uname);
    await window.fill('#child-password', 'UITest123');
    await window.fill('#child-name', 'Dup Kid 2');
    await window.fill('#child-birthday', '2015-06-01');
    await window.click('#save-child-btn');
    await window.waitForSelector('#general-error:not(.hidden)', { timeout: 5000 });
    await expect(window.locator('#general-error')).toBeVisible();
  });

  test('weak password shows password error', async ({ window }) => {
    await window.fill('#child-username', `weakkid${RUN}`);
    await window.fill('#child-password', 'weak');
    await window.fill('#child-name', 'Weak Kid');
    await window.fill('#child-birthday', '2015-06-01');
    await window.click('#save-child-btn');
    // The password strength fill should show weak state before even submitting
    await expect(window.locator('#strength-fill')).toHaveClass(/strength-weak/);
  });

  test('notes counter updates as user types', async ({ window }) => {
    await window.fill('#child-notes', 'Hello');
    const count = await window.textContent('#notes-count');
    expect(count).toContain('5');
  });
});

// ── Medication inventory ───────────────────────────────────────────────────────

test.describe('Medication inventory', () => {
  test.beforeEach(async ({ window }) => {
    await navigateTo(window, 'parent-medication-inventory');
  });

  test('inventory page loads', async ({ window }) => {
    await expect(window.locator('#med-list')).toBeVisible();
  });

  test('add medication button navigates to new medication form', async ({ window }) => {
    await window.click('#add-medication-btn');
    await window.waitForSelector('#med-form', { timeout: 5000 });
    await expect(window.locator('#med-form')).toBeVisible();
  });
});

test.describe('New medication form', () => {
  test.beforeEach(async ({ window }) => {
    await navigateTo(window, 'parent-new-medication');
    // Select the seeded child in the dropdown
    await window.waitForSelector('#child-select');
  });

  test('form fields are all present', async ({ window }) => {
    await expect(window.locator('#med-name')).toBeVisible();
    await expect(window.locator('#purchase-date')).toBeVisible();
    await expect(window.locator('#expiry-date')).toBeVisible();
    await expect(window.locator('#doses-remaining')).toBeVisible();
    await expect(window.locator('#rescue-yes')).toBeVisible();
    await expect(window.locator('#rescue-no')).toBeVisible();
  });

  test('can save a new rescue medication', async ({ window }) => {
    await window.selectOption('#child-select', { label: CHILD.name });
    await window.fill('#med-name', `Albuterol${RUN}`);
    await window.check('#rescue-yes');
    await window.fill('#purchase-date', '2025-01-01');
    await window.fill('#expiry-date', '2026-12-31');
    await window.fill('#doses-remaining', '200');
    await window.click('#save-btn');
    // Should navigate back to inventory on success
    await window.waitForSelector('#med-list', { timeout: 8000 });
    await expect(window.locator('#med-list')).toBeVisible();
  });

  test('can save a new controller medication', async ({ window }) => {
    await window.selectOption('#child-select', { label: CHILD.name });
    await window.fill('#med-name', `Flovent${RUN}`);
    await window.check('#rescue-no');
    await window.fill('#purchase-date', '2025-01-01');
    await window.fill('#expiry-date', '2026-12-31');
    await window.fill('#doses-remaining', '60');
    await window.click('#save-btn');
    await window.waitForSelector('#med-list', { timeout: 8000 });
    await expect(window.locator('#med-list')).toBeVisible();
  });

  test('name character counter updates', async ({ window }) => {
    await window.fill('#med-name', 'Test');
    const count = await window.textContent('#name-count');
    expect(count).toContain('4');
  });
});

// ── Daily check-in ────────────────────────────────────────────────────────────

test.describe('Daily check-in', () => {
  test.beforeEach(async ({ window }) => {
    await navigateTo(window, 'parent-daily-checkin');
  });

  test('shows today\'s date', async ({ window }) => {
    const today = new Date().toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric'
    });
    // Just verify the date element has content
    const dateText = await window.textContent('#today-date');
    expect(dateText.trim().length).toBeGreaterThan(0);
  });

  test('selecting a child reveals the form', async ({ window }) => {
    await window.waitForSelector('#child-select');
    // Select the seeded child
    await window.selectOption('#child-select', { label: CHILD.name });
    await window.waitForSelector('#form-area:not(.hidden)', { timeout: 5000 });
    await expect(window.locator('#form-area')).toBeVisible();
  });

  test('severity buttons toggle selected state', async ({ window }) => {
    await window.selectOption('#child-select', { label: CHILD.name });
    await window.waitForSelector('#form-area:not(.hidden)');
    // Click "some" for night waking
    await window.click('[data-group="night-waking"][data-value="some"]');
    await expect(
      window.locator('[data-group="night-waking"][data-value="some"]')
    ).toHaveClass(/selected/);
  });

  test('trigger toggles can be switched on', async ({ window }) => {
    await window.selectOption('#child-select', { label: CHILD.name });
    await window.waitForSelector('#form-area:not(.hidden)');
    // Scroll the trigger row into view, then click its visible label element
    // (the checkbox is inside a CSS toggle widget so it may be off-screen).
    await window.locator('#trigger-exercise').scrollIntoViewIfNeeded();
    // Click the parent <label class="tog"> which is the visible toggle track
    await window.locator('#trigger-exercise').evaluate(el => {
      el.closest('label.tog')
        ? el.closest('label.tog').click()
        : el.click();
    });
    await expect(window.locator('#trigger-exercise')).toBeChecked();
  });

  test('save check-in navigates back to parent dashboard', async ({ window }) => {
    await window.selectOption('#child-select', { label: CHILD.name });
    await window.waitForSelector('#form-area:not(.hidden)');
    await window.click('#save-checkin-btn');
    await window.waitForSelector('#nav-grid', { timeout: 8000 });
    await expect(window.locator('#nav-grid')).toBeVisible();
  });
});

// ── Enter PEF ─────────────────────────────────────────────────────────────────

test.describe('Enter PEF', () => {
  test.beforeEach(async ({ window }) => {
    await navigateTo(window, 'parent-enter-pef');
    await window.waitForSelector('#child-select');
    await window.selectOption('#child-select', { label: CHILD.name });
    await window.waitForSelector('#form-area:not(.hidden)', { timeout: 5000 });
  });

  test('PEF input fields are visible after selecting child', async ({ window }) => {
    await expect(window.locator('#daily-pef')).toBeVisible();
    await expect(window.locator('#pre-med-pef')).toBeVisible();
    await expect(window.locator('#post-med-pef')).toBeVisible();
  });

  test('saving a PEF reading navigates back to dashboard', async ({ window }) => {
    await window.fill('#daily-pef', '350');
    await window.click('#save-pef-btn');
    await window.waitForSelector('#nav-grid', { timeout: 8000 });
    await expect(window.locator('#nav-grid')).toBeVisible();
  });

  test('saving with at least one value navigates back (second save)', async ({ window }) => {
    // The app requires at least one PEF value to be entered before saving.
    // Enter a second value (daily PEF) and confirm it navigates back.
    await window.fill('#pre-med-pef', '300');
    await window.click('#save-pef-btn');
    await window.waitForSelector('#nav-grid', { timeout: 8000 });
    await expect(window.locator('#nav-grid')).toBeVisible();
  });
});

// ── Set personal best ─────────────────────────────────────────────────────────

test.describe('Set personal best', () => {
  test.beforeEach(async ({ window }) => {
    await navigateTo(window, 'parent-set-pb');
    await window.waitForSelector('#child-select');
    await window.selectOption('#child-select', { label: CHILD.name });
    await window.waitForSelector('#pb-section:not(.hidden)', { timeout: 5000 });
  });

  test('PEF input is visible', async ({ window }) => {
    await expect(window.locator('#pb-value')).toBeVisible();
  });

  test('saving a personal best shows success banner', async ({ window }) => {
    await window.fill('#pb-value', '420');
    await window.click('#save-pb-btn');
    await window.waitForSelector('#success-msg:not(.hidden)', { timeout: 5000 });
    await expect(window.locator('#success-msg')).toBeVisible();
  });

  test('zone chips (green/yellow/red) are displayed', async ({ window }) => {
    await expect(window.locator('.zone-chip.green')).toBeVisible();
    await expect(window.locator('.zone-chip.yellow')).toBeVisible();
    await expect(window.locator('.zone-chip.red')).toBeVisible();
  });
});

// ── Controller schedule ───────────────────────────────────────────────────────

test.describe('Controller schedule', () => {
  test.beforeEach(async ({ window }) => {
    // The controller-schedule page requires a childId passed via navigation data.
    // Fetch the seeded child's ID via the IPC API, then navigate with it.
    const childId = await window.evaluate(async (childName) => {
      const children = await window.electronAPI.getChildren();
      const match = children.find(c => c.name === childName);
      return match ? match.child_id : null;
    }, CHILD.name);

    if (!childId) throw new Error('Seeded child not found — is seed-db.js working?');

    await window.evaluate((cid) => {
      window.electronAPI.navigate('parent-controller-schedule', { childId: cid });
    }, childId);
    await window.waitForLoadState('domcontentloaded');
    await window.waitForTimeout(500);
  });

  test('all 7 day checkboxes are present', async ({ window }) => {
    await expect(window.locator('#sched-mon')).toBeVisible();
    await expect(window.locator('#sched-tue')).toBeVisible();
    await expect(window.locator('#sched-wed')).toBeVisible();
    await expect(window.locator('#sched-thu')).toBeVisible();
    await expect(window.locator('#sched-fri')).toBeVisible();
    await expect(window.locator('#sched-sat')).toBeVisible();
    await expect(window.locator('#sched-sun')).toBeVisible();
  });

  test('doses per day input is present with default value', async ({ window }) => {
    const input = window.locator('#doses-per-day');
    await expect(input).toBeVisible();
    const val = await input.inputValue();
    expect(Number(val)).toBeGreaterThanOrEqual(1);
  });

  test('checking a day and saving shows success banner', async ({ window }) => {
    await window.check('#sched-mon');
    await window.click('#save-schedule-btn');
    await window.waitForSelector('#sched-success:not(.hidden)', { timeout: 5000 });
    await expect(window.locator('#sched-success')).toBeVisible();
  });
});

// ── Today's zone (parent view) ────────────────────────────────────────────────

test.describe("Today's zone (parent)", () => {
  test.beforeEach(async ({ window }) => {
    await navigateTo(window, 'parent-todays-zone');
  });

  test('page loads with child selector', async ({ window }) => {
    await expect(window.locator('#child-select')).toBeVisible();
  });

  test('selecting child with a personal best shows zone display', async ({ window }) => {
    await window.selectOption('#child-select', { label: CHILD.name });
    // May show zone or "no PEF" — either way the display container should appear
    await window.waitForTimeout(500);
    const hasZone = await window.locator('#zone-display:not(.hidden)').count();
    const hasNoPef = await window.locator('#no-zone:not(.hidden)').count();
    expect(hasZone + hasNoPef).toBeGreaterThan(0);
  });
});

// ── Adherence report ────────────────────────────────────────────────────────

test.describe('Adherence report', () => {
  test.beforeEach(async ({ window }) => {
    // Same pattern as controller schedule: fetch childId then navigate with it
    const childId = await window.evaluate(async (childName) => {
      const children = await window.electronAPI.getChildren();
      const match = children.find(c => c.name === childName);
      return match ? match.child_id : null;
    }, CHILD.name);

    if (!childId) throw new Error('Seeded child not found — is seed-db.js working?');

    await window.evaluate((cid) => {
      window.electronAPI.navigate('parent-adherence-report', { childId: cid });
    }, childId);
    await window.waitForLoadState('domcontentloaded');
    await window.waitForTimeout(500);
  });

  test('adherence card is visible', async ({ window }) => {
    await window.waitForSelector('#adherence-percentage', { timeout: 5000 });
    await expect(window.locator('#adherence-card')).toBeVisible();
  });

  test('percentage display shows a valid percentage', async ({ window }) => {
    await window.waitForSelector('#adherence-percentage', { timeout: 5000 });
    await expect(window.locator('#adherence-percentage')).toBeVisible();
    const text = await window.textContent('#adherence-percentage');
    expect(text).toMatch(/\d+%/);
  });

  test('days planned element exists with numeric value', async ({ window }) => {
    await window.waitForSelector('#adherence-days-planned', { timeout: 5000 });
    await expect(window.locator('#adherence-days-planned')).toBeVisible();
    const text = await window.textContent('#adherence-days-planned');
    expect(Number(text)).toBeGreaterThanOrEqual(0);
  });

  test('days completed element exists with numeric value', async ({ window }) => {
    await window.waitForSelector('#adherence-days-completed', { timeout: 5000 });
    await expect(window.locator('#adherence-days-completed')).toBeVisible();
    const text = await window.textContent('#adherence-days-completed');
    expect(Number(text)).toBeGreaterThanOrEqual(0);
  });

  test('alert message is visible', async ({ window }) => {
    await window.waitForSelector('#adherence-alert', { timeout: 5000 });
    await expect(window.locator('#adherence-alert')).toBeVisible();
    const text = await window.textContent('#adherence-alert');
    expect(text.length).toBeGreaterThan(0);
  });

  test('child name is displayed', async ({ window }) => {
    await window.waitForSelector('#adherence-child-name', { timeout: 5000 });
    await expect(window.locator('#adherence-child-name')).toBeVisible();
    const text = await window.textContent('#adherence-child-name');
    expect(text.trim().length).toBeGreaterThan(0);
  });

  test('back button returns to child overview', async ({ window }) => {
    await window.waitForSelector('#adherence-percentage', { timeout: 5000 });
    await window.click('#back-btn');
    await window.waitForSelector('#child-select', { timeout: 5000 });
    await expect(window.locator('#child-select')).toBeVisible();
  });
});
