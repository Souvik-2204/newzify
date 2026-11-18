import 'dotenv/config';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import bcrypt from 'bcryptjs';
import { db } from '../server/db.mjs';
import { newSession } from '../server/core.mjs';

const local =
  process.env.EMBEDDED_POSTGRES === '1' &&
  process.env.NODE_ENV !== 'production' &&
  ['127.0.0.1', 'localhost'].includes(
    new URL(process.env.DATABASE_URL || 'http://invalid').hostname,
  );
const origin = `http://127.0.0.1:${process.env.PORT || 5433}`;
const run = crypto.randomUUID();
const password = crypto.randomUUID();
const users = {},
  images = [],
  created = [];
let cats, tag;
async function raw(path, actor, method = 'GET', body) {
  const headers = { 'x-meridian-request': '1', ...(actor?.cookie ? { cookie: actor.cookie } : {}) };
  if (body && !(body instanceof FormData)) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(body);
  }
  return fetch(origin + path, { method, body, headers });
}
async function api(path, actor, method = 'GET', body, expected = 200) {
  const r = await raw('/api' + path, actor, method, body);
  const value = await r.json();
  assert.equal(r.status, expected, `${method} ${path}: ${value.error || r.status}`);
  return value;
}
const get = (a, id) => api('/admin/articles/' + id, a);
const put = (a, id, data, rev, status = 200) =>
  api('/admin/articles/' + id, a, 'PUT', { ...data, expectedRevision: rev }, status);
const act = (actor, id, action, rev, extra = {}, code = 200) =>
  api(
    `/admin/articles/${id}/workflow`,
    actor,
    'POST',
    { action, expectedRevision: rev, ...extra },
    code,
  );
const remove = (actor, id, rev, status = 200) =>
  api('/admin/articles/' + id, actor, 'DELETE', { expectedRevision: rev }, status);
function input(label, fields = {}) {
  return {
    title: `${label} — editorial verification`,
    slug: `qa-${label.toLowerCase().replaceAll(' ', '-')}-${run}`,
    summary: 'Local verification of the Indian editorial desk and its reporting workflow.',
    content:
      'This temporary reporting file is used only for local editorial workflow verification. It is removed after the assertions complete.',
    categoryId: cats.politics.id,
    access: 'FREE',
    image: '/images/hero-india.jpg',
    imageCredit: 'Local test fixture',
    sourceName: 'Editorial verification',
    sourceUrl: 'https://example.org/desk-verification',
    sourceDate: new Date().toISOString(),
    indiaCoverage: true,
    requiresApproval: true,
    ...fields,
  };
}
async function create(actor, b) {
  const a = await api('/admin/articles', actor, 'POST', b, 201);
  created.push(a.id);
  return a;
}
async function upload(actor) {
  const data = new FormData();
  data.set(
    'image',
    new Blob([await fs.readFile('client/public/images/hero-india.jpg')], { type: 'image/jpeg' }),
    'new-photo.jpg',
  );
  const { image } = await api('/admin/images', actor, 'POST', data, 201);
  images.push(image);
  return image;
}
function document(label, image) {
  return {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: label }] },
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'The editorial desk verified the source and date of this temporary India reporting file. ',
            marks: [{ type: 'bold' }],
          },
          {
            type: 'text',
            text: 'Read the source.',
            marks: [{ type: 'link', attrs: { href: 'https://example.org/report' } }],
          },
        ],
      },
      { type: 'image', attrs: { src: image, alt: 'An illustrative newsroom photograph' } },
    ],
  };
}
const layout = (r) => ({
  hero: [1, 2, 3].map((n) => r.articles.find((a) => a.heroSlot === n)?.id || null),
  top: [1, 2, 3].map((n) => r.articles.find((a) => a.featuredRank === n)?.id || null),
  pick: r.articles.find((a) => a.editorPick)?.id || null,
  breaking: r.articles.filter((a) => a.breaking).map((a) => a.id),
  version: r.version,
});

