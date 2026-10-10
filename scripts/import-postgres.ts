import { randomUUID } from "node:crypto";
import pg from "pg";
import { db } from "../apps/api/src/db.js";
import { config } from "../apps/api/src/config.js";
import { schema } from "../apps/api/src/persistence/schema.js";
import { migrateDatabase } from "../apps/api/src/persistence/migrate.js";

// Optional, one-time local cutover. PostgreSQL is read-only. No sessions are
// copied, and a populated MongoDB target is never overwritten or merged.
if (!process.env.LEGACY_POSTGRES_URL)
  throw new Error(
    "Set LEGACY_POSTGRES_URL in the server environment for the read-only source",
  );
if (config.NODE_ENV === "production")
  throw new Error(
    "Run and validate this bounded cutover tool in staging first; it does not run in production",
  );
// PostgreSQL DATE has no timezone; avoid the driver interpreting it as local midnight.
pg.types.setTypeParser(1082, (value) => new Date(value + "T00:00:00.000Z"));
// TIMESTAMP WITHOUT TIME ZONE columns hold UTC; the driver would otherwise read them in this machine's zone.
pg.types.setTypeParser(1114, (value) => new Date(value.replace(" ", "T") + "Z"));
const source = new pg.Client({
  connectionString: process.env.LEGACY_POSTGRES_URL,
});
const counts: Record<string, number> = {};
try {
  await source.connect();
  await source.query(
    "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
  );
  await migrateDatabase();
  const imported = new Map<string, any[]>();
  let total = 0;
  for (const model of Object.values(schema)) {
    if (await db.native.collection(model.collection).countDocuments())
      throw new Error(
        "Target contains business data; refusing to overwrite or merge records",
      );
    const result = await source.query(`SELECT * FROM "${model.collection}"`);
    total += result.rows.length;
    if (total > 10000)
      throw new Error(
        "This cutover tool is bounded to 10,000 records; plan a staged migration for larger databases",
      );
    const records = result.rows.map((row) => {
      const out: Record<string, any> = {};
      for (const [key, spec] of Object.entries(model.fields)) {
        let value = row[key];
        if (value === undefined)
          value =
            spec.default === "uuid"
              ? randomUUID()
              : spec.default === "now"
                ? new Date()
                : (spec.default ?? null);
        if (spec.type === "BigInt" && value != null) value = BigInt(value);
        if (spec.type === "DateTime" && value != null) value = new Date(value);
        out[key] = value;
      }
      return { ...out, _id: out.id };
    });
    imported.set(model.collection, records);
    counts[model.collection] = records.length;
  }
  await db.transaction(async (tx) => {
    // The singleton marker makes concurrent cutover attempts conflict safely.
    await tx.native
      .collection("cutovers")
      .insertOne(
        { _id: "postgres-initial" as any, createdAt: new Date() },
        { session: tx.session },
      );
    for (const [collection, records] of imported) {
      if (
        await tx.native
          .collection(collection)
          .countDocuments({}, { session: tx.session })
      )
        throw new Error("Target changed during cutover; aborting");
      if (records.length)
        await tx.native
          .collection<any>(collection)
          .insertMany(records, { session: tx.session });
    }
  });
  await source.query("COMMIT");
  console.log(
    JSON.stringify(
      {
        message:
          "Copied business records and password hashes; IDs and monetary values preserved. Source unchanged. Sign in again; sessions were not copied.",
        counts,
      },
      null,
      2,
    ),
  );
} finally {
  await source.end();
  await db.close();
}
