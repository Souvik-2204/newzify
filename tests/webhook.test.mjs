import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { db } from '../server/db.mjs';
import { webhook } from '../server/routes/payments.mjs';
import { entitlement } from '../server/core.mjs';
// Synthetic, signed gateway events exercise the real database settlement path.
// This runs ONLY against the private local cluster when no Razorpay keys are set.
test(
  'Signed test events: correct amount, idempotency, stale-event ordering, pause and expiry',
  {
    skip:
      process.env.EMBEDDED_POSTGRES !== '1' ||
      !!process.env.RAZORPAY_KEY_ID ||
      process.env.NODE_ENV === 'production',
  },
  async (t) => {
    const id = crypto.randomUUID();
    const env = {
      RAZORPAY_KEY_ID: 'rzp_test_local_fixture',
      RAZORPAY_KEY_SECRET: id,
      RAZORPAY_WEBHOOK_SECRET: crypto.randomBytes(24).toString('hex'),
    };
    Object.assign(process.env, env);
    let user, sub;
    const plan = await db.plan.findUnique({ where: { level: 'BRONZE' } });
    const planId = 'plan_agreed_at_checkout_' + id,
      agreed = plan.monthlyPaise + 200;
    t.after(async () => {
      if (sub) {
        await db.payment.deleteMany({ where: { subscriptionId: sub.id } });
        await db.subscription.delete({ where: { id: sub.id } });
      }
      if (user) await db.user.delete({ where: { id: user.id } });
      await db.webhookEvent.deleteMany({ where: { id: { startsWith: id } } });
      for (const k of Object.keys(env)) delete process.env[k];
      await db.$disconnect();
    });
    user = await db.user.create({
      data: {
        email: `webhook-${id}@qa.invalid`,
        name: 'Disposable gateway fixture',
        roleId: 'READER',
        passwordHash: crypto.randomBytes(32).toString('hex'),
      },
    });
    sub = await db.subscription.create({
      data: {
        userId: user.id,
        planId: plan.id,
        cycle: 'monthly',
        agreedAmountPaise: agreed,
        agreedGatewayPlanId: planId,
        gatewayId: 'sub_fixture_' + id,
      },
    });
    const now = Math.floor(Date.now() / 1000);
    async function send(n, event, status, amount, time = now + n, valid = true, end = now + 86400) {
      const message = {
        event,
        created_at: time,
        payload: {
          subscription: {
            entity: { id: sub.gatewayId, plan_id: planId, status, current_end: end },
          },
          ...(amount === undefined
            ? {}
            : {
                payment: {
                  entity: { id: 'pay_fixture_' + id, amount, currency: 'INR', status: 'captured' },
                },
              }),
        },
      };
      const raw = Buffer.from(JSON.stringify(message));
      const sig = crypto
        .createHmac('sha256', valid ? env.RAZORPAY_WEBHOOK_SECRET : 'wrong-test-key')
        .update(raw)
        .digest('hex');
      let result;
      await webhook(
        { body: raw, get: (k) => (k === 'x-razorpay-signature' ? sig : id + '-' + n) },
        { json: (j) => (result = j) },
      );
      return result;
    }
    await assert.rejects(
      () => send(0, 'subscription.activated', 'active', undefined, now, false),
      (e) => e.status === 400,
    );
    await send(1, 'subscription.activated', 'active');
    assert.equal(await entitlement(user.id), 'FREE');
    await send(2, 'subscription.charged', 'active', plan.monthlyPaise);
    assert.equal(
      await entitlement(user.id),
      'FREE',
      'The current offer cannot replace the agreed amount',
    );
    await send(3, 'subscription.charged', 'active', agreed);
    assert.equal(await entitlement(user.id), 'BRONZE');
    assert.equal((await send(3, 'subscription.charged', 'active', agreed)).duplicate, true);
    assert.equal(await db.payment.count({ where: { subscriptionId: sub.id } }), 1);
    await send(21, 'subscription.updated', 'active', undefined, now + 3, true, now + 33 * 86400);
    await send(
      22,
      'subscription.charged',
      'active',
      plan.monthlyPaise,
      now + 3,
      true,
      now + 33 * 86400,
    );
    assert.equal(
      +(await db.subscription.findUnique({ where: { id: sub.id } })).periodEnd,
      (now + 86400) * 1000,
      'A state update or mismatched renewal cannot extend the paid-through period.',
    );
    await send(4, 'subscription.paused', 'paused', undefined, now - 10);
    assert.equal(await entitlement(user.id), 'BRONZE');
    await send(5, 'subscription.halted', 'halted');
    assert.equal(await entitlement(user.id), 'FREE');
  },
);
