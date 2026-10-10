import { writeFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { db } from "../apps/api/src/db.js";
import { config } from "../apps/api/src/config.js";
import { schema } from "../apps/api/src/persistence/schema.js";

// Run before accepting writes on the destination. Compares every legacy field
// without logging personal values. The explicit date-repair option is only for
// correcting SQL DATE timezone interpretation during a staged cutover.
if (!process.env.LEGACY_POSTGRES_URL || config.NODE_ENV === "production")
  throw new Error("A staging LEGACY_POSTGRES_URL is required");
const repair = process.argv.includes("--repair-date-only");
const dateFields: Record<string, string[]> = {
  Contact: ["dob"],
  ClientProduct: ["startDate"],
  FinancialEvent: ["dueDate"],
};
pg.types.setTypeParser(1082, (value) => new Date(value + "T00:00:00.000Z"));
// TIMESTAMP WITHOUT TIME ZONE columns hold UTC; the driver would otherwise read them in this machine's zone.
pg.types.setTypeParser(1114, (value) => new Date(value.replace(" ", "T") + "Z"));
const source = new pg.Client({
  connectionString: process.env.LEGACY_POSTGRES_URL,
});
const results: Record<
  string,
  { source: number; target: number; differences: number }
> = {};
let repaired = 0;
try {
  await source.connect();
  await source.query(
    "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
  );
  if (
    !(await db.native
      .collection<any>("cutovers")
      .findOne({ _id: "postgres-initial" }))
  )
    throw new Error("Destination has no completed initial cutover marker");
  for (const model of Object.values(schema)) {
    const rows = (await source.query(`SELECT * FROM "${model.collection}"`))
      .rows;
    const collection = db.native.collection<any>(model.collection);
    const result = {
      source: rows.length,
      target: await collection.countDocuments(),
      differences: 0,
    };
    for (const original of rows) {
      const where = original.id
        ? { id: original.id }
        : { clientId: original.clientId, tagId: original.tagId };
      const stored = await collection.findOne(where);
      if (!stored) {
        result.differences++;
        continue;
      }
      const corrections: Record<string, Date | null> = {};
      for (const [field, value] of Object.entries(original)) {
        const expected =
          model.fields[field]?.type === "BigInt" && value != null
            ? BigInt(value as string)
            : value;
        if (!isDeepStrictEqual(expected, stored[field])) {
          if (repair && dateFields[model.collection]?.includes(field))
            corrections[field] = expected as Date | null;
          else result.differences++;
        }
      }
      if (Object.keys(corrections).length) {
        await collection.updateOne(where, { $set: corrections });
        repaired++;
      }
    }
    results[model.collection] = result;
  }
  await source.query("COMMIT");
  const passed = Object.values(results).every(
    (r) => r.source === r.target && !r.differences,
  );
  console.log(
    JSON.stringify(
      { passed, repairedDateRecords: repaired, collections: results },
      null,
      2,
    ),
  );
  if (passed && process.argv.includes("--report"))
    writeFileSync(
      "docs/verification/mongodb-cutover.json",
      JSON.stringify(
        {
          verifiedAt: new Date().toISOString(),
          passed,
          repairedDateRecords: repaired,
          collections: results,
        },
        null,
        2,
      ) + "\n",
    );
  if (!passed) process.exitCode = 1;
} finally {
  await source.end();
  await db.close();
}
