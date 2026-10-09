import { chromium } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const artifacts = mkdtempSync(path.join(tmpdir(), "parvath-workspace-ui-"));
const target = process.env.TARGET_URL || "http://localhost:5177";
import { response } from "../tests/fixtures/workspace-ui.mjs";
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    if (req.method() !== "GET")
      throw Error("Visual review must not write data");
    await route.fulfill({
      json: response(new URL(req.url()).pathname.replace("/api", "")),
    });
  });
  await page.goto(target + "/providers");
  await page.getByRole("heading", { name: "LIC", exact: true }).waitFor();
  await page.getByRole("button", { name: "Add provider", exact: true }).click();
  await page.getByRole("dialog", { name: "Add provider" }).waitFor();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("link", { name: "Add product", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Add product", exact: true })
    .waitFor();
  if (
    (await page.locator('select[name="providerId"]').inputValue()) !==
    "provider-ui"
  )
    throw Error("Product provider was not preselected");
  await page.getByRole("button", { name: "Close dialog" }).click();
  console.log(
    "PASS separate provider management and product creation with existing provider",
  );
  await page.goto(target + "/products");
  await page.getByRole("link", { name: /Life Insurance Life cover/ }).click();
  await page
    .getByRole("heading", { name: "Client policies in this category" })
    .waitFor();
  await page
    .getByRole("link", { name: "Add client", exact: true })
    .first()
    .click();
  await page
    .getByRole("heading", { name: "Add client to Life Insurance" })
    .waitFor();
  await page.getByRole("link", { name: "Create a new client" }).click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("heading", { name: "Add client to Life Insurance" })
    .waitFor();
  console.log(
    "PASS product category → client list → add client → create/cancel with product context",
  );
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(target + "/calendar?date=2026-10-09");
    await page
      .getByRole("heading", { name: "Calendar", exact: true })
      .waitFor();
    await page.waitForLoadState("networkidle");
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      )
    )
      throw Error("Calendar overflows " + width);
    await page.getByRole("tab", { name: "Birthdays", exact: true }).click();
    await page
      .getByRole("link", { name: "View details", exact: true })
      .first()
      .waitFor();
    await page.getByRole("button", { name: "Next month", exact: true }).click();
    await page
      .getByRole("heading", { name: "November 2026", exact: true })
      .waitFor();
    await page.screenshot({
      path: artifacts + "/calendar-" + width + ".png",
      fullPage: true,
    });
  }
  console.log(
    "PASS Calendar month navigation, birthdays, details and responsive layouts",
  );
  for (const [width, height] of process.env.UI_INTERACTIONS_ONLY
    ? []
    : [
        [1440, 1000],
        [1280, 800],
        [768, 1024],
        [390, 844],
      ]) {
    await page.setViewportSize({ width, height });
    for (const theme of ["light", "dark"]) {
      await page.goto(target + "/login");
      await page.evaluate(
        (theme) => localStorage.setItem("theme", theme),
        theme,
      );
      for (const path of [
        "/dashboard",
        "/clients",
        "/clients/client-0",
        "/clients/new",
        "/clients/import",
        "/leads",
        "/renewals",
        "/followups",
        "/products",
        "/products/category/Life%20Insurance",
        "/products/records",
        "/products/new",
        "/leads/new",
        "/followups/new",
        "/leads/lead-0",
        "/renewals/event-0",
        "/followups/followup-0",
        "/products/product-0",
        "/engagement",
        "/engagement/new",
        "/reports",
        "/settings",
        "/notifications",
      ]) {
        await page.goto(target + path);
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(200);
        if (
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          )
        ) {
          await page.screenshot({
            path: artifacts + "/overflow.png",
            fullPage: true,
          });
          console.log(
            await page.evaluate(() =>
              [...document.querySelectorAll("body *")]
                .map((el) => ({
                  tag: el.tagName,
                  cls: el.className,
                  left: el.getBoundingClientRect().left,
                  right: el.getBoundingClientRect().right,
                }))
                .filter((el) => el.right > innerWidth + 1 && el.left >= 0)
                .slice(0, 20),
            ),
          );
          throw Error("Overflow " + path + " " + width + " " + theme);
        }
        if (await page.locator(".page-content .error-state").count())
          throw Error("Error state " + path);
        await page.screenshot({
          path:
            artifacts +
            "/screen-" +
            path.replaceAll("/", "-") +
            "-" +
            width +
            "-" +
            theme +
            ".png",
          fullPage: true,
        });
      }
      console.log(width + "px " + theme + ": 21 screens fit");
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(target + "/dashboard");
  await page.getByRole("tab", { name: "Leads", exact: true }).click();
  await page
    .locator(".attention-person")
    .filter({ hasText: "LEAD" })
    .first()
    .waitFor();
  await page.getByRole("tab", { name: "All", exact: true }).click();
  await page.getByRole("button", { name: "Unpin navigation" }).click();
  await page.locator(".sidebar--mini").waitFor();
  await page.getByRole("button", { name: "Pin navigation" }).click();
  await page.getByRole("button", { name: "Search records" }).click();
  await page
    .getByRole("textbox", { name: "Search all records" })
    .fill("Ananya");
  await page.locator(".search-results").getByRole("link").first().click();
  await page.waitForURL("**/clients/client-0");
  await page.goto(target + "/clients");
  await page
    .getByRole("checkbox", { name: "Select all clients on this page" })
    .check();
  await page.getByText("6 selected", { exact: false }).waitFor();
  await page
    .getByRole("button", { name: "Clear selection", exact: true })
    .click();
  await page.getByRole("button", { name: "More Filters", exact: true }).click();
  await page.locator(".filter-details").waitFor();
  await page.goto(target + "/leads");
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.locator("table tbody tr").first().waitFor();
  await page.getByRole("button", { name: "Kanban", exact: true }).click();
  await page.locator(".lead-board").waitFor();
  await page.goto(target + "/clients/new");
  await page.getByRole("button", { name: "Next: Additional Details" }).click();
  await page.locator(".field-error").first().waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(target + "/dashboard");
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page.locator(".sidebar.open").waitFor();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Clients", exact: true })
    .click();
  await page.waitForURL("**/clients");
  await page.locator(".sidebar.open").waitFor({ state: "detached" });
  console.log(
    "Search, sidebar pinning, tabs, selection, filters, lead views, validation, and mobile drawer passed",
  );
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const [path, action, title] of [
      ["/clients/new", null, "Add New Client"],
      ["/leads/lead-0", "Edit Lead", "Edit Opportunity"],
      ["/followups/followup-0", "Edit / Reschedule", "Edit / Reschedule"],
      ["/products/product-0", "Edit Product", "Edit Product"],
      [
        "/renewals/event-0",
        "Record Payment / Receipt",
        "Record payment / receipt",
      ],
      ["/settings", "Add Member", "Create Workspace Member"],
    ]) {
      await page.goto(target + path);
      if (action)
        await page.getByRole("button", { name: action, exact: true }).click();
      const dialog = page.getByRole("dialog", { name: title, exact: true });
      await dialog.waitFor();
      const close = dialog.getByRole("button", {
        name: "Close dialog",
        exact: true,
      });
      const geometry = await close.boundingBox();
      if (
        !geometry ||
        Math.abs(geometry.width - geometry.height) > 1 ||
        geometry.width > 30
      )
        throw Error("Close button geometry: " + title);
      const rect = await dialog.boundingBox();
      if (!rect || rect.x < 0 || rect.x + rect.width > width + 1)
        throw Error("Dialog overflow: " + title);
      const misaligned = await dialog
        .locator(
          'label:has(> input[type="checkbox"]), label:has(> input[type="radio"])',
        )
        .evaluateAll(
          (labels) =>
            labels.filter(
              (label) =>
                label.getClientRects().length &&
                getComputedStyle(label).flexDirection !== "row",
            ).length,
        );
      if (misaligned) throw Error("Choice labels stack incorrectly: " + title);
      if (width < 700 && title === "Add New Client") {
        const body = dialog.locator(".onboarding-form-body");
        await body.evaluate(
          (element) => (element.scrollTop = element.scrollHeight),
        );
        const footer = await dialog.locator(".form-footer").boundingBox();
        if (!footer || footer.y + footer.height > 844)
          throw Error("Mobile actions clipped");
      }
      await page.screenshot({
        path:
          artifacts +
          "/dialog-" +
          title.replaceAll(/[^a-zA-Z0-9]/g, "-") +
          "-" +
          width +
          ".png",
        fullPage: true,
      });
      await close.click();
      await dialog.waitFor({ state: "detached" });
    }
  }
  console.log(
    "Six dialog layouts, close buttons, choice alignment and mobile scrolling passed",
  );
  if (errors.length) throw Error([...new Set(errors)].join("\n"));
  console.log("WORKSPACE VISUAL CHECK PASSED; screenshots: " + artifacts);
} finally {
  await browser.close();
}
