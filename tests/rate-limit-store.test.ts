import { it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { MongoRateLimitStore } from "../apps/api/src/rate-limit-store.js";
import { db, mongoClient } from "../apps/api/src/db.js";
const namespace = `test-${randomUUID()}`;
afterAll(async () => {
  await db.native
    .collection("rateLimits")
    .deleteMany({ _id: { $regex: `^${namespace}:` } } as any);
  await mongoClient.close();
});
it("shares atomic limits across instances and resets expired counters", async () => {
  const a = new MongoRateLimitStore(namespace),
    b = new MongoRateLimitStore(namespace);
  a.init({ windowMs: 60000 });
  b.init({ windowMs: 60000 });
  const results = await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      (i % 2 ? a : b).increment("person@example.test"),
    ),
  );
  expect(results.map((r) => r.totalHits).sort((x, y) => x - y)).toEqual(
    Array.from({ length: 20 }, (_, i) => i + 1),
  );
  const collection = db.native.collection("rateLimits");
  const row = await collection.findOne({
    _id: { $regex: `^${namespace}:` },
  } as any);
  expect(String(row!._id)).not.toContain("person@example.test");
  await collection.updateOne(
    { _id: row!._id },
    { $set: { resetTime: new Date(0) } },
  );
  expect((await b.increment("person@example.test")).totalHits).toBe(1);
  await a.resetKey("person@example.test");
  expect((await b.increment("person@example.test")).totalHits).toBe(1);
});
