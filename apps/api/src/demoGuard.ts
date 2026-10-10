import { db } from "./db.js";
import { config } from "./config.js";
// Demo scripts rewrite or delete workspace data. NODE_ENV defaults to development, so it cannot be the
// only guard: the caller must also name the exact database on the command line for every run.
export function assertDemoDatabase(action: string) {
  if (config.NODE_ENV === "production" || !config.DEMO_DATE)
    throw new Error(`${action} requires a fixed DEMO_DATE outside production`);
  const flag = `--confirm-db=${config.MONGODB_DB}`;
  if (!process.argv.includes(flag))
    throw new Error(
      `${action} would change data in database "${config.MONGODB_DB}". Re-run with ${flag} to confirm this is a demo database.`,
    );
}
// Removes one workspace's business records only; members, sessions and other workspaces are untouched.
// Not transactional (a seeded workspace exceeds transaction limits), so re-run after an interrupted reset.
export async function clearWorkspaceData(organizationId: string) {
  const clientIds = (
    await db.client.findMany({ where: { organizationId } })
  ).map((c) => c.id);
  await db.payment.deleteMany({ where: { event: { organizationId } } });
  await db.followUp.deleteMany({ where: { organizationId } });
  await db.financialEvent.deleteMany({ where: { organizationId } });
  await db.clientProduct.deleteMany({ where: { organizationId } });
  await db.opportunityStageHistory.deleteMany({
    where: { opportunity: { organizationId } },
  });
  await db.opportunity.deleteMany({ where: { organizationId } });
  await db.document.deleteMany({ where: { organizationId } });
  await db.communication.deleteMany({
    where: { clientId: { in: clientIds } },
  });
  await db.note.deleteMany({ where: { clientId: { in: clientIds } } });
  await db.consent.deleteMany({ where: { clientId: { in: clientIds } } });
  await db.clientTag.deleteMany({ where: { clientId: { in: clientIds } } });
  await db.contactRelationship.deleteMany({
    where: { from: { organizationId } },
  });
  await db.client.deleteMany({ where: { organizationId } });
  await db.business.deleteMany({ where: { contact: { organizationId } } });
  await db.contact.deleteMany({ where: { organizationId } });
  await db.productDefinition.deleteMany({ where: { organizationId } });
  await db.provider.deleteMany({ where: { organizationId } });
  await db.job.deleteMany({ where: { organizationId } });
  await db.activity.deleteMany({ where: { organizationId } });
  await db.notification.deleteMany({ where: { organizationId } });
}
