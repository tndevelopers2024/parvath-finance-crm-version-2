# Functional audit — 21 October 2026

The initial audit found working core workflows, validation/upload bugs, informational preferences and unconfigured integrations. The follow-up sections below record the implemented fixes; the original findings are retained as historical evidence.

## Remaining application fixes — 21 October 2026

Contact restrictions and important dates are now operational:

- Server checks enforce WhatsApp-only contact, weekday working-hour call restrictions, preferred contact days and preferred time windows. Checks cover conversation opening, follow-up creation/editing, scheduling the next follow-up, initial onboarding follow-ups, lead-generated follow-ups, and broadcast recipient selection. Drafts and historical outcomes remain recordable.
- Working hours mean Monday–Friday, 09:00–18:00 in the workspace timezone. Preferred windows use exclusive end times. Initial calls default to 18:00 if working-hour calls are blocked; the form explains initial scheduling times.
- Wedding anniversaries and custom important dates appear in the calendar. Custom dates have an explicit **Repeat yearly** checkbox; wedding anniversaries recur automatically. Leap anniversaries use February 28 in non-leap years.
- Durable reminder jobs notify the client owner at 09:00 in the workspace timezone. Saving/removing dates updates or cancels schedules; deletion removes related jobs. The worker rechecks dates before notifying, deduplicates each occurrence, backfills existing profiles and refreshes yearly schedules daily. The local worker was started alongside the original application.
- The browser sweep now waits for the source lead column and the All-renewals/All-follow-ups results before asserting counts. Integration tests allow 120 seconds for remote-database cases with many sequential round trips.
- Profile data is preserved when a direct API edit omits the onboarding profile, preventing unrelated edits from clearing restrictions/dates.

Verification: the complete backend suite passed **86/86** before the last initial-follow-up refinement. The final focused contact/calendar suite then passed **5/5**, including that refinement, timezone boundaries, scheduling restrictions, calendar dates, reminder deduplication and cancellation. Final type checking, lint, production build, responsive UI checks and focused client-form/calendar browser regressions passed. The current suite contains 87 tests after the additional focused case.

Final live browser verification: **21/21 journeys passed**. The sweep passed 15/16 sections in its full run; the remaining follow-up section passed in its own fresh disposable environment after adding the explicit All-tab loading wait. Thus all 16 sections were verified across those runs, rather than claiming a single uninterrupted 16/16 run. An earlier restart-interrupted run and a recheck interrupted by shared-environment shutdown were excluded as environment failures. All audit databases were removed. The original API remains ready; the local worker backfilled two upcoming important-date jobs.

Evidence: [live journeys after fixes](intensive-audit-2026-10-21/journeys-after-fixes.log), [full sweep after fixes](intensive-audit-2026-10-21/sweep-after-fixes.log), [final follow-up recheck](intensive-audit-2026-10-21/followups-final-recheck.log), [disposable recheck cleanup](intensive-audit-2026-10-21/final-recheck-cleanup.json).

**External-service setup was explicitly deferred by the user.** Document storage/scanning, recovery email and actual WhatsApp delivery remain unconfigured. In-app date reminders do not depend on those services. Language and interest/topic preferences remain descriptive; no translation or marketing campaign automation is claimed.

## Follow-up fixes — 21 October 2026

The financial amount and photo-upload findings below were subsequently fixed locally:

- Policy sum assured, loan amount/outstanding/EMI, and investment amount now use the shared nonnegative money validator in both the form and API. Blank optional amounts, zero, decimals and Indian currency formatting remain supported.
- Unchanged legacy financial rows remain editable alongside unrelated details. Changed invalid amounts are rejected. The form validates its separately managed onboarding profile using changed values, matching the server's preservation rule.
- Photo upload is disabled with an explanation when document services are unavailable. JPG/PNG and the advertised 10 MB limit are enforced when selecting files.
- A failed upload after a successful client save now keeps a single explicit partial-success message; it is no longer replaced with a generic success toast.
- Added `npm run test:client-form`: fixture-based Playwright regressions for invalid/corrected amounts, legacy rows, disabled upload, file type/size limits and failed-upload feedback. These are UI checks, not a successful external storage round trip.

Verification at this first fix stage: type checking, lint, production build and the focused browser scenarios passed. The focused schema/API run passed 13 tests (69 unrelated tests excluded), including create/edit validation and legacy preservation. Subsequent full-suite and application results are recorded above.

## Environment and data isolation

