import { Router } from 'express';
import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import { z } from 'zod';
import { db } from '../db.mjs';
import { failure, requireUser, cycle } from '../core.mjs';
export const gatewayReady = () =>
  !!(
    process.env.RAZORPAY_KEY_ID?.startsWith('rzp_test_') &&
    process.env.RAZORPAY_KEY_SECRET &&
    process.env.RAZORPAY_WEBHOOK_SECRET
  );
const gateway = () => {
  if (!gatewayReady())
    throw failure(503, 'Razorpay test checkout is not configured yet.', 'CHECKOUT_UNAVAILABLE');
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
};
export function checkSignature(payload, signature, secret) {
  if (!secret || typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
export const paymentRoutes = Router();
const r = paymentRoutes;
r.get('/plans', async (req, res) =>
  res.json({
    plans: await db.plan.findMany({
      where: { available: true },
      orderBy: { level: 'asc' },
      select: {
        id: true,
        name: true,
        level: true,
        monthlyPaise: true,
        annualPaise: true,
        features: true,
        version: true,
      },
    }),
    checkoutReady: gatewayReady(),
  }),
);
r.post('/subscriptions', requireUser, async (req, res) => {
  const {
    planId,
    cycle: billing,
    expectedVersion,
  } = z
    .object({
      planId: z.string().max(60),
      cycle,
      expectedVersion: z.number().int().positive().optional(),
    })
    .parse(req.body);
  const plan = await db.plan.findUnique({ where: { id: planId } });
  if (!plan?.available) throw failure(404, 'This plan is not available for new subscriptions.');
  if (expectedVersion !== undefined && plan.version !== expectedVersion)
    throw failure(409, 'Membership terms changed. Refresh the pricing page before continuing.');
  const rp = gateway();
  const amount = billing === 'annual' ? plan.annualPaise : plan.monthlyPaise;
  if (
    await db.subscription.findFirst({
      where: { userId: req.user.id, status: 'ACTIVE', periodEnd: { gt: new Date() } },
    })
  )
    throw failure(409, 'You already have an active plan. Manage it from your account.');
  const pending = await db.subscription.findFirst({
    where: {
      userId: req.user.id,
      planId,
      cycle: billing,
      agreedAmountPaise: amount,
      status: 'PENDING',
      gatewayId: { not: null },
      createdAt: { gt: new Date(Date.now() - 25 * 60000) },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (pending)
    return res.json({ subscriptionId: pending.gatewayId, key: process.env.RAZORPAY_KEY_ID });
  const key = billing === 'annual' ? 'gatewayAnnualId' : 'gatewayMonthlyId';
  let pid = plan[key];
  if (!pid) {
    const p = await rp.plans.create({
      period: billing === 'annual' ? 'yearly' : 'monthly',
      interval: 1,
      item: {
        name: `The Meridian ${plan.name} · ${billing}`,
        amount: billing === 'annual' ? plan.annualPaise : plan.monthlyPaise,
        currency: 'INR',
      },
    });
    pid = p.id;
    const result = await db.plan.updateMany({
      where: { id: planId, version: plan.version, available: true },
      data: { [key]: pid },
    });
    if (!result.count) throw failure(409, 'Membership terms changed. Refresh the pricing page.');
  }
  const sub = await rp.subscriptions.create({
    plan_id: pid,
    total_count: billing === 'annual' ? 5 : 60,
    quantity: 1,
    customer_notify: 1,
    expire_by: Math.floor(Date.now() / 1000) + 1800,
    notes: { userId: req.user.id, planId },
  });
  await db.subscription.create({
    data: {
      userId: req.user.id,
      planId,
      cycle: billing,
      gatewayId: sub.id,
      agreedAmountPaise: amount,
      agreedGatewayPlanId: pid,
    },
  });
  res.status(201).json({ subscriptionId: sub.id, key: process.env.RAZORPAY_KEY_ID });
});
const gatewayStatus = (s) =>
  ({
    active: 'ACTIVE',
    authenticated: 'PENDING',
    created: 'PENDING',
    cancelled: 'CANCELLED',
    completed: 'EXPIRED',
    expired: 'EXPIRED',
    halted: 'HALTED',
    paused: 'HALTED',
    pending: 'HALTED',
  })[s] || 'PENDING';
function capturedAmount(sub, p) {
  return (
    p?.status === 'captured' &&
    p.currency === 'INR' &&
    Number(p.amount) ===
      (sub.agreedAmountPaise ??
        (sub.cycle === 'annual' ? sub.plan.annualPaise : sub.plan.monthlyPaise))
  );
}
// periodEnd is paid-through, not a membership promise. State-only gateway events never extend it.
async function recordCharge(tx, sub, p, end, allowExisting = false) {
  const saved = await tx.payment.createMany({
    data: [
      {
        gatewayId: p.id,
        subscriptionId: sub.id,
        amountPaise: Number(p.amount),
        status: 'captured',
      },
    ],
    skipDuplicates: true,
  });
  if (end && (saved.count || allowExisting)) {
    const until = new Date(end * 1000);
    await tx.subscription.updateMany({
      where: { id: sub.id, OR: [{ periodEnd: null }, { periodEnd: { lt: until } }] },
      data: { periodEnd: until },
    });
  }
}
r.post('/subscriptions/verify', requireUser, async (req, res) => {
  const b = z
    .object({
      razorpay_payment_id: z.string().max(100),
      razorpay_subscription_id: z.string().max(100),
      razorpay_signature: z.string().length(64),
    })
    .parse(req.body);
  const sub = await db.subscription.findFirst({
    where: { userId: req.user.id, gatewayId: b.razorpay_subscription_id },
    include: { plan: true },
  });
  if (!sub) throw failure(404, 'Subscription not found.');
  if (
    !checkSignature(
      `${b.razorpay_payment_id}|${sub.gatewayId}`,
      b.razorpay_signature,
      process.env.RAZORPAY_KEY_SECRET,
    )
  )
    throw failure(400, 'Payment verification failed.');
  const rp = gateway();
  const [p, s] = await Promise.all([
    rp.payments.fetch(b.razorpay_payment_id),
    rp.subscriptions.fetch(sub.gatewayId),
  ]);
  const expectedPlan =
    sub.agreedGatewayPlanId ||
    (sub.cycle === 'annual' ? sub.plan.gatewayAnnualId : sub.plan.gatewayMonthlyId);
  if (s.plan_id !== expectedPlan) throw failure(400, 'Subscription plan mismatch.');
  const paid = capturedAmount(sub, p);
  // A replayed callback for an old payment must not settle a later renewal. Signed
  // charged webhooks settle asynchronous captures whose cycle is not yet available.
  const inCycle =
    Number(s.current_start) > 0 &&
    Number(s.current_end) > 0 &&
    Number(p.created_at) >= Number(s.current_start) - 300 &&
    Number(p.created_at) < Number(s.current_end);
  const verified = await db.$transaction(async (tx) => {
    if (paid) await recordCharge(tx, sub, p, inCycle ? Number(s.current_end) : null);
    return tx.subscription.update({
      where: { id: sub.id },
      data: { status: gatewayStatus(s.status) },
      select: { periodEnd: true, status: true },
    });
  });
  res.json({
    ok: true,
    active: !!(paid && verified.status === 'ACTIVE' && verified.periodEnd > new Date()),
  });
});
export async function cancelRenewal(id, userId) {
  const s = await db.subscription.findFirst({
    where: { id, ...(userId ? { userId } : {}), status: 'ACTIVE' },
  });
  if (!s) throw failure(404, 'Active subscription not found.');
  if (!s.cancelAtEnd) {
    await gateway().subscriptions.cancel(s.gatewayId, true);
    await db.subscription.update({ where: { id }, data: { cancelAtEnd: true } });
  }
  return {
    ok: true,
    message: 'Automatic renewal is off. Access continues until the end of your paid period.',
  };
}
r.post('/subscriptions/:id/cancel', requireUser, async (req, res) =>
  res.json(await cancelRenewal(req.params.id, req.user.id)),
);
export async function webhook(req, res) {
  if (!gatewayReady()) throw failure(503, 'Test gateway not configured.');
  if (
    !Buffer.isBuffer(req.body) ||
    !checkSignature(req.body, req.get('x-razorpay-signature'), process.env.RAZORPAY_WEBHOOK_SECRET)
  )
    throw failure(400, 'Invalid webhook signature.');
  const event = JSON.parse(req.body.toString('utf8'));
  const id =
    req.get('x-razorpay-event-id') || crypto.createHash('sha256').update(req.body).digest('hex');
  if (await db.webhookEvent.findUnique({ where: { id } }))
    return res.json({ ok: true, duplicate: true });
  const s = event.payload?.subscription?.entity,
    p = event.payload?.payment?.entity;
  if (!s?.id) return res.json({ ok: true, ignored: true });
  const sub = await db.subscription.findUnique({
    where: { gatewayId: s.id },
    include: { plan: true },
  });
  if (!sub) throw failure(404, 'Unknown subscription.');
  const expectedPlan =
    sub.agreedGatewayPlanId ||
    (sub.cycle === 'annual' ? sub.plan.gatewayAnnualId : sub.plan.gatewayMonthlyId);
  if (s.plan_id !== expectedPlan) throw failure(400, 'Invalid plan.');
  const created = new Date((event.created_at || 0) * 1000);
  try {
    await db.$transaction(async (tx) => {
      await tx.webhookEvent.create({ data: { id, event: String(event.event) } });
      if (event.event === 'subscription.charged' && capturedAmount(sub, p))
        await recordCharge(tx, sub, p, Number(s.current_end) || null, true);
      await tx.subscription.updateMany({
        where: { id: sub.id, OR: [{ lastEventAt: null }, { lastEventAt: { lte: created } }] },
        data: {
          status: gatewayStatus(s.status),
          lastEventAt: created,
        },
      });
    });
  } catch (e) {
    if (e.code !== 'P2002') throw e;
  }
  res.json({ ok: true });
}
