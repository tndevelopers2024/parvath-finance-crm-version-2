// Focused regressions using fixture API responses; never writes to the CRM database.
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { response, clients } from "../tests/fixtures/workspace-ui.mjs";

const browser = await chromium.launch({ headless: true });
const target = process.env.TARGET_URL || "http://localhost:5177";
try {
  for (const available of [false, true]) {
    const page = await browser.newPage();
    const faults = [];
    page.on("pageerror", (error) => faults.push(error.message));
    let writes = 0;
    let uploads = 0;
    let client = {
      ...clients[0],
      version: 1,
      onboardingProfile: { loans: [{ amount: "10000" }] },
    };
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname.replace("/api", "");
      if (path === "/auth/me") {
        const result = response(path, url.searchParams);
        await route.fulfill({
          json: {
            data: {
              ...result.data,
              integrations: {
                documents: {
                  available,
                  message: available ? "" : "Photo storage is unavailable.",
                },
              },
            },
          },
        });
      } else if (request.method() === "PATCH" && path === "/clients/client-0") {
        writes++;
        client = { ...client, ...request.postDataJSON() };
        await route.fulfill({ json: { data: client } });
      } else if (
        request.method() === "POST" &&
        path === "/clients/client-0/documents"
      ) {
        uploads++;
        await route.fulfill({
          status: 503,
          json: { error: { message: "Storage temporarily unavailable" } },
        });
      } else if (request.method() === "GET") {
        const result =
          path === "/clients/client-0"
            ? { data: client }
            : response(path, url.searchParams);
        if (path === "/dashboard")
          result.data.importantDates = (
            client.onboardingProfile.importantDates || []
          ).map((r, i) => ({
            id: "date-" + i,
            clientId: client.id,
            name: client.name,
            date: r.date,
            title: r.description,
          }));
        await route.fulfill({
          json: result,
        });
      } else {
        throw new Error("Unexpected fixture write: " + path);
      }
    });
    await page.goto(target + "/clients/client-0/edit");
    const upload = page.getByRole("button", {
      name: "Upload Photo",
      exact: true,
    });
    await upload.waitFor();
    assert.equal(await upload.isDisabled(), !available);
    assert.equal(
      await page.locator('input[type="file"]').isDisabled(),
      !available,
    );
    if (!available) {
      await page
        .getByText("Photo storage is unavailable.", { exact: true })
        .waitFor();
      await page.getByRole("button", { name: /Additional Details/ }).click();
      const family = page.locator(".onboard-section").filter({
        has: page.getByRole("heading", {
          name: "Family Information",
          exact: true,
        }),
      });
      const count = family.locator(".readonly-field output");
      assert.equal(await count.innerText(), "0");
      assert.equal(await family.locator(".readonly-field input").count(), 0);
      await family.getByText("Calculated", { exact: true }).waitFor();
      await family
        .getByText(/Counted automatically from Children Details/)
        .waitFor();
      await family.getByText(/No entries added/).waitFor();
      assert.equal(await family.locator(".onboard-rows-head").count(), 0);
      await family
        .getByRole("button", { name: "Add Child", exact: true })
        .click();
      assert.equal(await count.innerText(), "1");
      await family.getByLabel("Name 1", { exact: true }).fill("Child One");
      await family
        .getByLabel("Date of Birth 1", { exact: true })
        .pressSequentially("01012020");
      await family.getByLabel("Relationship 1", { exact: true }).fill("Child");
      await family
        .getByRole("button", { name: "Add Another Child", exact: true })
        .click();
      assert.equal(await count.innerText(), "2");
      await family
        .getByRole("button", {
          name: "Remove Add Another Child 2",
          exact: true,
        })
        .click();
      assert.equal(await count.innerText(), "1");
      await family.getByLabel("No. of Dependents", { exact: true }).fill("2");
      assert.equal(
        await family
          .getByLabel("No. of Dependents", { exact: true })
          .inputValue(),
        "2",
      );
      await page.screenshot({
        path: "/private/tmp/parvath-family-fields-desktop.png",
        fullPage: true,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForFunction(
        () =>
          Math.abs(
            document.querySelector(".workspace").getBoundingClientRect().left,
          ) < 1,
      );
      await page.mouse.move(20, 20);
      await page.screenshot({
        path: "/private/tmp/parvath-family-fields-mobile.png",
        fullPage: true,
      });
      const overflow = await page.evaluate(() =>
        [...document.querySelectorAll("body *")]
          .map((el) => ({
            tag: el.tagName,
            cls: el.className,
            left: el.getBoundingClientRect().left,
            right: el.getBoundingClientRect().right,
          }))
          .filter((el) => el.right > innerWidth + 1 && el.left >= 0)
          .slice(0, 15),
      );
      if (overflow.length) console.log("Mobile overflow:", overflow);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await page.setViewportSize({ width: 1280, height: 720 });
      console.log(
        "PASS child count is explained, follows row add/remove, and dependents remains editable",
      );
      await page.getByRole("button", { name: "Financial Profile" }).click();
      await page.getByLabel("Loan Amount 1", { exact: true }).fill("-100");
      await page
        .getByRole("button", { name: "Save Changes", exact: true })
        .click();
      await page
        .locator(".field-error")
        .filter({ hasText: "Enter an amount of 0 or more" })
        .first()
        .waitFor();
      assert.equal(writes, 0, "Invalid amounts must never reach the save API");
      await page
        .getByLabel("Loan Amount 1", { exact: true })
        .fill("₹ 25,000.50");
      await page
        .getByRole("button", { name: "Save Changes", exact: true })
        .click();
      await page.waitForURL("**/clients/client-0");
      assert.equal(writes, 1);
      assert.equal(client.onboardingProfile.loans[0].amount, "₹ 25,000.50");
      assert.equal(client.onboardingProfile.children.length, 1);
      assert.equal(client.onboardingProfile.children[0].name, "Child One");
      assert.equal(client.onboardingProfile.dependents, "2");
      assert.equal(uploads, 0);
      console.log(
        "PASS invalid financial rows blocked, corrected amounts saved, unavailable photo upload disabled",
      );
      // Existing free-text amounts must not prevent edits to unrelated fields.
      client = {
        ...client,
        onboardingProfile: { loans: [{ amount: "about 5 lakh" }] },
      };
      await page.goto(target + "/clients/client-0/edit");
      await page.getByLabel("Occupation", { exact: true }).fill("Consultant");
      await page
        .getByRole("button", { name: "Save Changes", exact: true })
        .click();
      await page.waitForURL("**/clients/client-0");
      assert.equal(writes, 2);
      assert.equal(client.occupation, "Consultant");
      assert.equal(client.onboardingProfile.loans[0].amount, "about 5 lakh");
      console.log("PASS unrelated edits preserve legacy financial rows");
      await page.goto(target + "/clients/client-0/edit");
      await page.getByRole("button", { name: "Preferences" }).click();
      await page.getByRole("button", { name: "Add Date", exact: true }).click();
      await page.getByLabel("Type 1", { exact: true }).fill("Anniversary");
      await page
        .getByLabel("Date 1", { exact: true })
        .pressSequentially("09102026");
      await page
        .getByLabel("Description 1", { exact: true })
        .fill("Yearly review reminder");
      await page
        .getByRole("checkbox", { name: "Repeat yearly 1", exact: true })
        .check();
      await page
        .getByRole("button", { name: "Save Changes", exact: true })
        .click();
      await page.waitForURL("**/clients/client-0");
      assert.equal(
        client.onboardingProfile.importantDates[0].repeatAnnually,
        true,
      );
      await page.goto(target + "/calendar?date=2026-10-09");
      await page
        .getByRole("tab", { name: "Important dates", exact: true })
        .click();
      await page.getByRole("tab", { name: "Day", exact: true }).click();
      await page
        .locator(".calendar-day-entry")
        .filter({ hasText: "Yearly review reminder" })
        .waitFor();
      console.log(
        "PASS yearly date control saves and important dates appear in calendar",
      );
    } else {
      await page.locator('input[type="file"]').setInputFiles({
        name: "invalid.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("invalid"),
      });
      await page
        .getByText("Choose a JPG or PNG photo up to 10 MB.", { exact: true })
        .waitFor();
      await page.locator('input[type="file"]').setInputFiles({
        name: "too-large.png",
        mimeType: "image/png",
        buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
      });
      await page
        .getByText("Choose a JPG or PNG photo up to 10 MB.", { exact: true })
        .waitFor();
      await page.locator('input[type="file"]').setInputFiles({
        name: "photo.png",
        mimeType: "image/png",
        buffer: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
          "base64",
        ),
      });
      await page
        .getByRole("button", { name: "Save Changes", exact: true })
        .click();
      await page.waitForURL("**/clients/client-0");
      assert.equal(writes, 1);
      assert.equal(uploads, 1);
      await page
        .locator(".toast")
        .filter({
          hasText:
            "Client saved, but photo upload failed: Storage temporarily unavailable",
        })
        .waitFor();
      assert.doesNotMatch(
        await page.locator(".toast").innerText(),
        /Client details updated/,
      );
      console.log(
        "PASS photo file validation and upload-failure feedback after a successful client save",
      );
    }
    assert.deepEqual(faults, []);
    await page.close();
  }
  for (const width of [1440, 390]) {
    for (const theme of ["light", "dark"]) {
      const modalPage = await browser.newPage({
        viewport: { width, height: width < 700 ? 844 : 800 },
        colorScheme: theme,
      });
      await modalPage.addInitScript(
        (theme) => localStorage.setItem("theme", theme),
        theme,
      );
      await modalPage.route("**/api/**", (route) => {
        const url = new URL(route.request().url());
        if (route.request().method() !== "GET")
          throw Error("Modal field check must not write data");
        return route.fulfill({
          json: response(url.pathname.replace("/api", ""), url.searchParams),
        });
      });
      await modalPage.goto(target + "/clients/new");
      const modal = modalPage.getByRole("dialog", { name: "Add New Client" });
      await modal.getByLabel(/Full Name/).fill("Family UI Check");
      await modal.getByLabel(/Phone Number/).fill("9000077776");
      for (
        let step = 0;
        step < 10 && !(await modal.getByLabel(/Marital Status/).isVisible());
        step++
      ) {
        await modal.getByRole("button", { name: /^Next/ }).click();
      }
      await modal.getByLabel(/Marital Status/).selectOption("Married");
      const family = modal.locator(".onboard-section").filter({
        has: modalPage.getByRole("heading", {
          name: "Family Information",
          exact: true,
        }),
      });
      const count = family.locator(".readonly-field output");
      assert.equal(await count.innerText(), "0");
      assert.equal(await family.locator(".readonly-field input").count(), 0);
      await family.getByText(/No entries added/).waitFor();
      await family
        .getByRole("button", { name: "Add Child", exact: true })
        .click();
      assert.equal(await count.innerText(), "1");
      await family
        .getByRole("button", {
          name: "Remove Add Another Child 1",
          exact: true,
        })
        .click();
      assert.equal(await count.innerText(), "0");
      await family.getByLabel("No. of Dependents", { exact: true }).fill("3");
      assert.equal(
        await family
          .getByLabel("No. of Dependents", { exact: true })
          .inputValue(),
        "3",
      );
      for (let child = 1; child <= 3; child++) {
        await family
          .getByRole("button", {
            name: child === 1 ? "Add Child" : "Add Another Child",
            exact: true,
          })
          .click();
        const name = family.getByLabel(`Name ${child}`, { exact: true });
        assert.equal(
          await name.evaluate((el) => document.activeElement === el),
          true,
        );
        await name.fill(`Child ${child}`);
        const bounds = await name.boundingBox();
        const footer = await modal.locator(".form-footer").boundingBox();
        assert.ok(
          bounds && footer && bounds.y + bounds.height <= footer.y - 4,
          "New child field is hidden by the footer",
        );
      }
      assert.equal(await count.innerText(), "3");
      const body = modal.locator(".onboarding-form-body");
      assert.equal(
        await body.evaluate((el) => getComputedStyle(el).overflowY),
        "auto",
      );
      await body.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      const remove = family.getByRole("button", {
        name: "Remove Add Another Child 3",
        exact: true,
      });
      const removeBox = await remove.boundingBox();
      const footerBox = await modal.locator(".form-footer").boundingBox();
      const bodyBox = await body.boundingBox();
      assert.ok(
        removeBox &&
          footerBox &&
          bodyBox &&
          removeBox.y >= bodyBox.y &&
          removeBox.y + removeBox.height <= footerBox.y - 4,
        "Last child action must scroll fully above the footer",
      );
      const addBox = await family
        .getByRole("button", { name: "Add Another Child", exact: true })
        .boundingBox();
      assert.ok(
        addBox && footerBox && addBox.y + addBox.height <= footerBox.y - 4,
        "Add child action must remain reachable",
      );
      await modalPage.screenshot({
        path: `/private/tmp/parvath-family-modal-${width}-${theme}.png`,
        fullPage: true,
      });
      assert.equal(
        await modalPage.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await modalPage.close();
      console.log(
        `PASS new-client family fields and scrolling above footer at ${width}px ${theme}`,
      );
    }
  }
  const settings = await browser.newPage();
  await settings.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() !== "GET")
      throw Error("Settings review must not write data");
    return route.fulfill({
      json: response(url.pathname.replace("/api", ""), url.searchParams),
    });
  });
  await settings.goto(target + "/settings");
  const email = settings
    .locator(".readonly-field")
    .filter({ hasText: "Email address" });
  await email.locator("output").waitFor();
  assert.equal(await email.locator("input").count(), 0);
  await email.getByText(/Contact your administrator/).waitFor();
  await settings.close();
  console.log(
    "PASS account-managed email is a display value with an explanation",
  );
} finally {
  await browser.close();
}
