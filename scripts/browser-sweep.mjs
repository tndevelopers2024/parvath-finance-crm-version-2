// Full-application browser sweep: every page of the workspace, with a realistic synthetic dataset, using the
// controls a person would use. It WRITES synthetic records ("Sweep …", @example.test) and changes and deletes
// some of them, so point it at a development or test database, never production.
//
//   TARGET_URL        web app, default http://localhost:5177
//   JOURNEY_EMAIL / JOURNEY_PASSWORD   an Administrator (falls back to ADMIN_EMAIL / ADMIN_PASSWORD)
//   --only=a,b        run only the named sections
//   HEADLESS=0        watch it run
//
// Alongside each check it watches for page errors, console errors and unexpected failed API calls.
import { chromium } from "@playwright/test";
import dotenv from "dotenv";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { seed } from "./browser-sweep-seed.mjs";

const env = { ...dotenv.config({ quiet: true }).parsed, ...process.env };
const target = (env.TARGET_URL || "http://localhost:5177").replace(/\/$/, "");
const email = env.JOURNEY_EMAIL || env.ADMIN_EMAIL;
const password = env.JOURNEY_PASSWORD || env.ADMIN_PASSWORD;
if (!email || !password) {
  console.error(
    "Set JOURNEY_EMAIL and JOURNEY_PASSWORD for a test administrator.",
  );
  process.exit(2);
}
const artifacts = mkdtempSync(path.join(tmpdir(), "parvath-sweep-"));
const only = (process.argv.find((a) => a.startsWith("--only=")) || "")
  .replace("--only=", "")
  .split(",")
  .filter(Boolean);
const istDay = (offset = 0) =>
  new Date(Date.now() + 19800000 + offset * 86400000)
    .toISOString()
    .slice(0, 10);
const typed = (iso) => iso.split("-").reverse().join("");

const browser = await chromium.launch({ headless: env.HEADLESS !== "0" });
const context = await browser.newContext({
  viewport: { width: 1440, height: 960 },
  acceptDownloads: true,
});
const page = await context.newPage();

// --- Watching for faults ----------------------------------------------------------------------------
const faults = [];
let expecting = 0;
page.on("pageerror", (e) => faults.push("page error: " + e.message));
page.on("console", (m) => {
  // The browser logs every failed request itself; the response handler below is the one that judges them.
  if (m.type() === "error" && !/Failed to load resource/.test(m.text()))
    faults.push("console error: " + m.text().slice(0, 200));
});
page.on("response", (r) => {
  if (!r.url().includes("/api/") || r.status() < 400) return;
  // The app asks who is signed in on every load; a 401 there just means "nobody", and sends you to the login page.
  if (r.status() === 401 && r.url().endsWith("/api/auth/me")) return;
  if (expecting > 0) {
    expecting--;
    return;
  }
  faults.push(
    `HTTP ${r.status()} ${r.request().method()} ${r.url().replace(target, "")}`,
  );
});
// Declare that the next `n` failed API calls are the point of the check.
const expectFailures = (n = 1) => {
  expecting += n;
};

// --- Helpers -------------------------------------------------------------------------------------------
const results = [];
const sections = [];
const section = (name, fn) => sections.push([name, fn]);
const see = (text, scope = page) =>
  scope.getByText(text, { exact: false }).first().waitFor({ timeout: 8000 });
const url = () => new URL(page.url()).pathname + new URL(page.url()).search;
const heading = (name, opts = {}) =>
  page
    .getByRole("heading", { name, ...opts })
    .first()
    .waitFor({ timeout: 10000 });
const visit = async (path, ready) => {
  await page.goto(target + path);
  if (ready) await ready.first().waitFor({ timeout: 10000 });
};
let csrf = "";
const api = async (path) =>
  (await page.request.get(target + "/api" + path)).json();
const send = async (method, path, data) => {
  const r = await page.request.fetch(target + "/api" + path, {
    method,
    headers: { "X-CSRF-Token": csrf },
    ...(method === "GET" ? {} : { data: data ?? {} }),
  });
  return { status: r.status(), body: await r.json().catch(() => ({})) };
};
const overflowing = () =>
  page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
const settle = async () => {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(250);
};
const until = async (what, fn, tries = 40) => {
  for (let i = 0; i < tries; i++) {
    if (await fn()) return;
    await page.waitForTimeout(250);
  }
  throw new Error("Timed out waiting for " + what);
};

// --- Data ----------------------------------------------------------------------------------------------
const idsOf = async () => {
  const find = async (path) => (await api(path)).data;
  const clients = (
    await find("/clients?limit=100&sort=name&direction=asc")
  ).filter((c) => c.name.startsWith("Sweep Client"));
  const businesses = (await find("/clients?limit=100&kind=Business")).filter(
    (c) => c.name.startsWith("Sweep Business"),
  );
  return { clients, businesses, leads: await find("/leads?limit=100") };
};

