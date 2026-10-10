import net from "node:net";
import { randomUUID } from "node:crypto";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { db } from "./db.js";
import { config } from "./config.js";
import { now } from "./domain.js";
import { s3 } from "./documents.js";
import pino from "pino";
const log = pino({ level: config.NODE_ENV === "test" ? "silent" : "info" });
export async function runJob() {
  const leaseToken = randomUUID();
  // A job that keeps killing the worker never reaches the catch block below, so its attempt cap
  // is enforced here: an expired lease on a job already at the cap fails instead of being reclaimed.
  await db.native.collection<any>("Job").updateMany(
    {
      state: "processing",
      attempts: { $gte: 5 },
      $expr: { $lt: ["$lockedAt", { $subtract: ["$$NOW", 5 * 60000] }] },
    },
    { $set: { state: "failed", lastError: "WORKER_LOST" } },
  );
  const job = await db.native.collection<any>("Job").findOneAndUpdate(
    {
      $or: [
        { state: "pending", runAt: { $lte: now() } },
        {
          state: "processing",
          $expr: { $lt: ["$lockedAt", { $subtract: ["$$NOW", 5 * 60000] }] },
        },
      ],
    },
    [
      {
        $set: {
          state: "processing",
          lockedAt: "$$NOW",
          leaseToken,
          attempts: { $add: ["$attempts", 1] },
        },
      },
    ],
    { sort: { runAt: 1, id: 1 }, returnDocument: "after" },
  );
  if (!job) return false;
  try {
    if (job.type === "reminder")
      await db.transaction(async (tx) => {
        const current = await tx.job.findUniqueOrThrow({
          where: { id: job.id },
        });
        if (current.state !== "processing" || current.leaseToken !== leaseToken)
          return;
        const p = job.payload;
        const event = await tx.financialEvent.findFirst({
          where: {
            id: p.eventId,
            organizationId: job.organizationId,
            status: "Pending",
          },
        });
        if (event) {
          await tx.notification.upsert({
            where: { id: job.id },
            create: {
              id: job.id,
              organizationId: job.organizationId,
              userId: p.userId,
              title: `Reminder: ${event.type} due ${event.dueDate.toISOString().slice(0, 10)}`,
              link: `/renewals/${event.id}`,
            },
            update: {},
          });
        }
        await tx.job.update({
          where: { id: job.id },
          data: { state: event ? "completed" : "cancelled" },
        });
      });
    else if (job.type === "scan") {
      if (!config.CLAMAV_HOST) throw new Error("SCANNER_NOT_CONFIGURED");
      const doc = await db.document.findFirstOrThrow({
        where: {
          id: job.payload.documentId,
          organizationId: job.organizationId,
        },
      });
      const object = await s3.send(
        new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: doc.key }),
        { abortSignal: AbortSignal.timeout(30000) },
      );
      const buffer = Buffer.from(await object.Body!.transformToByteArray());
      const clean = await new Promise<boolean>((resolve, reject) => {
        const socket = net.createConnection({
          host: config.CLAMAV_HOST,
          port: config.CLAMAV_PORT,
        });
        let response = "";
        socket.setTimeout(30000, () => {
          socket.destroy();
          reject(new Error("SCAN_TIMEOUT"));
        });
        socket.on("error", reject);
        socket.on("data", (b) => {
          response += b.toString();
        });
        // An infected reply is "stream: <signature> FOUND"; a signature name may itself contain "OK".
        socket.on("end", () =>
          /\bFOUND\b/.test(response)
            ? resolve(false)
            : /^stream: OK\0?\s*$/.test(response)
              ? resolve(true)
              : reject(new Error("SCAN_FAILED")),
        );
        socket.on("connect", () => {
          socket.write("zINSTREAM\0");
          for (let i = 0; i < buffer.length; i += 65536) {
            const chunk = buffer.subarray(i, i + 65536),
              len = Buffer.alloc(4);
            len.writeUInt32BE(chunk.length);
            socket.write(len);
            socket.write(chunk);
          }
          socket.write(Buffer.alloc(4));
        });
      });
      await db.transaction(async (tx) => {
        const claimed = await tx.job.updateMany({
          where: { id: job.id, state: "processing", leaseToken },
          data: { state: "completed" },
        });
        if (claimed.count)
          await tx.document.update({
            where: { id: doc.id },
            data: { status: clean ? "Available" : "Rejected" },
          });
      });
    } else throw new Error("UNKNOWN_JOB_TYPE");
  } catch (e) {
    await db.job.updateMany({
      where: { id: job.id, state: "processing", leaseToken },
      data: {
        state: job.attempts >= 5 ? "failed" : "pending",
        runAt: new Date(now().getTime() + Math.pow(2, job.attempts) * 60000),
        lastError:
          e instanceof Error && /^[A-Z_]+$/.test(e.message)
            ? e.message
            : "PROVIDER_FAILURE",
      },
    });
    log.warn({ jobId: job.id }, "Job failed; retry policy applied");
  }
  return true;
}
// Polls until the returned stop function is called; stop resolves once the current job has finished.
export function startWorker() {
  let stopping = false;
  const done = (async () => {
    while (!stopping) {
      let worked = false;
      try {
        worked = await runJob();
      } catch {
        // A transient database error must not end the loop; wait and poll again.
        log.warn("Job polling failed; retrying");
        await new Promise((r) => setTimeout(r, 5000));
      }
      if (!worked && !stopping) await new Promise((r) => setTimeout(r, 1000));
    }
  })();
  return () => {
    stopping = true;
    return done;
  };
}
if (
  process.argv[1]?.endsWith("worker.ts") ||
  process.argv[1]?.endsWith("worker.js")
) {
  const stop = startWorker();
  const shutdown = async () => {
    await stop();
    await db.close();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
