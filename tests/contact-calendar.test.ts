import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import argon2 from "argon2";
import { randomUUID } from "node:crypto";
import { app } from "../apps/api/src/app.js";
import { db } from "../apps/api/src/db.js";
import { migrateDatabase } from "../apps/api/src/persistence/migrate.js";
import { runJob } from "../apps/api/src/worker.js";
import {
  dateOccasions,
  refreshImportantDateJobs,
} from "../apps/api/src/important-dates.js";
import { contactRestriction } from "../packages/contracts/src/contact-policy.js";

const agent = request.agent(app);
let org: string, user: string, csrf: string;
const ids: string[] = [];
const send = (path: string, body: any, method: "post" | "patch" = "post") =>
  agent[method]("/api" + path)
    .set("X-CSRF-Token", csrf)
    .send(body);
beforeAll(async () => {
  await migrateDatabase();
  org = (
    await db.organization.create({
      data: { name: "Contact/calendar test " + randomUUID() },
    })
  ).id;
  const email = randomUUID() + "@example.test",
    password = randomUUID();
  user = (
    await db.user.create({
      data: {
        name: "Policy tester",
        email,
        passwordHash: await argon2.hash(password),
        memberships: { create: { organizationId: org, role: "Administrator" } },
      },
    })
  ).id;
  const initial = (await agent.get("/api/auth/csrf")).body.data.csrf;
  const login = await agent
    .post("/api/auth/login")
    .set("X-CSRF-Token", initial)
    .send({ email, password });
  expect(login.status).toBe(200);
  csrf = login.body.data.csrf;
});
afterAll(async () => {
  if (org) {
    await db.communication.deleteMany({ where: { clientId: { in: ids } } });
    await db.followUp.deleteMany({ where: { organizationId: org } });
    await db.job.deleteMany({ where: { organizationId: org } });
    await db.notification.deleteMany({ where: { organizationId: org } });
    await db.activity.deleteMany({ where: { organizationId: org } });
    await db.client.deleteMany({ where: { organizationId: org } });
    await db.contact.deleteMany({ where: { organizationId: org } });
    await db.membership.deleteMany({ where: { organizationId: org } });
    await db.organization.delete({ where: { id: org } });
    await db.user.delete({ where: { id: user } });
    await db.native.collection("contactLocks").deleteMany({
      _id: { $in: [org, ...ids.map((id) => "client:" + id)] },
    } as any);
    await db.native
      .collection("sessions")
      .deleteMany({ "session.userId": user });
  }
  await db.close();
});
const make = async (profile: any) => {
  const r = await send("/clients", {
    name: "Policy client",
    phone: "+9198" + String(10000000 + ids.length),
    onboardingProfile: profile,
  });
  expect(r.status, r.text).toBe(201);
  ids.push(r.body.data.id);
  return r.body.data;
};
describe("Contact preferences and important-date reminders", () => {
  it("uses timezone, weekdays and exclusive time boundaries", () => {
    const p = { noCallsDuringHours: true };
    expect(
      contactRestriction(p, "Call", new Date("2026-09-04T03:29:00Z")),
    ).toBeNull();
    expect(
      contactRestriction(p, "Call", new Date("2026-09-04T03:30:00Z")),
    ).toMatch(/working hours/);
    expect(
      contactRestriction(p, "Call", new Date("2026-09-04T12:30:00Z")),
    ).toBeNull();
    expect(
      contactRestriction(p, "Call", new Date("2026-09-05T06:30:00Z")),
    ).toBeNull();
    expect(
      contactRestriction(
        { bestDay: "Weekends" },
        "WhatsApp",
        new Date("2026-09-04T06:30:00Z"),
      ),
    ).toMatch(/weekends/);
    expect(
      contactRestriction(
        { preferredTime: "Morning (9 AM – 12 PM)" },
        "Email",
        new Date("2026-09-04T06:30:00Z"),
      ),
    ).toMatch(/morning/);
    expect(
      contactRestriction({ whatsappOnly: true }, "Email", new Date()),
    ).toMatch(/WhatsApp/);
    expect(
      contactRestriction(
        p,
        "Call",
        new Date("2026-09-04T03:30:00Z"),
        "Europe/London",
      ),
    ).toBeNull();
  });
  it("enforces outreach and scheduling without blocking drafts or historical outcomes", async () => {
    const c = await make({ whatsappOnly: true });
    expect(
      (
        await send("/communications", {
          clientId: c.id,
          channel: "Call",
          event: "Conversation opened",
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await send("/communications", {
          clientId: c.id,
          channel: "Call",
          event: "Manual outcome",
          body: "Historical call",
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await send("/communications", {
          clientId: c.id,
          channel: "Email",
          event: "Message prepared",
        })
      ).status,
    ).toBe(201);
    const body = {
      clientId: c.id,
      ownerId: user,
      channel: "Call",
      notes: "Planned contact",
      dueAt: "2026-09-04T13:00:00Z",
    };
    expect((await send("/followups", body)).status).toBe(422);
    expect(
      (
        await send("/leads", {
          clientId: c.id,
          ownerId: user,
          requirement: "Coverage",
          nextAction: "Discuss coverage",
          nextFollowUp: body.dueAt,
        })
      ).status,
    ).toBe(422);
    const good = await send("/followups", { ...body, channel: "WhatsApp" });
    expect(good.status, good.text).toBe(201);
    expect(
      (
        await send(
          "/followups/" + good.body.data.id,
          { ...body, version: 1 },
          "patch",
        )
      ).status,
    ).toBe(422);
    const normal = await make({
      noCallsDuringHours: true,
      preferredTime: "Evening (6 PM – 9 PM)",
      bestDay: "Friday",
    });
    expect(
      (
        await send("/followups", {
          ...body,
          clientId: normal.id,
          dueAt: "2026-09-04T04:30:00Z",
        })
      ).status,
    ).toBe(422);
    const evening = await send("/followups", {
      ...body,
      clientId: normal.id,
      dueAt: "2026-09-04T13:00:00Z",
    });
    expect(evening.status, evening.text).toBe(201);
    expect(
      (
        await send(`/followups/${evening.body.data.id}/complete`, {
          version: 1,
          state: "completed",
          outcome: "Connected",
          nextDueAt: "2026-09-04T04:30:00Z",
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await send("/communications", {
          clientId: normal.id,
          channel: "Call",
          event: "Conversation opened",
        })
      ).status,
    ).toBe(422);
    const edited = await send(
      "/clients/" + c.id,
      {
        name: c.name,
        phone: c.phone,
        version: c.version,
        occupation: "Edited without profile",
      },
      "patch",
    );
    expect(edited.status, edited.text).toBe(200);
    expect(edited.body.data.onboardingProfile.whatsappOnly).toBe(true);
  });
  it("schedules the initial call outside restricted working hours", async () => {
    const c = await make({
      noCallsDuringHours: true,
      initialFollowup: {
        enabled: true,
        date: "2026-09-04",
        channel: "Call",
        notes: "Evening initial call",
      },
    });
    const rows = await db.followUp.findMany({ where: { clientId: c.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].dueAt.toISOString()).toBe("2026-09-04T12:30:00.000Z");
  });
  it("handles leap anniversaries, yearly opt-in and one-time custom dates", () => {
    const profile = {
      weddingDate: "2020-02-29",
      importantDates: [
        { type: "Visit", date: "2026-03-05" },
        { type: "Anniversary", date: "2020-03-06", repeatAnnually: true },
      ],
    };
    expect(
      dateOccasions(profile, "2026-02-01", "2026-04-01").map((r) => r.date),
    ).toEqual(["2026-02-28", "2026-03-05", "2026-03-06"]);
    expect(
      dateOccasions(profile, "2027-01-01", "2027-12-31").map((r) => r.date),
    ).toEqual(["2027-02-28", "2027-03-06"]);
  });
  it("shows dates, creates durable reminders once and cancels removed dates", async () => {
    const c = await make({
      weddingDate: "2010-09-04",
      importantDates: [
        { type: "Review", date: "2026-09-04", description: "Annual check" },
      ],
    });
    const dashboard = await agent.get(
      "/api/dashboard?from=2026-09-01&to=2026-10-01",
    );
    expect(dashboard.status, dashboard.text).toBe(200);
    expect(
      dashboard.body.data.importantDates.filter(
        (r: any) => r.clientId === c.id,
      ),
    ).toHaveLength(2);
    const due = await db.job.findMany({
      where: {
        organizationId: org,
        type: "important-date",
        runAt: { lte: new Date("2026-09-04T06:30:00Z") },
      },
    });
    expect(due).toHaveLength(2);
    for (let i = 0; i < 30; i++) {
      if (
        (await db.job.count({
          where: { id: { in: due.map((j) => j.id) }, state: "pending" },
        })) === 0
      )
        break;
      await runJob();
    }
    expect(
      await db.notification.count({
        where: { organizationId: org, userId: user },
      }),
    ).toBe(2);
    await refreshImportantDateJobs();
    await runJob();
    expect(
      await db.notification.count({
        where: { organizationId: org, userId: user },
      }),
    ).toBe(2);
    const edited = await send(
      "/clients/" + c.id,
      {
        name: c.name,
        phone: c.phone,
        version: c.version,
        onboardingProfile: { weddingDate: "", importantDates: [] },
      },
      "patch",
    );
    expect(edited.status, edited.text).toBe(200);
    expect(
      await db.job.count({
        where: {
          organizationId: org,
          type: "important-date",
          state: "pending",
        },
      }),
    ).toBe(0);
    const after = await agent.get(
      "/api/dashboard?from=2026-09-01&to=2026-10-01",
    );
    expect(
      after.body.data.importantDates.filter((r: any) => r.clientId === c.id),
    ).toHaveLength(0);
  });
});
