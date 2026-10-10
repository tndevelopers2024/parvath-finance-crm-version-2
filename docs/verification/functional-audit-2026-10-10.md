# Functional audit — 10 October 2026

> **Update:** the code and test issues below were addressed afterwards; see [Remediation](#remediation--10-october-2026). Items that need credentials or a decision remain open there.

Result: core tested workflows pass, but the app cannot be called fully functional. The lead board omits records beyond its first page, its clock is fixed to a demo date, and several external services are unconfigured.

## Executed checks

| Check | Result | Evidence / scope |
| --- | --- | --- |
| Type checking | PASS | npm run typecheck |
| Lint | PASS | npm run lint |
| Production build | PASS | npm run build |
| API and unit tests | PASS | npm test: 2 files, 68 tests, 172.39 seconds |
| UI and responsive suite | PASS | npm run test:ui; fixture API responses, not live write persistence |
| Live Firefox client creation | PASS | Arun Kumar QA Test saved and profile opened; basic fields, phone normalization and savings verified |
| Live Firefox lead creation | PASS | Required next action blocked empty submission; labelled QA lead saved |
| Live Firefox lead edit | PASS | Next action changed, saved, and shown on details |
| Live Firefox stage update | PASS | QA lead moved from New Enquiries to Contacted; history updated |
| Live Firefox notifications | PASS | Popup opened and closed without navigation |
| Live Firefox board collapse | PASS | New Enquiries collapsed and expanded |
| Live Firefox global search | PASS | Returned the new QA client and lead |
| Strict onboarding validation | PASS for exercised cases | Blank fields, short name, invalid phone/email, impossible/future birth dates, negative dependents, invalid PIN and savings, incomplete initial follow-up |

The API suite covers authentication/CSRF, roles and workspace isolation, client/business creation and editing, duplicates, imports/retries, catalogue and lead history/conversion, product filters, payment and renewal state, event corrections/cancellation/reversal, follow-up edits/completion, reporting totals, reminders/retry behavior, transactions, exact money handling, collection validation, exports, and mocked WhatsApp delivery/failure paths.

The UI suite visits 23 routes at widths 1440, 1280, 768 and 390 in light and dark themes. It checks horizontal overflow and error states. Interactive checks cover provider/product dialogs, product-category client selection, cancel navigation, calendar month navigation/birthdays/details, dashboard tabs, sidebar pinning, global search, client selection and filters, validation, mobile navigation, and creation/edit/payment/team dialogs. No page errors were reported. The suite prints “21 screens” although its route array contains 23.

## Confirmed issues and unavailable integrations

1. **Lead board truncation:** apps/web/src/Leads.tsx requests limit: 100 and offers no pagination/load-more. The board showed a workspace total of 321 leads, while the newly created QA lead was absent from its Contacted column. Global search and direct detail navigation found the record. Leads after the first page cannot be managed through the board.
2. **Fixed demo clock:** DEMO_DATE is configured. The new QA lead history displays 4 September 2026 even though the actual test date is 10 October 2026. Dashboard “Today” and operational date windows follow this demo clock.
3. **Document upload/download lifecycle unavailable:** S3 access credentials and ClamAV host are missing. Upload, scanning and clean-file release cannot be verified as functional live integrations.
4. **Email delivery/account recovery unavailable:** SMTP_URL is missing. Live recovery mail delivery is unverified.
5. **Bulk WhatsApp delivery unavailable:** WhatsApp phone-number ID and access token are missing. API tests use mocks; they do not prove actual provider delivery. No external messages or calls were sent.
6. **Legacy browser journey script is stale:** docs/browser-journeys.md expects old validation wording and onboarding navigation. It was inspected but not used as evidence of current end-to-end browser success.

## Limits and test data

This is broad functional coverage, not proof that every individual button and every possible input/role combination works. UI fixture tests do not verify live saving. Backend tests use a separate test database. No real financial transactions, password changes, messages, permission changes or destructive live actions were exercised through the browser.

Live synthetic records left for review:
- Client: Arun Kumar QA Test, 02db808b-ee6c-4c77-9239-bdbaeb535a96 (created during the preceding client-validation test).
- Lead: 08c78156-7687-46ea-aca3-0029771e180a, linked to that client, Contacted; notes explicitly say synthetic functional test and do not contact.

The earlier validation fixes remain local: ClientForm.tsx, packages/contracts/src/index.ts and tests/domain.test.ts. This audit did not push any changes.

## Remediation — 10 October 2026

Nothing was committed, pushed or deployed. No existing data was deleted or rewritten, and the database was not reseeded.

### Fixes

| # | Issue | Status | What changed |
| --- | --- | --- | --- |
| 1 | Lead board truncation | **Fixed** | Each stage column now loads its own pages (`/leads?stage=…`, 25 at a time, newest first) with a "Show more" button and automatic loading as the column end scrolls into view. The column count is the stage's full total from the server, so every lead in a visible stage can be reached and edited. The search and priority filters, drag-and-drop (the dragged card carries its own record), column folding and the intentionally hidden *Qualified* column are unchanged. The API orders by creation time then id, so pages never repeat or skip a lead. Each stage loads, fails and retries independently. |
| 2 | Fixed demo clock | **Fixed for development** | `DEMO_DATE` is commented out in the local `.env` and `.env.example`, so the app uses the real clock. The explicit demo/test clock still works: the test suite sets it, and the demo seed and refresh scripts require it. The business day is Asia/Kolkata on the server (workspace timezone) and in the browser (`todayIST()` in `apps/web/src/api.ts`, used by the date picker, birth-date limits, worklist fallback and client "since" year). Historical records were not touched, so records created under the demo clock still show 4 September 2026. The running development API keeps its old environment until it is restarted. |
| 3 | Stale browser journeys / screen count | **Fixed** | `scripts/browser-journeys.mjs` replaces the script embedded in the Markdown; `npm run test:browser -- journeys` runs it. The UI suite prints the length of its route list (23, not 21). The UI fixture now answers `/leads` with stage/priority filtering and paging, and includes a 32-lead column so paging is exercised. `npm run demo:cleanup` no longer depends on the fixed demo date; it needs `--confirm-db=<MONGODB_DB>`. |
| 4 | Strict validation | **Verified and extended** | See below. |
| 5 | Unavailable integrations | **Reported honestly; credentials still needed** | See below. |
| 6 | Audit report | **Updated** | This section. |

### Validation (item 4)

Enforced in `packages/contracts/src/index.ts`, which both the form and the server use:

- Dependents: whole number 0–99. PIN code: six digits, not starting with 0 (a space in the middle is accepted). Monthly and total savings: money such as `25000`, `25,000.50`, `₹ 25,000`, `Rs. 25,000`; no negatives or text.
- Phone and email formats; impossible calendar dates; a birth date in the future for the client, the spouse and each child, and a future "client since" date (India's current date).
- Blank optional fields remain valid.
- **Saved details are preserved.** On edit, only the onboarding details that were changed are held to the current rules (`withoutUnchanged`), in the form and in `PATCH /clients/:id`. A client whose saved profile has free text such as dependents "two" can still be edited and keeps that value until someone changes it.
- Next, the section selector and the step buttons all go through the same check: every detail section (not only two of them) is validated before moving on, a half-typed or impossible date blocks, and the first issue is shown beside its field, including rows (for example "Children, row 1, date of birth"). Final submit repeats the checks and the server repeats them again; invalid saves return 422.

### Integrations (item 5)

Nothing is simulated. `GET /api/auth/me` now returns `integrations.{documents,email,whatsapp}`; the client profile disables document upload and the WhatsApp broadcast panel and shows why. Document upload is refused up front (503, with the missing setting names for administrators) instead of storing a file that can never be scanned. The required settings and how to verify each live are in [operations](../operations.md#integrations-what-each-needs-before-it-is-live):

| Capability | Missing today | Needed |
| --- | --- | --- |
| Documents | S3 access key and secret, ClamAV host | `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` (+`S3_ENDPOINT` for MinIO), `CLAMAV_HOST` |
| Account-recovery email | SMTP | `SMTP_URL`, `MAIL_FROM`, HTTPS `APP_ORIGIN` |
| WhatsApp broadcasts | Phone-number ID, access token | `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, an approved template |

### Tests executed (after the final change)

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| `npm test` | PASS, 2 files, 77 tests, about 164 s. New: server-side onboarding validation; saved details kept on edit; per-stage lead paging and totals; integrations reported unavailable and uploads/broadcasts/reset refused; real vs demo clock; amount/PIN/date rules. |
| Browser sweep, 16 sections (seeded data, whole app) | PASS, see above |
| `npm run test:ui` (fixture API, read-only) | PASS, 23 routes × 4 widths × 2 themes, plus lead board paging (25 then 32 cards, count 32, filter, *Qualified* hidden), collapse/expand and the existing interaction checks |
| Live browser journeys, 21 checks | PASS (the first 12 passed twice in a row; the last runs added sale conversion, payment/renewal, CSV import, business onboarding, administrator corrections and the role journeys and passed all 21). Run against a second API and web app on other ports using the **test database** (`parvath_astra_test`), real clock, a throwaway administrator in a throwaway workspace. Covered: business onboarding (registration details saved, contact person linked) and administrator corrections (event edit, payment protection, reversal, cancellation, closing a product); roles (administrator provisions an Adviser and an Operations member; each role's interface controls and server refusals; lost leads cannot be reopened by an adviser; deactivation ends access); sale conversion (blocked until acceptance is ticked), event, payment, confirmation and the recurring next renewal, and CSV import (preview writes nothing, valid rows added once, duplicates and bad rows skipped, re-import adds none); sign-in; add-client validation (empty, short name, bad phone/email, impossible and future birth dates, dependents, spouse birth date, PIN, savings) blocking Next; messages clearing; draft recovery; follow-up validation and creation; client persistence; client edit validation and save; lead create, edit and stage change; board column and total; follow-up scheduling in India time, reschedule and completion. |

The journeys' synthetic workspaces and users were removed from the test database afterwards. They were created by this run only.

### Full-application browser sweep

`npm run test:sweep` ([browser-sweep](../browser-sweep.md)) seeds a workspace (60 individuals, 4 businesses, 40 leads, 12 products with renewals at different distances, follow-ups, notes) and uses every page: dashboard, search, clients, client profile, leads (including dragging), renewals, follow-ups, providers and products, product registers, calendar, engagement, reports, notifications, settings, sign-in/out and responsive widths. It also fails on any page error, console error or unexpected failed API call. **16 sections pass**, on a fresh workspace and again on re-run.

It found, and these were fixed:

- **Product register hid Active and Closed products (real bug).** `GET /api/products` with no status filter silently applied `status=Application`, so the *All* tab of the product pages, the category pages and the records page showed only applications. The fixture-based UI tests could not see it. The filter is now genuinely optional; a new API test covers it.
- **Client list row actions were off screen.** At 1440 px the table was wider than its panel, so the delete and "more" buttons sat behind a sideways scroll. The actions column now stays visible; the sweep checks this.

The remaining sweep failures during development were my own selectors and expectations, not app faults.

### Failures seen and their cause

- Before these changes, one full `npm test` run had 3 API failures (one was an event-amount assertion) and the immediate re-run passed all 55. It did not recur in the full runs after these changes, but treat it as intermittent.
- One new test failed on the first full run because it used an agent that an earlier test deactivates; the test was corrected.
- The journey script's first runs failed on selectors and on messages it expected (the date picker itself reports a future date); these were outdated expectations, not app faults.
- No failures were caused by missing external configuration; those capabilities are reported unavailable by design.

### Remaining limitations

- The development servers on ports 5177 and 4007 were not running at the end of this pass, so the UI suite was pointed at a temporary copy; restart `npm run dev` before using the app.

- **Credentials are required** for live verification of document upload/scan/download, recovery email and WhatsApp delivery; none were invented or used.
- Writes against the **development database** were not exercised in this pass, and the board was not viewed against its 321 leads there; paging was verified on the API test database, the fixture board and the live journeys.
- Not in the browser journeys: reopening a lost lead as an administrator (API tests cover it) and anything needing credentials.
- **Role finding (fixed):** Operations users saw an *Edit* link on the client profile that the server then refused. The link is now hidden for Operations; the server refusal remains for anyone who opens the edit address by hand.
- `npm run test:browser -- visuals` was not run, and still logs in from its Markdown-embedded script.
- Restart the development API so it stops using the old `DEMO_DATE`; reseeding or rewriting history was deliberately not done.
- A lead moved to another stage sorts by creation date there, so an older lead may be below the first page of its new column until "Show more" is used; the count is correct immediately.

### Existing QA records (not modified or deleted)

- Client: **Arun Kumar QA Test**, `02db808b-ee6c-4c77-9239-bdbaeb535a96`.
- Lead: `08c78156-7687-46ea-aca3-0029771e180a`, linked to that client, stage *Contacted*; its notes say synthetic functional test, do not contact.

Remove them only with explicit authorization.

### Pending changes in the working tree (uncommitted)

```
 M .env.example
 M README.md
 M apps/api/src/auth.ts
 M apps/api/src/clients.ts
 M apps/api/src/documents.ts
 M apps/api/src/workflows.ts
 M apps/web/src/ClientForm.tsx
 M apps/web/src/ClientOnboardingSections.tsx
 M apps/web/src/ClientProfile.tsx
 M apps/web/src/DateField.tsx
 M apps/web/src/Leads.tsx
 M apps/web/src/Supporting.tsx
 M apps/web/src/Worklists.tsx
 M apps/web/src/api.ts
 M apps/web/src/forms.css
 M apps/web/vite.config.ts
 M docs/architecture.md
 M docs/browser-journeys.md
 M docs/operations.md
 M docs/verification.md
 M docs/verification/browser-journeys.json
 M packages/contracts/src/index.ts
 M scripts/browser-check.mjs
 M scripts/cleanup-demo-checks.ts
 M scripts/workspace-ui-check.mjs
 M tests/api.test.ts
 M tests/domain.test.ts
 M tests/fixtures/workspace-ui.mjs
?? apps/api/src/integrations.ts
?? docs/verification/functional-audit-2026-10-10.md
?? scripts/browser-journeys.mjs
```
