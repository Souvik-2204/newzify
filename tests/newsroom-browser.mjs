import { reserveWindow } from './rate-window.mjs';
import 'dotenv/config';
import { chromium } from 'playwright';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { db } from '../server/db.mjs';
if (
  process.env.EMBEDDED_POSTGRES !== '1' ||
  process.env.NODE_ENV === 'production' ||
  !['127.0.0.1', 'localhost'].includes(new URL(process.env.DATABASE_URL).hostname)
)
  throw new Error('Use the local development installation.');
const url = `http://127.0.0.1:${process.env.PORT || 5433}`,
  suffix = crypto.randomUUID().slice(0, 8),
  slug = 'desk-browser-check-' + suffix;
const title = 'Local editorial manuscript ' + suffix,
  standard = 'Section desk verification ' + suffix,
  source = 'https://example.org/newsroom-check/' + suffix;
const ist = new Date(Date.now() + 19800000).toISOString().slice(0, 10);
const accounts = JSON.parse(await fs.readFile('data/local-accounts.json', 'utf8'));
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const errors = [],
  uploads = new Set(),
  sessions = [];
const button = (p, name) => p.getByRole('button', { name, exact: true });
const state = (p, name) =>
  p.locator('.studio-state .status-pill').filter({ hasText: name }).waitFor();
const roleNames = {
  SUPER_ADMIN: 'Super Admin',
  CHIEF_EDITOR: 'Chief Editor',
  SECTION_EDITOR: 'Section Editor',
  AUTHOR: 'Author / Journalist',
};
async function signIn(role) {
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await c.newPage();
  p.setDefaultTimeout(10000);
  sessions.push(c);
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('response', async (r) => {
    if (r.url().endsWith('/api/admin/images') && r.status() === 201)
      try {
        uploads.add((await r.json()).image);
      } catch {}
  });
  await p.goto(url + '/admin');
  const a = accounts.find((a) => a.role === role);
  await p.getByRole('heading', { name: 'Newsroom sign-in' }).waitFor();
  assert.equal(new URL(p.url()).pathname, '/newsroom');
  if (role === 'AUTHOR') {
    await p.screenshot({ path: '/tmp/meridian-newsroom-entry.png' });
    await button(p, 'View newsroom roles').click();
    const guide = p.getByRole('dialog', { name: 'Newsroom roles' });
    for (const name of Object.values(roleNames))
      await guide.getByRole('heading', { name, exact: true }).waitFor();
    await button(guide, 'Back to sign-in').click();
    assert.equal((await p.request.get(url + '/api/admin/overview')).status(), 401);
  }
  await p.getByLabel('Work email').fill(a.email);
  await p.getByLabel('Password', { exact: true }).fill(a.password);
  await button(p, 'Enter the newsroom').click();
  await p.getByRole('heading', { name: 'Roles & access', exact: true }).waitFor();
  await p
    .getByRole('region', { name: 'Your assigned desk' })
    .getByRole('heading', { name: roleNames[role], exact: true })
    .waitFor();
  assert.equal(await p.locator('.role-entry.is-current h3').innerText(), roleNames[role]);
  assert.equal(await p.locator('.role-entry').count(), 4);
  const tools = p.getByRole('navigation', { name: 'Tools for your role' });
  assert.equal(await button(tools, 'Users & roles').count(), role === 'SUPER_ADMIN' ? 1 : 0);
  return p;
}
async function sourceTab(p) {
  await button(p, 'Source & metadata').click();
  await p.getByLabel('Source publication').fill('Local newsroom verification');
  await p.getByLabel('Source URL').fill(source);
  await p.getByLabel('Original source date').fill(ist);
  await p.getByLabel('I confirm this is sourced, India-focused reporting.').check();
}
const assertWidth = async (p) =>
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    `No document overflow on ${p.url()}`,
  );
