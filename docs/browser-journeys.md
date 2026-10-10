# Browser Journeys

Run with `npm run test:browser -- journeys` (script: `scripts/browser-journeys.mjs`). It drives the real web app and API in Chromium and **writes synthetic records**, so point it at a development or test database, never a production one.

## Setup

- Start the API and the web app (`npm run dev`), or start a second copy against another database:
  `API_URL=http://127.0.0.1:4108 WEB_PORT=5188 npm run dev -w apps/web`, with the API on that port using
  `MONGODB_DB` set to a test database and `APP_ORIGIN=http://localhost:5188`.
- Give it a sign-in: `JOURNEY_EMAIL` and `JOURNEY_PASSWORD` (or `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`). `npm run admin:create` makes an administrator.
- `TARGET_URL` is the web app, `http://localhost:5177` by default. `HEADLESS=0` shows the browser.
- Do **not** set `DEMO_DATE`: dates are computed in Asia/Kolkata from the real clock.

## What it checks

1. Sign-in and navigation.
2. Add client: empty fields are named ("Enter the full name."), a short name, bad phone and email, an impossible date (31/02/2020) and a future birth date block **Next**, and the messages clear as values are corrected.
3. Draft recovery keeps the typed values and the date.
4. Detail sections: dependents (`-2`), spouse birth date in the future, PIN code (`ABC`) and savings (`-500`) block **Next** and stay on their section; valid values (`₹ 25,000`, `600001`) are accepted.
5. Review: an initial follow-up with no date or note is refused, then created; the saved client carries the dates, details and follow-up.
6. Edit client: an invalid dependent count blocks **Save Changes**; the fix saves and unchanged details stay as they were.
7. Lead: create, edit, move to _Contacted_, and find it in that board column whose count equals the stage's total from the API.
8. Follow-up: scheduled at 11:00 India time (stored as 05:30 UTC), rescheduled and completed.
9. Sale conversion: moving a lead to _Won_ opens the acceptance dialog; it does nothing until the acceptance box is ticked, then creates the linked product (status _Application_). The insurer and plan it uses are created through the API as setup.
10. Financial event, payment and renewal: add an _Insurance renewal_ (₹24,500, repeating every 12 months), record the full payment (the event stays _Pending_), then confirm it. The payment history is kept and the next renewal is scheduled a year later for the same amount.
11. CSV import: the preview flags a bad phone number and a duplicate of an existing contact and writes nothing; importing adds the 2 valid rows ("2 clients added · 2 rows skipped"); importing the same file again offers 0 rows.

12. Business onboarding: choosing _Business_ hides the birth-date field; an empty business name is named ("Enter the business name."); the registration number and industry are saved; and an existing client is linked as a business contact from the profile.
13. Administrator corrections on a product with two _Premium payment_ events: editing an event's due date and amount; the server refuses an amount below what is already paid; an event with a payment cannot be cancelled; reversing the payment keeps both rows and brings the paid total to ₹0; the same reference cannot be reused on that event; the event can then be cancelled with a reason; and closing a product cancels its remaining unpaid events and removes _Add Event_.
14. Roles: the administrator creates two members in _Settings → Team_ and sets their roles to Adviser and Operations. Each then signs in separately:
    - **Adviser**: no member or provider controls; can create clients and leads, import, delete and export; the server refuses provider, member and job administration; a lost lead cannot be reopened ("An administrator must reopen…").
    - **Operations**: no Add Client, Import, Add Lead, Edit, Delete or provider controls; can record a payment, add a follow-up and a note; the server refuses client and lead creation, deletion, stage changes, payment reversal, event correction and cancellation, export, jobs and providers; saving from the edit address typed by hand shows "Your role does not allow this action" and changes nothing.
    - **Deactivation**: when the administrator deactivates the Operations member, that session gets 401 and signing in again does not reach the dashboard.

Every run writes `docs/verification/browser-journeys.json` with the checks that passed. A failure saves `docs/verification/journey-error.png` and prints the page text.

## Cleanup

Records are named `Journey Client <7 digits>` / `Journey Import <7 digits>` with `@example.test` emails, the business is `Journey Business <7 digits>`, the insurer is `Journey Insurer <7 digits>`, and the members are `adviser.<7 digits>@example.test` and `operations.<7 digits>@example.test`. Remove them (and their leads, follow-ups, products, payments and other generated records) with:

```
npm run demo:cleanup -- --confirm-db=<the MONGODB_DB you ran against>
```

The older "not covered" items are now covered. Still outside the browser journeys: sales-pipeline edge cases such as reopening a lost lead as an administrator, and document upload, email and WhatsApp (they need credentials).