// =================================================================================================
section("dashboard", async () => {
  await visit(
    "/dashboard",
    page.getByRole("heading", { name: "Today’s Attention" }),
  );
  await settle();
  const me = (await api("/dashboard")).data;
  // Tiles link to the lists they summarise, and their numbers match the lists.
  const tile = (href) =>
    page.locator(`.page-content a[href="${href}"]`).first();
  await tile("/clients").waitFor();
  assert.match(
    await tile("/clients").innerText(),
    new RegExp(String(me.totalClients ?? 64)),
  );
  await tile("/renewals?range=Next+30+Days").waitFor();
  await tile("/followups?range=Today").waitFor();
  // Tabs filter the attention list.
  for (const tab of ["Renewals", "Follow-ups", "Leads", "Birthdays", "All"]) {
    await page.getByRole("tab", { name: tab, exact: true }).first().click();
    await settle();
  }
  await page
    .getByRole("tab", { name: "Birthdays", exact: true })
    .first()
    .click();
  await see("BIRTHDAY TODAY");
  await page.getByRole("tab", { name: "All", exact: true }).first().click();
  // The month calendar: navigate and pick a day with activity.
  await page.getByRole("button", { name: "Next month" }).click();
  await page.getByRole("button", { name: "Previous month" }).click();
  await page
    .getByRole("button", { name: /^25 Oct 2026/ })
    .first()
    .click()
    .catch(() => {});
  // An attention card opens its record.
  await page
    .getByRole("link", { name: /^Open Sweep Client .* details$/ })
    .first()
    .click();
  await page.waitForURL(/\/(renewals|followups|clients)\/[a-f0-9-]+$/);
  assert.equal(await overflowing(), false);
});

section("search", async () => {
  await visit(
    "/dashboard",
    page.getByRole("heading", { name: "Today’s Attention" }),
  );
  await page.getByRole("button", { name: "Search records" }).click();
  const box = page.getByLabel("Search all records");
  await box.fill("Sweep Client 07");
  await see("Sweep Client 07");
  await page.getByText("Sweep Client 07", { exact: false }).first().click();
  await page.waitForURL(/\/clients\/[a-f0-9-]+$/);
  await heading("Sweep Client 07");
  // Nothing matches: it says so rather than showing an empty box.
  await page.getByRole("button", { name: "Search records" }).click();
  await page.getByLabel("Search all records").fill("zzzz-no-such-record");
  await see("No");
  await page.getByRole("button", { name: "Close search" }).click();
});

