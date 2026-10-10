# Full-application browser sweep

`npm run test:sweep` (script: `scripts/browser-sweep.mjs`) opens every part of the workspace in Chromium with a realistic synthetic dataset and uses the controls a person would use. It **writes, edits and deletes synthetic records**, so point it at a development or test database, never production.

## Setup

- Start the API and web app (or a second copy against a test database, as described in [browser-journeys](browser-journeys.md)).
- Sign-in: `JOURNEY_EMAIL` and `JOURNEY_PASSWORD` (an Administrator; `ADMIN_EMAIL` / `ADMIN_PASSWORD` also work). `TARGET_URL` defaults to `http://localhost:5177`.
- An empty workspace is seeded first (`scripts/browser-sweep-seed.mjs`): 60 individuals, 4 businesses, 40 leads across the stages, 12 products with renewals due at different distances (one overdue), follow-ups due overdue, today and later, plus notes, consent, a relationship and a logged call.
- `--only=clients,leads` runs named sections. Sections can be re-run on the same data.
- The password is changed and changed back, so the account ends as it began. Do not run it against an account whose password you cannot restore.

## What each section checks

| Section         | Covers                                                                                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| dashboard       | Tiles and their links, attention tabs, birthdays, month calendar, opening a record                                                                          |
| search          | Global search finds and opens a client; a miss says so                                                                                                      |
| clients         | Tabs and counts, search, location filter and reset, loading all rows, row actions reachable, bulk status update, delete with cancel and confirm, CSV export |
| client-profile  | Tabs, documents reported unavailable, health explanation, adding a note, quick actions                                                                      |
| leads           | Per-stage totals, hot-lead filter, dragging a card to another stage, Won/Lost sent to the lead page, folding, lead page                                     |
| renewals        | Every range tab against the API, search, provider filter, reset, export, opening an event                                                                   |
| followups       | Every range tab, channel filter, search, completing a task with an outcome                                                                                  |
| catalogue       | Add and rename a provider, add a plan, filters, search, deleting is refused while in use and allowed once free                                              |
| product-clients | Status tabs, search, category filter, creating a product record from the form                                                                               |
| calendar        | Month navigation, Day/List/Month views, filters, a busy day, search, Today                                                                                  |
| engagement      | WhatsApp broadcast reported unavailable and cannot send; recording a conversation                                                                           |
| reports         | Sections, all three CSV exports                                                                                                                             |
| notifications   | Page and bell                                                                                                                                               |
| settings        | Profile name (needs current password), a wrong password refused, password changed and restored, dark/light persisted, team list                             |
| auth            | Sign out, protected pages redirect, wrong password message, reset email reported unavailable, missing-page message                                          |
| responsive      | 390 px and 768 px on every main page: no sideways overflow and no error panels                                                                              |

Throughout, it fails on any page error, console error or API call that fails without being the point of the check.

## Cleanup

Records are named `Sweep Client NN`, `Sweep Business N`, `Sweep Disposable <n>` with `@example.test` emails, and the providers `Sweep Insurer` / `Sweep Bank`. Remove them with `npm run demo:cleanup -- --confirm-db=<MONGODB_DB>`.

## Not covered

Document upload/scan/download, reset email and WhatsApp delivery (they need credentials), and anything that needs a time-based job to run.
