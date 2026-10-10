// Live browser journeys: sign in, create and edit a client, create/edit/move a lead, and plan and finish a
// follow-up, checking the validation messages on the way. It WRITES synthetic records (names start with
// "Journey ", emails end in @example.test) to whatever database the target app uses, so point it at a
// development or test database. Remove them afterwards with `npm run demo:cleanup -- --confirm-db=<db>`.
//
//   TARGET_URL      web app, default http://localhost:5177
//   JOURNEY_EMAIL / JOURNEY_PASSWORD   sign-in (falls back to ADMIN_EMAIL / ADMIN_PASSWORD from .env)
//   HEADLESS=0      watch it run
import { chromium } from "@playwright/test";
import dotenv from "dotenv";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";

const env = { ...dotenv.config({ quiet: true }).parsed, ...process.env };
const target = (env.TARGET_URL || "http://localhost:5177").replace(/\/$/, "");
const email = env.JOURNEY_EMAIL || env.ADMIN_EMAIL;
const password = env.JOURNEY_PASSWORD || env.ADMIN_PASSWORD;
if (!email || !password) {
  console.error(
    "Set JOURNEY_EMAIL and JOURNEY_PASSWORD (or ADMIN_EMAIL/ADMIN_PASSWORD) for a test account.",
  );
  process.exit(2);
}
const suffix = Date.now().toString().slice(-7);
const clientName = "Journey Client " + suffix;
// The business day is Asia/Kolkata, so dates are worked out there whatever this machine's timezone is.
const istDay = (offset = 0) =>
  new Date(Date.now() + 19800000 + offset * 86400000)
    .toISOString()
    .slice(0, 10);
const typed = (iso) => iso.split("-").reverse().join("/");

const browser = await chromium.launch({ headless: env.HEADLESS !== "0" });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
const checks = [];
const passed = (name) => {
  checks.push(name);
  console.log("PASS", name);
};
const see = (text) =>
  page.getByText(text, { exact: false }).first().waitFor({ timeout: 8000 });
const gone = (text) =>
  page
    .getByText(text, { exact: false })
    .first()
    .waitFor({ state: "detached", timeout: 8000 });
const next = () => page.getByRole("button", { name: /^Next/ }).click();
const section = async () =>
  (await page.locator(".onboard-section:visible h3").first().textContent()) ||
  "";
const api = async (path) =>
  (await page.request.get(target + "/api" + path)).json();

