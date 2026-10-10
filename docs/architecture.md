# Architecture and decisions

## Structure

- `apps/web/src`: React routes and feature screens; shared components and CSS/Tailwind tokens; React Router; TanStack Query; React Hook Form/Zod onboarding; Recharts; dnd-kit.
- `apps/api/src`: authentication, security middleware, clients/import services, lifecycle workflows, reporting, private documents, durable worker, provisioning and demo seeding.
- `packages/contracts`: browser-safe Zod schemas and common lifecycle labels. No environment variables or credentials are exported.
- `apps/api/src/persistence`: typed MongoDB records, collection schemas/indexes, server-side query repositories and idempotent schema setup.
- `infra`: Dockerfiles, Nginx and Compose infrastructure.

The API owns validation, permissions, money, clocks and transitions. The browser invalidates server queries after mutations so directory, profile, dashboard and worklists refresh together. Database writes requiring several records use MongoDB snapshot/majority transactions with driver retries. Contact changes use a workspace guard to serialize duplicate checks. Foreign-key consistency is checked by repositories and authorized services, since MongoDB does not enforce SQL foreign keys. Unique keys protect conversion, financial recurrence, payments, reminders and import retries. Mutable records use integer versions and return 409 for stale updates.

## Identity and ownership

An organization has memberships. A Contact is the stable identity, with a Business subtype for business-only details. A Client is the financial relationship; `isClient=false` can represent a prospect. Explicit ContactRelationship rows connect existing identities. Opportunities link to a client and represent distinct requirements; one client may have many. Won means accepted proposal, and creates an Application product. Application/Active/Closed tracks fulfilment separately. Lost opportunities may be reopened by an administrator with a reason; accepted sales keep their history and a new requirement uses a new opportunity.

The catalogue (`ProductDefinition` plus `Provider`) is separate from owned accounts (`ClientProduct`). Insurance, loan and investment details have separate structured JSON subtypes validated by Zod. Monetary amounts are MongoDB BSON Int64 paise plus currency. API JSON uses decimal strings. Browser rupee entry is converted with string/BigInt arithmetic. Formatting may use Number solely for display; totals and stored amounts use integers.

FinancialEvent distinguishes insurance renewal, premium payment, loan instalment, loan review, bond interest and maturity. The API restricts event types to appropriate product categories. Amount meaning is assigned by the server. Reviews have zero amount. Payment references are unique per event. Confirmation requires full payment/receipt except for reviews, preserves the original event, creates one next event and cancels pending reminders. Recurrence adds calendar months and clamps invalid month-end dates.

## Clock and reporting

Default business timezone: Asia/Kolkata. Date-only events use UTC-midnight BSON dates; activities and tasks use timestamped UTC instants. SQL DATE values in the optional importer are parsed explicitly as UTC midnight. `domain.ts` contains shared clock/date/timing logic. The real clock is used unless the optional demo clock `DEMO_DATE` is set (the synthetic demo data uses 2026-09-04T06:30Z). Production rejects a configured demo clock and non-HTTPS APP_ORIGIN.

Today means a local calendar day. Pending follow-ups become overdue at their due instant, so overdue tasks today also appear under Today. 7-day and 30-day ranges include today and overlap intentionally, using exclusive end boundaries. Custom financial-event from/to filters are inclusive dates. Dashboard bins are 0–6, 7–13, 14–20, 21–27 and 28–29 days, summing to the same next-30-day count. Premium totals exclude principal, instalments, interest and maturity. Upcoming Revenue is expected commission, counted once per distinct product within that same event window.

Attention prioritizes pending financial events by date, then pending follow-ups by due time, and birthdays. Category tabs expose the respective queue. Recent Activity comes from recorded writes, not fabricated message-delivery events.

Relationship health: recent logged communication ≤30 days gives 40 points, 31–90 gives 20, older/unknown gives 0; complete phone/email gives 20, phone only 10; active product gives 20; no overdue follow-up gives 20. Contributions are returned by the API and explained in the profile. This is an operational indicator, not a suitability/risk assessment.

## Permission matrix

All roles can view records **inside their membership's workspace**, search, see their own notifications and download scanned files. Sharing all workspace clients is an explicit small-team policy; ownership assigns responsibility, not confidentiality.

| Capability | Administrator | Adviser | Operations |
|---|---|---|---|
| View/search workspace records | Yes | Yes | Yes |
| Create/edit clients and import | Yes | Yes | No |
| Create/edit opportunities/products/events | Yes | Yes | No |
| Convert accepted sale | Yes | Yes | No |
| Reopen Lost opportunity | Yes | No | No |
| Assign/edit/complete follow-ups | Yes | Yes | Yes |
| Record payment/confirm existing event | Yes | Yes | Yes |
| Upload/download scanned documents | Yes | Yes | Yes |
| Record manual communications/notes | Yes | Yes | Yes |
| Export client/event/task data | Yes | Yes | No |
| Manage members/catalogue/retry failures | Yes | No | No |
| Change own account/password | Yes | Yes | Yes |

Backend checks membership per request, checks organization ownership before details/mutations/downloads, and validates owners and linked records belong to the same workspace/client. Unauthorized object IDs return 404. Role changes take effect on the next request. Self-demotion of administrators is blocked.

## Security and privacy

Argon2id passwords; MongoDB-backed HttpOnly SameSite=Lax cookies with an eight-hour lifetime; secure cookies under production HTTPS; session regeneration at sign-in; CSRF token plus Origin validation on all mutations; password reset hashes, single use and 30-minute expiry; password changes revoke other sessions. Login/reset rate limits and global API limits are provided. Distributed deployments must move rate limiting to a shared gateway/store.

Pino records method, path, status and request identifiers, not bodies, search strings or credentials. Responses contain request IDs for correlation. Exports escape formula-like cells and require export permission. API responses are no-store. S3 objects are private with unguessable keys. PDF/JPEG/PNG content signatures must match extensions, maximum 10 MB, and every download rechecks workspace and scan status. Profile photos use the same quarantine path. A failed or unavailable scanner never releases files.

Draft recovery is scoped to user/workspace in browser local storage; clear drafts on shared devices. Duplicating a contact copies only reviewed contact fields; documents, policies, consents and history are not copied. Communication preference is separate from append-only consent evidence.

## Durable work

MongoDB Job documents avoid adding Redis for this workload. Workers claim atomically with findOneAndUpdate, use server-time five-minute stale-lease recovery, a fencing token, exponential retry delays, five-attempt failure state and explicit admin retry. Notification IDs equal job IDs, preventing duplicate notifications after a crash/retry. Financial-event completion cancels obsolete reminder jobs. Scan jobs use ClamAV INSTREAM and release only clean files. Missing providers are visible failures, not simulated success.

## Reference and supporting-view assumptions

The supplied mountain brand logo (`logo.png`) is used across the application brand headers, favicon, and greeting watermark. The botanical stem from the PDF is recovered individually; no page screenshots are used as UI. Arial is the practical font substitute. Initials replace unavailable portraits. Sample totals and dates are deliberately corrected to match actual synthetic records.

Supporting screens use the same light panels, teal actions and compact typography. Reports are focused operational exports/definitions; there is no accounting or trading module. Engagement prepares messages or logs outcomes without claiming provider delivery. Product Applications are intentionally separate from sales acceptance. No automatic copying of financial products between family identities occurs.

See [MongoDB Atlas setup and cutover](mongodb-atlas.md) for connection settings, validators, exact money representation, transaction semantics and the bounded legacy import tool.
