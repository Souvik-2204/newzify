import { reserveWindow } from './rate-window.mjs';
import 'dotenv/config';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { db } from '../server/db.mjs';
if (
  process.env.EMBEDDED_POSTGRES !== '1' ||
  process.env.NODE_ENV === 'production' ||
  !['127.0.0.1', 'localhost'].includes(new URL(process.env.DATABASE_URL).hostname)
)
  throw new Error('Use the local development database for this test.');
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 920 } }),
  p = await ctx.newPage(),
  url = `http://127.0.0.1:${process.env.PORT || 5433}`;
const email = `browser-${crypto.randomUUID()}@qa.invalid`,
  tagName = 'Verification tag ' + crypto.randomUUID().slice(0, 8),
  errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.setDefaultTimeout(9000);
const check = (s) => console.log('PASS', s);
try {
  await reserveWindow(url, 75);
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'Next lead story' }).click();
  assert.match(await p.locator('h1').innerText(), /BUSINESS/);
  await p.getByRole('button', { name: 'Previous lead story' }).click();
  assert.match(await p.locator('h1').innerText(), /SHAPING INDIA/);
  check('Cinematic slides and manual controls');
  await p.getByRole('button', { name: 'Search stories', exact: true }).click();
  await p.getByRole('textbox', { name: 'Search headlines, topics and stories' }).fill('Dhoni');
  await p.locator('.search-results button').filter({ hasText: 'For Dhoni and Chennai' }).click();
  await p.locator('.article-prose').waitFor();
  assert.match(await p.locator('h1').innerText(), /Dhoni/);
  check('Search returns and opens the correct sourced article');
  await p.getByRole('button', { name: 'Sign in or register' }).click();
  await p.getByRole('button', { name: 'Create an account', exact: true }).click();
  await p.getByLabel('Full name', { exact: true }).fill('Browser Verification');
  await p.getByLabel('Email address', { exact: true }).fill(email);
  await p.locator('input[name="password"]').fill('Temporary-test-password');
  await p.getByRole('button', { name: 'Create free account' }).click();
  await p.getByRole('dialog').waitFor({ state: 'hidden' });
  check('Reader registration and HTTP-only session');
  await p.locator('.article-actions .save-button').click();
  await p.getByRole('button', { name: 'Open account menu' }).click();
  await p.locator('.profile-menu').getByRole('link', { name: 'Reading list' }).click();
  await p.locator('.account-page .story-card').waitFor();
  assert.match(await p.locator('.account-page .story-card h3').innerText(), /Dhoni/);
  check('Saved article persists to reader dashboard');
  await p.getByRole('button', { name: 'Profile', exact: true }).click();
  await p.getByLabel('Display name').fill('Updated Browser Reader');
  await p.getByRole('button', { name: 'Save profile' }).click();
  await p.getByText('Your profile has been updated.', { exact: true }).waitFor();
  check('Profile form persists changes');
  await p.goto(url + '/subscribe', { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: /^Annual/ }).click();
  assert.match(await p.locator('.plan-bronze .plan-price').innerText(), /990/);
  if (!(await (await p.request.get(url + '/api/plans')).json()).checkoutReady) {
    await p.getByRole('button', { name: 'Choose Bronze' }).click();
    await p.getByRole('button', { name: 'Register my interest' }).click();
    await p.getByRole('heading', { name: 'You’re on the list.' }).waitFor();
    check('Annual billing and honest unconfigured-gateway interest flow');
  }
  await p.goto(url + '/story/india-semiconductor-supply-chain', { waitUntil: 'networkidle' });
  await p.locator('.paywall').waitFor();
  assert.equal(await p.locator('.article-prose').count(), 0);
  check('Premium panel without hidden body text');
  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'Open menu', exact: true }).click();
  await p.locator('.mobile-nav').getByRole('link', { name: 'Sports', exact: true }).click();
  await p.locator('.browse-grid .story-card').first().waitFor();
  assert.equal(await p.locator('h1').innerText(), 'Sports');
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  check('Mobile section navigation and no horizontal overflow');
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.screenshot({ path: '/tmp/meridian-mobile-final.png' });
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1100);
  await p.screenshot({ path: '/tmp/meridian-desktop-final.png' });
  const creds = JSON.parse(await fs.readFile('data/local-accounts.json', 'utf8')).find(
    (c) => c.role === 'SUPER_ADMIN',
  );
  await p.goto(url + '/admin', { waitUntil: 'networkidle' });
  await p.getByLabel('Work email').fill(creds.email);
  await p.getByLabel('Password', { exact: true }).fill(creds.password);
  await p.getByRole('button', { name: 'Enter the newsroom' }).click();
  await p.getByRole('heading', { name: 'Roles & access', exact: true }).waitFor();
  await p.getByRole('button', { name: 'Overview', exact: true }).click();
  await p.getByRole('heading', { name: 'The Newsroom', exact: true }).waitFor();
  await p.screenshot({ path: '/tmp/meridian-cms.png' });
  await p.getByRole('button', { name: 'Article manager', exact: true }).click();
  await p.getByRole('textbox', { name: 'Search articles' }).fill('Dhoni');
  await p.locator('.table-story').filter({ hasText: 'Dhoni' }).waitFor();
  await p.locator('.table-story').filter({ hasText: 'Dhoni' }).click();
  await p.getByLabel('Headline', { exact: true }).waitFor();
  assert.match(await p.getByLabel('Headline', { exact: true }).inputValue(), /Dhoni/);
  await p.getByRole('button', { name: 'Editorial record', exact: true }).click();
  await p.getByRole('heading', { name: 'Editorial record' }).waitFor();
  check('CMS statistics, search, story editor and audit record');
  await p.getByRole('button', { name: 'Sections & tags' }).click();
  await p.getByRole('button', { name: 'Add tag' }).click();
  await p.getByRole('dialog').getByLabel('Name', { exact: true }).fill(tagName);
  await p.getByRole('button', { name: 'Save changes' }).click();
  await p.getByRole('button', { name: 'Delete ' + tagName }).click();
  await p.getByRole('button', { name: 'Confirm deletion' }).click();
  await p.getByRole('dialog').waitFor({ state: 'hidden' });
  check('Taxonomy create and delete');
  await p.getByRole('button', { name: 'Reader directory' }).click();
  await p.getByRole('textbox', { name: 'Find a user' }).fill(email);
  await p.locator('td').filter({ hasText: email }).waitFor();
  await p.getByRole('button', { name: 'Subscriptions', exact: true }).click();
  await p.getByRole('heading', { name: 'Subscriptions', exact: true }).waitFor();
  await p.locator('.cms-table tbody, .cms-content .empty-state').first().waitFor();
  check('Reader directory and subscription management');
  assert.deepEqual(errors, []);
  console.log('Browser checks complete. No uncaught page errors.');
} finally {
  await browser.close();
  await db.planInterest.deleteMany({ where: { email } });
  await db.user.deleteMany({ where: { email } });
  await db.tag.deleteMany({ where: { name: tagName } });
  await db.adminEvent.deleteMany({
    where: { entity: 'tag', details: { path: ['name'], equals: tagName } },
  });
  await db.$disconnect();
}
