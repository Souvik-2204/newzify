import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { canRead } from '../server/core.mjs';
import { transition } from '../server/workflow.mjs';
import { checkSignature } from '../server/routes/payments.mjs';
test('Reading tiers form the required Free → Bronze → Silver → Gold hierarchy', () => {
  let levels = ['FREE', 'BRONZE', 'SILVER', 'GOLD'];
  for (const [i, owned] of levels.entries())
    for (const [j, needed] of levels.entries()) assert.equal(canRead(needed, owned), i >= j);
});
test('Gateway signatures verify exact raw bytes using constant-time comparison', () => {
  let body = Buffer.from('{"event":"subscription.charged"}'),
    secret = 'unit-test-only',
    sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
  assert.ok(checkSignature(body, sig, secret));
  assert.equal(checkSignature(Buffer.concat([body, Buffer.from(' ')]), sig, secret), false);
  assert.equal(checkSignature(body, 'no-signature', secret), false);
  assert.equal(checkSignature(body, sig, ''), false);
});
test('A maker and a last editor cannot approve their own revision', () => {
  const a = {
    authorId: 'writer',
    lastEditorId: 'editor',
    status: 'IN_REVIEW',
    region: 'IN',
    revision: 1,
    sourceDate: new Date(),
  };
  for (const id of ['writer', 'editor'])
    assert.throws(
      () => transition(a, { id, roleId: 'CHIEF_EDITOR' }, 'APPROVE'),
      (e) => e.status === 403,
    );
  assert.equal(transition(a, { id: 'checker', roleId: 'CHIEF_EDITOR' }, 'APPROVE'), 'APPROVED');
  assert.throws(
    () => transition(a, { id: 'checker', roleId: 'CHIEF_EDITOR' }, 'REJECT', ' '),
    (e) => e.status === 400,
  );
});
test('Publication requires a recent Indian story and approval of this revision', () => {
  const a = {
      authorId: 'writer',
      lastEditorId: 'writer',
      status: 'APPROVED',
      region: 'IN',
      revision: 2,
      sourceDate: new Date(),
      approvals: [{ revision: 1, action: 'APPROVED', actorId: 'checker' }],
    },
    u = { roleId: 'CHIEF_EDITOR', id: 'checker' };
  assert.throws(
    () => transition(a, u, 'PUBLISH'),
    (e) => e.status === 409,
  );
  a.approvals[0].revision = 2;
  assert.equal(transition(a, u, 'PUBLISH'), 'PUBLISHED');
  assert.throws(
    () => transition({ ...a, region: 'OTHER' }, u, 'PUBLISH'),
    (e) => e.status === 400,
  );
  assert.throws(
    () => transition({ ...a, sourceDate: new Date(Date.now() - 29 * 86400000) }, u, 'PUBLISH'),
    (e) => e.status === 400,
  );
});
