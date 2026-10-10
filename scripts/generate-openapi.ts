import { writeFileSync } from "node:fs";
import { z } from "zod";
import {
  clientSchema,
  opportunitySchema,
  followupSchema,
  productSchema,
  eventSchema,
  eventUpdateSchema,
  eventCancelSchema,
  paymentReversalSchema,
} from "../packages/contracts/src/index.js";
const schemas = Object.fromEntries(
  Object.entries({
    Client: clientSchema,
    Opportunity: opportunitySchema,
    FollowUp: followupSchema,
    Product: productSchema,
    FinancialEvent: eventSchema,
    FinancialEventUpdate: eventUpdateSchema,
  }).map(([k, s]) => [
    k,
    z.toJSONSchema(s, { io: "input", unrepresentable: "any" }),
  ]),
);
const paths: Record<string, any> = {};
const add = (
  path: string,
  method: string,
  summary: string,
  schema?: string,
  body?: Record<string, any>,
) => {
  const parameters = [...path.matchAll(/\{(\w+)\}/g)].map((m) => ({
    name: m[1],
    in: "path",
    required: true,
    schema: { type: "string", format: "uuid" },
  }));
  if (method === "get" && !path.includes("{"))
    parameters.push(
      ...[
        "q",
        "page",
        "limit",
        "range",
        "clientId",
        "kind",
        "status",
        "provider",
        "type",
        "from",
        "to",
      ].map((name) => ({
        name,
        in: "query",
        required: false,
        schema: { type: "string" } as any,
      })),
    );
  paths[path] ||= {};
  paths[path][method] = {
    summary,
    tags: [path.split("/")[1]],
    security:
      path.startsWith("/auth/") && !path.endsWith("/me")
        ? []
        : [{ sessionCookie: [] }],
    parameters,
    ...(method !== "get"
      ? {
          parameters: [
            ...parameters,
            {
              name: "X-CSRF-Token",
              in: "header",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: schema
                  ? { $ref: "#/components/schemas/" + schema }
                  : body || { type: "object" },
              },
            },
          },
        }
      : {}),
    responses: {
      "200": { description: "Success; JSON {data, meta?}" },
      "201": { description: "Created" },
      "401": { description: "Sign-in required" },
      "403": { description: "Role or CSRF denied" },
      "404": { description: "Record absent or outside workspace" },
      "409": { description: "Duplicate, stale version or invalid transition" },
      "422": { description: "Zod validation error with fieldErrors" },
      "503": { description: "External integration not configured" },
    },
  };
};
for (const [name, schema] of [
  ["clients", "Client"],
  ["leads", "Opportunity"],
  ["products", "Product"],
  ["renewals", "FinancialEvent"],
  ["followups", "FollowUp"],
]) {
  add("/" + name, "get", "List authorized " + name);
  add("/" + name, "post", "Create " + name, schema);
  add("/" + name + "/{id}", "get", "Get " + name + " detail");
  if (name !== "renewals")
    add(
      "/" + name + "/{id}",
      "patch",
      "Update with optimistic version",
      schema,
    );
  else
    add(
      "/renewals/{id}",
      "patch",
      "Correct due date, amount or recurrence of a pending event; version required",
      "FinancialEventUpdate",
    );
}
for (const [path, method, summary] of [
  ["/health", "get", "Process liveness"],
  ["/ready", "get", "Database readiness"],
  ["/auth/csrf", "get", "Establish CSRF token and anonymous session"],
  ["/auth/login", "post", "Sign in with email and password"],
  ["/auth/logout", "post", "Destroy session"],
  ["/auth/me", "get", "Current membership"],
  [
    "/auth/account",
    "patch",
    "Update name and optional password; currentPassword required",
  ],
  ["/auth/forgot-password", "post", "Send reset link through configured SMTP"],
  ["/auth/reset-password", "post", "Consume single-use reset token"],
  ["/clients/summary", "get", "Directory counts"],
  ["/clients/template", "get", "Download strict CSV import template"],
  [
    "/clients/import/preview",
    "post",
    "Validate CSV string and report row errors",
  ],
  [
    "/clients/import/{id}/commit",
    "post",
    "Import reviewed valid rows idempotently",
  ],
  [
    "/clients/{id}",
    "delete",
    "Delete client and cascade related records; adviser or admin only",
  ],
  ["/clients/bulk", "post", "Change selected client status"],
  ["/clients/{id}/relationships", "post", "Link existing contact identity"],
  ["/clients/{id}/notes", "post", "Record client note"],
  ["/clients/{id}/consents", "post", "Append evidence-backed consent decision"],
  ["/clients/{id}/documents", "post", "Upload multipart file into quarantine"],
  [
    "/documents/{id}/download",
    "get",
    "Authorized controlled download after scan",
  ],
  [
    "/leads/{id}/stage",
    "post",
    "Change stage with version; reason required for Lost/reopening",
  ],
  [
    "/leads/{id}/convert",
    "post",
    "Accept sale idempotently and create linked application",
  ],
  [
    "/renewals/{id}/payment",
    "post",
    "Record exact minor-unit payment with unique reference",
  ],
  [
    "/renewals/{id}/payments/{paymentId}/reverse",
    "post",
    "Reverse one payment on a pending event with a reason; edit permission",
  ],
  [
    "/renewals/{id}/complete",
    "post",
    "Confirm fully paid event and establish next recurrence",
  ],
  ["/renewals/{id}/reminder", "post", "Schedule durable in-app reminder"],
  [
    "/renewals/{id}/cancel",
    "post",
    "Cancel an unpaid pending event with a reason; no next recurrence",
  ],
  [
    "/followups/{id}/complete",
    "post",
    "Complete/cancel with outcome and optional nextDueAt",
  ],
  ["/members", "get", "List workspace members"],
  ["/catalogue", "get", "List product catalogue"],
  ["/catalogue", "post", "Administrator creates catalogue definition"],
  [
    "/dashboard",
    "get",
    "Authoritative counts, attention, calendar and chart data",
  ],
  ["/search", "get", "Authorized global search; q length 2+"],
  ["/notifications", "get", "Current member notifications"],
  ["/notifications/{id}/read", "post", "Mark own notification read"],
  [
    "/communications",
    "get",
    "Verified and manually logged communication events",
  ],
  [
    "/communications",
    "post",
    "Record opened/prepared/manual-outcome event only",
  ],
  [
    "/reports/export",
    "get",
    "Authorized CSV export; module=clients|renewals|followups",
  ],
  ["/jobs", "get", "Administrator job failure visibility"],
  ["/jobs/{id}/retry", "post", "Retry failed durable job"],
])
  add(path, method, summary);
