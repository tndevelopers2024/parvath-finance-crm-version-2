import { chromium } from "@playwright/test";
import { response } from "../tests/fixtures/workspace-ui.mjs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const artifacts = mkdtempSync(path.join(tmpdir(), "parvath-dropdown-"));
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/**", async (route) => {
    if (route.request().method() !== "GET")
      throw Error("Dropdown checks must not write data");
    const url = new URL(route.request().url());
    const data = response(url.pathname.replace("/api", ""), url.searchParams);
    if (url.pathname === "/api/clients") {
      data.data = data.data.map((c, i) => ({
        ...c,
        name:
          i === 0
            ? "Abirami Meenakshisundaram With A Long Customer Name"
            : c.name,
        email: "abirami.meenakshisundaram.long.email@example.test",
        city: "Tiruchirappalli",
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
      for (const route of [
        "/products/new",
        "/leads/new",
        "/followups/new",
        "/engagement/new",
        "/clients/client-0",
      ]) {
        await page.goto("http://localhost:5177" + route);
        if (route === "/clients/client-0") {
          await page
            .getByRole("heading", { name: "Family Details", exact: true })
            .locator("..")
            .getByRole("button", { name: "Edit", exact: true })
            .click();
          await page
            .getByRole("dialog", { name: "Link an existing contact" })
            .waitFor();
        }
        const input = page.getByRole("combobox").first();
        await input.waitFor();
        await input.click();
        await page.getByRole("option").first().waitFor();
        const menu = page.locator(".client-combobox-dropdown");
        const box = await menu.boundingBox();
        if (
          !box ||
          box.x < 0 ||
          box.y < 0 ||
          box.x + box.width > width + 1 ||
          box.y + box.height > 845
        )
          throw Error(
            `Dropdown outside viewport: ${route} ${width} ${theme} ${JSON.stringify(box)}`,
          );
        if (await menu.evaluate((el) => el.scrollWidth > el.clientWidth + 1))
          throw Error("Dropdown text overflows");
        await input.press("ArrowDown");
        const active = await input.getAttribute("aria-activedescendant");
        if (!active || !(await page.locator(`[id="${active}"]`).count()))
          throw Error("Missing active option");
        await page.screenshot({
          path: `${artifacts}/${route.replaceAll("/", "-")}-${width}-${theme}.png`,
          fullPage: true,
        });
        await input.press("Escape");
        if (await menu.count()) throw Error("Escape did not close picker");
        // Validation must require an actual selection, even when search text exists.
        await input.fill("Client");
        const valid = await input.evaluate((el) => el.checkValidity());
        if (valid)
          throw Error("Search text bypassed required client selection");
        await page.locator(".client-combobox .field-error").waitFor();
        await input.fill("");
        await input.click();
        await page.getByRole("option").first().click();
        await page.locator(".client-combobox-selected").waitFor();
        if (
          !(await page
            .locator('.client-combobox input[type="hidden"]')
            .inputValue())
        )
          throw Error("Client selection was not stored");
        console.log(
          `PASS ${route} ${width}px ${theme}: bounds, text, keyboard, validation, selection`,
        );
      }
    }
  }
  if (errors.length) throw Error(errors.join("\n"));
  console.log("DROPDOWN CHECK PASSED; screenshots: " + artifacts);
} finally {
  await browser.close();
}