- Existing application: web port 5177, API port 4007, configured MongoDB connection.
- API integration tests used the configured separate test database, protected by the test configuration's `_test` suffix and different-database checks.
- Writing browser suites used a second API/web pair on ports 4008/5178, newly generated databases named `parvath_audit_<random>_test`, and synthetic workspaces/accounts.
- SMTP, WhatsApp credentials, and document services were disabled in the disposable browser environment. No external messages were sent.
- The audit harness removes its disposable databases after each run. Existing CRM records and account credentials were not edited.
- Initial audit scripts were kept in `/tmp/parvath-intensive-audit`. Application changes and repository regression tests were subsequently added during the follow-up fixes; no commit or deployment was performed.

## Executed checks

| Check | Result | Meaning |
| --- | --- | --- |
| TypeScript | PASS | API and web type checking |
| ESLint | PASS | Repository lint script |
| Production build | PASS | API compilation and Vite production build |
| API/domain suite, normal 20-second timeout | 74 passed, 3 timed out | 77 total tests; timeout failures were session-check repetition and two chunked-import cases |
| Focused rerun of those three tests, 120-second timeout | 3 passed | 57 unrelated cases were intentionally skipped in this focused run; approximately 76 seconds total |
| Fixture UI suite, preceding run in this chat | PASS | 23 routes × four widths × light/dark themes, plus interactive checks; mocked API responses |
| Live browser journeys | 21 checks passed | Real API/database writes and readback, role refusals, imports and financial workflows |
| Live full browser sweep | 14/16 sections passed on first run; remaining 2 passed with explicit waits | Original script has asynchronous timing assumptions; no application change was needed for the focused recheck |
| Extended client-form field audit | 45 field/profile groups persisted | Entered through the actual edit form, saved, then checked through authenticated API readback |

The API suite did not pass unchanged on its first run. Increasing the timeout was a diagnostic test invocation, not an application fix or a committed test-configuration change.

## Working in exercised live workflows

- Sign-in, sign-out, incorrect password handling, protected navigation, and deactivated-user refusal.
- Client creation/editing, required fields, invalid names/phone/email/dates, draft recovery, duplicate checks, individual and business onboarding, and linked business contacts.
- Lead creation, edits, stage changes, stage history, and accepted-sale conversion into a linked product application.
- Follow-up scheduling in India time, rescheduling, completion, outcomes, and notes.
- Financial events, payments, outstanding amounts, explicit renewal confirmation, next recurring renewal, and administrator corrections/reversals/cancellation/product closure.
- CSV preview, invalid/duplicate rows, import commit, repeat-safe import, chunking and recovery after a simulated interruption.
- Provider/plan management, product client registers, calendar navigation, search, reports/CSV exports, notifications, settings, responsive layouts, and theme controls in the sweep's passing sections.
- Administrator/Adviser/Operations permissions, provisioning and deactivation in synthetic accounts.

These statements describe the cases exercised, not all possible values, browsers, roles or concurrent workloads.

## Client fields checked by actual UI save and API readback

Each scalar below was entered in the edit form and compared with the persisted value. Row groups were compared recursively, including all row columns. Phone normalization and date storage were checked.

| Form area | Fields / groups verified |
| --- | --- |
| Basic | Name, phone, email, DOB, gender, occupation |
| Family | Marital status, spouse name/DOB, wedding date, dependents, child name/DOB/relationship |
| Professional | Company, designation, industry, experience |
| Address | Residential address, city, state, PIN, same-address toggle, separate permanent address |
| Relationship | Source, referred by, client category, client-since date |
| Financial | Annual income, monthly/total savings, risk profile, investment horizon, financial goals |
| Reported policies | Type, provider, policy name, sum assured, renewal date |
| Reported loans | Type, bank, amount, outstanding, EMI, closure date |
| Reported investments | Type, provider, amount, maturity date, expected return |
| Preferences | Communication channels, preferred contact method/time/day, language, engagement topics, interests, both contact-restriction flags |
| Important dates | Type, date, description |

The optional initial follow-up and business registration/industry/contact linkage were checked by the separate live journeys. Profile-photo handling is described under findings.

## Stored information and manual actions

These inputs/actions are implemented, but their behavior is narrower than a user might assume:

