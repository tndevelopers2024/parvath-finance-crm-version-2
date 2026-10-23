import { contactRestriction } from "../../../packages/contracts/src/contact-policy.js";
import { HttpError } from "./security.js";
export function profileOf(client: { onboardingJson?: string | null }) {
  return client.onboardingJson ? JSON.parse(client.onboardingJson) : {};
}
export function assertContactAllowed(
  client: { onboardingJson?: string | null },
  channel: string,
  at: Date,
  timezone = "Asia/Kolkata",
) {
  const reason = contactRestriction(profileOf(client), channel, at, timezone);
  if (reason) throw new HttpError(422, reason);
}
