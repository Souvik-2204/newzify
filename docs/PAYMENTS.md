# Razorpay test-mode operations

The merchant supplies the test API key ID, test secret, and a separate webhook secret. **Do not put either secret in `VITE_*` variables, source control, or browser code.** The browser receives only the public test key and its server-created subscription ID.

## Checkout sequence

1. The reader selects a plan and monthly or annual billing. Authentication is required before checkout creation.
2. `POST /api/subscriptions` reads the price from an available database plan. The browser includes the displayed plan version so a changed price must be reviewed before checkout. The server creates or reuses the corresponding Razorpay plan and creates a gateway subscription, stored locally as `PENDING`.
3. The frontend opens the official Razorpay checkout script with that subscription ID. A recent pending checkout for the same plan, user, cycle and agreed amount can be resumed.
4. `POST /api/subscriptions/verify` checks ownership and verifies the HMAC over `payment_id|stored_subscription_id` with the private API secret. It fetches both payment and subscription from Razorpay. The plan must match, the payment must be captured in INR, and the amount must match the subscription’s agreed amount for the selected billing period before the payment is recorded as a paid period.
5. Entitlement is evaluated server-side on each protected read. An authorisation-only token charge, unsigned browser response or pending checkout is not payment for the full period.

## Webhook configuration

Use the public HTTPS URL of the running site, followed by:

```
/api/webhooks/razorpay
```

Subscribe to `subscription.authenticated`, `subscription.activated`, `subscription.charged`, `subscription.pending`, `subscription.halted`, `subscription.paused`, `subscription.resumed`, `subscription.cancelled`, `subscription.completed`, and `subscription.updated` where available in the test dashboard.

The raw-body handler runs before JSON parsing. It checks `X-Razorpay-Signature` with HMAC-SHA256 and a timing-safe comparison, matches the known subscription and plan, and records the event and state in a transaction. Replayed event IDs are acknowledged without duplicating a payment. Gateway payment IDs are unique. Older events do not roll a newer subscription state backwards. Only a verified captured charge can extend the paid-through date. State-only events, mismatched renewals and repeated browser callbacks cannot grant an additional period.

## Renewal management

`POST /api/subscriptions/:id/cancel` checks that the caller owns the active subscription, then requests **cancel at cycle end** from Razorpay. A Super Admin can perform the same operation through the restricted membership desk. The current paid period is retained; a scheduled cancellation is not a refund. Paused, halted and expired access is not treated as active membership.

## Merchant acceptance checks

After connecting your test merchant account, test monthly and annual checkout, abandoned checkout, a failed payment, the captured first invoice, a renewal, a repeated signed webhook and cancellation at period end. Confirm the local subscription period and payment ledger against the test dashboard. Inspect real webhook delivery logs and retry failures. No real gateway transaction was performed during the initial build because no merchant credentials were supplied.

## Managing offers

Super Admins can change plan names, features, availability, and monthly/annual amounts from **Membership plans**. These changes affect new sign-ups, not existing agreements. A price change clears the cached gateway plan ID for the affected billing interval; a new checkout creates a matching gateway plan. Each subscription stores the amount and gateway plan agreed at checkout. The verification and signed webhook paths check those terms even after the public offer changes. Pausing enrolment does not cancel paid access.
