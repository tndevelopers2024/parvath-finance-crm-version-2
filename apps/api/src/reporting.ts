import { Router } from "express";
import { z } from "zod";
import { db } from "./db.js";
import { audit, HttpError, owned, permit } from "./security.js";
import {
  contactHistoryFilter,
  dateOnly,
  datePlus,
  day,
  eventTiming,
  flattenClient,
  now,
  timing,
} from "./domain.js";
export const reporting = Router();
reporting.get("/dashboard", async (req, res) => {
  const org = req.auth.organizationId,
    tz = req.auth.timezone,
    today = day(now(), tz);
  const [clients, leads, events, followups, activity] = await Promise.all([
    db.client.findMany({
      where: { organizationId: org },
      include: {
        contact: true,
        communications: {
          where: contactHistoryFilter,
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    }),
    db.opportunity.findMany({
      where: { organizationId: org },
      include: { client: { include: { contact: true } } },
    }),
    db.financialEvent.findMany({
      where: { organizationId: org },
      include: {
        client: { include: { contact: true } },
        product: { include: { definition: { include: { provider: true } } } },
      },
      orderBy: { dueDate: "asc" },
    }),
    db.followUp.findMany({
      where: { organizationId: org },
      include: {
        client: { include: { contact: true } },
        product: { include: { definition: true } },
      },
      orderBy: { dueAt: "asc" },
    }),
    db.activity.findMany({
      where: { organizationId: org },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);
  const due = events.filter(
    (e) =>
      e.status === "Pending" &&
      e.dueDate >= dateOnly(today) &&
      e.dueDate < dateOnly(datePlus(today, 30)),
  );
  const premium = due.filter((e) => e.amountMeaning === "Premium due");
  const allFollow = followups.map((f) => ({
    ...f,
    client: flattenClient(f.client),
    timing: timing(f, tz),
  }));
  const allEvents = events.map((e) => ({
    ...e,
    client: flattenClient(e.client),
    timing: eventTiming(e, tz),
  }));
  const revenueProducts = [
    ...new Map(due.map((e) => [e.product.id, e.product])).values(),
  ];
  const bins = Array.from({ length: 5 }, (_, i) => ({
    name: ["This Week", "Next Week", "2 Weeks", "3 Weeks", "4 Weeks"][i],
    count: due.filter((e) => {
      const n = (e.dueDate.getTime() - dateOnly(today).getTime()) / 86400000;
      return n >= i * 7 && n < Math.min(i * 7 + 7, 30);
    }).length,
  }));
  res.json({
    data: {
      today,
      now: now(),
      totalClients: clients.length,
      individuals: clients.filter((c) => c.contact.kind === "Individual")
        .length,
      businesses: clients.filter((c) => c.contact.kind === "Business").length,
      activeLeads: leads.filter((l) => !["Won", "Lost"].includes(l.stage))
        .length,
      hotLeads: leads.filter(
        (l) => l.priority !== "Normal" && !["Won", "Lost"].includes(l.stage),
      ).length,
      won: leads.filter((l) => l.stage === "Won").length,
      lost: leads.filter((l) => l.stage === "Lost").length,
      renewalsDue: due.length,
      premiumDueMinor: premium.reduce((a, e) => a + e.amountMinor, 0n),
      expectedRevenueMinor: revenueProducts.reduce(
        (a, p) => a + p.expectedCommissionMinor,
        0n,
      ),
      followupsToday: allFollow.filter(
        (f) => f.state === "pending" && day(f.dueAt, tz) === today,
      ).length,
      followupsOverdue: allFollow.filter((f) => f.timing === "Overdue").length,
      followupsCompleted: allFollow.filter((f) => f.state === "completed")
        .length,
      followupsWeek: allFollow.filter(
        (f) =>
          f.state === "pending" &&
          day(f.dueAt, tz) >= today &&
          day(f.dueAt, tz) < datePlus(today, 7),
      ).length,
      events: allEvents,
      followups: allFollow,
      leads: leads.map((l) => ({ ...l, client: flattenClient(l.client) })),
      birthdays: clients
        .filter(
          (c) => c.contact.dob?.toISOString().slice(5, 10) === today.slice(5),
        )
        .map(flattenClient),
      birthdayCalendar: clients
        .filter((c) => c.contact.dob)
        .map((c) => ({
          id: c.id,
          name: c.contact.name,
          phone: c.contact.phone,
          monthDay: c.contact.dob!.toISOString().slice(5, 10),
        })),
      staleClients: clients.filter(
        (c) =>
          !c.communications[0] ||
          c.communications[0].createdAt <
            new Date(now().getTime() - 90 * 86400000),
      ).length,
      activity,
      bins,
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
        title: l.client.contact.name,
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
  const rows = await db.communication.findMany({
    where: {
      client: { organizationId: req.auth.organizationId },
      ...(req.query.clientId
        ? { clientId: z.uuid().parse(req.query.clientId) }
        : {}),
    },
    include: { client: { include: { contact: true } } },
    take: 100,
    orderBy: { createdAt: "desc" },
  });
  res.json({
    data: rows.map((r) => ({ ...r, client: flattenClient(r.client) })),
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
      e.client.contact.name,
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
      f.client.contact.name,
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