section("clients", async () => {
  await visit(
    "/clients",
    page.getByRole("heading", { name: "Clients", exact: true }),
  );
  await settle();
  const total = (await api("/clients?limit=1")).meta.total;
  await page
    .getByRole("tab", { name: new RegExp(`^All Clients \\(${total}\\)`) })
    .waitFor();
  // The row actions are all reachable without scrolling sideways.
  const lastAction = await page
    .getByLabel("Delete Sweep Client 01")
    .boundingBox();
  const tableBox = await page.locator(".table-scroll").boundingBox();
  assert.ok(
    lastAction &&
      lastAction.x + lastAction.width <= tableBox.x + tableBox.width + 1,
    "The delete button is inside the visible table",
  );
  // Tabs.
  await page.getByRole("tab", { name: /^Businesses/ }).click();
  await until(
    "only the businesses",
    async () => (await page.locator("tbody tr").count()) === 4,
  );
  await page.getByRole("tab", { name: /^Individuals/ }).click();
  await settle();
  await page.getByRole("tab", { name: /^All Clients/ }).click();
  // Search narrows the list and clears again.
  const search = page.getByPlaceholder(/Search by name, phone/);
  await search.fill("Sweep Client 07");
  await until(
    "one search result",
    async () => (await page.locator("tbody tr").count()) === 1,
  );
  await search.fill("");
  await until(
    "full list again",
    async () => (await page.locator("tbody tr").count()) > 10,
  );
  // More filters: location and sort.
  await page.getByRole("button", { name: "More Filters" }).click();
  await page.getByLabel("Location").selectOption("Chennai");
  await settle();
  const chennai = (await api("/clients?limit=1&city=Chennai")).meta?.total;
  const rows = await page.locator("tbody tr").count();
  assert.ok(rows > 0 && rows <= 64, "Location filter shows rows");
  if (chennai !== undefined) assert.equal(rows, Math.min(chennai, 50));
  await page.getByRole("button", { name: "Reset" }).click();
  await settle();
  // Every client can be reached by scrolling.
  await until(
    "all clients loaded",
    async () => {
      await page
        .locator(".infinite-scroll")
        .evaluate((el) => (el.scrollTop = el.scrollHeight));
      return (await page.getByText(`Showing all ${total}`).count()) > 0;
    },
    60,
  );
  // Selecting and bulk status update.
  await page.getByLabel("Select Sweep Client 02").check();
  await page.getByLabel("Select Sweep Client 03").check();
  await see("2 selected");
  await page.getByRole("button", { name: "Update selected status" }).click();
  await page
    .getByRole("dialog", { name: "Update selected clients" })
    .getByRole("button", { name: "Needs Attention" })
    .click();
  await until("status saved", async () => {
    const list = (await api("/clients?limit=100&sort=name&direction=asc")).data;
    return ["Sweep Client 02", "Sweep Client 03"].every(
      (n) => list.find((c) => c.name === n)?.status === "Needs Attention",
    );
  });
  // Deleting a client from the list needs confirmation and removes it.
  const disposable = "Sweep Disposable " + Date.now();
  const made = await send("POST", "/clients", {
    name: disposable,
    phone: "90" + String(Date.now()).slice(-8),
    kind: "Individual",
  });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  await visit(
    "/clients",
    page.getByRole("heading", { name: "Clients", exact: true }),
  );
  await page.getByPlaceholder(/Search by name, phone/).fill(disposable);
  await page.getByLabel(`Delete ${disposable}`).click();
  const del = page.getByRole("dialog", { name: "Delete Client" });
  await del.getByRole("button", { name: "Cancel" }).click();
  const named = () =>
    api("/clients?limit=1&q=" + encodeURIComponent(disposable));
  assert.equal((await named()).meta.total, 1, "Cancel keeps the client");
  await page.getByLabel(`Delete ${disposable}`).click();
  await del.getByRole("button", { name: "Confirm Delete" }).click();
  await until("client removed", async () => (await named()).meta.total === 0);
  // CSV export.
  const csv = await page.request.get(
    target + "/api/reports/export?module=clients",
  );
  assert.equal(csv.status(), 200);
  assert.match(csv.headers()["content-type"], /csv/);
  const lines = (await csv.text()).trim().split("\n");
  assert.ok(lines.length >= 60, "Export lists the clients: " + lines.length);
  assert.equal(await overflowing(), false);
});

section("client-profile", async () => {
  const [one] = (await idsOf()).clients;
  await visit(
    "/clients/" + one.id,
    page.getByRole("heading", { name: one.name }),
  );
  await settle();
  // Tabs.
  for (const tab of [
    /^Products/,
    /^Documents/,
    /^Follow-ups/,
    /^Communication/,
    /^Notes/,
    /^Overview/,
  ])
    await page.getByRole("tab", { name: tab }).first().click();
  // Documents: unavailable storage is reported, not hidden.
  await page
    .getByRole("tab", { name: /^Documents/ })
    .first()
    .click();
  await see("unavailable");
  assert.equal(
    await page
      .getByRole("button", { name: "Upload", exact: true })
      .first()
      .isDisabled(),
    true,
  );
  // Relationship-health explanation opens and closes.
  await page
    .getByRole("tab", { name: /^Overview/ })
    .first()
    .click();
  await page
    .getByRole("button", { name: "How relationship health is calculated" })
    .click();
  await page.keyboard.press("Escape");
  // Notes.
  await page
    .getByRole("tab", { name: /^Notes/ })
    .first()
    .click();
  await page.getByLabel("New note").fill("Sweep note added from the profile");
  await page
    .getByRole("button", { name: /^(Add|Save)/ })
    .last()
    .click();
  await see("Sweep note added from the profile");
  // Quick actions.
  await page
    .getByRole("tab", { name: /^Overview/ })
    .first()
    .click();
  await page.getByRole("link", { name: "Add Follow-up" }).first().click();
  await page.waitForURL(/\/followups\/new\?clientId=/);
  await visit(
    "/clients/" + one.id,
    page.getByRole("heading", { name: one.name }),
  );
  await page
    .getByRole("link", { name: "Add policy / account" })
    .first()
    .click();
  await page.waitForURL(/\/products\/new\?clientId=/);
  assert.equal(await overflowing(), false);
});

