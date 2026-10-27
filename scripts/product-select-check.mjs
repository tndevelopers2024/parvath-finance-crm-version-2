import { chromium } from "@playwright/test";
import { response } from "../tests/fixtures/workspace-ui.mjs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const artifacts = mkdtempSync(path.join(tmpdir(), "parvath-product-select-"));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/**", async (route) => {
    if (route.request().method() !== "GET")
      throw Error("Test must not write data");
    const url = new URL(route.request().url());
    const data = response(url.pathname.replace("/api", ""), url.searchParams);
    if (url.pathname === "/api/catalogue") {
      data.data = Array.from({ length: 30 }, (_, i) => ({
        id: `plan-${i}`,
        name: `MSME Growth Credit With A Long Product Plan Name ${i}`,
        provider: { name: "Canara Bank" },
        category: i % 2 ? "Life Insurance" : "Business Loan",
      }));
    }
    await route.fulfill({ json: data });
  });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const theme of ["light", "dark"]) {
      await page.goto("http://localhost:5177/login");
      await page.evaluate(
        (theme) => localStorage.setItem("theme", theme),
        theme,
      );
      for (const mode of ["new", "conversion", "direct-conversion"]) {
        await page.goto(
          "http://localhost:5177" +
            (mode === "new"
              ? "/products/new?category=Business%20Loan&definitionId=plan-0"
              : "/leads/lead-0"),
        );
        if (mode !== "new") {
          if (mode === "conversion") {
            await page
              .locator("label", { hasText: /^Stage/ })
              .locator("select")
              .selectOption("Won");
            await page
              .getByRole("button", { name: "Update Stage", exact: true })
              .click();
          } else {
            await page
              .getByRole("button", { name: "Accept sale", exact: true })
              .click();
          }
          await page
            .getByRole("dialog", { name: "Accept sale & create application" })
            .waitFor();
          if (
            await page
              .getByRole("dialog", { name: "Accept sale & create application" })
              .locator('input[name="identifier"]')
              .count()
          )
            throw Error(
              "Acceptance must not ask for an application identifier",
            );
          if (
            await page
              .locator('select[name="definitionId"]')
              .evaluate((el) => el.checkValidity())
          )
            throw Error("Missing product passed validation");
          await page.locator(".product-select .field-error").waitFor();
        }
        const trigger = page.getByRole("combobox", {
          name: "Product option",
          exact: true,
        });
        await trigger.waitFor();
        if (mode === "new") await trigger.locator("small").waitFor();
        if (
          mode === "new" &&
          !(await trigger.innerText()).includes("Canara Bank")
        )
          throw Error("Preselected plan not displayed");
        await trigger.click();
        const search = page.getByRole("combobox", {
          name: "Search products",
          exact: true,
        });
        await search.waitFor();
        const menu = page.locator(".product-select-popup");
        const box = await menu.boundingBox();
        if (
          !box ||
          box.x < 0 ||
          box.y < 0 ||
          box.x + box.width > width + 1 ||
          box.y + box.height > 845
        )
          throw Error("Product menu outside viewport");
        if (await menu.evaluate((el) => el.scrollWidth > el.clientWidth + 1))
          throw Error("Product text overflows");
        if (
          mode === "new" &&
          (await page
            .getByRole("listbox", { name: "Product plans" })
            .getByRole("option")
            .count()) !== 15
        )
          throw Error("Category filter lost");
        await search.fill("no matching plan");
        await page
          .getByText("No matching products. Try another search.")
          .waitFor();
        await search.fill("Canara");
        await page
          .getByRole("listbox", { name: "Product plans" })
          .getByRole("option")
          .first()
          .waitFor();
        for (let i = 0; i < 10; i++) await search.press("ArrowDown");
        const active = await search.getAttribute("aria-activedescendant");
        if (!active || !(await page.locator(`[id="${active}"]`).count()))
          throw Error("Active product missing");
        await page.screenshot({
          path: `${artifacts}/${mode}-${width}-${theme}-open.png`,
          fullPage: true,
        });
        await search.press("Enter");
        if (await menu.count()) throw Error("Menu reopened after selection");
        const selected = await page
          .locator('select[name="definitionId"]')
          .inputValue();
        if (
          !selected ||
          !(await page
            .locator('select[name="definitionId"]')
            .evaluate((el) => el.checkValidity()))
        )
          throw Error("Selection not saved to form");
        await page.screenshot({
          path: `${artifacts}/${mode}-${width}-${theme}-selected.png`,
          fullPage: true,
        });
        await trigger.click();
        await search.press("Escape");
        if (await menu.count())
          throw Error("Escape did not close product menu");
        console.log(
          `PASS ${mode} ${width}px ${theme}: selection, search, keyboard, validation, bounds`,
        );
      }
    }
  }
  if (errors.length) throw Error(errors.join("\n"));
  console.log("PRODUCT SELECT CHECK PASSED; screenshots: " + artifacts);
} finally {
  await browser.close();
}
