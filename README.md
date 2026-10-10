# Parvath FinServ CRM

React/TypeScript/Tailwind, Express/TypeScript and **MongoDB Atlas**, using the official MongoDB Node.js driver. PostgreSQL and Prisma are no longer application dependencies. The seven reference screens and API contracts remain unchanged.

**Local app:** http://localhost:5177 · **Readiness:** http://localhost:4007/api/ready

The current local workspace runs on a dedicated MongoDB replica set and contains the migrated synthetic dataset. Local account email/password are in the ignored `.env` (`ADMIN_EMAIL`, `ADMIN_PASSWORD`). Password hashes and record IDs were preserved. No fixed password is shipped. **An actual company Atlas connection has not yet been supplied or verified.**

## Runtime and setup

- Node **24.11+ / 24.x**, verified with 24.19.0.
- MongoDB Atlas replica set/sharded cluster, or local MongoDB **8.x replica set**; verified locally with 8.2.7.
- Exact package versions are in the committed lockfile. MongoDB driver 7.6.0, connect-mongo 6.0.0.

```sh
npm ci
cp .env.example .env
```

For Atlas, configure the server's ignored `.env`:

```dotenv
MONGODB_URI=mongodb+srv://USER:URL_ENCODED_PASSWORD@YOUR_CLUSTER.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=parvath_crm_dev
SESSION_SECRET=your-unique-random-secret-at-least-32-characters
APP_ORIGIN=http://localhost:5177
```

Use a **separate CRM development database**. Give the application a database-scoped identity and allow only the API host's IP/private network in Atlas. Use a migration identity authorized to create collections, validators and indexes for `db:migrate`, then switch back to the runtime identity. Never put the URI in React/Vite variables or commit it. Details: [Atlas connection and migration guide](docs/mongodb-atlas.md).

```sh
npm run db:migrate
# Set ADMIN_EMAIL, ADMIN_NAME and a unique 12+ character ADMIN_PASSWORD first:
npm run admin:create
# Optional synthetic data only; requires the fixed DEMO_DATE in .env:
npm run db:seed
npm run dev
# Separate terminal:
npm run worker
```

An already migrated database does not need another admin or seed. Initial provisioning refuses to replace an existing account. Remove ADMIN_PASSWORD from deployment configuration after provisioning. In production, unset DEMO_DATE and use an HTTPS APP_ORIGIN.

## Local development without Atlas

Install MongoDB Community Server, then:

```sh
npm run db:local
```

This starts only a loopback-bound development replica set at port **27027**, with data in the ignored `.local-mongodb/` directory. Set `MONGODB_URI=mongodb://127.0.0.1:27027/?replicaSet=parvathLocal` and a separate `MONGODB_DB`. Do not expose the unauthenticated local service externally. Docker Compose offers an alternative `local-db` profile; see the Atlas guide for container/host connection URLs.

The app uses the real clock, with the business day in Asia/Kolkata. Only the synthetic demo data needs a frozen clock: set `DEMO_DATE=2026-09-04T06:30:00.000Z` (4 September 2026, noon in India) explicitly to run it, and leave it unset otherwise. Production rejects `DEMO_DATE`.

## Verification

Set `TEST_MONGODB_URI` and a **different** `TEST_MONGODB_DB` ending in `_test`. Tests refuse the application database name and create/clean their own organizations.

```sh
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:ui
npm run test:browser -- journeys   # writes synthetic records; see docs/browser-journeys.md
npm run test:sweep                 # every page, with seeded data; see docs/browser-sweep.md
npm run demo:cleanup -- --confirm-db=<MONGODB_DB>
npm run test:browser -- visuals
npm audit --omit=dev
```

See [verification](docs/verification.md), [visual comparison](docs/visual-comparison.html), [architecture and permissions](docs/architecture.md), [API](docs/api.md), and [operations](docs/operations.md).

## Existing PostgreSQL data

The optional development-only `db:import-postgres` tool reads a legacy database without modifying it, refuses a populated MongoDB target, and preserves identities and exact amounts. The `pg` package remains only a **devDependency** for this one-time tool; API, worker, sessions, production schema setup and tests use MongoDB exclusively. Follow the cutover and reconciliation procedure in [the migration guide](docs/mongodb-atlas.md). The old implementation and SQL migrations remain available in Git commit `b114bc7` for recovery.

## Release status

No public deployment has been performed. Local MongoDB functionality is verified; Atlas connectivity, production networking/IAM and deployment remain to be verified with the company's configuration. Private S3/MinIO, ClamAV scanning and SMTP are still external requirements. Unconfigured document upload fails explicitly, and unscanned files cannot be downloaded. Automated WhatsApp/email delivery is unavailable; deep links and manual outcomes are labelled honestly.

Docker is not installed on this host, so container builds/Compose startup remain unverified. This is not a production-readiness certification.