| Feature | Actual behavior |
| --- | --- |
| Existing insurance / loans / investments in onboarding | Saved and reloaded as reported profile details. The field test confirmed zero tracked products were created. Create a linked product and financial event separately for operational tracking. |
| Preferred time/day, language, contact restrictions | Stored preferences. No backend enforcement of `noCallsDuringHours` or `whatsappOnly`, and no automatic scheduling from preferred time/day, was found. |
| Engagement topics and interests | Stored descriptive preferences; not an automated campaign scheduler or proof of consent. Consent is recorded separately. |
| Important dates and wedding date | Saved, but the calendar currently builds its items from financial events, follow-ups and client birthdays, not these onboarding dates. |
| Open WhatsApp / Call / Email | Records an opening action and opens `wa.me`, `tel:` or `mailto:`. It does not prove delivery or a completed conversation. |
| Relationship health | A rule-based score from recent verified contact, contact completeness, active products and overdue follow-ups. It is not an AI assessment. |
| Delete an in-use provider/plan | Intentionally blocked to protect linked records. Moving/removing linked client products is not currently supported by that dialog. |

## Unavailable external services

Current `.env` has no SMTP URL, S3 access/secret keys, ClamAV host, or WhatsApp phone-number ID/access token.

| Capability | Status |
| --- | --- |
| Document upload, virus scan and clean download | Unavailable until storage/scanning are configured; live successful end-to-end file lifecycle was not verified. |
| Profile photo persistence | Uses the same document upload service; a local preview is not proof of saved/uploaded media. |
| Password recovery email | Returns an explicit unavailable error without SMTP. Actual inbox delivery was not tested. |
| WhatsApp broadcast | Disabled/unavailable without Meta credentials. Provider success/failure paths in API tests use mocks; real delivery was not tested. |

## Findings

1. **Financial-profile amount validation is too permissive.** Actual API requests accepted negative policy sum assured, nonnumeric loan amounts, negative loan outstanding/EMI, and nonnumeric investment amounts with HTTP 201. These row values use the general text schema. Monthly and total savings have stricter amount validation; operational payments/events have separate validation. The accepted bad rows were synthetic and removed in the disposable database.
2. **A future wedding date is accepted.** `2999-01-01` was accepted with HTTP 201. Birth dates and client-since dates have explicit past-date checks. Whether future wedding dates are allowed should be decided as a product rule.
3. **Photo failure feedback is overwritten (reproduced).** A synthetic PNG upload returned HTTP 503, while the visible toast said “Client details updated.” The form shows a photo upload error toast inside its catch block, then immediately shows a generic client-save success toast. The upload button also remains selectable while document integrations are unavailable. Source: `apps/web/src/ClientForm.tsx`, client-save/photo branch. See [captured feedback](intensive-audit-2026-10-21/photo-failure-feedback.png).
4. **Contact restrictions are informational.** A saved “WhatsApp only” or “don't call during working hours” preference does not enforce those restrictions in backend communication/scheduling paths.
5. **Important dates do not feed the calendar.** Saving an anniversary/custom date does not create a calendar item or reminder.
6. **Default integration-test timeouts are inadequate for the configured remote database in this run.** Three 20-second timeouts passed with a 120-second diagnostic limit; this is a test reliability/performance finding, not proof of a business-logic defect.

## Browser sweep diagnostics

The first lead failure observed a source-column count of 10 while expecting 9 after the destination-column count had already updated. The first renewal failure waited for search to narrow rows after switching from Cancelled to All. Both scripts can observe different asynchronous queries at different stages of completion.

A diagnostic copy of the sweep adds explicit waits for the source-column count after dragging and for the All tab to load its API-reported total before capturing the search baseline. **Both sections passed on a fresh synthetic workspace with those waits.** This reproduces their functional behavior successfully and identifies premature assertions in the original sweep. Original project test scripts were not changed.

## Retained evidence

- [Field persistence and invalid-input results](intensive-audit-2026-10-21/fields-result.json)
- [Field audit console output](intensive-audit-2026-10-21/fields.log)
- [21 live journey results](intensive-audit-2026-10-21/journeys.log)
- [Original sweep output](intensive-audit-2026-10-21/sweep-first-run.log)
- [Focused sweep recheck](intensive-audit-2026-10-21/sweep-focused-recheck.log)
- [Disposable audit completion/cleanup record](intensive-audit-2026-10-21/disposable-audit-result.json)

## Limits

This audit does not establish that every possible field value or role combination works. It does not include external provider delivery, a successful scanned document round trip, load testing, disaster recovery, penetration testing, or complete accessibility certification. Fixture UI screenshots alone do not demonstrate database persistence. Old verification documents describe previous runs and were not treated as current pass evidence.
