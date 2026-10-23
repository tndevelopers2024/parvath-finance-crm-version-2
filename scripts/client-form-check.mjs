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
} finally {
  await browser.close();
}