describe('Editorial workspace · PostgreSQL + Express', { skip: !local }, () => {
  before(async () => {
    cats = Object.fromEntries((await db.category.findMany()).map((c) => [c.slug, c]));
    tag = await db.tag.create({ data: { name: 'Desk verification ' + run.slice(0, 8) } });
    const hash = await bcrypt.hash(password, 10);
    // Separate identities with real server-issued sessions. Sign-in itself is exercised by the browser suite.
    for (const [name, role] of Object.entries({
      writer: 'AUTHOR',
      secondWriter: 'AUTHOR',
      chief: 'CHIEF_EDITOR',
      root: 'SUPER_ADMIN',
      desk: 'SECTION_EDITOR',
      reader: 'READER',
      member: 'READER',
      promoted: 'READER',
    })) {
      const u = await db.user.create({
        data: {
          name: 'Verification ' + name,
          email: `${name}-${run}@qa.invalid`,
          passwordHash: hash,
          roleId: role,
          ...(role === 'SECTION_EDITOR'
            ? {
                sectionId: cats.politics.id,
                assignedSections: {
                  connect: [{ id: cats.politics.id }, { id: cats.technology.id }],
                },
              }
            : {}),
        },
      });
      users[name] = u;
      await newSession(
        { secure: false, get: () => null },
        {
          cookie: (key, value) => {
            u.cookie = key + '=' + value;
          },
        },
        u.id,
      );
    }
  });
  after(async () => {
    const ids = Object.values(users).map((u) => u.id);
    await db.article.deleteMany({ where: { id: { in: created } } });
    await db.payment.deleteMany({ where: { subscription: { userId: { in: ids } } } });
    await db.subscription.deleteMany({ where: { userId: { in: ids } } });
    await db.adminEvent.deleteMany({ where: { actorId: { in: ids } } });
    if (tag) await db.tag.deleteMany({ where: { id: tag.id } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    for (const p of images) await fs.rm('data' + p, { force: true });
    await db.$disconnect();
  });
  it('Rejects self-approval based on creator or submitter, even when the byline and last editor differ', async () => {
    const { writer, secondWriter, chief, root, desk } = users;
    const b = input('Separate creator', { authorId: writer.id });
    const a = await create(chief, b);
    await put(writer, a.id, { ...b, summary: b.summary + ' Attributed to the reporting desk.' }, 1);
    await act(writer, a.id, 'SUBMIT', 2);
    await act(chief, a.id, 'APPROVE', 2, {}, 403); // creator only
    await api('/admin/articles/' + a.id, secondWriter, 'GET', undefined, 404);
    await put(writer, a.id, b, 2, 403);
    await act(desk, a.id, 'APPROVE', 2, {}, 403);
    await act(root, a.id, 'REJECT', 2, { reason: '   ' }, 400);
    await act(root, a.id, 'REJECT', 2, {
      reason: 'Please identify the original source more precisely.',
    });
    await put(writer, a.id, { ...b, sourceName: 'Local reporting desk verification' }, 2);
    await act(writer, a.id, 'SUBMIT', 3);
    await act(root, a.id, 'APPROVE', 3);
    assert.equal((await raw('/story/' + b.slug)).status, 404);
    const record = await get(root, a.id);
    assert.equal(record.creator.id, chief.id);
    assert.equal(record.submitter.id, writer.id);
    const returned = record.approvals.find((x) => x.action === 'REJECTED');
    assert.equal(returned.actor.id, root.id);
    assert.ok(returned.reason && Date.parse(returned.createdAt));
    const c = await create(writer, input('Separate submitter'));
    await act(chief, c.id, 'SUBMIT', 1);
    await act(chief, c.id, 'APPROVE', 1, {}, 403); // submitter only
    await act(root, c.id, 'APPROVE', 1);
    await act(chief, c.id, 'PUBLISH', 1);
    assert.equal((await api('/articles/' + c.slug)).locked, false);
  });
  it('Filters desk files by author, status, section and IST date; standard stories can publish after assigned section review', async () => {
    const { writer, desk, chief } = users;
    const b = input('Assigned section', {
      categoryId: cats.technology.id,
      requiresApproval: false,
      tagIds: [tag.id],
    });
    const a = await create(writer, b);
    await act(writer, a.id, 'SUBMIT', 1);
    const today = new Date(Date.now() + 19800000).toISOString().slice(0, 10);
    const f = new URLSearchParams({
      q: a.slug,
      authorId: writer.id,
      categoryId: cats.technology.id,
      status: 'IN_REVIEW',
      dateField: 'source',
      from: today,
      to: today,
      reviewType: 'standard',
    });
    assert.deepEqual(
      (await api('/admin/articles?' + f, desk)).articles.map((x) => x.id),
      [a.id],
    );
    for (const [key, value] of Object.entries({
      categoryId: cats.business.id,
      status: 'APPROVED',
      authorId: chief.id,
      reviewType: 'mandatory',
    })) {
      const p = new URLSearchParams(f);
      p.set(key, value);
      assert.equal((await api('/admin/articles?' + p, desk)).total, 0);
    }
    await act(desk, a.id, 'PUBLISH', 1, {}, 400);
    await act(desk, a.id, 'PUBLISH', 1, { reviewed: true });
    assert.deepEqual(
      (await get(desk, a.id)).approvals
        .filter((x) => x.actorId === desk.id)
        .map((x) => x.action)
        .sort(),
      ['PUBLISHED', 'SECTION_REVIEWED'],
    );
    assert.equal((await api('/articles/' + a.slug)).article.tags[0].name, tag.name);
    const other = await create(
      writer,
      input('Outside desk', { categoryId: cats.business.id, requiresApproval: false }),
    );
    await act(writer, other.id, 'SUBMIT', 1);
    await act(desk, other.id, 'PUBLISH', 1, { reviewed: true }, 404);
    await api(
      '/admin/articles',
      desk,
      'POST',
      input('Wrong desk', { categoryId: cats.business.id }),
      403,
    );
    await api('/admin/front-page', desk, 'GET', undefined, 403);
  });
  it('Keeps working slug, SEO, category, tier, copy and uploads off every reader surface until independent re-release', async () => {
    const { writer, secondWriter, chief, root, reader, member } = users;
    const cover = await upload(writer),
      photo = await upload(writer),
      changedPhoto = await upload(writer);
    assert.equal((await raw(cover)).status, 404);
    assert.equal((await raw(photo, secondWriter)).status, 404);
    assert.equal((await raw(photo, writer)).status, 200);
    const oldTitle = 'Released India desk ' + run.slice(0, 8),
      newTitle = 'Working India file ' + run.slice(0, 8);
    const b = input('Snapshot isolation', {
      title: oldTitle,
      access: 'GOLD',
      image: cover,
      bodyDoc: document('First released manuscript', photo),
      seoTitle: 'Released search title',
      metaDescription: 'Released description for the Indian edition.',
      tagIds: [tag.id],
    });
    const a = await create(writer, b);
    const previous = layout(await api('/admin/front-page', chief));
    await api(
      '/admin/front-page',
      chief,
      'PUT',
      { ...previous, hero: [a.id, ...previous.hero.slice(1)] },
      400,
    );
    await act(writer, a.id, 'SUBMIT', 1);
    await act(chief, a.id, 'APPROVE', 1);
    await act(chief, a.id, 'PUBLISH', 1);
    const selected = { ...previous, hero: [a.id, ...previous.hero.slice(1)], pick: a.id };
    await api('/admin/front-page', chief, 'PUT', selected);
    try {
      await api('/admin/front-page', chief, 'PUT', selected, 409);
      assert.equal((await api('/edition')).articles.find((x) => x.id === a.id).heroSlot, 1);
      const plan = await db.plan.findUnique({ where: { level: 'GOLD' } });
      await db.subscription.create({
        data: {
          userId: member.id,
          planId: plan.id,
          status: 'ACTIVE',
          cycle: 'monthly',
          periodEnd: new Date(Date.now() + 86400000),
          payments: {
            create: {
              gatewayId: 'local-cms-' + run,
              amountPaise: plan.monthlyPaise,
              status: 'captured',
            },
          },
        },
      });
      await api('/bookmarks/' + a.id, reader, 'PUT', { saved: true });
      const next = {
        ...b,
        slug: b.slug + '-revised',
        title: newTitle,
        summary: 'New and unreleased summary, awaiting fresh approval.',
        access: 'FREE',
        bodyDoc: document('New body, not released yet', changedPhoto),
        categoryId: cats.business.id,
        image: '/images/hero-india.jpg',
        seoTitle: 'New search headline',
        metaDescription: 'New approved description for the Indian edition.',
        tagIds: [],
      };
      await put(writer, a.id, { ...next, requiresApproval: false }, 1, 403);
      await put(writer, a.id, next, 1);
      await put(writer, a.id, next, 1, 409);
      await act(chief, a.id, 'APPROVE', 1, {}, 409);
      const publicUnchanged = async () => {
        const detail = await api('/articles/' + b.slug, reader);
        assert.ok(detail.locked);
        assert.equal(detail.article.title, oldTitle);
        assert.equal(detail.article.access, 'GOLD');
        assert.equal(detail.article.seoTitle, b.seoTitle);
        assert.equal(detail.article.category.id, cats.politics.id);
        assert.equal(detail.article.tags[0].name, tag.name);
        assert.ok(!('content' in detail.article) && !('bodyDoc' in detail.article));
        const paid = await api('/articles/' + b.slug, member);
        assert.equal(paid.locked, false);
        assert.match(paid.article.content, /First released manuscript/);
        assert.doesNotMatch(JSON.stringify(paid), /New body, not released yet/);
        await api('/articles/' + next.slug, null, 'GET', undefined, 404);
        const home = (await api('/edition')).articles.find((s) => s.id === a.id);
        assert.equal(home.title, oldTitle);
        assert.equal(home.slug, b.slug);
        assert.equal(home.heroSlot, 1);
        assert.ok(!('bodyDoc' in home));
        assert.equal((await api('/articles?q=' + encodeURIComponent(newTitle))).total, 0);
        assert.equal(
          (await api('/articles?q=' + encodeURIComponent(oldTitle))).articles[0].id,
          a.id,
        );
        const relation = await api('/articles/rural-jobs-accountability');
        assert.ok(relation.related.some((x) => x.id === a.id && x.title === oldTitle));
        assert.equal(
          (await api('/account', reader)).saved.find((s) => s.id === a.id).access,
          'GOLD',
        );
        const html = await (await raw('/story/' + b.slug)).text();
        assert.match(html, /<title>Released search title/);
        assert.ok(html.includes(b.metaDescription));
        assert.ok(
          !html.includes(next.metaDescription) && !html.includes('First released manuscript'),
        );
        const noPage = await raw('/story/' + next.slug);
        assert.equal(noPage.status, 404);
        assert.match(await noPage.text(), /noindex/);
        assert.equal((await raw(cover)).status, 200);
        assert.equal((await raw(photo)).status, 404);
        assert.equal((await raw(photo, member)).status, 200);
        assert.equal((await raw(changedPhoto, member)).status, 404);
      };
      await publicUnchanged();
      await act(writer, a.id, 'SUBMIT', 2);
      await act(chief, a.id, 'PUBLISH', 2, { reviewed: true }, 409);
      await act(chief, a.id, 'APPROVE', 2);
      await publicUnchanged();
      await act(root, a.id, 'PUBLISH', 2);
      await api('/articles/' + b.slug, null, 'GET', undefined, 404);
      const live = await api('/articles/' + next.slug);
      assert.equal(live.locked, false);
      assert.equal(live.article.revision, 2);
      assert.equal(live.article.category.id, cats.business.id);
      assert.equal(live.article.tags.length, 0);
      assert.match(live.article.content, /New body, not released yet/);
      assert.equal(live.article.bodyDoc.content[0].type, 'heading');
      assert.equal(live.article.seoTitle, next.seoTitle);
      assert.equal((await api('/account', reader)).saved[0].slug, next.slug);
      assert.equal((await raw(changedPhoto)).status, 200);
      assert.equal((await raw(photo, member)).status, 404);
      assert.match(await (await raw('/story/' + next.slug)).text(), /<title>New search headline/);
      await remove(writer, a.id, 2, 403);
      await remove(chief, a.id, 2);
      await api('/articles/' + next.slug, null, 'GET', undefined, 404);
      assert.ok(!(await api('/account', reader)).saved.some((x) => x.id === a.id));
      assert.equal((await raw(changedPhoto)).status, 404);
      assert.ok(
        await db.approval.findFirst({
          where: { articleId: a.id, action: 'DELETED', actorId: chief.id },
        }),
      );
    } finally {
      await api('/admin/front-page', chief, 'PUT', { ...previous, version: previous.version + 1 });
    }
  });
  it('Restricts global controls, revokes changed roles, supports multiple sections and records governance actions', async () => {
    const { chief, root, reader, promoted } = users;
    for (const path of ['users', 'settings', 'plans', 'audit', 'subscriptions'])
      await api('/admin/' + path, chief, 'GET', undefined, 403);
    await api('/admin/overview', null, 'GET', undefined, 401);
    await api('/admin/overview', reader, 'GET', undefined, 403);
    await api('/auth/staff-login', null, 'POST', { email: promoted.email, password }, 403);
    const newAccount = {
      name: 'Verification correspondent',
      email: 'new-' + run + '@qa.invalid',
      password,
      roleId: 'AUTHOR',
    };
    await api('/admin/users', chief, 'POST', newAccount, 403);
    const onboarded = await api('/admin/users', root, 'POST', newAccount, 201);
    users.onboarded = onboarded;
    assert.equal(onboarded.roleId, 'AUTHOR');
    assert.ok(!('passwordHash' in onboarded));
    assert.equal(
      (await api('/admin/users?' + new URLSearchParams({ q: newAccount.email, page: 1 }), root))
        .users[0].id,
      onboarded.id,
    );
    await api(
      '/admin/users/' + promoted.id,
      root,
      'PATCH',
      { roleId: 'SECTION_EDITOR', sectionIds: [] },
      400,
    );
    await api('/admin/users/' + promoted.id, root, 'PATCH', {
      roleId: 'SECTION_EDITOR',
      sectionIds: [cats.business.id, cats.sports.id],
    });
    await api('/account', promoted, 'GET', undefined, 401);
    const login = await api('/auth/staff-login', null, 'POST', { email: promoted.email, password });
    assert.equal(login.user.roleId, 'SECTION_EDITOR');
    assert.equal(login.user.assignedSections.length, 2);
    await api(
      '/admin/categories',
      chief,
      'POST',
      { name: 'QA Desk', description: 'A temporary section used in the test.' },
      403,
    );
    const cat = await api(
      '/admin/categories',
      root,
      'POST',
      { name: 'Desk ' + run.slice(0, 8), description: 'A temporary section used in the test.' },
      201,
    );
    try {
      await api('/admin/categories/' + cat.id, root, 'PATCH', {
        name: cat.name,
        description: 'Updated local section description.',
      });
    } finally {
      await api('/admin/categories/' + cat.id, root, 'DELETE');
    }
    const original = await api('/admin/settings', root);
    const defaults = ({ defaultApproval, defaultAccess, deskNote }) => ({
      defaultApproval,
      defaultAccess,
      deskNote,
    });
    try {
      await api('/admin/settings', root, 'PATCH', {
        defaultApproval: false,
        defaultAccess: 'BRONZE',
        deskNote: 'Test desk notice',
      });
      const draft = await create(users.writer, {
        title: 'Draft defaults ' + run,
        categoryId: cats.politics.id,
      });
      assert.equal(draft.status, 'DRAFT');
      assert.equal(draft.access, 'BRONZE');
      assert.equal(draft.requiresApproval, false);
      await remove(users.writer, draft.id, 1);
      await api('/admin/articles/' + draft.id, root, 'GET', undefined, 404);
    } finally {
      await api('/admin/settings', root, 'PATCH', defaults(original));
    }
    const audit = await api('/admin/audit', root);
    assert.ok(
      audit.some(
        (e) =>
          e.entityId === promoted.id &&
          e.action === 'PERMISSIONS_UPDATED' &&
          e.actor.name === root.name &&
          Date.parse(e.createdAt),
      ),
    );
  });
  it('Versions public subscription offers without changing the amount agreed by existing members', async () => {
    const { root, member } = users;
    const p = (await api('/admin/plans', root)).find((p) => p.level === 'GOLD');
    const terms = {
      name: p.name,
      monthlyPaise: p.monthlyPaise,
      annualPaise: p.annualPaise,
      features: p.features,
      available: p.available,
    };
    const s = await db.subscription.create({
      data: {
        userId: member.id,
        planId: p.id,
        cycle: 'annual',
        agreedAmountPaise: p.annualPaise,
        agreedGatewayPlanId: 'local-terms-' + run,
      },
    });
    const original = await db.plan.findUnique({ where: { id: p.id } });
    try {
      await api('/admin/plans/' + p.id, root, 'PATCH', {
        ...terms,
        available: false,
        annualPaise: p.annualPaise + 10000,
        version: p.version,
      });
      assert.ok(!(await api('/plans')).plans.some((x) => x.id === p.id));
      await api(
        '/subscriptions',
        users.reader,
        'POST',
        { planId: p.id, cycle: 'monthly', expectedVersion: p.version },
        404,
      );
      await api('/admin/plans/' + p.id, root, 'PATCH', { ...terms, version: p.version }, 409);
      const contract = await db.subscription.findUnique({ where: { id: s.id } });
      assert.equal(contract.agreedAmountPaise, p.annualPaise);
      assert.equal((await db.plan.findUnique({ where: { id: p.id } })).gatewayAnnualId, null);
    } finally {
      await api('/admin/plans/' + p.id, root, 'PATCH', { ...terms, version: p.version + 1 });
      await db.plan.update({
        where: { id: p.id },
        data: {
          gatewayMonthlyId: original.gatewayMonthlyId,
          gatewayAnnualId: original.gatewayAnnualId,
        },
      });
    }
  });
});
