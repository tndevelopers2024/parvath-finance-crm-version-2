# Operations and release procedure

## Configuration

Copy `.env.example` and set required values. SESSION_SECRET must contain at least 32 random characters. MONGODB_URI and MONGODB_DB belong only on the server. Use an Atlas runtime identity restricted to the CRM database and a separate migration identity authorized for validators/indexes. Set TEST_MONGODB_URI/TEST_MONGODB_DB only for isolated tests; never point them at production. See [Atlas setup](mongodb-atlas.md).

Production requires NODE_ENV=production, HTTPS APP_ORIGIN, no DEMO_DATE, private S3, an approved scanner, SMTP for account recovery and a real Atlas deployment supporting transactions. Keep Atlas network access restricted to the API/worker hosts or private endpoint. Browser origins are matched exactly: `APP_ORIGIN`, the API's own host, and any listed in `ALLOWED_ORIGINS`. A frontend on another domain that proxies `/api` (such as the Vercel rewrite in `apps/web/vercel.json`) must have its origin in one of those or every sign-in and save is rejected with "Origin is not allowed". Trust only the configured reverse-proxy hop count; terminate HTTPS at the ingress. Keep object-store administration private.

Compose is **local development infrastructure**. The API and worker read MongoDB settings from `.env` and can use Atlas directly. The optional `local-db` profile starts MongoDB 8 and replica-set initialization; it is not production database configuration. Use APP_ORIGIN=http://localhost:8080 and NODE_ENV=development for the local web container. Resolve reviewed immutable image digests before a release.

## Build and deploy

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev

# With Atlas configured, no local database service is needed:
docker compose --env-file .env -f infra/compose.yaml --profile app build
docker compose --env-file .env -f infra/compose.yaml up -d minio bucket-init clamav mailpit
# Run once with the migration identity before starting the API:
docker compose --env-file .env -f infra/compose.yaml --profile app run --rm api node dist/apps/api/src/persistence/migrate.js
docker compose --env-file .env -f infra/compose.yaml --profile app up -d api worker web
```

Provision the first administrator using `node dist/apps/api/src/admin.js` inside the API image with secure ADMIN_* variables. Do not reseed an existing migrated database. The worker command is `node dist/apps/api/src/worker.js`; the API command is `node dist/apps/api/src/index.js`. Nginx serves `apps/web/dist` and proxies `/api` to port 4007.

The optional `pg` devDependency is used only by staging cutover/reconciliation scripts. API, worker, sessions, migrations and tests have no PostgreSQL connection. No Prisma code generation is needed. No public deployment has been performed.

## Health, logs and shutdown

- `/api/health`: process liveness.
- `/api/ready`: MongoDB ping, schema-version marker, and a check that the schema fingerprint stored by the last `db:migrate` matches this build (503 until the migration has run). It does not certify S3, scanning, SMTP or Atlas backup configuration.
- Startup refuses a standalone MongoDB server and logs a sanitized connection failure without the URI. Atlas connection failures require checking credentials, IP/private endpoint access and cluster availability.
- Pino logs structured request IDs, method/path/status/duration; bodies, cookies, authorization values and query strings are not logged. The central error middleware is the integration point for monitoring with PII collection disabled.
- Monitor failed/stale Job documents, growing quarantine, scan failures, database latency, connection pool pressure, login failures and backup age.
- API SIGTERM/SIGINT stops accepting traffic, drains HTTP requests and closes the MongoDB client shared with the session store. A 10-second guard bounds shutdown. Workers finish the current bounded job then close their client.
- Current auth/API rate limits are per API process. Use a shared ingress/store before running multiple replicas. Password login/reset limits do not count ordinary authenticated session checks.

## Jobs, sessions and documents

Run at least one worker, either as its own process (`node dist/apps/api/src/worker.js`) or inside the API process with `INLINE_WORKER=1`. On Railway the repository config runs `persistence/migrate.js` before each deploy, checks `/api/ready`, and defaults `INLINE_WORKER` to 1 because only the API service is started; set `INLINE_WORKER=0` there if you add a dedicated worker service. Document scans still need `CLAMAV_HOST`; without it every upload stays quarantined. MongoDB atomically claims jobs; a five-minute server-time lease and token fence stale workers. Retries use exponential delay and fail after five attempts. Administrator Settings displays failures and allows retry. Notification IDs equal job IDs to prevent duplication after a crash. Event confirmation cancels obsolete reminders.

With a fixed demo clock, future business reminders do not become due until DEMO_DATE advances or is removed. Session expiry and job lease time use real time. Session TTL deletion is eventual; the store still rejects an expired session immediately. Password changes/reset revoke the affected stored sessions. Do not manually delete session indexes.

S3 files stay private. Detected signatures, allowed extensions and a 10 MB limit are enforced before quarantine. ClamAV INSTREAM must be privately reachable. Validate clean-file release and EICAR rejection in a nonproduction environment. Cross-workspace downloads return 404; quarantined/rejected files cannot be downloaded. Reconcile orphan objects after process-level failures.

WhatsApp/email/call deep links and manually recorded outcomes remain the supported communication modes. Automated provider delivery/webhook adapters are not implemented. SMTP recovery delivery requires a configured transport. Missing providers must remain visible failures rather than simulated success.

## Backup and restore

1. Configure Atlas backups and point-in-time recovery appropriate to the selected cluster tier and business recovery targets. Monitor successful snapshots and retention. Do not assume a development cluster has production backup protection.
2. For a controlled logical backup use MongoDB Database Tools (`mongodump`/`mongorestore`) with a securely supplied connection configuration. Keep credentials out of shell history and logs. Use a consistent snapshot or write freeze for related collections.
3. Enable private S3 versioning/replication/lifecycle rules as appropriate and coordinate file recovery with metadata recovery points.
4. Restore into an isolated MongoDB database with outbound messaging/workers disabled. Restore the matching object versions; verify references, permissions, exact financial amounts, collection validators/indexes and representative document downloads.
5. Invalidate restored sessions/reset tokens and rotate the restored session secret. Audit queued jobs against restored event state before starting workers.
6. Record restore drills and measured RPO/RTO. This build has not certified a restore drill or Atlas backup policy.

## Schema changes and rollback

`npm run db:migrate` (compiled equivalent above) is additive/idempotent setup for the current MongoDB collections, validators, indexes and session TTL. It records version `001-mongodb` and does not drop data or indexes. Back up before applying changes; use a migration identity and inspect collection/index changes in staging. Future incompatible schema changes need explicit versioned backfills and an expand/migrate/contract plan.

Retain prior application images and coordinate rollback with schema compatibility. The pre-MongoDB code and SQL migrations are preserved in commit `b114bc7`; PostgreSQL was left untouched during local cutover. Before MongoDB accepts new writes, that source can be used to abort cutover. After new writes, switching back without reconciling them would lose data. Freeze writes and execute a reviewed recovery/delta migration instead. There is no automatic dual-write or reverse-migration service.

## Unverified external release requirements

Company Atlas credentials/network access have not been provided, so Atlas connectivity and production IAM/TLS are unverified. This host has no Docker executable; image builds, Compose startup and the updated Docker-based CI job have not been run here. Live S3/ClamAV/SMTP integration, backup restoration, production load, multi-replica limits and independent security/accessibility review remain release requirements. Local replica-set and browser checks do not certify production readiness.