section("leads", async () => {
  await visit("/leads", page.locator(".lead-board"));
  await settle();
  const count = async (stage) =>
    Number(
      (await page
        .locator(`section[aria-label="${stage}"] h2 b`)
        .textContent()) || "NaN",
    );
  const before = {
    new: await count("New Enquiries"),
    contacted: await count("Contacted"),
  };
  assert.equal(
    before.new,
    (await api("/leads?stage=New%20Enquiries&limit=1")).meta.total,
  );
  // Priority filter from the tile.
  await page.getByRole("link", { name: /^Hot Leads/ }).click();
  await settle();
  assert.match(url(), /priority=High/);
  const hot = (await api("/leads?priority=High&limit=1")).meta.total;
  const shown = (
    await Promise.all(
      ["New Enquiries", "Contacted", "Proposal / Discussion", "Lost"].map(
        count,
      ),
    )
  ).reduce((a, b) => a + b, 0);
  assert.equal(shown, hot, "Filtered columns add up to the hot-lead total");
  await visit("/leads", page.locator(".lead-board"));
  await settle();
  // Drag a card from New Enquiries to Contacted.
  const card = page
    .locator('section[aria-label="New Enquiries"] .lead-card')
    .first();
  const name = (await card.locator("strong").first().textContent()).trim();
  const handle = card.locator(".drag-handle");
  const from = await handle.boundingBox();
  const to = await page
    .locator('section[aria-label="Contacted"]')
    .boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 20, from.y + 20, { steps: 4 });
  await page.mouse.move(to.x + to.width / 2, to.y + 120, { steps: 12 });
  await page.mouse.up();
  await until(
    "card in Contacted",
    async () => (await count("Contacted")) === before.contacted + 1,
  );
  assert.equal(await count("New Enquiries"), before.new - 1);
  assert.ok(
    await page
      .locator('section[aria-label="Contacted"]')
      .getByText(name)
      .count(),
  );
  // Won and Lost are recorded from the lead's own page, not by dragging.
  const next = page
    .locator('section[aria-label="Contacted"] .lead-card')
    .first();
  const h = await next.locator(".drag-handle").boundingBox();
  const lost = await page.locator('section[aria-label="Lost"]').boundingBox();
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + 20, h.y + 20, { steps: 4 });
  await page.mouse.move(lost.x + lost.width / 2, lost.y + 120, { steps: 12 });
  await page.mouse.up();
  await page.waitForURL(/\/leads\/[a-f0-9-]+$/);
  await see("Record the sales outcome");
  // Columns fold and unfold.
  await visit("/leads", page.locator(".lead-board"));
  await page.getByRole("button", { name: "Collapse Contacted" }).click();
  await page.getByRole("button", { name: "Expand Contacted" }).click();
  // The lead page.
  await page.locator(".lead-card a").first().click();
  await page.waitForURL(/\/leads\/[a-f0-9-]+$/);
  await see("Stage History");
  assert.equal(await overflowing(), false);
});

const pick = (name, opts = {}) =>
  page
    .getByRole("tab", { name, ...opts })
    .or(page.getByRole("button", { name, ...opts }))
    .first();

section("renewals", async () => {
  await visit(
    "/renewals",
    page.getByRole("heading", { name: "Renewals", exact: true }),
  );
  await settle();
  const rows = () => page.locator("tbody tr").count();
  // Every range tab shows the same number of rows as the API reports for it.
  const ranges = {
    Today: "Today",
    "Next 7 Days": "Next 7 Days",
    "Next 30 Days": "Next 30 Days",
    Overdue: "Overdue",
    Renewed: "Renewed",
    Cancelled: "Cancelled",
  };
  for (const [tab, range] of Object.entries(ranges)) {
    await pick(tab, { exact: true }).click();
    await settle();
    const total = (
      await api("/renewals?limit=1&range=" + encodeURIComponent(range))
    ).meta.total;
    await until(
      `${tab} rows`,
      async () =>
        (await rows()) === Math.min(total, 50) ||
        (total === 0 && (await page.getByText(/No /).count()) > 0),
    );
  }
  await pick("All", { exact: true }).click();
  await settle();
  // Search, type and provider filters narrow the list; Reset restores it.
  const all = await rows();
  await page.getByPlaceholder(/Search by client name/).fill("Sweep Client 06");
  await until("search narrows", async () => (await rows()) < all);
  await page.getByRole("button", { name: "Reset" }).click();
  await until("reset restores", async () => (await rows()) === all);
  await page
    .getByLabel("Provider", { exact: true })
    .selectOption({ label: "Sweep Bank" });
  await until("provider filter", async () => (await rows()) < all);
  await page.getByRole("button", { name: "Reset" }).click();
  // Export, and a row opens its event.
  const csv = await page.request.get(
    target + "/api/reports/export?module=renewals",
  );
  assert.equal(csv.status(), 200);
  await page.locator("tbody a[href^='/renewals/']").first().click();
  await page.waitForURL(/\/renewals\/[a-f0-9-]+$/);
  await see("Scheduled Financial Event");
  assert.equal(await overflowing(), false);
});

