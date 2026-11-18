import { validateImages } from '../media.mjs';
import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { db } from '../db.mjs';
import { failure, DAY, slugify, allow, safeUrl } from '../core.mjs';
import {
  scope,
  assigned,
  senior,
  canManage,
  transition,
  independent,
  readyForReview,
} from '../workflow.mjs';
import { release, liveWindow, publicCard, flatten } from '../publications.mjs';
import { imagePath, normalizeDocument, plainText } from '../document.mjs';
export const editorial = Router();
const r = editorial;
const level = z.enum(['FREE', 'BRONZE', 'SILVER', 'GOLD']);
const state = z.enum(['DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHED']);
const seniorOnly = allow('CHIEF_EDITOR', 'SUPER_ADMIN');
const liveFields = {
  select: { revision: true, slug: true, title: true, access: true, publishedAt: true },
};
const details = {
  tags: true,
  live: liveFields,
  creator: { select: { id: true, name: true } },
  submitter: { select: { id: true, name: true } },
  author: { select: { id: true, name: true } },
  approvals: {
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: { actor: { select: { id: true, name: true } } },
  },
};
export const settings = () => db.newsroomSettings.findUniqueOrThrow({ where: { id: 'edition' } });
const writeEvent = (tx, articleId, actorId, revision, action, reason) =>
  tx.approval.create({ data: { articleId, actorId, revision, action, reason } });
const notFound = () => failure(404, 'Story not found on your desk.');
const stale = () =>
  failure(409, 'This revision has changed. Reload the editorial file before continuing.');
async function file(req) {
  const a = await db.article.findFirst({
    where: { AND: [scope(req.user), { id: req.params.id }] },
    include: details,
  });
  if (!a) throw notFound();
  return a;
}
function abilities(a, u) {
  const mine = canManage(a, u),
    sen = senior(u),
    section = u.roleId === 'SECTION_EDITOR' && assigned(u).includes(a.categoryId);
  const edit =
    mine && (u.roleId !== 'AUTHOR' || ['DRAFT', 'REJECTED', 'PUBLISHED'].includes(a.status));
  const review =
    mine &&
    (sen || (section && !a.requiresApproval)) &&
    independent(a, u.id) &&
    a.status === 'IN_REVIEW';
  return {
    edit,
    submit: mine && a.status === 'DRAFT',
    approve: review,
    reject: review,
    publish: mine && (sen || (section && !a.requiresApproval)) && a.status === 'APPROVED',
    directPublish: review && !a.requiresApproval,
    delete: sen || (mine && !a.live && ['DRAFT', 'REJECTED'].includes(a.status)),
  };
}
r.get('/overview', async (req, res) => {
  const where = scope(req.user);
  const [counts, views, recent, categories, tags, authors, config, pending, liveCount] =
    await Promise.all([
      db.article.groupBy({ by: ['status'], where, _count: true }),
      db.article.aggregate({ where, _sum: { views: true } }),
      db.approval.findMany({
        where: { article: where },
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: {
          article: { select: { id: true, title: true } },
          actor: { select: { name: true } },
        },
      }),
      db.category.findMany({
        orderBy: { position: 'asc' },
        include: { _count: { select: { articles: { where: { deletedAt: null } } } } },
      }),
      db.tag.findMany({
        orderBy: { name: 'asc' },
        include: { _count: { select: { articles: { where: { deletedAt: null } } } } },
      }),
      db.user.findMany({
        where: req.user.roleId === 'AUTHOR' ? { id: req.user.id } : { roleId: { not: 'READER' } },
        select: { id: true, name: true, roleId: true },
        orderBy: { name: 'asc' },
      }),
      settings(),
      db.article.groupBy({
        by: ['requiresApproval'],
        where: { AND: [where, { status: 'IN_REVIEW' }] },
        _count: true,
      }),
      db.publication.count({ where: { ...liveWindow(), article: where } }),
    ]);
  res.json({
    counts: Object.fromEntries(counts.map((x) => [x.status, x._count])),
    liveCount,
    views: views._sum.views || 0,
    recent,
    categories,
    tags,
    authors,
    settings: config,
    queues: {
      mandatory: pending.find((x) => x.requiresApproval)?._count || 0,
      standard: pending.find((x) => !x.requiresApproval)?._count || 0,
    },
  });
});
const dateKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) => !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s,
    'Use a valid date.',
  );
