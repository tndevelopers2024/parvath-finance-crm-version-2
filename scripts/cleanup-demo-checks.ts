import { db } from "../apps/api/src/db.js";
import { config } from "../apps/api/src/config.js";
// Only records the journeys name themselves ("Journey Client 1234567", @example.test) are matched, but the
// database must still be named on the command line so this cannot run against the wrong one by accident.
if (config.NODE_ENV === "production")
  throw new Error("Verification cleanup is not allowed in production");
if (!process.argv.includes(`--confirm-db=${config.MONGODB_DB}`))
  throw new Error(
    `This removes browser-journey records from database "${config.MONGODB_DB}". Re-run with --confirm-db=${config.MONGODB_DB}`,
  );
// The journeys name their clients "Journey Client 1234567"; the full-app sweep names its own "Sweep Client 07",
// "Sweep Business 2" and "Sweep Disposable <number>". Anything else is left alone.
const journeyName =
  /^(Journey (Client|Business|Import) \d{7}|Sweep (Client \d{2}|Business \d|Disposable \d+))$/;
const candidates = [
  ...(await db.client.findMany({
    where: { contact: { name: { startsWith: "Journey " } } },
    include: { contact: true },
  })),
  ...(await db.client.findMany({
    where: { contact: { name: { startsWith: "Sweep " } } },
    include: { contact: true },
  })),
];
const records = candidates.filter(
  (c) =>
    journeyName.test(c.contact.name) &&
    (!c.contact.email || c.contact.email.endsWith("@example.test")),
);
const ids = records.map((c) => c.id),
  contacts = records.map((c) => c.contactId);
if (ids.length)
  await db.transaction(async (tx) => {
    const events = await tx.financialEvent.findMany({
      where: { clientId: { in: ids } },
      select: { id: true },
    });
    const products = await tx.clientProduct.findMany({
      where: { clientId: { in: ids } },
      select: { id: true },
    });
    const leads = await tx.opportunity.findMany({
      where: { clientId: { in: ids } },
      select: { id: true },
    });
    const tasks = await tx.followUp.findMany({
      where: { clientId: { in: ids } },
      select: { id: true },
    });
    const comms = await tx.communication.findMany({
      where: { clientId: { in: ids } },
      select: { id: true },
    });
    const allIds = [
      ...ids,
      ...events.map((v) => v.id),
      ...products.map((v) => v.id),
      ...leads.map((v) => v.id),
      ...tasks.map((v) => v.id),
      ...comms.map((v) => v.id),
    ];
    await tx.activity.deleteMany({ where: { entityId: { in: allIds } } });
    await tx.payment.deleteMany({
      where: { eventId: { in: events.map((e) => e.id) } },
    });
    await tx.followUp.deleteMany({ where: { clientId: { in: ids } } });
    await tx.financialEvent.deleteMany({ where: { clientId: { in: ids } } });
    await tx.clientProduct.deleteMany({ where: { clientId: { in: ids } } });
    await tx.opportunityStageHistory.deleteMany({
      where: { opportunityId: { in: leads.map((v) => v.id) } },
    });
    await tx.opportunity.deleteMany({ where: { clientId: { in: ids } } });
    await tx.communication.deleteMany({ where: { clientId: { in: ids } } });
    await tx.note.deleteMany({ where: { clientId: { in: ids } } });
    await tx.consent.deleteMany({ where: { clientId: { in: ids } } });
    await tx.clientTag.deleteMany({ where: { clientId: { in: ids } } });
    await tx.client.deleteMany({ where: { id: { in: ids } } });
    await tx.business.deleteMany({ where: { contactId: { in: contacts } } });
    await tx.contact.deleteMany({ where: { id: { in: contacts } } });
    const imports = await tx.importJob.findMany({
      where: { state: "Completed" },
    });
    for (const job of imports) {
      if (
        (job.rows as any[]).some((r) =>
          /^Journey Import \d{7}$/.test(r.data?.name || ""),
        )
      ) {
        await tx.activity.deleteMany({ where: { entityId: job.id } });
        await tx.importJob.delete({ where: { id: job.id } });
      }
    }
  });
// The role journeys add an Adviser and an Operations member (adviser.1234567@example.test and so on).
const journeyUsers = (
  await db.user.findMany({ where: { email: { endsWith: "@example.test" } } })
).filter((u) => /^(adviser|operations)\.\d{7}@example\.test$/.test(u.email));
for (const u of journeyUsers) {
  await db.membership.deleteMany({ where: { userId: u.id } });
  await db.user.delete({ where: { id: u.id } });
}
// The conversion journey adds its own insurer and plan; remove them once nothing references them.
const insurers = [
  ...(await db.provider.findMany({
    where: { name: { startsWith: "Journey Insurer " } },
  })),
  ...(await db.provider.findMany({
    where: { name: { startsWith: "Sweep " } },
  })),
].filter((p) =>
  /^(Journey Insurer \d{7}|Sweep (Insurer|Bank|Extra Provider|Renamed Provider))$/.test(
    p.name,
  ),
);
let removedInsurers = 0;
for (const insurer of insurers) {
  const plans = await db.productDefinition.findMany({
    where: { providerId: insurer.id },
  });
  const inUse = await db.clientProduct.count({
    where: { definitionId: { in: plans.map((p) => p.id) } },
  });
  if (inUse) continue;
  await db.productDefinition.deleteMany({ where: { providerId: insurer.id } });
  await db.provider.delete({ where: { id: insurer.id } });
  removedInsurers++;
}
console.log(
  `Removed ${records.length} explicitly named browser-verification clients and their generated records, ${removedInsurers} journey insurers and ${journeyUsers.length} journey members.`,
);
await db.close();