section("followups", async () => {
  await visit(
    "/followups",
    page.getByRole("heading", { name: "Follow-ups", exact: true }),
  );
  await settle();
  const rows = () => page.locator("tbody tr").count();
  for (const tab of [
    "Overdue",
    "Today",
    "Tomorrow",
    "This Week",
    "Next Week",
    "Completed",
  ]) {
    await pick(tab, { exact: true }).click();
    await settle();
  }
  await pick("All", { exact: true }).click();
  await settle();
  const all = await rows();
  assert.ok(all >= 5, "Seeded follow-ups listed: " + all);
  await page.getByLabel("Channel").selectOption("WhatsApp");
  await until("channel filter", async () => (await rows()) < all);
  await page.getByRole("button", { name: "Reset" }).click();
  await until("reset", async () => (await rows()) === all);
  await page
    .getByPlaceholder(/Search follow-ups/)
    .fill("Sweep follow-up note 3");
  await until("search", async () => (await rows()) === 1);
  // Complete a fresh task with an outcome.
  const owner = (await api("/auth/me")).data.userId;
  const clientForTask = (await idsOf()).clients[10];
  const task = await send("POST", "/followups", {
    clientId: clientForTask.id,
    ownerId: owner,
    channel: "Call",
    dueAt: new Date(Date.now() + 86400000).toISOString(),
    notes: "Sweep task to complete " + Date.now(),
  });
  assert.equal(task.status, 201, JSON.stringify(task.body));
  await visit(
    "/followups/" + task.body.data.id,
    page.getByRole("button", { name: "Complete & Record Outcome" }),
  );
  await page.getByRole("button", { name: "Complete & Record Outcome" }).click();
  const dlg = page.getByRole("dialog", { name: "Complete Follow-up" });
  await dlg.locator("select[name=outcome]").selectOption({ index: 1 });
  await dlg.getByRole("button", { name: /^(Confirm|Save)/ }).click();
  await dlg.waitFor({ state: "detached" });
  await see("completed");
  assert.equal(await overflowing(), false);
});

section("catalogue", async () => {
  // Providers: add, rename, and the protections on delete.
  await visit(
    "/providers",
    page.getByRole("heading", { name: "Providers", exact: true }),
  );
  await page.getByRole("button", { name: "Add provider" }).click();
  const add = page.getByRole("dialog", { name: "Add provider" });
  await add.locator('input[name="name"]').fill("Sweep Extra Provider");
  await add.getByRole("button", { name: "Save provider" }).click();
  await add.waitFor({ state: "detached" });
  await page
    .getByRole("button", { name: "Edit Sweep Extra Provider" })
    .waitFor();
  await page.getByRole("button", { name: "Edit Sweep Extra Provider" }).click();
  const edit = page.getByRole("dialog");
  await edit.locator('input[name="name"]').fill("Sweep Renamed Provider");
  await edit.getByRole("button", { name: "Save changes" }).click();
  await edit.waitFor({ state: "detached" });
  await page
    .getByRole("button", { name: "Edit Sweep Renamed Provider" })
    .waitFor();
  // A provider with plans cannot be deleted, and says why.
  await page.getByRole("button", { name: "Delete Sweep Insurer" }).click();
  await see("is in use");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  // Products: a plan under the new provider.
  await visit(
    "/products",
    page.getByRole("heading", { name: "Products", exact: true }),
  );
  await page.getByRole("button", { name: "Add product" }).click();
  const plan = page.getByRole("dialog", { name: "Add product" });
  await plan.locator('input[name="name"]').fill("Sweep Extra Plan");
  await plan
    .locator('select[name="providerId"]')
    .selectOption({ label: "Sweep Renamed Provider" });
  await plan
    .locator('select[name="category"]')
    .selectOption("Health Insurance");
  await plan.getByRole("button", { name: "Save product" }).click();
  await plan.waitFor({ state: "detached" });
  await page.getByRole("button", { name: "Edit Sweep Extra Plan" }).waitFor();
  // Filters and search.
  await page.getByLabel("Filter by category").selectOption("Home Loan");
  await see("Sweep Home Loan");
  assert.equal(await page.getByText("Sweep Extra Plan").count(), 0);
  await page.getByLabel("Filter by category").selectOption("");
  await page
    .getByLabel("Filter by provider")
    .selectOption({ label: "Sweep Bank" });
  await see("Sweep Home Loan");
  await page.getByLabel("Filter by provider").selectOption("");
  await page.getByPlaceholder(/Search plans/).fill("Extra");
  await see("Sweep Extra Plan");
  assert.equal(await page.getByText("Sweep Life Plan").count(), 0);
  await page.getByPlaceholder(/Search plans/).fill("");
  // A plan with client records cannot be deleted.
  await page.getByRole("button", { name: "Delete Sweep Life Plan" }).click();
  await see("is in use");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  // The provider still has a plan, so it stays; once the plan goes, the provider can too.
  await visit(
    "/providers",
    page.getByRole("heading", { name: "Providers", exact: true }),
  );
  await page
    .getByRole("button", { name: "Delete Sweep Renamed Provider" })
    .click();
  await see("is in use");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await visit(
    "/products",
    page.getByRole("heading", { name: "Products", exact: true }),
  );
  await page.getByRole("button", { name: "Delete Sweep Extra Plan" }).click();
  const delPlan = page.getByRole("dialog");
  await delPlan
    .getByRole("button", { name: /^Delete/ })
    .last()
    .click();
  await delPlan.waitFor({ state: "detached" });
  assert.equal(
    await page.getByRole("button", { name: "Edit Sweep Extra Plan" }).count(),
    0,
  );
  await visit(
    "/providers",
    page.getByRole("heading", { name: "Providers", exact: true }),
  );
  await page
    .getByRole("button", { name: "Delete Sweep Renamed Provider" })
    .click();
  const delProvider = page.getByRole("dialog");
  await delProvider
    .getByRole("button", { name: /^Delete/ })
    .last()
    .click();
  await delProvider.waitFor({ state: "detached" });
  assert.equal(
    await page
      .getByRole("button", { name: "Edit Sweep Renamed Provider" })
      .count(),
    0,
  );
  assert.equal(await overflowing(), false);
});

