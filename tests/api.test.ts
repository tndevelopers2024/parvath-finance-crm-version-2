import {
  afterEach,
  beforeAll,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import request from "supertest";
import argon2 from "argon2";
import { createHash, randomUUID } from "node:crypto";
import { app, isAllowedOrigin } from "../apps/api/src/app.js";
import { db } from "../apps/api/src/db.js";
import { migrateDatabase } from "../apps/api/src/persistence/migrate.js";
import { runJob } from "../apps/api/src/worker.js";
import { config } from "../apps/api/src/config.js";
import { s3 } from "../apps/api/src/documents.js";
import { integrations } from "../apps/api/src/integrations.js";
const password = "Test-" + randomUUID(),
  prefix = randomUUID();
let org: string,
  foreignOrg: string,
  owner: string,
  opsId: string,
  foreignUser: string,
  client: any,
  definition: any,
  lead: any,
  product: any,
  event: any,
  follow: any;
const admin = request.agent(app),
  ops = request.agent(app),
  foreign = request.agent(app);
let token = "",
  opsToken = "",
  foreignToken = "";
const write = (url: string, body: any = {}, method = "post") => {
  const agent: any = admin;
  return agent[method]("/api" + url)
    .set("X-CSRF-Token", token)
    .send(body);
};
async function login(agent: any, email: string) {
  const csrf = await agent.get("/api/auth/csrf");
  const r = await agent
    .post("/api/auth/login")
    .set("X-CSRF-Token", csrf.body.data.csrf)
    .send({ email, password });
  expect(r.status).toBe(200);
  return r.body.data.csrf;
}
beforeAll(async () => {
  await migrateDatabase();
  const a = await db.organization.create({ data: { name: "TEST " + prefix } }),
    b = await db.organization.create({
      data: { name: "TEST foreign " + prefix },
    });
  org = a.id;
  foreignOrg = b.id;
  const hash = await argon2.hash(password);
  for (const [role, email, organizationId] of [
    ["Administrator", `admin-${prefix}@example.test`, org],
    ["Operations", `ops-${prefix}@example.test`, org],
    ["Administrator", `foreign-${prefix}@example.test`, foreignOrg],
  ]) {
    const u = await db.user.create({
      data: {
        name: role,
        email,
        passwordHash: hash,
        memberships: { create: { organizationId, role } },
      },
    });
    if (email.startsWith("admin")) owner = u.id;
    else if (email.startsWith("ops")) opsId = u.id;
    else foreignUser = u.id;
  }
  token = await login(admin, `admin-${prefix}@example.test`);
  opsToken = await login(ops, `ops-${prefix}@example.test`);
  foreignToken = await login(foreign, `foreign-${prefix}@example.test`);
});
afterAll(async () => {
  for (const organizationId of [org, foreignOrg]) {
    if (!organizationId) continue;
    const ids = (await db.client.findMany({ where: { organizationId } })).map(
      (c) => c.id,
    );
    await db.transaction(async (tx) => {
      await tx.payment.deleteMany({ where: { event: { organizationId } } });
      await tx.followUp.deleteMany({ where: { organizationId } });
      await tx.financialEvent.deleteMany({ where: { organizationId } });
      await tx.clientProduct.deleteMany({ where: { organizationId } });
      await tx.opportunityStageHistory.deleteMany({
        where: { opportunity: { organizationId } },
      });
      await tx.opportunity.deleteMany({ where: { organizationId } });
      await tx.document.deleteMany({ where: { organizationId } });
      await tx.communication.deleteMany({ where: { clientId: { in: ids } } });
      await tx.note.deleteMany({ where: { clientId: { in: ids } } });
      await tx.consent.deleteMany({ where: { clientId: { in: ids } } });
      await tx.clientTag.deleteMany({ where: { clientId: { in: ids } } });
      await tx.contactRelationship.deleteMany({
        where: { from: { organizationId } },
      });
      await tx.client.deleteMany({ where: { organizationId } });
      await tx.business.deleteMany({ where: { contact: { organizationId } } });
      await tx.contact.deleteMany({ where: { organizationId } });
      await tx.productDefinition.deleteMany({ where: { organizationId } });
      await tx.provider.deleteMany({ where: { organizationId } });
      for (const model of [
        "job",
        "activity",
        "notification",
        "importJob",
        "membership",
      ] as const)
        await (tx[model] as any).deleteMany({ where: { organizationId } });
      await tx.native
        .collection<any>("contactLocks")
        .deleteOne({ _id: organizationId }, { session: tx.session });
      await tx.native
        .collection<any>("contactLocks")
        .deleteMany(
          { _id: { $in: ids.map((id) => "client:" + id) } },
          { session: tx.session },
        );
      await tx.organization.delete({ where: { id: organizationId } });
    });
  }
  await db.passwordReset.deleteMany({
    where: { userId: { in: [owner, opsId, foreignUser].filter(Boolean) } },
  });
  await db.user.deleteMany({
    where: { id: { in: [owner, opsId, foreignUser].filter(Boolean) } },
  });
  await db.native
    .collection("sessions")
    .deleteMany({ "session.userId": { $in: [owner, opsId, foreignUser] } });
  await db.close();
});
describe("Authenticated MongoDB workflows", () => {
  it("requires authentication and CSRF", async () => {
    expect((await request(app).get("/api/clients")).status).toBe(401);
    expect((await admin.post("/api/clients").send({})).status).toBe(403);
    expect((await write("/clients", {})).status).toBe(422);
  });
  it("does not consume account-change limits during ordinary session checks", async () => {
    for (let navigation = 0; navigation < 105; navigation++) {
      const response = await admin.get("/api/auth/me");
      expect(response.status).toBe(200);
      expect(response.body.data.userId).toBe(owner);
    }
  });
  it("creates an individual and persists normalized values", async () => {
    const r = await write("/clients", {
      name: "Test Client",
      phone: "90000 88881",
      email: "TEST@EXAMPLE.TEST",
      kind: "Individual",
      city: "Chennai",
    });
    expect(r.status, r.text).toBe(201);
    client = r.body.data;
    expect(client.phone).toBe("+919000088881");
    expect(
      (await db.contact.findUnique({ where: { id: client.contactId } }))?.email,
    ).toBe("test@example.test");
  });
  it("saves onboarding details and schedules the optional first follow-up", async () => {
    const created = await write("/clients", {
      name: "Onboarding Example",
      phone: "+919000088891",
      kind: "Individual",
      address: "18 Cross Street",
      city: "Chennai",
      annualIncome: "₹25–50 Lakhs",
      onboardingProfile: {
        maritalStatus: "Married",
        spouseName: "Synthetic Spouse",
        children: [
          {
            name: "Synthetic Child",
            dob: "2018-04-14",
            relationship: "Daughter",
          },
        ],
        financialGoals: ["Retirement Planning"],
        policies: [
          {
            type: "Life",
            provider: "Example Provider",
            name: "Example Policy",
            sumAssured: "₹50,00,000",
            renewalDate: "2027-06-12",
          },
        ],
        communicationChannels: ["WhatsApp", "Phone Call"],
        initialFollowup: {
          enabled: true,
          date: "2026-09-10",
          channel: "Call",
          notes: "Discuss protection options",
        },
      },
    });
    expect(created.status, created.text).toBe(201);
    const id = created.body.data.id;
    const detail = await admin.get(`/api/clients/${id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.onboardingProfile.children[0].name).toBe(
      "Synthetic Child",
    );
    expect(detail.body.data.onboardingProfile.policies[0].name).toBe(
      "Example Policy",
    );
    const followups = await db.followUp.findMany({ where: { clientId: id } });
    expect(followups).toHaveLength(1);
    expect(followups[0].notes).toBe("Discuss protection options");
  });
  it("detects duplicates and requires reviewed reason", async () => {
    expect(
      (await write("/clients", { name: "Family Member", phone: client.phone }))
        .status,
    ).toBe(409);
    expect(
      (
        await write("/clients", {
          name: "Family Member",
          phone: client.phone,
          allowDuplicate: true,
        })
      ).status,
    ).toBe(409);
    const r = await write("/clients", {
      name: "Family Member",
      phone: client.phone,
      allowDuplicate: true,
      duplicateReason: "Distinct spouse shares this household number",
    });
    expect(r.status, r.text).toBe(201);
  });
  it("creates businesses and links existing identities", async () => {
    const r = await write("/clients", {
      name: "Test Business",
      phone: "+919000088883",
      kind: "Business",
      registrationNumber: "SYNTHETIC-001",
      industry: "Services",
    });
    expect(r.status, r.text).toBe(201);
    expect(
      (
        await db.business.findUnique({
          where: { contactId: r.body.data.contactId },
        })
      )?.industry,
    ).toBe("Services");
    const link = await write(`/clients/${r.body.data.id}/relationships`, {
      clientId: client.id,
      type: "Business contact",
    });
    expect(link.status).toBe(201);
  });
  it("enforces optimistic concurrency and updates profiles", async () => {
    const r = await write(
      "/clients/" + client.id,
      { ...client, name: "Updated Client", version: client.version },
      "patch",
    );
    expect(r.status, r.text).toBe(200);
    expect(
      (
        await write(
          "/clients/" + client.id,
          { ...client, name: "Stale update", version: client.version },
          "patch",
        )
      ).status,
    ).toBe(409);
    client = r.body.data;
  });
  it("enforces workspace isolation on detail, search and documents", async () => {
    expect((await foreign.get("/api/clients/" + client.id)).status).toBe(404);
    const r = await foreign.get("/api/search?q=Updated");
    expect(r.body.data).toHaveLength(0);
    expect(
      (
        await foreign
          .post("/api/clients/" + client.id + "/notes")
          .set("X-CSRF-Token", foreignToken)
          .send({ body: "No access" })
      ).status,
    ).toBe(404);
    const doc = await db.document.create({
      data: {
        organizationId: org,
        clientId: client.id,
        key: randomUUID(),
        name: "test.pdf",
        size: 100,
        contentType: "application/pdf",
        uploadedBy: owner,
      },
    });
    expect(
      (await foreign.get("/api/documents/" + doc.id + "/download")).status,
    ).toBe(404);
    expect(
      (await admin.get("/api/documents/" + doc.id + "/download")).status,
    ).toBe(409);
  });
  it("blocks Operations from sales edits and exports", async () => {
    expect(
      (
        await ops
          .post("/api/clients")
          .set("X-CSRF-Token", opsToken)
          .send({ name: "Denied", phone: "+919000088899" })
      ).status,
    ).toBe(403);
    expect((await ops.get("/api/reports/export?module=clients")).status).toBe(
      403,
    );
    expect((await ops.get("/api/clients")).status).toBe(200);
    expect(
      (
        await ops
          .delete("/api/clients/" + client.id)
          .set("X-CSRF-Token", opsToken)
      ).status,
    ).toBe(403);
  });
  it("deletes a client and cascades related records", async () => {
    const created = await write("/clients", {
      name: "Temporary Client",
      phone: "+919000088899",
      email: "temp@example.test",
    });
    expect(created.status).toBe(201);
    const tempId = created.body.data.id;
    await write(`/clients/${tempId}/notes`, { body: "Note before delete" });

    const del = await write(`/clients/${tempId}`, {}, "delete");
    expect(del.status).toBe(200);
    expect(del.body.data.success).toBe(true);

    expect((await admin.get(`/api/clients/${tempId}`)).status).toBe(404);
  });
  it("validates pagination and supports server search", async () => {
    expect((await admin.get("/api/clients?limit=1000")).status).toBe(422);
    expect((await admin.get("/api/clients?sort=passwordHash")).status).toBe(
      422,
    );
    const r = await admin.get("/api/clients?q=Updated&limit=1");
    expect(r.body.data[0].id).toBe(client.id);
    expect(r.body.meta.total).toBe(1);
  });
  it("previews import errors and commits valid rows idempotently", async () => {
    const csv = `name,phone,email,kind\nImported Person,+919000088887,imported@example.test,Individual\nDuplicate,${client.phone},,Individual\nBad Row,123,,Individual`;
    const p = await write("/clients/import/preview", { csv });
    expect(p.status, p.text).toBe(200);
    expect(p.body.data.rows.filter((r: any) => r.error)).toHaveLength(2);
    const r = await write(`/clients/import/${p.body.data.id}/commit`);
    expect(r.body.data.result.created).toBe(1);
    const repeat = await write(`/clients/import/${p.body.data.id}/commit`);
    expect(repeat.body.data.result.created).toBe(1);
    expect(
      await db.contact.count({
        where: { organizationId: org, name: "Imported Person" },
      }),
    ).toBe(1);
  });
  const bulkCsv = (tag: string, n: number, base = 10000000) =>
    "name,phone,email,kind\n" +
    Array.from(
      { length: n },
      (_, i) =>
        `${tag} ${i},+9170${String(base + i).slice(-8)},${tag.toLowerCase()}-${i}@example.test,Individual`,
    ).join("\n");
  const commitUntilSettled = async (id: string) => {
    let r: any;
    for (let i = 0; i < 60; i++) {
      r = await write(`/clients/import/${id}/commit`);
      expect(r.status, r.text).toBe(200);
      if (r.body.data.state !== "Partial") break;
    }
    return r;
  };
  it("commits an import larger than one chunk exactly once", async () => {
    const p = await write("/clients/import/preview", {
      csv: bulkCsv("Chunked", 45),
    });
    expect(p.body.data.rows.filter((r: any) => r.error)).toHaveLength(0);
    const id = p.body.data.id;
    const r = await commitUntilSettled(id);
    expect(r.body.data.state).toBe("Completed");
    expect(r.body.data.result).toMatchObject({
      total: 45,
      processed: 45,
      created: 45,
      skipped: 0,
      failed: 0,
    });
    const count = () =>
      db.contact.count({
        where: { organizationId: org, name: { startsWith: "Chunked " } },
      });
    expect(await count()).toBe(45);
    const again = await write(`/clients/import/${id}/commit`);
    expect(again.body.data.result.created).toBe(45);
    expect(await count()).toBe(45);
  });
  it("keeps earlier chunks when a later chunk fails and resumes without duplicates", async () => {
    const p = await write("/clients/import/preview", {
      csv: bulkCsv("Resumed", 45, 20000000),
    });
    const id = p.body.data.id;
    // Someone adds row 30's phone between preview and commit: it must be skipped, not duplicated.
    const clash = p.body.data.rows[28].data;
    await write("/clients", { name: "Clash Person", phone: clash.phone });
    const real = db.transaction.bind(db);
    let calls = 0;
    const spy = vi.spyOn(db, "transaction").mockImplementation(((fn: any) =>
      // Only count import chunk transactions (other background work may also open transactions).
      String(fn).includes("importJob") && ++calls === 2
        ? Promise.reject(new Error("simulated outage"))
        : real(fn)) as any);
    let failed: any;
    try {
      failed = await write(`/clients/import/${id}/commit`);
    } finally {
      spy.mockRestore();
    }
    expect(failed.body.data.state).toBe("Failed");
    expect(failed.body.data.result).toMatchObject({
      processed: 20,
      created: 20,
      skipped: 0,
    });
    expect(
      await db.contact.count({
        where: { organizationId: org, name: { startsWith: "Resumed " } },
      }),
    ).toBe(20);
    const done = await commitUntilSettled(id);
    expect(done.body.data.state).toBe("Completed");
    expect(done.body.data.result).toMatchObject({
      processed: 45,
      created: 44,
      skipped: 1,
    });
    expect(done.body.data.result.errors).toEqual([
      { row: 30, error: "Duplicate detected during commit" },
    ]);
    expect(
      await db.contact.count({
        where: { organizationId: org, name: { startsWith: "Resumed " } },
      }),
    ).toBe(44);
    expect(
      await db.contact.count({
        where: { organizationId: org, phone: clash.phone },
      }),
    ).toBe(1);
  });
  it("applies CSV row rules: defaults, mobiles, in-file email duplicates, day-first dob", async () => {
    const csv = [
      "name,phone,email,kind,dob,source",
      "Blank Defaults,098765 43211,blank@example.test,,17-05-1990,",
      "Slash Dob,919876543212,,Individual,05/11/1985,Walk-in",
      "Bad Mobile,1234567890,,Individual,,",
      "Same Email,+91 98765 43213,BLANK@example.test,,,",
      "Impossible Dob,+919876543214,,Individual,31-02-2020,",
    ].join("\n");
    const p = await write("/clients/import/preview", { csv });
    expect(p.status, p.text).toBe(200);
    const rows = p.body.data.rows;
    expect(rows[0].error).toBe("");
    expect(rows[0].data).toMatchObject({
      phone: "+919876543211",
      kind: "Individual",
      source: "Direct",
      dob: "1990-05-17",
    });
    expect(rows[1].error).toBe("");
    expect(rows[1].data).toMatchObject({
      phone: "+919876543212",
      dob: "1985-11-05",
      source: "Walk-in",
    });
    expect(rows[2].error).toMatch(/phone/);
    expect(rows[3].error).toMatch(/Duplicate of row 2/);
    expect(rows[4].error).toMatch(/dob/);
    const r = await commitUntilSettled(p.body.data.id);
    expect(r.body.data.result).toMatchObject({ created: 2, skipped: 3 });
    const saved = await db.contact.findFirst({
      where: { organizationId: org, name: "Blank Defaults" },
    });
    expect(saved?.phone).toBe("+919876543211");
    const bad = await write("/clients", {
      name: "Not Mobile",
      phone: "1234567890",
    });
    expect(bad.status).toBe(422);
  });
  it("deletes object storage files only after the delete transaction commits", async () => {
    const created = await write("/clients", {
      name: "Storage Client",
      phone: "+919000077701",
    });
    const id = created.body.data.id;
    const key = randomUUID();
    await db.document.create({
      data: {
        organizationId: org,
        clientId: id,
        key,
        name: "s.pdf",
        size: 1,
        contentType: "application/pdf",
        uploadedBy: owner,
      },
    });
    const bucket = config.S3_BUCKET;
    (config as any).S3_BUCKET = "test-bucket";
    const seen: { key: string; rowsLeft: number }[] = [];
    const send = vi.spyOn(s3, "send").mockImplementation((async (cmd: any) => {
      seen.push({
        key: cmd.input.Key,
        rowsLeft: await db.document.count({ where: { clientId: id } }),
      });
      throw new Error("storage unavailable");
    }) as any);
    try {
      const del = await write(`/clients/${id}`, {}, "delete");
      // A storage failure after commit must not fail the request.
      expect(del.status).toBe(200);
    } finally {
      send.mockRestore();
      (config as any).S3_BUCKET = bucket;
    }
    expect(seen).toEqual([{ key, rowsLeft: 0 }]);
    expect(await db.client.count({ where: { id } })).toBe(0);
  });
  it("creates a catalogue item and a lead with stage history", async () => {
    const addedProvider = await write("/providers", { name: "Test Insurer" });
    expect(addedProvider.status).toBe(201);
    expect(
      (await admin.get("/api/providers")).body.data.map((item: any) => item.id),
    ).toContain(addedProvider.body.data.id);
    expect((await foreign.get("/api/providers")).body.data).toEqual([]);
    expect((await write("/providers", { name: "Test Insurer" })).status).toBe(
      409,
    );
    const foreignLink = await foreign
      .post("/api/catalogue")
      .set("X-CSRF-Token", foreignToken)
      .send({
        name: "Foreign plan",
        category: "Life Insurance",
        providerId: addedProvider.body.data.id,
      });
    expect(foreignLink.status).toBe(404);
    const cat = await write("/catalogue", {
      name: "Term Protect",
      providerId: addedProvider.body.data.id,
      category: "Life Insurance",
    });
    expect(cat.status).toBe(201);
    definition = cat.body.data;
    const r = await write("/leads", {
      clientId: client.id,
      ownerId: owner,
      requirement: "Life Insurance",
      nextAction: "Discuss policy options",
      priority: "High",
    });
    expect(r.status, r.text).toBe(201);
    lead = r.body.data;
    const stage = await write(`/leads/${lead.id}/stage`, {
      stage: "Qualified",
      version: lead.version,
    });
    expect(stage.status).toBe(200);
    lead = stage.body.data;
    expect(
      await db.opportunityStageHistory.count({
        where: { opportunityId: lead.id },
      }),
    ).toBe(2);
  });
  it("converts once, reuses contact, and preserves history on retry", async () => {
    const before = await db.client.count({ where: { organizationId: org } });
    const data = {
      version: lead.version,
      accepted: true,
      definitionId: definition.id,
      identifier: "TEST-" + prefix,
    };
    const results = await Promise.all(
      Array.from({ length: 4 }, () => write(`/leads/${lead.id}/convert`, data)),
    );
    for (const result of results) expect(result.status, result.text).toBe(200);
    expect(new Set(results.map((result) => result.body.data.id)).size).toBe(1);
    product = results[0].body.data;
    const repeat = await write(`/leads/${lead.id}/convert`, data);
    expect(repeat.body.data.id).toBe(product.id);
    expect(await db.client.count({ where: { organizationId: org } })).toBe(
      before,
    );
    expect(
      await db.clientProduct.count({ where: { opportunityId: lead.id } }),
    ).toBe(1);
    expect(product.status).toBe("Application");
  });
  it("filters and paginates the product register across matching records", async () => {
    const result = await admin.get("/api/products").query({
      q: "Term Protect",
      status: "Application",
      category: "Life Insurance",
      limit: 1,
    });
    expect(result.status).toBe(200);
    expect(result.body.data.map((p: any) => p.id)).toContain(product.id);
    expect(result.body.meta.total).toBe(1);
    const option = await admin
      .get("/api/products")
      .query({ definitionId: product.definitionId });
    expect(option.body.data.map((p: any) => p.id)).toContain(product.id);
    const summary = await admin.get("/api/products/summary");
    expect(summary.status).toBe(200);
    expect(summary.body.products).toContainEqual({
      definitionId: product.definitionId,
      clients: 1,
      records: 1,
      active: 0,
      applications: 1,
      closed: 0,
    });
    expect(summary.body.data).toContainEqual({
      category: "Life Insurance",
      clients: 1,
      records: 1,
      active: 0,
    });
    expect((await foreign.get("/api/products/summary")).body.data).toEqual([]);
    const closed = await admin
      .get("/api/products")
      .query({ status: "Closed", q: "TEST-" + prefix });
    expect(closed.body.meta.total).toBe(0);
    const second = await admin
      .get("/api/products")
      .query({ q: "TEST-" + prefix, limit: 1, page: 2 });
    expect(second.body.data).toHaveLength(0);
    expect(second.body.meta.total).toBe(1);
    const isolated = await foreign
      .get("/api/products")
      .query({ q: "Term Protect", category: "Life Insurance" });
    expect(isolated.body.meta.total).toBe(0);
    expect((await admin.get("/api/products?status=Unknown")).status).toBe(422);
  });
  it("creates typed events and keeps payment distinct from confirmation", async () => {
    const r = await write("/renewals", {
      productId: product.id,
      type: "Insurance renewal",
      dueDate: "2026-09-04",
      amountMinor: "2450000",
      recurrenceMonths: 12,
    });
    expect(r.status, r.text).toBe(201);
    event = r.body.data;
    expect(
      (
        await write(`/renewals/${event.id}/complete`, {
          version: event.version,
        })
      ).status,
    ).toBe(400);
    const payment = await write(`/renewals/${event.id}/payment`, {
      reference: "TEST-PAY-1",
      amountMinor: "2450000",
    });
    expect(payment.status, payment.text).toBe(200);
    expect(
      (await db.financialEvent.findUnique({ where: { id: event.id } }))?.status,
    ).toBe("Pending");
    expect(
      (
        await write(`/renewals/${event.id}/payment`, {
          reference: "TEST-PAY-1",
          amountMinor: "2450000",
        })
      ).body.data.id,
    ).toBe(payment.body.data.id);
    // The same reference with another amount is a conflict, not a silent no-op.
    const mismatch = await write(`/renewals/${event.id}/payment`, {
      reference: "TEST-PAY-1",
      amountMinor: "2400000",
    });
    expect(mismatch.status).toBe(409);
    expect(mismatch.body.error.message).toContain(
      "A payment with reference TEST-PAY-1 already exists for a different amount",
    );
    expect(await db.payment.count({ where: { eventId: event.id } })).toBe(1);
  });
  it("completes renewal transactionally, cancels reminders and creates one next event", async () => {
    const reminder = await write(`/renewals/${event.id}/reminder`, {
      runAt: "2026-09-05T06:30:00Z",
    });
    expect(reminder.status).toBe(201);
    const current = await db.financialEvent.findUniqueOrThrow({
      where: { id: event.id },
    });
    const r = await write(`/renewals/${event.id}/complete`, {
      version: current.version,
    });
    expect(r.status, r.text).toBe(200);
    expect(
      (
        await write(`/renewals/${event.id}/complete`, {
          version: current.version,
        })
      ).status,
    ).toBe(200);
    const all = await db.financialEvent.findMany({
      where: { productId: product.id },
      orderBy: { dueDate: "asc" },
    });
    expect(all).toHaveLength(2);
    expect(all[1].dueDate.toISOString().slice(0, 10)).toBe("2027-09-04");
    expect(
      (await db.job.findUnique({ where: { id: reminder.body.data.id } }))
        ?.state,
    ).toBe("cancelled");
  });
  it("creates, reschedules, completes follow-ups and keeps contact actions honest", async () => {
    const r = await write("/followups", {
      clientId: client.id,
      ownerId: owner,
      channel: "Call",
      dueAt: "2026-09-04T05:00:00Z",
      notes: "Discuss renewal terms",
    });
    expect(r.status, r.text).toBe(201);
    follow = r.body.data;
    const conv = await write("/communications", {
      clientId: client.id,
      channel: "WhatsApp",
      event: "Conversation opened",
    });
    expect(conv.status).toBe(201);
    expect(
      (await db.followUp.findUnique({ where: { id: follow.id } }))?.state,
    ).toBe("pending");
    const update = await write(
      "/followups/" + follow.id,
      {
        version: follow.version,
        ownerId: owner,
        channel: "Call",
        dueAt: "2026-09-04T08:00:00Z",
        notes: "Discuss renewal terms",
        priority: "Normal",
      },
      "patch",
    );
    expect(update.status).toBe(200);
    const f = await db.followUp.findUniqueOrThrow({ where: { id: follow.id } });
    const done = await write(`/followups/${f.id}/complete`, {
      version: f.version,
      state: "completed",
      outcome: "Documents requested",
      nextDueAt: "2026-09-06T05:00:00Z",
    });
    expect(done.status, done.text).toBe(200);
    expect(await db.followUp.count({ where: { clientId: client.id } })).toBe(2);
    expect(
      (await admin.get("/api/followups?range=Completed")).body.data[0].timing,
    ).toBe("Completed");
  });
  it("rejects foreign owners and inconsistent links", async () => {
    const r = await write("/followups", {
      clientId: client.id,
      ownerId: foreignUser,
      channel: "Call",
      dueAt: "2026-09-04T08:00:00Z",
      notes: "Wrong owner",
    });
    expect(r.status).toBe(400);
  });
  it("filters follow-ups by workspace calendar day, one-sided or both", async () => {
    const note = "DAYFILTER-" + prefix;
    const ids: string[] = [];
    // 19:00Z on 4 Sep is already 5 Sep in IST; 18:30Z on 5 Sep starts 6 Sep.
    for (const dueAt of [
      "2026-09-04T19:00:00Z",
      "2026-09-05T18:29:59Z",
      "2026-09-05T18:30:00Z",
    ]) {
      const r = await write("/followups", {
        clientId: client.id,
        ownerId: owner,
        channel: dueAt.includes("19:00") ? "Email" : "Call",
        dueAt,
        notes: note,
      });
      expect(r.status, r.text).toBe(201);
      ids.push(r.body.data.id);
    }
    const list = async (query: Record<string, unknown>) => {
      const r = await admin.get("/api/followups").query({ q: note, ...query });
      expect(r.status, r.text).toBe(200);
      return r.body;
    };
    const found = async (query: Record<string, unknown>) =>
      (await list(query)).data.map((f: any) => f.id);
    expect(await found({})).toEqual(ids);
    expect(await found({ from: "2026-09-05", to: "2026-09-05" })).toEqual(
      ids.slice(0, 2),
    );
    expect(await found({ from: "2026-09-04", to: "2026-09-04" })).toEqual([]);
    expect(await found({ from: "2026-09-06", to: "2026-09-06" })).toEqual([
      ids[2],
    ]);
    expect(await found({ from: "2026-09-06" })).toEqual([ids[2]]);
    expect(await found({ to: "2026-09-05" })).toEqual(ids.slice(0, 2));
    expect(await found({ to: "2026-09-04" })).toEqual([]);
    // Composes with the range, channel and pagination instead of replacing them.
    expect(await found({ range: "Tomorrow", from: "2026-09-05" })).toEqual(
      ids.slice(0, 2),
    );
    expect(await found({ range: "Tomorrow", to: "2026-09-04" })).toEqual([]);
    expect(
      await found({ range: "Today", from: "2026-09-05", to: "2026-09-05" }),
    ).toEqual([]);
    expect(
      await found({ channel: "Email", from: "2026-09-05", to: "2026-09-05" }),
    ).toEqual([ids[0]]);
    const paged = await list({
      from: "2026-09-05",
      to: "2026-09-05",
      limit: 1,
      page: 2,
    });
    expect(paged.data.map((f: any) => f.id)).toEqual([ids[1]]);
    expect(paged.meta.total).toBe(2);
    expect((await admin.get("/api/followups?from=2026-02-30")).status).toBe(
      422,
    );
    expect((await admin.get("/api/followups?to=05-09-2026")).status).toBe(422);
    expect(
      (await admin.get("/api/followups?from=2026-09-06&to=2026-09-05")).status,
    ).toBe(400);
    expect(
      (
        await foreign
          .get("/api/followups")
          .query({ from: "2026-09-05", to: "2026-09-05" })
      ).body.meta.total,
    ).toBe(0);
  });
  it("accepts a one-sided date range on the renewals list", async () => {
    const dates = async (query: Record<string, unknown>) => {
      const r = await admin
        .get("/api/renewals")
        .query({ clientId: client.id, ...query });
      expect(r.status, r.text).toBe(200);
      return r.body.data.map((e: any) => e.dueDate.slice(0, 10));
    };
    expect(await dates({ from: "2026-09-05" })).toEqual(["2027-09-04"]);
    expect(await dates({ to: "2026-09-04" })).toEqual(["2026-09-04"]);
    expect(await dates({ from: "2026-09-04", to: "2027-09-04" })).toEqual([
      "2026-09-04",
      "2027-09-04",
    ]);
    expect(await dates({ range: "Renewed", from: "2026-09-05" })).toEqual([]);
    expect((await admin.get("/api/renewals?from=2026-13-01")).status).toBe(422);
    expect(
      (await admin.get("/api/renewals?from=2026-09-05&to=2026-09-04")).status,
    ).toBe(400);
  });
  it("agrees across dashboard totals and financial lists", async () => {
    const premiums = (rows: any[]) =>
      rows
        .filter((e: any) => e.amountMeaning === "Premium due")
        .reduce((a: bigint, e: any) => a + BigInt(e.outstandingMinor), 0n);
    const read = async () => {
      const dashboard = (await admin.get("/api/dashboard")).body.data;
      const list = (await admin.get("/api/renewals?range=Next%2030%20Days"))
        .body;
      const overdue = (await admin.get("/api/renewals?range=Overdue")).body;
      expect(dashboard.renewalsDue).toBe(list.meta.total);
      expect(BigInt(dashboard.premiumDueMinor)).toBe(premiums(list.data));
      expect(BigInt(dashboard.premiumOverdueMinor)).toBe(
        premiums(overdue.data),
      );
      return dashboard;
    };
    const before = await read();
    // Part-paid premium due inside the window: only the balance is due.
    const part = await write("/renewals", {
      productId: product.id,
      type: "Premium payment",
      dueDate: "2026-09-12",
      amountMinor: "2450000",
    });
    expect(part.status, part.text).toBe(201);
    expect(
      (
        await write(`/renewals/${part.body.data.id}/payment`, {
          reference: "PART-DUE",
          amountMinor: "1000000",
        })
      ).status,
    ).toBe(200);
    // Unpaid balance on a premium due yesterday is overdue, not dropped.
    const late = await write("/renewals", {
      productId: product.id,
      type: "Premium payment",
      dueDate: "2026-09-03",
      amountMinor: "500000",
    });
    expect(late.status, late.text).toBe(201);
    expect(
      (
        await write(`/renewals/${late.body.data.id}/payment`, {
          reference: "PART-LATE",
          amountMinor: "200000",
        })
      ).status,
    ).toBe(200);
    const dashboard = await read();
    expect(dashboard.renewalsDue).toBe(before.renewalsDue + 1);
    expect(BigInt(dashboard.premiumDueMinor)).toBe(
      BigInt(before.premiumDueMinor) + 1450000n,
    );
    expect(BigInt(dashboard.premiumOverdueMinor)).toBe(
      BigInt(before.premiumOverdueMinor) + 300000n,
    );
    const row = dashboard.events.find((e: any) => e.id === part.body.data.id);
    expect(row.amountMinor).toBe("2450000");
    expect(row.outstandingMinor).toBe("1450000");
    expect(row.payments).toBeUndefined();
    const detail = (await admin.get("/api/renewals/" + late.body.data.id)).body
      .data;
    expect(detail.paidMinor).toBe("200000");
    expect(detail.outstandingMinor).toBe("300000");
    // A confirmed event owes nothing.
    expect(
      (await admin.get("/api/renewals/" + event.id)).body.data.outstandingMinor,
    ).toBe("0");
    expect(dashboard.totalClients).toBe(
      await db.client.count({ where: { organizationId: org } }),
    );
  });
  it("keeps dashboard totals exact beyond the list limits", async () => {
    const read = async () => (await admin.get("/api/dashboard")).body.data;
    const before = await read();
    const total = 2005,
      eventAt = new Date(before.today + "T00:00:00.000Z");
    eventAt.setUTCDate(eventAt.getUTCDate() + 3);
    const dueAt = new Date(before.today + "T10:00:00.000Z");
    const events = Array.from({ length: total }, (_, i) => ({
      _id: randomUUID() as any,
      id: randomUUID(),
      organizationId: org,
      clientId: client.id,
      productId: product.id,
      type: "Cap test " + i,
      dueDate: eventAt,
      amountMinor: 100n,
      amountMeaning: "Premium due",
      currency: "INR",
      status: "Pending",
      recurrenceMonths: null,
      version: 1,
      completedAt: null,
    }));
    events.forEach((e) => (e._id = e.id));
    const followups = Array.from({ length: total }, () => {
      const id = randomUUID();
      return {
        _id: id as any,
        id,
        organizationId: org,
        clientId: client.id,
        opportunityId: null,
        productId: null,
        eventId: null,
        ownerId: owner,
        channel: "Call",
        dueAt,
        priority: "Normal",
        notes: "dashboard-cap",
        state: "pending",
        outcome: null,
        completedAt: null,
        version: 1,
        createdAt: dueAt,
      };
    });
    const leadIds: string[] = [];
    try {
      await db.native.collection("FinancialEvent").insertMany(events);
      await db.native.collection("FollowUp").insertMany(followups);
      const stamp = new Date();
      const leadRows = Array.from({ length: 12 }, (_, i) => {
        const id = randomUUID();
        leadIds.push(id);
        return {
          _id: id as any,
          id,
          organizationId: org,
          clientId: client.id,
          requirement: "Cap test lead " + i,
          stage: "New",
          ownerId: owner,
          priority: i < 3 ? "High" : "Normal",
          source: "Test",
          notes: "",
          nextAction: "",
          nextFollowUp: null,
          lostReason: null,
          version: 1,
          createdAt: stamp,
          updatedAt: stamp,
        };
      });
      await db.native.collection("Opportunity").insertMany(leadRows);
      const after = await read();
      // Lists stop at their limits; every figure still counts everything.
      expect(after.events.length).toBe(2000);
      expect(after.followups.length).toBe(2000);
      expect(after.leads.length).toBeLessThanOrEqual(10);
      expect(after.truncated).toMatchObject({
        events: true,
        followups: true,
        leads: true,
      });
      expect(after.renewalsDue).toBe(before.renewalsDue + total);
      expect(BigInt(after.premiumDueMinor)).toBe(
        BigInt(before.premiumDueMinor) + BigInt(total) * 100n,
      );
      expect(after.bins.reduce((a: number, b: any) => a + b.count, 0)).toBe(
        after.renewalsDue,
      );
      expect(after.followupsToday).toBe(before.followupsToday + total);
      expect(after.activeLeads).toBe(before.activeLeads + 12);
      expect(after.totalLeads).toBe(before.totalLeads + 12);
      expect(after.hotLeads).toBe(before.hotLeads + 3);
      expect(after.totalClients).toBe(before.totalClients);
      // Same counts as the paginated lists the cards link to.
      const list = (await admin.get("/api/renewals?range=Next%2030%20Days"))
        .body;
      expect(after.renewalsDue).toBe(list.meta.total);
    } finally {
      await db.native
        .collection("FinancialEvent")
        .deleteMany({ organizationId: org, type: /^Cap test / });
      await db.native
        .collection("FollowUp")
        .deleteMany({ organizationId: org, notes: "dashboard-cap" });
      await db.opportunity.deleteMany({ where: { id: { in: leadIds } } });
    }
    const restored = await read();
    expect(restored.renewalsDue).toBe(before.renewalsDue);
    expect(BigInt(restored.premiumDueMinor)).toBe(
      BigInt(before.premiumDueMinor),
    );
  }, 120000);
  it("lists communications only for the caller's organisation", async () => {
    const other = await foreign
      .post("/api/clients")
      .set("X-CSRF-Token", foreignToken)
      .send({
        name: "Foreign Contact",
        phone: "+919000077771",
        kind: "Individual",
      });
    expect(other.status, other.text).toBe(201);
    const send = (agent: any, t: string, clientId: string) =>
      agent.post("/api/communications").set("X-CSRF-Token", t).send({
        clientId,
        channel: "Call",
        event: "Manual outcome",
        body: "Isolation check",
      });
    expect((await send(foreign, foreignToken, other.body.data.id)).status).toBe(
      201,
    );
    expect((await send(admin, token, client.id)).status).toBe(201);
    const mine = (await admin.get("/api/communications")).body.data;
    expect(mine.length).toBeGreaterThan(0);
    expect(
      mine.every(
        (r: any) => r.clientId === client.id || r.client.id === r.clientId,
      ),
    ).toBe(true);
    expect(mine.some((r: any) => r.clientId === other.body.data.id)).toBe(
      false,
    );
    const ownIds = new Set(
      (await db.client.findMany({ where: { organizationId: org } })).map(
        (c) => c.id,
      ),
    );
    expect(mine.every((r: any) => ownIds.has(r.clientId))).toBe(true);
    // Asking for another organisation's client id yields nothing, not its rows.
    const probe = await admin.get(
      "/api/communications?clientId=" + other.body.data.id,
    );
    expect(probe.status).toBe(200);
    expect(probe.body.data).toEqual([]);
    const theirs = (await foreign.get("/api/communications")).body.data;
    expect(theirs.length).toBeGreaterThan(0);
    expect(theirs.every((r: any) => r.clientId === other.body.data.id)).toBe(
      true,
    );
  });
  it("returns a month-end series to its own day after a short month", async () => {
    const first = await write("/renewals", {
      productId: product.id,
      type: "Premium payment",
      dueDate: "2026-01-31",
      amountMinor: "0",
      recurrenceMonths: 1,
    });
    expect(first.status, first.text).toBe(201);
    const pending = () =>
      db.financialEvent.findFirstOrThrow({
        where: {
          productId: product.id,
          type: "Premium payment",
          recurrenceMonths: 1,
          status: "Pending",
        },
      });
    for (const next of ["2026-02-28", "2026-03-31", "2026-04-30"]) {
      const e = await pending();
      const r = await write(`/renewals/${e.id}/complete`, {
        version: e.version,
      });
      expect(r.status, r.text).toBe(200);
      expect((await pending()).dueDate.toISOString()).toBe(
        next + "T00:00:00.000Z",
      );
    }
  });
  it("deduplicates durable reminders and exposes retry failures", async () => {
    const next = await db.financialEvent.findFirstOrThrow({
      where: { productId: product.id, status: "Pending" },
    });
    const j = await db.job.create({
      data: {
        organizationId: org,
        key: "TEST-" + prefix,
        type: "reminder",
        payload: { eventId: next.id, userId: owner },
        runAt: new Date("2026-09-01T00:00:00Z"),
      },
    });
    const claims = await Promise.all([runJob(), runJob(), runJob()]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    await db.job.update({ where: { id: j.id }, data: { state: "pending" } });
    await runJob();
    expect(await db.notification.count({ where: { id: j.id } })).toBe(1);
    const bad = await db.job.create({
      data: {
        organizationId: org,
        key: "BAD-" + prefix,
        type: "unknown",
        payload: {},
        runAt: new Date("2026-09-01T00:00:00Z"),
        attempts: 4,
      },
    });
    await runJob();
    expect((await db.job.findUnique({ where: { id: bad.id } }))?.state).toBe(
      "failed",
    );
    expect((await write(`/jobs/${bad.id}/retry`)).status).toBe(200);
  });
  it("rolls back a multi-record MongoDB transaction after a failure", async () => {
    const id = randomUUID();
    await expect(
      db.transaction(async (tx) => {
        await tx.note.create({
          data: {
            id,
            clientId: client.id,
            body: "Must roll back",
            authorId: owner,
          },
        });
        await tx.client.update({
          where: { id: client.id },
          data: { notesText: "Must roll back" },
        });
        throw new Error("Deliberate rollback");
      }),
    ).rejects.toThrow("Deliberate rollback");
    expect(await db.note.findUnique({ where: { id } })).toBeNull();
    expect(
      (await db.client.findUniqueOrThrow({ where: { id: client.id } }))
        .notesText,
    ).not.toBe("Must roll back");
  });
  it("stores and sums money above the JavaScript safe integer boundary exactly", async () => {
    const id = randomUUID(),
      exact = 9007199254740993n;
    await db.financialEvent.create({
      data: {
        id,
        organizationId: org,
        clientId: client.id,
        productId: product.id,
        type: "Maturity",
        dueDate: new Date("2030-01-01T00:00:00Z"),
        amountMinor: exact,
        amountMeaning: "Investment proceeds",
      },
    });
    await db.payment.create({
      data: {
        eventId: id,
        amountMinor: exact,
        reference: "EXACT",
        recordedBy: owner,
      },
    });
    expect(
      (await db.financialEvent.findUniqueOrThrow({ where: { id } }))
        .amountMinor,
    ).toBe(exact);
    expect(
      (
        await db.payment.aggregate({
          where: { eventId: id },
          _sum: { amountMinor: true },
        })
      )._sum.amountMinor,
    ).toBe(exact);
    const raw = await db.native
      .collection("FinancialEvent")
      .aggregate([
        { $match: { id } },
        { $project: { type: { $type: "$amountMinor" } } },
      ])
      .next();
    expect(raw?.type).toBe("long");
  });
  it("enforces collection validation and optional unique opportunity links", async () => {
    await expect(
      db.native
        .collection<any>("FinancialEvent")
        .insertOne({ _id: randomUUID(), id: randomUUID(), amountMinor: 1.5 }),
    ).rejects.toMatchObject({ code: 121 });
    const first = await db.clientProduct.create({
      data: {
        organizationId: org,
        clientId: client.id,
        definitionId: definition.id,
        identifier: "OPTIONAL-1-" + prefix,
        startDate: new Date(),
      },
    });
    const second = await db.clientProduct.create({
      data: {
        organizationId: org,
        clientId: client.id,
        definitionId: definition.id,
        identifier: "OPTIONAL-2-" + prefix,
        startDate: new Date(),
      },
    });
    expect(first.opportunityId).toBeNull();
    expect(second.opportunityId).toBeNull();
    await expect(
      db.clientProduct.create({
        data: {
          organizationId: org,
          clientId: client.id,
          definitionId: definition.id,
          opportunityId: lead.id,
          identifier: "DUP-" + prefix,
          startDate: new Date(),
        },
      }),
    ).rejects.toMatchObject({ code: 11000 });
  });
  it("serializes concurrent duplicate checks without silently adding contacts", async () => {
    const values = {
      name: "Concurrent Person",
      phone: "9000088819",
      email: `concurrent-${prefix}@example.test`,
      kind: "Individual",
    };
    const responses = await Promise.all([
      write("/clients", values),
      write("/clients", values),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(
      await db.contact.count({
        where: { organizationId: org, email: values.email },
      }),
    ).toBe(1);
  });
  it("trusts only exact browser origins", () => {
    expect(isAllowedOrigin(process.env.APP_ORIGIN)).toBe(true);
    expect(
      isAllowedOrigin("https://crm.example.test", "crm.example.test"),
    ).toBe(true);
    for (const origin of [
      "https://evil.up.railway.app",
      "https://evil.vercel.app",
      "https://parvath-finance-crm-production.up.railway.app",
      "https://crm.example.test.evil.test",
    ])
      expect(isAllowedOrigin(origin, "crm.example.test")).toBe(false);
  });
  it("reports not ready when the stored schema fingerprint differs from the build", async () => {
    expect((await request(app).get("/api/ready")).status).toBe(200);
    const versions = db.native.collection<any>("schemaVersions");
    const current = await versions.findOne({ _id: "current" });
    await versions.updateOne(
      { _id: "current" },
      { $set: { fingerprint: "stale" } },
    );
    try {
      expect((await request(app).get("/api/ready")).status).toBe(503);
    } finally {
      await versions.updateOne(
        { _id: "current" },
        { $set: { fingerprint: current.fingerprint } },
      );
    }
  });
  it("rejects records for a deleted client and deactivated owners", async () => {
    const made = await write("/clients", {
      name: "Orphan Guard",
      phone: "+919000077701",
    });
    expect(made.status).toBe(201);
    const id = made.body.data.id;
    const lead = {
      clientId: id,
      ownerId: opsId,
      requirement: "Term cover",
      nextAction: "Call back",
      stage: "New Enquiries",
    };
    await db.user.update({ where: { id: opsId }, data: { active: false } });
    try {
      expect((await write("/leads", lead)).status).toBe(400);
    } finally {
      await db.user.update({ where: { id: opsId }, data: { active: true } });
    }
    expect((await write("/clients/" + id, {}, "delete")).status).toBe(200);
    expect(
      await db.native
        .collection<any>("contactLocks")
        .countDocuments({ _id: "client:" + id }),
    ).toBe(0);
    expect((await write("/leads", { ...lead, ownerId: owner })).status).toBe(
      404,
    );
  });
  it("answers malformed JSON with 400 instead of a server error", async () => {
    const csrf = await admin.get("/api/auth/csrf");
    const r = await admin
      .post("/api/clients")
      .set("X-CSRF-Token", csrf.body.data.csrf)
      .set("Content-Type", "application/json")
      .send("{not json");
    expect(r.status).toBe(400);
    expect(r.body.error.message).not.toMatch(/unexpected error/i);
  });
  it("closes pending follow-ups when a lead is marked Lost", async () => {
    const made = await write("/clients", {
      name: "Lost Lead Client",
      phone: "+919000077702",
    });
    const clientId = made.body.data.id;
    const l = await write("/leads", {
      clientId,
      ownerId: owner,
      requirement: "Health cover",
      nextAction: "Call back",
      stage: "New Enquiries",
    });
    expect(l.status).toBe(201);
    const f = await write("/followups", {
      clientId,
      ownerId: owner,
      channel: "Call",
      dueAt: "2026-09-10T05:00:00.000Z",
      notes: "Chase quote",
      opportunityId: l.body.data.id,
    });
    expect(f.status).toBe(201);
    const lost = await write(`/leads/${l.body.data.id}/stage`, {
      stage: "Lost",
      version: l.body.data.version,
      reason: "Chose another adviser",
    });
    expect(lost.status).toBe(200);
    const after = await db.followUp.findUniqueOrThrow({
      where: { id: f.body.data.id },
    });
    expect(after.state).toBe("cancelled");
    expect(after.outcome).toBe("Not needed");
  });
  it("provisions non-admin roles, changes them and deactivates members", async () => {
    const email = `adviser-${prefix}@example.test`;
    expect(
      (
        await write("/members", {
          name: "Role Check",
          email,
          role: "Owner",
          password,
        })
      ).status,
    ).toBe(422);
    // New members can only be Administrators for now, so the non-admin role is set afterwards.
    expect(
      (
        await write("/members", {
          name: "Role Check",
          email,
          role: "Adviser",
          password,
        })
      ).status,
    ).toBe(422);
    const created = await write("/members", {
      name: "Role Check",
      email,
      role: "Administrator",
      password,
    });
    expect(created.status).toBe(201);
    const userId = created.body.data.id;
    try {
      const list = (await admin.get("/api/members")).body.data;
      const m = list.find((x: any) => x.user.id === userId);
      expect(m.role).toBe("Administrator");
      expect(m.user.active).toBe(true);
      expect(
        (await write("/members/" + m.id, { role: "Adviser" }, "patch")).status,
      ).toBe(200);
      const self = list.find((x: any) => x.user.id === owner);
      expect(
        (await write("/members/" + self.id, { role: "Operations" }, "patch"))
          .status,
      ).toBe(409);
      expect(
        (await write("/members/" + self.id, { active: false }, "patch")).status,
      ).toBe(409);
      expect((await write("/members/" + m.id, {}, "patch")).status).toBe(422);
      const member = request.agent(app);
      const memberToken = await login(member, email);
      // Adviser may edit; after demotion to Operations the same session may not.
      expect(
        (await member.get("/api/reports/export?module=clients")).status,
      ).toBe(200);
      expect(
        (await write("/members/" + m.id, { role: "Operations" }, "patch"))
          .status,
      ).toBe(200);
      expect(
        (await member.get("/api/reports/export?module=clients")).status,
      ).toBe(403);
      expect(
        (
          await member
            .patch("/api/members/" + m.id)
            .set("X-CSRF-Token", memberToken)
            .send({ role: "Administrator" })
        ).status,
      ).toBe(403);
      expect(
        (await write("/members/" + m.id, { active: false }, "patch")).status,
      ).toBe(200);
      expect((await member.get("/api/clients")).status).toBe(401);
      const csrf = await member.get("/api/auth/csrf");
      expect(
        (
          await member
            .post("/api/auth/login")
            .set("X-CSRF-Token", csrf.body.data.csrf)
            .send({ email, password })
        ).status,
      ).toBe(401);
      expect(
        (await write("/members/" + m.id, { active: true }, "patch")).status,
      ).toBe(200);
      await login(member, email);
      expect((await member.get("/api/clients")).status).toBe(200);
    } finally {
      await db.native
        .collection("sessions")
        .deleteMany({ "session.userId": userId });
      await db.membership.deleteMany({ where: { userId } });
      await db.user.deleteMany({ where: { id: userId } });
    }
  });
  describe("financial event correction and cancellation", () => {
    let held: any, premium: any, second: any;
    const dashboard = async () => (await admin.get("/api/dashboard")).body.data;
    const stored = (id: string) =>
      db.financialEvent.findUniqueOrThrow({ where: { id } });
    it("corrects a mis-keyed amount and the dashboard premium total follows", async () => {
      const created = await write("/products", {
        clientId: client.id,
        definitionId: definition.id,
        identifier: "EVT-" + prefix,
        status: "Active",
        startDate: "2026-01-01",
        expectedCommissionMinor: "50000",
      });
      expect(created.status, created.text).toBe(201);
      held = created.body.data;
      const before = BigInt((await dashboard()).premiumDueMinor);
      const r = await write("/renewals", {
        productId: held.id,
        type: "Premium payment",
        dueDate: "2026-09-10",
        amountMinor: "24500000",
        recurrenceMonths: 12,
      });
      expect(r.status, r.text).toBe(201);
      premium = r.body.data;
      expect(BigInt((await dashboard()).premiumDueMinor)).toBe(
        before + 24500000n,
      );
      expect(
        (
          await ops
            .patch("/api/renewals/" + premium.id)
            .set("X-CSRF-Token", opsToken)
            .send({ amountMinor: "2450000", version: premium.version })
        ).status,
      ).toBe(403);
      expect(
        (await write("/renewals/" + premium.id, { version: 1 }, "patch"))
          .status,
      ).toBe(422);
      const fixed = await write(
        "/renewals/" + premium.id,
        { amountMinor: "2450000", version: premium.version },
        "patch",
      );
      expect(fixed.status, fixed.text).toBe(200);
      expect(fixed.body.data.amountMinor).toBe("2450000");
      expect(fixed.body.data.version).toBe(premium.version + 1);
      expect(fixed.body.data.dueDate.slice(0, 10)).toBe("2026-09-10");
      expect(fixed.body.data.recurrenceMonths).toBe(12);
      expect(BigInt((await dashboard()).premiumDueMinor)).toBe(
        before + 2450000n,
      );
      expect(
        (
          await write(
            "/renewals/" + premium.id,
            { amountMinor: "2450001", version: premium.version },
            "patch",
          )
        ).status,
      ).toBe(409);
      expect(
        await db.activity.count({
          where: {
            organizationId: org,
            entityId: premium.id,
            action: "update",
          },
        }),
      ).toBe(1);
      premium = fixed.body.data;
    });
    it("rejects an amount below what is already paid", async () => {
      const payment = await write(`/renewals/${premium.id}/payment`, {
        reference: "PART-1",
        amountMinor: "1000000",
      });
      expect(payment.status, payment.text).toBe(200);
      premium = await stored(premium.id);
      const low = await write(
        "/renewals/" + premium.id,
        { amountMinor: "999999", version: premium.version },
        "patch",
      );
      expect(low.status).toBe(400);
      expect(low.body.error.message).toContain(
        "₹10,000 already recorded as paid",
      );
      expect((await stored(premium.id)).amountMinor).toBe(2450000n);
    });
    it("names a due-date collision and retires reminders when the date moves", async () => {
      const r = await write("/renewals", {
        productId: held.id,
        type: "Premium payment",
        dueDate: "2026-09-20",
        amountMinor: "300000",
        recurrenceMonths: 12,
      });
      expect(r.status, r.text).toBe(201);
      second = r.body.data;
      const clash = await write(
        "/renewals/" + second.id,
        { dueDate: "2026-09-10", version: second.version },
        "patch",
      );
      expect(clash.status).toBe(409);
      expect(clash.body.error.message).toBe(
        "A Premium payment event already exists for this product on 2026-09-10",
      );
      const duplicate = await write("/renewals", {
        productId: held.id,
        type: "Premium payment",
        dueDate: "2026-09-20",
        amountMinor: "300000",
      });
      expect(duplicate.status).toBe(409);
      expect(duplicate.body.error.message).not.toContain("Record conflict");
      const reminder = await write(`/renewals/${second.id}/reminder`, {
        runAt: "2026-09-19T06:30:00Z",
      });
      expect(reminder.status).toBe(201);
      const moved = await write(
        "/renewals/" + second.id,
        {
          dueDate: "2026-09-21",
          recurrenceMonths: null,
          version: second.version,
        },
        "patch",
      );
      expect(moved.status, moved.text).toBe(200);
      expect(moved.body.data.dueDate.slice(0, 10)).toBe("2026-09-21");
      expect(moved.body.data.recurrenceMonths).toBeNull();
      expect(moved.body.data.amountMinor).toBe("300000");
      expect(moved.body.meta.remindersCancelled).toBe(1);
      expect(
        (await db.job.findUnique({ where: { id: reminder.body.data.id } }))
          ?.state,
      ).toBe("cancelled");
      second = moved.body.data;
    });
    it("refuses to cancel an event that has a payment", async () => {
      const r = await write(`/renewals/${premium.id}/cancel`, {
        reason: "Keyed in error",
        version: premium.version,
      });
      expect(r.status).toBe(400);
      expect(r.body.error.message).toContain("recorded payments");
      expect((await stored(premium.id)).status).toBe("Pending");
    });
    it("cancels a pending event and removes it from due counts and sums", async () => {
      const before = await dashboard();
      const reminder = await write(`/renewals/${second.id}/reminder`, {
        runAt: "2026-09-20T06:30:00Z",
      });
      expect(reminder.status).toBe(201);
      expect(
        (
          await write(`/renewals/${second.id}/cancel`, {
            version: second.version,
          })
        ).status,
      ).toBe(422);
      expect(
        (
          await ops
            .post(`/api/renewals/${second.id}/cancel`)
            .set("X-CSRF-Token", opsToken)
            .send({ reason: "Duplicate entry", version: second.version })
        ).status,
      ).toBe(403);
      const r = await write(`/renewals/${second.id}/cancel`, {
        reason: "Duplicate entry",
        version: second.version,
      });
      expect(r.status, r.text).toBe(200);
      expect(r.body.data.status).toBe("Cancelled");
      const repeat = await write(`/renewals/${second.id}/cancel`, {
        reason: "Duplicate entry",
        version: second.version,
      });
      expect(repeat.status).toBe(200);
      expect(repeat.body.data.status).toBe("Cancelled");
      expect(
        await db.activity.count({
          where: {
            organizationId: org,
            entityId: second.id,
            action: "cancel",
          },
        }),
      ).toBe(1);
      const after = await dashboard();
      expect(after.renewalsDue).toBe(before.renewalsDue - 1);
      expect(BigInt(after.premiumDueMinor)).toBe(
        BigInt(before.premiumDueMinor) - 300000n,
      );
      expect(after.events.find((e: any) => e.id === second.id).timing).toBe(
        "Cancelled",
      );
      const due = (await admin.get("/api/renewals?range=Next%2030%20Days"))
        .body;
      expect(due.meta.total).toBe(after.renewalsDue);
      expect(due.data.map((e: any) => e.id)).not.toContain(second.id);
      const cancelled = (await admin.get("/api/renewals?range=Cancelled")).body;
      expect(cancelled.data.map((e: any) => e.id)).toEqual([second.id]);
      const detail = (await admin.get("/api/renewals/" + second.id)).body.data;
      expect(detail.timing).toBe("Cancelled");
      expect(detail.cancelReason).toBe("Duplicate entry");
      expect(
        (await db.job.findUnique({ where: { id: reminder.body.data.id } }))
          ?.state,
      ).toBe("cancelled");
      // No next recurrence, and nothing further may be done to the event.
      expect(
        await db.financialEvent.count({ where: { productId: held.id } }),
      ).toBe(2);
      for (const [path, body] of [
        ["payment", { reference: "LATE-1", amountMinor: "100" }],
        ["complete", { version: r.body.data.version }],
        ["reminder", { runAt: "2026-09-20T07:30:00Z" }],
      ] as const)
        expect(
          (await write(`/renewals/${second.id}/${path}`, body)).status,
        ).toBeGreaterThanOrEqual(400);
      const sameDate = await write("/renewals", {
        productId: held.id,
        type: "Premium payment",
        dueDate: "2026-09-21",
        amountMinor: "300000",
      });
      expect(sameDate.status).toBe(409);
      expect(sameDate.body.error.message).toContain(
        "A cancelled Premium payment event already exists for this product on 2026-09-21",
      );
    });
    it("reverses a wrongly recorded payment once, with a reason", async () => {
      const created = await write("/renewals", {
        productId: held.id,
        type: "Insurance renewal",
        dueDate: "2026-09-25",
        amountMinor: "400000",
      });
      expect(created.status, created.text).toBe(201);
      const id = created.body.data.id;
      const before = await dashboard();
      const pay = (reference: string, amountMinor: string) =>
        write(`/renewals/${id}/payment`, { reference, amountMinor });
      const reverse = (paymentId: string, body: any, eventId = id) =>
        write(`/renewals/${eventId}/payments/${paymentId}/reverse`, body);
      const wrong = await pay("REV-1", "400000");
      expect(wrong.status, wrong.text).toBe(200);
      const corrected = await pay("REV-1", "150000");
      expect(corrected.status).toBe(409);
      expect(corrected.body.error.message).toContain(
        "A payment with reference REV-1 already exists for a different amount",
      );
      expect((await pay("REV-1", "400000")).body.data.id).toBe(
        wrong.body.data.id,
      );
      expect(BigInt((await dashboard()).premiumDueMinor)).toBe(
        BigInt(before.premiumDueMinor) - 400000n,
      );
      const paymentId = wrong.body.data.id;
      expect(
        (
          await ops
            .post(`/api/renewals/${id}/payments/${paymentId}/reverse`)
            .set("X-CSRF-Token", opsToken)
            .send({ reason: "Wrong amount keyed" })
        ).status,
      ).toBe(403);
      expect((await reverse(paymentId, {})).status).toBe(422);
      expect(
        (await reverse(randomUUID(), { reason: "Wrong amount keyed" })).status,
      ).toBe(404);
      // A payment of another event is not reachable through this one.
      expect(
        (await reverse(paymentId, { reason: "Wrong event" }, premium.id))
          .status,
      ).toBe(404);
      const r = await reverse(paymentId, { reason: "Wrong amount keyed" });
      expect(r.status, r.text).toBe(200);
      expect(r.body.data.amountMinor).toBe("-400000");
      expect(r.body.data.reference).toBe("Reversal of REV-1");
      const repeat = await reverse(paymentId, { reason: "Wrong amount keyed" });
      expect(repeat.status).toBe(200);
      expect(repeat.body.data.id).toBe(r.body.data.id);
      expect(await db.payment.count({ where: { eventId: id } })).toBe(2);
      const again = await reverse(r.body.data.id, { reason: "Undo the undo" });
      expect(again.status).toBe(400);
      expect(again.body.error.message).toBe(
        "A reversal cannot itself be reversed",
      );
      const log = await db.activity.findMany({
        where: {
          organizationId: org,
          entityId: id,
          action: "payment-reversal",
        },
      });
      expect(log.map((a) => a.summary)).toEqual([
        "Payment REV-1 of ₹4,000 reversed: Wrong amount keyed",
      ]);
      // Net zero behaves as unpaid everywhere.
      const detail = (await admin.get("/api/renewals/" + id)).body.data;
      expect(detail.paidMinor).toBe("0");
      expect(detail.outstandingMinor).toBe("400000");
      expect(detail.payments).toHaveLength(2);
      expect(BigInt((await dashboard()).premiumDueMinor)).toBe(
        BigInt(before.premiumDueMinor),
      );
      expect(
        (await write(`/renewals/${id}/complete`, { version: detail.version }))
          .status,
      ).toBe(400);
      // The reversed reference stays taken, and the reversal prefix is reserved.
      const reused = await pay("REV-1", "150000");
      expect(reused.status).toBe(409);
      expect(reused.body.error.message).toContain("recorded and reversed");
      expect((await pay("REV-1", "400000")).status).toBe(409);
      expect((await pay("Reversal of REV-2", "100")).status).toBe(400);
      const right = await pay("REV-1A", "150000");
      expect(right.status, right.text).toBe(200);
      expect(
        (await admin.get("/api/renewals/" + id)).body.data.outstandingMinor,
      ).toBe("250000");
      // Fully reversed, the event holds no money and can be cancelled.
      expect(
        (await reverse(right.body.data.id, { reason: "Not received" })).status,
      ).toBe(200);
      const current = await stored(id);
      const cancelled = await write(`/renewals/${id}/cancel`, {
        reason: "Entered on the wrong product",
        version: current.version,
      });
      expect(cancelled.status, cancelled.text).toBe(200);
      expect(cancelled.body.data.status).toBe("Cancelled");
      // Nothing is reversed once an event is cancelled or confirmed.
      const closed = await reverse(paymentId, { reason: "Too late" });
      expect(closed.status).toBe(400);
      expect(closed.body.error.message).toContain("this event is cancelled");
      const settled = await db.payment.findFirstOrThrow({
        where: { eventId: event.id },
      });
      const confirmed = await reverse(
        settled.id,
        { reason: "Too late" },
        event.id,
      );
      expect(confirmed.status).toBe(400);
      expect(confirmed.body.error.message).toContain("this event is confirmed");
      expect(await db.payment.count({ where: { eventId: event.id } })).toBe(1);
    });
    it("closing a product cancels its unpaid pending events only", async () => {
      const unpaid = await write("/renewals", {
        productId: held.id,
        type: "Insurance renewal",
        dueDate: "2026-10-01",
        amountMinor: "700000",
        recurrenceMonths: 12,
      });
      expect(unpaid.status, unpaid.text).toBe(201);
      const before = await dashboard();
      const current = (await admin.get("/api/products/" + held.id)).body.data;
      const closed = await write(
        "/products/" + held.id,
        {
          identifier: current.identifier,
          status: "Closed",
          startDate: "2026-01-01",
          expectedCommissionMinor: "50000",
          version: current.version,
        },
        "patch",
      );
      expect(closed.status, closed.text).toBe(200);
      expect(closed.body.data).toMatchObject({
        cancelledEvents: 1,
        keptEvents: 1,
      });
      expect((await stored(unpaid.body.data.id)).status).toBe("Cancelled");
      expect((await stored(premium.id)).status).toBe("Pending");
      expect(
        (await admin.get("/api/renewals/" + unpaid.body.data.id)).body.data
          .cancelReason,
      ).toBe("Product closed");
      const after = await dashboard();
      expect(after.renewalsDue).toBe(before.renewalsDue - 1);
      expect(BigInt(after.premiumDueMinor)).toBe(
        BigInt(before.premiumDueMinor) - 700000n,
      );
    });
    it("rejects a new event on a closed product", async () => {
      const r = await write("/renewals", {
        productId: held.id,
        type: "Premium payment",
        dueDate: "2026-11-01",
        amountMinor: "100000",
      });
      expect(r.status).toBe(400);
      expect(r.body.error.message).toContain("closed");
    });
  });
  it("password reset is single-use and revokes existing sessions", async () => {
    const resetToken =
      randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "");
    await db.passwordReset.create({
      data: {
        userId: opsId,
        tokenHash: createHash("sha256").update(resetToken).digest("hex"),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    const guest = request.agent(app);
    const csrf = (await guest.get("/api/auth/csrf")).body.data.csrf;
    const r = await guest
      .post("/api/auth/reset-password")
      .set("X-CSRF-Token", csrf)
      .send({ token: resetToken, password: "Replacement-" + randomUUID() });
    expect(r.status, r.text).toBe(200);
    expect((await ops.get("/api/auth/me")).status).toBe(401);
    expect(
      (
        await guest
          .post("/api/auth/reset-password")
          .set("X-CSRF-Token", csrf)
          .send({ token: resetToken, password: "Another-" + randomUUID() })
      ).status,
    ).toBe(400);
  });
  it("does not count opened conversations as connected contact", async () => {
    const prior = (await admin.get("/api/clients/" + client.id)).body.data;
    await write("/communications", {
      clientId: client.id,
      channel: "WhatsApp",
      event: "Conversation opened",
    });
    const after = (await admin.get("/api/clients/" + client.id)).body.data;
    expect(after.lastContactAt).toBe(prior.lastContactAt);
    expect(after.health.score).toBe(prior.health.score);
  });
  it("enforces onboarding validation on the server for every client write", async () => {
    const base = { name: "Rules Example", kind: "Individual" };
    let n = 0;
    const post = (extra: any) =>
      write("/clients", {
        ...base,
        phone: `+9190000${String(70000 + ++n)}`,
        ...extra,
      });
    for (const [label, extra] of [
      ["future birth date", { dob: "2999-01-01" }],
      ["impossible birth date", { dob: "2023-02-31" }],
      ["bad phone", { phone: "12345" }],
      ["bad email", { email: "abc" }],
      ["negative dependents", { onboardingProfile: { dependents: "-2" } }],
      ["fractional dependents", { onboardingProfile: { dependents: "1.5" } }],
      ["bad PIN code", { onboardingProfile: { pinCode: "ABC" } }],
      ["PIN starting with 0", { onboardingProfile: { pinCode: "012345" } }],
      ["negative savings", { onboardingProfile: { monthlySavings: "-500" } }],
      ["text savings", { onboardingProfile: { totalSavings: "abc" } }],
      [
        "future spouse birth date",
        { onboardingProfile: { spouseDob: "2999-01-01" } },
      ],
      [
        "future child birth date",
        { onboardingProfile: { children: [{ dob: "2999-01-01" }] } },
      ],
      [
        "impossible child birth date",
        { onboardingProfile: { children: [{ dob: "2024-02-30" }] } },
      ],
      [
        "future client-since date",
        { onboardingProfile: { clientSince: "2999-01-01" } },
      ],
      [
        "incomplete follow-up",
        { onboardingProfile: { initialFollowup: { enabled: true } } },
      ],
    ] as [string, any][]) {
      const r = await post(extra);
      expect(r.status, `${label}: ${r.text}`).toBe(422);
    }
    expect(
      await db.contact.count({
        where: { organizationId: org, name: "Rules Example" },
      }),
    ).toBe(0);
    // Blank optional fields and common ways of writing amounts and PIN codes remain valid.
    const ok = await post({
      dob: "1990-02-28",
      onboardingProfile: {
        dependents: "",
        pinCode: "600 001",
        monthlySavings: "₹ 25,000",
        totalSavings: "3,00,000.50",
        spouseDob: "",
        clientSince: "",
        children: [{ name: "Child", dob: "" }],
      },
    });
    expect(ok.status, ok.text).toBe(201);
  });
  it("keeps saved onboarding details untouched and validates only what an edit changes", async () => {
    const created = await write("/clients", {
      name: "Legacy Details",
      phone: "+919000077001",
      kind: "Individual",
    });
    expect(created.status, created.text).toBe(201);
    const id = created.body.data.id;
    // Free text saved before the format rules existed.
    const legacy = {
      dependents: "two",
      pinCode: "n/a",
      monthlySavings: "about 5k",
      maritalStatus: "Married",
    };
    await db.client.update({
      where: { id },
      data: { onboardingJson: JSON.stringify(legacy) },
    });
    const current = (await admin.get(`/api/clients/${id}`)).body.data;
    const edited = await write(
      `/clients/${id}`,
      {
        name: "Legacy Details Renamed",
        phone: current.phone,
        kind: "Individual",
        version: current.version,
        onboardingProfile: { ...legacy, companyName: "Example Co" },
      },
      "patch",
    );
    expect(edited.status, edited.text).toBe(200);
    expect(edited.body.data.onboardingProfile).toMatchObject({
      ...legacy,
      companyName: "Example Co",
    });
    const changed = await write(
      `/clients/${id}`,
      {
        name: "Legacy Details Renamed",
        phone: current.phone,
        kind: "Individual",
        version: edited.body.data.version,
        onboardingProfile: { ...legacy, dependents: "three" },
      },
      "patch",
    );
    expect(changed.status, changed.text).toBe(422);
    const stored = (await admin.get(`/api/clients/${id}`)).body.data;
    expect(stored.onboardingProfile.dependents).toBe("two");
  });
  it("pages each lead stage separately with totals for the whole matching set", async () => {
    const holder = await write("/clients", {
      name: "Board Paging Client",
      phone: "+919000077002",
      kind: "Individual",
    });
    expect(holder.status, holder.text).toBe(201);
    const owner0 = await admin.get("/api/leads?stage=New%20Enquiries&limit=1");
    expect(owner0.status, owner0.text).toBe(200);
    const before = owner0.body.meta.total;
    const made: string[] = [];
    const versions: Record<string, number> = {};
    for (const [i, priority] of [
      "Normal",
      "High",
      "Normal",
      "Normal",
      "Urgent",
    ].entries()) {
      const r = await write("/leads", {
        clientId: holder.body.data.id,
        ownerId: owner,
        requirement: `Board paging ${i}`,
        nextAction: "Call back",
        priority,
      });
      expect(r.status, r.text).toBe(201);
      made.push(r.body.data.id);
      versions[r.body.data.id] = r.body.data.version;
    }
    const first = await admin.get(
      "/api/leads?stage=New%20Enquiries&limit=2&page=1",
    );
    expect(first.body.meta.total).toBe(before + 5);
    // (The tests run on a fixed clock, so leads made together tie on time; order is by id then.)
    const seen: string[] = [];
    for (let page = 1; ; page++) {
      const r = await admin.get(
        `/api/leads?stage=New%20Enquiries&limit=2&page=${page}`,
      );
      expect(r.status).toBe(200);
      if (!r.body.data.length) break;
      for (const row of r.body.data) {
        expect(row.stage).toBe("New Enquiries");
        seen.push(row.id);
      }
      expect(r.body.meta.total).toBe(before + 5);
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toHaveLength(before + 5);
    expect(made.every((id) => seen.includes(id))).toBe(true);
    // Filters narrow the total as well as the rows.
    const high = await admin.get(
      "/api/leads?stage=New%20Enquiries&priority=High&limit=100",
    );
    expect(high.body.data.every((r: any) => r.priority === "High")).toBe(true);
    expect(high.body.meta.total).toBe(high.body.data.length);
    expect(
      (
        await admin.get(
          "/api/leads?stage=New%20Enquiries&q=Board%20paging&limit=1",
        )
      ).body.meta.total,
    ).toBe(5);
    // Moving one lead changes both stage totals.
    const moved = await write(`/leads/${made[0]}/stage`, {
      stage: "Contacted",
      version: versions[made[0]],
    });
    expect(moved.status, moved.text).toBe(200);
    expect(
      (await admin.get("/api/leads?stage=New%20Enquiries&limit=1")).body.meta
        .total,
    ).toBe(before + 4);
    expect(
      (await admin.get("/api/leads?stage=Contacted&q=Board%20paging&limit=1"))
        .body.meta.total,
    ).toBe(1);
  });
  it("says plainly which integrations are not set up and refuses to fake them", async () => {
    const saved = {
      S3_BUCKET: config.S3_BUCKET,
      S3_ENDPOINT: config.S3_ENDPOINT,
      S3_ACCESS_KEY: config.S3_ACCESS_KEY,
      S3_SECRET_KEY: config.S3_SECRET_KEY,
      CLAMAV_HOST: config.CLAMAV_HOST,
      SMTP_URL: config.SMTP_URL,
      WHATSAPP_PHONE_NUMBER_ID: config.WHATSAPP_PHONE_NUMBER_ID,
      WHATSAPP_ACCESS_TOKEN: config.WHATSAPP_ACCESS_TOKEN,
    };
    Object.assign(config, {
      S3_BUCKET: "private-bucket",
      S3_ENDPOINT: "http://localhost:9000",
      S3_ACCESS_KEY: "",
      S3_SECRET_KEY: "",
      CLAMAV_HOST: "",
      SMTP_URL: "",
      WHATSAPP_PHONE_NUMBER_ID: "",
      WHATSAPP_ACCESS_TOKEN: "",
    });
    const made = await write("/clients", {
      name: "Integration Example",
      phone: "+919000077003",
      kind: "Individual",
    });
    expect(made.status, made.text).toBe(201);
    const target = made.body.data;
    const send = vi.spyOn(s3, "send");
    try {
      const me = await admin.get("/api/auth/me");
      const found = me.body.data.integrations;
      expect(found.documents.available).toBe(false);
      expect(found.documents.missing).toEqual([
        "S3_ACCESS_KEY",
        "S3_SECRET_KEY",
        "CLAMAV_HOST",
      ]);
      expect(found.email).toMatchObject({
        available: false,
        missing: ["SMTP_URL"],
      });
      expect(found.whatsapp.missing).toEqual([
        "WHATSAPP_PHONE_NUMBER_ID",
        "WHATSAPP_ACCESS_TOKEN",
      ]);
      // Staff who are not administrators are told to ask, not shown setting names.
      const staff = integrations(false);
      expect(staff.documents.missing).toEqual([]);
      expect(staff.documents.message).toMatch(/administrator/i);
      const documentsBefore = await db.document.count({
        where: { clientId: target.id },
      });
      const upload = await admin
        .post(`/api/clients/${target.id}/documents`)
        .set("X-CSRF-Token", token)
        .attach("file", Buffer.from("%PDF-1.4 test"), "synthetic.pdf");
      expect(upload.status, upload.text).toBe(503);
      expect(upload.body.error.message).toContain("CLAMAV_HOST");
      expect(await db.document.count({ where: { clientId: target.id } })).toBe(
        documentsBefore,
      );
      expect(send).not.toHaveBeenCalled();
      expect(
        (
          await write("/whatsapp/broadcasts", {
            clientIds: [target.id],
            template: "renewal_reminder",
            language: "en_US",
            message: "Hello",
          })
        ).status,
      ).toBe(503);
      const reset = await write("/auth/forgot-password", {
        email: `admin-${prefix}@example.test`,
      });
      expect(reset.status, reset.text).toBe(503);
      expect(reset.body.error.message).toMatch(/not configured/i);
    } finally {
      send.mockRestore();
      Object.assign(config, saved);
    }
  });
  it("lists Active and Closed products when no status filter is given", async () => {
    const holder = await write("/clients", {
      name: "Register Listing Client",
      phone: "+919000077004",
      kind: "Individual",
    });
    expect(holder.status, holder.text).toBe(201);
    const insurer = await write("/providers", {
      name: "Register Listing Insurer " + prefix,
    });
    const plan = await write("/catalogue", {
      name: "Register Listing Plan",
      providerId: insurer.body.data.id,
      category: "Health Insurance",
    });
    const made = await write("/products", {
      clientId: holder.body.data.id,
      definitionId: plan.body.data.id,
      identifier: "LISTING-" + prefix.slice(0, 8),
      status: "Active",
      startDate: "2026-01-01",
    });
    expect(made.status, made.text).toBe(201);
    const q = "LISTING-" + prefix.slice(0, 8);
    const unfiltered = await admin.get("/api/products").query({ q });
    expect(unfiltered.body.meta.total).toBe(1);
    expect(unfiltered.body.data[0].status).toBe("Active");
    expect(
      (await admin.get("/api/products").query({ q, status: "Active" })).body
        .meta.total,
    ).toBe(1);
    expect(
      (await admin.get("/api/products").query({ q, status: "Application" }))
        .body.meta.total,
    ).toBe(0);
    expect(
      (
        await admin
          .get("/api/products")
          .query({ q, category: "Health Insurance" })
      ).body.meta.total,
    ).toBe(1);
  });
  it("exports safely and signs out", async () => {
    const r = await admin.get("/api/reports/export?module=clients");
    expect(r.status).toBe(200);
    expect(r.text).toContain("'+919000088881");
    expect((await write("/auth/logout")).status).toBe(200);
    expect((await admin.get("/api/clients")).status).toBe(401);
  });
});

describe("WhatsApp broadcasts", () => {
  const savedCredentials = {
    id: config.WHATSAPP_PHONE_NUMBER_ID,
    token: config.WHATSAPP_ACCESS_TOKEN,
  };
  let consented: any, unconsented: any, noPhone: any;
  const broadcast = (clientIds: string[], extra: any = {}) =>
    admin
      .post("/api/whatsapp/broadcasts")
      .set("X-CSRF-Token", token)
      .send({
        clientIds,
        template: "policy_reminder",
        language: "en_US",
        message: "Your renewal is due next week.",
        ...extra,
      });
  beforeAll(async () => {
    // Earlier tests in this file rotate the admin session, so sign in again here.
    token = await login(admin, `admin-${prefix}@example.test`);
    const make = async (name: string, phone?: string) => {
      const r = await write("/clients", {
        name,
        ...(phone ? { phone } : {}),
        kind: "Individual",
      });
      expect(r.status, r.text).toBe(201);
      return r.body.data;
    };
    consented = await make("Broadcast Consented", "+919000055501");
    unconsented = await make("Broadcast Unconsented", "+919000055502");
    noPhone = await make("Broadcast No Phone", "+919000055503");
    // The API requires a phone on create, so clear it directly to model a client without one.
    await db.contact.update({
      where: { id: noPhone.contactId },
      data: { phone: "" },
    });
    const consent = (clientId: string, granted: boolean) =>
      write(`/clients/${clientId}/consents`, {
        channel: "WhatsApp",
        granted,
        source: "Written opt-in form",
      });
    expect((await consent(consented.id, true)).status).toBe(201);
    expect((await consent(unconsented.id, false)).status).toBe(201);
  });
  afterEach(() => {
    config.WHATSAPP_PHONE_NUMBER_ID = savedCredentials.id;
    config.WHATSAPP_ACCESS_TOKEN = savedCredentials.token;
    vi.unstubAllGlobals();
  });
  it("refuses to send until WhatsApp credentials are configured", async () => {
    config.WHATSAPP_PHONE_NUMBER_ID = undefined;
    config.WHATSAPP_ACCESS_TOKEN = undefined;
    const r = await broadcast([consented.id]);
    expect(r.status).toBe(503);
  });
  it("validates the template name and message", async () => {
    config.WHATSAPP_PHONE_NUMBER_ID = "123456";
    config.WHATSAPP_ACCESS_TOKEN = "test-token";
    expect(
      (await broadcast([consented.id], { template: "Bad Name" })).status,
    ).toBe(422);
    expect((await broadcast([consented.id], { message: "   " })).status).toBe(
      422,
    );
  });
  it("sends only to consented clients with a phone and records every attempt", async () => {
    config.WHATSAPP_PHONE_NUMBER_ID = "123456";
    config.WHATSAPP_ACCESS_TOKEN = "test-token";
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ messages: [{ id: "wamid.TEST1" }] }), {
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const r = await broadcast([consented.id, unconsented.id, noPhone.id]);
    expect(r.status, r.text).toBe(200);
    expect(r.body.data.sent).toBe(1);
    expect(r.body.data.failed).toBe(0);
    const reasons = Object.fromEntries(
      r.body.data.skipped.map((s: any) => [s.clientId, s.reason]),
    );
    expect(reasons[unconsented.id]).toBe("No WhatsApp consent");
    expect(reasons[noPhone.id]).toBe("No phone number");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, any];
    expect(url).toContain("/123456/messages");
    const payload = JSON.parse(init.body);
    expect(payload.to).toBe("919000055501");
    expect(payload.template.name).toBe("policy_reminder");
    const history = (
      await admin.get("/api/communications?clientId=" + consented.id)
    ).body.data;
    const sent = history.find((c: any) => c.event === "Broadcast sent");
    expect(sent.providerId).toBe("wamid.TEST1");
    expect(sent.body).toBe("Your renewal is due next week.");
    const skippedHistory = (
      await admin.get("/api/communications?clientId=" + unconsented.id)
    ).body.data;
    expect(
      skippedHistory.some((c: any) => c.event.startsWith("Broadcast")),
    ).toBe(false);
  });
  it("records a provider failure instead of counting it as sent", async () => {
    config.WHATSAPP_PHONE_NUMBER_ID = "123456";
    config.WHATSAPP_ACCESS_TOKEN = "test-token";
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ error: { message: "Template not approved" } }),
            { status: 400 },
          ),
      ),
    );
    const r = await broadcast([consented.id]);
    expect(r.status, r.text).toBe(200);
    expect(r.body.data.sent).toBe(0);
    expect(r.body.data.failed).toBe(1);
    expect(r.body.data.failures[0].error).toBe("Template not approved");
    const history = (
      await admin.get("/api/communications?clientId=" + consented.id)
    ).body.data;
    expect(
      history.find((c: any) => c.event === "Broadcast failed"),
    ).toBeTruthy();
  });
});
