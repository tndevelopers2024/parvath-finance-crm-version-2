import { Router } from "express";
import { z } from "zod";
import { parse } from "csv-parse/sync";
import {
  clientImportRowSchema,
  clientSchema,
  withoutUnchanged,
} from "../../../packages/contracts/src/index.js";
import { db } from "./db.js";
import type { Database } from "./persistence/repository.js";

async function lockContactChanges(tx: Database, organizationId: string) {
  await tx.native
    .collection<any>("contactLocks")
    .updateOne(
      { _id: organizationId },
      { $inc: { revision: 1 } },
      { session: tx.session, upsert: true },
    );
}
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { config } from "./config.js";
import { s3 } from "./documents.js";
import { logger } from "./app.js";
import { audit, HttpError, owned, permit } from "./security.js";
import {
  clientInclude,
  dateOnly,
  flattenClient,
  health,
  now,
} from "./domain.js";
export const clients = Router();
export function clientData(v: z.output<typeof clientSchema>) {
  const {
    name,
    phone,
    email,
    kind,
    dob,
    gender,
    occupation,
    address,
    city,
    state,
    source,
    annualIncome,
    riskProfile,
    investmentInterest,
    loanInterest,
    preferredContact,
    notesText,
    onboardingProfile,
  } = v;
  return {
    contact: {
      name,
      phone,
      email: email || null,
      kind,
      dob: dob ? dateOnly(dob) : null,
      gender,
      occupation,
      address,
      city,
      state,
    },
    client: {
      source,
      annualIncome,
      riskProfile,
      investmentInterest,
      loanInterest,
      preferredContact,
      notesText,
      onboardingJson: onboardingProfile
        ? JSON.stringify(onboardingProfile)
        : null,
    },
  };
}
export async function duplicates(
  org: string,
  phone: string,
  email?: string,
  exclude?: string,
  context: Database = db,
) {
  return context.client.findMany({
    where: {
      organizationId: org,
      id: exclude ? { not: exclude } : undefined,
      contact: { OR: [{ phone }, ...(email ? [{ email }] : [])] },
    },
    include: { contact: true },
  });
}
export async function createClient(
  tx: any,
  v: z.output<typeof clientSchema>,
  org: string,
  owner: string,
  // The import commit has no use for the full client graph; skipping it drops a multi-join read per row.
  options: { readBack?: boolean } = {},
) {
  const d = clientData(v);
  const created = await tx.client.create({
    data: {
      organization: { connect: { id: org } },
      ownerId: owner,
      createdAt: now(),
      ...d.client,
      contact: {
        create: {
          organizationId: org,
          ...d.contact,
          ...(v.kind === "Business"
            ? {
                business: {
                  create: {
                    registrationNumber: v.registrationNumber,
                    industry: v.industry,
                  },
                },
              }
            : {}),
        },
      },
      tags: v.tags
        ? {
            create: v.tags.map((name) => ({
              tag: { connectOrCreate: { where: { name }, create: { name } } },
            })),
          }
        : undefined,
    },
    ...(options.readBack === false
      ? { select: { id: true } }
      : { include: clientInclude }),
  });
  const followup = v.onboardingProfile?.initialFollowup;
  if (followup?.enabled && followup.date && followup.notes) {
    await tx.followUp.create({
      data: {
        organizationId: org,
        clientId: created.id,
        ownerId: owner,
        dueAt: new Date(`${followup.date}T10:00:00+05:30`),
        channel: followup.channel || "Call",
        priority: "Normal",
        notes: followup.notes,
      },
    });
  }
  return created;
}
clients.get("/", async (req, res) => {
  const q = z
    .object({
      q: z.string().max(200).default(""),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(10),
      kind: z.enum(["Individual", "Business"]).optional(),
      status: z.string().optional(),
      city: z.string().optional(),
      product: z.string().optional(),
      sort: z.enum(["name", "createdAt"]).default("name"),
      direction: z.enum(["asc", "desc"]).default("asc"),
    })
    .parse(req.query);
  // `kind` is filtered once, in AND below; a second copy at the top level
  // would repeat the contact join for every client.
  const where: any = {
    organizationId: req.auth.organizationId,
    ...(q.status ? { status: q.status } : {}),
  };
  where.AND = [
    ...(q.kind ? [{ contact: { kind: q.kind } }] : []),
    ...(q.city
      ? [{ contact: { city: { contains: q.city, mode: "insensitive" } } }]
      : []),
    ...(q.product
      ? [{ products: { some: { definition: { category: q.product } } } }]
      : []),
    ...(q.q
      ? [
          {
            OR: [
              { contact: { name: { contains: q.q, mode: "insensitive" } } },
              { contact: { phone: { contains: q.q } } },
              { contact: { email: { contains: q.q, mode: "insensitive" } } },
              {
                products: {
                  some: { identifier: { contains: q.q, mode: "insensitive" } },
                },
              },
            ],
          },
        ]
      : []),
  ];
  const skip = (q.page - 1) * q.limit;
  const readRows = () =>
    db.client.findMany({
      where,
      include: clientInclude,
      skip,
      take: q.limit,
      orderBy:
        q.sort === "name"
          ? { contact: { name: q.direction } }
          : { createdAt: q.direction },
    });
  // Filters on the contact or on products join per client; counting repeats
  // that work, so a short page (fewer rows than asked for) supplies the total.
  const joined = Boolean(q.kind || q.city || q.product || q.q);
  let rows: Awaited<ReturnType<typeof readRows>>, total: number;
  if (joined) {
    rows = await readRows();
    total =
      rows.length < q.limit && (rows.length > 0 || skip === 0)
        ? skip + rows.length
        : await db.client.count({ where });
  } else
    [rows, total] = await Promise.all([readRows(), db.client.count({ where })]);
  res.json({
    data: rows.map(flattenClient),
    meta: { total, page: q.page, limit: q.limit },
  });
});
clients.get("/summary", async (req, res) => {
  const where = { organizationId: req.auth.organizationId };
  const [total, individual, business, products, attention] = await Promise.all([
    db.client.count({ where }),
    db.client.count({ where: { ...where, contact: { kind: "Individual" } } }),
    db.client.count({ where: { ...where, contact: { kind: "Business" } } }),
    db.clientProduct.count({ where: { ...where, status: "Active" } }),
    db.client.count({
      where: {
        ...where,
        followups: { some: { state: "pending", dueAt: { lt: now() } } },
      },
    }),
  ]);
  res.json({ data: { total, individual, business, products, attention } });
});
clients.get("/template", permit("export"), (_req, res) =>
  res
    .type("text/csv")
    .attachment("parvath-clients-template.csv")
    .send(
      "name,phone,email,kind,city,state,source\nSample Person,+919000000001,sample@example.test,Individual,Chennai,Tamil Nadu,Referral\n",
    ),
);
clients.post("/import/preview", permit("edit"), async (req, res) => {
  const { csv } = z.object({ csv: z.string().max(1000000) }).parse(req.body);
  let rows: any[];
  try {
    rows = parse(csv, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
      trim: true,
    });
  } catch {
    throw new HttpError(400, "Invalid CSV. Use the downloadable template.");
  }
  if (!rows.length || rows.length > 500)
    throw new HttpError(400, "Import 1–500 rows at a time");
  // Rows of the same file are de-duplicated on phone and (case-insensitively) email; the first occurrence wins.
  const seenPhones = new Map<string, number>();
  const seenEmails = new Map<string, number>();
  const preview = [];
  for (const [i, row] of rows.entries()) {
    const p = clientImportRowSchema.safeParse(row) as
      | { success: true; data: z.output<typeof clientSchema> }
      | { success: false; error: z.ZodError };
    let error = p.success
      ? ""
      : p.error.issues
          .map((x) => `${x.path.join(".")}: ${x.message}`)
          .join("; ");
    if (p.success) {
      const email = p.data.email?.toLowerCase();
      const earlier =
        seenPhones.get(p.data.phone) ??
        (email ? seenEmails.get(email) : undefined);
      if (earlier !== undefined)
        error = `Duplicate of row ${earlier} in this file; review and add individually if appropriate`;
      else if (
        await db.contact.count({
          where: {
            organizationId: req.auth.organizationId,
            OR: [
              { phone: p.data.phone },
              ...(p.data.email ? [{ email: p.data.email }] : []),
            ],
          },
        })
      )
        error = "Duplicate contact; review and add individually if appropriate";
      // Remember even flagged rows so a later row repeating them is also flagged.
      seenPhones.set(p.data.phone, seenPhones.get(p.data.phone) ?? i + 2);
      if (email) seenEmails.set(email, seenEmails.get(email) ?? i + 2);
    }
    preview.push({ row: i + 2, data: p.success ? p.data : row, error });
  }
  const job = await db.importJob.create({
    data: {
      organizationId: req.auth.organizationId,
      actorId: req.auth.userId,
      rows: preview,
    },
  });
  res.json({ data: { id: job.id, rows: preview } });
});
// Import commit runs in bounded chunks. Each createClient is roughly 10-20 sequential round trips; at
// 25-60 ms per Atlas round trip that is ~0.3-1.2 s per row, so 20 rows is ~6-24 s, safely inside the
// 45 s transaction timeoutMS (repository.ts) even with a retry of the callback, while 500 rows is 25
// short transactions instead of one that always aborts. The per-organisation contact lock is held
// only for one chunk. A request stops starting new chunks after IMPORT_REQUEST_BUDGET_MS and returns
// state "Partial"; the caller commits again to continue (the UI does this automatically).
const IMPORT_CHUNK_SIZE = 20;
const IMPORT_REQUEST_BUDGET_MS = 20000;
// A Processing job whose last chunk is older than this is treated as abandoned (crashed process).
const IMPORT_STALE_MS = 90000;
type ImportProgress = {
  total: number;
  processed: number;
  created: number;
  skipped: number;
  failed: number;
  errors: { row: number; error: string }[];
  chunkSize: number;
  updatedAt: string;
  lastError?: string;
};
function importProgress(job: any): ImportProgress {
  const r = job.result as Partial<ImportProgress> | null;
  return {
    total: (job.rows as any[]).length,
    processed: r?.processed ?? 0,
    created: r?.created ?? 0,
    skipped: r?.skipped ?? 0,
    failed: r?.failed ?? 0,
    errors: r?.errors ?? [],
    chunkSize: IMPORT_CHUNK_SIZE,
    updatedAt: r?.updatedAt ?? new Date(0).toISOString(),
    ...(r?.lastError ? { lastError: r.lastError } : {}),
  };
}
// One chunk = one transaction. The job row is re-read inside it and its cursor (`processed`) is
// advanced in the same transaction as the clients it covers, so a row is created at most once no
// matter how many retries or concurrent commits happen, and progress is never ahead of the data.
async function commitImportChunk(req: any, jobId: string) {
  return db.transaction(async (tx) => {
    const j = await tx.importJob.findUniqueOrThrow({ where: { id: jobId } });
    if (j.state === "Completed") return j;
    const rows = j.rows as any[];
    const p = importProgress(j);
    await lockContactChanges(tx, req.auth.organizationId);
    let budget = IMPORT_CHUNK_SIZE;
    let created = 0;
    while (p.processed < rows.length && budget > 0) {
      const r = rows[p.processed];
      p.processed++;
      if (r.error) {
        p.skipped++;
        p.errors.push({ row: r.row, error: r.error });
        continue;
      }
      const parsed = clientSchema.safeParse(r.data);
      if (!parsed.success) {
        p.failed++;
        p.errors.push({ row: r.row, error: "Row data is no longer valid" });
        continue;
      }
      budget--;
      const v = parsed.data;
      const match = await tx.contact.count({
        where: {
          organizationId: req.auth.organizationId,
          OR: [{ phone: v.phone }, ...(v.email ? [{ email: v.email }] : [])],
        },
      });
      if (match) {
        p.skipped++;
        p.errors.push({
          row: r.row,
          error: "Duplicate detected during commit",
        });
        continue;
      }
      await createClient(tx, v, req.auth.organizationId, req.auth.userId, {
        readBack: false,
      });
      p.created++;
      created++;
    }
    const done = p.processed >= rows.length;
    if (created || done)
      await audit(
        tx,
        req,
        "import",
        "ImportJob",
        j.id,
        done
          ? `Imported ${p.created} clients`
          : `Imported ${created} clients (${p.processed}/${rows.length} rows)`,
      );
    p.updatedAt = new Date().toISOString();
    delete p.lastError;
    return tx.importJob.update({
      where: { id: j.id },
      data: {
        state: done ? "Completed" : "Processing",
        result: p,
      },
    });
  });
}
clients.post("/import/:id/commit", permit("edit"), async (req, res) => {
  const found = await owned("importJob", String(req.params.id), req);
  if (found.state === "Completed") return res.json({ data: found });
  // Claim: Preview, Partial and Failed jobs are resumable; a fresh Processing job belongs to another request.
  const progress = importProgress(found);
  if (found.state === "Processing") {
    if (Date.now() - Date.parse(progress.updatedAt) < IMPORT_STALE_MS)
      throw new HttpError(409, "Import already processing");
  } else {
    const claim = await db.importJob.updateMany({
      where: { id: found.id, state: found.state },
      data: {
        state: "Processing",
        result: { ...progress, updatedAt: new Date().toISOString() },
      },
    });
    if (!claim.count) throw new HttpError(409, "Import already processing");
  }
  const started = Date.now();
  let job: any;
  try {
    do {
      job = await commitImportChunk(req, found.id);
    } while (
      job.state !== "Completed" &&
      Date.now() - started < IMPORT_REQUEST_BUDGET_MS
    );
  } catch (err: any) {
    logger.error(
      { requestId: req.requestId, importJobId: found.id, errorType: err?.name },
      "Import chunk failed",
    );
    // Earlier chunks stay committed; record the failure so the job is visible and resumable.
    const current = await db.importJob.findUniqueOrThrow({
      where: { id: found.id },
    });
    const failedJob = await db.importJob.update({
      where: { id: found.id },
      data: {
        state: "Failed",
        result: {
          ...importProgress(current),
          lastError: "A batch failed to save. Retry to continue the import.",
          updatedAt: new Date().toISOString(),
        },
      },
    });
    return res.json({ data: failedJob });
  }
  if (job.state === "Processing")
    job = await db.importJob.update({
      where: { id: found.id },
      data: { state: "Partial" },
    });
  res.json({ data: job });
});
clients.post("/", permit("edit"), async (req, res) => {
  const v = clientSchema.parse(req.body);
  const dup = await duplicates(req.auth.organizationId, v.phone, v.email);
  if (dup.length && (!v.allowDuplicate || !v.duplicateReason?.trim()))
    throw new HttpError(
      409,
      "A contact already uses this phone or email. Review before creating another.",
      dup.map(flattenClient),
    );
  const row = await db.transaction(async (tx) => {
    await lockContactChanges(tx, req.auth.organizationId);
    const currentDuplicates = await duplicates(
      req.auth.organizationId,
      v.phone,
      v.email,
      undefined,
      tx,
    );
    if (
      currentDuplicates.length &&
      (!v.allowDuplicate || !v.duplicateReason?.trim())
    )
      throw new HttpError(
        409,
        "Contact details match another client; review before creating",
        currentDuplicates.map(flattenClient),
      );
    const c = await createClient(
      tx,
      v,
      req.auth.organizationId,
      req.auth.userId,
    );
    await audit(
      tx,
      req,
      "create",
      "Client",
      c.id,
      `Client added${dup.length ? " (reviewed shared contact)" : ""}`,
    );
    return c;
  });
  res.status(201).json({ data: flattenClient(row) });
});
clients.get("/:id", async (req, res) => {
  await owned("client", String(req.params.id), req);
  const c = await db.client.findUniqueOrThrow({
    where: { id: String(req.params.id) },
    include: {
      ...clientInclude,
      contact: {
        include: {
          business: true,
          relationsFrom: { include: { to: { include: { client: true } } } },
          relationsTo: { include: { from: { include: { client: true } } } },
        },
      },
      followups: { orderBy: { dueAt: "asc" } },
      opportunities: { include: { history: true } },
      documents: {
        select: {
          id: true,
          name: true,
          size: true,
          contentType: true,
          status: true,
          purpose: true,
          createdAt: true,
        },
      },
      notes: { orderBy: { createdAt: "desc" } },
      consents: true,
      communications: { orderBy: { createdAt: "desc" } },
      events: {
        include: {
          product: { include: { definition: { include: { provider: true } } } },
        },
        orderBy: { dueDate: "asc" },
      },
    },
  });
  res.json({
    data: {
      ...flattenClient(c),
      business: c.contact.business,
      relationships: [
        ...c.contact.relationsFrom.map((r) => ({
          id: r.id,
          type: r.type,
          contact: r.to,
        })),
        ...c.contact.relationsTo.map((r) => ({
          id: r.id,
          type: r.type,
          contact: r.from,
        })),
      ],
      health: health(c),
    },
  });
});
clients.patch("/:id", permit("edit"), async (req, res) => {
  const old = await owned("client", String(req.params.id), req);
  // Onboarding details saved earlier are kept as they are; only the ones changed in this request are validated.
  const body = req.body || {};
  const storedProfile = old.onboardingJson
    ? JSON.parse(old.onboardingJson)
    : undefined;
  const changedProfile =
    body.onboardingProfile && typeof body.onboardingProfile === "object"
      ? withoutUnchanged(body.onboardingProfile, storedProfile)
      : body.onboardingProfile;
  const v = clientSchema
    .extend({ version: z.number().int().positive() })
    .parse({ ...body, onboardingProfile: changedProfile });
  if (changedProfile && body.onboardingProfile !== changedProfile)
    v.onboardingProfile = {
      ...body.onboardingProfile,
      ...v.onboardingProfile,
    };
  const d = clientData(v);
  const original = await db.contact.findUniqueOrThrow({
    where: { id: old.contactId },
  });
  const dup =
    original.phone === v.phone && (original.email || "") === (v.email || "")
      ? []
      : await duplicates(req.auth.organizationId, v.phone, v.email, old.id);
  if (dup.length && (!v.allowDuplicate || !v.duplicateReason))
    throw new HttpError(
      409,
      "Contact details match another client",
      dup.map(flattenClient),
    );
  const c = await db.transaction(async (tx) => {
    await lockContactChanges(tx, req.auth.organizationId);
    const changedContact =
      original.phone !== v.phone || (original.email || "") !== (v.email || "");
    const currentDuplicates = changedContact
      ? await duplicates(req.auth.organizationId, v.phone, v.email, old.id, tx)
      : [];
    if (
      currentDuplicates.length &&
      (!v.allowDuplicate || !v.duplicateReason?.trim())
    )
      throw new HttpError(
        409,
        "Contact details match another client; review before saving",
        currentDuplicates.map(flattenClient),
      );
    const count = await tx.client.updateMany({
      where: { id: old.id, version: v.version },
      data: { ...d.client, version: { increment: 1 } },
    });
    if (!count.count)
      throw new HttpError(409, "This client changed. Refresh before saving.");
    await tx.contact.update({ where: { id: old.contactId }, data: d.contact });
    if (v.kind === "Business")
      await tx.business.upsert({
        where: { contactId: old.contactId },
        create: {
          contactId: old.contactId,
          registrationNumber: v.registrationNumber,
          industry: v.industry,
        },
        update: {
          registrationNumber: v.registrationNumber,
          industry: v.industry,
        },
      });
    if (v.tags) {
      await tx.clientTag.deleteMany({ where: { clientId: old.id } });
      for (const name of v.tags) {
        const tag = await tx.tag.upsert({
          where: { name },
          create: { name },
          update: {},
        });
        await tx.clientTag.create({
          data: { clientId: old.id, tagId: tag.id },
        });
      }
    }
    await audit(tx, req, "update", "Client", old.id, "Client details updated");
    return tx.client.findUniqueOrThrow({
      where: { id: old.id },
      include: clientInclude,
    });
  });
  res.json({ data: flattenClient(c) });
});
clients.delete("/:id", permit("edit"), async (req, res) => {
  const c = await owned("client", String(req.params.id), req);
  // Object keys are only collected inside the transaction (it may be retried or fail at commit);
  // the objects are deleted from S3 after a successful commit.
  let objectKeys: string[] = [];
  await db.transaction(async (tx) => {
    objectKeys = [];
    await lockContactChanges(tx, req.auth.organizationId);
    // Conflicts with any transaction adding a record to this client (see holdClient).
    const clientLock = { _id: `client:${c.id}` };
    await tx.native
      .collection<any>("contactLocks")
      .updateOne(
        clientLock,
        { $inc: { revision: 1 } },
        { session: tx.session, upsert: true },
      );

    // 1. Opportunities and stage history
    const opportunities = await tx.opportunity.findMany({
      where: { clientId: c.id },
      select: { id: true },
    });
    if (opportunities.length) {
      const oppIds = opportunities.map((o: any) => o.id);
      await tx.opportunityStageHistory.deleteMany({
        where: { opportunityId: { in: oppIds } },
      });
      await tx.opportunity.deleteMany({ where: { id: { in: oppIds } } });
    }

    // 2. Financial events and payments
    const events = await tx.financialEvent.findMany({
      where: { clientId: c.id },
      select: { id: true },
    });
    if (events.length) {
      const eventIds = events.map((e: any) => e.id);
      await tx.payment.deleteMany({ where: { eventId: { in: eventIds } } });
      await tx.financialEvent.deleteMany({ where: { id: { in: eventIds } } });
    }

    // 3. Follow-ups and client products
    await tx.followUp.deleteMany({ where: { clientId: c.id } });
    await tx.clientProduct.deleteMany({ where: { clientId: c.id } });

    // 4. Documents, jobs, and S3 cleanup
    const docs = await tx.document.findMany({
      where: { clientId: c.id },
      select: { id: true, key: true },
    });
    if (docs.length) {
      const docIds = docs.map((d: any) => d.id);
      await tx.job.deleteMany({
        where: {
          organizationId: req.auth.organizationId,
          key: { in: docIds.map((id: string) => `scan-${id}`) },
        },
      });
      await tx.document.deleteMany({ where: { id: { in: docIds } } });
      objectKeys = docs.map((d: any) => d.key).filter(Boolean);
    }

    // 5. Communications, notes, consents, and tags
    await tx.communication.deleteMany({ where: { clientId: c.id } });
    await tx.note.deleteMany({ where: { clientId: c.id } });
    await tx.consent.deleteMany({ where: { clientId: c.id } });
    await tx.clientTag.deleteMany({ where: { clientId: c.id } });

    // 6. Contact relationships and business records
    await tx.contactRelationship.deleteMany({
      where: { OR: [{ fromId: c.contactId }, { toId: c.contactId }] },
    });
    await tx.business.deleteMany({ where: { contactId: c.contactId } });

    // 7. Client and Contact
    await tx.client.delete({ where: { id: c.id } });
    await tx.contact.delete({ where: { id: c.contactId } });
    await tx.native
      .collection<any>("contactLocks")
      .deleteOne(clientLock, { session: tx.session });

    // 8. Audit log
    await audit(tx, req, "delete", "Client", c.id, "Client record deleted");
  });
  // The client is gone; storage cleanup failures must not fail the request. Leftover keys are
  // logged (no retry job exists for them yet).
  if (config.S3_BUCKET && objectKeys.length) {
    const leftover: string[] = [];
    for (const key of objectKeys) {
      try {
        await s3.send(
          new DeleteObjectCommand({ Bucket: config.S3_BUCKET, Key: key }),
        );
      } catch {
        leftover.push(key);
      }
    }
    if (leftover.length)
      logger.warn(
        { requestId: req.requestId, clientId: c.id, leftoverKeys: leftover },
        "Client deleted but some document objects could not be removed from storage",
      );
  }
  res.json({ data: { success: true } });
});
clients.post("/:id/relationships", permit("edit"), async (req, res) => {
  const c = await owned("client", String(req.params.id), req);
  const v = z
    .object({
      clientId: z.uuid(),
      type: z.enum([
        "Spouse",
        "Child",
        "Parent",
        "Business contact",
        "Partner",
      ]),
    })
    .parse(req.body);
  const other = await owned("client", v.clientId, req);
  if (c.id === other.id) throw new HttpError(400, "Choose a different contact");
  const relation = await db.contactRelationship.upsert({
    where: {
      fromId_toId_type: {
        fromId: c.contactId,
        toId: other.contactId,
        type: v.type,
      },
    },
    create: { fromId: c.contactId, toId: other.contactId, type: v.type },
    update: {},
  });
  res.status(201).json({ data: relation });
});
clients.post("/:id/notes", permit("operate"), async (req, res) => {
  const c = await owned("client", String(req.params.id), req);
  const { body } = z
    .object({ body: z.string().trim().min(1).max(5000) })
    .parse(req.body);
  const note = await db.transaction(async (tx) => {
    const n = await tx.note.create({
      data: {
        clientId: c.id,
        body,
        authorId: req.auth.userId,
        createdAt: now(),
      },
    });
    await audit(tx, req, "create", "Note", n.id, "Client note added");
    return n;
  });
  res.status(201).json({ data: note });
});
clients.post("/:id/consents", permit("edit"), async (req, res) => {
  const c = await owned("client", String(req.params.id), req);
  const v = z
    .object({
      channel: z.enum(["Email", "WhatsApp", "Call"]),
      granted: z.boolean(),
      source: z.string().min(5).max(300),
    })
    .parse(req.body);
  const consent = await db.consent.create({ data: { ...v, clientId: c.id } });
  res.status(201).json({ data: consent });
});
clients.post("/bulk", permit("edit"), async (req, res) => {
  const { ids, status } = z
    .object({
      ids: z.array(z.uuid()).min(1).max(100),
      status: z.enum(["Active", "Needs Attention"]),
    })
    .parse(req.body);
  const result = await db.transaction(async (tx) => {
    const count = await tx.client.count({
      where: { id: { in: ids }, organizationId: req.auth.organizationId },
    });
    if (count !== new Set(ids).size)
      throw new HttpError(404, "A selected client was not found");
    await tx.client.updateMany({
      where: { id: { in: ids }, organizationId: req.auth.organizationId },
      data: { status, version: { increment: 1 } },
    });
    await audit(
      tx,
      req,
      "bulk-update",
      "Client",
      ids[0],
      `Updated status on ${count} selected clients`,
    );
    return { updated: count };
  });
  res.json({ data: result });
});