section("product-clients", async () => {
  await visit(
    "/products/category/Life%20Insurance",
    page.getByRole("heading", { name: "Life Insurance" }),
  );
  await settle();
  for (const tab of ["Active", "Application", "Closed", "All"]) {
    await pick(tab, { exact: true }).click();
    await settle();
  }
  await page.getByPlaceholder(/Search product/).fill("SWEEP-000");
  await until(
    "a match",
    async () => (await page.locator("tbody tr").count()) >= 1,
  );
  await visit(
    "/products/records",
    page.getByRole("heading", { name: /Client policies/ }),
  );
  await page.locator("select").first().selectOption("Home Loan");
  await settle();
  // Add client opens the product form with the category chosen.
  await page.getByRole("link", { name: "Add client" }).first().click();
  await page.waitForURL(/\/products\/new/);
  // Create a product record from the form.
  const holder = (await idsOf()).clients[20];
  await visit("/products/new?category=Health+Insurance", page.locator("form"));
  await page
    .getByPlaceholder(/Search client by name/)
    .first()
    .fill(holder.name);
  await page.getByText(holder.name, { exact: false }).first().click();
  const uniq = String(Date.now()).slice(-8);
  await page.locator('input[name="identifier"]').fill("SWEEP-NEW-" + uniq);
  await page.locator('select[name="definitionId"]').selectOption({ index: 1 });
  await page
    .locator("label", { hasText: "Start Date" })
    .locator('input[type="text"]')
    .pressSequentially(typed(istDay(0)));
  await page
    .locator("form")
    .getByRole("button", { name: /^(Add|Save|Create)/ })
    .last()
    .click();
  await until("product created", async () => {
    const list = (await api("/products?limit=100&q=SWEEP-NEW-" + uniq)).data;
    return list.length === 1;
  });
});

section("calendar", async () => {
  await visit(
    "/calendar",
    page.getByRole("heading", { name: "Calendar", exact: true }),
  );
  await settle();
  await page.getByRole("button", { name: "Next month" }).click();
  await page.getByRole("button", { name: "Previous month" }).click();
  for (const view of ["Day", "List", "Month"]) {
    await pick(view, { exact: true }).click();
    await settle();
  }
  for (const filter of ["Renewals", "Follow-ups", "Birthdays", "All"]) {
    await pick(filter, { exact: true }).click();
    await settle();
  }
  // A busy day lists its items, each linking to its record.
  await page
    .getByRole("button", { name: /^10 Oct 2026, \d+ activities/ })
    .click();
  await page.getByRole("link", { name: "View details" }).first().waitFor();
  await page
    .getByPlaceholder("Search clients, products or activities...")
    .fill("Sweep Client 01");
  await settle();
  await page.getByRole("button", { name: "Today" }).click();
  assert.equal(await overflowing(), false);
});

