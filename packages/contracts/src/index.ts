import { z } from "zod";
// Plain-language wording for every schema here, shown to staff as-is by the web forms and the API's 422 responses.
// A message given on an individual rule still wins over these.
const blank = (v: unknown) =>
  v === undefined || v === null || (typeof v === "string" && !v.trim());
z.config({
  customError: (issue) => {
    const limit = (n: unknown) => Number(n).toLocaleString("en-IN");
    switch (issue.code) {
      case "invalid_type":
        return blank(issue.input)
          ? "This is required."
          : issue.expected === "number" || issue.expected === "int"
            ? "Enter a number."
            : "Enter a valid value.";
      case "too_small":
        return issue.origin === "string"
          ? blank(issue.input)
            ? "This is required."
            : `Enter at least ${limit(issue.minimum)} characters.`
          : issue.origin === "array" || issue.origin === "set"
            ? `Add at least ${limit(issue.minimum)}.`
            : `Enter ${limit(issue.minimum)} or more.`;
      case "too_big":
        return issue.origin === "string"
          ? `Keep this to ${limit(issue.maximum)} characters or fewer.`
          : issue.origin === "array" || issue.origin === "set"
            ? `No more than ${limit(issue.maximum)} can be added.`
            : `Enter ${limit(issue.maximum)} or less.`;
      case "invalid_format":
        return blank(issue.input)
          ? "This is required."
          : issue.format === "email"
            ? "Enter a valid email address, for example name@example.com."
            : issue.format === "uuid"
              ? "Choose an option from the list."
              : issue.format === "datetime"
                ? "Choose a valid date and time."
                : "This is not in the expected format.";
      case "invalid_value":
        return "Choose one of the available options.";
      case "invalid_union":
        return blank(issue.input)
          ? "This is required."
          : "Enter a valid value.";
      default:
        return undefined;
    }
  },
});
export const stages = [
  "New Enquiries",
  "Contacted",
  "Qualified",
  "Proposal / Discussion",
  "Won",
  "Lost",
] as const;
export const businessDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Enter a valid date.", abort: true })
  .refine((v) => {
    const d = new Date(v + "T00:00:00Z");
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Enter a valid date.");
export const channels = ["Call", "WhatsApp", "Email", "Meeting"] as const;
export const eventTypes = [
  "Insurance renewal",
  "Premium payment",
  "Loan instalment",
  "Loan review",
  "Bond interest",
  "Maturity",
] as const;
const optionalText = z
  .string()
  .trim()
  .max(1000)
  .optional()
  .nullable()
  .transform((v) => v ?? undefined);
const onboardingText = z.string().trim().max(1000).optional();
const onboardingDate = z
  .union([businessDate, z.literal("")], "Enter a valid date.")
  .optional();
// The business day is India's, whatever timezone this runs in.
const todayInIndia = () =>
  new Date(Date.now() + 19800000).toISOString().slice(0, 10);
// Birth and start dates: a real date that is not later than today.
const pastDate = onboardingDate.refine(
  (v) => !v || v <= todayInIndia(),
  "This date cannot be in the future.",
);
// Amounts may be written the way people write them (₹ 25,000 or Rs. 25,000.50) but must be plain money.
const amountText = onboardingText.refine(
  (v) =>
    !v ||
    /^\d{1,15}(?:\.\d{1,2})?$/.test(
      v.replace(/^(?:₹|rs\.?)\s*/i, "").replace(/[,\s]/g, ""),
    ),
  "Enter an amount of 0 or more, such as 25000 or 25,000.50.",
);
// Values already saved are not re-checked when a record is edited and they are left untouched: only fields the
// user has changed are held to the current rules. Returns the profile with its unchanged fields removed.
export const withoutUnchanged = <T extends Record<string, unknown>>(
  next: T | undefined,
  stored: Record<string, unknown> | null | undefined,
): T | undefined => {
  if (!next || !stored) return next;
  const same = (key: string) =>
    key in stored && JSON.stringify(next[key]) === JSON.stringify(stored[key]);
  return Object.fromEntries(
    Object.entries(next).filter(([key]) => !same(key)),
  ) as T;
};
export const onboardingProfileSchema = z.object({
  maritalStatus: onboardingText,
  spouseName: onboardingText,
  spouseDob: pastDate,
  weddingDate: onboardingDate,
  children: z
    .array(
      z.object({
        name: onboardingText,
        dob: pastDate,
        relationship: onboardingText,
      }),
    )
    .max(20)
    .optional(),
  dependents: onboardingText.refine(
    (v) => !v || /^\d{1,2}$/.test(v),
    "Enter the number of dependents as a whole number from 0 to 99.",
  ),
  sameAddress: z.boolean().optional(),
  permanentAddress: onboardingText,
  pinCode: onboardingText.refine(
    (v) => !v || /^[1-9]\d{2}\s?\d{3}$/.test(v),
    "Enter a valid 6-digit PIN code, for example 600001.",
  ),
  companyName: onboardingText,
  designation: onboardingText,
  professionalIndustry: onboardingText,
  experience: onboardingText,
  referredBy: onboardingText,
  clientCategory: onboardingText,
  clientSince: pastDate,
  monthlySavings: amountText,
  totalSavings: amountText,
  investmentHorizon: onboardingText,
  financialGoals: z.array(z.string().max(80)).max(20).optional(),
  policies: z
    .array(
      z.object({
        type: onboardingText,
        provider: onboardingText,
        name: onboardingText,
        sumAssured: onboardingText,
        renewalDate: onboardingDate,
      }),
    )
    .max(30)
    .optional(),
  loans: z
    .array(
      z.object({
        type: onboardingText,
        bank: onboardingText,
        amount: onboardingText,
        outstanding: onboardingText,
        emi: onboardingText,
        closureDate: onboardingDate,
      }),
    )
    .max(30)
    .optional(),
  investments: z
    .array(
      z.object({
        type: onboardingText,
        provider: onboardingText,
        amount: onboardingText,
        maturityDate: onboardingDate,
        expectedReturn: onboardingText,
      }),
    )
    .max(30)
    .optional(),
  communicationChannels: z.array(z.string().max(40)).max(10).optional(),
  preferredTime: onboardingText,
  bestDay: onboardingText,
  engagementTopics: z.array(z.string().max(80)).max(20).optional(),
  interests: z.array(z.string().max(80)).max(20).optional(),
  importantDates: z
    .array(
      z.object({
        type: onboardingText,
        date: onboardingDate,
        description: onboardingText,
      }),
    )
    .max(30)
    .optional(),
  language: onboardingText,
  noCallsDuringHours: z.boolean().optional(),
  whatsappOnly: z.boolean().optional(),
  initialFollowup: z
    .object({
      enabled: z.boolean(),
      date: onboardingDate,
      channel: z.enum(channels).optional(),
      notes: onboardingText,
    })
    .refine(
      (v) =>
        !v.enabled || (!!v.date && !!v.notes && v.notes.trim().length >= 2),
      "Add a date and notes for the follow-up",
    )
    .optional(),
});
// Indian mobiles (optional +91 / 91 / 0 prefix) must start 6-9; other "+" numbers are international and
// only checked for E.164 shape. Applies to input only; stored numbers are never re-validated.
const indianMobile = /^(?:\+91|91|0)?([6-9]\d{9})$/;
export const phone = z
  .string()
  .transform((v) => v.replace(/[\s()-]/g, ""))
  .transform((v) => {
    const m = indianMobile.exec(v);
    return m ? `+91${m[1]}` : v;
  })
  .pipe(
    z
      .string()
      .regex(/^\+[1-9]\d{7,14}$/, {
        error: (issue) =>
          blank(issue.input)
            ? "Enter a phone number."
            : "Enter a 10-digit mobile number starting with 6–9, or an international number with its country code (for example +44…).",
      })
      .refine(
        (v) => !v.startsWith("+91") || /^\+91[6-9]\d{9}$/.test(v),
        "Indian mobile numbers have 10 digits and start with 6, 7, 8 or 9.",
      ),
  );
export const clientSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, {
      error: (issue) =>
        blank(issue.input)
          ? "Enter the client's name."
          : "The name needs at least 2 characters.",
    })
    .max(120, "Keep the name to 120 characters or fewer."),
  phone,
  email: z
    .union(
      [z.email().transform((v) => v.toLowerCase().trim()), z.literal("")],
      "Enter a valid email address, for example name@example.com.",
    )
    .optional()
    .nullable()
    .transform((v) => v ?? undefined),
  kind: z.enum(["Individual", "Business"]).default("Individual"),
  dob: businessDate
    // Use the current business date in India, matching the date picker.
    .refine(
      (v) => v <= new Date(Date.now() + 19800000).toISOString().slice(0, 10),
      "Date of birth cannot be in the future.",
    )
    .optional()
    .or(z.literal(""))
    .nullable()
    .transform((v) => v ?? undefined),
  gender: optionalText,
  occupation: optionalText,
  address: optionalText,
  city: optionalText,
  state: optionalText,
  source: z.string().max(80).default("Direct"),
  annualIncome: optionalText,
  riskProfile: optionalText,
  investmentInterest: optionalText,
  loanInterest: optionalText,
  preferredContact: optionalText,
  notesText: optionalText,
  onboardingProfile: onboardingProfileSchema.optional(),
  registrationNumber: optionalText,
  industry: optionalText,
  allowDuplicate: z.boolean().default(false),
  duplicateReason: optionalText,
  version: z.number().int().positive().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
});
// CSV import rows: blank cells mean "not provided" so schema defaults apply, and dates may be written
// day-first (DD-MM-YYYY or DD/MM/YYYY, India). Output is the same shape as clientSchema.
const blankToUndefined = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;
export const clientImportRowSchema = z.preprocess((raw) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const row: Record<string, unknown> = { ...(raw as object) };
  for (const key of ["kind", "source"]) row[key] = blankToUndefined(row[key]);
  const dob = row.dob;
  if (typeof dob === "string") {
    const m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(dob.trim());
    row.dob = m
      ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`
      : dob.trim();
  }
  return row;
}, clientSchema);
export const opportunitySchema = z.object({
  clientId: z.uuid(),
  requirement: z.string().trim().min(2).max(200),
  ownerId: z.uuid(),
  priority: z.enum(["Normal", "High", "Urgent"]).default("Normal"),
  source: z.string().max(80).default("Referral"),
  notes: optionalText,
  nextAction: z.string().trim().min(2).max(300),
  nextFollowUp: z.iso.datetime().optional(),
  stage: z.enum(stages).default("New Enquiries"),
});
export const followupSchema = z.object({
  clientId: z.uuid(),
  ownerId: z.uuid(),
  channel: z.enum(channels),
  dueAt: z.iso.datetime(),
  priority: z.enum(["Normal", "High", "Urgent"]).default("Normal"),
  notes: z.string().trim().min(2).max(2000),
  opportunityId: z.uuid().optional(),
  productId: z.uuid().optional(),
  eventId: z.uuid().optional(),
});
export const money = z
  .string()
  .regex(/^\d{1,15}$/, "Use a nonnegative whole number of paise");
export const productSchema = z.object({
  clientId: z.uuid(),
  definitionId: z.uuid(),
  identifier: z.string().trim().min(3).max(100),
  status: z.enum(["Application", "Active", "Closed"]).default("Application"),
  startDate: businessDate,
  premiumMinor: money.optional(),
  principalMinor: money.optional(),
  expectedCommissionMinor: money.default("0"),
  insuranceDetails: z
    .object({
      sumAssuredMinor: money,
      termYears: z.number().int().min(1).max(100),
    })
    .optional(),
  loanDetails: z
    .object({
      interestBasisPoints: z.number().int().min(0).max(10000),
      termMonths: z.number().int().min(1).max(600),
    })
    .optional(),
  investmentDetails: z
    .object({ units: z.string().max(50), maturityDate: z.string().optional() })
    .optional(),
});
export const eventSchema = z.object({
  productId: z.uuid(),
  type: z.enum(eventTypes),
  dueDate: businessDate,
  amountMinor: money,
  recurrenceMonths: z.number().int().min(1).max(120).optional(),
});
// Corrections to a pending event. The product and event type are fixed; a
// field left out is unchanged and recurrenceMonths:null makes it one-time.
export const eventUpdateSchema = z
  .object({
    dueDate: businessDate.optional(),
    amountMinor: money.optional(),
    recurrenceMonths: z.number().int().min(1).max(120).nullable().optional(),
    version: z.number().int().positive(),
  })
  .refine(
    (v) =>
      v.dueDate !== undefined ||
      v.amountMinor !== undefined ||
      v.recurrenceMonths !== undefined,
    "Provide a due date, amount or recurrence to correct",
  );
export const eventCancelSchema = z.object({
  reason: z.string().trim().min(3).max(300),
  version: z.number().int().positive(),
});
export const paymentReversalSchema = z.object({
  reason: z.string().trim().min(3).max(300),
});
export type ClientInput = z.input<typeof clientSchema>;
