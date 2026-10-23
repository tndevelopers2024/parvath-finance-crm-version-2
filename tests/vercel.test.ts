import type { Request, Response } from "express";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  app: vi.fn(),
  error: vi.fn(),
}));
vi.mock("../apps/api/src/db.js", () => ({
  mongoClient: { connect: mocks.connect },
}));
vi.mock("../apps/api/src/app.js", () => ({
  app: mocks.app,
  logger: { error: mocks.error },
}));

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
});

it("shares a pending connection and forwards the original API request", async () => {
  let connected!: () => void;
  mocks.connect.mockReturnValue(
    new Promise<void>((resolve) => {
      connected = resolve;
    }),
  );
  const { default: handler } = await import("../api/index.js");
  const req = { url: "/api/clients?search=demo", method: "GET" } as Request;
  const res = {} as Response;
  const first = handler(req, res);
  const second = handler(req, res);
  expect(mocks.connect).toHaveBeenCalledTimes(1);
  expect(mocks.app).not.toHaveBeenCalled();
  connected();
  await Promise.all([first, second]);
  await handler(req, res);
  expect(mocks.connect).toHaveBeenCalledTimes(1);
  expect(mocks.app).toHaveBeenCalledTimes(3);
  expect(mocks.app).toHaveBeenCalledWith(req, res);
  expect(req.url).toBe("/api/clients?search=demo");
});

it("returns a safe, uncached 503 and retries after a database outage", async () => {
  mocks.connect
    .mockRejectedValueOnce(new Error("sensitive connection details"))
    .mockResolvedValueOnce(undefined);
  const { default: handler } = await import("../api/index.js");
  const req = {} as Request;
  const response = {
    setHeader: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  };
  await handler(req, response as unknown as Response);
  expect(response.status).toHaveBeenCalledWith(503);
  expect(response.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
  expect(response.json).toHaveBeenCalledWith({
    error: "Database temporarily unavailable",
  });
  expect(mocks.error).toHaveBeenCalledWith(
    "MongoDB connection failed in Vercel Function",
  );
  expect(mocks.app).not.toHaveBeenCalled();
  await handler(req, response as unknown as Response);
  expect(mocks.connect).toHaveBeenCalledTimes(2);
  expect(mocks.app).toHaveBeenCalledTimes(1);
});
