/**
 * Simulated visitor traffic for the ABC Tutoring site.
 *
 * Drives real browser sessions against the site so PostHog fills with a
 * realistic mix of behaviour: parents who look and leave, parents who compare
 * tutors, parents who book, and the occasional cancellation. Each visitor gets
 * a fresh browser context, so PostHog sees them as separate people arriving
 * from different places.
 *
 * Usage:
 *   node scripts/simulate-traffic.js                     # 12 visitors, live site
 *   VISITORS=30 node scripts/simulate-traffic.js         # more visitors
 *   BASE=http://localhost:8123/ node scripts/simulate-traffic.js
 *   HEADLESS=false node scripts/simulate-traffic.js      # watch it happen
 *
 * Requires: npm install playwright && npx playwright install chromium
 *
 * The names and emails typed into the booking form below are invented for the
 * simulation. They never leave the browser: the site keeps them in
 * localStorage and deliberately excludes them from analytics.
 */
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'https://jahobieupskilling.github.io/jahobie-upskilling.github.io/';
const VISITORS = Number(process.env.VISITORS || 12);
const HEADLESS = process.env.HEADLESS !== 'false';

// PostHog discards events from browsers that announce themselves as automated,
// so the simulated visitors present as an ordinary Chrome install.
const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

/** Where visitors arrive from, weighted the way a small local service sees it. */
const SOURCES = [
  { weight: 45, label: 'facebook group', query: '?utm_source=facebook&utm_medium=group&utm_campaign=neighborhood_parents' },
  { weight: 25, label: 'direct', query: '' },
  { weight: 20, label: 'search', query: '?utm_source=google&utm_medium=organic' },
  { weight: 10, label: 'school newsletter', query: '?utm_source=newsletter&utm_medium=email&utm_campaign=fall_term' }
];

/** What a visitor came to do. */
const BEHAVIOURS = [
  { weight: 25, name: 'bounce' },   // lands, has a look, leaves
  { weight: 30, name: 'browse' },   // filters and compares, does not book
  { weight: 35, name: 'book' },     // completes a booking
  { weight: 10, name: 'cancel' }    // books, then changes their mind
];

const DEVICES = [
  { weight: 60, name: 'mobile', viewport: { width: 390, height: 844 } },
  { weight: 40, name: 'desktop', viewport: { width: 1360, height: 900 } }
];

const PARENTS = [
  ['Alex Whitmore', 'alex.whitmore@example.com', 'Jordan'],
  ['Priya Shah', 'p.shah@example.com', 'Nila'],
  ['Marcus Bell', 'marcus.bell@example.com', 'Theo'],
  ['Carmen Ortiz', 'carmen.o@example.com', 'Luis'],
  ['Beth Nakamura', 'beth.n@example.com', 'Kai'],
  ['Tom Fielding', 'tfielding@example.com', 'Ruby'],
  ['Nadia Haddad', 'nadia.h@example.com', 'Sami'],
  ['Greg Lindqvist', 'greg.l@example.com', 'Ingrid']
];

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

function weighted(list) {
  const total = list.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;
  for (const item of list) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return list[list.length - 1];
}

/** Parents read before they click. */
const pause = (page, min, max) => page.waitForTimeout(rand(min, max));

