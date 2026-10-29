import { config } from "./config.js";

export type IntegrationStatus = {
  available: boolean;
  // Names of the settings that are still empty. Only administrators are shown these.
  missing: string[];
  message: string;
};
type Name = "documents" | "email" | "whatsapp";

// What each external service needs before it can really work. Nothing here pretends a service is
// reachable: it only reports whether the settings it needs are present.
function missingFor(name: Name): string[] {
  const absent = (pairs: [string, unknown][]) =>
    pairs.filter(([, value]) => !value).map(([key]) => key);
  if (name === "email") return absent([["SMTP_URL", config.SMTP_URL]]);
  if (name === "whatsapp")
    return absent([
      ["WHATSAPP_PHONE_NUMBER_ID", config.WHATSAPP_PHONE_NUMBER_ID],
      ["WHATSAPP_ACCESS_TOKEN", config.WHATSAPP_ACCESS_TOKEN],
    ]);
  // Documents are kept on the server's disk unless a bucket is named; only a bucket on a custom
  // endpoint (MinIO, R2…) needs keys, since plain S3 may use the host's own role. The virus scanner is optional.
  if (!config.S3_BUCKET) return [];
  return config.S3_ENDPOINT
    ? absent([
        ["S3_ACCESS_KEY", config.S3_ACCESS_KEY],
        ["S3_SECRET_KEY", config.S3_SECRET_KEY],
      ])
    : [];
}
const what: Record<Name, string> = {
  documents: "Document upload and download",
  email: "Password-reset email",
  whatsapp: "WhatsApp messaging",
};
export function integrationStatus(
  name: Name,
  admin = false,
): IntegrationStatus {
  const missing = missingFor(name);
  const available = missing.length === 0;
  return {
    available,
    missing: admin ? missing : [],
    message: available
      ? ""
      : `${what[name]} is unavailable because it has not been set up on the server.` +
        (admin
          ? ` Add ${missing.join(", ")} to the server settings and restart.`
          : " Ask a workspace administrator to finish the setup."),
  };
}
export const integrations = (admin = false) => ({
  documents: integrationStatus("documents", admin),
  email: integrationStatus("email", admin),
  whatsapp: integrationStatus("whatsapp", admin),
});