try {
  await reserveWindow(url, 230);
  const w = await signIn('AUTHOR');
  await button(w, 'My drafts').click();
  assert.equal(await w.getByLabel('Article status').inputValue(), 'DRAFT');
  await button(w, 'Overview').click();
  await button(w, 'Open my desk').click();
  await button(w, 'Create a draft').click();
  await w.getByLabel('Headline', { exact: true }).fill(title);
  await w
    .getByLabel('Summary', { exact: true })
    .fill('A disposable manuscript for checking the rich editor and independent review workflow.');
  await w.getByLabel('Section', { exact: true }).selectOption({ label: 'Politics' });
  const body = w.getByRole('textbox', { name: 'Article body' });
  await body.click();
  await w.getByLabel('Paragraph style').selectOption('h2');
  await w.keyboard.insertText('A verified section heading');
  await w.keyboard.press('Enter');
  await button(w, 'Bold').click();
  await w.keyboard.insertText('Reporting from the desk.');
  await button(w, 'Bold').click();
  await w.keyboard.insertText(
    ' This temporary manuscript checks how a rich-text story moves from private draft to the released India edition. ',
  );
  await button(w, 'Insert link').click();
  let dialog = w.getByRole('dialog');
  await dialog.getByLabel('Link text').fill('Original reporting');
  await dialog.getByLabel('Web address').fill(source);
  await button(dialog, 'Insert link').click();
  await dialog.waitFor({ state: 'hidden' });
  await button(w, 'Insert inline image').click();
  dialog = w.getByRole('dialog');
  await dialog.getByLabel('Image to insert').setInputFiles('client/public/images/hero-india.jpg');
  await dialog.locator('.inline-upload-preview').waitFor();
  await dialog.getByLabel('Image description').fill('Illustrative newsroom photograph');
  await button(dialog, 'Insert image').click();
  await w.locator('.ProseMirror img').waitFor();
  await w
    .getByLabel('Upload featured image')
    .setInputFiles('client/public/images/hero-business.jpg');
  await w.locator('.cover-field img[src^="/uploads/"]').waitFor();
  await w.getByLabel('Image credit').fill('Test illustration / The Meridian');
  await sourceTab(w);
  await button(w, 'Search & URL').click();
  await w.getByLabel(/URL slug/).fill(slug);
  await w.getByLabel(/SEO title/).fill('Editorial browser check');
  await w
    .getByLabel(/Meta description/)
    .fill('Independent release of the verified editorial manuscript.');
  await button(w, 'Preview').click();
  dialog = w.getByRole('dialog');
  await dialog.getByRole('heading', { name: 'A verified section heading' }).waitFor();
  assert.equal(await dialog.locator('.rich-prose strong').innerText(), 'Reporting from the desk.');
  assert.equal(
    await dialog.getByRole('link', { name: 'Original reporting' }).getAttribute('href'),
    source,
  );
  await dialog.getByAltText('Illustrative newsroom photograph').waitFor();
  await button(dialog, 'Close dialog').click();
  // Navigating away from a dirty manuscript requires confirmation.
  await button(w, 'Overview').click();
  await button(w, 'Stay in editor').click();
  await button(w, 'Save draft').click();
  await w.getByText('Changes saved', { exact: true }).waitFor();
  assert.ok(await button(w, 'Save draft').isDisabled());
  await button(w, 'Submit for review').click();
  await state(w, 'Submitted');
  assert.ok(await w.getByLabel('Headline', { exact: true }).isDisabled());
  assert.ok(await w.getByLabel('Mandatory approval').isDisabled());
  const fileUrl = w.url();
  console.log(
    'PASS Rich manuscript, link, inline and featured uploads, preview, draft and submission',
  );
  const chief = await signIn('CHIEF_EDITOR');
  await button(chief, 'Review mandatory submissions').click();
  assert.equal(new URL(chief.url()).searchParams.get('reviewType'), 'mandatory');
  await chief.locator('.table-story').filter({ hasText: title }).click();
  await button(chief, 'Return to author').click();
  dialog = chief.getByRole('dialog');
  assert.ok(await button(dialog, 'Return with feedback').isDisabled());
  const reason = 'Please clarify the context in the summary.';
  await dialog.getByLabel('Rejection reason').fill(reason);
  await button(dialog, 'Return with feedback').click();
  await state(chief, 'Rejected');
  await w.goto(fileUrl);
  await w.getByText(reason, { exact: true }).waitFor();
  await w
    .getByLabel('Summary', { exact: true })
    .fill(
      'The corrected summary identifies the original reporting and the context of this temporary local test.',
    );
  await button(w, 'Save & submit for review').click();
  await state(w, 'Submitted');
  await chief.reload();
  await button(chief, 'Approve revision').click();
  await button(chief.getByRole('dialog'), 'Confirm approval').click();
  await state(chief, 'Approved');
  const reader = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const rp = await reader.newPage();
  assert.equal((await rp.request.get(url + '/story/' + slug)).status(), 404);
  await button(chief, 'Publish approved revision').click();
  await button(chief.getByRole('dialog'), 'Publish story').click();
  await state(chief, 'Published');
  await rp.goto(url + '/story/' + slug);
  await rp.getByRole('heading', { name: 'A verified section heading' }).waitFor();
  assert.equal(await rp.title(), 'Editorial browser check — The Meridian');
  await assertWidth(rp);
  assert.equal(await rp.locator('.rich-prose strong').innerText(), 'Reporting from the desk.');
  assert.equal(
    await rp.getByRole('link', { name: 'Original reporting' }).getAttribute('href'),
    source,
  );
  await rp.getByAltText('Illustrative newsroom photograph').scrollIntoViewIfNeeded();
  await rp.waitForFunction(() => document.querySelector('.rich-prose img')?.naturalWidth > 0);
  console.log(
    'PASS Rejection reason → author correction → independent approval → publication, complete with reader metadata and media',
  );
  await w.goto(fileUrl);
  await w.getByLabel('Reading access', { exact: true }).selectOption('BRONZE');
  await w.getByLabel('Headline', { exact: true }).fill(title + ' · revised');
  await button(w, 'Save & submit for review').click();
  await state(w, 'Submitted');
  await rp.reload();
  await rp.locator('.article-prose').waitFor();
  assert.equal(await rp.locator('h1').innerText(), title);
  await chief.reload();
  await button(chief, 'Approve revision').click();
  await button(chief.getByRole('dialog'), 'Confirm approval').click();
  await button(chief, 'Publish approved revision').click();
  await button(chief.getByRole('dialog'), 'Publish story').click();
  await state(chief, 'Published');
  await rp.reload();
  await rp.locator('.paywall').waitFor();
  assert.equal(await rp.locator('.article-prose').count(), 0);
  await button(chief, 'Editorial record').click();
  assert.ok((await chief.locator('.audit-timeline').innerText()).includes(reason));
  console.log(
    'PASS Released edition remains stable during revision; new reading tier applies only after independent re-release',
  );
  await w.goto(url + '/newsroom?tab=edit');
  await w.getByLabel('Headline', { exact: true }).fill(standard);
  await w
    .getByLabel('Summary', { exact: true })
    .fill('Local standard-review fixture for the assigned Indian politics desk.');
  await w
    .getByRole('textbox', { name: 'Article body' })
    .fill(
      'This temporary standard review manuscript checks the assigned section editor’s direct review and release. It is removed at the end of the browser test.',
    );
  await w.getByLabel('Section', { exact: true }).selectOption({ label: 'Politics' });
  await w.getByLabel('Mandatory approval').uncheck();
  await sourceTab(w);
  await button(w, 'Save & submit for review').click();
  await state(w, 'Submitted');
  const desk = await signIn('SECTION_EDITOR');
  await desk.setViewportSize({ width: 390, height: 844 });
  await assertWidth(desk);
  await button(desk, 'Politics').click();
  assert.equal(
    await desk.getByLabel('Article category').locator('option:checked').innerText(),
    'Politics',
  );
  await button(desk, 'Toggle newsroom navigation').click();
  await button(desk, 'Roles & access').click();
  await button(desk, 'Review section submissions').click();
  assert.equal(new URL(desk.url()).searchParams.get('reviewType'), 'standard');
  assert.match(await desk.locator('.queue-tabs .active').innerText(), /Section review/);
  await desk.locator('.table-story').filter({ hasText: standard }).click();
  await assertWidth(desk);
  await button(desk, 'Review & publish').click();
  dialog = desk.getByRole('dialog');
  assert.ok(await button(dialog, 'Publish story').isDisabled());
  await dialog.getByLabel('I have reviewed this revision and its reporting source.').check();
  await button(dialog, 'Publish story').click();
  await state(desk, 'Published');
  await assertWidth(desk);
  console.log('PASS Assigned Section Editor: explicit review and direct publication on mobile');
  const root = await signIn('SUPER_ADMIN');
  await root.screenshot({ path: '/tmp/meridian-role-desks.png' });
  for (const [tool, target] of [
    ['Users & roles', 'Reader Directory'],
    ['Categories & tags', 'Sections & Tags'],
    ['Subscription plans', 'Membership Plans'],
    ['Newsroom settings', 'Workspace Settings'],
  ]) {
    await button(root, tool).click();
    await root.getByRole('heading', { name: target, exact: true }).waitFor();
    await button(root, 'Roles & access').click();
  }
  console.log(
    'PASS The four sign-ins open their assigned desks, with working role-specific shortcuts.',
  );
  for (const [tab, heading] of [
    ['Front page', 'The Front Page'],
    ['Membership plans', 'Membership Plans'],
    ['Workspace settings', 'Workspace Settings'],
  ]) {
    await button(root, tab).click();
    await root.getByRole('heading', { name: heading, exact: true }).waitFor();
    await assertWidth(root);
  }
  for (const width of [360, 768, 1024]) {
    await root.setViewportSize({ width, height: 860 });
    for (const tab of ['roles', 'articles', 'edit', 'front-page', 'plans', 'settings']) {
      await root.goto(url + '/newsroom?tab=' + tab, { waitUntil: 'networkidle' });
      await assertWidth(root);
    }
  }
  assert.deepEqual(errors, []);
  console.log('PASS Admin controls at mobile/tablet/desktop sizes; no uncaught page errors');
} finally {
  for (const c of sessions)
    await c.request
      .post(url + '/api/auth/logout', { headers: { 'x-meridian-request': '1' } })
      .catch(() => {});
  await browser.close();
  await db.article.deleteMany({ where: { sourceUrl: source } });
  if (uploads.size) {
    await db.uploadedImage.deleteMany({ where: { path: { in: [...uploads] } } });
    for (const p of uploads) await fs.rm('data' + p, { force: true });
  }
  await db.$disconnect();
}
