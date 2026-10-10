import { app, logger } from "./app.js";
import { config } from "./config.js";
import { db, mongoClient } from "./db.js";
try {
  await mongoClient.connect();
  const hello = await db.native.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== "isdbgrid")
    throw new Error("REPLICA_SET_REQUIRED");
} catch (error) {
  logger.error(
    { errorType: error instanceof Error ? error.name : "ConnectionError" },
    "MongoDB startup failed; check server-only connection settings, Atlas network access, and replica-set support",
  );
  await db.close();
  process.exit(1);
}
const server = app.listen(config.PORT, "0.0.0.0", () =>
  logger.info({ port: config.PORT }, "Parvath API listening"),
);
const stopWorker = config.INLINE_WORKER
  ? (await import("./worker.js")).startWorker()
  : undefined;
if (stopWorker) logger.info("Job worker running inside the API process");
const shutdown = () => {
  server.close(async () => {
    await stopWorker?.();
    await db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
