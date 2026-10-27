import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import request from "supertest";
import { app } from "../apps/api/src/app.js";
import { db } from "../apps/api/src/db.js";
import { migrateDatabase } from "../apps/api/src/persistence/migrate.js";

const admin = request.agent(app);
let org: string,
  userId: string,
  token: string,
  clientId: string,
  definitionId: string;
const write = (path: string, body: any, method: "post" | "patch" = "post") =>
  admin[method]("/api" + path)
    .set("X-CSRF-Token", token)
    .send(body);
beforeAll(async () => {
  await migrateDatabase();
  org = (
    await db.organization.create({
      data: { name: "Workflow regression " + randomUUID() },
    })
  ).id;
  const email = randomUUID() + "@example.test",
    password = randomUUID();
  userId = (
    await db.user.create({
      data: {
        name: "Regression adviser",
        email,
        passwordHash: await argon2.hash(password),
        memberships: { create: { organizationId: org, role: "Administrator" } },
      },
    })
  ).id;
  const csrf = await admin.get("/api/auth/csrf");
  const login = await admin
    .post("/api/auth/login")
    .set("X-CSRF-Token", csrf.body.data.csrf)
    .send({ email, password });
  expect(login.status).toBe(200);
  token = login.body.data.csrf;
  const client = await write("/clients", {
    name: "Regression Client",
    phone: "+919000077779",
    kind: "Individual",
  });
  expect(client.status).toBe(201);
  clientId = client.body.data.id;
  const provider = await write("/providers", { name: "Regression Provider" });
  const plan = await write("/catalogue", {
    name: "Regression Plan",
    providerId: provider.body.data.id,
    category: "Life Insurance",
  });
  expect(plan.status).toBe(201);
  definitionId = plan.body.data.id;
});
afterAll(async () => {
  if (org)
    await db.transaction(async (tx) => {
      await tx.followUp.deleteMany({ where: { organizationId: org } });
      await tx.opportunityStageHistory.deleteMany({
        where: { opportunity: { organizationId: org } },
      });
      await tx.payment.deleteMany({
        where: { event: { organizationId: org } },
      });
      await tx.financialEvent.deleteMany({ where: { organizationId: org } });
      await tx.clientProduct.deleteMany({ where: { organizationId: org } });
      await tx.opportunity.deleteMany({ where: { organizationId: org } });
      await tx.communication.deleteMany({ where: { clientId } });
      await tx.client.deleteMany({ where: { organizationId: org } });
      await tx.contact.deleteMany({ where: { organizationId: org } });
      await tx.productDefinition.deleteMany({ where: { organizationId: org } });
      await tx.provider.deleteMany({ where: { organizationId: org } });
      await tx.activity.deleteMany({ where: { organizationId: org } });
      await tx.membership.deleteMany({ where: { organizationId: org } });
      await tx.organization.delete({ where: { id: org } });
      if (userId) await tx.user.delete({ where: { id: userId } });
      await tx.native
        .collection("sessions")
        .deleteMany({ "session.userId": userId }, { session: tx.session });
      await tx.native
        .collection<any>("contactLocks")
        .deleteMany(
          { _id: { $in: [org, `client:${clientId}`] } },
          { session: tx.session },
        );
    });
  await db.close();
});

it("distinguishes omitted, cleared, and zero product amounts", async () => {
  const created = await write("/products", {
    clientId,
    definitionId,
    identifier: randomUUID(),
    startDate: "2026-09-04",
    premiumMinor: "125050",
    principalMinor: "500000",
  });
  expect(created.status).toBe(201);
  const p = created.body.data;
  const edit = (version: number, amounts = {}) =>
    write(
      `/products/${p.id}`,
      {
        identifier: p.identifier,
        startDate: "2026-09-04",
        status: p.status,
        version,
        ...amounts,
      },
      "patch",
    );
  expect((await edit(p.version)).status).toBe(200);
  let current = (await admin.get(`/api/products/${p.id}`)).body.data;
  expect(current.premiumMinor).toBe("125050");
  expect(current.principalMinor).toBe("500000");
  expect(
    (await edit(current.version, { premiumMinor: null, principalMinor: null }))
      .status,
  ).toBe(200);
  current = (await admin.get(`/api/products/${p.id}`)).body.data;
  expect(current.premiumMinor).toBeNull();
  expect(current.principalMinor).toBeNull();
  expect(
    (await edit(current.version, { premiumMinor: "0", principalMinor: "0" }))
      .status,
  ).toBe(200);
  current = (await admin.get(`/api/products/${p.id}`)).body.data;
  expect(current.premiumMinor).toBe("0");
  expect(current.principalMinor).toBe("0");
});

