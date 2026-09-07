/* Confirms PostHog actually transmits our custom events (bot detection off). */
const { chromium } = require('playwright');
const zlib = require('zlib');

// Uses the Chromium that `npx playwright install chromium` provides.
const BASE = process.env.BASE || 'http://localhost:8123/';

function decode(req) {
  const out = [];
  try {
    const buf = req.postDataBuffer();
    if (!buf) return out;
    let text;
    try { text = zlib.gunzipSync(buf).toString('utf8'); } catch (e) { text = buf.toString('utf8'); }
    if (text.startsWith('data=')) text = decodeURIComponent(text.slice(5));
    const parsed = JSON.parse(text);
    const arr = Array.isArray(parsed) ? parsed : (parsed.batch || [parsed]);
    for (const e of arr) if (e && e.event) out.push(e);
  } catch (e) { out.push({ event: '<undecodable>', properties: {} }); }
  return out;
}

(async () => {
  const browser = await chromium.launch({
    
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled']
  });
  const ctx = await browser.newContext({
    viewport: { width: 1360, height: 950 },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
  });
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  const page = await ctx.newPage();

  const events = [];
  const urls = [];
  page.on('request', (r) => {
    if (/posthog\.com/.test(r.url())) {
      urls.push(r.method() + ' ' + r.url().split('?')[0]);
      decode(r).forEach((e) => events.push(e));
    }
  });
  page.on('pageerror', (e) => console.log('PAGE ERROR', String(e)));

  await page.goto(BASE + '?utm_source=facebook&utm_medium=group&utm_campaign=neighborhood_parents',
    { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  console.log('posthog loaded:', await page.evaluate(() => Boolean(window.posthog && window.posthog.__loaded)));
  console.log('capturing:', await page.evaluate(() => {
    try { return window.posthog.is_capturing ? window.posthog.is_capturing() : 'n/a'; } catch (e) { return String(e); }
  }));

  // Full journey
  await page.locator('.tutor-card', { hasText: 'Maya Ellison' }).getByRole('button', { name: 'View profile' }).click();
  await page.waitForSelector('#panel[open]');
  await page.click('[data-action="choose-time"]');
  await page.waitForSelector('.slot-row');
  await page.locator('.slot:not([disabled])').first().click();
  await page.locator('.slot:not([disabled])').nth(1).click(); // change of mind
  await page.click('[data-action="to-details"]');
  await page.waitForSelector('#bookingForm');
  await page.fill('#parentName', 'Dana Test Parent');
  await page.fill('#parentEmail', 'parent@example.com');
  await page.fill('#studentName', 'Riley');
  await page.selectOption('#studentGrade', '7');
  await page.selectOption('#bookingSubject', 'Pre-Algebra');
  await page.click('button[type="submit"]');
  await page.waitForSelector('.confirm-card');
  await page.click('[data-action="done"]');
  await page.waitForTimeout(500);

  // Abandon a second flow
  await page.locator('.tutor-card', { hasText: 'Aisha Bello' }).getByRole('button', { name: 'Book a session' }).click();
  await page.waitForSelector('.slot-row');
  await page.locator('.slot:not([disabled])').first().click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // Cancel the booking
  await page.locator('.booking-card').first().getByRole('button').click();
  await page.waitForSelector('#cancelDialog[open]');
  await page.click('#cancelConfirm');
  await page.waitForTimeout(3000);

  console.log('\nrequest endpoints:');
  console.log([...new Set(urls)].join('\n'));

  console.log('\nevents received by PostHog:');
  const grouped = {};
  for (const e of events) (grouped[e.event] = grouped[e.event] || []).push(e.properties || {});
  for (const [name, list] of Object.entries(grouped)) console.log('  ' + name + ' × ' + list.length);

  console.log('\ncustom event payloads:');
  for (const [name, list] of Object.entries(grouped)) {
    if (name.startsWith('$')) continue;
    const p = list[0];
    const keep = {};
    for (const k of Object.keys(p)) {
      if (k.startsWith('$') && k !== '$current_url') continue;
      keep[k] = p[k];
    }
    console.log('  ' + name + ' => ' + JSON.stringify(keep));
  }

  const anyProps = (Object.values(grouped)[0] || [{}])[0] || {};
  console.log('\nsuper properties on a sample event:', JSON.stringify({
    traffic_source: anyProps.traffic_source,
    from_facebook_group: anyProps.from_facebook_group,
    referrer_domain: anyProps.referrer_domain,
    utm_source: anyProps.utm_source,
    first_touch_source: anyProps.first_touch_source
  }));

  const blob = JSON.stringify(events);
  const leaks = ['Dana Test Parent', 'parent@example.com', 'Riley'].filter((s) => blob.includes(s));
  console.log('\nPII leak check:', leaks.length ? 'LEAKED ' + leaks.join(', ') : 'clean — no names or emails transmitted');
  console.log('session replay requests:', urls.filter((u) => /\/s\//.test(u)).length);

  await browser.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
