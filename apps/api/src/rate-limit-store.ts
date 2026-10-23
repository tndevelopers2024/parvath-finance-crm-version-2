import { createHash } from "node:crypto";
import type { Store } from "express-rate-limit";
import { db } from "./db.js";

// Shared across serverless instances. Hash identifiers so IPs/emails are not stored.
export class MongoRateLimitStore implements Store {
  windowMs = 60000;
  localKeys = false;
  private ready?: Promise<string>;
  constructor(private namespace: string) {}
  init(options: { windowMs: number }) {
    this.windowMs = options.windowMs;
  }
  private collection() {
    return db.native.collection<{
      _id: string;
      totalHits: number;
      resetTime: Date;
    }>("rateLimits");
  }
  private id(key: string) {
    return `${this.namespace}:${createHash("sha256").update(key).digest("hex")}`;
  }
  async increment(key: string) {
    this.ready ??= this.collection()
      .createIndex({ resetTime: 1 }, { expireAfterSeconds: 0 })
      .catch((error) => {
        this.ready = undefined;
        throw error;
      });
    await this.ready;
    const now = new Date();
    const expired = { $lte: [{ $ifNull: ["$resetTime", new Date(0)] }, now] };
    const update = [
      {
        $set: {
          totalHits: { $cond: [expired, 1, { $add: ["$totalHits", 1] }] },
          resetTime: {
            $cond: [
              expired,
              new Date(now.getTime() + this.windowMs),
              "$resetTime",
            ],
          },
        },
      },
    ];
    let result;
    try {
      result = await this.collection().findOneAndUpdate(
        { _id: this.id(key) },
        update,
        { upsert: true, returnDocument: "after" },
      );
    } catch (error: any) {
      // Concurrent first requests can race on the unique _id upsert.
      if (error.code !== 11000) throw error;
      result = await this.collection().findOneAndUpdate(
        { _id: this.id(key) },
        update,
        { upsert: true, returnDocument: "after" },
      );
    }
    return { totalHits: result!.totalHits, resetTime: result!.resetTime };
  }
  async decrement(key: string) {
    await this.collection().updateOne(
      { _id: this.id(key), totalHits: { $gt: 0 } },
      { $inc: { totalHits: -1 } },
    );
  }
  async resetKey(key: string) {
    await this.collection().deleteOne({ _id: this.id(key) });
  }
}
