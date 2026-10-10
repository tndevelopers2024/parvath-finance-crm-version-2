# Verification report

Verified locally on 18 September 2026 with Node 24.19.0, MongoDB 8.2.7 replica set and the committed dependency lockfile. The synthetic workspace uses **4 September 2026, 12:00 Asia/Kolkata** as its fixed business clock. Production rejects the demo clock.

## Automated checks

| Check | Result | Scope |
| --- | --- | --- |
| ESLint | Passed | Application, server and test sources |
| TypeScript | Passed | API, shared contracts, tests and web |
| Production build | Passed | Compiled Express server and Vite frontend |
| Vitest / Supertest | 30 passed | 5 domain and 25 API integration tests against a separate MongoDB database |
| Playwright journeys | 10 checks passed | Real browser with the running Express API and persistent MongoDB demo database |
| Dependency audit | 0 known vulnerabilities at verification time | Installed dependency graph; not a security certification |
| MongoDB schema setup | Passed | Repeatable collection validators, indexes, optional uniqueness and session TTL in development and test databases |

API tests cover authentication/CSRF, role restrictions, workspace isolation, private-document access denial, client persistence and reviewed duplicates, linked business contacts, optimistic concurrency, import idempotency, lead history and repeat-safe conversion, product ownership, typed financial events, payment validation, recurring renewal confirmation and reminder cancellation, follow-up outcomes/rescheduling, dashboard totals, India date boundaries, durable reminder retry/deduplication, password reset and session revocation, and repeated session checks without exhausting account-change limits. Opening a conversation is tested separately from verified contact activity.

[Browser journey results](verification/browser-journeys.json) cover sign-in, required-field validation, draft recovery, five-step individual creation, persistent profile editing, accessible lead movement/conversion, payment and renewal confirmation, follow-up rescheduling/completion, business/minimal onboarding and import preview errors. Browser-created records are removed using the narrowly scoped demo cleanup command before visual captures.

MongoDB-specific checks cover rollback after a multi-record failure, concurrent conversion requests producing one product, competing workers claiming one reminder, BSON Int64 storage and exact aggregation above JavaScript’s safe-integer range, strict collection validation, partial uniqueness for optional opportunity links and serialized concurrent duplicate-contact checks.

The [cutover reconciliation report](verification/mongodb-cutover.json) compares all legacy fields and counts across 26 business collections, with zero differences. UUIDs, password hashes, history, money and calendar dates were preserved. SQL sessions were not copied. PostgreSQL was read-only and remains unchanged. The importer explicitly parses SQL DATE values as UTC-midnight dates.

These are representative checks, not exhaustive penetration, accessibility, load or disaster-recovery testing. Document authorization/quarantine rules were tested; a live clean-file upload, ClamAV release and S3 download round trip was not tested without those external services.

## Visual verification

All seven reference screens were extracted from the supplied PDF and inspected at their native **1536 × 1024** resolution before implementation. The final application screenshots use that same viewport. Open the [side-by-side and adjustable overlay comparison](visual-comparison.html) in a browser; it includes every reference and its implemented counterpart.

| Reference screen | Application capture |
| --- | --- |
| Dashboard | [Screenshot](verification/01-dashboard.png) |
| Clients directory | [Screenshot](verification/02-clients.png) |
| Client profile | [Screenshot](verification/03-client-profile.png) |
| Add New Client | [Screenshot](verification/04-add-client.png) |
| Leads | [Screenshot](verification/05-leads.png) |
| Renewals | [Screenshot](verification/06-renewals.png) |
| Follow-ups | [Screenshot](verification/07-followups.png) |

Manual comparison addressed shell proportions, sidebar branding, header alignment, card height/gaps, table density, calendar positioning, profile columns, onboarding stepper/footer and the Won/Lost stack in the fifth lead-board column. The final correction reduces the profile's renewal preview to three rows with View All and stacks onboarding support panels below the form at tablet width.

Browser checks additionally visit all seven routes at **1280 × 900**, **768 × 1024** and **390 × 844**, assert that the document does not overflow horizontally, and exercise tablet/mobile drawer navigation, focus containment and focus restoration on Escape. Tables and the lead board use controlled internal scrolling. Dashboard and onboarding captures at each size are stored alongside the seven principal screenshots. No browser runtime/API errors were recorded in the final visual pass.

Visual assessment is manual; no numerical pixel-match score is claimed. Automated screenshot capture is reproducible, but there is no approved pixel-diff regression threshold. The original font cannot be identified from raster references, so Arial/system sans is used. Lucide supplies consistent line icons. Individual leaf/logo and botanical assets were recovered from the PDF. Avatars use initials until an authorized photo is available; unrelated photos are not substituted. Synthetic names, counts, amounts and dates intentionally resolve the reference's contradictions, and the Documents panel truthfully shows an empty state until files are uploaded.

## Reproduce

Follow the setup in [README](../README.md), configure a separate MongoDB test database, start the application, and run:

```sh
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:ui
npm run test:browser -- journeys   # writes synthetic records; see browser-journeys.md
npm run test:sweep                 # every page with seeded data; see browser-sweep.md
npm run demo:cleanup -- --confirm-db=<MONGODB_DB>
npm run test:browser -- visuals
npm audit --omit=dev
```

The browser scenarios are documented in [journeys](browser-journeys.md) (a script, `scripts/browser-journeys.mjs`) and [visuals](browser-visuals.md) (read from its document and materialized in the operating system temporary directory). `npm run test:ui` is the read-only responsive/interaction suite on fixture responses; the journeys are the live, writing checks. Use only the synthetic local workspace with the generated account in the ignored `.env`. HEADLESS=1 is supported for CI. The API/domain suite is configured in GitHub Actions with a MongoDB replica set; the updated CI job itself has not been executed here. Browser checks run locally.

## Release limitations

This application has not been published or certified production-ready. Company Atlas access has not been provided; the application has been tested against a real local replica set, not the company Atlas cluster. Docker is absent on the validation host; Dockerfile builds and Compose startup remain untested. Configure and test private S3/MinIO, ClamAV and SMTP before enabling real document handling and account-recovery delivery. Automated WhatsApp/email sending and delivery webhooks are not implemented; the interface labels deep links and manual outcomes honestly. Production TLS/ingress, reviewed image digests, secrets/IAM, multi-replica rate limits, backup/restore drills, load testing and independent security/accessibility review remain release gates. See [operations](operations.md) for deployment, recovery and rollback procedures.
