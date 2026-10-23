import express, { type Request, type Response } from "express";
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
  // Vercel's API helpers are own properties on the response and shadow
  // Express's prototype methods. Use Express's helpers so app settings such
  // as the bigint JSON replacer apply to monetary values in API responses.
  res.json = express.response.json;
  res.send = express.response.send;
  app(req, res);
}
