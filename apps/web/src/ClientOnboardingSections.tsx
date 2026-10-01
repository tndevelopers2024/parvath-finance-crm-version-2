import type { CSSProperties, ReactNode } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import type { ClientInput } from "../../../packages/contracts/src/index";
import { onboardingProfileSchema } from "../../../packages/contracts/src/index";
import type { z } from "zod";
import { Avatar } from "./components";

export type OnboardingProfile = z.input<typeof onboardingProfileSchema>;
type Props = {
  profile: OnboardingProfile;
  setProfile: (profile: OnboardingProfile) => void;
  form: UseFormReturn<ClientInput>;
};

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="onboard-section">
      <div className="onboard-section-head">
        <h3>{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Text({
  label,
  value,
  onChange,
  type = "text",
  placeholder = "",
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="onboard-field">
      {label}
      <input
        type={type}
        value={value || ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value?: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="onboard-field">
      {label}
      <select value={value || ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select</option>
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function Checks({
  options,
  selected = [],
  onChange,
}: {
  options: string[];
  selected?: string[];
  onChange: (selected: string[]) => void;
}) {
  return (
    <div className="onboard-check-grid">
      {options.map((option) => (
        <label key={option}>
          <input
            type="checkbox"
            checked={selected.includes(option)}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? [...selected, option]
                  : selected.filter((v) => v !== option),
              )
            }
          />
          {option}
        </label>
      ))}
    </div>
  );
}

type Row = Record<string, string | undefined>;
function Rows({
  columns,
  rows,
  onChange,
  addLabel,
}: {
  columns: { key: string; label: string; type?: string }[];
  rows: Row[];
  onChange: (rows: Row[]) => void;
  addLabel: string;
}) {
  return (
    <div
      className="onboard-rows"
      style={{ "--row-columns": columns.length } as CSSProperties}
    >
      <div className="onboard-rows-head">
        {columns.map((c) => (
          <span key={c.key}>{c.label}</span>
        ))}
        <span>Actions</span>
      </div>
      {rows.map((row, index) => (
        <div className="onboard-row" key={index}>
          {columns.map((c) => (
            <input
              key={c.key}
              aria-label={`${c.label} ${index + 1}`}
              type={c.type || "text"}
              value={row[c.key] || ""}
              onChange={(e) =>
                onChange(
                  rows.map((item, i) =>
                    i === index ? { ...item, [c.key]: e.target.value } : item,
                  ),
                )
              }
            />
          ))}
          <button
            type="button"
            aria-label={`Remove ${addLabel} ${index + 1}`}
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="onboard-add"
        onClick={() => onChange([...rows, {}])}
      >
        <Plus size={14} /> {addLabel}
      </button>
    </div>
  );
}

export function AdditionalDetails({ profile, setProfile, form }: Props) {
  const put = (key: keyof OnboardingProfile, value: any) =>
    setProfile({ ...profile, [key]: value });
  const { register } = form;
  return (
    <div className="onboard-sections two-columns">
      <div>
        <Section title="Family Information">
          <div className="onboard-fields two-columns">
            <Choice
              label="Marital Status"
              value={profile.maritalStatus}
              options={["Single", "Married", "Divorced", "Widowed"]}
              onChange={(v) => put("maritalStatus", v)}
            />
            <Text
              label="Spouse Name"
              value={profile.spouseName}
              onChange={(v) => put("spouseName", v)}
            />
            <Text
              label="Spouse Date of Birth"
              type="date"
              value={profile.spouseDob}
              onChange={(v) => put("spouseDob", v)}
            />
            <Text
              label="Wedding Date"
              type="date"
              value={profile.weddingDate}
              onChange={(v) => put("weddingDate", v)}
            />
            <label className="onboard-field">
              No. of Children
              <input value={profile.children?.length || 0} readOnly />
            </label>
            <Text
              label="No. of Dependents"
              type="number"
              value={profile.dependents}
              onChange={(v) => put("dependents", v)}
            />
          </div>
          <h4>Children Details</h4>
          <Rows
            columns={[
              { key: "name", label: "Name" },
              { key: "dob", label: "Date of Birth", type: "date" },
              { key: "relationship", label: "Relationship" },
            ]}
            rows={profile.children || []}
            onChange={(v) => put("children", v)}
            addLabel="Add Another Child"
          />
        </Section>
        <Section title="Professional Information">
          <div className="onboard-fields two-columns">
            <Text
              label="Company Name"
              value={profile.companyName}
              onChange={(v) => put("companyName", v)}
            />
            <Text
              label="Designation"
              value={profile.designation}
              onChange={(v) => put("designation", v)}
            />
            <Text
              label="Industry"
              value={profile.professionalIndustry}
              onChange={(v) => put("professionalIndustry", v)}
            />
            <Text
              label="Experience"
              value={profile.experience}
              onChange={(v) => put("experience", v)}
            />
          </div>
        </Section>
      </div>
      <div>
        <Section title="Address Details">
          <label className="onboard-inline">
            <input
              type="checkbox"
              checked={profile.sameAddress !== false}
              onChange={(e) => put("sameAddress", e.target.checked)}
            />
            Same as Residential Address
          </label>
          <div className="onboard-fields">
            <label className="onboard-field">
              Residential Address
              <textarea {...register("address")} />
            </label>
            <div className="onboard-fields three-columns">
              <label className="onboard-field">
                City
                <input {...register("city")} />
              </label>
              <label className="onboard-field">
                State
                <input {...register("state")} />
              </label>
              <Text
                label="PIN Code"
                value={profile.pinCode}
                onChange={(v) => put("pinCode", v)}
              />
            </div>
            {profile.sameAddress === false && (
              <label className="onboard-field">
                Permanent Address
                <textarea
                  value={profile.permanentAddress || ""}
                  onChange={(e) => put("permanentAddress", e.target.value)}
                />
              </label>
            )}
          </div>
        </Section>
        <Section title="How Did You Know the Client?">
          <div className="onboard-fields two-columns">
            <label className="onboard-field">
              Source
              <select {...register("source")}>
                <option>Direct</option>
                <option>Referral</option>
                <option>Website</option>
                <option>Walk-in</option>
                <option>Campaign</option>
              </select>
            </label>
            <Text
              label="Referred By"
              value={profile.referredBy}
              onChange={(v) => put("referredBy", v)}
            />
            <Choice
              label="Client Category"
              value={profile.clientCategory}
              options={["Priority Client", "Standard Client", "Prospect"]}
              onChange={(v) => put("clientCategory", v)}
            />
            <Text
              label="Client Since"
              type="date"
              value={profile.clientSince}
              onChange={(v) => put("clientSince", v)}
            />
          </div>
        </Section>
      </div>
    </div>
  );
}

export function FinancialProfile({ profile, setProfile, form }: Props) {
  const put = (key: keyof OnboardingProfile, value: any) =>
    setProfile({ ...profile, [key]: value });
  const { register } = form;
  return (
    <div className="onboard-sections">
      <div className="two-columns onboard-split">
        <Section title="Income & Savings">
          <div className="onboard-fields">
            <label className="onboard-field">
              Annual Income Range
              <select {...register("annualIncome")}>
                <option value="">Select</option>
                {[
                  "Below ₹25 Lakhs",
                  "₹25–50 Lakhs",
                  "₹50 Lakhs–1 Crore",
                  "Above ₹1 Crore",
                ].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <div className="onboard-fields two-columns">
              <Text
                label="Monthly Savings (Approx)"
                value={profile.monthlySavings}
                onChange={(v) => put("monthlySavings", v)}
              />
              <Text
                label="Total Savings (Approx)"
                value={profile.totalSavings}
                onChange={(v) => put("totalSavings", v)}
              />
            </div>
          </div>
        </Section>
        <Section title="Risk Profile & Goals">
          <div className="onboard-fields two-columns">
            <label className="onboard-field">
              Risk Profile
              <select {...register("riskProfile")}>
                <option value="">Not assessed</option>
                <option>Conservative</option>
                <option>Moderate</option>
                <option>Growth</option>
              </select>
            </label>
            <Choice
              label="Investment Horizon"
              value={profile.investmentHorizon}
              options={[
                "Short Term (0–3 years)",
                "Medium Term (3–10 years)",
                "Long Term (10+ years)",
              ]}
              onChange={(v) => put("investmentHorizon", v)}
            />
          </div>
          <h4>Financial Goals</h4>
          <Checks
            options={[
              "Wealth Creation",
              "Tax Saving",
              "Retirement Planning",
              "Home Purchase",
              "Vehicle Purchase",
              "Emergency Fund",
              "Business Expansion",
              "Other",
            ]}
            selected={profile.financialGoals}
            onChange={(v) => put("financialGoals", v)}
          />
        </Section>
      </div>
      <Section
        title="Existing Insurance Policies"
        action={
          <button
            type="button"
            className="onboard-add"
            onClick={() => put("policies", [...(profile.policies || []), {}])}
          >
            <Plus size={14} /> Add Insurance
          </button>
        }
      >
        <Rows
          columns={[
            { key: "type", label: "Type" },
            { key: "provider", label: "Provider" },
            { key: "name", label: "Policy Name" },
            { key: "sumAssured", label: "Sum Assured" },
            { key: "renewalDate", label: "Renewal Date", type: "date" },
          ]}
          rows={profile.policies || []}
          onChange={(v) => put("policies", v)}
          addLabel="Add Insurance"
        />
      </Section>
      <Section
        title="Existing Loans"
        action={
          <button
            type="button"
            className="onboard-add"
            onClick={() => put("loans", [...(profile.loans || []), {}])}
          >
            <Plus size={14} /> Add Loan
          </button>
        }
      >
        <Rows
          columns={[
            { key: "type", label: "Loan Type" },
            { key: "bank", label: "Bank / Institution" },
            { key: "amount", label: "Loan Amount" },
            { key: "outstanding", label: "Outstanding" },
            { key: "emi", label: "EMI" },
            { key: "closureDate", label: "Closure Date", type: "date" },
          ]}
          rows={profile.loans || []}
          onChange={(v) => put("loans", v)}
          addLabel="Add Loan"
        />
      </Section>
      <Section
        title="Other Investments / Bonds / Debentures / Mutual Funds"
        action={
          <button
            type="button"
            className="onboard-add"
            onClick={() =>
              put("investments", [...(profile.investments || []), {}])
            }
          >
            <Plus size={14} /> Add Investment
          </button>
        }
      >
        <Rows
          columns={[
            { key: "type", label: "Type" },
            { key: "provider", label: "Provider" },
            { key: "amount", label: "Investment Amount" },
            { key: "maturityDate", label: "Maturity Date", type: "date" },
            { key: "expectedReturn", label: "Expected Return" },
          ]}
          rows={profile.investments || []}
          onChange={(v) => put("investments", v)}
          addLabel="Add Investment"
        />
      </Section>
    </div>
  );
}

export function Preferences({ profile, setProfile, form }: Props) {
  const put = (key: keyof OnboardingProfile, value: any) =>
    setProfile({ ...profile, [key]: value });
  return (
    <div className="onboard-sections two-columns">
      <div>
        <Section title="Communication Preferences">
          <h4>Preferred Communication</h4>
          <Checks
            options={["WhatsApp", "Phone Call", "Email", "SMS"]}
            selected={profile.communicationChannels}
            onChange={(v) => put("communicationChannels", v)}
          />
          <div className="onboard-fields">
            <label className="onboard-field">
              Preferred Contact Method
              <select {...form.register("preferredContact")}>
                <option value="">Select</option>
                <option>WhatsApp</option>
                <option>Call</option>
                <option>Email</option>
              </select>
            </label>
            <Choice
              label="Preferred Contact Time"
              value={profile.preferredTime}
              options={[
                "Morning (9 AM – 12 PM)",
                "Afternoon (12 PM – 5 PM)",
                "Evening (6 PM – 9 PM)",
              ]}
              onChange={(v) => put("preferredTime", v)}
            />
            <Choice
              label="Best Day to Contact"
              value={profile.bestDay}
              options={[
                "Any Day",
                "Weekdays",
                "Weekends",
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday",
                "Saturday",
                "Sunday",
              ]}
              onChange={(v) => put("bestDay", v)}
            />
          </div>
        </Section>
        <Section title="WhatsApp & Engagement Preferences">
          <p className="onboard-help">
            Select topics the client is interested in. Marketing consent is
            recorded separately.
          </p>
          <Checks
            options={[
              "Renewal Reminders",
              "New Product Updates",
              "Birthday Wishes",
              "Market Insights",
              "Anniversary Wishes",
              "Promotional Offers",
              "Festival Wishes",
              "Event Invitations",
              "Financial Updates",
              "Other",
            ]}
            selected={profile.engagementTopics}
            onChange={(v) => put("engagementTopics", v)}
          />
        </Section>
      </div>
      <div>
        <Section title="Important Dates">
          <Rows
            columns={[
              { key: "type", label: "Type" },
              { key: "date", label: "Date", type: "date" },
              { key: "description", label: "Description" },
            ]}
            rows={profile.importantDates || []}
            onChange={(v) => put("importantDates", v)}
            addLabel="Add Date"
          />
        </Section>
        <Section title="Interests">
          <Checks
            options={[
              "Life Insurance",
              "Mutual Funds",
              "Health Insurance",
              "Bonds / Debentures",
              "Vehicle Insurance",
              "Retirement Planning",
              "Home Insurance",
              "Tax Planning",
              "Loans",
              "Other",
            ]}
            selected={profile.interests}
            onChange={(v) => put("interests", v)}
          />
        </Section>
        <div className="onboard-fields two-columns">
          <Section title="Communication Language">
            <Choice
              label="Language"
              value={profile.language}
              options={[
                "English",
                "Tamil",
                "English / Tamil",
                "Hindi",
                "Other",
              ]}
              onChange={(v) => put("language", v)}
            />
          </Section>
          <Section title="Contact Restrictions">
            <label className="onboard-inline">
              <input
                type="checkbox"
                checked={!!profile.noCallsDuringHours}
                onChange={(e) => put("noCallsDuringHours", e.target.checked)}
              />
              Don't call during working hours
            </label>
            <label className="onboard-inline">
              <input
                type="checkbox"
                checked={!!profile.whatsappOnly}
                onChange={(e) => put("whatsappOnly", e.target.checked)}
              />
              WhatsApp only
            </label>
          </Section>
        </div>
      </div>
    </div>
  );
}

export function ReviewSummary({
  profile,
  setProfile,
  form,
  goTo,
  editing = false,
}: Props & { goTo: (step: number) => void; editing?: boolean }) {
  const v = form.getValues();
  const group = (title: string, step: number, rows: [string, unknown][]) => (
    <Section
      title={title}
      action={
        <button
          type="button"
          className="onboard-edit"
          onClick={() => goTo(step)}
        >
          Edit
        </button>
      }
    >
      <dl className="onboard-summary">
        {rows
          .filter(
            ([, value]) =>
              value !== undefined && value !== "" && value !== null,
          )
          .map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>
                {Array.isArray(value)
                  ? value.length
                    ? `${value.length} recorded`
                    : "None"
                  : String(value)}
              </dd>
            </div>
          ))}
      </dl>
    </Section>
  );
  return (
    <div className="onboard-review">
      <div className="onboard-review-identity">
        <div className="onboard-avatar">
          <Avatar name={v.name || "New Client"} animate="always" />
        </div>
        <div>
          <h2>{v.name || "New Client"}</h2>
          <p>
            {v.phone} · {v.email || "No email"} · {v.city || "City not entered"}
          </p>
        </div>
        <button type="button" className="onboard-edit" onClick={() => goTo(0)}>
          Edit
        </button>
      </div>
      <div className="two-columns onboard-split">
        <div>
          {group("Personal Information", 0, [
            ["Date of Birth", v.dob],
            ["Gender", v.gender],
            ["Occupation", v.occupation],
            ["Company", profile.companyName],
            ["Designation", profile.designation],
          ])}
          {group("Family Information", 1, [
            ["Marital Status", profile.maritalStatus],
            ["Spouse Name", profile.spouseName],
            ["Children", profile.children?.length || 0],
            ["Dependents", profile.dependents],
          ])}
          {group("Address", 1, [
            ["Residential Address", v.address],
            ["City", v.city],
            ["State", v.state],
            ["PIN Code", profile.pinCode],
            [
              "Permanent Address",
              profile.sameAddress === false
                ? profile.permanentAddress
                : "Same as residential address",
            ],
          ])}
        </div>
        <div>
          {group("Financial Profile", 2, [
            ["Annual Income", v.annualIncome],
            ["Risk Profile", v.riskProfile],
            ["Goals", profile.financialGoals],
            ["Insurance", profile.policies?.length || 0],
            ["Loans", profile.loans?.length || 0],
            ["Investments", profile.investments?.length || 0],
          ])}
          {group("Preferences", 3, [
            ["Preferred Contact", profile.communicationChannels],
            ["Preferred Time", profile.preferredTime],
            ["Engagement", profile.engagementTopics],
            ["Interests", profile.interests],
            ["Language", profile.language],
          ])}
          {!editing && (
            <Section title="Initial Follow-up (optional)">
              <label className="onboard-inline">
                <input
                  type="checkbox"
                  checked={!!profile.initialFollowup?.enabled}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      initialFollowup: {
                        ...profile.initialFollowup,
                        enabled: e.target.checked,
                      },
                    })
                  }
                />
                Create a follow-up on save
              </label>
              {profile.initialFollowup?.enabled && (
                <div className="onboard-fields two-columns">
                  <Text
                    label="Follow-up Date"
                    type="date"
                    value={profile.initialFollowup.date}
                    onChange={(date) =>
                      setProfile({
                        ...profile,
                        initialFollowup: { ...profile.initialFollowup!, date },
                      })
                    }
                  />
                  <Choice
                    label="Follow-up Type"
                    value={profile.initialFollowup.channel}
                    options={["Call", "WhatsApp", "Email", "Meeting"]}
                    onChange={(channel) =>
                      setProfile({
                        ...profile,
                        initialFollowup: {
                          ...profile.initialFollowup!,
                          channel: channel as
                            "Call" | "WhatsApp" | "Email" | "Meeting",
                        },
                      })
                    }
                  />
                  <Text
                    label="Notes"
                    value={profile.initialFollowup.notes}
                    onChange={(notes) =>
                      setProfile({
                        ...profile,
                        initialFollowup: { ...profile.initialFollowup!, notes },
                      })
                    }
                  />
                </div>
              )}
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