paths["/clients/{id}/documents"].post.requestBody = {
  required: true,
  content: {
    "multipart/form-data": {
      schema: {
        type: "object",
        required: ["file"],
        properties: { file: { type: "string", format: "binary" } },
      },
    },
  },
};
add("/members", "post", "Provision a workspace member; administrator only");
add("/members/{id}", "patch", "Change another member role; administrator only");
for (const path of ["/health", "/ready", "/auth/csrf"])
  paths[path].get.security = [];
const actionSchemas: Record<string, any> = {
  "/auth/login": z.object({ email: z.email(), password: z.string() }),
  "/auth/forgot-password": z.object({ email: z.email() }),
  "/auth/reset-password": z.object({
    token: z.string().length(64),
    password: z.string().min(12),
  }),
  "/leads/{id}/stage": z.object({
    stage: z.string(),
    version: z.number().int(),
    reason: z.string().optional(),
  }),
  "/leads/{id}/convert": z.object({
    version: z.number().int(),
    accepted: z.literal(true),
    definitionId: z.uuid(),
    identifier: z.string().min(3),
  }),
  "/renewals/{id}/payment": z.object({
    reference: z.string().min(3),
    amountMinor: z.string().regex(/^\d+$/),
  }),
  "/renewals/{id}/complete": z.object({ version: z.number().int() }),
  "/renewals/{id}/reminder": z.object({ runAt: z.iso.datetime() }),
  "/renewals/{id}/cancel": eventCancelSchema,
  "/renewals/{id}/payments/{paymentId}/reverse": paymentReversalSchema,
  "/followups/{id}/complete": z.object({
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
  }),
  "/clients/import/preview": z.object({ csv: z.string().max(1000000) }),
  "/members": z.object({
    name: z.string().min(2),
    email: z.email(),
    role: z.enum(["Administrator", "Adviser", "Operations"]),
    password: z.string().min(12),
  }),
};
for (const [p, schema] of Object.entries(actionSchemas))
  paths[p].post.requestBody.content["application/json"].schema =
    z.toJSONSchema(schema);
const spec = {
  openapi: "3.1.0",
  info: {
    title: "Parvath FinServ CRM",
    version: "1.0.0",
    description:
      "All business endpoints require a workspace-scoped session. Mutations require the CSRF token returned by /auth/csrf or /auth/login. Dates use Asia/Kolkata; money is an integer string in paise. See docs/api.md for lifecycle contracts.",
  },
  servers: [{ url: "/api" }],
  components: {
    securitySchemes: {
      sessionCookie: { type: "apiKey", in: "cookie", name: "parvath.sid" },
    },
    schemas,
  },
  paths,
};
writeFileSync("docs/openapi.json", JSON.stringify(spec, null, 2) + "\n");
