import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import argon2 from "argon2";
import { createHash, randomUUID } from "node:crypto";
import { app } from "../apps/api/src/app.js";
import { db } from "../apps/api/src/db.js";
import { migrateDatabase } from "../apps/api/src/persistence/migrate.js";
import { runJob } from "../apps/api/src/worker.js";
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
  it("agrees across dashboard totals and financial lists", async () => {
    const dashboard = (await admin.get("/api/dashboard")).body.data;
    const list = (await admin.get("/api/renewals?range=Next%2030%20Days")).body;
    expect(dashboard.renewalsDue).toBe(list.meta.total);
    expect(BigInt(dashboard.premiumDueMinor)).toBe(
      list.data
        .filter((e: any) => e.amountMeaning === "Premium due")
        .reduce((a: bigint, e: any) => a + BigInt(e.amountMinor), 0n),
    );
    expect(dashboard.totalClients).toBe(
      await db.client.count({ where: { organizationId: org } }),
    );
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
  it("exports safely and signs out", async () => {
    const r = await admin.get("/api/reports/export?module=clients");
    expect(r.status).toBe(200);
    expect(r.text).toContain("'+919000088881");
    expect((await write("/auth/logout")).status).toBe(200);
    expect((await admin.get("/api/clients")).status).toBe(401);
  });
});