async function runVisitor(browser, index) {
  const source = weighted(SOURCES);
  const behaviour = weighted(BEHAVIOURS);
  const device = weighted(DEVICES);

  const context = await browser.newContext({
    viewport: device.viewport,
    userAgent: USER_AGENT,
    isMobile: device.name === 'mobile',
    hasTouch: device.name === 'mobile'
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const page = await context.newPage();
  const outcome = { visitor: index + 1, source: source.label, device: device.name, behaviour: behaviour.name, booked: false, cancelled: false };

  try {
    await page.goto(BASE + source.query, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.tutor-card', { timeout: 15000 });
    await pause(page, 800, 2500);

    // Everyone scrolls the tutor list a little.
    await page.mouse.wheel(0, rand(400, 1400));
    await pause(page, 600, 2000);

    if (behaviour.name === 'bounce') {
      await pause(page, 500, 1500);
      return outcome;
    }

    // Browsers and bookers narrow the list first.
    if (Math.random() < 0.7) {
      const subject = await page.$eval('#filterSubject', (el) =>
        Array.from(el.options).slice(1).map((o) => o.value)[Math.floor(Math.random() * (el.options.length - 1))]
      );
      if (subject) await page.selectOption('#filterSubject', subject);
      await pause(page, 400, 1200);
    }
    if (Math.random() < 0.6) {
      await page.selectOption('#filterGrade', String(rand(3, 10)));
      await pause(page, 400, 1200);
    }

    let cards = await page.locator('.tutor-card').count();
    if (cards === 0) {
      await page.click('#clearFilters');
      await pause(page, 400, 900);
      cards = await page.locator('.tutor-card').count();
    }

    // Look at one to three profiles before deciding.
    const profileViews = rand(1, Math.min(3, cards));
    for (let i = 0; i < profileViews; i++) {
      const card = page.locator('.tutor-card').nth(rand(0, cards - 1));
      await card.getByRole('button', { name: 'View profile' }).click();
      await page.waitForSelector('#panel[open]');
      await pause(page, 1200, 3500);
      const isLast = i === profileViews - 1;
      if (!isLast || behaviour.name === 'browse') {
        await page.keyboard.press('Escape');
        await pause(page, 400, 1200);
      }
    }

    if (behaviour.name === 'browse') {
      await pause(page, 500, 1500);
      return outcome;
    }

    // Bookers continue from the profile they left open.
    const chooseTime = page.locator('[data-action="choose-time"]');
    if (!(await chooseTime.count()) || (await chooseTime.isDisabled())) return outcome;
    await chooseTime.click();
    await page.waitForSelector('.slot-row');
    await pause(page, 1000, 2500);

    const open = page.locator('.slot:not([disabled])');
    const openCount = await open.count();
    if (!openCount) return outcome;

    // Some parents try one hour, then settle on another.
    await open.nth(rand(0, openCount - 1)).click();
    await pause(page, 500, 1800);
    if (Math.random() < 0.4 && openCount > 1) {
      await open.nth(rand(0, openCount - 1)).click();
      await pause(page, 400, 1200);
    }

    await page.click('[data-action="to-details"]');
    await page.waitForSelector('#bookingForm');
    await pause(page, 800, 2000);

    const [parentName, parentEmail, studentName] = pick(PARENTS);
    await page.fill('#parentName', parentName);
    await page.fill('#parentEmail', parentEmail);
    await page.fill('#studentName', studentName);

    const grades = await page.$eval('#studentGrade', (el) =>
      Array.from(el.options).slice(1).map((o) => o.value));
    const subjects = await page.$eval('#bookingSubject', (el) =>
      Array.from(el.options).slice(1).map((o) => o.value));
    if (!grades.length || !subjects.length) return outcome;
    await page.selectOption('#studentGrade', pick(grades));
    await page.selectOption('#bookingSubject', pick(subjects));
    await pause(page, 600, 1800);

    await page.click('button[type="submit"]');
    await page.waitForSelector('.confirm-card', { timeout: 10000 });
    outcome.booked = true;
    await pause(page, 1200, 3000);
    await page.click('[data-action="done"]');
    await pause(page, 600, 1500);

    if (behaviour.name === 'cancel') {
      await page.locator('.booking-card').first().getByRole('button').click();
      await page.waitForSelector('#cancelDialog[open]');
      await pause(page, 800, 2000);
      await page.click('#cancelConfirm');
      outcome.cancelled = true;
      await pause(page, 800, 1500);
    }

    return outcome;
  } catch (err) {
    outcome.error = err.message.split('\n')[0];
    return outcome;
  } finally {
    // Give PostHog a moment to flush before the context disappears.
    await page.waitForTimeout(2500).catch(() => {});
    await context.close();
  }
}

(async () => {
  console.log(`Simulating ${VISITORS} visitors against ${BASE}\n`);
  const browser = await chromium.launch({
    headless: HEADLESS,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled']
  });

  const results = [];
  for (let i = 0; i < VISITORS; i++) {
    const outcome = await runVisitor(browser, i);
    results.push(outcome);
    console.log(
      `  visitor ${String(outcome.visitor).padStart(2)} | ${outcome.device.padEnd(7)} | ` +
      `${outcome.source.padEnd(18)} | ${outcome.behaviour.padEnd(6)} | ` +
      (outcome.error ? 'error: ' + outcome.error
        : outcome.cancelled ? 'booked then cancelled'
        : outcome.booked ? 'booked' : 'left without booking')
    );
  }

  await browser.close();

  const booked = results.filter((r) => r.booked).length;
  const cancelled = results.filter((r) => r.cancelled).length;
  const errors = results.filter((r) => r.error).length;
  const fromGroup = results.filter((r) => r.source === 'facebook group');
  const groupBooked = fromGroup.filter((r) => r.booked).length;

  console.log('\nSummary');
  console.log(`  visitors:            ${results.length}`);
  console.log(`  bookings completed:  ${booked} (${Math.round((booked / results.length) * 100)}% conversion)`);
  console.log(`  bookings cancelled:  ${cancelled}`);
  console.log(`  left without booking:${results.length - booked}`);
  console.log(`  from Facebook group: ${fromGroup.length}, of which booked: ${groupBooked}`);
  if (errors) console.log(`  visitors that hit an error: ${errors}`);
  console.log('\nOpen PostHog -> Activity to see these sessions arrive.');
})();
