# The Meridian

A cinematic Indian digital newspaper, paid-membership platform and independent editorial CMS. Built with **React, Vite, JavaScript/JSX, React Router, plain CSS, Express, PostgreSQL and Prisma**. No framework CSS or client-side article database.

## Open the newspaper

The running preview serves both the React application and Express API on **port 5433**. Browser requests use same-origin `/api` URLs.

| Destination | Path |
| --- | --- |
| Front page | `/` |
| Current edition, filters and search | `/latest` |
| Section | `/section/politics` (also business, technology, world, sports, opinion) |
| Reading experience | `/story/:slug` |
| Monthly / annual subscriptions | `/subscribe` |
| Profile, reading list and membership | `/account` |
| Staff-only editorial CMS | **`/admin`** or **`/cms`** (role desk); **`/newsroom`** (overview) |
| Deployment health check | `/api/health` |

**Private local staff logins:** open `data/local-accounts.json` in your workspace. Credentials for the admin, chief editor, section editor and journalist are randomly generated on initial development setup. This file is not a web route, client asset or source-controlled file. Readers register through the account icon or mobile menu. Never publish this private credential file.

## India-only, recent reporting

The launch edition contains **26 sourced briefs and perspectives**, including **12 premium stories**, across six sections. Source dates run from **24 October to 18 November 2026**. Each reading page links to the underlying report and gives its original publication date. No fabricated current dates, quotations or reporter identities are used.

The public API applies the same policy to the home edition, browsing, search, related stories, saved stories and direct article links:

- Region is `IN`; international coverage must have an Indian connection.
- Only a released snapshot is visible. Mandatory stories need senior approval; standard submissions can be released after independent section review.
- The **source date** must be within the previous 28 days, not in the future.
- Editing, seeding or restarting does not make an old source current again.

The launch JSON is a **one-time database seed**, not a frontend feed. All subsequent reading, searching, editing and publishing uses PostgreSQL. The newsroom is **editor-maintained, not an unattended news syndication service**. Editors add current, attributed coverage as older stories age out. The loaded front page checks for edition updates every five minutes while visible.

## Local setup

Use Node.js **20.19+** (or a supported newer LTS) and npm, as a non-root user.

```sh
npm ci
npm run dev
```

With no external `DATABASE_URL`, the development launcher starts an actual PostgreSQL server bound to loopback on port **5434**, generates a private local database password, applies the checked-in schema migrations and seeds the launch edition. Data persists in `data/postgres/`, and credentials in `.env`. **Do not delete these files or replace the generated `.env` when restarting an existing local installation.**

The preview uses Vite middleware inside Express, so there is one public web process. Vite is restricted to the client directory and required Node dependencies. The database, seed bodies, server implementation and local staff credentials are outside its public filesystem boundary.

### Use an existing PostgreSQL database

Set `DATABASE_URL` in your environment or `.env`, and remove `EMBEDDED_POSTGRES=1` if switching from the local cluster. `npm run dev` will migrate and, for an empty installation, initialise that database. Use a dedicated database, not one belonging to another application.

## Membership

| Plan | Monthly | Annual | Access |
| --- | ---: | ---: | --- |
| Free | ₹0 | ₹0 | Free stories |
| Bronze | ₹99 | ₹990 | Free + Bronze |
| Silver | ₹199 | ₹1,990 | Free + Bronze + Silver |
| Gold | ₹399 | ₹3,990 | Every story |

These are the launch offers. Super Admins can change new-enrolment terms; an existing membership keeps its agreed billing amount and gateway plan. At launch, annual billing gives twelve months for the price of ten. Article bodies are **not sent** when membership access is insufficient. Listing endpoints never select the body field. A valid paid period and a captured payment record are required; neither a client flag nor a pending subscription grants access.

### Connect Razorpay test checkout

Add your own credentials to `.env` and restart the web process:

```dotenv
RAZORPAY_KEY_ID=rzp_test_your_key_id
RAZORPAY_KEY_SECRET=your_private_test_secret
RAZORPAY_WEBHOOK_SECRET=your_private_webhook_secret
```

Create a **test-mode** Razorpay webhook at your public HTTPS origin followed by `/api/webhooks/razorpay`. See [the payments guide](docs/PAYMENTS.md) for events and verification details. Live keys are not accepted by this build.

**Without those credentials, checkout is intentionally not simulated.** Readers can compare plans and save membership interest; no payment is taken, no paid subscription is fabricated and no premium text is unlocked. Briefing registrations are stored in PostgreSQL; external campaign delivery is not configured.

## Editorial workspace

Open **`/admin`** for the separate staff sign-in. It leads to `/newsroom`; a reader membership never grants staff privileges. After signing in, **Roles & access** opens the tools for the account’s assigned desk. See [the newsroom guide](docs/NEWSROOM.md) for the complete walkthrough and API contracts.