it("keeps lead dates and tasks synchronized through editing, completion and cancellation", async () => {
  const body = {
    clientId,
    ownerId: userId,
    requirement: "Sync regression",
    nextAction: "Discuss cover",
    nextFollowUp: "2026-09-05T06:30:00.000Z",
  };
  const created = await write("/leads", body);
  expect(created.status).toBe(201);
  const id = created.body.data.id;
  const readLead = async () => (await admin.get(`/api/leads/${id}`)).body.data;
  const pending = async () =>
    (await admin.get(`/api/followups?clientId=${clientId}`)).body.data
      .filter((t: any) => t.opportunityId === id && t.state === "pending")
      .sort((a: any, b: any) => a.dueAt.localeCompare(b.dueAt));
  const editLead = async (nextFollowUp: string | null) => {
    const lead = await readLead();
    const result = await write(
      `/leads/${id}`,
      {
        ...body,
        nextAction: "Send comparison",
        nextFollowUp,
        version: lead.version,
      },
      "patch",
    );
    expect(result.status, result.text).toBe(200);
  };
  await editLead("2026-09-06T06:30:00.000Z");
  let task = (await pending())[0];
  expect(task.dueAt).toBe("2026-09-06T06:30:00.000Z");
  expect(task.notes).toBe("Send comparison");
  const beforeTaskChange = await readLead();
  const moved = await write(
    `/followups/${task.id}`,
    { ...task, ownerId: userId, dueAt: "2026-09-07T06:30:00.000Z" },
    "patch",
  );
  expect(moved.status, moved.text).toBe(200);
  expect((await readLead()).nextFollowUp).toBe("2026-09-07T06:30:00.000Z");
  expect(
    (
      await write(
        `/leads/${id}`,
        { ...body, version: beforeTaskChange.version },
        "patch",
      )
    ).status,
  ).toBe(409);
  const extra = await write("/followups", {
    clientId,
    ownerId: userId,
    opportunityId: id,
    dueAt: "2026-09-12T06:30:00.000Z",
    channel: "Call",
    notes: "Later review",
  });
  expect(extra.status).toBe(201);
  expect((await readLead()).nextFollowUp).toBe("2026-09-07T06:30:00.000Z");
  task = (await pending())[0];
  const completed = await write(`/followups/${task.id}/complete`, {
    version: task.version,
    state: "completed",
    outcome: "Connected",
    nextDueAt: "2026-09-09T06:30:00.000Z",
  });
  expect(completed.status, completed.text).toBe(200);
  expect((await readLead()).nextFollowUp).toBe("2026-09-09T06:30:00.000Z");
  await editLead(null);
  expect(await pending()).toHaveLength(0);
  expect((await readLead()).nextFollowUp).toBeNull();
  await editLead("2026-09-11T06:30:00.000Z");
  task = (await pending())[0];
  const cancelled = await write(`/followups/${task.id}/complete`, {
    version: task.version,
    state: "cancelled",
    outcome: "Not needed",
  });
  expect(cancelled.status).toBe(200);
  expect((await readLead()).nextFollowUp).toBeNull();
});

it("groups legacy Qualified leads under Contacted and includes both High and Urgent in Hot", async () => {
  const ids: string[] = [];
  for (const priority of ["Normal", "High", "Urgent"]) {
    const r = await write("/leads", {
      clientId,
      ownerId: userId,
      requirement: "Hot filter regression",
      nextAction: "Contact client",
      priority,
      stage: "Qualified",
    });
    expect(r.status).toBe(201);
    ids.push(r.body.data.id);
  }
  const hot = await admin.get("/api/leads").query({
    clientId,
    q: "Hot filter regression",
    priority: "Hot",
    stage: "Contacted",
  });
  expect(hot.status, hot.text).toBe(200);
  expect(hot.body.meta.total).toBe(2);
  expect(new Set(hot.body.data.map((l: any) => l.id))).toEqual(
    new Set(ids.slice(1)),
  );
  expect((await admin.get("/api/leads?priority=invalid")).status).toBe(422);
});

it("returns exact today, seven-day and thirty-day event totals with net premium balances", async () => {
  const product = await write("/products", {
    clientId,
    definitionId,
    identifier: randomUUID(),
    startDate: "2026-09-04",
  });
  expect(product.status).toBe(201);
  for (const [dueDate, amountMinor] of [
    ["2026-09-03", "20000"],
    ["2026-09-04", "10000"],
    ["2026-09-07", "30000"],
    ["2026-09-12", "40000"],
  ]) {
    const event = await write("/renewals", {
      productId: product.body.data.id,
      type: "Insurance renewal",
      dueDate,
      amountMinor,
    });
    expect(event.status, event.text).toBe(201);
    if (dueDate === "2026-09-04")
      expect(
        (
          await write(`/renewals/${event.body.data.id}/payment`, {
            reference: "today-part-payment",
            amountMinor: "4000",
          })
        ).status,
      ).toBe(200);
  }
  const result = await admin.get("/api/dashboard");
  expect(result.status).toBe(200);
  expect(result.body.data).toMatchObject({
    renewalsToday: 1,
    renewalsNext7Days: 2,
    renewalsDue: 3,
    premiumTodayMinor: "6000",
    premiumDueMinor: "76000",
    premiumOverdueMinor: "20000",
  });
});