r.get('/articles', async (req, res) => {
  const f = z
    .object({
      q: z.string().max(180).optional(),
      status: state.optional(),
      categoryId: z.string().max(100).optional(),
      authorId: z.string().max(100).optional(),
      from: dateKey.optional(),
      to: dateKey.optional(),
      dateField: z.enum(['updated', 'published', 'source']).default('updated'),
      reviewType: z.enum(['mandatory', 'standard']).optional(),
      page: z.coerce.number().int().min(1).max(10000).default(1),
    })
    .parse(req.query);
  if (f.from && f.to && f.from > f.to)
    throw failure(400, 'The start date must be before the end date.');
  const dates = {
    ...(f.from ? { gte: new Date(f.from + 'T00:00:00+05:30') } : {}),
    ...(f.to ? { lt: new Date(Date.parse(f.to + 'T00:00:00+05:30') + DAY) } : {}),
  };
  const where = {
    AND: [
      scope(req.user),
      {
        ...(f.q
          ? {
              OR: [
                { title: { contains: f.q, mode: 'insensitive' } },
                { slug: { contains: f.q, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(f.status ? { status: f.status } : {}),
        ...(f.categoryId ? { categoryId: f.categoryId } : {}),
        ...(f.authorId ? { authorId: f.authorId } : {}),
        ...(f.reviewType ? { requiresApproval: f.reviewType === 'mandatory' } : {}),
        ...(Object.keys(dates).length
          ? {
              [{ updated: 'updatedAt', published: 'publishedAt', source: 'sourceDate' }[
                f.dateField
              ]]: dates,
            }
          : {}),
      },
    ],
  };
  const [articles, total] = await Promise.all([
    db.article.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      skip: (f.page - 1) * 24,
      take: 24,
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        requiresApproval: true,
        image: true,
        access: true,
        authorId: true,
        categoryId: true,
        author: { select: { name: true } },
        category: { select: { name: true } },
        submitter: { select: { name: true } },
        submittedAt: true,
        updatedAt: true,
        publishedAt: true,
        sourceDate: true,
        revision: true,
        live: liveFields,
      },
    }),
    db.article.count({ where }),
  ]);
  res.json({ articles, total, page: f.page, pages: Math.ceil(total / 24) });
});
r.get('/articles/:id', async (req, res) => {
  const a = await file(req);
  res.json({ ...a, permissions: abilities(a, req.user) });
});
const writeInput = z
  .object({
    title: z.string().trim().min(2).max(220),
    slug: z
      .string()
      .trim()
      .max(140)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens.')
      .optional(),
    summary: z.string().trim().max(450).default(''),
    content: z.string().trim().max(100000).default(''),
    bodyDoc: z.unknown().optional(),
    categoryId: z.string().min(1).max(100),
    authorId: z.string().min(1).max(100).optional(),
    access: level.optional(),
    image: z
      .string()
      .regex(imagePath, 'Upload a JPEG, PNG or WebP image.')
      .default('/images/hero-india.jpg'),
    imageCredit: z.string().trim().max(250).default('The Meridian · Editorial image'),
    location: z.string().trim().max(100).default('India'),
    sourceName: z.string().trim().max(120).default(''),
    sourceUrl: z.union([safeUrl, z.literal('')]).default(''),
    sourceDate: z.coerce
      .date()
      .refine(
        (d) => +d <= Date.now() && +d >= Date.now() - 28 * DAY,
        'Use a source from the last 28 days.',
      )
      .nullable()
      .optional(),
    indiaCoverage: z.boolean().default(false),
    tagIds: z.array(z.string().max(100)).max(20).default([]),
    seoTitle: z.string().trim().max(100).default(''),
    metaDescription: z.string().trim().max(320).default(''),
    publicationDate: z.coerce
      .date()
      .refine((d) => +d <= Date.now(), 'Publication time cannot be in the future.')
      .nullable()
      .optional(),
    requiresApproval: z.boolean().optional(),
    expectedRevision: z.number().int().positive().optional(),
  })
  .strict();
async function prepare(req, a) {
  const b = writeInput.parse(req.body);
  if (a && b.expectedRevision !== a.revision) throw stale();
  if (req.user.roleId === 'SECTION_EDITOR' && !assigned(req.user).includes(b.categoryId))
    throw failure(403, 'Choose a section assigned to your account.');
  const authorId = b.authorId || a?.authorId || req.user.id;
  if (req.user.roleId === 'AUTHOR' && authorId !== (a?.authorId || req.user.id))
    throw failure(403, 'Journalists cannot reassign bylines.');
  if (
    !(await db.user.findFirst({
      where: { id: authorId, roleId: { not: 'READER' } },
      select: { id: true },
    }))
  )
    throw failure(400, 'Choose an editorial byline.');
  const config = await settings();
  const requiresApproval = b.requiresApproval ?? a?.requiresApproval ?? config.defaultApproval;
  if (a?.approvalLocked && !requiresApproval)
    throw failure(403, 'Mandatory review is locked after submission. It cannot be downgraded.');
  const slug = b.slug || a?.slug || slugify(b.title);
  if (!slug) throw failure(400, 'Choose a readable URL slug.');
  const occupied = await db.publication.findFirst({
    where: { slug, ...(a ? { id: { not: a.id } } : {}) },
    select: { id: true },
  });
  if (occupied) throw failure(409, 'Another published story has this URL. Choose another slug.');
  const doc = b.bodyDoc ? normalizeDocument(b.bodyDoc) : null;
  const inlineUploads = await validateImages(b.image, doc, req.user, req.app.locals.staticImages);
  const { tagIds, indiaCoverage, expectedRevision, ...rest } = b;
  return {
    data: {
      ...rest,
      bodyDoc: doc || Prisma.DbNull,
      inlineUploads,
      content: doc ? plainText(doc).trim() : b.content,
      sourceDate: b.sourceDate || null,
      publicationDate: b.publicationDate || null,
      slug,
      authorId,
      access: b.access || a?.access || config.defaultAccess,
      requiresApproval,
      indiaConfirmed: indiaCoverage,
      lastEditorId: req.user.id,
    },
    tagIds: [...new Set(tagIds)],
  };
}
r.post('/articles', async (req, res) => {
  const { data, tagIds } = await prepare(req);
  const a = await db.$transaction(async (tx) => {
    const a = await tx.article.create({
      data: { ...data, creatorId: req.user.id, tags: { connect: tagIds.map((id) => ({ id })) } },
    });
    await writeEvent(tx, a.id, req.user.id, 1, 'CREATED');
    return a;
  });
  res.status(201).json(a);
});
r.put('/articles/:id', async (req, res) => {
  const a = await file(req);
  if (!abilities(a, req.user).edit)
    throw failure(403, 'A submitted story is read-only for its author until returned.');
  const { data, tagIds } = await prepare(req, a);
  const saved = await db.$transaction(async (tx) => {
    const changed = await tx.article.updateMany({
      where: { id: a.id, revision: a.revision, status: a.status, deletedAt: null },
      data: {
        ...data,
        status: 'DRAFT',
        submittedById: null,
        submittedAt: null,
        revision: { increment: 1 },
      },
    });
    if (!changed.count) throw stale();
    const v = await tx.article.update({
      where: { id: a.id },
      data: { tags: { set: tagIds.map((id) => ({ id })) } },
    });
    await writeEvent(
      tx,
      a.id,
      req.user.id,
      v.revision,
      'DRAFT_SAVED',
      a.live ? 'Working revision saved; the published edition is unchanged.' : undefined,
    );
    return v;
  });
  res.json(saved);
});
r.delete('/articles/:id', async (req, res) => {
  const a = await file(req);
  if (!abilities(a, req.user).delete)
    throw failure(403, 'Only a senior editor can remove a story with a live edition.');
  if (req.body?.expectedRevision !== a.revision) throw stale();
  await db.$transaction(async (tx) => {
    const ok = await tx.article.updateMany({
      where: { id: a.id, revision: a.revision, status: a.status, deletedAt: null },
      data: {
        deletedAt: new Date(),
        featuredRank: 0,
        heroSlot: 0,
        editorPick: false,
        breaking: false,
      },
    });
    if (!ok.count) throw stale();
    await writeEvent(
      tx,
      a.id,
      req.user.id,
      a.revision,
      'DELETED',
      'Removed from the edition; editorial record retained.',
    );
  });
  res.json({ ok: true });
});
r.post('/articles/:id/workflow', async (req, res) => {
  const b = z
    .object({
      action: z.enum(['SUBMIT', 'APPROVE', 'REJECT', 'PUBLISH']),
      reason: z.string().trim().max(1500).optional(),
      expectedRevision: z.number().int().positive(),
      reviewed: z.boolean().optional(),
    })
    .strict()
    .parse(req.body);
  const a = await file(req);
  if (a.revision !== b.expectedRevision) throw stale();
  const next = transition(a, req.user, b.action, b.reason, b.reviewed);
  if (['SUBMIT', 'APPROVE', 'PUBLISH'].includes(b.action)) readyForReview(a);
  const at = a.publicationDate || new Date();
  await db.$transaction(async (tx) => {
    const changed = await tx.article.updateMany({
      where: { id: a.id, revision: a.revision, status: a.status, deletedAt: null },
      data: {
        status: next,
        ...(b.action === 'SUBMIT'
          ? {
              submittedById: req.user.id,
              submittedAt: new Date(),
              approvalLocked: a.requiresApproval || a.approvalLocked,
            }
          : {}),
        ...(next === 'PUBLISHED' ? { publishedAt: at } : {}),
      },
    });
    if (changed.count !== 1) throw stale();
    if (next === 'PUBLISHED') {
      if (a.status === 'IN_REVIEW')
        await writeEvent(
          tx,
          a.id,
          req.user.id,
          a.revision,
          'SECTION_REVIEWED',
          'Reviewed this revision and its source before direct publication.',
        );
      await release(tx, a, at);
    }
    await writeEvent(
      tx,
      a.id,
      req.user.id,
      a.revision,
      b.action === 'SUBMIT' ? 'SUBMITTED' : next,
      b.reason,
    );
  });
  res.json({ status: next, revision: a.revision });
});
r.get('/front-page', seniorOnly, async (req, res) => {
  const [records, cfg] = await Promise.all([
    db.publication.findMany({
      where: liveWindow(),
      select: publicCard,
      orderBy: { publishedAt: 'desc' },
    }),
    settings(),
  ]);
  res.json({ articles: records.map(flatten), version: cfg.layoutVersion });
});
r.put('/front-page', seniorOnly, async (req, res) => {
  const id = z.string().min(1).max(100);
  const b = z
    .object({
      hero: z.array(id.nullable()).length(3),
      top: z.array(id.nullable()).length(3),
      pick: id.nullable(),
      breaking: z.array(id).max(12),
      version: z.number().int().positive(),
    })
    .strict()
    .parse(req.body);
  for (const list of [b.hero, b.top, b.breaking]) {
    const values = list.filter(Boolean);
    if (new Set(values).size !== values.length)
      throw failure(400, 'Choose a different story for each position in the same section.');
  }
  const ids = [...new Set([...b.hero, ...b.top, b.pick, ...b.breaking].filter(Boolean))];
  await db.$transaction(async (tx) => {
    if (
      (await tx.publication.count({ where: { ...liveWindow(), id: { in: ids } } })) !== ids.length
    )
      throw failure(400, 'Only live stories from the current Indian edition can be featured.');
    const change = await tx.newsroomSettings.updateMany({
      where: { id: 'edition', layoutVersion: b.version },
      data: { layoutVersion: { increment: 1 } },
    });
    if (!change.count)
      throw failure(409, 'The front page was changed by another editor. Reload before saving.');
    await tx.article.updateMany({
      where: {
        OR: [
          { heroSlot: { gt: 0 } },
          { featuredRank: { gt: 0 } },
          { editorPick: true },
          { breaking: true },
        ],
      },
      data: { heroSlot: 0, featuredRank: 0, editorPick: false, breaking: false },
    });
    for (const [i, id] of b.hero.entries())
      if (id) await tx.article.update({ where: { id }, data: { heroSlot: i + 1 } });
    for (const [i, id] of b.top.entries())
      if (id) await tx.article.update({ where: { id }, data: { featuredRank: i + 1 } });
    if (b.pick) await tx.article.update({ where: { id: b.pick }, data: { editorPick: true } });
    await tx.article.updateMany({ where: { id: { in: b.breaking } }, data: { breaking: true } });
    await tx.adminEvent.create({
      data: {
        actorId: req.user.id,
        action: 'FRONT_PAGE_UPDATED',
        entity: 'edition',
        entityId: 'front-page',
        details: b,
      },
    });
  });
  res.json({ ok: true, version: b.version + 1 });
});
