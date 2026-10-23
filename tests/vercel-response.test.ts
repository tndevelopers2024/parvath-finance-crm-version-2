import type { Request, Response } from "express";
import type { IncomingMessage, ServerResponse } from "node:http";
import request from "supertest";
import { expect, it, vi } from "vitest";

vi.mock("../apps/api/src/db.js", () => ({
  mongoClient: { connect: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("../apps/api/src/app.js", async () => {
  const { default: express } = await import("express");
  const app = express();
  app.set("json replacer", (_key: string, value: unknown) =>
    typeof value === "bigint" ? value.toString() : value,
  );
  app.get("/api/dashboard", (_req, res) =>
    res.json({ data: { expectedRevenueMinor: 9007199254740993n } }),
  );
  return { app, logger: { error: vi.fn() } };
});

it("uses Express serialization when Vercel supplies its own response helpers", async () => {
  const { default: handler } = await import("../api/index.js");
  // The platform helpers shadow Express's prototype methods and do not use
  // app.get('json replacer'); JSON.stringify on this payload would throw.
  const platformJson = vi.fn((body: unknown) => JSON.stringify(body));
  const platformSend = vi.fn();
  const response = await request(
    (req: IncomingMessage, res: ServerResponse) => {
      Object.assign(res, { json: platformJson, send: platformSend });
      void handler(req as Request, res as Response);
    },
  ).get("/api/dashboard");

  expect(response.status).toBe(200);
  expect(response.headers["content-type"]).toContain("application/json");
  expect(response.body).toEqual({
    data: { expectedRevenueMinor: "9007199254740993" },
  });
  expect(platformJson).not.toHaveBeenCalled();
  expect(platformSend).not.toHaveBeenCalled();
});
