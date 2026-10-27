import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { response, leads, clients } from "../tests/fixtures/workspace-ui.mjs";
const target = process.env.TARGET_URL || "http://localhost:5177";
const browser = await chromium.launch({ headless: true });
let role = "Administrator",
  calendarFailure = false,
  productPatch,
  createdClient;
const seed = [
  {
    ...leads[0],
    id: "qualified-test",
    stage: "Qualified",
    client: { ...leads[0].client, name: "Qualified Regression Client" },
  },
  {
    ...leads[0],
    id: "high-test",
    priority: "High",
    client: { ...leads[0].client, name: "High Regression Client" },
  },
  {
    ...leads[0],
    id: "urgent-test",
    priority: "Urgent",
    client: { ...leads[0].client, name: "Urgent Regression Client" },
  },
];
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      p = url.pathname.replace("/api", "");
    if (req.method() !== "GET") {
      if (p === "/clients" && req.method() === "POST") {
        createdClient = {
          ...structuredClone(clients[0]),
          ...req.postDataJSON(),
          id: "created-context-client",
        };
        return route.fulfill({ status: 201, json: { data: createdClient } });
      }
      if (p === "/auth/forgot-password")
        return route.fulfill({
          json: { data: { message: "Fixture recovery email prepared" } },
        });
      if (p === "/products/product-0" && req.method() === "PATCH") {
        productPatch = req.postDataJSON();
        return route.fulfill({
          json: { data: { cancelledEvents: 0, keptEvents: 0 } },
        });
      }
      throw Error("Unexpected mutation in fixture test: " + p);
    }
    if (p === "/auth/csrf")
      return route.fulfill({ json: { data: { csrf: "fixture" } } });
    if (p === "/dashboard" && calendarFailure && url.searchParams.has("from"))
      return route.fulfill({
        status: 500,
        json: { error: { message: "Fixture calendar request failed" } },
      });
    const data = structuredClone(response(p, url.searchParams));
    if (p === "/leads/qualified-test") data.data = seed[0];
    if (createdClient && p === "/clients/" + createdClient.id)
      data.data = createdClient;
    if (p === "/auth/me") data.data.role = role;
    if (p === "/dashboard") {
      Object.assign(data.data, {
        hotLeads: 2,
        totalLeads: 3,
        renewalsDue: 2501,
        renewalsToday: 2001,
        renewalsNext7Days: 2301,
        premiumTodayMinor: "123456",
        premiumOverdueMinor: "0",
      });
      data.data.truncated = { ...data.data.truncated, events: true };
      data.data.events = data.data.events.slice(0, 1);
    }
    if (p === "/leads") {
      data.data = seed.filter(
        (l) =>
          (!url.searchParams.get("stage") ||
            (url.searchParams.get("stage") === "Contacted"
              ? ["Contacted", "Qualified"].includes(l.stage)
              : l.stage === url.searchParams.get("stage"))) &&
          (!url.searchParams.get("priority") ||
            (url.searchParams.get("priority") === "Hot"
              ? ["High", "Urgent"].includes(l.priority)
              : l.priority === url.searchParams.get("priority"))),
      );
      data.meta = { total: data.data.length, page: 1, limit: 25 };
    }
    await route.fulfill({ json: data });
  });

  await page.goto(target + "/forgot-password");
  await page
    .getByLabel("Work email", { exact: true })
    .fill("fixture@example.test");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await page.getByText("Fixture recovery email prepared").waitFor();
  await page.getByRole("link", { name: "Back to sign in" }).click();
  await page.getByRole("button", { name: "Log in", exact: true }).waitFor();
  assert.equal(
    await page.getByText("Fixture recovery email prepared").count(),
    0,
  );
  console.log("PASS recovery success → login renders a fresh form");

  await page.goto(target + "/leads");
  await page
    .getByText("Qualified Regression Client", { exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole("region", { name: "Qualified", exact: true }).count(),
    0,
  );
  await page.goto(target + "/leads/qualified-test");
  const stageSelect = page
    .locator("label", { hasText: /^Stage/ })
    .locator("select");
  await stageSelect.waitFor();
  assert.equal(await stageSelect.inputValue(), "Contacted");
  assert.equal(
    await stageSelect.locator('option[value="Qualified"]').count(),
    0,
  );
  assert.equal(
    await stageSelect.getByText("Qualified", { exact: true }).count(),
    0,
  );
  await page.goto(target + "/leads");
  await page.locator(".metric").filter({ hasText: "Hot Leads" }).click();
  await page.getByText("High Regression Client", { exact: true }).waitFor();
  await page.getByText("Urgent Regression Client", { exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("priority"), "Hot");
  assert.equal(
    await page.getByRole("region", { name: "Qualified", exact: true }).count(),
    0,
  );
  console.log(
    "PASS legacy Qualified leads are grouped under Contacted and Hot includes Urgent",
  );

  await page.goto(target + "/products/records?category=Life%20Insurance");
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  assert.equal(new URL(page.url()).searchParams.get("category"), null);
  await page.goto(target + "/products/category/Life%20Insurance?status=Active");
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  assert.match(new URL(page.url()).pathname, /Life%20Insurance$/);
  assert.equal(new URL(page.url()).search, "");
  console.log(
    "PASS Clear filters resets query filters and preserves the category route",
  );

  await page.goto(
    target +
      "/products/new?category=Life%20Insurance&definitionId=definition-ui",
  );
  await page.getByRole("combobox").first().click();
  await page.locator(".client-combobox-footer-action").click();
  let url = new URL(page.url());
  assert.equal(url.searchParams.get("productCategory"), "Life Insurance");
  assert.equal(url.searchParams.get("definitionId"), "definition-ui");
  const clientDialog = page.getByRole("dialog", { name: "Add New Client" });
  await clientDialog
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await page.waitForURL("**/products/new?**");
  url = new URL(page.url());
  assert.equal(url.searchParams.get("category"), "Life Insurance");
  assert.equal(url.searchParams.get("definitionId"), "definition-ui");
  // No-category product entry must also return to product entry.
  await page.goto(target + "/products/new");
  await page.getByRole("combobox").first().click();
  await page.locator(".client-combobox-footer-action").click();
  assert.equal(
    new URL(page.url()).searchParams.get("returnTo"),
    "/products/new",
  );
  await page
    .getByRole("dialog", { name: "Add New Client" })
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await page.waitForURL("**/products/new*");
  console.log(
    "PASS new-client picker preserves selected plan/category and product return route",
  );

  await page.goto(
    target +
      "/products/new?category=Life%20Insurance&definitionId=definition-ui",
  );
  await page.getByRole("combobox").first().click();
  await page.locator(".client-combobox-footer-action").click();
  const creation = page.getByRole("dialog", { name: "Add New Client" });
  await creation.getByLabel(/Full Name/).fill("Context Regression Client");
  await creation.getByLabel(/Phone Number/).fill("9000077778");
  for (
    let step = 0;
    step < 25 &&
    !(await creation
      .getByRole("button", { name: "Create Client", exact: true })
      .count());
    step++
  ) {
    await creation.getByRole("button", { name: /^Next/ }).click();
  }
  await creation
    .getByRole("button", { name: "Create Client", exact: true })
    .click();
  await page.waitForURL("**/products/new?**clientId=created-context-client**");
  assert.equal(
    new URL(page.url()).searchParams.get("definitionId"),
    "definition-ui",
  );
  assert.equal(
    new URL(page.url()).searchParams.get("category"),
    "Life Insurance",
  );
  assert.equal(
    await page.locator('.client-combobox input[type="hidden"]').inputValue(),
    "created-context-client",
  );
  console.log(
    "PASS successful client creation returns to the selected product with the new client",
  );

  await page.goto(target + "/products/product-0");
  await page.getByRole("button", { name: "Edit Product", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Edit Product", exact: true });
  await edit.locator('input[name="premium"]').fill("");
  await edit.locator('input[name="principal"]').fill("");
  await edit.getByRole("button", { name: /^Save/ }).click();
  await edit.waitFor({ state: "detached" });
  assert.equal(productPatch.premiumMinor, null);
  assert.equal(productPatch.principalMinor, null);
  console.log("PASS clearing financial fields sends explicit nulls");

  await page.goto(target + "/renewals");
  await page
    .locator(".metric")
    .filter({ hasText: "Due in 30 Days" })
    .getByText("2,501", { exact: true })
    .waitFor();
  await page
    .locator(".metric")
    .filter({ hasText: "Due Today" })
    .getByText("2,001", { exact: true })
    .waitFor();
  await page
    .locator(".metric")
    .filter({ hasText: "Due in 7 Days" })
    .getByText("2,301", { exact: true })
    .waitFor();
  console.log(
    "PASS renewal cards use exact server totals despite a truncated event list",
  );

  role = "Operations";
  await page.goto(target + "/clients");
  await page.getByRole("heading", { name: "Clients", exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("checkbox", { name: "Select all loaded clients" })
      .count(),
    0,
  );
  assert.equal(
    await page.getByRole("button", { name: "Update selected status" }).count(),
    0,
  );
  await page.goto(target + "/renewals");
  await page.getByRole("heading", { name: "Renewals", exact: true }).waitFor();
  assert.equal(await page.getByRole("link", { name: /Export/ }).count(), 0);
  await page.goto(target + "/clients/client-0");
  await page.getByRole("tab", { name: "Overview", exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("link", { name: "Add policy / account", exact: true })
      .count(),
    0,
  );
  await page.goto(target + "/engagement/new");
  await page.getByRole("combobox").first().click();
  await page.getByRole("option").first().waitFor();
  assert.equal(await page.locator(".client-combobox-footer-action").count(), 0);
  console.log(
    "PASS Operations cannot see client-edit, product-create, or export actions",
  );

  role = "Administrator";
  await page.goto(target + "/calendar");
  await page
    .getByRole("heading", { name: "October 2026", exact: true })
    .waitFor();
  calendarFailure = true;
  await page.getByRole("button", { name: "Next month", exact: true }).click();
  await page
    .getByText("Fixture calendar request failed", { exact: true })
    .waitFor();
  calendarFailure = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page
    .getByRole("heading", { name: "November 2026", exact: true })
    .waitFor();
  console.log(
    "PASS failed calendar navigation shows an error and Retry recovers",
  );
  assert.deepEqual(errors, []);
  console.log("WORKFLOW REGRESSION CHECK PASSED");
} finally {
  await browser.close();
}
