# Workspace design refresh

The authenticated workspace uses `apps/web/src/workspace.css` and `apps/web/src/reference-layout.css` for shared surfaces, typography, navigation, cards, tables, filters, forms, and responsive layouts. Styles are scoped to `.app-shell.workspace-redesign` so the login design remains separate.

The sidebar opens expanded on desktop and can be collapsed with its pin button. On smaller screens it uses the existing accessible drawer. The dashboard now presents a daily brief, consistent metrics, quick actions, priorities, calendar, recent activity, and an outlook based on the existing API's 30-day financial-event bins. Reports uses the same underlying bins. No financial definitions or API write paths were changed.

## Validation

Run the web build with `npm run build -w apps/web`. With the web dev server running, run `npm run test:ui`, or `TARGET_URL=http://localhost:5178 npm run test:ui` for another port.

The UI check intercepts API requests with synthetic fixture responses and rejects writes. It covers 21 screens in light and dark mode at widths of 1440, 1280, 768, and 390 pixels. Screenshots are written to a unique temporary folder, with its path printed at completion. It also checks navigation pinning, global search, dashboard tabs, client selection and filters, lead views, required-field validation, and mobile drawer navigation. It also opens six dialogs at desktop and mobile widths to verify circular close buttons, choice-label alignment, dialog bounds, and the client popup’s scrolling body and visible footer. Use `UI_INTERACTIONS_ONLY=1` to run only the interaction checks.

These checks validate layout and UI behavior; they do not validate authentication, database persistence, or API permissions. The existing browser journeys remain available for checks against a configured local account.

Mobile forms and filters stack into one column. Radio and checkbox labels sit beside their controls with consistent gaps. Dialogs share the compact circular close button; the client popup scrolls only on mobile and keeps its action footer visible.

Products opens with seven category cards and organization-scoped client counts. Category workspaces show linked client policies/accounts, with product option, status, and search filters. Add client selects an existing client or creates one and returns to the selected category/option. Administrators can add provider product options directly from Products. All records remain accessible under /products/records.

Provider management is separate under /providers. A provider is a company (insurer, lender, or investment provider); a product is a category-specific plan linked by providerId. Product creation selects an existing provider. Provider creation does not create a product or client policy. Category screens offer distinct Product plans and Providers controls.