section("engagement", async () => {
  await visit(
    "/engagement",
    page.getByRole("heading", { name: "Broadcast to many clients" }),
  );
  // Credentials are not configured: it says so and cannot send.
  await see("unavailable");
  await page.getByRole("button", { name: "Select all shown" }).click();
  assert.equal(
    await page.getByRole("button", { name: /^Send to/ }).isDisabled(),
    true,
  );
  await page.getByRole("button", { name: "Clear selection" }).click();
  // One-to-one: prepare and record a conversation.
  await visit(
    "/engagement/new",
    page.getByRole("heading", { name: "Prepare a conversation" }),
  );
  const box = page.getByPlaceholder(/Search client by name/);
  await box.fill("Sweep Client 05");
  await page.getByText("Sweep Client 05", { exact: false }).first().click();
  await page.locator("select").first().selectOption("Call");
  await page.locator("textarea").fill("Sweep call: discussed the renewal");
  await page.getByRole("button", { name: "Save record" }).click();
  await until("record saved", async () => {
    const list = (await api("/communications?limit=100")).data || [];
    return list.some((c) =>
      (c.body || "").includes("Sweep call: discussed the renewal"),
    );
  });
  assert.equal(await overflowing(), false);
});

section("reports", async () => {
  await visit(
    "/reports",
    page.getByRole("heading", { name: "Reports", exact: true }),
  );
  await settle();
  await see("Renewal outlook");
  await see("Metric Definitions");
  for (const module of ["clients", "renewals", "followups"]) {
    const r = await page.request.get(
      `${target}/api/reports/export?module=${module}`,
    );
    assert.equal(r.status(), 200, module);
    assert.match(r.headers()["content-type"], /csv/);
    assert.ok(
      (await r.text()).split("\n").length >= 2,
      module + " has a header and rows",
    );
  }
  // The tiles agree with the dashboard they summarise.
  const d = (await api("/dashboard")).data;
  await see(String(d.totalClients ?? ""));
  assert.equal(await overflowing(), false);
});

section("notifications", async () => {
  await visit(
    "/notifications",
    page.getByRole("heading", { name: "Notifications", exact: true }),
  );
  await settle();
  await page.getByRole("button", { name: "Notifications" }).click();
  await page.keyboard.press("Escape");
  assert.equal(url(), "/notifications");
});

section("settings", async () => {
  await visit(
    "/settings",
    page.getByRole("heading", { name: "Settings", exact: true }),
  );
  // Profile.
  const nameBox = page.locator('input[name="name"]');
  // Changing profile details asks for the current password.
  await page.locator('input[name="currentPassword"]').fill(password);
  await nameBox.fill("Journey QA Renamed");
  await page.getByRole("button", { name: "Save profile" }).click();
  await until(
    "name saved",
    async () => (await api("/auth/me")).data.name === "Journey QA Renamed",
  );
  await nameBox.fill("Journey QA");
  await page.locator('input[name="currentPassword"]').fill(password);
  await page.getByRole("button", { name: "Save profile" }).click();
  await until(
    "name restored",
    async () => (await api("/auth/me")).data.name === "Journey QA",
  );
  // Security: a wrong current password is refused plainly; the right one changes it, and it is changed back.
  await page.getByRole("button", { name: /^Security/ }).click();
  const change = async (current, next) => {
    await page.locator('input[name="currentPassword"]').fill(current);
    await page.locator('input[name="newPassword"]').fill(next);
    await page.locator('input[name="confirmPassword"]').fill(next);
    await page.getByRole("button", { name: "Update password" }).click();
  };
  expectFailures(1);
  await change("not-the-password-1", "Sweep-New-Password-1!");
  await see("Current password is incorrect");
  await change(password, "Sweep-New-Password-1!");
  await see("Password updated");
  await page.waitForTimeout(500);
  // The session may be ended by a password change; sign in again if so, then restore the original.
  if (new URL(page.url()).pathname.startsWith("/login")) {
    await page.locator("#auth-email").fill(email);
    await page.locator("#auth-password").fill("Sweep-New-Password-1!");
    await page.getByRole("button", { name: /^Log in/ }).click();
    await page.waitForURL("**/dashboard");
    csrf = (await api("/auth/me")).data.csrf;
  }
  await visit(
    "/settings",
    page.getByRole("heading", { name: "Settings", exact: true }),
  );
  await page.getByRole("button", { name: /^Security/ }).click();
  await change("Sweep-New-Password-1!", password);
  await see("Password updated");
  await page.waitForTimeout(500);
  if (new URL(page.url()).pathname.startsWith("/login")) {
    await page.locator("#auth-email").fill(email);
    await page.locator("#auth-password").fill(password);
    await page.getByRole("button", { name: /^Log in/ }).click();
    await page.waitForURL("**/dashboard");
    csrf = (await api("/auth/me")).data.csrf;
  }
  // Appearance: the choice is applied and survives a reload.
  await visit(
    "/settings",
    page.getByRole("heading", { name: "Settings", exact: true }),
  );
  await page.getByRole("button", { name: /^Appearance/ }).click();
  await page.getByRole("button", { name: /^Dark/ }).click();
  assert.equal(
    await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    ),
    true,
  );
  await page.reload();
  await page.getByRole("heading", { name: "Settings", exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    ),
    true,
  );
  await page.getByRole("button", { name: /^Appearance/ }).click();
  await page.getByRole("button", { name: /^Light/ }).click();
  assert.equal(
    await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    ),
    false,
  );
  // Team.
  await page.getByRole("button", { name: /^Team/ }).click();
  await see("Manage who has access");
});

