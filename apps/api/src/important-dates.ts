import { createHash } from "node:crypto";
import { fromZonedTime } from "date-fns-tz";
import { db } from "./db.js";
import { day, now } from "./domain.js";

type Profile = {
  weddingDate?: string;
  importantDates?: {
    type?: string;
    date?: string;
    description?: string;
    repeatAnnually?: boolean;
  }[];
};
export function dateOccasions(profile: Profile, from: string, to: string) {
  const sources = [
    ...(profile.weddingDate
      ? [
          {
            date: profile.weddingDate,
            title: "Wedding anniversary",
            repeatAnnually: true,
          },
        ]
      : []),
    ...(profile.importantDates || []).map((row) => ({
      date: row.date,
      title:
        [row.type, row.description].filter(Boolean).join(": ") ||
        "Important date",
      repeatAnnually: !!row.repeatAnnually,
    })),
  ];
  const results: { key: string; date: string; title: string }[] = [];
  for (const source of sources) {
    if (!source.date || !/^\d{4}-\d{2}-\d{2}$/.test(source.date)) continue;
    const original = new Date(source.date + "T00:00:00Z");
    if (
      !Number.isFinite(original.getTime()) ||
      original.toISOString().slice(0, 10) !== source.date
    )
      continue;
    const key = createHash("sha256")
      .update(JSON.stringify(source))
      .digest("hex")
      .slice(0, 24);
    const years = source.repeatAnnually
      ? Array.from(
          { length: Number(to.slice(0, 4)) - Number(from.slice(0, 4)) + 1 },
          (_, i) => Number(from.slice(0, 4)) + i,
        )
      : [Number(source.date.slice(0, 4))];
    for (const year of years) {
      const month = Number(source.date.slice(5, 7)) - 1;
      const date = new Date(
        Date.UTC(
          year,
          month,
          Math.min(
            Number(source.date.slice(8)),
            new Date(Date.UTC(year, month + 1, 0)).getUTCDate(),
          ),
        ),
      )
        .toISOString()
        .slice(0, 10);
      if (date >= source.date && date >= from && date < to)
        results.push({ key, date, title: source.title });
    }
  }
  return [...new Map(results.map((row) => [row.key + row.date, row])).values()];
}

export async function syncImportantDateJobs(
  tx: any,
  client: any,
  timezone: string,
) {
  // Serialize against client deletion and refresh from the transaction's own snapshot.
  await tx.native
    .collection("contactLocks")
    .updateOne(
      { _id: `client:${client.id}` },
      { $inc: { revision: 1 } },
      { session: tx.session, upsert: true },
    );
  const current = await tx.client.findUnique({ where: { id: client.id } });
  if (!current) return;
  client = current;
  const today = day(now(), timezone);
  const end = new Date(today + "T00:00:00Z");
  end.setUTCDate(end.getUTCDate() + 733);
  const occasions = dateOccasions(
    client.onboardingJson ? JSON.parse(client.onboardingJson) : {},
    today,
    end.toISOString().slice(0, 10),
  );
  const jobs = occasions.map((row) => ({
    key: `important:${client.organizationId}:${client.id}:${row.key}:${row.date}`,
    organizationId: client.organizationId,
    type: "important-date",
    payload: {
      clientId: client.id,
      userId: client.ownerId,
      occasionKey: row.key,
      date: row.date,
      title: row.title,
      timezone,
    },
    runAt: fromZonedTime(row.date + "T09:00:00", timezone),
  }));
  await tx.native.collection("Job").updateMany(
    {
      organizationId: client.organizationId,
      type: "important-date",
      "payload.clientId": client.id,
      key: { $nin: jobs.map((j) => j.key) },
      state: { $in: ["pending", "processing"] },
    },
    { $set: { state: "cancelled" } },
    { session: tx.session },
  );
  for (const job of jobs) {
    await tx.job.upsert({ where: { key: job.key }, create: job, update: {} });
    await tx.job.updateMany({
      where: { key: job.key, state: { in: ["pending", "cancelled"] } },
      data: { payload: job.payload, runAt: job.runAt, state: "pending" },
    });
  }
}

// Backfill existing profiles and extend yearly schedules without rewriting client data.
export async function refreshImportantDateJobs() {
  const cursor = db.native
    .collection<any>("Client")
    .find({ onboardingJson: { $regex: '"(?:weddingDate|importantDates)"' } });
  const zones = new Map<string, string>();
  for await (const client of cursor) {
    if (!zones.has(client.organizationId)) {
      const org = await db.organization.findUnique({
        where: { id: client.organizationId },
      });
      if (!org) continue;
      zones.set(client.organizationId, org.timezone);
    }
    await db.transaction(async (tx) => {
      const current = await tx.client.findUnique({ where: { id: client.id } });
      if (current)
        await syncImportantDateJobs(
          tx,
          current,
          zones.get(client.organizationId)!,
        );
    });
  }
}