1. In **Article manager → New story**, write the manuscript, choose its section, byline and reading tier, and set **Mandatory approval** for this story. Incomplete work can be saved privately as a draft.
2. Add an attributed image, the original source and its date, India-coverage confirmation and any tags. Set the URL slug, SEO title, meta description and optional publication timestamp. **Preview** renders the unpublished manuscript for staff only.
3. **Mandatory:** submit → **Review queue → Pending approval** → another Chief Editor or Super Admin approves or returns the revision with a required reason. After corrections, save and resubmit. Approval alone is not publication.
4. **Standard:** an independent Section Editor in an assigned section can use **Review & publish**, explicitly confirming review of the revision and source. The review and release are separately logged.
5. Publishing copies that revision to the reader-facing snapshot. Editing a live story produces a working draft: its existing URL, copy, images, tags, search metadata and paywall **stay live unchanged** until a new release. The old source-date window still applies. Removing a story takes it off all reader surfaces but retains its editorial record.

| Role | Server-enforced permissions |
| --- | --- |
| Reader | Read entitled stories, save articles, manage own profile and membership; no newsroom access |
| Author / Journalist | Create and submit own work, edit drafts/returned files, propose revisions to own published work; cannot approve or publish |
| Section Editor | Work across assigned sections; independently review, return or publish standard submissions there; cannot approve or publish mandatory files |
| Chief Editor | Review across sections, approve/return mandatory submissions, publish and curate the front page |
| Super Admin | Senior editorial controls plus users, role/section assignments, global categories and tags, plans, renewals and newsroom settings |

No one can check a story they created or submitted. Byline authors and the last editor are also excluded, including for direct publication. On mandatory files, the review requirement locks on submission. The **Editorial record** shows actor, timestamp, action, revision and any rejection reason. Public list/detail, media and administrative permissions are enforced in Express/PostgreSQL, not by hidden React controls.

## Project layout

```text
client/
  public/fonts/          Locally served Gilda Display and Urbanist
  public/images/         Editorial photographs and cinematic lead assets
  src/components/        Masthead, navigation, cards, search, dialogs and shared UI
  src/pages/             Home, reading, sections, membership, account, newsroom
  src/newsroom/          Staff sign-in, library/queues, rich editor, people and publication controls
  src/styles/            Separate CSS, including responsive and motion preferences
  src/lib.jsx            API client, session state and shared formatting
server/
  core.mjs               Session cookies, access hierarchy and freshness policy
  workflow.mjs           Independent approval and publication rules
  routes/public.mjs      Reading, authentication, accounts and bookmarks
  publications.mjs       Released snapshots and reader-card selection
  document.mjs           Whitelisted structured manuscript format
  media.mjs              Permission checks for original and released uploads
  seo.mjs                Server-rendered snapshot metadata for story URLs
  routes/admin.mjs       Staff guard, image uploads and taxonomy
  routes/editorial.mjs   Article CRUD, review decisions, filters and front-page layout
  routes/governance.mjs  Account administration, plan terms, settings and audit
  routes/payments.mjs    Razorpay subscriptions, verification and signed webhooks
prisma/
  schema.prisma          Relational PostgreSQL schema
  migrations/            Versioned SQL migration
  seed.mjs               Initial roles, plans, staff and approved launch edition
  edition.json           Source-linked launch records; never bundled into React
scripts/dev.mjs          Persistent local PostgreSQL and web-server bootstrap
tests/                   Policy, API, webhook and browser checks
```

## Verification

With the local development preview running:

```sh
npm test                    # Access tiers, freshness, sessions, workflows, signed events
npx playwright install chromium
npm run test:browser        # Real desktop/mobile reader and multi-account editorial journeys
npm run test:newsroom       # Only the multi-account newsroom browser journey
npm run build              # Production React bundle and generated Prisma client
npm audit --omit=dev        # Production dependency audit
```

Integration tests use disposable local fixtures and clean them up. The editorial suite exercises creator/submitter independence, returned revisions, protected live snapshots (including SEO and uploaded media), assigned direct publication, version conflicts, administration and unchanged billing contracts. Tests that temporarily change a layout, plan or setting restore it; run these suites on the local test installation, not a live desk. They do not run on an external production database. The gateway tests use synthetic signed events and **do not contact Razorpay or take money**. Real Razorpay checkout must be tested with your merchant test credentials before launch.

## Production deployment

For a GitHub-to-Vercel deployment with managed PostgreSQL and private Blob uploads, follow the [Vercel deployment guide](docs/VERCEL.md).

For a traditional deployment, use a persistent Node host and a managed PostgreSQL database. Keep `PORT` configurable and terminate TLS at a trusted reverse proxy. Production setup for a new database:

```sh
# Provide DATABASE_URL, ADMIN_EMAIL and a strong ADMIN_PASSWORD using a secret manager.
# Set NODE_ENV=production for the initial seed. Do not use development credentials.
npm ci --include=dev
npm run build
npm run db:migrate
NODE_ENV=production npm run db:seed
npm start
```

`npm start` serves the compiled client with Express; it does not expose the Vite dev server. Set `PUBLIC_ORIGIN` to the canonical HTTPS origin for absolute story URLs. Keep a **private** persistent volume for `data/uploads` (or an equivalent access-checked storage adapter); do not expose this directory as a public static bucket. Use regular PostgreSQL backups, environment-specific secrets, an accurate system clock, HTTPS and appropriate edge rate limits. Review the [photography and source register](docs/SOURCES.md) and clear third-party editorial image rights before commercial publication.
