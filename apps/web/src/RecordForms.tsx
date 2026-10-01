import { useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { ArrowRight, CalendarDays, Check, Plus } from "lucide-react";
import { stages } from "../../../packages/contracts/src/index";
import { date, rupees, time, toMinor, useData, useWrite } from "./api";
import {
  Avatar,
  Back,
  Badge,
  ClientCombobox,
  ContactActions,
  Empty,
  ErrorState,
  FormError,
  Loading,
  Modal,
  PageHeading,
  Panel,
  Submit,
  useAuth,
  useToast,
} from "./components";
const formValues = (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  return Object.fromEntries(new FormData(e.currentTarget)) as Record<
    string,
    string
  >;
};
const localISO = (v: string) => new Date(v + "+05:30").toISOString();
export function NewRecord({
  type,
}: {
  type: "leads" | "followups" | "products";
}) {
  const [params] = useSearchParams(),
    user = useAuth(),
    navigate = useNavigate(),
    write = useWrite(),
    toast = useToast();
  const members = useData("/members"),
    catalogue = useData("/catalogue");
  const [clientId, setClientId] = useState(params.get("clientId") || ""),
    [error, setError] = useState("");
  const linkedProducts = useData(
      "/products?clientId=" + clientId,
      !!clientId && type === "followups",
    ),
    linkedLeads = useData(
      "/leads?clientId=" + clientId,
      !!clientId && type === "followups",
    ),
    linkedEvents = useData(
      "/renewals?clientId=" + clientId,
      !!clientId && type === "followups",
    );
  const formReady =
    !members.isPending &&
    (type !== "products" || !catalogue.isPending);
  const title =
    type === "leads"
      ? "Add Lead"
      : type === "followups"
        ? "Add Follow-up"
        : "Add Product";
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    const f = formValues(e);
    if (!clientId) {
      setError("Please select a client");
      return;
    }
    let body: any;
    try {
      if (type === "leads")
        body = {
          ...f,
          clientId,
          nextFollowUp: f.nextFollowUp ? localISO(f.nextFollowUp) : undefined,
          stage: params.get("stage") || "New Enquiries",
        };
      else if (type === "followups")
        body = {
          ...f,
          clientId,
          dueAt: localISO(f.dueAt),
          productId: f.productId || undefined,
          opportunityId: f.opportunityId || undefined,
          eventId: f.eventId || undefined,
        };
      else
        body = {
          ...f,
          clientId,
          premiumMinor: f.premium ? toMinor(f.premium) : undefined,
          principalMinor: f.principal ? toMinor(f.principal) : undefined,
          expectedCommissionMinor: toMinor(f.commission || "0"),
        };
      const r = await write.mutateAsync({ path: "/" + type, body });
      toast(title.replace("Add", "") + " created");
      navigate("/" + type + "/" + r.data.id);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <>
      <Back to={"/" + type}>
        Back to {type === "followups" ? "Follow-ups" : type}
      </Back>
      <PageHeading
        title={title}
        subtitle={
          type === "leads"
            ? "One opportunity, one requirement. Keep the relationship and its history connected."
            : type === "followups"
              ? "Plan the next conversation and make every relationship count."
              : "Link a policy, account, or application to an existing client."
        }
      />
      <Panel className="record-form">
        <form onSubmit={submit}>
          <div className="form-grid">
            <label>
              Client *
              <ClientCombobox
                value={clientId}
                onChange={(id) => {
                  setClientId(id);
                  if (error) setError("");
                }}
                required
              />
              <Link className="text-link" to="/clients/new">
                Create a new client
              </Link>
            </label>
            {type !== "products" && (
              <label>
                Owner *
                <select name="ownerId" defaultValue={user.userId} required>
                  {members.data?.data.map((m: any) => (
                    <option key={m.user.id} value={m.user.id}>
                      {m.user.name} · {m.role}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {type === "leads" ? (
              <>
                <label>
                  Product Requirement *
                  <input
                    name="requirement"
                    required
                    minLength={2}
                    defaultValue={params.get("requirement") || ""}
                    placeholder="e.g. Home Loan"
                  />
                </label>
                <label>
                  Source
                  <select name="source">
                    {[
                      "Referral",
                      "Website",
                      "Walk-in",
                      "Call",
                      "WhatsApp",
                      "Email",
                    ].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <Priority />
                <label>
                  Next Follow-up
                  <input type="datetime-local" name="nextFollowUp" />
                </label>
                <label className="full">
                  Next Action *
                  <input
                    name="nextAction"
                    required
                    minLength={2}
                    placeholder="Discuss requirements and share proposal"
                  />
                </label>
                <label className="full">
                  Notes
                  <textarea name="notes" />
                </label>
              </>
            ) : type === "followups" ? (
              <>
                <label>
                  Channel *
                  <select name="channel">
                    <option>Call</option>
                    <option>WhatsApp</option>
                    <option>Email</option>
                    <option>Meeting</option>
                  </select>
                </label>
                <label>
                  Date & Time (Asia/Kolkata) *
                  <input name="dueAt" required type="datetime-local" />
                </label>
                <Priority />
                <label>
                  Related Product (optional)
                  <select name="productId">
                    <option value="">No product</option>
                    {linkedProducts.data?.data.map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.definition.category} · {p.identifier}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Related Opportunity (optional)
                  <select name="opportunityId">
                    <option value="">No opportunity</option>
                    {linkedLeads.data?.data.map((l: any) => (
                      <option key={l.id} value={l.id}>
                        {l.requirement} · {l.stage}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Related Renewal (optional)
                  <select name="eventId">
                    <option value="">No renewal</option>
                    {linkedEvents.data?.data.map((r: any) => (
                      <option key={r.id} value={r.id}>
                        {r.type} · {date(r.dueDate)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="full">
                  Notes / Next Action *
                  <textarea
                    name="notes"
                    required
                    minLength={2}
                    placeholder="What needs to be discussed?"
                  />
                </label>
              </>
            ) : (
              <>
                <label>
                  Product Catalogue *
                  <select required name="definitionId">
                    <option value="">Select product</option>
                    {catalogue.data?.data.map((d: any) => (
                      <option key={d.id} value={d.id}>
                        {d.provider.name} · {d.name} ({d.category})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Policy / Account / Application Identifier *
                  <input name="identifier" required minLength={3} />
                </label>
                <label>
                  Start Date *<input name="startDate" type="date" required />
                </label>
                <label>
                  Fulfilment Status
                  <select name="status">
                    <option>Application</option>
                    <option>Active</option>
                    <option>Closed</option>
                  </select>
                </label>
                <label>
                  Annual Premium (₹)
                  <input name="premium" type="number" min="0" step="0.01" />
                </label>
                <label>
                  Principal (₹)
                  <input name="principal" type="number" min="0" step="0.01" />
                </label>
                <label>
                  Expected Commission (₹)
                  <input name="commission" type="number" min="0" step="0.01" />
                </label>
              </>
            )}
          </div>
          <FormError error={error ? new Error(error) : write.error} />
          <div className="form-footer">
            <Link className="button" to={"/" + type}>
              Cancel
            </Link>
            {formReady ? (
              <Submit busy={write.isPending}>{title}</Submit>
            ) : (
              <button className="primary" type="button" disabled>
                Loading client…
              </button>
            )}
          </div>
        </form>
      </Panel>
    </>
  );
}
function Priority({ value = "Normal" }: { value?: string }) {
  return (
    <label>
      Priority
      <select name="priority" defaultValue={value}>
        <option>Normal</option>
        <option>High</option>
        <option>Urgent</option>
      </select>
    </label>
  );
}
export function LeadDetail() {
  const { id } = useParams(),
    q = useData("/leads/" + id),
    catalogue = useData("/catalogue"),
    members = useData("/members"),
    write = useWrite(),
    toast = useToast(),
    user = useAuth();
  const [stage, setStage] = useState(""),
    [reason, setReason] = useState(""),
    [accept, setAccept] = useState(false),
    [edit, setEdit] = useState(false);
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  const l = q.data.data;
  return (
    <>
      <Back to="/leads">Back to Leads</Back>
      <PageHeading
        title={l.client.name}
        subtitle={l.requirement}
        actions={
          <>
            <Badge>{l.stage}</Badge>
            <button onClick={() => setEdit(true)}>Edit Lead</button>
          </>
        }
      />
      <div className="detail-layout">
        <Panel title="Opportunity Details">
          <Link className="person-cell" to={"/clients/" + l.clientId}>
            <Avatar name={l.client.name} />
            <span>
              <strong>{l.client.name}</strong>
              <small>{l.client.phone}</small>
            </span>
            <ArrowRight size={16} />
          </Link>
          <dl className="info-list">
            <div>
              <dt>Requirement</dt>
              <dd>{l.requirement}</dd>
            </div>
            <div>
              <dt>Priority</dt>
              <dd>
                <Badge>{l.priority}</Badge>
              </dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>{l.source}</dd>
            </div>
            <div>
              <dt>Owner</dt>
              <dd>
                {
                  members.data?.data.find((m: any) => m.user.id === l.ownerId)
                    ?.user.name
                }
              </dd>
            </div>
            <div>
              <dt>Next Action</dt>
              <dd>{l.nextAction}</dd>
            </div>
            <div>
              <dt>Next Follow-up</dt>
              <dd>{date(l.nextFollowUp)}</dd>
            </div>
            <div>
              <dt>Notes</dt>
              <dd>{l.notes || "No notes yet"}</dd>
            </div>
            {l.lostReason && (
              <div>
                <dt>Lost reason</dt>
                <dd>{l.lostReason}</dd>
              </div>
            )}
          </dl>
          <ContactActions client={l.client} />
          {l.product && (
            <Link className="record-row" to={"/products/" + l.product.id}>
              <Check />
              <span>
                Sales accepted · {l.product.status}
                <small>{l.product.identifier}</small>
              </span>
              <ArrowRight />
            </Link>
          )}
        </Panel>
        <div>
          <Panel title="Move Opportunity">
            <p>
              Use this selector as the keyboard-accessible alternative to
              dragging.
            </p>
            <label>
              Stage
              <select
                value={stage || l.stage}
                onChange={(e) => setStage(e.target.value)}
              >
                {stages.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Reason / Outcome
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Required for Lost and reopening"
              />
            </label>
            <FormError error={write.error} />
            <button
              className="primary"
              disabled={write.isPending || l.stage === "Won"}
              onClick={async () => {
                if (stage === "Won") {
                  setAccept(true);
                  return;
                }
                try {
                  await write.mutateAsync({
                    path: `/leads/${id}/stage`,
                    body: {
                      stage: stage || l.stage,
                      reason,
                      version: l.version,
                    },
                  });
                  toast("Opportunity stage updated");
                } catch {
                  /* Render error */
                }
              }}
            >
              Update Stage
            </button>
            {l.stage === "Won" && (
              <p className="muted">
                Accepted sales retain their history. Create a new opportunity
                for a new requirement.
              </p>
            )}
            {l.stage === "Lost" && user.role !== "Administrator" && (
              <p className="muted">
                Ask an administrator to reopen this opportunity.
              </p>
            )}
          </Panel>
          <Panel title="Stage History">
            {l.history.map((h: any) => (
              <div className="history-row" key={h.id}>
                <Badge>{h.toStage}</Badge>
                <span>
                  {date(h.createdAt)}
                  <small>{h.reason}</small>
                </span>
              </div>
            ))}
          </Panel>
        </div>
      </div>
      {accept && (
        <Modal
          title="Accept sale & create application"
          onClose={() => setAccept(false)}
        >
          <p>
            Won means the client has accepted the proposal. The linked product
            tracks application fulfilment separately. This reuses the current
            client and is safe to retry.
          </p>
          <form
            onSubmit={async (e) => {
              const f = formValues(e);
              try {
                await write.mutateAsync({
                  path: `/leads/${id}/convert`,
                  body: { ...f, version: l.version, accepted: true },
                });
                setAccept(false);
                toast("Sale accepted. Product application created.");
              } catch {
                /* Render error */
              }
            }}
          >
            <label>
              Product
              <select required name="definitionId">
                <option value="">Choose product</option>
                {catalogue.data?.data.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.provider.name} – {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Application Identifier
              <input required name="identifier" minLength={3} />
            </label>
            <label className="choice-row">
              <input required type="checkbox" />
              The client has accepted this proposal
            </label>
            <FormError error={write.error} />
            <Submit busy={write.isPending}>Confirm acceptance</Submit>
          </form>
        </Modal>
      )}
      {edit && (
        <Modal title="Edit Opportunity" onClose={() => setEdit(false)}>
          <form
            onSubmit={async (e) => {
              const f = formValues(e);
              try {
                await write.mutateAsync({
                  path: `/leads/${id}`,
                  method: "PATCH",
                  body: { ...f, version: l.version },
                });
                setEdit(false);
              } catch {
                /* Render error */
              }
            }}
          >
            <label>
              Requirement
              <input name="requirement" defaultValue={l.requirement} required />
            </label>
            <label>
              Owner
              <select name="ownerId" defaultValue={l.ownerId}>
                {members.data?.data.map((m: any) => (
                  <option key={m.user.id} value={m.user.id}>
                    {m.user.name}
                  </option>
                ))}
              </select>
            </label>
            <Priority value={l.priority} />
            <label>
              Source
              <input name="source" defaultValue={l.source} />
            </label>
            <label>
              Next Action
              <input name="nextAction" defaultValue={l.nextAction} required />
            </label>
            <label>
              Notes
              <textarea name="notes" defaultValue={l.notes} />
            </label>
            <FormError error={write.error} />
            <Submit busy={write.isPending} />
          </form>
        </Modal>
      )}
    </>
  );
}
export function FollowupDetail() {
  const { id } = useParams(),
    q = useData("/followups/" + id),
    members = useData("/members"),
    write = useWrite(),
    toast = useToast();
  const [mode, setMode] = useState("");
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  const f = q.data.data;
  return (
    <>
      <Back to="/followups">Back to Follow-ups</Back>
      <PageHeading
        title={f.client.name + " · " + f.channel}
        subtitle={date(f.dueAt) + " at " + time(f.dueAt) + " · Asia/Kolkata"}
        actions={<Badge>{f.timing}</Badge>}
      />
      <div className="detail-layout">
        <Panel title="Follow-up Details">
          <Link className="person-cell" to={"/clients/" + f.clientId}>
            <Avatar name={f.client.name} />
            <strong>{f.client.name}</strong>
          </Link>
          <p className="large-note">{f.notes}</p>
          <dl className="info-list">
            <div>
              <dt>Priority</dt>
              <dd>{f.priority}</dd>
            </div>
            <div>
              <dt>Owner</dt>
              <dd>
                {
                  members.data?.data.find((m: any) => m.user.id === f.ownerId)
                    ?.user.name
                }
              </dd>
            </div>
            <div>
              <dt>Task State</dt>
              <dd>{f.state}</dd>
            </div>
            <div>
              <dt>Outcome</dt>
              <dd>{f.outcome || "Not recorded"}</dd>
            </div>
            {f.product && (
              <div>
                <dt>Product</dt>
                <dd>
                  <Link to={"/products/" + f.productId}>
                    {f.product.definition.category}
                  </Link>
                </dd>
              </div>
            )}
            {f.opportunity && (
              <div>
                <dt>Opportunity</dt>
                <dd>
                  <Link to={"/leads/" + f.opportunityId}>
                    {f.opportunity.requirement}
                  </Link>
                </dd>
              </div>
            )}
          </dl>
          <ContactActions client={f.client} />
          <p className="muted">
            Opening a conversation does not complete this follow-up.
          </p>
        </Panel>
        <Panel title="Next Action">
          {f.state === "pending" ? (
            <div className="stack-actions">
              <button className="primary" onClick={() => setMode("complete")}>
                <Check size={17} />
                Complete & Record Outcome
              </button>
              <button onClick={() => setMode("edit")}>
                <CalendarDays size={17} />
                Edit / Reschedule
              </button>
              <button onClick={() => setMode("cancel")}>
                Cancel Follow-up
              </button>
            </div>
          ) : (
            <Link
              className="button primary"
              to={"/followups/new?clientId=" + f.clientId}
            >
              Create subsequent follow-up
            </Link>
          )}
        </Panel>
      </div>
      {mode && (
        <Modal
          title={
            mode === "edit"
              ? "Edit / Reschedule"
              : mode === "cancel"
                ? "Cancel Follow-up"
                : "Complete Follow-up"
          }
          onClose={() => setMode("")}
        >
          <form
            onSubmit={async (e) => {
              const data = formValues(e);
              try {
                if (mode === "edit")
                  await write.mutateAsync({
                    path: `/followups/${id}`,
                    method: "PATCH",
                    body: {
                      ...data,
                      dueAt: localISO(data.dueAt),
                      version: f.version,
                    },
                  });
                else
                  await write.mutateAsync({
                    path: `/followups/${id}/complete`,
                    body: {
                      version: f.version,
                      state: mode === "cancel" ? "cancelled" : "completed",
                      outcome: data.outcome,
                      nextDueAt: data.nextDueAt
                        ? localISO(data.nextDueAt)
                        : undefined,
                    },
                  });
                setMode("");
                toast("Follow-up updated");
              } catch {
                /* Render error */
              }
            }}
          >
            {mode === "edit" ? (
              <>
                <label>
                  Date & Time (Asia/Kolkata)
                  <input
                    required
                    name="dueAt"
                    type="datetime-local"
                    defaultValue={new Date(
                      new Date(f.dueAt).getTime() + 19800000,
                    )
                      .toISOString()
                      .slice(0, 16)}
                  />
                </label>
                <label>
                  Owner
                  <select name="ownerId" defaultValue={f.ownerId}>
                    {members.data?.data.map((m: any) => (
                      <option key={m.user.id} value={m.user.id}>
                        {m.user.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Channel
                  <select name="channel" defaultValue={f.channel}>
                    {["Call", "WhatsApp", "Email", "Meeting"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <Priority value={f.priority} />
                <label>
                  Notes
                  <textarea name="notes" defaultValue={f.notes} required />
                </label>
              </>
            ) : (
              <>
                <label>
                  Outcome
                  <select
                    name="outcome"
                    defaultValue={
                      mode === "cancel" ? "Not needed" : "Connected"
                    }
                  >
                    {[
                      "Connected",
                      "No answer",
                      "Documents requested",
                      "Meeting arranged",
                      "Not needed",
                    ].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                {mode === "complete" && (
                  <label>
                    Schedule subsequent follow-up (optional)
                    <input name="nextDueAt" type="datetime-local" />
                  </label>
                )}
              </>
            )}
            <FormError error={write.error} />
            <Submit busy={write.isPending}>Confirm</Submit>
          </form>
        </Modal>
      )}
    </>
  );
}
export function RenewalDetail() {
  const { id } = useParams(),
    q = useData("/renewals/" + id),
    write = useWrite(),
    toast = useToast();
  const [mode, setMode] = useState("");
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  const e = q.data.data,
    paid = e.payments.reduce(
      (a: bigint, p: any) => a + BigInt(p.amountMinor),
      0n,
    );
  return (
    <>
      <Back to="/renewals">Back to Renewals</Back>
      <PageHeading
        title={e.type}
        subtitle={`${e.client.name} · ${e.product.definition.provider.name} · ${e.product.identifier}`}
        actions={<Badge>{e.timing}</Badge>}
      />
      <div className="detail-layout">
        <Panel title="Scheduled Financial Event">
          <dl className="info-list">
            <div>
              <dt>Client</dt>
              <dd>
                <Link to={"/clients/" + e.clientId}>{e.client.name}</Link>
              </dd>
            </div>
            <div>
              <dt>Product</dt>
              <dd>
                <Link to={"/products/" + e.productId}>
                  {e.product.definition.name}
                </Link>
              </dd>
            </div>
            <div>
              <dt>Due Date</dt>
              <dd>{date(e.dueDate)}</dd>
            </div>
            <div>
              <dt>{e.amountMeaning}</dt>
              <dd>{rupees(e.amountMinor)}</dd>
            </div>
            <div>
              <dt>Recorded Payments</dt>
              <dd>{rupees(paid)}</dd>
            </div>
            <div>
              <dt>Frequency</dt>
              <dd>
                {e.recurrenceMonths
                  ? "Every " + e.recurrenceMonths + " months"
                  : "One-time event"}
              </dd>
            </div>
          </dl>
          <ContactActions client={e.client} />
          <p className="muted">
            Recording payment and confirming the event are separate actions.
            Historical terms remain preserved.
          </p>
        </Panel>
        <Panel title="Actions">
          {e.status === "Confirmed" ? (
            <p className="success-note">
              Event confirmed. Its history and payments are preserved.
            </p>
          ) : (
            <div className="stack-actions">
              {e.type !== "Loan review" && (
                <button onClick={() => setMode("payment")}>
                  Record Payment / Receipt
                </button>
              )}
              <button className="primary" onClick={() => setMode("complete")}>
                Confirm {e.type === "Insurance renewal" ? "Renewal" : "Event"}
              </button>
              <button onClick={() => setMode("reminder")}>
                Schedule Reminder
              </button>
              <Link
                className="button"
                to={"/followups/new?clientId=" + e.clientId}
              >
                Add Follow-up
              </Link>
            </div>
          )}
          <FormError error={write.error} />
        </Panel>
      </div>
      <Panel title="Renewal & Event History">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Event Type</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Payments</th>
              </tr>
            </thead>
            <tbody>
              {e.product.events.map((r: any) => (
                <tr key={r.id}>
                  <td>
                    <Link to={"/renewals/" + r.id}>{date(r.dueDate)}</Link>
                  </td>
                  <td>{r.type}</td>
                  <td>{rupees(r.amountMinor)}</td>
                  <td>
                    <Badge>{r.status}</Badge>
                  </td>
                  <td>
                    {r.payments.map((p: any) => (
                      <span key={p.id}>
                        {p.reference}: {rupees(p.amountMinor)}{" "}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      {mode && (
        <Modal
          title={
            mode === "payment"
              ? "Record payment / receipt"
              : mode === "reminder"
                ? "Schedule reminder"
                : "Confirm financial event"
          }
          onClose={() => setMode("")}
        >
          <form
            onSubmit={async (ev) => {
              const f = formValues(ev);
              try {
                await write.mutateAsync({
                  path: `/renewals/${id}/${mode === "reminder" ? "reminder" : mode}`,
                  body:
                    mode === "payment"
                      ? {
                          reference: f.reference,
                          amountMinor: toMinor(f.amount),
                        }
                      : mode === "reminder"
                        ? { runAt: localISO(f.runAt) }
                        : { version: e.version },
                });
                setMode("");
                toast(
                  mode === "reminder"
                    ? "In-app reminder scheduled"
                    : "Event updated",
                );
              } catch {
                /* Render error */
              }
            }}
          >
            {mode === "payment" ? (
              <>
                <label>
                  Amount (₹)
                  <input
                    name="amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    defaultValue={Number(BigInt(e.amountMinor) - paid) / 100}
                    required
                  />
                </label>
                <label>
                  Payment Reference
                  <input name="reference" minLength={3} required />
                </label>
              </>
            ) : mode === "reminder" ? (
              <>
                <p>
                  This creates an in-app notification. Automated WhatsApp
                  delivery is not configured.
                </p>
                <label>
                  Date & Time (Asia/Kolkata)
                  <input type="datetime-local" name="runAt" required />
                </label>
              </>
            ) : (
              <p>
                Confirm this event after checking the recorded payment. The next
                recurring event will be established and obsolete reminders
                cancelled. This action is safe to retry.
              </p>
            )}
            <FormError error={write.error} />
            <Submit busy={write.isPending}>Confirm</Submit>
          </form>
        </Modal>
      )}
    </>
  );
}
export function ProductDetail() {
  const { id } = useParams(),
    q = useData("/products/" + id),
    write = useWrite(),
    toast = useToast();
  const [mode, setMode] = useState("");
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  const p = q.data.data;
  return (
    <>
      <Back to="/products">Back to Products</Back>
      <PageHeading
        title={p.definition.category}
        subtitle={p.definition.provider.name + " · " + p.definition.name}
        actions={<button onClick={() => setMode("edit")}>Edit Product</button>}
      />
      <Panel title="Policy / Account Details">
        <dl className="info-list">
          <div>
            <dt>Owner</dt>
            <dd>
              <Link to={"/clients/" + p.clientId}>{p.client.name}</Link>
            </dd>
          </div>
          <div>
            <dt>Identifier</dt>
            <dd>{p.identifier}</dd>
          </div>
          <div>
            <dt>Fulfilment Status</dt>
            <dd>
              <Badge>{p.status}</Badge>
            </dd>
          </div>
          <div>
            <dt>Start Date</dt>
            <dd>{date(p.startDate)}</dd>
          </div>
          <div>
            <dt>Annual Premium</dt>
            <dd>
              {p.premiumMinor ? rupees(p.premiumMinor) : "Not applicable"}
            </dd>
          </div>
          <div>
            <dt>Principal</dt>
            <dd>
              {p.principalMinor ? rupees(p.principalMinor) : "Not applicable"}
            </dd>
          </div>
          <div>
            <dt>Expected Commission</dt>
            <dd>{rupees(p.expectedCommissionMinor)}</dd>
          </div>
        </dl>
      </Panel>
      <Panel
        title="Scheduled Events"
        action={
          <button className="primary" onClick={() => setMode("event")}>
            <Plus size={16} />
            Add Event
          </button>
        }
      >
        {p.events.map((e: any) => (
          <Link className="record-row" key={e.id} to={"/renewals/" + e.id}>
            <CalendarDays />
            <span>
              <strong>
                {e.type} · {date(e.dueDate)}
              </strong>
              <small>
                {e.amountMeaning} · {rupees(e.amountMinor)}
              </small>
            </span>
            <Badge>{e.status}</Badge>
          </Link>
        ))}
        {!p.events.length && <Empty text="No scheduled financial events" />}
      </Panel>
      {mode && (
        <Modal
          title={mode === "event" ? "Schedule Financial Event" : "Edit Product"}
          onClose={() => setMode("")}
        >
          <form
            onSubmit={async (e) => {
              const f = formValues(e);
              try {
                await write.mutateAsync(
                  mode === "event"
                    ? {
                        path: "/renewals",
                        body: {
                          productId: id,
                          type: f.type,
                          dueDate: f.dueDate,
                          amountMinor: toMinor(f.amount),
                          recurrenceMonths: f.recurrenceMonths
                            ? Number(f.recurrenceMonths)
                            : undefined,
                        },
                      }
                    : {
                        path: "/products/" + id,
                        method: "PATCH",
                        body: {
                          identifier: f.identifier,
                          status: f.status,
                          startDate: f.startDate,
                          premiumMinor: f.premium
                            ? toMinor(f.premium)
                            : undefined,
                          principalMinor: f.principal
                            ? toMinor(f.principal)
                            : undefined,
                          expectedCommissionMinor: toMinor(f.commission || "0"),
                          version: p.version,
                        },
                      },
                );
                setMode("");
                toast("Product updated");
              } catch {
                /* Render error */
              }
            }}
          >
            {mode === "event" ? (
              <>
                <label>
                  Event Type
                  <select name="type">
                    {[
                      "Insurance renewal",
                      "Premium payment",
                      "Loan instalment",
                      "Loan review",
                      "Bond interest",
                      "Maturity",
                    ].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Due Date
                  <input name="dueDate" type="date" required />
                </label>
                <label>
                  Amount (₹)
                  <input
                    type="number"
                    name="amount"
                    step="0.01"
                    min="0"
                    required
                  />
                </label>
                <label>
                  Repeat every (months; blank for one-time)
                  <input
                    name="recurrenceMonths"
                    type="number"
                    min="1"
                    max="120"
                  />
                </label>
              </>
            ) : (
              <>
                <label>
                  Identifier
                  <input
                    name="identifier"
                    defaultValue={p.identifier}
                    required
                  />
                </label>
                <label>
                  Status
                  <select name="status" defaultValue={p.status}>
                    <option>Application</option>
                    <option>Active</option>
                    <option>Closed</option>
                  </select>
                </label>
                <label>
                  Start Date
                  <input
                    name="startDate"
                    type="date"
                    defaultValue={p.startDate.slice(0, 10)}
                    required
                  />
                </label>
                <label>
                  Annual Premium (₹)
                  <input
                    name="premium"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={
                      p.premiumMinor ? Number(p.premiumMinor) / 100 : ""
                    }
                  />
                </label>
                <label>
                  Principal (₹)
                  <input
                    name="principal"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={
                      p.principalMinor ? Number(p.principalMinor) / 100 : ""
                    }
                  />
                </label>
                <label>
                  Expected Commission (₹)
                  <input
                    name="commission"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={Number(p.expectedCommissionMinor) / 100}
                  />
                </label>
              </>
            )}
            <FormError error={write.error} />
            <Submit busy={write.isPending} />
          </form>
        </Modal>
      )}
    </>
  );
}
