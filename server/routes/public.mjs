import { liveWindow, publicCard, flatten } from '../publications.mjs';
import { ranks } from '../core.mjs';
import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { rateLimit } from 'express-rate-limit';
import { db } from '../db.mjs';
import {
  safeUser,
  isStaffRole,
  email,
  cycle,
  failure,
  requireUser,
  newSession,
  newDeskSession,
  endSession,
  entitlement,
  canRead,
} from '../core.mjs';
export const publicRoutes = Router();
const r = publicRoutes;
r.get('/health', async (req, res) => {
  await db.$queryRaw`SELECT 1`;
  res.json({ status: 'ready', edition: 'IN', windowDays: 28 });
});
const authLimit = rateLimit({
  windowMs: 15 * 60000,
  limit: 35,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in 15 minutes.' },
});
r.get('/edition', async (req, res) => {
  const [categories, articles] = await Promise.all([
    db.category.findMany({ orderBy: { position: 'asc' } }),
    db.publication.findMany({
      where: liveWindow(),
      select: publicCard,
      orderBy: { sourceDate: 'desc' },
      take: 120,
    }),
  ]);
  res.json({
    categories,
    articles: articles.map(flatten),
    editionDate: new Date().toISOString(),
    windowDays: 28,
  });
});
r.get('/articles', async (req, res) => {
  const { q, category, access, sort, page } = z
    .object({
      q: z.string().max(180).default(''),
      category: z.string().max(80).optional(),
      access: z.enum(['free', 'premium']).optional(),
      sort: z.enum(['latest', 'trending', 'oldest']).default('latest'),
      page: z.coerce.number().int().min(1).max(5000).default(1),
    })
    .parse(req.query);
  const where = {
    ...liveWindow(),
    ...(category ? { category: { slug: category } } : {}),
    ...(access ? { access: access === 'free' ? 'FREE' : { not: 'FREE' } } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { summary: { contains: q, mode: 'insensitive' } },
            { tags: { some: { name: { contains: q, mode: 'insensitive' } } } },
          ],
        }
      : {}),
  };
  const [articles, total] = await Promise.all([
    db.publication.findMany({
      where,
      select: publicCard,
      orderBy:
        sort === 'trending'
          ? [{ article: { views: 'desc' } }, { sourceDate: 'desc' }]
          : { sourceDate: sort === 'oldest' ? 'asc' : 'desc' },
      take: 12,
      skip: (page - 1) * 12,
    }),
    db.publication.count({ where }),
  ]);
  res.json({ articles: articles.map(flatten), total, page, pages: Math.ceil(total / 12) });
});
r.get('/articles/:slug', async (req, res) => {
  const level = await entitlement(req.user?.id);
  const where = { ...liveWindow(), slug: req.params.slug };
  const metadata = {
    ...publicCard,
    imageCredit: true,
    sourceName: true,
    sourceUrl: true,
    seoTitle: true,
    metaDescription: true,
    tags: { select: { name: true } },
    author: { select: { id: true, name: true, bio: true } },
  };
  // Tier and revision are selected together: a concurrent release cannot mix a free header with a premium body.
  let row = await db.publication.findFirst({
    where: { ...where, access: { in: Object.keys(ranks).filter((x) => canRead(x, level)) } },
    select: { ...metadata, content: true, bodyDoc: true },
  });
  const locked = !row;
  if (!row) row = await db.publication.findFirst({ where, select: metadata });
  if (!row) throw failure(404, 'This story is not in the current Indian edition.');
  const article = flatten(row);
  // A read is not an editorial edit; leave the manuscript's updatedAt unchanged.
  await db.$executeRaw`UPDATE "Article" SET views = views + 1 WHERE id = ${article.id}`;
  const related = await db.publication.findMany({
    where: { ...liveWindow(), categoryId: article.category.id, id: { not: article.id } },
    select: publicCard,
    take: 3,
    orderBy: { sourceDate: 'desc' },
  });
  res.json({ article, locked, related: related.map(flatten) });
});
r.post('/auth/register', authLimit, async (req, res) => {
  const data = z
    .object({
      name: z.string().trim().min(2).max(70),
      email,
      password: z
        .string()
        .min(10, 'Use at least 10 characters for your password.')
        .max(72)
        .refine(
          (s) => Buffer.byteLength(s, 'utf8') <= 72,
          'Use a password no longer than 72 bytes.',
        ),
    })
    .strict()
    .parse(req.body);
  const user = await db.user.create({
    data: {
      name: data.name,
      email: data.email,
      passwordHash: await bcrypt.hash(data.password, 12),
      roleId: 'READER',
    },
    select: safeUser,
  });
  await newSession(req, res, user.id);
  res.status(201).json({ user });
});
const dummy = await bcrypt.hash('not-a-real-reader-password', 12);
r.post(['/auth/login', '/auth/staff-login'], authLimit, async (req, res) => {
  const b = z.object({ email, password: z.string().min(1).max(72) }).parse(req.body);
  const record = await db.user.findUnique({
    where: { email: b.email },
    select: { ...safeUser, passwordHash: true },
  });
  const ok = await bcrypt.compare(b.password, record?.passwordHash || dummy);
  if (!record || !ok) throw failure(401, 'The email or password is incorrect. Please try again.');
  if (req.path.endsWith('staff-login') && !isStaffRole(record.roleId))
    throw failure(
      403,
      'This account does not have newsroom access. A Super Admin must assign a staff role.',
    );
  const { passwordHash, ...user } = record;
  if (req.path === '/auth/staff-login' && req.get('x-meridian-session-mode') === 'desk-preview') {
    // Do not return an ordinary cookie credential to JavaScript.
    return res.json({ user, deskSession: await newDeskSession(user.id) });
  }
  await newSession(req, res, user.id);
  res.json({ user });
});
r.get('/auth/me', async (req, res) =>
  res.json({
    user: req.user || null,
    level: await entitlement(req.user?.id),
    saved: req.user
      ? (
          await db.bookmark.findMany({
            where: { userId: req.user.id },
            select: { articleId: true },
          })
        ).map((b) => b.articleId)
      : [],
  }),
);
r.post('/auth/logout', async (req, res) => {
  await endSession(req, res);
  res.json({ ok: true });
});
r.get('/account', requireUser, async (req, res) => {
  const [subscriptions, saved, level] = await Promise.all([
    db.subscription.findMany({
      where: { userId: req.user.id },
      include: { plan: true, payments: { orderBy: { createdAt: 'desc' } } },
      orderBy: { createdAt: 'desc' },
    }),
    db.bookmark.findMany({
      where: { userId: req.user.id, article: { live: { is: liveWindow() } } },
      include: { article: { select: { live: { select: publicCard } } } },
      orderBy: { createdAt: 'desc' },
    }),
    entitlement(req.user.id),
  ]);
  res.json({
    user: req.user,
    subscriptions,
    saved: saved.map((x) => flatten(x.article.live)),
    level,
  });
});
r.patch('/account', requireUser, async (req, res) => {
  const data = z
    .object({ name: z.string().trim().min(2).max(70), bio: z.string().trim().max(300).optional() })
    .strict()
    .parse(req.body);
  res.json(await db.user.update({ where: { id: req.user.id }, data, select: safeUser }));
});
r.put('/bookmarks/:id', requireUser, async (req, res) => {
  const { saved } = z.object({ saved: z.boolean() }).parse(req.body);
  const article = await db.publication.findFirst({
    where: { ...liveWindow(), id: req.params.id },
    select: { id: true },
  });
  if (!article) throw failure(404, 'Story not found.');
  const key = { userId: req.user.id, articleId: article.id };
  if (saved)
    await db.bookmark.upsert({ where: { userId_articleId: key }, create: key, update: {} });
  else await db.bookmark.deleteMany({ where: key });
  res.json({ saved });
});
r.post('/newsletter', authLimit, async (req, res) => {
  const b = z.object({ email }).parse(req.body);
  await db.newsletter.upsert({ where: b, create: b, update: {} });
  res.json({ ok: true });
});
r.post('/plan-interest', authLimit, async (req, res) => {
  const b = z.object({ email, level: z.enum(['BRONZE', 'SILVER', 'GOLD']), cycle }).parse(req.body);
  await db.planInterest.upsert({ where: { email_level_cycle: b }, create: b, update: {} });
  res.json({ ok: true });
});
