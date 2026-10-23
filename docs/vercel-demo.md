# Vercel demo deployment (no Railway dependency)

This configuration hosts the React frontend and Express API in one Vercel
project. MongoDB stays on Atlas. Use synthetic demo data only. Vercel Hobby is
for personal, non-commercial projects and has usage limits.

The API runs in Mumbai (`bom1`), close to the current Atlas cluster (GCP
`ASIA_SOUTH_1`). If the database moves, update `regions` in `vercel.json`.
After authentication, the browser warms the main sections with two background
requests at a time. It caches the dashboard, reference data and the first page
of each list; full profiles start loading when their links are hovered or
focused. More list pages remain available through scrolling. Data stays fresh
for one minute and cached for up to 30 minutes while unused, with background
refresh on later visits. Writes invalidate the cache. Login/logout clear it,
and cancelled requests cannot repopulate the previous session's cache. No
client records are persisted in browser storage.

## Import the repository

Push these changes to your Git repository, then import it at
https://vercel.com/new. Use the **repository root**, not `apps/web`:

| Setting          | Value                                            |
| ---------------- | ------------------------------------------------ |
| Root Directory   | Repository root (`.`)                            |
| Framework Preset | Other                                            |
| Build Command    | `npm run build`                                  |
| Output Directory | `apps/web/dist`                                  |
| Install Command  | Automatic (`npm ci` with the committed lockfile) |
| Node.js Version  | 24.x                                             |

The root `vercel.json` sets the build, output and routing. `/api/*` is handled
by `api/index.ts`; all other page routes fall back to the React app. The old
frontend-only Railway proxy configuration has been removed.

## Set Vercel environment variables

Set these for Production, and Preview if you intend to use preview deployments:

```dotenv
NODE_ENV=production
APP_ORIGIN=https://YOUR-PROJECT.vercel.app
TRUST_PROXY=1
INLINE_WORKER=0
MONGODB_URI=mongodb+srv://USER:URL_ENCODED_PASSWORD@YOUR_CLUSTER.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=parvath_crm_demo
SESSION_SECRET=YOUR_RANDOM_SECRET_AT_LEAST_32_CHARACTERS
```

Choose the Vercel project name first so you can configure its final URL. If the
assigned URL differs, update `APP_ORIGIN` and redeploy. Leave `DEMO_DATE` unset:
even a hosted demo uses production cookies and the real clock. Set extra exact
origins in `ALLOWED_ORIGINS` only if needed.

Copy the MongoDB URI/database and session secret from the old Railway Variables
if reusing its **demo Atlas database**. Never put them in `VITE_*` variables,
commit `.env`, or paste them into chat. A Railway-hosted MongoDB service will
also stop with Railway: it must be moved to Atlas separately. A URI beginning
with `mongodb://127.0.0.1` is local and cannot work from Vercel.

Atlas must allow connections from Vercel. Configure its network access for your
deployment. If using `0.0.0.0/0` for a disposable demo with dynamic egress, this
allows all source IPs; use a unique database-scoped account and synthetic data.
Atlas credentials are still required.

## Prepare the database once

An existing Atlas demo database can retain its accounts and data. Run the
additive migration against that database before using this build. Vercel does
not run Railway's pre-deploy migration command.

In your local ignored `.env`, configure the **intended demo Atlas database**,
then run:

```sh
npm ci
npm run db:migrate
```

Only for a new database, set `ADMIN_EMAIL`, `ADMIN_NAME`, and a unique
12+ character `ADMIN_PASSWORD` locally and run `npm run admin:create`.
Remove `ADMIN_PASSWORD` afterward. Do not recreate an existing account.
Optional synthetic seeding is described in the README; it needs `DEMO_DATE`
locally, but that variable must not be set on Vercel.

## Deploy and check

Click Deploy, then verify:

1. `/api/health` returns JSON with status `ok`.
2. `/api/ready` returns JSON with status `ready`. If it reports a schema mismatch,
   rerun `npm run db:migrate` locally against the same Atlas database.
3. Login works, a client can be saved, and refreshing a nested page works.

Keep the existing Railway project until you have verified the new deployment
and the database location. No Railway endpoint is used by this Vercel setup.

## Demo limitations

- There is **no continuous background worker** in this deployment. Automatic
  reminder notifications, important-date job processing, and document scanning
  do not run. Uploads without storage/scanner configuration fail explicitly;
  unscanned documents remain unavailable for download. Run `npm run worker`
  separately with the same demo database and provider configuration if needed.
- MongoDB, private S3 storage, scanning and messaging providers remain external
  services. Existing provider features need their corresponding server secrets.
- The API is subject to Vercel Function duration and request-size limits, so
  large uploads and long bulk operations need separate adaptation.
- Rate limiting is per Function instance; this setup is intended for a demo.
- A successful local build does not verify Vercel routing, Atlas network access,
  or login cookies; complete the deployed checks above.

References: https://vercel.com/docs/functions/runtimes/node-js,
https://vercel.com/docs/project-configuration/vercel-json,
https://vercel.com/docs/plans/hobby.
