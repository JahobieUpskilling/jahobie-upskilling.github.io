/* End-to-end check of the ABC Tutoring booking journey. */
const { chromium } = require('playwright');
const zlib = require('zlib');
const path = require('path');

// Uses the Chromium that `npx playwright install chromium` provides.
const BASE = process.env.BASE || 'http://localhost:8123/';
const OUT = process.env.OUT || __dirname;

function decodePosthog(req) {
  const events = [];
  try {
    const buf = req.postDataBuffer();
    if (!buf) return events;
    let text;
    try {
      text = zlib.gunzipSync(buf).toString('utf8');
    } catch (e) {
      text = buf.toString('utf8');
    }
    if (text.startsWith('data=')) text = decodeURIComponent(text.slice(5));
    const parsed = JSON.parse(text);
    const arr = Array.isArray(parsed) ? parsed : (parsed.batch || [parsed]);
    for (const e of arr) if (e && e.event) events.push(e);
  } catch (e) { /* opaque payload */ }
  return events;
}

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 950 } });
  const page = await ctx.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  const phRequests = [];
  const phEvents = [];

  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('request', (req) => {
    if (/posthog\.com/.test(req.url())) {
      phRequests.push(req.method() + ' ' + req.url().split('?')[0]);
      decodePosthog(req).forEach((e) => phEvents.push(e));
    }
  });

  const step = (msg) => console.log('\n=== ' + msg + ' ===');
  const assert = (cond, msg) => console.log((cond ? 'PASS  ' : 'FAIL  ') + msg);

  // ---- Load ----
  step('Load home, referred from the Facebook group');
  await page.goto(BASE + '?utm_source=facebook&utm_medium=group&utm_campaign=neighborhood_parents',
    { waitUntil: 'networkidle' });
  assert((await page.locator('.tutor-card').count()) === 6, 'six tutor cards render');
  console.log('results text:', await page.locator('#resultsCount').textContent());
  await page.screenshot({ path: path.join(OUT, 'desktop-home.png'), fullPage: false });

  // ---- Filter ----
  step('Filter: Math for a 7th grader');
  await page.selectOption('#filterSubject', 'Math');
  await page.selectOption('#filterGrade', '7');
  await page.waitForTimeout(200);
  const filtered = await page.locator('.tutor-card').count();
  console.log('filtered count:', filtered, '|', await page.locator('#resultsCount').textContent());
  assert(filtered >= 1 && filtered < 6, 'filter narrows the list');

  step('Rate filter down to the minimum');
  await page.fill('#filterRate', '38');
  await page.dispatchEvent('#filterRate', 'change');
  await page.waitForTimeout(150);
  console.log('after rate filter:', await page.locator('#resultsCount').textContent(),
    '| cards:', await page.locator('.tutor-card').count());
  await page.click('#clearFilters');
  await page.waitForTimeout(900); // let the debounced filter event fire
  assert((await page.locator('.tutor-card').count()) === 6, 'clear filters restores all tutors');

  // ---- Profile ----
  step('Open a tutor profile');
  await page.locator('.tutor-card', { hasText: 'Maya Ellison' })
    .getByRole('button', { name: 'View profile' }).click();
  await page.waitForSelector('#panel[open]');
  assert(await page.locator('#panel .profile-head h3').textContent() === 'Maya Ellison', 'profile shows the tutor');
  assert(page.url().includes('#tutor=maya-ellison'), 'profile is deep-linkable: ' + page.url());
  await page.screenshot({ path: path.join(OUT, 'desktop-profile.png') });

  // ---- Time step ----
  step('Choose a time');
  await page.click('[data-action="choose-time"]');
  await page.waitForSelector('.slot-row');
  const openSlots = page.locator('.slot:not([disabled])');
  const openCount = await openSlots.count();
  const bookedCount = await page.locator('.slot[disabled]').count();
  console.log('open slots:', openCount, '| already-booked slots shown:', bookedCount);
  assert(openCount > 0 && bookedCount > 0, 'picker shows both open and booked hours');

  const firstSlot = openSlots.first();
  const slotLabel = (await firstSlot.textContent()).trim();
  const slotDate = await firstSlot.getAttribute('data-date');
  const slotTime = await firstSlot.getAttribute('data-time');
  await firstSlot.click();
  assert(await firstSlot.getAttribute('aria-pressed') === 'true', 'slot marked selected: ' + slotDate + ' ' + slotTime);
  await page.screenshot({ path: path.join(OUT, 'desktop-times.png') });
  await page.click('[data-action="to-details"]');

  // ---- Details ----
  step('Fill the booking form');
  await page.waitForSelector('#bookingForm');
  await page.click('button[type="submit"]');
  const errText = await page.locator('#parentNameError').textContent();
  assert(errText.length > 0, 'empty form is blocked with a message: "' + errText + '"');

  await page.fill('#parentName', 'Dana Test Parent');
  await page.fill('#parentEmail', 'not-an-email');
  await page.fill('#studentName', 'Riley');
  await page.selectOption('#studentGrade', '7');
  await page.selectOption('#bookingSubject', 'Pre-Algebra');
  await page.click('button[type="submit"]');
  assert((await page.locator('#parentEmailError').textContent()).length > 0, 'invalid email is rejected');
  await page.fill('#parentEmail', 'parent@example.com');
  await page.screenshot({ path: path.join(OUT, 'desktop-form.png') });
  await page.click('button[type="submit"]');

  // ---- Confirmation ----
  step('Confirmation');
  await page.waitForSelector('.confirm-card');
  console.log(await page.locator('.confirm-card').innerText());
  await page.screenshot({ path: path.join(OUT, 'desktop-confirm.png') });
  assert((await page.locator('#navBookingCount').textContent()) === '1', 'header booking count shows 1');
  await page.click('[data-action="done"]');
  await page.waitForTimeout(300);
  assert((await page.locator('.booking-card').count()) === 1, 'booking appears in My bookings');
  await page.screenshot({ path: path.join(OUT, 'desktop-bookings.png') });

  // ---- Persistence ----
  step('Reload and confirm the hour stays booked');
  await page.reload({ waitUntil: 'networkidle' });
  assert((await page.locator('.booking-card').count()) === 1, 'booking survives a refresh');
  await page.locator('.tutor-card', { hasText: 'Maya Ellison' })
    .getByRole('button', { name: 'Book a session' }).click();
  await page.waitForSelector('.slot-row');
  const mine = page.locator(`.slot[data-date="${slotDate}"][data-time="${slotTime}"]`);
  assert(await mine.isDisabled(), 'the booked hour is no longer selectable');
  assert((await mine.getAttribute('class')).includes('is-mine'), 'it is labelled as this visitor\'s own booking');

  // ---- Second booking, different tutor ----
  step('Second booking with a different tutor');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.locator('.tutor-card', { hasText: 'Priya Raman' })
    .getByRole('button', { name: 'Book a session' }).click();
  await page.waitForSelector('.slot-row');
  await page.locator('.slot:not([disabled])').nth(2).click();
  await page.click('[data-action="to-details"]');
  await page.waitForSelector('#bookingForm');
  const prefilled = await page.inputValue('#parentName');
  assert(prefilled === 'Dana Test Parent', 'parent details prefill from the last booking');
  await page.fill('#studentName', 'Riley');
  await page.selectOption('#studentGrade', '7');
  await page.selectOption('#bookingSubject', 'Writing');
  await page.click('button[type="submit"]');
  await page.waitForSelector('.confirm-card');
  await page.click('[data-action="done"]');
  await page.waitForTimeout(300);
  assert((await page.locator('.booking-card').count()) === 2, 'two bookings listed');

  // ---- Abandonment ----
  step('Start a booking and leave without finishing');
  await page.locator('.tutor-card', { hasText: 'Aisha Bello' })
    .getByRole('button', { name: 'Book a session' }).click();
  await page.waitForSelector('.slot-row');
  await page.locator('.slot:not([disabled])').first().click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  assert(!(await page.locator('#panel[open]').count()), 'Esc closes the booking panel');

  // ---- Cancellation ----
  step('Cancel the first booking');
  const cancelBtn = page.locator('.booking-card').first().getByRole('button');
  await cancelBtn.click();
  await page.waitForSelector('#cancelDialog[open]');
  await page.screenshot({ path: path.join(OUT, 'desktop-cancel.png') });
  await page.click('#cancelConfirm');
  await page.waitForTimeout(400);
  assert((await page.locator('.booking-card').count()) === 1, 'booking removed from the list');
  const toastText = await page.locator('#toast').textContent();
  console.log('toast:', toastText);

  step('Cancelled hour is bookable again');
  await page.locator('.tutor-card', { hasText: 'Maya Ellison' })
    .getByRole('button', { name: 'Book a session' }).click();
  await page.waitForSelector('.slot-row');
  const freed = page.locator(`.slot[data-date="${slotDate}"][data-time="${slotTime}"]`);
  assert(!(await freed.isDisabled()), 'the cancelled hour is open again (' + slotLabel + ')');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // ---- Deep link ----
  step('Deep link straight to a profile');
  await page.goto(BASE + '#tutor=daniel-okafor', { waitUntil: 'networkidle' });
  await page.waitForSelector('#panel[open]');
  assert((await page.locator('#panel .profile-head h3').textContent()) === 'Daniel Okafor', 'deep link opens the profile');
  await page.keyboard.press('Escape');

  // ---- Mobile ----
  step('Mobile layout (390x844)');
  const mobile = await ctx.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(BASE, { waitUntil: 'networkidle' });
  const overflow = await mobile.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(overflow <= 0, 'no horizontal overflow on mobile (overflow=' + overflow + 'px)');
  await mobile.screenshot({ path: path.join(OUT, 'mobile-home.png'), fullPage: false });
  await mobile.locator('.tutor-card').first().getByRole('button', { name: 'Book a session' }).click();
  await mobile.waitForSelector('.slot-row');
  await mobile.screenshot({ path: path.join(OUT, 'mobile-times.png') });
  await mobile.locator('.slot:not([disabled])').first().click();
  await mobile.click('[data-action="to-details"]');
  await mobile.waitForSelector('#bookingForm');
  await mobile.screenshot({ path: path.join(OUT, 'mobile-form.png') });
  const mOverflow = await mobile.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(mOverflow <= 0, 'booking panel fits the mobile viewport');

  // ---- Keyboard / a11y smoke ----
  step('Keyboard reachability');
  await mobile.close();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.keyboard.press('Tab');
  const firstFocus = await page.evaluate(() => document.activeElement.textContent.trim());
  assert(/Skip to main content/.test(firstFocus), 'first tab stop is the skip link (got: ' + firstFocus + ')');

  // ---- Telemetry summary ----
  await page.waitForTimeout(2500);
  step('PostHog network + events');
  console.log('requests to posthog:', phRequests.length);
  console.log([...new Set(phRequests)].join('\n'));
  const byName = {};
  for (const e of phEvents) {
    byName[e.event] = byName[e.event] || [];
    byName[e.event].push(e.properties || {});
  }
  console.log('\ncaptured events:');
  for (const [name, list] of Object.entries(byName)) console.log('  ' + name + ' × ' + list.length);

  const custom = Object.keys(byName).filter((n) => !n.startsWith('$'));
  console.log('\ncustom event property samples:');
  for (const name of custom) {
    const p = byName[name][0];
    const keep = {};
    for (const k of Object.keys(p)) {
      if (!k.startsWith('$') && k !== 'token' && k !== 'distinct_id') keep[k] = p[k];
    }
    console.log('  ' + name + ': ' + JSON.stringify(keep));
  }

  // PII leak check across every captured payload
  const blob = JSON.stringify(phEvents);
  const leaks = ['Dana Test Parent', 'parent@example.com', 'Riley'].filter((s) => blob.includes(s));
  assert(leaks.length === 0, 'no parent/student PII in any PostHog payload' +
    (leaks.length ? ' — LEAKED: ' + leaks.join(', ') : ''));

  step('Console health');
  console.log('page errors:', pageErrors.length ? pageErrors : 'none');
  console.log('console errors/warnings:', consoleErrors.length ? consoleErrors : 'none');

  await browser.close();
})().catch((e) => { console.error('TEST RUN FAILED:', e); process.exit(1); });
