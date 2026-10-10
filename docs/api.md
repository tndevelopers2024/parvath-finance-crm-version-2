# API guide

Machine-readable OpenAPI: `/api/openapi.json` and `docs/openapi.json`. Regenerate with `node --import tsx scripts/generate-openapi.ts`.

All endpoints are prefixed `/api`. Success is `{data, meta?}`; failure is `{error:{message,details?,requestId}}`. List metadata contains total/page/limit where applicable. Pagination is bounded to 100, defaults to 10 clients and 50 operational records. Directory sorting permits `name|createdAt` and `asc|desc`. Search is case-insensitive for textual names/emails/identifiers; phone search uses normalized values.

## Session

1. `GET /auth/csrf` establishes an anonymous cookie and returns `data.csrf`.
2. `POST /auth/login` with `{email,password}` and `X-CSRF-Token`; keep cookies, replace the CSRF token with the response's token.
3. `GET /auth/me` returns current role/workspace/timezone and CSRF token.
4. Send the token for all POST/PATCH actions, including sign-out.

Forgot password accepts `{email}` and requires configured SMTP. Reset accepts `{token,password}`. Account PATCH requires `{name,currentPassword,newPassword?}`.

## Clients and import

Create/update fields are described in the shared Client schema. PATCH requires `version`. Missing optional data is not guessed. Duplicate phone/email returns 409 with authorized candidates; distinct reviewed identities require `allowDuplicate:true` and `duplicateReason`. Unchanged shared contact details do not repeatedly prompt during edits.

Client links and details: `/clients/{id}`, `/clients/{id}/relationships` (`{clientId,type}`), `/clients/{id}/notes` (`{body}`), `/clients/{id}/consents` (`{channel,granted,source}`). Bulk status changes require `{ids,status}` and edit permission. `DELETE /clients/{id}` deletes the client and cascades related contacts, notes, documents, and records (requires edit/admin permission). Stored document files are removed from object storage only after the database transaction commits; a storage failure is logged and does not fail the request.

CSV template: `/clients/template`. Preview POST `/clients/import/preview` with `{csv}`. The response includes import id and `{row,data,error}` entries. Row rules: blank `kind`/`source` cells take the defaults (`Individual`/`Direct`); `dob` is `YYYY-MM-DD`, `DD-MM-YYYY` or `DD/MM/YYYY` (stored as ISO; impossible dates are rejected); Indian mobiles must start 6-9 after an optional `+91`/`91`/`0` prefix; a row repeating an earlier row's phone or email (case-insensitive) in the same file is flagged. The same phone rule applies to `POST /clients` and `PATCH /clients/{id}` input (stored numbers are not re-validated).

Commit POST `/clients/import/{id}/commit` creates clients in chunks of 20 rows, each chunk in its own transaction that also advances the job's progress, so a row is created at most once however often the call is repeated. One request processes chunks for up to ~20 s; if rows remain it returns `data.state = "Partial"` and the caller commits again to continue. If a chunk fails, earlier chunks stay saved and the response has `data.state = "Failed"` with `result.lastError`; committing again resumes. A job still `Processing` (fresh) returns 409. Response `data` is the import job: `state` is `Completed`, `Partial` or `Failed` and `result` is `{total, processed, created, skipped, failed, errors:[{row,error}], chunkSize, updatedAt, lastError?}`. `skipped` counts preview-flagged and commit-time duplicate rows, `failed` rows whose stored data no longer validates; `errors` lists both. Repeat commits of a completed import return the stored result. No overwrite mode exists.

## Opportunities

Create: `{clientId,requirement,ownerId,priority,source,notes?,nextAction,nextFollowUp?,stage?}`. Closed initial stages are rejected. Stage action: `{stage,version,reason?}`. Lost and reopening require a reason. Won must use conversion rather than direct stage movement.

`POST /leads/{id}/convert`: `{version,accepted:true,definitionId,identifier}`. Client acceptance is recorded, the existing identity is reused, and one product Application is linked through a unique opportunityId. Retried conversion returns that same product.

## Products and financial events

Product schemas distinguish premiumMinor, principalMinor, expectedCommissionMinor and structured subtype details. All money is an exact nonnegative integer string in paise. Product identifiers are unique inside the workspace.

Create event: `{productId,type,dueDate,amountMinor,recurrenceMonths?}`. The backend assigns amountMeaning and validates event category. Dates are valid ISO calendar dates, not timestamps. A `Closed` product returns 400. A product holds one event per type and due date; a clash returns 409 naming the date, and says so when the event occupying it is cancelled.

Event status is `Pending`, `Confirmed` or `Cancelled`. Only pending events count as due, overdue, premium due or expected revenue. `GET /renewals?range=` accepts All (every status), Today, Tomorrow, Next 7 Days, Next 30 Days, Overdue (pending only), Renewed (confirmed) and Cancelled; computed `timing` is `Cancelled` for a cancelled event. Optional `from` and `to` (`YYYY-MM-DD`, inclusive due dates) may be given together or alone and narrow the range rather than replace it; an invalid date is 422 and `from` after `to` is 400.

