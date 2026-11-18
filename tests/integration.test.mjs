import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { db } from '../server/db.mjs';
// Disposable fixtures in the local development database only. Never run against production.
const local = process.env.EMBEDDED_POSTGRES === '1' && process.env.NODE_ENV !== 'production';
const base = process.env.TEST_BASE_URL || `http://127.0.0.1:${process.env.PORT || 5433}/api`;
async function request(path, { cookie, method = 'GET', body } = {}) {
  let r = await fetch(base + path, {
    method,
    headers: {
      'x-meridian-request': '1',
      'Content-Type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: r.status,
    json: await r.json(),
    cookie: r.headers.get('set-cookie')?.split(';')[0],
    headers: r.headers,
  };
}
test(
  'Live edition: 26 sourced India stories, no premium body in lists',
  { skip: !local },
  async () => {
    let e = await request('/edition');
    assert.equal(e.status, 200);
    assert.ok(e.json.articles.length >= 24);
    assert.equal(new Set(e.json.articles.map((a) => a.category.name)).size, 6);
    assert.ok(e.json.articles.filter((a) => a.access !== 'FREE').length >= 8);
    for (const a of e.json.articles) {
      assert.ok(!('content' in a));
      const age = Date.now() - Date.parse(a.sourceDate);
      assert.ok(age >= 0 && age < 28 * 86400000);
    }
    let pick = e.json.articles.find((a) => a.access !== 'FREE');
    let story = await request('/articles/' + pick.slug);
    assert.equal(story.json.locked, true);
    assert.ok(!('content' in story.json.article));
    assert.ok(story.json.article.sourceUrl.startsWith('https://'));
  },
);
test('Account, saved stories, verified access and expiration', { skip: !local }, async (t) => {
  let email = `reader-${crypto.randomUUID()}@qa.invalid`,
    user;
  const clean = [];
  t.after(async () => {
    for (const id of clean) {
      await db.payment.deleteMany({ where: { subscriptionId: id } });
      await db.subscription.deleteMany({ where: { id } });
    }
    if (user) await db.user.delete({ where: { id: user.id } });
  });
  const reg = await request('/auth/register', {
    method: 'POST',
    body: { name: 'Verification Reader', email, password: 'a-private-qa-password' },
  });
  assert.equal(reg.status, 201);
  assert.match(reg.headers.get('set-cookie'), /HttpOnly/);
  const cookie = reg.cookie;
  user = reg.json.user;
  assert.equal(user.roleId, 'READER');
  assert.equal((await request('/admin/users', { cookie })).status, 403);
  let e = (await request('/edition')).json;
  let free = e.articles.find((a) => a.access === 'FREE'),
    silver = e.articles.find((a) => a.access === 'SILVER'),
    gold = e.articles.find((a) => a.access === 'GOLD');
  assert.ok((await request('/articles/' + free.slug)).json.article.content);
  assert.equal(
    (await request('/bookmarks/' + free.id, { method: 'PUT', cookie, body: { saved: true } }))
      .status,
    200,
  );
  assert.ok((await request('/account', { cookie })).json.saved.some((a) => a.id === free.id));
  await request('/account', {
    method: 'PATCH',
    cookie,
    body: { name: 'Updated Reader', bio: 'A private test profile.' },
  });
  assert.equal((await request('/auth/me', { cookie })).json.user.name, 'Updated Reader');
  const plan = await db.plan.findUnique({ where: { level: 'SILVER' } });
  let sub = await db.subscription.create({
    data: {
      userId: user.id,
      planId: plan.id,
      cycle: 'monthly',
      status: 'ACTIVE',
      periodEnd: new Date(Date.now() + 86400000),
    },
  });
  clean.push(sub.id);
  assert.equal(
    (await request('/articles/' + silver.slug, { cookie })).json.locked,
    true,
    'No entitlement from an unpaid membership',
  );
  await db.payment.create({
    data: {
      subscriptionId: sub.id,
      gatewayId: 'unit-fixture-' + crypto.randomUUID(),
      amountPaise: plan.monthlyPaise,
      status: 'captured',
    },
  });
  assert.equal((await request('/articles/' + silver.slug, { cookie })).json.locked, false);
  assert.equal((await request('/articles/' + gold.slug, { cookie })).json.locked, true);
  await db.subscription.update({
    where: { id: sub.id },
    data: { periodEnd: new Date(Date.now() - 1000) },
  });
  assert.equal((await request('/articles/' + silver.slug, { cookie })).json.locked, true);
  await request('/auth/logout', { method: 'POST', cookie });
  assert.equal((await request('/account', { cookie })).status, 401);
});
test(
  'Independent submission, rejection, approval, publication and 28-day expiry',
  { skip: !local },
  async (t) => {
    const accounts = JSON.parse(await fs.readFile('data/local-accounts.json', 'utf8'));
    async function login(role) {
      const { email, password } = accounts.find((a) => a.role === role);
      const r = await request('/auth/login', { method: 'POST', body: { email, password } });
      assert.equal(r.status, 200);
      return r.cookie;
    }
    const author = await login('AUTHOR'),
      chief = await login('CHIEF_EDITOR'),
      section = await login('SECTION_EDITOR');
    let ids = [];
    t.after(async () => {
      await db.article.deleteMany({ where: { id: { in: ids.filter(Boolean) } } });
      for (const cookie of [author, chief, section])
        await request('/auth/logout', { method: 'POST', cookie });
    });
    let a = (await request('/edition')).json.articles.find((a) => a.category.name === 'Business');
    const input = {
      title: 'Editorial workflow verification — India edition',
      summary:
        'A disposable local fixture used to verify the independent editorial review process.',
      content:
        'This disposable fixture checks the approval workflow, source-date policy, and publishing permissions of the Indian edition. It is removed when the test finishes.',
      categoryId: a.category.id,
      access: 'FREE',
      image: '/images/hero-india.jpg',
      imageCredit: 'Local verification fixture',
      location: 'India',
      requiresApproval: true,
      sourceName: 'Workflow verification',
      sourceUrl: 'https://example.org/editorial-test',
      sourceDate: new Date().toISOString(),
      tagIds: [],
      indiaCoverage: true,
    };
    assert.equal(
      (
        await request('/admin/articles', {
          method: 'POST',
          cookie: author,
          body: { ...input, sourceDate: new Date(Date.now() - 29 * 86400000).toISOString() },
        })
      ).status,
      400,
    );
    const created = await request('/admin/articles', {
      method: 'POST',
      cookie: author,
      body: input,
    });
    assert.equal(created.status, 201);
    let aId = created.json.id;
    ids.push(aId);
    let url = '/admin/articles/' + aId;
    const wf = async (cookie, action, reason) => {
      const v = await request(url, { cookie });
      return request(url + '/workflow', {
        method: 'POST',
        cookie,
        body: { action, reason, expectedRevision: v.json.revision },
      });
    };
    assert.equal((await request('/articles/' + created.json.slug)).status, 404);
    assert.equal((await request(url, { cookie: section })).status, 404);
    assert.equal((await wf(chief, 'PUBLISH')).status, 409);
    assert.equal((await wf(author, 'SUBMIT')).status, 200);
    assert.equal((await wf(author, 'APPROVE')).status, 403);
    assert.equal((await wf(chief, 'REJECT')).status, 400);
    assert.equal((await wf(chief, 'REJECT', 'Clarify the source date.')).status, 200);
    assert.equal((await wf(author, 'SUBMIT')).status, 409);
    assert.equal(
      (
        await request(url, {
          method: 'PUT',
          cookie: author,
          body: {
            ...input,
            content: input.content + ' The original date is now verified.',
            expectedRevision: 1,
          },
        })
      ).status,
      200,
    );
    assert.equal((await wf(author, 'SUBMIT')).status, 200);
    assert.equal((await wf(chief, 'APPROVE')).status, 200);
    assert.equal((await wf(chief, 'PUBLISH')).status, 200);
    assert.equal((await request('/articles/' + created.json.slug)).status, 200);
    let record = await request(url, { cookie: chief });
    assert.ok(
      record.json.approvals.some((v) => v.reason === 'Clarify the source date.' && v.createdAt),
    );
    await db.publication.update({
      where: { id: aId },
      data: { sourceDate: new Date(Date.now() - 29 * 86400000) },
    });
    assert.equal((await request('/articles/' + created.json.slug)).status, 404);
    assert.ok(!(await request('/edition')).json.articles.some((s) => s.id === aId));
    assert.equal(
      (
        await request(url, {
          method: 'PUT',
          cookie: chief,
          body: { ...input, expectedRevision: 2 },
        })
      ).status,
      200,
    );
    await wf(chief, 'SUBMIT');
    assert.equal(
      (await wf(chief, 'APPROVE')).status,
      403,
      'Last editor must not approve their revision',
    );
    let mine = await request('/admin/articles', {
      method: 'POST',
      cookie: chief,
      body: { ...input, slug: 'independent-author-check-' + Date.now() },
    });
    assert.equal(mine.status, 201);
    ids.push(mine.json.id);
    url = '/admin/articles/' + mine.json.id;
    await wf(chief, 'SUBMIT');
    assert.equal(
      (await wf(chief, 'APPROVE')).status,
      403,
      'Chief cannot approve an authored story',
    );
  },
);
