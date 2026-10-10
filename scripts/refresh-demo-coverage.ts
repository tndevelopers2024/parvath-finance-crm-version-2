import { db, mongoClient } from "../apps/api/src/db.js";
import { now, day, dateOnly } from "../apps/api/src/domain.js";
import { assertDemoDatabase } from "../apps/api/src/demoGuard.js";

// Add demo records without replacing existing workspace data. Identifiers make reruns safe.
async function main() {
  assertDemoDatabase("Refreshing demo coverage");
  const membership = await db.membership.findFirst({
    where: { role: "Administrator" },
  });
  if (!membership) throw new Error("No demo administrator found");
  const organizationId = membership.organizationId;
  const clients = await db.client.findMany({
    where: { organizationId },
    take: 50,
  });
  if (!clients.length) throw new Error("No demo clients found");
  const definitions = await db.productDefinition.findMany({
    where: { organizationId },
  });
  await db.followUp.updateMany({
    where: {
      organizationId,
      channel: "Phone",
      notes: { startsWith: "Demo review:" },
    },
    data: { channel: "Call" },
  });
  let addedProducts = 0,
    addedEvents = 0,
    addedFollowups = 0;
  for (const [index, definition] of definitions.entries()) {
    const records = await db.clientProduct.findMany({
      where: { organizationId, definitionId: definition.id },
    });
    for (const [offset, status] of [
      "Active",
      "Application",
      "Closed",
    ].entries()) {
      if (records.some((r) => r.status === status)) continue;
      const identifier = `DEMO-COVERAGE-${definition.id.slice(0, 8)}-${status}`;
      if (
        await db.clientProduct.findFirst({
          where: { organizationId, identifier },
        })
      )
        continue;
      const p = await db.clientProduct.create({
        data: {
          organizationId,
          clientId: clients[(index + offset) % clients.length].id,
          definitionId: definition.id,
          identifier,
          status,
          startDate: dateOnly(day()),
          currency: "INR",
          premiumMinor: definition.category.includes("Insurance")
            ? 3500000n
            : null,
          principalMinor: definition.category.includes("Insurance")
            ? null
            : 50000000n,
          expectedCommissionMinor: 150000n,
        },
      });
      records.push(p);
      addedProducts++;
    }
    const active = records.find((r) => r.status === "Active");
    if (!active) continue;
    for (const [anchor, daysAhead] of [now(), new Date()].flatMap((anchor) =>
      [-3, 0, 1, 5, 10, 20].map((offset) => [anchor, offset] as const),
    )) {
      const due = new Date(anchor);
      due.setUTCDate(due.getUTCDate() + daysAhead);
      const dueDate = dateOnly(day(due));
      const type = definition.category.includes("Loan")
        ? "Loan instalment"
        : definition.category === "Investment"
          ? "Bond interest"
          : "Insurance renewal";
      if (
        !(await db.financialEvent.findFirst({
          where: { organizationId, productId: active.id, dueDate, type },
        }))
      ) {
        await db.financialEvent.create({
          data: {
            organizationId,
            clientId: active.clientId,
            productId: active.id,
            type,
            dueDate,
            amountMinor: 250000n,
            amountMeaning: definition.category.includes("Loan")
              ? "Instalment due"
              : definition.category === "Investment"
                ? "Interest receivable"
                : "Premium due",
            recurrenceMonths: definition.category.includes("Loan") ? 1 : 12,
            status: "Pending",
          },
        });
        addedEvents++;
      }
      const notes = `Demo review: ${definition.name} · ${day(due)}`;
      if (
        !(await db.followUp.findFirst({ where: { organizationId, notes } }))
      ) {
        // Afternoon in India keeps today's calendar populated during working hours.
        due.setUTCHours(10 + (index % 3), (index % 4) * 15, 0, 0);
        await db.followUp.create({
          data: {
            organizationId,
            clientId: active.clientId,
            productId: active.id,
            ownerId: membership.userId,
            dueAt: due,
            channel: "Call",
            state: "pending",
            notes,
          },
        });
        addedFollowups++;
      }
    }
  }
  const bluechip = definitions.find((p) => p.name.includes("Bluechip"));
  const categoryIds = bluechip
    ? await db.productDefinition.findMany({
        where: { organizationId, category: bluechip.category },
        select: { id: true },
      })
    : [];
  const linked = bluechip
    ? await db.clientProduct.findMany({
        where: {
          organizationId,
          definitionId: { in: categoryIds.map((p) => p.id) },
          AND: [{ definitionId: bluechip.id }],
        },
        include: {
          client: { include: { contact: true } },
          definition: { include: { provider: true } },
        },
        take: 25,
      })
    : [];
  console.log(
    JSON.stringify({
      addedProducts,
      addedEvents,
      addedFollowups,
      bluechipRows: linked.length,
      demoDate: day(),
    }),
  );
}
main().finally(() => mongoClient.close());
