import type { Request, Response } from "express";
import { app, logger } from "../apps/api/src/app.js";
import { mongoClient } from "../apps/api/src/db.js";

// Reuse the client/pool across warm invocations. Do not start the persistent
// listener or polling worker from apps/api/src/index.ts inside a Function.
let connection: Promise<unknown> | undefined;

export default async function handler(req: Request, res: Response) {
  try {
    connection ??= mongoClient.connect();
    await connection;
  } catch {
    connection = undefined;
    logger.error("MongoDB connection failed in Vercel Function");
    res.setHeader("Cache-Control", "no-store");
    res.status(503).json({ error: "Database temporarily unavailable" });
    return;
  }
  app(req, res);
}