Balances: `GET /renewals` and `GET /renewals/{id}` return `paidMinor` (net of reversals) and `outstandingMinor` (amount less net payments, never negative, `0` once the event is confirmed or cancelled) on every event. `GET /dashboard` returns `outstandingMinor` on each entry of `events`, `premiumDueMinor` (outstanding on pending premium events due in [today, today + 30 days)) and `premiumOverdueMinor` (outstanding on pending premium events due before today). `renewalsDue` remains a count of events in the 30-day window.

Correct event: `PATCH /renewals/{id}` with `{version,dueDate?,amountMinor?,recurrenceMonths?}` and edit permission. At least one field is required; an omitted field is unchanged and `recurrenceMonths:null` makes the event one-time. Product and type cannot be changed. Only pending events can be corrected (400 otherwise). The amount cannot go below the payments already recorded (400), a loan review stays at zero, and a due date already used by another event of the same type on the product returns 409 naming it. A stale `version` returns 409. Moving the due date cancels the event's pending reminders; the count is returned in `meta.remindersCancelled`. The change is written to the activity log.

Cancel event: `POST /renewals/{id}/cancel` with `{reason,version}` and edit permission. Only a pending event whose payments net to zero (none recorded, or every one reversed) can be cancelled (400 otherwise). Pending reminders are cancelled and no next recurrence is created. Repeating the call on a cancelled event returns it unchanged. The reason is kept in the activity log and returned as `cancelReason` (with `cancelledAt`) by `GET /renewals/{id}`. A cancelled event cannot be paid, confirmed, reminded or reopened, and keeps its type and due date reserved on the product.

Closing a product: a `PATCH /products/{id}` that sets status `Closed` cancels, in the same transaction, that product's pending events whose payments net to zero (reason "Product closed") and returns `cancelledEvents` and `keptEvents`. Part-paid events stay pending. Confirming an event on a closed product does not create a next recurrence.

Record payment: `POST /renewals/{id}/payment` with `{reference,amountMinor}`. Repeating the same reference with the same amount is idempotent and returns the existing payment; the same reference with a different amount returns 409, as does a reference whose payment has been reversed. Overpayment (against the amount less net payments), zero/negative amount, and payment to a confirmed or cancelled event are rejected. References starting with `Reversal of ` are reserved (400).

Reverse payment: `POST /renewals/{id}/payments/{paymentId}/reverse` with `{reason}` and edit permission. Only on a pending event (400 when confirmed or cancelled). The reversal is its own payment row with the negated amount and reference `Reversal of <original reference>`; the original row is kept. Repeating the call returns the existing reversal, a reversal row cannot be reversed (400), and a payment that does not belong to the event is 404. The event version is bumped and a concurrent change returns 409. The reason is kept in the activity log (action `payment-reversal`). A reversed reference cannot be recorded again on the same event.

Confirm: `POST /renewals/{id}/complete` with `{version}`. Requires net payment/receipt covering the event, except a no-payment review. Confirmation and next-event creation are atomic and safe to retry. The next due date keeps the day-of-month of the first event of the series and is clamped to the last day of a shorter month (31 Jan, 28 Feb, 31 Mar; 29 Feb returns in the next leap year); an event whose date was moved by hand starts its own day-of-month. Historical event amount/date/product ownership remains intact.

Reminder: `{runAt}` to `/renewals/{id}/reminder`. This schedules an in-app reminder; it does not send unconfigured WhatsApp/email messages. Same event/time deduplicates. Jobs and failures are visible to administrators.

## Follow-ups and communication

`GET /followups` accepts `range`, `channel`, `clientId`, `q` and pagination, plus optional `from` and `to` (`YYYY-MM-DD`, inclusive, either one alone). They are workspace calendar days (Asia/Kolkata) matched against the `dueAt` instant, and narrow the other filters; an invalid date is 422 and `from` after `to` is 400.

Create follow-up: `{clientId,ownerId,channel,dueAt,priority,notes,opportunityId?,productId?,eventId?}`. Optional links must belong to the same client and workspace. PATCH edits/reschedules pending tasks with `version`.

Complete/cancel: `{version,state:'completed'|'cancelled',outcome,nextDueAt?}`. Outcomes: Connected, No answer, Documents requested, Meeting arranged, Not needed. Optional nextDueAt creates the next task in the same transaction. Task state is distinct from computed timing.

Communication events accept `{clientId,channel,event,body?}` where event is Conversation opened, Message prepared, or Manual outcome. The API does not accept an unverified sent/delivered/replied event. A deep link cannot complete a task.

## Documents

`POST /clients/{id}/documents`: multipart field `file`, optional `purpose=Photo`. Allowed signatures/extensions: PDF, PNG, JPEG; 10 MB maximum; photos must be images. Storage missing returns 503. Successful storage creates quarantined metadata and a durable scan job. `GET /documents/{id}/download` is session-authorized controlled streaming, returns 409 until clean, and never exposes a public object URL.

## Administration and exports

Members: GET `/members`; admin POST `{name,email,role,password}`; admin PATCH `/members/{id}` with `{role}`. Existing account emails require manual identity coordination rather than cross-workspace auto-linking. Self-demotion is forbidden.

Catalogue POST: `{name,category,provider}`. Notification read: POST `/notifications/{id}/read`. Job retry: POST `/jobs/{id}/retry`, failed jobs only. Export: `/reports/export?module=clients|renewals|followups`; returns at most 10,000 workspace records, with auditable export activity. Exports are workspace-wide; use directory/list filters for interactive review.
