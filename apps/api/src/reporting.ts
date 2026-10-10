import { Router } from "express";
import { fromZonedTime } from "date-fns-tz";
import { Decimal128 } from "mongodb";
import { z } from "zod";
import { db } from "./db.js";
import { schema } from "./persistence/schema.js";
import { sendWhatsAppTemplate, whatsappConfigured } from "./whatsapp.js";
import { audit, HttpError, owned, permit } from "./security.js";
import {
  contactHistoryFilter,
  dateOnly,
  datePlus,
  day,
  eventTiming,
  flattenClient,
  now,
  outstandingMinor,
  timing,
} from "./domain.js";
export const reporting = Router();
// Bounds for the lists the dashboard returns. Totals and counts never depend on
// these: they are computed by the database over the whole workspace.
const CALENDAR_ROW_LIMIT = 2000;
const LEAD_ROW_LIMIT = 10;
const BIRTHDAY_ROW_LIMIT = 20;
const WINDOW_MAX_DAYS = 366;
const big = (v: unknown): bigint =>
  v instanceof Decimal128
    ? BigInt(v.toString())
    : v === null || v === undefined
      ? 0n
      : BigInt(v as bigint | number | string);
const monthStart = (y: number, m: number) => new Date(Date.UTC(y, m, 1));
reporting.get("/dashboard", async (req, res) => {
  const org = req.auth.organizationId,
    tz = req.auth.timezone,
    today = day(now(), tz),
    todayDate = dateOnly(today);
  // The calendar lists (events, follow-ups, birthdayCalendar) cover a window:
  // by default last month through three months ahead, whole months so the
  // calendar views are complete. `from`/`to` (to exclusive) choose another.
  const [ty, tm] = [Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1];
  const { from, to } = z
    .object({
      from: z.iso.date().default(
        monthStart(ty, tm - 1)
          .toISOString()
          .slice(0, 10),
      ),
      to: z.iso.date().default(
        monthStart(ty, tm + 4)
          .toISOString()
          .slice(0, 10),
      ),
    })
    .refine(
      (w) =>
        w.to > w.from &&
        dateOnly(w.to).getTime() - dateOnly(w.from).getTime() <=
          WINDOW_MAX_DAYS * 86400000,
      "Dashboard window must be 1–366 days",
    )
    .parse(req.query);
  const fromDate = dateOnly(from),
    toDate = dateOnly(to);
  const stamp = (d: string) => fromZonedTime(`${d}T00:00:00`, tz);
  const dueEnd = dateOnly(datePlus(today, 30));
  const months: number[] = [];
  for (
    let m = monthStart(fromDate.getUTCFullYear(), fromDate.getUTCMonth());
    m < toDate && months.length < 12;
    m = monthStart(m.getUTCFullYear(), m.getUTCMonth() + 1)
  )
    months.push(m.getUTCMonth() + 1);
  const staleBefore = new Date(now().getTime() - 90 * 86400000);
  const contactCollection = schema.contact.collection;
  const clientInclude = {
    contact: true,
    communications: {
      where: contactHistoryFilter,
      orderBy: { createdAt: "desc" as const },
      take: 1,
    },
  };
  const eventInclude = {
    client: { include: { contact: true } },
    product: { include: { definition: { include: { provider: true } } } },
    payments: true,
  };
  const followInclude = {
    client: { include: { contact: true } },
    product: { include: { definition: true } },
  };
  const zero = { $toDecimal: 0 };
  const [
    clientFacets,
    leadGroups,
    leads,
    eventFacets,
    renewedEvents,
    windowEvents,
    oldestPending,
    followCounts,
    windowFollowups,
    nextFollowup,
    activity,
  ] = await Promise.all([
    // One pass over the organisation's clients: kinds, birthdays, stale count.
    db.native
      .collection(schema.client.collection)
      .aggregate([
        { $match: { organizationId: org } },
        {
          $lookup: {
            from: contactCollection,
            localField: "contactId",
            foreignField: "id",
            as: "c",
            pipeline: [
              { $project: { _id: 0, kind: 1, name: 1, phone: 1, dob: 1 } },
            ],
          },
        },
        { $set: { c: { $arrayElemAt: ["$c", 0] } } },
        {
          $facet: {
            kinds: [{ $group: { _id: "$c.kind", n: { $sum: 1 } } }],
            calendar: [
              { $match: { "c.dob": { $ne: null } } },
              { $match: { $expr: { $in: [{ $month: "$c.dob" }, months] } } },
              {
                $project: {
                  _id: 0,
                  id: 1,
                  name: "$c.name",
                  phone: "$c.phone",
                  monthDay: {
                    $dateToString: { format: "%m-%d", date: "$c.dob" },
                  },
                },
              },
              { $sort: { monthDay: 1, id: 1 } },
              { $limit: CALENDAR_ROW_LIMIT + 1 },
            ],
            today: [
              { $match: { "c.dob": { $ne: null } } },
              {
                $match: {
                  $expr: {
                    $eq: [
                      { $dateToString: { format: "%m-%d", date: "$c.dob" } },
                      today.slice(5),
                    ],
                  },
                },
              },
              { $sort: { id: 1 } },
              { $limit: BIRTHDAY_ROW_LIMIT },
              { $project: { _id: 0, id: 1 } },
            ],
            // Stale: no verified contact in 90 days (or ever). Each client is
            // one probe of the (clientId, createdAt) index, stopping at one hit.
            stale: [
              {
                $lookup: {
                  from: schema.communication.collection,
                  localField: "id",
                  foreignField: "clientId",
                  as: "recent",
                  pipeline: [
                    {
                      $match: {
                        event: "Manual outcome",
                        body: { $nin: ["No answer", "Not needed"] },
                        createdAt: { $gte: staleBefore },
                      },
                    },
                    { $limit: 1 },
                    { $project: { _id: 1 } },
                  ],
                },
              },
              { $match: { recent: { $size: 0 } } },
              { $count: "n" },
            ],
          },
        },
      ])
      .toArray(),
    db.native
      .collection(schema.opportunity.collection)
      .aggregate([
        { $match: { organizationId: org } },
        {
          $group: {
            _id: { stage: "$stage", priority: "$priority" },
            n: { $sum: 1 },
          },
        },
      ])
      .toArray(),
    db.opportunity.findMany({
      where: { organizationId: org, stage: { notIn: ["Won", "Lost"] } },
      include: { client: { include: { contact: true } } },
      orderBy: { createdAt: "asc" },
      take: LEAD_ROW_LIMIT,
    }),
    // Pending events due before today + 30 days, summarised in the database.
    // Premium figures are outstanding (amount less net payments), never gross.
    db.native
      .collection(schema.financialEvent.collection)
      .aggregate([
        {
          $match: {
            organizationId: org,
            status: "Pending",
            dueDate: { $lt: dueEnd },
          },
        },
        {
          $facet: {
            bins: [
              { $match: { dueDate: { $gte: todayDate } } },
              {
                $group: {
                  _id: {
                    $floor: {
                      $divide: [
                        {
                          $divide: [
                            { $subtract: ["$dueDate", todayDate] },
                            86400000,
                          ],
                        },
                        7,
                      ],
                    },
                  },
                  n: { $sum: 1 },
                },
              },
            ],
            premium: [
              { $match: { amountMeaning: "Premium due" } },
              {
                $lookup: {
                  from: schema.payment.collection,
                  localField: "id",
                  foreignField: "eventId",
                  as: "paid",
                  pipeline: [
                    {
                      $group: {
                        _id: null,
                        total: { $sum: { $toDecimal: "$amountMinor" } },
                      },
                    },
                  ],
                },
              },
              {
                $set: {
                  owed: {
                    $subtract: [
                      { $toDecimal: "$amountMinor" },
                      {
                        $ifNull: [{ $arrayElemAt: ["$paid.total", 0] }, zero],
                      },
                    ],
                  },
                },
              },
              {
                $group: {
                  _id: {
                    $cond: [{ $lt: ["$dueDate", todayDate] }, "overdue", "due"],
                  },
                  total: {
                    $sum: {
                      $cond: [{ $gt: ["$owed", zero] }, "$owed", zero],
                    },
                  },
                },
              },
            ],
            // Commission counts once per distinct product with a due event.
            revenue: [
              { $match: { dueDate: { $gte: todayDate } } },
              { $group: { _id: "$productId" } },
              {
                $lookup: {
                  from: schema.clientProduct.collection,
                  localField: "_id",
                  foreignField: "id",
                  as: "product",
                  pipeline: [
                    { $project: { _id: 0, expectedCommissionMinor: 1 } },
                  ],
                },
              },
              {
                $group: {
                  _id: null,
                  total: {
                    $sum: {
                      $toDecimal: {
                        $ifNull: [
                          {
                            $arrayElemAt: [
                              "$product.expectedCommissionMinor",
                              0,
                            ],
                          },
                          0,
                        ],
                      },
                    },
                  },
                },
              },
            ],
          },
        },
      ])
      .toArray(),
    db.financialEvent.count({
      where: { organizationId: org, status: "Confirmed" },
    }),
    db.financialEvent.findMany({
      where: {
        organizationId: org,
        dueDate: { gte: fromDate, lt: toDate },
      },
      include: eventInclude,
      orderBy: { dueDate: "asc" },
      take: CALENDAR_ROW_LIMIT + 1,
    }),
    // The oldest pending events lead "Today's Attention", even when overdue
    // by more than the calendar window.
    db.financialEvent.findMany({
      where: { organizationId: org, status: "Pending" },
      include: eventInclude,
      orderBy: { dueDate: "asc" },
      take: 2,
    }),
    db.native
      .collection(schema.followUp.collection)
      .aggregate([
        {
          $match: {
            organizationId: org,
            state: { $in: ["pending", "completed"] },
          },
        },
        {
          $group: {
            _id: null,
            completed: {
              $sum: { $cond: [{ $eq: ["$state", "completed"] }, 1, 0] },
            },
            overdue: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$state", "pending"] },
                      { $lt: ["$dueAt", now()] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            today: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$state", "pending"] },
                      { $gte: ["$dueAt", stamp(today)] },
                      { $lt: ["$dueAt", stamp(datePlus(today, 1))] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            week: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$state", "pending"] },
                      { $gte: ["$dueAt", stamp(today)] },
                      { $lt: ["$dueAt", stamp(datePlus(today, 7))] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ])
      .toArray(),
    db.followUp.findMany({
      where: {
        organizationId: org,
        dueAt: { gte: stamp(from), lt: stamp(to) },
      },
      include: followInclude,
      orderBy: { dueAt: "asc" },
      take: CALENDAR_ROW_LIMIT + 1,
    }),
    db.followUp.findMany({
      where: { organizationId: org, state: "pending" },
      include: followInclude,
      orderBy: { dueAt: "asc" },
      take: 1,
    }),
    db.activity.findMany({
      where: { organizationId: org },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);
  const facet = clientFacets[0] ?? {};
  const kindCount = (kind?: string) =>
    (facet.kinds ?? [])
      .filter((k: any) => kind === undefined || k._id === kind)
      .reduce((a: number, k: any) => a + k.n, 0);
  const leadCount = (match: (stage: string, priority: string) => boolean) =>
    leadGroups
      .filter((g: any) => match(g._id.stage, g._id.priority))
      .reduce((a: number, g: any) => a + g.n, 0);
  const open = (stage: string) => !["Won", "Lost"].includes(stage);
  const ev = eventFacets[0] ?? {};
  const premium = (bucket: string) =>
    big(ev.premium?.find((p: any) => p._id === bucket)?.total);
  const bins = Array.from({ length: 5 }, (_, i) => ({
    name: ["This Week", "Next Week", "2 Weeks", "3 Weeks", "4 Weeks"][i],
    count: ev.bins?.find((b: any) => Number(b._id) === i)?.n ?? 0,
  }));
  const follow = followCounts[0] ?? {};
  // Merge the attention rows into the window lists, in the order the
  // unbounded queries used (due date, then id), without duplicates.
  const merge = <T extends { id: string }>(
    rows: T[],
    extra: T[],
    key: (r: T) => number,
  ) =>
    [...new Map([...rows, ...extra].map((r) => [r.id, r])).values()].sort(
      (a, b) => key(a) - key(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
  const eventRows = merge(
    windowEvents.slice(0, CALENDAR_ROW_LIMIT),
    oldestPending,
    (e) => e.dueDate.getTime(),
  );
  const followRows = merge(
    windowFollowups.slice(0, CALENDAR_ROW_LIMIT),
    nextFollowup,
    (f) => f.dueAt.getTime(),
  );
  // Payment rows stay out of the payload; each event carries its balance.
  const allEvents = eventRows.map(({ payments, ...e }) => ({
    ...e,
    outstandingMinor: outstandingMinor({ ...e, payments }),
    client: flattenClient(e.client),
    timing: eventTiming(e, tz),
  }));
  const allFollow = followRows.map((f) => ({
    ...f,
    client: flattenClient(f.client),
    timing: timing(f, tz),
  }));
  const birthdayIds: string[] = (facet.today ?? []).map((b: any) => b.id);
  const birthdayClients = birthdayIds.length
    ? await db.client.findMany({
        where: { organizationId: org, id: { in: birthdayIds } },
        include: clientInclude,
      })
    : [];
  res.json({
    data: {
      today,
      now: now(),
      totalClients: kindCount(),
      individuals: kindCount("Individual"),
      businesses: kindCount("Business"),
      totalLeads: leadCount(() => true),
      activeLeads: leadCount((s) => open(s)),
      hotLeads: leadCount((s, p) => open(s) && p !== "Normal"),
      won: leadCount((s) => s === "Won"),
      lost: leadCount((s) => s === "Lost"),
      renewalsDue: bins.reduce((a, b) => a + b.count, 0),
      renewedEvents,
      premiumDueMinor: premium("due"),
      premiumOverdueMinor: premium("overdue"),
      expectedRevenueMinor: big(ev.revenue?.[0]?.total),
      followupsToday: follow.today ?? 0,
      followupsOverdue: follow.overdue ?? 0,
      followupsCompleted: follow.completed ?? 0,
      followupsWeek: follow.week ?? 0,
      events: allEvents,
      followups: allFollow,
      leads: leads.map((l) => ({ ...l, client: flattenClient(l.client) })),
      birthdays: birthdayIds
        .map((id) => birthdayClients.find((c) => c.id === id))
        .filter((c) => c)
        .map(flattenClient),
      birthdayCalendar: (facet.calendar ?? [])
        .slice(0, CALENDAR_ROW_LIMIT)
        .map(({ id, name, phone, monthDay }: any) => ({
          id,
          name,
          phone,
          monthDay,
        })),
      staleClients: facet.stale?.[0]?.n ?? 0,
      activity,
      bins,
      window: { from, to },
      // True when a list stopped at its row limit; the counts above are exact.
      truncated: {
        events: windowEvents.length > CALENDAR_ROW_LIMIT,
        followups: windowFollowups.length > CALENDAR_ROW_LIMIT,
        birthdayCalendar: (facet.calendar ?? []).length > CALENDAR_ROW_LIMIT,
        leads: leadCount((s) => open(s)) > LEAD_ROW_LIMIT,
        birthdays: birthdayIds.length >= BIRTHDAY_ROW_LIMIT,
      },
    },
  });
});
reporting.get("/search", async (req, res) => {
  const { q } = z
    .object({ q: z.string().trim().min(2).max(100) })
    .parse(req.query);
  const org = req.auth.organizationId;
  const [clients, leads, products] = await Promise.all([
    db.client.findMany({
      where: {
        organizationId: org,
        contact: {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        },
      },
      include: { contact: true },
      take: 6,
    }),
    db.opportunity.findMany({
      where: {
        organizationId: org,
        OR: [
          { requirement: { contains: q, mode: "insensitive" } },
          {
            client: { contact: { name: { contains: q, mode: "insensitive" } } },
          },
        ],
      },
      include: { client: { include: { contact: true } } },
      take: 4,
    }),
    db.clientProduct.findMany({
      where: {
        organizationId: org,
        identifier: { contains: q, mode: "insensitive" },
      },
      include: { definition: true },
      take: 4,
    }),
  ]);
  res.json({
    data: [
      ...clients.map((c) => ({
        id: c.id,
        title: c.contact.name,
        subtitle: "Client · " + c.contact.phone,
        url: "/clients/" + c.id,
      })),
      ...leads.map((l) => ({
        id: l.id,
        title: l.client?.contact.name ?? "Deleted client",
        subtitle: l.requirement,
        url: "/leads/" + l.id,
      })),
      ...products.map((p) => ({
        id: p.id,
        title: p.identifier,
        subtitle: p.definition.name,
        url: "/products/" + p.id,
      })),
    ],
  });
});
reporting.get("/notifications", async (req, res) =>
  res.json({
    data: await db.notification.findMany({
      where: {
        organizationId: req.auth.organizationId,
        userId: req.auth.userId,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  }),
);
reporting.post("/notifications/:id/read", async (req, res) => {
  const result = await db.notification.updateMany({
    where: {
      id: String(req.params.id),
      organizationId: req.auth.organizationId,
      userId: req.auth.userId,
    },
    data: { readAt: now() },
  });
  if (!result.count) throw new HttpError(404, "Notification not found");
  res.json({ data: { success: true } });
});
reporting.get("/communications", async (req, res) => {
  // Communication has no organisation field, so scope it through the
  // organisation's own clients and the (clientId, createdAt) index.
  const org = req.auth.organizationId;
  const wanted = req.query.clientId
    ? z.uuid().parse(req.query.clientId)
    : undefined;
  const clientIds = (
    await db.client.findMany({
      where: { organizationId: org, ...(wanted ? { id: wanted } : {}) },
      select: { id: true },
    })
  ).map((c) => c.id);
  const found = clientIds.length
    ? await db.native
        .collection(schema.communication.collection)
        .aggregate([
          { $match: { clientId: { $in: clientIds } } },
          { $sort: { createdAt: -1 } },
          { $limit: 100 },
          { $project: { _id: 0 } },
        ])
        .toArray()
    : [];
  const clients = found.length
    ? await db.client.findMany({
        where: {
          organizationId: org,
          id: { in: [...new Set(found.map((r) => r.clientId))] },
        },
        include: { contact: true },
      })
    : [];
  const byId = new Map(clients.map((c) => [c.id, c]));
  // Same order as before: newest first, ties by id.
  found.sort(
    (a, b) =>
      b.createdAt.getTime() - a.createdAt.getTime() ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  res.json({
    data: found.map((r) => ({
      ...r,
      client: flattenClient(byId.get(r.clientId)),
    })),
  });
});
// Sends one approved WhatsApp template to every selected client that has a phone
// number and a granted WhatsApp consent. Each attempt is recorded in the client's
// communication history, so the record shows what was actually sent or failed.
reporting.post("/whatsapp/broadcasts", permit("operate"), async (req, res) => {
  const v = z
    .object({
      clientIds: z.array(z.uuid()).min(1).max(100),
      template: z
        .string()
        .trim()
        .regex(/^[a-z0-9_]{1,512}$/),
      language: z
        .string()
        .trim()
        .regex(/^[a-zA-Z]{2,3}(_[A-Za-z0-9]{2,8})?$/)
        .default("en_US"),
      message: z.string().trim().min(1).max(1000),
    })
    .parse(req.body);
  if (!whatsappConfigured())
    throw new HttpError(
      503,
      "WhatsApp is not connected. An administrator must add the WhatsApp credentials on the server.",
    );
  const ids = [...new Set(v.clientIds)];
  const clients = await db.client.findMany({
    where: { id: { in: ids }, organizationId: req.auth.organizationId },
    include: { contact: true },
  });
  if (clients.length !== ids.length)
    throw new HttpError(404, "A selected client was not found");
  const consents = await db.consent.findMany({
    where: { clientId: { in: ids }, channel: "WhatsApp" },
    orderBy: { recordedAt: "desc" },
  });
  // Consents come newest first, so the first one seen per client is the current answer.
  const consented = new Map<string, boolean>();
  for (const consent of consents)
    if (!consented.has(consent.clientId))
      consented.set(consent.clientId, consent.granted);
  const skipped: { clientId: string; name: string; reason: string }[] = [];
  const recipients: { clientId: string; name: string; to: string }[] = [];
  for (const row of clients) {
    const client = flattenClient(row);
    const to = (client.phone || "").replace(/\D/g, "");
    const target = { clientId: client.id, name: client.name };
    if (!to) skipped.push({ ...target, reason: "No phone number" });
    else if (consented.get(client.id) !== true)
      skipped.push({ ...target, reason: "No WhatsApp consent" });
    else recipients.push({ ...target, to });
  }
  const results: {
    clientId: string;
    name: string;
    status: "sent" | "failed";
    providerId?: string;
    error?: string;
  }[] = [];
  // Five sends at a time: quick for a full batch, and gentle on the provider's rate limit.
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(5, recipients.length) }, async () => {
      while (next < recipients.length) {
        const r = recipients[next++];
        try {
          const sent = await sendWhatsAppTemplate({
            to: r.to,
            template: v.template,
            language: v.language,
            text: v.message,
          });
          results.push({
            clientId: r.clientId,
            name: r.name,
            status: "sent",
            providerId: sent.id,
          });
        } catch (error) {
          results.push({
            clientId: r.clientId,
            name: r.name,
            status: "failed",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }),
  );
  const sent = results.filter((r) => r.status === "sent").length;
  const failed = results.length - sent;
  const createdAt = now();
  await db.transaction(async (tx) => {
    for (const r of results)
      await tx.communication.create({
        data: {
          clientId: r.clientId,
          channel: "WhatsApp",
          event: r.status === "sent" ? "Broadcast sent" : "Broadcast failed",
          body: v.message,
          providerId: r.providerId ?? null,
          actorId: req.auth.userId,
          createdAt,
        },
      });
    await audit(
      tx,
      req,
      "broadcast",
      "Communication",
      ids[0],
      `WhatsApp broadcast: ${sent} sent, ${failed} failed, ${skipped.length} skipped`,
    );
  });
  res.json({
    data: {
      sent,
      failed,
      skipped,
      failures: results
        .filter((r) => r.status === "failed")
        .map(({ clientId, name, error }) => ({ clientId, name, error })),
    },
  });
});
reporting.post("/communications", permit("operate"), async (req, res) => {
  const v = z
    .object({
      clientId: z.uuid(),
      channel: z.enum(["WhatsApp", "Call", "Email", "Meeting"]),
      event: z.enum([
        "Conversation opened",
        "Message prepared",
        "Manual outcome",
      ]),
      body: z.string().max(3000).optional(),
    })
    .parse(req.body);
  await owned("client", v.clientId, req);
  const c = await db.transaction(async (tx) => {
    const row = await tx.communication.create({
      data: { ...v, actorId: req.auth.userId, createdAt: now() },
    });
    await audit(
      tx,
      req,
      "communication",
      "Communication",
      row.id,
      `${v.channel}: ${v.event}`,
    );
    return row;
  });
  res.status(201).json({ data: c });
});
reporting.get("/reports/export", permit("export"), async (req, res) => {
  const module = z
    .enum(["clients", "renewals", "followups"])
    .parse(req.query.module);
  const org = req.auth.organizationId;
  let headers: string[], rows: unknown[][];
  if (module === "clients") {
    const data = await db.client.findMany({
      where: { organizationId: org },
      include: { contact: true },
      take: 10000,
    });
    headers = ["Name", "Phone", "Email", "Type", "City", "Status"];
    rows = data.map((c) => [
      c.contact.name,
      c.contact.phone,
      c.contact.email,
      c.contact.kind,
      c.contact.city,
      c.status,
    ]);
  } else if (module === "renewals") {
    const data = await db.financialEvent.findMany({
      where: { organizationId: org },
      include: { client: { include: { contact: true } }, product: true },
      take: 10000,
    });
    headers = [
      "Client",
      "Identifier",
      "Event type",
      "Date",
      "Amount (paise)",
      "Amount meaning",
      "Currency",
      "Status",
    ];
    rows = data.map((e) => [
      e.client?.contact.name ?? "Deleted client",
      e.product.identifier,
      e.type,
      e.dueDate.toISOString().slice(0, 10),
      e.amountMinor.toString(),
      e.amountMeaning,
      e.currency,
      e.status,
    ]);
  } else {
    const data = await db.followUp.findMany({
      where: { organizationId: org },
      include: { client: { include: { contact: true } } },
      take: 10000,
    });
    headers = ["Client", "Channel", "Due at (UTC)", "State", "Outcome"];
    rows = data.map((f) => [
      f.client?.contact.name ?? "Deleted client",
      f.channel,
      f.dueAt.toISOString(),
      f.state,
      f.outcome,
    ]);
  }
  const cell = (v: unknown) => {
    let s = String(v ?? "");
    if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  await audit(db, req, "export", module, org, `${module} export downloaded`);
  res
    .attachment(`parvath-${module}.csv`)
    .type("text/csv")
    .send([headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n"));
});
reporting.get("/jobs", permit("admin"), async (req, res) =>
  res.json({
    data: await db.job.findMany({
      where: { organizationId: req.auth.organizationId },
      take: 100,
      orderBy: { createdAt: "desc" },
    }),
  }),
);
reporting.post("/jobs/:id/retry", permit("admin"), async (req, res) => {
  const j = await owned("job", String(req.params.id), req);
  if (j.state !== "failed")
    throw new HttpError(409, "Only failed jobs may be retried");
  await db.job.update({
    where: { id: j.id },
    data: { state: "pending", attempts: 0, runAt: now(), lastError: null },
  });
  res.json({ data: { success: true } });
});
