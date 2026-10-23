import { it, expect, afterAll, beforeAll } from "vitest";
import { randomUUID, createHash } from "node:crypto";
import argon2 from "argon2";
import request from "supertest";
import { app } from "../apps/api/src/app.js";
import { db } from "../apps/api/src/db.js";
import { migrateDatabase } from "../apps/api/src/persistence/migrate.js";
let userId: string, orgId: string;
const email = `recovery-${randomUUID()}@example.test`;
beforeAll(async () => {
  await migrateDatabase();
  orgId = (
    await db.organization.create({ data: { name: "Recovery security test" } })
  ).id;
  userId = (
    await db.user.create({
      data: {
        name: "Recovery test",
        email,
        passwordHash: await argon2.hash(randomUUID()),
        memberships: { create: { organizationId: orgId, role: "Operations" } },
      },
    })
  ).id;
});
afterAll(async () => {
  if (userId) {
    await db.passwordReset.deleteMany({ where: { userId } });
    await db.membership.deleteMany({ where: { userId } });
    await db.native
      .collection("sessions")
      .deleteMany({ "session.userId": userId });
    await db.user.delete({ where: { id: userId } });
  }
  if (orgId) await db.organization.delete({ where: { id: orgId } });
  await db.close();
});
async function recoveryLink() {
  const token = randomUUID().replaceAll("-", "").repeat(2);
  await db.passwordReset.create({
    data: {
      userId,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 60000),
    },
  });
  return token;
}
it("allows only one concurrent recovery and invalidates links on password changes", async () => {
  const tokens = await Promise.all([recoveryLink(), recoveryLink()]);
  const guests = [request.agent(app), request.agent(app)];
  const csrf = await Promise.all(
    guests.map(async (g) => (await g.get("/api/auth/csrf")).body.data.csrf),
  );
  const passwords = [randomUUID(), randomUUID()];
  const results = await Promise.all(
    guests.map((g, i) =>
      g
        .post("/api/auth/reset-password")
        .set("X-CSRF-Token", csrf[i])
        .send({ token: tokens[i], password: passwords[i] }),
    ),
  );
  expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
  const winner = results.findIndex((r) => r.status === 200);
  const agent = guests[winner];
  const login = await agent
    .post("/api/auth/login")
    .set("X-CSRF-Token", csrf[winner])
    .send({ email, password: passwords[winner] });
  expect(login.status).toBe(200);
  const pending = await recoveryLink();
  const changed = await agent
    .patch("/api/auth/account")
    .set("X-CSRF-Token", login.body.data.csrf)
    .send({
      name: "Recovery test",
      currentPassword: passwords[winner],
      newPassword: randomUUID(),
    });
  expect(changed.status).toBe(200);
  const denied = await agent
    .post("/api/auth/reset-password")
    .set("X-CSRF-Token", login.body.data.csrf)
    .send({ token: pending, password: randomUUID() });
  expect(denied.status).toBe(400);
});
