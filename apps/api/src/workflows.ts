import { Router } from "express";
import argon2 from "argon2";
import { z } from "zod";
import {
  opportunitySchema,
  followupSchema,
  productSchema,
  eventSchema,
  eventUpdateSchema,
  eventCancelSchema,
  paymentReversalSchema,
  businessDate,
  stages,
} from "../../../packages/contracts/src/index.js";
import { db } from "./db.js";
import {
  audit,
  holdClient,
  HttpError,
  owned,
  permit,
  validOwner,
} from "./security.js";
import {
  dateOnly,
  datePlus,
  day,
  eventTiming,
  flattenClient,
  nextEventDate,
  now,
  outstandingMinor,
  paidMinor,
  rangeBounds,
  recurrenceAnchor,
  timing,
  timestampBounds,
} from "./domain.js";
import { fromZonedTime } from "date-fns-tz";
export const workflows = Router();
const productInclude = {
  client: { include: { contact: true } },
  definition: { include: { provider: true } },
  events: { orderBy: { dueDate: "asc" as const } },
};
const linkedClient = { client: { include: { contact: true } } };
const safePage = (q: any) =>
  z
    .object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(50),
      q: z.string().max(200).default(""),
    })
    .parse(q);
workflows.get("/members", async (req, res) =>
  res.json({
    data: await db.membership.findMany({
      where: { organizationId: req.auth.organizationId },
      select: {
        id: true,
        role: true,
        user: { select: { id: true, name: true, email: true, active: true } },
      },
    }),
  }),
);
const memberRole = z.enum(["Administrator", "Adviser", "Operations"]);
workflows.post("/members", permit("admin"), async (req, res) => {
  const v = z
    .object({
      name: z.string().trim().min(2).max(100),
      email: z.email().transform((s) => s.toLowerCase()),
      // For now, new members can only be added as Administrators.
      role: z.literal("Administrator"),
      password: z.string().min(12).max(128),
    })
    .parse(req.body);
  if (await db.user.findUnique({ where: { email: v.email } }))
    throw new HttpError(
      409,
      "An account with that email already exists. Contact the account owner; automatic cross-workspace linking is disabled.",
    );
  const u = await db.transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: v.name,
        email: v.email,
        passwordHash: await argon2.hash(v.password),
        memberships: {
          create: { organizationId: req.auth.organizationId, role: v.role },
        },
      },
      select: { id: true, name: true, email: true },
    });
    await audit(
      tx,
      req,
      "create",
      "Membership",
      user.id,
      "Workspace member provisioned",
    );
    return user;
  });
  res.status(201).json({ data: u });
});
workflows.patch("/members/:id", permit("admin"), async (req, res) => {
  const v = z
    .object({ role: memberRole.optional(), active: z.boolean().optional() })
    .refine((x) => x.role !== undefined || x.active !== undefined, {
      message: "Provide a role or an active state",
    })
    .parse(req.body);
  const m = await db.membership.findFirst({
    where: {
      id: String(req.params.id),
      organizationId: req.auth.organizationId,
    },
  });
  if (!m) throw new HttpError(404, "Membership not found");
  if (m.userId === req.auth.userId)
    throw new HttpError(
      409,
      "You cannot change your own role or deactivate your own account",
    );
  await db.transaction(async (tx) => {
    if (v.role !== undefined && v.role !== m.role) {
      await tx.membership.update({
        where: { id: m.id },
        data: { role: v.role },
      });
      await audit(
        tx,
        req,
        "role",
        "Membership",
        m.id,
        "Workspace role updated",
      );
    }
    if (v.active !== undefined) {
      await tx.user.update({
        where: { id: m.userId },
        data: { active: v.active },
      });
      // A deactivated member must lose access immediately, not at cookie expiry.
      if (!v.active)
        await tx.native
          .collection("sessions")
          .deleteMany({ "session.userId": m.userId }, { session: tx.session });
      await audit(
        tx,
        req,
        v.active ? "reactivate" : "deactivate",
        "Membership",
        m.id,
        v.active
          ? "Workspace member reactivated"
          : "Workspace member deactivated",
      );
    }
    // Two administrators acting on each other at once must not leave the workspace without one.
    if (
      !(await tx.membership.count({
        where: {
          organizationId: req.auth.organizationId,
          role: "Administrator",
          user: { active: true },
        },
      }))
    )
      throw new HttpError(409, "A workspace needs at least one administrator");
  });
  res.json({ data: { success: true } });
});
workflows.get("/providers", async (req, res) =>
  res.json({
    data: await db.provider.findMany({
      where: { organizationId: req.auth.organizationId },
      orderBy: { name: "asc" },
    }),
  }),
);
workflows.post("/providers", permit("admin"), async (req, res) => {
  const { name } = z
    .object({ name: z.string().trim().min(2).max(100) })
    .parse(req.body);
  const existing = (
    await db.provider.findMany({
      where: {
        organizationId: req.auth.organizationId,
        name: { contains: name, mode: "insensitive" },
      },
    })
  ).find((row) => row.name.trim().toLowerCase() === name.toLowerCase());
  if (existing)
    return res
      .status(409)
      .json({ error: { message: "This provider already exists" } });
  const provider = await db.provider.create({
    data: { organizationId: req.auth.organizationId, name },
  });
  res.status(201).json({ data: provider });
});
workflows.get("/catalogue", async (req, res) =>
  res.json({
    data: await db.productDefinition.findMany({
      where: { organizationId: req.auth.organizationId },
      include: { provider: true },
      orderBy: { category: "asc" },
    }),
  }),
);
workflows.post("/catalogue", permit("admin"), async (req, res) => {
  const v = z
    .object({
      name: z.string().trim().min(2).max(100),
      category: z.enum([
        "Life Insurance",
        "Health Insurance",
        "Vehicle Insurance",
        "Home Loan",
        "Business Loan",
        "Investment",
        "Term Insurance",
      ]),
      provider: z.string().trim().min(2).max(100).optional(),
      providerId: z.uuid().optional(),
    })
    .refine((value) => !!value.providerId || !!value.provider, {
      message: "Select a provider",
      path: ["providerId"],
    })
    .parse(req.body);
  const p = v.providerId
    ? await owned("provider", v.providerId, req)
    : await db.provider.upsert({
        where: {
          organizationId_name: {
            organizationId: req.auth.organizationId,
            name: v.provider!,
          },
        },
        create: { organizationId: req.auth.organizationId, name: v.provider },
        update: {},
      });
  const duplicate = (
    await db.productDefinition.findMany({
      where: {
        organizationId: req.auth.organizationId,
        providerId: p.id,
        category: v.category,
        name: { contains: v.name, mode: "insensitive" },
      },
    })
  ).find((row) => row.name.trim().toLowerCase() === v.name.toLowerCase());
  if (duplicate)
    throw new HttpError(
      409,
      "This provider already has a product with this name in this category",
    );
  res.status(201).json({
    data: await db.productDefinition.create({
      data: {
        organizationId: req.auth.organizationId,
        providerId: p.id,
        name: v.name,
        category: v.category,
      },
    }),
  });
});
workflows.patch("/providers/:id", permit("admin"), async (req, res) => {
  const old = await owned("provider", String(req.params.id), req);
  const { name } = z
    .object({ name: z.string().trim().min(2).max(100) })
    .parse(req.body);
  const duplicate = (
    await db.provider.findMany({
      where: {
        organizationId: req.auth.organizationId,
        name: { contains: name, mode: "insensitive" },
      },
    })
  ).find(
    (row) =>
      row.name.trim().toLowerCase() === name.toLowerCase() && row.id !== old.id,
  );
  if (duplicate && duplicate.id !== old.id)
    throw new HttpError(409, "This provider already exists");
  res.json({
    data: await db.provider.update({ where: { id: old.id }, data: { name } }),
  });
});
workflows.delete("/providers/:id", permit("admin"), async (req, res) => {
  const old = await owned("provider", String(req.params.id), req);
  if (await db.productDefinition.count({ where: { providerId: old.id } }))
    throw new HttpError(409, "Remove this provider's product plans first");
  await db.provider.delete({ where: { id: old.id } });
  res.json({ data: { success: true } });
});
workflows.patch("/catalogue/:id", permit("admin"), async (req, res) => {
  const old = await owned("productDefinition", String(req.params.id), req);
  const v = z
    .object({
      name: z.string().trim().min(2).max(100),
      providerId: z.uuid(),
      category: z.enum([
        "Life Insurance",
        "Health Insurance",
        "Vehicle Insurance",
        "Home Loan",
        "Business Loan",
        "Investment",
        "Term Insurance",
      ]),
    })
    .parse(req.body);
  await owned("provider", v.providerId, req);
  if (
    v.category !== old.category &&
    (await db.clientProduct.count({ where: { definitionId: old.id } }))
  )
    throw new HttpError(
      409,
      "The category cannot change while client records use this plan",
    );
  const duplicate = (
    await db.productDefinition.findMany({
      where: {
        organizationId: req.auth.organizationId,
        providerId: v.providerId,
        category: v.category,
        name: { contains: v.name, mode: "insensitive" },
      },
    })
  ).find(
    (row) =>
      row.name.trim().toLowerCase() === v.name.toLowerCase() &&
      row.id !== old.id,
  );
  if (duplicate && duplicate.id !== old.id)
    throw new HttpError(
      409,
      "This provider already has a product with this name in this category",
    );
  res.json({
    data: await db.productDefinition.update({ where: { id: old.id }, data: v }),
  });
});
workflows.delete("/catalogue/:id", permit("admin"), async (req, res) => {
  const old = await owned("productDefinition", String(req.params.id), req);
  if (await db.clientProduct.count({ where: { definitionId: old.id } }))
    throw new HttpError(
      409,
      "This plan has client records and cannot be deleted",
    );
  await db.productDefinition.delete({ where: { id: old.id } });
  res.json({ data: { success: true } });
});
workflows.get("/leads", async (req, res) => {
  const p = safePage(req.query);
  const stage = req.query.stage
    ? z.enum(stages).parse(req.query.stage)
    : undefined;
  const priority = req.query.priority
    ? z.enum(["Normal", "High", "Urgent"]).parse(req.query.priority)
    : undefined;
  const where = {
    organizationId: req.auth.organizationId,
    stage,
    priority,
    ...(req.query.clientId
      ? { clientId: z.uuid().parse(req.query.clientId) }
      : {}),
    ...(p.q
      ? {
          OR: [
            { requirement: { contains: p.q, mode: "insensitive" as const } },
            {
              client: {
                contact: {
                  name: { contains: p.q, mode: "insensitive" as const },
                },
              },
            },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.opportunity.findMany({
      where,
      include: {
        ...linkedClient,
        history: { orderBy: { createdAt: "desc" } },
        product: true,
      },
      // The id breaks ties so leads created in the same instant never repeat or vanish between pages.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: p.limit,
      skip: (p.page - 1) * p.limit,
    }),
    db.opportunity.count({ where }),
  ]);
  res.json({
    data: rows.map((r) => ({ ...r, client: flattenClient(r.client) })),
    meta: { total, ...p },
  });
});
workflows.post("/leads", permit("edit"), async (req, res) => {
  const v = opportunitySchema.parse(req.body);
  if (["Won", "Lost"].includes(v.stage))
    throw new HttpError(
      400,
      "Create an open opportunity, then record its outcome",
    );
  await owned("client", v.clientId, req);
  await validOwner(v.ownerId, req);
  const row = await db.transaction(async (tx) => {
    await holdClient(tx, v.clientId, req);
    const o = await tx.opportunity.create({
      data: {
        ...v,
        createdAt: now(),
        nextFollowUp: v.nextFollowUp ? new Date(v.nextFollowUp) : undefined,
        organizationId: req.auth.organizationId,
        history: {
          create: {
            toStage: v.stage,
            actorId: req.auth.userId,
            createdAt: now(),
          },
        },
      },
    });
    if (v.nextFollowUp)
      await tx.followUp.create({
        data: {
          organizationId: req.auth.organizationId,
          clientId: v.clientId,
          opportunityId: o.id,
          ownerId: v.ownerId,
          channel: "Call",
          dueAt: new Date(v.nextFollowUp),
          notes: v.nextAction,
          priority: v.priority,
        },
      });
    await audit(tx, req, "create", "Opportunity", o.id, "New lead added");
    return o;
  });
  res.status(201).json({ data: row });
});
workflows.get("/leads/:id", async (req, res) => {
  await owned("opportunity", String(req.params.id), req);
  const row = await db.opportunity.findUniqueOrThrow({
    where: { id: String(req.params.id) },
    include: {
      ...linkedClient,
      history: { orderBy: { createdAt: "desc" } },
      product: true,
      followups: true,
    },
  });
  res.json({ data: { ...row, client: flattenClient(row.client) } });
});
workflows.patch("/leads/:id", permit("edit"), async (req, res) => {
  const old = await owned("opportunity", String(req.params.id), req);
  const v = opportunitySchema
    .omit({ clientId: true, stage: true })
    .extend({ version: z.number().int() })
    .parse(req.body);
  await validOwner(v.ownerId, req, old.ownerId);
  if (["Won", "Lost"].includes(old.stage))
    throw new HttpError(409, "Reopen the opportunity before editing");
  const { version, ...data } = v;
  const r = await db.opportunity.updateMany({
    where: { id: old.id, version },
    data: {
      ...data,
      nextFollowUp: data.nextFollowUp ? new Date(data.nextFollowUp) : undefined,
      version: { increment: 1 },
    },
  });
  if (!r.count)
    throw new HttpError(409, "Opportunity changed; refresh before editing");
  res.json({ data: { success: true } });
});
workflows.post("/leads/:id/stage", permit("edit"), async (req, res) => {
  const old = await owned("opportunity", String(req.params.id), req);
  const v = z
    .object({
      stage: z.enum(stages),
      version: z.number().int(),
      reason: z.string().max(1000).optional(),
    })
    .parse(req.body);
  if (v.stage === "Won")
    throw new HttpError(
      400,
      "Use sales acceptance to create or link the resulting application",
    );
  if (v.stage === "Lost" && !v.reason?.trim())
    throw new HttpError(400, "A lost reason is required");
  if (["Won", "Lost"].includes(old.stage)) {
    if (req.auth.role !== "Administrator")
      throw new HttpError(
        403,
        "An administrator must reopen closed opportunities",
      );
    if (!v.reason?.trim())
      throw new HttpError(
        400,
        "Explain why this opportunity is being reopened",
      );
    if (old.stage === "Won")
      throw new HttpError(
        409,
        "Accepted sales retain their fulfilment history. Create a new opportunity for a new requirement.",
      );
  }
  const r = await db.transaction(async (tx) => {
    const count = await tx.opportunity.updateMany({
      where: { id: old.id, version: v.version },
      data: {
        stage: v.stage,
        lostReason: v.stage === "Lost" ? v.reason : null,
        version: { increment: 1 },
      },
    });
    if (!count.count)
      throw new HttpError(409, "Stage changed; refresh the board");
    // A lost lead has nothing left to chase: close its pending follow-ups so they do not
    // turn Overdue later and count against the client's health and attention lists.
    if (v.stage === "Lost") {
      await tx.followUp.updateMany({
        where: { opportunityId: old.id, state: "pending" },
        data: {
          state: "cancelled",
          outcome: "Not needed",
          completedAt: now(),
          version: { increment: 1 },
        },
      });
      await tx.opportunity.updateMany({
        where: { id: old.id },
        data: { nextFollowUp: null },
      });
    }
    await tx.opportunityStageHistory.create({
      data: {
        opportunityId: old.id,
        fromStage: old.stage,
        toStage: v.stage,
        reason: v.reason,
        actorId: req.auth.userId,
        createdAt: now(),
      },
    });
    await audit(
      tx,
      req,
      "stage",
      "Opportunity",
      old.id,
      `Lead moved to ${v.stage}`,
    );
    return tx.opportunity.findUnique({ where: { id: old.id } });
  });
  res.json({ data: r });
});
workflows.post("/leads/:id/convert", permit("edit"), async (req, res) => {
  const old = await owned("opportunity", String(req.params.id), req);
  const v = z
    .object({
      version: z.number().int(),
      accepted: z.literal(true),
      definitionId: z.uuid(),
      identifier: z.string().min(3).max(100),
    })
    .parse(req.body);
  await owned("productDefinition", v.definitionId, req);
  const product = await db.transaction(async (tx) => {
    const existing = await tx.clientProduct.findUnique({
      where: { opportunityId: old.id },
    });
    if (existing) return existing;
    if (old.stage === "Lost")
      throw new HttpError(
        409,
        "Reopen the lost opportunity before accepting a sale",
      );
    const changed = await tx.opportunity.updateMany({
      where: { id: old.id, version: v.version, stage: { not: "Won" } },
      data: { stage: "Won", version: { increment: 1 } },
    });
    if (!changed.count)
      throw new HttpError(409, "Opportunity changed; refresh and retry");
    await tx.client.update({
      where: { id: old.clientId },
      data: { isClient: true, status: "Active", version: { increment: 1 } },
    });
    const p = await tx.clientProduct.create({
      data: {
        organizationId: req.auth.organizationId,
        clientId: old.clientId,
        opportunityId: old.id,
        definitionId: v.definitionId,
        identifier: v.identifier,
        status: "Application",
        startDate: dateOnly(day()),
      },
    });
    await tx.opportunityStageHistory.create({
      data: {
        opportunityId: old.id,
        fromStage: old.stage,
        toStage: "Won",
        reason:
          "Client accepted the proposal; application created. Fulfilment is tracked on the product.",
        actorId: req.auth.userId,
        createdAt: now(),
      },
    });
    await audit(
      tx,
      req,
      "convert",
      "Opportunity",
      old.id,
      "Sale accepted; product application created",
    );
    return p;
  });
  res.json({ data: product });
});
workflows.get("/products/summary", async (req, res) => {
  const rows = await db.clientProduct.findMany({
    where: { organizationId: req.auth.organizationId },
    include: { definition: true },
  });
  const categories = new Map<
    string,
    { clients: Set<string>; records: number; active: number }
  >();
  const productTotals = new Map<
    string,
    {
      clients: Set<string>;
      records: number;
      active: number;
      applications: number;
      closed: number;
    }
  >();
  for (const row of rows) {
    const totals = productTotals.get(row.definitionId) || {
      clients: new Set<string>(),
      records: 0,
      active: 0,
      applications: 0,
      closed: 0,
    };
    totals.clients.add(row.clientId);
    totals.records++;
    if (row.status === "Active") totals.active++;
    if (row.status === "Application") totals.applications++;
    if (row.status === "Closed") totals.closed++;
    productTotals.set(row.definitionId, totals);
    const category = row.definition.category;
    const summary = categories.get(category) || {
      clients: new Set<string>(),
      records: 0,
      active: 0,
    };
    summary.clients.add(row.clientId);
    summary.records++;
    if (row.status === "Active") summary.active++;
    categories.set(category, summary);
  }
  res.json({
    products: Array.from(productTotals, ([definitionId, totals]) => ({
      definitionId,
      clients: totals.clients.size,
      records: totals.records,
      active: totals.active,
      applications: totals.applications,
      closed: totals.closed,
    })),
    data: Array.from(categories, ([category, value]) => ({
      category,
      clients: value.clients.size,
      records: value.records,
      active: value.active,
    })),
  });
});
workflows.get("/products", async (req, res) => {
  const p = safePage(req.query);
  const filters = z
    .object({
      // Not productSchema.shape.status: it defaults to "Application", which would hide every Active and
      // Closed product whenever no status filter is given.
      status: z.enum(["Application", "Active", "Closed"]).optional(),
      category: z.string().trim().min(1).max(100).optional(),
      definitionId: z.uuid().optional(),
    })
    .parse(req.query);
  const categoryDefinitions = filters.category
    ? await db.productDefinition.findMany({
        where: {
          organizationId: req.auth.organizationId,
          category: filters.category,
        },
        select: { id: true },
      })
    : undefined;
  const allowedDefinitionIds = categoryDefinitions?.map((item) => item.id);
  const where = {
    ...(filters.definitionId
      ? {
          definitionId:
            allowedDefinitionIds &&
            !allowedDefinitionIds.includes(filters.definitionId)
              ? { in: [] }
              : filters.definitionId,
        }
      : allowedDefinitionIds
        ? { definitionId: { in: allowedDefinitionIds } }
        : {}),
    ...(filters.status ? { status: filters.status } : {}),
    organizationId: req.auth.organizationId,
    ...(req.query.clientId
      ? { clientId: z.uuid().parse(req.query.clientId) }
      : {}),
    ...(p.q
      ? {
          OR: [
            {
              definition: {
                name: { contains: p.q, mode: "insensitive" as const },
              },
            },
            { identifier: { contains: p.q, mode: "insensitive" as const } },
            {
              client: {
                contact: {
                  name: { contains: p.q, mode: "insensitive" as const },
                },
              },
            },
          ],
        }
      : {}),
  };
  const rows = await db.clientProduct.findMany({
    where,
    include: productInclude,
    take: p.limit,
    skip: (p.page - 1) * p.limit,
    orderBy: { createdAt: "desc" },
  });
  res.json({
    data: rows.map((r) => ({ ...r, client: flattenClient(r.client) })),
    meta: { total: await db.clientProduct.count({ where }) },
  });
});
workflows.post("/products", permit("edit"), async (req, res) => {
  const v = productSchema.parse(req.body);
  await owned("client", v.clientId, req);
  await owned("productDefinition", v.definitionId, req);
  const r = await db.transaction(async (tx) => {
    await holdClient(tx, v.clientId, req);
    const p = await tx.clientProduct.create({
      data: {
        ...v,
        startDate: dateOnly(v.startDate),
        organizationId: req.auth.organizationId,
        premiumMinor: v.premiumMinor ? BigInt(v.premiumMinor) : undefined,
        principalMinor: v.principalMinor ? BigInt(v.principalMinor) : undefined,
        expectedCommissionMinor: BigInt(v.expectedCommissionMinor),
      },
    });
    await audit(
      tx,
      req,
      "create",
      "ClientProduct",
      p.id,
      "Product application added",
    );
    return p;
  });
  res.status(201).json({ data: r });
});
workflows.get("/products/:id", async (req, res) => {
  await owned("clientProduct", String(req.params.id), req);
  const p = await db.clientProduct.findUniqueOrThrow({
    where: { id: String(req.params.id) },
    include: {
      ...productInclude,
      events: { include: { payments: true }, orderBy: { dueDate: "desc" } },
    },
  });
  res.json({ data: { ...p, client: flattenClient(p.client) } });
});
workflows.patch("/products/:id", permit("edit"), async (req, res) => {
  const old = await owned("clientProduct", String(req.params.id), req);
  const v = productSchema
    .omit({ clientId: true, definitionId: true })
    .extend({ version: z.number().int() })
    .parse(req.body);
  const { version, ...data } = v;
  const closed = await db.transaction(async (tx) => {
    const r = await tx.clientProduct.updateMany({
      where: { id: old.id, version },
      data: {
        ...data,
        startDate: dateOnly(data.startDate),
        premiumMinor: data.premiumMinor ? BigInt(data.premiumMinor) : undefined,
        principalMinor: data.principalMinor
          ? BigInt(data.principalMinor)
          : undefined,
        expectedCommissionMinor: BigInt(data.expectedCommissionMinor),
        version: { increment: 1 },
      },
    });
    if (!r.count)
      throw new HttpError(409, "Product changed; refresh before saving");
    const counts = { cancelledEvents: 0, keptEvents: 0 };
    if (data.status !== "Closed") return counts;
    // A closed product has nothing further to collect. Events holding a
    // part-payment stay pending so the money already received is resolved by hand.
    // Payments that were all reversed net to zero and hold nothing.
    const pending = await tx.financialEvent.findMany({
      where: { productId: old.id, status: "Pending" },
      include: { payments: true },
    });
    for (const e of pending)
      if (
        paidMinor(e) === 0n &&
        (await cancelEvent(tx, req, e, "Product closed"))
      )
        counts.cancelledEvents++;
      else counts.keptEvents++;
    return counts;
  });
  res.json({ data: { success: true, ...closed } });
});
const cancelledSummary = "Financial event cancelled: ";
const cancelReminders = (tx: typeof db, organizationId: string, id: string) =>
  tx.job.updateMany({
    where: {
      organizationId,
      key: { startsWith: `event-${id}-` },
      state: { in: ["pending", "processing"] },
    },
    data: { state: "cancelled" },
  });
// The reason lives in the activity row: FinancialEvent has a strict validator
// with every field required, so no stored field is added for it.
async function cancelEvent(
  tx: typeof db,
  req: Parameters<typeof audit>[1],
  e: { id: string; version: number },
  reason: string,
) {
  const change = await tx.financialEvent.updateMany({
    where: { id: e.id, version: e.version, status: "Pending" },
    data: { status: "Cancelled", version: { increment: 1 } },
  });
  if (!change.count) return false;
  await cancelReminders(tx, req.auth.organizationId, e.id);
  await audit(
    tx,
    req,
    "cancel",
    "FinancialEvent",
    e.id,
    cancelledSummary + reason,
  );
  return true;
}
const inr = (minor: bigint) =>
  "₹" +
  (minor / 100n).toLocaleString("en-IN") +
  (minor % 100n ? "." + String(minor % 100n).padStart(2, "0") : "");
const dateClash = (clash: { status: string }, type: string, dueDate: string) =>
  new HttpError(
    409,
    clash.status === "Cancelled"
      ? `A cancelled ${type} event already exists for this product on ${dueDate}. Choose a different date.`
      : `A ${type} event already exists for this product on ${dueDate}`,
  );
// A reversal is its own payment row: negative amount, reference derived from
// the original so the unique (eventId, reference) key allows only one.
const reversalPrefix = "Reversal of ";
// Optional inclusive calendar-day window; either end may be given alone.
const dayWindow = (q: unknown) => {
  const d = z
    .object({ from: businessDate.optional(), to: businessDate.optional() })
    .parse(q);
  if (d.from && d.to && d.from > d.to)
    throw new HttpError(400, "End date must follow start date");
  return d;
};
// Tightens bounds already set by the range filter instead of replacing them.
const narrow = (
  bounds: { gte?: Date; lt?: Date } = {},
  gte?: Date,
  lt?: Date,
) => ({
  ...bounds,
  ...(gte && (!bounds.gte || gte > bounds.gte) ? { gte } : {}),
  ...(lt && (!bounds.lt || lt < bounds.lt) ? { lt } : {}),
});
const withOutstanding = <
  T extends {
    status: string;
    amountMinor: bigint;
    payments: { amountMinor: bigint }[];
  },
>(
  e: T,
) => ({ ...e, paidMinor: paidMinor(e), outstandingMinor: outstandingMinor(e) });
workflows.get("/renewals", async (req, res) => {
  const p = safePage(req.query);
  const range = z.string().optional().parse(req.query.range) || "All";
  const date = rangeBounds(range, req.auth.timezone);
  const where: any = {
    organizationId: req.auth.organizationId,
    ...(date ? { dueDate: date } : {}),
    ...(range === "Renewed"
      ? { status: "Confirmed" }
      : range === "Cancelled"
        ? { status: "Cancelled" }
        : range === "All"
          ? {}
          : { status: "Pending" }),
  };
  const d = dayWindow(req.query);
  if (d.from || d.to)
    where.dueDate = narrow(
      where.dueDate,
      d.from ? dateOnly(d.from) : undefined,
      d.to ? dateOnly(datePlus(d.to, 1)) : undefined,
    );
  if (req.query.type)
    where.type = z
      .enum([
        "Insurance renewal",
        "Premium payment",
        "Loan instalment",
        "Loan review",
        "Bond interest",
        "Maturity",
      ])
      .parse(req.query.type);
  if (req.query.provider)
    where.product = {
      definition: { providerId: z.uuid().parse(req.query.provider) },
    };
  if (p.q)
    where.OR = [
      { client: { contact: { name: { contains: p.q, mode: "insensitive" } } } },
      { product: { identifier: { contains: p.q, mode: "insensitive" } } },
    ];
  if (req.query.clientId) where.clientId = z.uuid().parse(req.query.clientId);
  const rows = await db.financialEvent.findMany({
    where,
    include: {
      ...linkedClient,
      product: { include: { definition: { include: { provider: true } } } },
      payments: true,
    },
    orderBy: { dueDate: "asc" },
    take: p.limit,
    skip: (p.page - 1) * p.limit,
  });
  res.json({
    data: rows.map((r) => ({
      ...withOutstanding(r),
      client: flattenClient(r.client),
      timing: eventTiming(r, req.auth.timezone),
    })),
    meta: { total: await db.financialEvent.count({ where }) },
  });
});
workflows.post("/renewals", permit("edit"), async (req, res) => {
  const v = eventSchema.parse(req.body);
  const p = await owned("clientProduct", v.productId, req);
  if (p.status === "Closed")
    throw new HttpError(
      400,
      "This product is closed; events cannot be scheduled on a closed product",
    );
  const definition = await db.productDefinition.findUniqueOrThrow({
    where: { id: p.definitionId },
  });
  const allowed = definition.category.includes("Insurance")
    ? ["Insurance renewal", "Premium payment"]
    : definition.category.includes("Loan")
      ? ["Loan instalment", "Loan review"]
      : ["Bond interest", "Maturity"];
  if (!allowed.includes(v.type))
    throw new HttpError(
      422,
      "This event type is not valid for the product category",
    );
  const meaning = {
    "Insurance renewal": "Premium due",
    "Premium payment": "Premium due",
    "Loan instalment": "Instalment due",
    "Loan review": "No payment due",
    "Bond interest": "Interest receivable",
    Maturity: "Maturity proceeds",
  }[v.type];
  if (v.type === "Loan review" && v.amountMinor !== "0")
    throw new HttpError(400, "A loan review has no payment amount");
  // A cancelled event keeps its (product, type, dueDate) key, so name the clash.
  const clash = await db.financialEvent.findFirst({
    where: { productId: p.id, type: v.type, dueDate: dateOnly(v.dueDate) },
  });
  if (clash) throw dateClash(clash, v.type, v.dueDate);
  res.status(201).json({
    data: await db.transaction(async (tx) => {
      await holdClient(tx, p.clientId, req);
      return tx.financialEvent.create({
        data: {
          ...v,
          amountMinor: BigInt(v.amountMinor),
          dueDate: dateOnly(v.dueDate),
          organizationId: req.auth.organizationId,
          clientId: p.clientId,
          amountMeaning: meaning,
        },
      });
    }),
  });
});
workflows.get("/renewals/:id", async (req, res) => {
  await owned("financialEvent", String(req.params.id), req);
  const r = await db.financialEvent.findUniqueOrThrow({
    where: { id: String(req.params.id) },
    include: {
      ...linkedClient,
      product: {
        include: {
          definition: { include: { provider: true } },
          events: { include: { payments: true }, orderBy: { dueDate: "desc" } },
        },
      },
      payments: true,
    },
  });
  const cancelled =
    r.status === "Cancelled"
      ? await db.activity.findFirst({
          where: {
            organizationId: req.auth.organizationId,
            entityType: "FinancialEvent",
            entityId: r.id,
            action: "cancel",
          },
          orderBy: { createdAt: "desc" },
        })
      : null;
  res.json({
    data: {
      ...withOutstanding(r),
      client: flattenClient(r.client),
      timing: eventTiming(r, req.auth.timezone),
      cancelReason: cancelled?.summary.startsWith(cancelledSummary)
        ? cancelled.summary.slice(cancelledSummary.length)
        : undefined,
      cancelledAt: cancelled?.createdAt,
    },
  });
});
workflows.patch("/renewals/:id", permit("edit"), async (req, res) => {
  const old = await owned("financialEvent", String(req.params.id), req);
  const v = eventUpdateSchema.parse(req.body);
  const dueDate = v.dueDate === undefined ? undefined : dateOnly(v.dueDate);
  const amountMinor =
    v.amountMinor === undefined ? undefined : BigInt(v.amountMinor);
  const result = await db
    .transaction(async (tx) => {
      const e = await tx.financialEvent.findUniqueOrThrow({
        where: { id: old.id },
        include: { payments: true },
      });
      if (e.status !== "Pending")
        throw new HttpError(
          400,
          `Only a pending event can be corrected; this event is ${e.status.toLowerCase()}`,
        );
      const changes: string[] = [];
      if (amountMinor !== undefined && amountMinor !== e.amountMinor) {
        if (e.type === "Loan review" && amountMinor !== 0n)
          throw new HttpError(400, "A loan review has no payment amount");
        const paid = paidMinor(e);
        if (amountMinor < paid)
          throw new HttpError(
            400,
            `Amount cannot be reduced below the ${inr(paid)} already recorded as paid`,
          );
        changes.push(`amount ${inr(e.amountMinor)} to ${inr(amountMinor)}`);
      }
      const moved =
        dueDate !== undefined && dueDate.getTime() !== e.dueDate.getTime();
      if (moved) {
        const clash = await tx.financialEvent.findFirst({
          where: {
            productId: e.productId,
            type: e.type,
            dueDate,
            id: { not: e.id },
          },
        });
        if (clash) throw dateClash(clash, e.type, v.dueDate!);
        changes.push(
          `due date ${e.dueDate.toISOString().slice(0, 10)} to ${v.dueDate}`,
        );
      }
      if (
        v.recurrenceMonths !== undefined &&
        v.recurrenceMonths !== e.recurrenceMonths
      )
        changes.push(
          `recurrence ${e.recurrenceMonths ? e.recurrenceMonths + " months" : "one-time"} to ${v.recurrenceMonths ? v.recurrenceMonths + " months" : "one-time"}`,
        );
      const change = await tx.financialEvent.updateMany({
        where: { id: e.id, version: v.version, status: "Pending" },
        data: changes.length
          ? {
              dueDate: moved ? dueDate : undefined,
              amountMinor,
              recurrenceMonths: v.recurrenceMonths,
              version: { increment: 1 },
            }
          : {},
      });
      if (!change.count)
        throw new HttpError(409, "Event changed; refresh before correcting");
      // Reminders were timed against the old due date, so they are retired
      // exactly as confirmation retires them; the user schedules new ones.
      const remindersCancelled = moved
        ? (await cancelReminders(tx, req.auth.organizationId, e.id)).count
        : 0;
      if (changes.length)
        await audit(
          tx,
          req,
          "update",
          "FinancialEvent",
          e.id,
          "Financial event corrected: " + changes.join("; "),
        );
      return {
        event: await tx.financialEvent.findUnique({ where: { id: e.id } }),
        remindersCancelled,
      };
    })
    .catch((err) => {
      // Lost a race for the same (product, type, dueDate) key.
      if (err?.code === 11000 && v.dueDate)
        throw dateClash({ status: "Pending" }, old.type, v.dueDate);
      throw err;
    });
  res.json({
    data: result.event,
    meta: { remindersCancelled: result.remindersCancelled },
  });
});
workflows.post("/renewals/:id/cancel", permit("edit"), async (req, res) => {
  const old = await owned("financialEvent", String(req.params.id), req);
  const v = eventCancelSchema.parse(req.body);
  const result = await db.transaction(async (tx) => {
    const e = await tx.financialEvent.findUniqueOrThrow({
      where: { id: old.id },
      include: { payments: true },
    });
    if (e.status === "Cancelled") return old;
    if (e.status !== "Pending")
      throw new HttpError(
        400,
        "Only a pending event can be cancelled; this event is confirmed",
      );
    // Reversed payments net to zero, so nothing is held against the event.
    if (paidMinor(e) !== 0n)
      throw new HttpError(
        400,
        "This event has recorded payments and cannot be cancelled; reverse them first",
      );
    // No next recurrence is created: a cancelled event ends its own series.
    if (
      !(await cancelEvent(tx, req, { id: e.id, version: v.version }, v.reason))
    )
      throw new HttpError(409, "Event changed; refresh before cancelling");
    return tx.financialEvent.findUnique({ where: { id: e.id } });
  });
  res.json({ data: result });
});
workflows.post("/renewals/:id/payment", permit("operate"), async (req, res) => {
  const e = await owned("financialEvent", String(req.params.id), req);
  const v = z
    .object({
      reference: z.string().trim().min(3).max(100),
      amountMinor: z.string().regex(/^\d{1,15}$/),
    })
    .parse(req.body);
  if (e.type === "Loan review")
    throw new HttpError(400, "A review has no payment");
  if (e.status === "Cancelled")
    throw new HttpError(400, "This event is cancelled; no payment is due");
  if (v.reference.startsWith(reversalPrefix))
    throw new HttpError(
      400,
      `References starting with "${reversalPrefix.trim()}" are reserved for reversals`,
    );
  const result = await db.transaction(async (tx) => {
    const existing = await tx.payment.findUnique({
      where: { eventId_reference: { eventId: e.id, reference: v.reference } },
    });
    if (existing) {
      if (
        await tx.payment.findUnique({
          where: {
            eventId_reference: {
              eventId: e.id,
              reference: reversalPrefix + v.reference,
            },
          },
        })
      )
        throw new HttpError(
          409,
          `A payment with reference ${v.reference} was recorded and reversed on this event; use a different reference`,
        );
      // Same reference and amount is a retry; a different amount is not.
      if (existing.amountMinor !== BigInt(v.amountMinor))
        throw new HttpError(
          409,
          `A payment with reference ${v.reference} already exists for a different amount (${inr(existing.amountMinor)}); reverse it or use a different reference`,
        );
      return existing;
    }
    const lock = await tx.financialEvent.updateMany({
      where: { id: e.id, version: e.version, status: "Pending" },
      data: { version: { increment: 1 } },
    });
    if (!lock.count)
      throw new HttpError(
        409,
        "Event changed; refresh before recording payment",
      );
    const payments = await tx.payment.aggregate({
      where: { eventId: e.id },
      _sum: { amountMinor: true },
    });
    if (
      BigInt(v.amountMinor) <= 0n ||
      BigInt(v.amountMinor) + (payments._sum.amountMinor || 0n) > e.amountMinor
    )
      throw new HttpError(
        400,
        "Payment must be positive and cannot exceed the remaining amount",
      );
    const p = await tx.payment.create({
      data: {
        eventId: e.id,
        amountMinor: BigInt(v.amountMinor),
        reference: v.reference,
        recordedBy: req.auth.userId,
      },
    });
    await audit(
      tx,
      req,
      "payment",
      "FinancialEvent",
      e.id,
      "Payment recorded; confirmation remains separate",
    );
    return p;
  });
  res.json({ data: result });
});
// Payments are never edited or deleted: a wrong one is offset by a reversal
// row, and the reason lives in the activity row (see cancelEvent).
workflows.post(
  "/renewals/:id/payments/:paymentId/reverse",
  permit("edit"),
  async (req, res) => {
    const e = await owned("financialEvent", String(req.params.id), req);
    const v = paymentReversalSchema.parse(req.body);
    if (e.status !== "Pending")
      throw new HttpError(
        400,
        `Payments can only be reversed on a pending event; this event is ${e.status.toLowerCase()}`,
      );
    const result = await db.transaction(async (tx) => {
      const p = await tx.payment.findFirst({
        where: { id: String(req.params.paymentId), eventId: e.id },
      });
      if (!p) throw new HttpError(404, "Payment not found");
      if (p.amountMinor < 0n)
        throw new HttpError(400, "A reversal cannot itself be reversed");
      const reference = reversalPrefix + p.reference;
      const existing = await tx.payment.findUnique({
        where: { eventId_reference: { eventId: e.id, reference } },
      });
      if (existing) return existing;
      const lock = await tx.financialEvent.updateMany({
        where: { id: e.id, version: e.version, status: "Pending" },
        data: { version: { increment: 1 } },
      });
      if (!lock.count)
        throw new HttpError(
          409,
          "Event changed; refresh before reversing payment",
        );
      const reversal = await tx.payment.create({
        data: {
          eventId: e.id,
          amountMinor: -p.amountMinor,
          reference,
          recordedBy: req.auth.userId,
        },
      });
      await audit(
        tx,
        req,
        "payment-reversal",
        "FinancialEvent",
        e.id,
        `Payment ${p.reference} of ${inr(p.amountMinor)} reversed: ${v.reason}`,
      );
      return reversal;
    });
    res.json({ data: result });
  },
);
workflows.post(
  "/renewals/:id/complete",
  permit("operate"),
  async (req, res) => {
    const old = await owned("financialEvent", String(req.params.id), req);
    const v = z.object({ version: z.number().int() }).parse(req.body);
    const result = await db.transaction(async (tx) => {
      const e = await tx.financialEvent.findUniqueOrThrow({
        where: { id: old.id },
        include: { payments: true },
      });
      if (e.status === "Confirmed") return e;
      if (e.status === "Cancelled")
        throw new HttpError(
          400,
          "This event is cancelled and cannot be confirmed",
        );
      if (e.type !== "Loan review" && paidMinor(e) < e.amountMinor)
        throw new HttpError(
          400,
          "Record the full payment or receipt before confirming",
        );
      const change = await tx.financialEvent.updateMany({
        where: { id: e.id, version: v.version, status: "Pending" },
        data: {
          status: "Confirmed",
          completedAt: now(),
          version: { increment: 1 },
        },
      });
      if (!change.count)
        throw new HttpError(409, "Event changed; refresh before confirming");
      // A closed product schedules nothing further, so its series ends here.
      if (
        e.recurrenceMonths &&
        (await tx.clientProduct.findUnique({ where: { id: e.productId } }))
          ?.status !== "Closed"
      ) {
        // The series keeps the day-of-month of its first event, so a date
        // clamped to a short month does not drift (31 Jan, 28 Feb, 31 Mar).
        const series = await tx.financialEvent.findMany({
          where: {
            productId: e.productId,
            type: e.type,
            recurrenceMonths: e.recurrenceMonths,
            status: { not: "Cancelled" },
            dueDate: { lt: e.dueDate },
          },
          select: { dueDate: true },
        });
        const dueDate = nextEventDate(
          recurrenceAnchor(
            series.map((s) => s.dueDate),
            e.dueDate,
            e.recurrenceMonths,
          ),
          e.recurrenceMonths,
          e.dueDate,
        );
        await tx.financialEvent.upsert({
          where: {
            productId_type_dueDate: {
              productId: e.productId,
              type: e.type,
              dueDate,
            },
          },
          create: {
            organizationId: e.organizationId,
            clientId: e.clientId,
            productId: e.productId,
            type: e.type,
            dueDate,
            amountMinor: e.amountMinor,
            amountMeaning: e.amountMeaning,
            currency: e.currency,
            recurrenceMonths: e.recurrenceMonths,
          },
          update: {},
        });
      }
      await tx.job.updateMany({
        where: {
          organizationId: req.auth.organizationId,
          key: { startsWith: `event-${e.id}-` },
          state: { in: ["pending", "processing"] },
        },
        data: { state: "cancelled" },
      });
      await audit(
        tx,
        req,
        "complete",
        "FinancialEvent",
        e.id,
        "Financial event confirmed; history preserved",
      );
      return tx.financialEvent.findUnique({ where: { id: e.id } });
    });
    res.json({ data: result });
  },
);
workflows.post(
  "/renewals/:id/reminder",
  permit("operate"),
  async (req, res) => {
    const e = await owned("financialEvent", String(req.params.id), req);
    if (e.status === "Confirmed")
      throw new HttpError(409, "This event is already confirmed");
    if (e.status === "Cancelled")
      throw new HttpError(409, "This event is cancelled");
    const { runAt } = z.object({ runAt: z.iso.datetime() }).parse(req.body);
    if (new Date(runAt) < now())
      throw new HttpError(400, "Choose a future reminder time");
    const key = `event-${e.id}-${new Date(runAt).toISOString()}`;
    const job = await db.job.upsert({
      where: { key },
      create: {
        organizationId: req.auth.organizationId,
        key,
        type: "reminder",
        payload: { eventId: e.id, userId: req.auth.userId },
        runAt: new Date(runAt),
      },
      update: {},
    });
    res.status(201).json({ data: job });
  },
);
workflows.get("/followups", async (req, res) => {
  const p = safePage(req.query);
  const range = String(req.query.range || "All");
  const where: any = { organizationId: req.auth.organizationId };
  if (range === "Completed") where.state = "completed";
  else if (range === "Cancelled") where.state = "cancelled";
  else if (range !== "All") {
    where.state = "pending";
    where.dueAt =
      range === "Overdue"
        ? { lt: now() }
        : timestampBounds(range, req.auth.timezone);
  }
  // from/to are workspace calendar days matched against the dueAt instant.
  const d = dayWindow(req.query);
  if (d.from || d.to)
    where.dueAt = narrow(
      where.dueAt,
      d.from
        ? fromZonedTime(d.from + "T00:00:00", req.auth.timezone)
        : undefined,
      d.to
        ? fromZonedTime(datePlus(d.to, 1) + "T00:00:00", req.auth.timezone)
        : undefined,
    );
  if (req.query.channel)
    where.channel = z
      .enum(["Call", "WhatsApp", "Email", "Meeting"])
      .parse(req.query.channel);
  if (req.query.clientId) where.clientId = z.uuid().parse(req.query.clientId);
  if (p.q)
    where.OR = [
      { notes: { contains: p.q, mode: "insensitive" } },
      { client: { contact: { name: { contains: p.q, mode: "insensitive" } } } },
    ];
  const rows = await db.followUp.findMany({
    where,
    include: {
      ...linkedClient,
      product: { include: { definition: { include: { provider: true } } } },
      opportunity: true,
    },
    orderBy: { dueAt: "asc" },
    take: p.limit,
    skip: (p.page - 1) * p.limit,
  });
  res.json({
    data: rows.map((r) => ({
      ...r,
      client: flattenClient(r.client),
      timing: timing(r, req.auth.timezone),
    })),
    meta: { total: await db.followUp.count({ where }) },
  });
});
workflows.post("/followups", permit("operate"), async (req, res) => {
  const v = followupSchema.parse(req.body);
  await owned("client", v.clientId, req);
  await validOwner(v.ownerId, req);
  for (const [field, model] of [
    ["opportunityId", "opportunity"],
    ["productId", "clientProduct"],
    ["eventId", "financialEvent"],
  ] as const) {
    if (v[field]) {
      const related = await owned(model, v[field]!, req);
      if (related.clientId !== v.clientId)
        throw new HttpError(
          400,
          "Linked records must belong to the same client",
        );
    }
  }
  const f = await db.transaction(async (tx) => {
    await holdClient(tx, v.clientId, req);
    const row = await tx.followUp.create({
      data: {
        ...v,
        dueAt: new Date(v.dueAt),
        organizationId: req.auth.organizationId,
      },
    });
    await audit(tx, req, "create", "FollowUp", row.id, "Follow-up scheduled");
    return row;
  });
  res.status(201).json({ data: f });
});
workflows.get("/followups/:id", async (req, res) => {
  await owned("followUp", String(req.params.id), req);
  const f = await db.followUp.findUniqueOrThrow({
    where: { id: String(req.params.id) },
    include: {
      ...linkedClient,
      product: { include: { definition: true } },
      opportunity: true,
    },
  });
  res.json({
    data: {
      ...f,
      client: flattenClient(f.client),
      timing: timing(f, req.auth.timezone),
    },
  });
});
workflows.patch("/followups/:id", permit("operate"), async (req, res) => {
  const f = await owned("followUp", String(req.params.id), req);
  const v = followupSchema
    .omit({
      clientId: true,
      opportunityId: true,
      productId: true,
      eventId: true,
    })
    .extend({ version: z.number().int() })
    .parse(req.body);
  if (f.state !== "pending")
    throw new HttpError(409, "Only pending follow-ups can be edited");
  await validOwner(v.ownerId, req, f.ownerId);
  const { version, ...data } = v;
  const r = await db.transaction(async (tx) => {
    const change = await tx.followUp.updateMany({
      where: { id: f.id, version, state: "pending" },
      data: { ...data, dueAt: new Date(data.dueAt), version: { increment: 1 } },
    });
    if (!change.count)
      throw new HttpError(409, "Follow-up changed; refresh before editing");
    await audit(
      tx,
      req,
      "reschedule",
      "FollowUp",
      f.id,
      "Follow-up updated or rescheduled",
    );
    return { success: true };
  });
  res.json({ data: r });
});
workflows.post(
  "/followups/:id/complete",
  permit("operate"),
  async (req, res) => {
    const f = await owned("followUp", String(req.params.id), req);
    const v = z
      .object({
        version: z.number().int(),
        state: z.enum(["completed", "cancelled"]),
        outcome: z.enum([
          "Connected",
          "No answer",
          "Documents requested",
          "Meeting arranged",
          "Not needed",
        ]),
        nextDueAt: z.iso.datetime().optional(),
      })
      .parse(req.body);
    const result = await db.transaction(async (tx) => {
      if (f.state === v.state) return f;
      if (f.state !== "pending")
        throw new HttpError(409, "Follow-up already closed");
      const change = await tx.followUp.updateMany({
        where: { id: f.id, version: v.version, state: "pending" },
        data: {
          state: v.state,
          outcome: v.outcome,
          completedAt: now(),
          version: { increment: 1 },
        },
      });
      if (!change.count)
        throw new HttpError(
          409,
          "Follow-up changed; refresh before completing",
        );
      if (v.nextDueAt)
        await tx.followUp.create({
          data: {
            organizationId: f.organizationId,
            clientId: f.clientId,
            ownerId: f.ownerId,
            channel: f.channel,
            notes: f.notes,
            productId: f.productId,
            opportunityId: f.opportunityId,
            eventId: f.eventId,
            dueAt: new Date(v.nextDueAt),
          },
        });
      if (v.state === "completed")
        await tx.communication.create({
          data: {
            clientId: f.clientId,
            actorId: req.auth.userId,
            channel: f.channel,
            event: "Manual outcome",
            body: v.outcome,
            createdAt: now(),
          },
        });
      await audit(
        tx,
        req,
        v.state,
        "FollowUp",
        f.id,
        `Follow-up ${v.state}: ${v.outcome}`,
      );
      return tx.followUp.findUnique({ where: { id: f.id } });
    });
    res.json({ data: result });
  },
);