try {
  // --- Sign-in --------------------------------------------------------------------------------
  await page.goto(target + "/login");
  await page.locator("#auth-email").fill(email);
  await page.locator("#auth-password").fill(password);
  await page.getByRole("button", { name: /^Log in/ }).click();
  await page.waitForURL("**/dashboard");
  passed("Sign-in and authenticated navigation");

  // --- Client: validation -----------------------------------------------------------------------
  await page.goto(target + "/clients/new");
  const dialog = page.getByRole("dialog", { name: "Add New Client" });
  await dialog.waitFor();
  await next();
  await see("Enter the full name.");
  await see("Enter the phone number.");
  passed("Empty name and phone are named, not shown as library text");

  const name = dialog.getByLabel(/Full Name/);
  const phone = dialog.getByLabel(/Phone Number/);
  const mail = dialog.getByLabel(/Email Address/);
  const dob = dialog.getByLabel("Date of Birth", { exact: true });
  await name.fill("A");
  await see("The name needs at least 2 characters.");
  await phone.fill("12345");
  await mail.fill("abc");
  await dob.pressSequentially("31022020");
  await next();
  await see("Enter a 10-digit mobile number");
  await see("Enter a valid email address, for example name@example.com.");
  await see("That date does not exist");
  await dob.fill("");
  await dob.pressSequentially(typed(istDay(1)).replaceAll("/", ""));
  await next();
  await see("Choose a date on or before");
  passed(
    "Short name, bad phone/email, impossible and future birth dates block Next",
  );

  await name.fill(clientName);
  await phone.fill("98" + suffix.padStart(8, "0"));
  await mail.fill(`journey.${suffix}@example.test`);
  await dob.fill("");
  await dob.pressSequentially("15031990");
  await dob.blur();
  await gone("Enter a valid email address");
  await gone("Choose a date on or before");
  passed("Messages clear as soon as the values are corrected");

  await page.reload();
  await dialog.waitFor();
  await see("Saved draft restored.");
  assert.equal(await name.inputValue(), clientName);
  assert.equal(await dob.inputValue(), "15/03/1990");
  passed("Draft recovery keeps typed values and the date");

  // --- Client: detail sections ----------------------------------------------------------------
  await next();
  assert.match(await section(), /Family/);
  await dialog.getByLabel("Marital Status").selectOption("Married");
  const dependents = dialog.getByLabel("No. of Dependents");
  await dependents.fill("-2");
  await next();
  await see("Enter the number of dependents");
  assert.match(await section(), /Family/, "Next must not leave the section");
  await dependents.fill("2");
  await gone("Enter the number of dependents");
  await dialog.getByLabel("Spouse Date of Birth").pressSequentially("01012999");
  await next();
  await see("Choose a date on or before");
  await dialog.getByLabel("Spouse Date of Birth").fill("");
  await dialog.getByLabel("Spouse Date of Birth").pressSequentially("20041988");
  await next();
  passed("Dependents and spouse birth date are enforced before Next");

  // Walk forward to the address, financial and review sections, filling and breaking values on the way.
  const seen = new Set();
  for (
    let i = 0;
    i < 20 &&
    !(await page.getByRole("button", { name: "Create Client" }).count());
    i++
  ) {
    const title = await section();
    seen.add(title);
    if (title === "Address Details") {
      await dialog.getByLabel("City", { exact: true }).fill("Chennai");
      await dialog.getByLabel("State", { exact: true }).fill("Tamil Nadu");
      await dialog.getByLabel("PIN Code").fill("ABC");
      await next();
      await see("Enter a valid 6-digit PIN code");
      assert.equal(await section(), "Address Details");
      await dialog.getByLabel("PIN Code").fill("600001");
    }
    if (title === "Income & Savings") {
      await dialog.getByLabel("Monthly Savings (Approx)").fill("-500");
      await next();
      await see("Enter an amount of 0 or more");
      await dialog.getByLabel("Monthly Savings (Approx)").fill("₹ 25,000");
    }
    await next();
  }
  assert.ok(
    seen.has("Address Details") && seen.has("Income & Savings"),
    "Address and income sections were reached: " + [...seen].join(", "),
  );
  passed(
    "PIN code and savings are enforced; section navigation cannot skip them",
  );

  // --- Client: follow-up on the review screen, then create -------------------------------------
  await dialog.getByLabel("Create a follow-up on save").check();
  await page.getByRole("button", { name: "Create Client" }).click();
  await see("Choose a follow-up date.");
  await see("Add a short note (at least 2 characters).");
  assert.equal(page.url().includes("/success"), false);
  const followupDate = dialog.getByLabel("Follow-up Date");
  await followupDate.pressSequentially(typed(istDay(7)).replaceAll("/", ""));
  // The label also holds the error text, so find the box by its caption.
  await dialog
    .locator("label.onboard-field", { hasText: /^Notes/ })
    .locator("input")
    .fill("Synthetic journey call");
  await page.getByRole("button", { name: "Create Client" }).click();
  await page.waitForURL(/\/clients\/[a-f0-9-]+\/success$/);
  await see("Client Added Successfully!");
  const clientId = page.url().split("/").at(-2);
  await page.getByRole("link", { name: "View Client Profile" }).click();
  await page.waitForURL(new RegExp("/clients/" + clientId + "$"));
  await see(clientName);
  const created = (await api("/clients/" + clientId)).data;
  assert.equal(created.dob.slice(0, 10), "1990-03-15");
  assert.equal(created.onboardingProfile.dependents, "2");
  assert.equal(created.onboardingProfile.pinCode, "600001");
  assert.equal(created.onboardingProfile.monthlySavings, "₹ 25,000");
  assert.equal(created.followups.length, 1);
  passed(
    "Client creation persists dates, profile details and the first follow-up",
  );

  // --- Client: edit ---------------------------------------------------------------------------
  await page.goto(`${target}/clients/${clientId}/edit`);
  await page.getByLabel("Occupation", { exact: true }).fill("Consultant");
  await page.getByRole("button", { name: "Additional Details" }).click();
  await page.getByLabel("No. of Dependents").fill("-3");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await see("Enter the number of dependents");
  assert.match(page.url(), /\/edit$/, "Saving must not bypass validation");
  await page.getByLabel("No. of Dependents").fill("3");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await page.waitForURL(new RegExp("/clients/" + clientId + "$"));
  await see("Consultant");
  const edited = (await api("/clients/" + clientId)).data;
  assert.equal(edited.onboardingProfile.dependents, "3");
  assert.equal(edited.onboardingProfile.pinCode, "600001");
  passed("Client editing validates changes and persists the rest untouched");

  // --- Lead: create, edit, move, find on the board ----------------------------------------------
  await page.goto(`${target}/leads/new?clientId=${clientId}`);
  await page.locator('input[name="requirement"]').fill("Health Insurance");
  await page
    .locator('input[name="nextAction"]')
    .fill("Review family protection");
  await page.getByRole("button", { name: "Add Lead", exact: true }).click();
  await page.waitForURL(/\/leads\/[a-f0-9-]+$/);
  const leadId = page.url().split("/").pop();
  await see("Review family protection");
  await page.getByRole("button", { name: "Edit Lead" }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit Opportunity" });
  await editDialog
    .locator('input[name="nextAction"]')
    .fill("Send comparison sheet");
  await editDialog.getByRole("button", { name: /^Save/ }).click();
  await see("Send comparison sheet");
  assert.equal(
    (await api("/leads/" + leadId)).data.nextAction,
    "Send comparison sheet",
  );
  passed("Lead creation and editing persist");

  await page
    .locator("label", { hasText: /^Stage/ })
    .locator("select")
    .selectOption("Contacted");
  await page.getByRole("button", { name: "Update Stage" }).click();
  await see("Opportunity stage updated");
  assert.equal((await api("/leads/" + leadId)).data.stage, "Contacted");
  await page.goto(target + "/leads");
  const column = page.getByRole("region", { name: "Contacted" });
  await column.getByRole("link", { name: clientName }).first().waitFor();
  const shown = Number(
    (await column.locator("h2 b").textContent())?.trim() || "NaN",
  );
  const total = (await api("/leads?stage=Contacted&limit=1")).meta.total;
  assert.equal(shown, total, "Column count must be the stage's full total");
  passed(
    "Stage change moves the lead into the right board column with the right total",
  );

  // --- Follow-up: create, reschedule, complete -------------------------------------------------
  await page.goto(`${target}/followups/new?clientId=${clientId}`);
  const dueField = page.locator("label", { hasText: "Date & Time" });
  await dueField
    .locator('input[type="text"]')
    .pressSequentially(typed(istDay(3)).replaceAll("/", ""));
  await dueField.locator("select").selectOption("11:00");
  await page
    .locator('textarea[name="notes"]')
    .fill("Request identification documents");
  await page
    .locator("form")
    .getByRole("button", { name: "Add Follow-up" })
    .click();
  await page.waitForURL(/\/followups\/[a-f0-9-]+$/);
  const followupId = page.url().split("/").pop();
  const planned = (await api("/followups/" + followupId)).data;
  // 11:00 India time on the chosen day is 05:30 UTC.
  assert.equal(planned.dueAt, `${istDay(3)}T05:30:00.000Z`);
  await page.getByRole("button", { name: "Edit / Reschedule" }).click();
  const reschedule = page.getByRole("dialog", { name: "Edit / Reschedule" });
  const rescheduleField = reschedule.locator('input[type="text"]').first();
  await rescheduleField.fill("");
  await rescheduleField.pressSequentially(typed(istDay(4)).replaceAll("/", ""));
  await reschedule.getByRole("button", { name: /^(Confirm|Save)/ }).click();
  await reschedule.waitFor({ state: "detached" });
  assert.ok(
    (await api("/followups/" + followupId)).data.dueAt.startsWith(istDay(4)),
  );
  await page.getByRole("button", { name: "Complete & Record Outcome" }).click();
  const complete = page.getByRole("dialog", { name: "Complete Follow-up" });
  await complete.locator("select[name=outcome]").selectOption({ index: 1 });
  await complete.getByRole("button", { name: /^(Confirm|Save)/ }).click();
  await complete.waitFor({ state: "detached" });
  assert.equal((await api("/followups/" + followupId)).data.state, "completed");
  passed(
    "Follow-up scheduling in India time, rescheduling and completion persist",
  );

  // --- Sale conversion --------------------------------------------------------------------------
  // The catalogue is set up through the API (the provider and plan dialogs are covered by the UI suite).
  const csrf = (await api("/auth/me")).data.csrf;
  const post = async (path, data) => {
    const r = await page.request.post(target + "/api" + path, {
      data,
      headers: { "X-CSRF-Token": csrf },
    });
    assert.ok(r.ok(), `${path} → ${r.status()} ${await r.text()}`);
    return (await r.json()).data;
  };
  const providerName = "Journey Insurer " + suffix;
  const planName = "Journey Plan " + suffix;
  const provider = await post("/providers", { name: providerName });
  const plan = await post("/catalogue", {
    name: planName,
    providerId: provider.id,
    category: "Life Insurance",
  });

  await page.goto(`${target}/leads/new?clientId=${clientId}`);
  await page.locator('input[name="requirement"]').fill("Life Insurance");
  await page.locator('input[name="nextAction"]').fill("Present the proposal");
  await page.getByRole("button", { name: "Add Lead", exact: true }).click();
  await page.waitForURL(/\/leads\/[a-f0-9-]+$/);
  const saleLeadId = page.url().split("/").pop();
  await page
    .locator("label", { hasText: /^Stage/ })
    .locator("select")
    .selectOption("Won");
  await page.getByRole("button", { name: "Update Stage" }).click();
  const accept = page.getByRole("dialog", {
    name: "Accept sale & create application",
  });
  await accept.waitFor();
  // Submitting without the acceptance box ticked must not convert.
  await accept
    .locator("select[name=definitionId]")
    .selectOption({ label: `${providerName} – ${planName}` });
  await accept.locator('input[name="identifier"]').fill("JOURNEY-" + suffix);
  await accept.getByRole("button", { name: "Confirm acceptance" }).click();
  assert.equal(
    (await api("/leads/" + saleLeadId)).data.stage,
    "New Enquiries",
    "Conversion needs the acceptance box ticked",
  );
  await accept.getByRole("checkbox").check();
  await accept.getByRole("button", { name: "Confirm acceptance" }).click();
  await see("Sale accepted. Product application created.");
  const sold = (await api("/leads/" + saleLeadId)).data;
  assert.equal(sold.stage, "Won");
  const productId = sold.product?.id;
  assert.ok(productId, "The converted lead links to its product");
  assert.equal(
    (await api("/products/" + productId)).data.status,
    "Application",
  );
  passed(
    "Sale conversion creates the linked product only once the proposal is accepted",
  );

  // --- Financial event, payment and recurring renewal ------------------------------------------
  await page.goto(`${target}/products/${productId}`);
  await page.getByRole("button", { name: "Add Event" }).click();
  const eventDialog = page.getByRole("dialog", {
    name: "Schedule Financial Event",
  });
  await eventDialog
    .locator("select[name=type]")
    .selectOption("Insurance renewal");
  const dueDay = istDay(10);
  await eventDialog
    .locator("label", { hasText: "Due Date" })
    .locator('input[type="text"]')
    .pressSequentially(typed(dueDay).replaceAll("/", ""));
  await eventDialog.locator('input[name="amount"]').fill("24500");
  await eventDialog.locator('input[name="recurrenceMonths"]').fill("12");
  await eventDialog.getByRole("button", { name: "Save changes" }).click();
  await eventDialog.waitFor({ state: "detached" });
  const scheduled = (await api("/products/" + productId)).data.events;
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].dueDate.slice(0, 10), dueDay);
  assert.equal(String(scheduled[0].amountMinor), "2450000");
  await page.getByRole("link", { name: /Insurance renewal/ }).click();
  await page.waitForURL(/\/renewals\/[a-f0-9-]+$/);
  const eventId = page.url().split("/").pop();

  // Payment: the amount is checked, and recording payment does not confirm the event.
  await page.getByRole("button", { name: "Record Payment / Receipt" }).click();
  const payment = page.getByRole("dialog");
  await payment.locator('input[name="reference"]').fill("PAY-" + suffix);
  await payment.getByRole("button", { name: "Confirm", exact: true }).click();
  await payment.waitFor({ state: "detached" });
  const paid = (await api("/renewals/" + eventId)).data;
  assert.equal(paid.payments.length, 1);
  assert.equal(String(paid.paidMinor), "2450000");
  assert.equal(String(paid.outstandingMinor), "0");
  assert.equal(paid.status, "Pending", "Payment alone does not confirm");
  await see("Recorded Payments");

  await page.getByRole("button", { name: "Confirm Renewal" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await see("Event confirmed. Its history and payments are preserved.");
  const confirmed = (await api("/renewals/" + eventId)).data;
  assert.equal(confirmed.status, "Confirmed");
  assert.equal(confirmed.payments.length, 1, "Payment history is kept");
  const events = (await api("/products/" + productId)).data.events;
  assert.equal(events.length, 2, "A recurring renewal schedules the next one");
  const following = events.find((e) => e.id !== eventId);
  assert.equal(following.status, "Pending");
  assert.equal(
    following.dueDate.slice(0, 10) > dueDay,
    true,
    "The next renewal is a year later",
  );
  assert.equal(String(following.amountMinor), "2450000");
  passed("Event, payment, confirmation and the recurring next renewal persist");

  // --- CSV import --------------------------------------------------------------------------------
  const importName = (n) => "Journey Import " + String(n).padStart(7, "0");
  const first = Number(suffix) + 1,
    second = Number(suffix) + 2;
  const csv = [
    "name,phone,email,kind,city,state,source",
    `${importName(first)},97${suffix.padStart(8, "0")},import.${first}@example.test,Individual,Chennai,Tamil Nadu,Referral`,
    `${importName(second)},96${suffix.padStart(8, "0")},import.${second}@example.test,Individual,Madurai,Tamil Nadu,Website`,
    "Journey Bad Row,123,,Individual,,,",
    // The client created earlier in this run already has this phone number.
    `Journey Repeat ${suffix},98${suffix.padStart(8, "0")},,Individual,,,`,
  ].join("\n");
  await page.goto(target + "/clients/import");
  await page.getByLabel("Clients CSV").setInputFiles({
    name: "clients.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.getByRole("button", { name: "Import 2 valid rows" }).waitFor();
  await see("Enter a 10-digit mobile number");
  await see("Duplicate contact");
  assert.equal(
    (
      await api(
        "/clients?q=" +
          encodeURIComponent(
            "Journey Import " + String(first).padStart(7, "0"),
          ),
      )
    ).meta.total,
    0,
    "Previewing writes nothing",
  );
  await page.getByRole("button", { name: "Import 2 valid rows" }).click();
  await see("2 clients added · 2 rows skipped");
  const imported = await api(
    "/clients?q=" + encodeURIComponent("Journey Import ") + "&limit=10",
  );
  assert.equal(
    imported.data.filter((c) => /^Journey Import \d{7}$/.test(c.name)).length,
    2,
  );
  // Importing the same file again adds nothing.
  await page.goto(target + "/clients/import");
  await page.getByLabel("Clients CSV").setInputFiles({
    name: "clients.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.getByRole("button", { name: "Import 0 valid rows" }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Import 0 valid rows" })
      .isDisabled(),
    true,
  );
  passed(
    "CSV import previews row errors, adds valid rows once and skips duplicates",
  );

  // --- Business onboarding -------------------------------------------------------------------------
  const businessName =
    "Journey Business " + String(Number(suffix) + 4).padStart(7, "0");
  await page.goto(target + "/clients/new");
  const businessDialog = page.getByRole("dialog", { name: "Add New Client" });
  await businessDialog.waitFor();
  // A fresh form: discard any draft left from the earlier individual client.
  if (await page.getByRole("button", { name: "Discard draft" }).count())
    await page.getByRole("button", { name: "Discard draft" }).click();
  await businessDialog
    .getByRole("radio", { name: "Business", exact: true })
    .check();
  assert.equal(
    await businessDialog.getByLabel("Date of Birth", { exact: true }).count(),
    0,
    "Birth date is for individuals",
  );
  await next();
  await see("Enter the business name.");
  await businessDialog.getByLabel("Business Name *").fill(businessName);
  await businessDialog
    .getByLabel(/Phone Number/)
    .fill("93" + suffix.padStart(8, "0"));
  await businessDialog
    .getByLabel(/Email Address/)
    .fill(`journey.business.${suffix}@example.test`);
  await businessDialog.getByLabel("Registration Number").fill("JRN-" + suffix);
  await businessDialog.getByLabel("Industry", { exact: true }).fill("Services");
  for (
    let i = 0;
    i < 25 &&
    !(await page.getByRole("button", { name: "Create Client" }).count());
    i++
  )
    await next();
  await page.getByRole("button", { name: "Create Client" }).click();
  await page.waitForURL(/\/clients\/[a-f0-9-]+\/success$/);
  const businessId = page.url().split("/").at(-2);
  const business = (await api("/clients/" + businessId)).data;
  assert.equal(business.kind, "Business");
  assert.equal(business.business?.registrationNumber, "JRN-" + suffix);
  assert.equal(business.business?.industry, "Services");
  assert.equal(business.dob ?? null, null);

  // Link the individual client as a business contact from the business profile.
  await page.goto(`${target}/clients/${businessId}`);
  await see("Business Contacts");
  await page
    .locator(".panel", { hasText: "Business Contacts" })
    .getByRole("button", { name: "Edit" })
    .click();
  const link = page.getByRole("dialog");
  await link.getByPlaceholder(/Search contact/).fill(clientName);
  await link.getByText(clientName, { exact: false }).first().click();
  await link.locator('select[name="type"]').selectOption("Business contact");
  await link.getByRole("button", { name: "Link contact" }).click();
  await link.waitFor({ state: "detached" });
  const linked = (await api("/clients/" + businessId)).data.relationships;
  assert.equal(linked.length, 1);
  await see(clientName);
  passed(
    "Business onboarding saves registration details and links a contact person",
  );

  // --- Administrator corrections ---------------------------------------------------------------
  const secondProduct = await post("/products", {
    clientId: businessId,
    definitionId: plan.id,
    identifier: "JOURNEY-B-" + suffix,
    status: "Active",
    startDate: istDay(0),
  });
  const addEvent = (dueDate, amountMinor) =>
    post("/renewals", {
      productId: secondProduct.id,
      type: "Premium payment",
      dueDate,
      amountMinor,
    });
  const correctable = await addEvent(istDay(20), "500000");
  const closing = await addEvent(istDay(25), "300000");
  const eventRow = async (id) => (await api("/renewals/" + id)).data;

  await page.goto(`${target}/renewals/${correctable.id}`);
  await page.getByRole("button", { name: "Edit Event" }).click();
  const correction = page.getByRole("dialog", { name: "Edit financial event" });
  const dueBox = correction
    .locator("label", { hasText: "Due Date" })
    .locator('input[type="text"]');
  await dueBox.fill("");
  await dueBox.pressSequentially(typed(istDay(21)).replaceAll("/", ""));
  await correction.locator('input[name="amount"]').fill("5500");
  await correction.getByRole("button", { name: "Save changes" }).click();
  await correction.waitFor({ state: "detached" });
  let current = await eventRow(correctable.id);
  assert.equal(String(current.amountMinor), "550000");
  assert.equal(current.dueDate.slice(0, 10), istDay(21));

  // Payment, then the rules that protect it.
  await page.getByRole("button", { name: "Record Payment / Receipt" }).click();
  const pay = page.getByRole("dialog", { name: "Record payment / receipt" });
  await pay.locator('input[name="reference"]').fill("FIX-" + suffix);
  await pay.getByRole("button", { name: "Confirm", exact: true }).click();
  await pay.waitFor({ state: "detached" });
  current = await eventRow(correctable.id);
  assert.equal(String(current.paidMinor), "550000");
  const tooLow = await page.request.patch(
    target + "/api/renewals/" + correctable.id,
    {
      data: { amountMinor: "10000", version: current.version },
      headers: { "X-CSRF-Token": csrf },
    },
  );
  assert.equal(tooLow.status() >= 400 && tooLow.status() < 500, true);
  assert.match((await tooLow.json()).error.message, /already recorded as paid/);
  await page.reload();
  await see("cannot be cancelled");
  assert.equal(
    await page.getByRole("button", { name: "Cancel Event" }).count(),
    0,
  );

  // Reverse the payment with a reason; the original stays in the history.
  await page.getByRole("button", { name: "Reverse", exact: true }).click();
  const reversal = page.getByRole("dialog", { name: "Reverse payment" });
  await reversal
    .locator('textarea[name="reason"]')
    .fill("Synthetic journey: wrong receipt");
  await reversal.getByRole("button", { name: "Reverse payment" }).click();
  await reversal.waitFor({ state: "detached" });
  current = await eventRow(correctable.id);
  assert.equal(String(current.paidMinor), "0");
  assert.equal(
    current.payments.length,
    2,
    "Original and offsetting rows are both kept",
  );
  await see("Reversed");
  // The same reference cannot be recorded again on this event.
  await page.getByRole("button", { name: "Record Payment / Receipt" }).click();
  const again = page.getByRole("dialog", { name: "Record payment / receipt" });
  await again.locator('input[name="reference"]').fill("FIX-" + suffix);
  await again.getByRole("button", { name: "Confirm", exact: true }).click();
  await again.getByText("recorded and reversed", { exact: false }).waitFor();
  await page.getByRole("button", { name: "Close dialog" }).click();

  // With nothing paid, the event can be cancelled, with a reason, and stays in the history.
  await page.getByRole("button", { name: "Cancel Event" }).click();
  const cancel = page.getByRole("dialog", { name: "Cancel financial event" });
  await cancel
    .locator('textarea[name="reason"]')
    .fill("Synthetic journey: client withdrew");
  await cancel.getByRole("button", { name: "Cancel event" }).click();
  await cancel.waitFor({ state: "detached" });
  current = await eventRow(correctable.id);
  assert.equal(current.status, "Cancelled");
  await see("Event cancelled");

  // Closing a product cancels its unpaid pending events.
  await page.goto(`${target}/products/${secondProduct.id}`);
  await page.getByRole("button", { name: "Edit Product" }).click();
  const closeProduct = page.getByRole("dialog", { name: "Edit Product" });
  await closeProduct.locator('select[name="status"]').selectOption("Closed");
  await closeProduct.getByRole("button", { name: "Save changes" }).click();
  await closeProduct.waitFor({ state: "detached" });
  assert.equal((await eventRow(closing.id)).status, "Cancelled");
  assert.equal(
    (await api("/products/" + secondProduct.id)).data.status,
    "Closed",
  );
  await page.reload();
  assert.equal(
    await page.getByRole("button", { name: "Add Event" }).count(),
    0,
  );
  passed(
    "Administrator corrections: amount and date edits, payment protection, reversal, cancellation and closing a product",
  );

  // --- Roles ---------------------------------------------------------------------------------------
  // The administrator provisions an Adviser and an Operations member through Settings, then each role signs
  // in on its own and is checked in the interface and, for the same actions, against the API.
  const rolePassword = `Role-${suffix}-Xk9!`;
  const people = {
    Adviser: `adviser.${suffix}@example.test`,
    Operations: `operations.${suffix}@example.test`,
  };
  const until = async (what, fn) => {
    for (let i = 0; i < 40; i++) {
      if (await fn()) return;
      await page.waitForTimeout(250);
    }
    throw new Error("Timed out waiting for " + what);
  };
  await page.goto(target + "/settings");
  await page.getByRole("button", { name: /^Team/ }).click();
  for (const [role, email] of Object.entries(people)) {
    const name = `Journey ${role} ${suffix}`;
    await page.getByRole("button", { name: "Add Member" }).click();
    const form = page.getByRole("dialog", { name: "Create Workspace Member" });
    await form.locator('input[name="name"]').fill(name);
    await form.locator('input[name="email"]').fill(email);
    await form.locator('input[name="password"]').fill(rolePassword);
    await form.getByRole("button", { name: "Create Member" }).click();
    await form.waitFor({ state: "detached" });
    await page.getByLabel("Role for " + name).selectOption(role);
    await until(
      role + " role saved",
      async () =>
        (await api("/members")).data.find((m) => m.user.email === email)
          ?.role === role,
    );
  }
  assert.equal(
    (await api("/jobs")).data !== undefined,
    true,
    "Administrator can read jobs",
  );
  passed(
    "Administrator provisions members and assigns the Adviser and Operations roles",
  );

  const signIn = async (email) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 960 },
    });
    const rolePage = await context.newPage();
    rolePage.on("pageerror", (e) => pageErrors.push(e.message));
    await rolePage.goto(target + "/login");
    await rolePage.locator("#auth-email").fill(email);
    await rolePage.locator("#auth-password").fill(rolePassword);
    await rolePage.getByRole("button", { name: /^Log in/ }).click();
    await rolePage.waitForURL("**/dashboard");
    const me = (
      await (await context.request.get(target + "/api/auth/me")).json()
    ).data;
    const call = async (method, path, data) => {
      const r = await context.request.fetch(target + "/api" + path, {
        method,
        headers: { "X-CSRF-Token": me.csrf },
        ...(method === "GET" ? {} : { data: data ?? {} }),
      });
      return { status: r.status(), body: await r.json().catch(() => ({})) };
    };
    return { context, page: rolePage, call, me };
  };
  const count = (rolePage, locator) => locator.count();
  const open = async (rolePage, path, ready) => {
    await rolePage.goto(target + path);
    await ready.first().waitFor();
  };
  const roleClientName = (n) => "Journey Client " + String(n).padStart(7, "0");

  // Adviser: edits sales records, cannot administer.
  const adviser = await signIn(people.Adviser);
  await adviser.page.goto(target + "/settings");
  await adviser.page.getByRole("button", { name: /^Team/ }).click();
  await adviser.page.getByText("Manage who has access").waitFor();
  assert.equal(
    await count(
      adviser.page,
      adviser.page.getByRole("button", { name: "Add Member" }),
    ),
    0,
  );
  assert.equal(
    await count(adviser.page, adviser.page.locator("select.role-select")),
    0,
  );
  await open(
    adviser.page,
    "/providers",
    adviser.page.getByRole("heading", { name: "Providers" }),
  );
  assert.equal(
    await count(
      adviser.page,
      adviser.page.getByRole("button", { name: "Add provider" }),
    ),
    0,
  );
  await open(adviser.page, "/leads", adviser.page.locator(".lead-add-bar"));
  await open(
    adviser.page,
    "/clients",
    adviser.page.getByRole("link", { name: "Import Clients" }),
  );
  await open(
    adviser.page,
    "/clients/" + clientId,
    adviser.page.getByRole("button", { name: "Delete" }),
  );
  assert.equal(
    (
      await adviser.call("POST", "/providers", {
        name: "Journey Insurer " + suffix + "x",
      })
    ).status,
    403,
  );
  assert.equal((await adviser.call("GET", "/jobs")).status, 403);
  assert.equal(
    (
      await adviser.call("POST", "/members", {
        name: "Nope Nope",
        email: `nope.${suffix}@example.test`,
        role: "Administrator",
        password: rolePassword,
      })
    ).status,
    403,
  );
  assert.notEqual(
    (await adviser.call("GET", "/reports/export?module=clients")).status,
    403,
  );
  const adviserClient = await adviser.call("POST", "/clients", {
    name: roleClientName(Number(suffix) + 3),
    phone: "95" + suffix.padStart(8, "0"),
    email: `journey.adviser.${suffix}@example.test`,
    kind: "Individual",
  });
  assert.equal(adviserClient.status, 201, JSON.stringify(adviserClient.body));
  const adviserLead = await adviser.call("POST", "/leads", {
    clientId: adviserClient.body.data.id,
    ownerId: adviser.me.userId,
    requirement: "Health Insurance",
    nextAction: "Call back",
  });
  assert.equal(adviserLead.status, 201, JSON.stringify(adviserLead.body));
  const lost = await adviser.call(
    "POST",
    `/leads/${adviserLead.body.data.id}/stage`,
    {
      stage: "Lost",
      reason: "Synthetic journey: not interested",
      version: adviserLead.body.data.version,
    },
  );
  assert.equal(lost.status, 200, JSON.stringify(lost.body));
  const reopen = await adviser.call(
    "POST",
    `/leads/${adviserLead.body.data.id}/stage`,
    {
      stage: "Contacted",
      reason: "Synthetic journey: trying to reopen",
      version: lost.body.data.version,
    },
  );
  assert.equal(reopen.status, 403);
  assert.match(reopen.body.error.message, /administrator must reopen/i);
  await adviser.context.close();
  passed(
    "Adviser edits clients and leads but cannot administer, and cannot reopen a lost lead",
  );

  // Operations: records payments, follow-ups and notes; no sales edits.
  const operations = await signIn(people.Operations);
  const ops = operations.page;
  await open(ops, "/clients", ops.getByRole("heading", { name: "Clients" }));
  assert.equal(
    await count(ops, ops.getByRole("link", { name: "Add Client" })),
    0,
  );
  assert.equal(
    await count(ops, ops.getByRole("link", { name: "Import Clients" })),
    0,
  );
  await open(ops, "/leads", ops.locator(".lead-board"));
  assert.equal(await count(ops, ops.locator(".lead-add-bar")), 0);
  await open(
    ops,
    "/providers",
    ops.getByRole("heading", { name: "Providers" }),
  );
  assert.equal(
    await count(ops, ops.getByRole("button", { name: "Add provider" })),
    0,
  );
  await open(
    ops,
    "/clients/" + clientId,
    ops.getByRole("heading", { name: clientName }),
  );
  assert.equal(
    await count(ops, ops.getByRole("button", { name: "Delete" })),
    0,
  );
  await open(
    ops,
    "/followups",
    ops.getByRole("heading", { name: "Follow-ups" }),
  );
  await ops.getByRole("link", { name: "Add Follow-up" }).first().waitFor();

  // No Edit link is offered; opening the edit address by hand still cannot save anything.
  assert.equal(
    await count(ops, ops.getByRole("link", { name: "Edit", exact: true })),
    0,
  );
  assert.equal(
    await count(ops, ops.getByRole("button", { name: "Edit", exact: true })),
    0,
  );
  await ops.goto(`${target}/clients/${clientId}/edit`);
  await ops
    .getByLabel("Occupation", { exact: true })
    .fill("Changed by operations");
  await ops.getByRole("button", { name: "Save Changes" }).click();
  await ops.getByText("Your role does not allow this action").first().waitFor();
  assert.equal(
    (await api("/clients/" + clientId)).data.occupation,
    "Consultant",
  );

  // Payments: allowed. Reversal, correction and cancellation are not.
  await open(
    ops,
    "/renewals/" + following.id,
    ops.getByRole("button", { name: "Record Payment / Receipt" }),
  );
  await ops.getByRole("button", { name: "Confirm Renewal" }).waitFor();
  assert.equal(
    await count(ops, ops.getByRole("button", { name: "Edit Event" })),
    0,
  );
  assert.equal(
    await count(ops, ops.getByRole("button", { name: "Cancel Event" })),
    0,
  );
  await ops.getByRole("button", { name: "Record Payment / Receipt" }).click();
  const opsPayment = ops.getByRole("dialog");
  await opsPayment.locator('input[name="amount"]').fill("1000");
  await opsPayment.locator('input[name="reference"]').fill("OPS-" + suffix);
  await opsPayment
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await opsPayment.waitFor({ state: "detached" });
  const paidByOps = (await api("/renewals/" + following.id)).data;
  assert.equal(String(paidByOps.paidMinor), "100000");
  assert.equal(
    (
      await operations.call(
        "POST",
        `/renewals/${following.id}/payments/${paidByOps.payments[0].id}/reverse`,
        { reason: "Synthetic journey check" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await operations.call("PATCH", "/renewals/" + following.id, {
        amountMinor: "100",
        version: paidByOps.version,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await operations.call("POST", `/renewals/${following.id}/cancel`, {
        reason: "Synthetic journey check",
        version: paidByOps.version,
      })
    ).status,
    403,
  );

  // Follow-ups and notes: allowed.
  await ops.goto(`${target}/followups/new?clientId=${clientId}`);
  const opsDue = ops.locator("label", { hasText: "Date & Time" });
  await opsDue
    .locator('input[type="text"]')
    .pressSequentially(typed(istDay(5)).replaceAll("/", ""));
  await opsDue.locator("select").selectOption("15:00");
  await ops.locator('textarea[name="notes"]').fill("Operations follow-up");
  await ops
    .locator("form")
    .getByRole("button", { name: "Add Follow-up" })
    .click();
  await ops.waitForURL(/\/followups\/[a-f0-9-]+$/);
  assert.equal(
    (
      await operations.call("POST", `/clients/${clientId}/notes`, {
        body: "Operations note",
      })
    ).status,
    201,
  );

  // Everything sales-related is refused by the server, whatever the interface shows.
  assert.equal(
    (
      await operations.call("POST", "/clients", {
        name: "Journey Refused",
        phone: "94" + suffix.padStart(8, "0"),
        kind: "Individual",
      })
    ).status,
    403,
  );
  assert.equal(
    (await operations.call("DELETE", "/clients/" + clientId)).status,
    403,
  );
  assert.equal(
    (
      await operations.call("POST", "/leads", {
        clientId,
        ownerId: operations.me.userId,
        requirement: "Health Insurance",
        nextAction: "Call",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await operations.call("POST", `/leads/${leadId}/stage`, {
        stage: "Contacted",
        version: 99,
      })
    ).status,
    403,
  );
  assert.equal(
    (await operations.call("GET", "/reports/export?module=clients")).status,
    403,
  );
  assert.equal((await operations.call("GET", "/jobs")).status, 403);
  assert.equal(
    (
      await operations.call("POST", "/providers", {
        name: "Journey Insurer " + suffix + "y",
      })
    ).status,
    403,
  );
  passed(
    "Operations records payments, follow-ups and notes; sales edits, corrections and administration are refused",
  );

  // Deactivating a member ends their access at once.
  await page.goto(target + "/settings");
  await page.getByRole("button", { name: /^Team/ }).click();
  page.once("dialog", (d) => d.accept());
  await page
    .locator(".record-row", { hasText: `Journey Operations ${suffix}` })
    .getByRole("button", { name: "Deactivate" })
    .click();
  await until(
    "Operations member deactivated",
    async () =>
      (await api("/members")).data.find(
        (m) => m.user.email === people.Operations,
      )?.user.active === false,
  );
  assert.equal((await operations.call("GET", "/clients?limit=1")).status, 401);
  await operations.context.close();
  const retry = await browser.newContext();
  const retryPage = await retry.newPage();
  await retryPage.goto(target + "/login");
  await retryPage.locator("#auth-email").fill(people.Operations);
  await retryPage.locator("#auth-password").fill(rolePassword);
  await retryPage.getByRole("button", { name: /^Log in/ }).click();
  await assert.rejects(retryPage.waitForURL("**/dashboard", { timeout: 4000 }));
  await retry.close();
  passed("A deactivated member is signed out and cannot sign in again");

  assert.deepEqual(pageErrors, [], "No page errors: " + pageErrors.join("; "));
  writeFileSync(
    "docs/verification/browser-journeys.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        target,
        clientId,
        leadId,
        saleLeadId,
        productId,
        eventId,
        checks,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`JOURNEYS PASSED (${checks.length})`);
} catch (error) {
  console.log("PAGE STATE", page.url());
  console.log(
    await page
      .locator("body")
      .innerText()
      .catch(() => ""),
  );
  await page.screenshot({
    path: "docs/verification/journey-error.png",
    fullPage: true,
  });
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
