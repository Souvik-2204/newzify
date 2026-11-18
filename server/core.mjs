import crypto from 'node:crypto';
import { z } from 'zod';
import { db } from './db.mjs';
export const DAY = 86400000;
export const ranks = { FREE: 0, BRONZE: 1, SILVER: 2, GOLD: 3 };
export const safeUser = {
  id: true,
  name: true,
  email: true,
  roleId: true,
  role: { select: { name: true } },
  sectionId: true,
  assignedSections: { select: { id: true, name: true } },
  bio: true,
  createdAt: true,
};
export const slugify = (s) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
export const failure = (status, message, code) =>
  Object.assign(new Error(message), { status, code });
export const requireUser = (req, res, next) =>
  req.user ? next() : next(failure(401, 'Sign in to continue.'));
export const isStaffRole = (roleId) =>
  ['SUPER_ADMIN', 'CHIEF_EDITOR', 'SECTION_EDITOR', 'AUTHOR'].includes(roleId);
export const staff = (req, res, next) =>
  isStaffRole(req.user?.roleId)
    ? next()
    : next(failure(req.user ? 403 : 401, 'A newsroom account is required.'));
export const allow =
  (...roles) =>
  (req, res, next) =>
    roles.includes(req.user?.roleId)
      ? next()
      : next(failure(403, 'Your role does not have permission for this action.'));
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');
// Embedded previews may block cookies. Only these CMS endpoints accept a
// short-lived, explicitly supplied desk token; cookie sessions use a separate hash namespace.
const deskSessionHash = (token) => hash(`desk-preview:${token}`);
function deskToken(req) {
  const path = req.originalUrl.split('?')[0];
  if (!/^\/api\/(?:admin(?:\/|$)|auth\/(?:me|logout)\/?$)/.test(path)) return;
  if (req.get('x-meridian-request') !== '1') return;
  const token = req.get('x-meridian-desk-session');
  if (/^[0-9a-f]{64}$/.test(token || '')) return token;
}
export async function identify(req, res, next) {
  const desk = deskToken(req);
  const token = desk || req.cookies.meridian_session;
  if (typeof token === 'string' && token.length === 64) {
    const session = await db.session.findUnique({
      where: { tokenHash: desk ? deskSessionHash(token) : hash(token) },
      include: { user: { select: safeUser } },
    });
    if (session && session.expiresAt > new Date() && (!desk || isStaffRole(session.user.roleId)))
      req.user = session.user;
  }
  next();
}
export async function newDeskSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await db.session.create({
    data: {
      tokenHash: deskSessionHash(token),
      userId,
      expiresAt: new Date(Date.now() + 60 * 60000),
    },
  });
  return token;
}
const cookieOptions = (req) => {
  const secure =
    process.env.NODE_ENV === 'production' || req.secure || req.get('x-forwarded-proto') === 'https';
  return {
    httpOnly: true,
    secure,
    sameSite: secure ? 'none' : 'lax',
    partitioned: secure,
    path: '/',
  };
};
export async function newSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await db.session.create({
    data: { tokenHash: hash(token), userId, expiresAt: new Date(Date.now() + 14 * DAY) },
  });
  res.cookie('meridian_session', token, { ...cookieOptions(req), maxAge: 14 * DAY });
}
export async function endSession(req, res) {
  const hashes = [];
  const desk = deskToken(req);
  if (desk) hashes.push(deskSessionHash(desk));
  if (typeof req.cookies.meridian_session === 'string')
    hashes.push(hash(req.cookies.meridian_session));
  if (hashes.length) await db.session.deleteMany({ where: { tokenHash: { in: hashes } } });
  res.clearCookie('meridian_session', cookieOptions(req));
}
export async function entitlement(userId) {
  if (!userId) return 'FREE';
  const active = await db.subscription.findMany({
    where: {
      userId,
      status: 'ACTIVE',
      periodEnd: { gt: new Date() },
      payments: { some: { status: 'captured' } },
    },
    select: { plan: { select: { level: true } } },
  });
  return active.reduce((v, s) => (ranks[s.plan.level] > ranks[v] ? s.plan.level : v), 'FREE');
}
export const canRead = (access, owned) => ranks[owned] >= ranks[access];
export const email = z.string().trim().email('Enter a valid email address.').max(254).toLowerCase();
export const cycle = z.enum(['monthly', 'annual']);
export const safeUrl = z
  .string()
  .url()
  .max(2048)
  .refine((s) => s.startsWith('https://'), 'Use a secure https source link.');
