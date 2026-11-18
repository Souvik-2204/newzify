# Deploy The Meridian to Vercel

The Express function serves `/api`, `/cms`, `/admin` and SEO HTML for `/story/:slug`. The build stages the React code, fonts and bundled editorial images in Vercel's static `public/` directory. Staff uploads go to **private** Vercel Blob storage and are streamed through `/uploads/` only after the existing newsroom or reader access check.

## 1. Import the source

Push this source to a private GitHub repository. In Vercel, choose **Add New → Project** and import the repository. Keep the **root directory** at the repository root. The configuration in `vercel.json` selects **Express** and runs `npm run build:vercel`. Leave **Output Directory** unset and choose Node.js **22.x** in the project settings. If Vercel asks to deploy before you configure storage, treat that first deployment as uninitialized and redeploy after completing the steps below.

Do not upload `.env`, local staff credentials, the embedded database, or the `data/` directory. Do not use the Arena preview's demo passwords in the hosted database.

## 2. Connect storage

- Provision a managed PostgreSQL database (for example, Neon). Set its `DATABASE_URL` for **Production** in **Settings → Environment Variables**. Use a separate database or database branch for **Preview** if preview builds need a working API. Do not point Preview at Production by default.
- In **Storage**, create and connect a **Private** Blob store. Use the connection's `BLOB_READ_WRITE_TOKEN` in the same environment as the database. For Preview, use a separate store so testing can't alter production files. Set `UPLOAD_STORAGE=vercel-blob` (the app also detects Vercel's `VERCEL=1` system variable).
- Set `PUBLIC_ORIGIN` to the production site's HTTPS origin, without a trailing slash. This controls canonical article URLs. Never put database or Blob credentials in a `VITE_` variable.

The Vercel CMS accepts JPEG, PNG and WebP images up to **4 MB** per upload. The local version still accepts **5 MB**. A fresh seed uses built-in editorial images; existing CMS data and uploaded images are not migrated by the seed. For a database migration that preserves existing CMS uploads, copy the matching objects into the private store under their existing `uploads/<filename>` keys before going live.

## 3. Initialize a new production database once

Run from the repo root in a terminal where `DATABASE_URL` explicitly points to the **hosted** production database, not the local database. Use the provider's direct connection for migrations if required. Inject `ADMIN_EMAIL` (a real staff email) and `ADMIN_PASSWORD` (a new strong password, at least 12 characters) through your secret manager or terminal environment. These two variables are used for seeding only; Vercel does not need them at runtime.

```sh
npm ci --include=dev
npm run db:migrate
NODE_ENV=production npm run db:seed
```

Do not add seeding to the deployment build. Apply later schema migrations as a separate release step. The current seed loads a dated edition; the public site only surfaces stories whose source is within 28 days, so update the edition if the initial stories have aged out.

## 4. Deploy and check

1. Deploy or redeploy in Vercel after the environment variables are configured.
2. Visit `https://YOUR-DOMAIN/api/health` and look for `"status":"ready"`.
3. Open `/cms`, sign in as the production administrator, and check **Roles & access**. Create other staff accounts from **Users & roles**.
4. Upload a small test image to a draft. Check that it previews for staff and that its `/uploads/` address is not accessible from a signed-out tab. Delete the test draft when done.
5. Verify a story link, a reader sign-in, and the published edition before launch. Razorpay remains optional and test-mode only in this version; see [Payments](PAYMENTS.md).

Nothing in `npm run build:vercel` creates cloud resources or modifies a database. A hosted deployment and real Blob store still need to be configured and verified in your Vercel project.