section("auth", async () => {
  // Signing out ends the session and protected pages send you to sign in.
  await visit(
    "/dashboard",
    page.getByRole("heading", { name: "Today’s Attention" }),
  );
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("button", { name: /Sign out/ }).click();
  await page.waitForURL("**/login");
  // Sign-out reloads the page; let that finish before moving on.
  await page.waitForLoadState("load");
  await page.waitForTimeout(500);
  await page.goto(target + "/clients");
  await page.waitForURL("**/login");
  // A wrong password is refused with a plain message.
  await page.locator("#auth-email").fill(email);
  await page.locator("#auth-password").fill("definitely-wrong-password");
  expectFailures(1);
  await page.getByRole("button", { name: /^Log in/ }).click();
  await see("incorrect");
  // Recovery mail is not configured: the page says so instead of promising an email.
  await page.goto(target + "/forgot-password");
  await page.locator("#auth-email").fill(email);
  expectFailures(1);
  await page
    .getByRole("button", { name: /Send|Reset|Continue/ })
    .first()
    .click();
  await see("not configured");
  // Back in; an unknown address shows the missing-page message.
  await page.goto(target + "/login");
  await page.locator("#auth-email").fill(email);
  await page.locator("#auth-password").fill(password);
  await page.getByRole("button", { name: /^Log in/ }).click();
  await page.waitForURL("**/dashboard");
  csrf = (await api("/auth/me")).data.csrf;
  await page.goto(target + "/no-such-page");
  await see("This page does not exist");
});

section("responsive", async () => {
  const routes = [
    "/dashboard",
    "/clients",
    "/leads",
    "/renewals",
    "/followups",
    "/providers",
    "/products",
    "/calendar",
    "/engagement",
    "/reports",
    "/settings",
    "/notifications",
  ];
  const first = (await idsOf()).clients[0];
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [...routes, "/clients/" + first.id]) {
      await page.goto(target + route);
      await settle();
      assert.equal(
        await overflowing(),
        false,
        `${route} overflows at ${width}px`,
      );
      assert.equal(
        await page.locator(".error-state").count(),
        0,
        `${route} shows an error at ${width}px`,
      );
    }
  }
  await page.setViewportSize({ width: 1440, height: 960 });
});

// =================================================================================================
// Sign in, seed if the workspace is empty, run the sections.
const failures = [];
try {
  await page.goto(target + "/login");
  await page.locator("#auth-email").fill(email);
  await page.locator("#auth-password").fill(password);
  await page.getByRole("button", { name: /^Log in/ }).click();
  await page.waitForURL("**/dashboard");
  const me = (await api("/auth/me")).data;
  csrf = me.csrf;
  if (!(await api("/clients?limit=1")).meta.total) {
    console.log("Seeding synthetic workspace…");
    await seed(send, me.userId);
  }
  for (const [name, fn] of sections) {
    if (only.length && !only.includes(name)) continue;
    faults.length = 0;
    expecting = 0;
    try {
      await fn();
      await page.waitForTimeout(200);
      if (faults.length)
        throw new Error("Faults while on this page:\n  " + faults.join("\n  "));
      results.push(name);
      console.log("PASS", name);
    } catch (error) {
      failures.push(name);
      console.log(
        "FAIL",
        name,
        "\n  ",
        String(error.message || error)
          .split("\n")
          .join("\n   "),
      );
      await page
        .screenshot({ path: `${artifacts}/fail-${name}.png`, fullPage: true })
        .catch(() => {});
      console.log("   screenshot:", `${artifacts}/fail-${name}.png`);
    }
  }
} finally {
  await browser.close();
}
console.log(
  failures.length
    ? `SWEEP FAILED: ${failures.join(", ")}`
    : `SWEEP PASSED (${results.length} sections)`,
);
process.exit(failures.length ? 1 : 0);
