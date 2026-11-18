import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.mjs';
import { allow, failure, email, safeUser } from '../core.mjs';
import bcrypt from 'bcryptjs';
import { settings } from './editorial.mjs';
export const governance = Router();
const r = governance;
const root = allow('SUPER_ADMIN');
r.get('/settings', root, async (req, res) => res.json(await settings()));
r.patch('/settings', root, async (req, res) => {
  const b = z
    .object({
      defaultApproval: z.boolean(),
      defaultAccess: z.enum(['FREE', 'BRONZE', 'SILVER', 'GOLD']),
      deskNote: z.string().trim().max(320),
    })
    .strict()
    .parse(req.body);
  const [cfg] = await db.$transaction([
    db.newsroomSettings.update({ where: { id: 'edition' }, data: b }),
    db.adminEvent.create({
      data: {
        actorId: req.user.id,
        entity: 'settings',
        entityId: 'edition',
        action: 'SETTINGS_UPDATED',
        details: b,
      },
    }),
  ]);
  res.json(cfg);
});
r.get('/plans', root, async (req, res) =>
  res.json(
    await db.plan.findMany({
      orderBy: { level: 'asc' },
      select: {
        id: true,
        name: true,
        level: true,
        monthlyPaise: true,
        annualPaise: true,
        features: true,
        available: true,
        version: true,
        _count: { select: { subscriptions: true } },
      },
    }),
  ),
);
r.patch('/plans/:id', root, async (req, res) => {
  const b = z
    .object({
      name: z.string().trim().min(2).max(40),
      monthlyPaise: z.number().int().min(100).max(10000000),
      annualPaise: z.number().int().min(100).max(120000000),
      features: z.array(z.string().trim().min(2).max(120)).min(1).max(10),
      available: z.boolean(),
      version: z.number().int().positive(),
    })
    .strict()
    .parse(req.body);
  const p = await db.plan.findUnique({ where: { id: req.params.id } });
  if (!p) throw failure(404, 'Membership plan not found.');
  const { version, ...changes } = b;
  await db.$transaction(async (tx) => {
    const ok = await tx.plan.updateMany({
      where: { id: p.id, version },
      data: {
        ...changes,
        version: { increment: 1 },
        ...(p.monthlyPaise !== b.monthlyPaise ? { gatewayMonthlyId: null } : {}),
        ...(p.annualPaise !== b.annualPaise ? { gatewayAnnualId: null } : {}),
      },
    });
    if (!ok.count) throw failure(409, 'This plan has changed. Reload its current settings.');
    await tx.adminEvent.create({
      data: {
        actorId: req.user.id,
        entity: 'plan',
        entityId: p.id,
        action: 'PLAN_UPDATED',
        details: {
          previous: {
            monthlyPaise: p.monthlyPaise,
            annualPaise: p.annualPaise,
            available: p.available,
          },
          current: changes,
        },
      },
    });
  });
  res.json({ ok: true });
});
r.get('/audit', root, async (req, res) =>
  res.json(
    await db.adminEvent.findMany({
      include: { actor: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
  ),
);
const permissions = z
  .object({
    roleId: z.enum(['READER', 'AUTHOR', 'SECTION_EDITOR', 'CHIEF_EDITOR', 'SUPER_ADMIN']),
    sectionIds: z.array(z.string().max(100)).max(40).default([]),
  })
  .strict();
async function validateAssignments(b) {
  const ids = b.roleId === 'SECTION_EDITOR' ? [...new Set(b.sectionIds)] : [];
  if (b.roleId === 'SECTION_EDITOR' && !ids.length)
    throw failure(400, 'Assign at least one editorial section.');
  if ((await db.category.count({ where: { id: { in: ids } } })) !== ids.length)
    throw failure(400, 'A selected section no longer exists.');
  return ids;
}
r.get('/users', root, async (req, res) => {
  const { q, page } = z
    .object({
      q: z.string().trim().max(254).default(''),
      page: z.coerce.number().int().min(1).max(100000).optional(),
    })
    .parse(req.query);
  const where = q
    ? {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      }
    : {};
  const users = await db.user.findMany({
    where,
    select: safeUser,
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    take: page ? 30 : 250,
    skip: page ? (page - 1) * 30 : 0,
  });
  if (!page) return res.json(users);
  const total = await db.user.count({ where });
  res.json({ users, total, page, pages: Math.ceil(total / 30) });
});
r.post('/users', root, async (req, res) => {
  const b = permissions
    .extend({
      name: z.string().trim().min(2).max(70),
      email,
      password: z
        .string()
        .min(12, 'Use at least 12 characters.')
        .max(72)
        .refine((s) => Buffer.byteLength(s, 'utf8') <= 72, 'Use no more than 72 password bytes.'),
    })
    .strict()
    .parse(req.body);
  const ids = await validateAssignments(b),
    passwordHash = await bcrypt.hash(b.password, 12);
  const user = await db.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        name: b.name,
        email: b.email,
        passwordHash,
        roleId: b.roleId,
        sectionId: ids[0] || null,
        assignedSections: { connect: ids.map((id) => ({ id })) },
      },
      select: safeUser,
    });
    await tx.adminEvent.create({
      data: {
        actorId: req.user.id,
        entity: 'user',
        entityId: u.id,
        action: 'USER_CREATED',
        details: { role: b.roleId, sections: ids },
      },
    });
    return u;
  });
  res.status(201).json(user);
});
r.patch('/users/:id', root, async (req, res) => {
  const b = permissions.parse(req.body);
  if (req.params.id === req.user.id) throw failure(400, 'You cannot change your own permissions.');
  const ids = await validateAssignments(b);
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: req.params.id },
      data: {
        roleId: b.roleId,
        sectionId: ids[0] || null,
        assignedSections: { set: ids.map((id) => ({ id })) },
      },
    });
    await tx.session.deleteMany({ where: { userId: req.params.id } });
    await tx.adminEvent.create({
      data: {
        actorId: req.user.id,
        entity: 'user',
        entityId: req.params.id,
        action: 'PERMISSIONS_UPDATED',
        details: { role: b.roleId, sections: ids },
      },
    });
  });
  res.json({ ok: true });
});
