import { createHash } from "node:crypto";
import { db } from "../db.js";
import { schema } from "./schema.js";
// Identifies the collection shape this build expects. Readiness compares it with the value the last
// migration stored, so a deploy whose validators were not applied is reported instead of failing writes.
export const schemaFingerprint = createHash("sha256")
  .update(JSON.stringify(schema))
  .digest("hex");

// Additive and repeatable: never drops a collection, record, or existing index.
export async function migrateDatabase() {
  const hello = await db.native.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== "isdbgrid")
    throw new Error(
      "MongoDB must be a replica set or Atlas cluster; standalone servers cannot run CRM transactions",
    );
  const existing = new Set(
    (await db.native.listCollections({}, { nameOnly: true }).toArray()).map(
      (c) => c.name,
    ),
  );
  for (const model of Object.values(schema)) {
    const properties: Record<string, any> = { _id: { bsonType: "string" } };
    for (const [field, spec] of Object.entries(model.fields)) {
      const type = (
        {
          String: "string",
          Int: ["int", "long", "double"],
          Boolean: "bool",
          DateTime: "date",
          BigInt: "long",
        } as Record<string, any>
      )[spec.type];
      properties[field] = type
        ? {
            bsonType: [
              ...(Array.isArray(type) ? type : [type]),
              ...(spec.nullable ? ["null"] : []),
            ],
          }
        : {};
    }
    const validator = {
      $jsonSchema: {
        bsonType: "object",
        required: ["_id", ...Object.keys(model.fields)],
        properties,
        additionalProperties: false,
      },
    };
    if (!existing.has(model.collection))
      await db.native.createCollection(model.collection, {
        validator,
        validationLevel: "strict",
        validationAction: "error",
      });
    else {
      // Backfill before tightening: a document missing a newly added nullable field would otherwise
      // fail validation on its next update. A new non-nullable field still needs its own backfill.
      const nullable = Object.entries(model.fields)
        .filter(([, spec]) => spec.nullable)
        .map(([field]) => field);
      if (nullable.length)
        await db.native.collection(model.collection).updateMany(
          { $or: nullable.map((f) => ({ [f]: { $exists: false } })) },
          [
            {
              $set: Object.fromEntries(
                nullable.map((f) => [f, { $ifNull: [`$${f}`, null] }]),
              ),
            },
          ],
        );
      await db.native.command({
        collMod: model.collection,
        validator,
        validationLevel: "strict",
        validationAction: "error",
      });
    }
    const collection = db.native.collection(model.collection);
    await collection.createIndex(
      { id: 1 },
      { unique: true, name: "id_unique" },
    );
    for (const index of model.indexes)
      await collection.createIndex(index.keys, {
        unique: index.unique,
        name:
          Object.keys(index.keys).join("_") +
          (index.unique ? "_unique" : "_idx"),
        ...(index.partial
          ? {
              partialFilterExpression: { [index.partial]: { $type: "string" } },
            }
          : {}),
      });
    // References are indexed for server-side joins, even where the original SQL
    // schema depended on a primary key on the opposite side of a relation.
    for (const r of Object.values(model.relations))
      if (
        r.owns &&
        !model.indexes.some((i) => Object.keys(i.keys)[0] === r.local)
      )
        await collection.createIndex({ [r.local]: 1 });
  }
  if (!existing.has("contactLocks"))
    await db.native.createCollection("contactLocks");
  await db.native
    .collection("sessions")
    .createIndex(
      { expires: 1 },
      { expireAfterSeconds: 0, name: "session_expiry" },
    );
  await db.native.collection("sessions").createIndex({ "session.userId": 1 });
  await db.native.collection("schemaVersions").updateOne(
    { _id: "001-mongodb" as any },
    {
      $setOnInsert: {
        appliedAt: new Date(),
        description:
          "CRM collections, strict validators, reference indexes, partial uniqueness and session TTL",
      },
    },
    { upsert: true },
  );
  await db.native
    .collection("schemaVersions")
    .updateOne(
      { _id: "current" as any },
      { $set: { fingerprint: schemaFingerprint, appliedAt: new Date() } },
      { upsert: true },
    );
}
if (
  process.argv[1]?.endsWith("migrate.ts") ||
  process.argv[1]?.endsWith("migrate.js")
) {
  try {
    await migrateDatabase();
    console.log("MongoDB collection validation and indexes are ready.");
  } finally {
    await db.close();
  }
}
