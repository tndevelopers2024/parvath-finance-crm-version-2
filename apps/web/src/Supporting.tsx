import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Bell,
  CalendarDays,
  CheckSquare,
  Laptop,
  Mail,
  Moon,
  Plus,
  ShieldCheck,
  Sun,
  Users,
} from "lucide-react";
import { date, query, rupees, useData, useWrite } from "./api";
import {
  Avatar,
  Badge,
  ClientCombobox,
  Empty,
  ErrorState,
  ExportButton,
  FormError,
  Loading,
  Metrics,
  Modal,
  PageHeading,
  Panel,
  ProductIcon,
  SearchInput,
  Submit,
  useAuth,
  useToast,
} from "./components";
import { useTheme } from "./theme";
export function Products() {
  const [params, setParams] = useSearchParams(),
    q = useData("/products?" + params.toString());
  return (
    <>
      <PageHeading
        title="Products"
        subtitle="Policies, accounts and applications, connected to the right client."
        actions={
          <Link className="button primary" to="/products/new">
            <Plus size={16} />
            Add Product
          </Link>
        }
      />
      <Panel>
        <div className="filters">
          <SearchInput
            value={params.get("q") || ""}
            onChange={(v) => setParams({ q: v })}
            placeholder="Search by client or account identifier..."
          />
        </div>
        {q.isPending ? (
          <Loading />
        ) : q.error ? (
          <ErrorState error={q.error} />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Product</th>
                  <th>Provider</th>
                  <th>Identifier</th>
                  <th>Annual Premium</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {q.data.data.map((p: any) => (
                  <tr key={p.id}>
                    <td>
                      <Link
                        className="person-cell"
                        to={"/clients/" + p.clientId}
                      >
                        <Avatar name={p.client.name} />
                        <strong>{p.client.name}</strong>
                      </Link>
                    </td>
                    <td>
                      <Link className="product-cell" to={"/products/" + p.id}>
                        <ProductIcon category={p.definition.category} />
                        {p.definition.category}
                      </Link>
                    </td>
                    <td>{p.definition.provider.name}</td>
                    <td>
                      <Link to={"/products/" + p.id}>{p.identifier}</Link>
                    </td>
                    <td>
                      {p.premiumMinor
                        ? rupees(p.premiumMinor)
                        : "Not applicable"}
                    </td>
                    <td>
                      <Badge>{p.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!q.data.data.length && <Empty />}
          </div>
        )}
      </Panel>
    </>
  );
}
export function Engagement({ compose = false }: { compose?: boolean }) {
  const [params] = useSearchParams(),
    q = useData(
      "/communications?" + query({ clientId: params.get("clientId") }),
    ),
    write = useWrite(),
    toast = useToast();
  const [channel, setChannel] = useState(params.get("channel") || "WhatsApp"),
    [clientId, setClientId] = useState(params.get("clientId") || ""),
    [body, setBody] = useState(""),
    [event, setEvent] = useState("Message prepared");
  const clientQuery = useData(`/clients/${clientId}`, !!clientId);
  const client = clientQuery.data?.data;
  const open = async () => {
    if (!client) {
      toast("Please choose a client first");
      return;
    }
    try {
      await write.mutateAsync({
        path: "/communications",
        body: { clientId, channel, event: "Conversation opened", body },
      });
      const url =
        channel === "WhatsApp"
          ? `https://wa.me/${(client.phone || "").replace(/\D/g, "")}?text=${encodeURIComponent(body)}`
          : channel === "Call"
            ? `tel:${client.phone || ""}`
            : `mailto:${client.email || ""}?body=${encodeURIComponent(body)}`;
      window.open(url, "_blank", "noopener,noreferrer");
      toast("Conversation opened; delivery is not assumed.");
    } catch {
      /* Render error */
    }
  };
  return (
    <>
      <PageHeading
        title={compose ? "Communication Composer" : "Engagement"}
        subtitle="Keep an honest record of conversations and relationship touchpoints."
        actions={
          !compose ? (
            <Link className="button primary" to="/engagement/new">
              <Plus size={16} />
              Prepare Message
            </Link>
          ) : undefined
        }
      />
      {compose && (
        <Panel title="Prepare a conversation" className="record-form">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!clientId) {
                toast("Please select a client first");
                return;
              }
              try {
                await write.mutateAsync({
                  path: "/communications",
                  body: { clientId, channel, event, body },
                });
                toast(event + " recorded");
              } catch {
                /* Render error */
              }
            }}
          >
            <div className="form-grid">
              <label>
                Client *
                <ClientCombobox
                  value={clientId}
                  onChange={(id) => setClientId(id)}
                  required
                />
              </label>
              <label>
                Channel
                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                >
                  <option>WhatsApp</option>
                  <option>Call</option>
                  <option>Email</option>
                  <option>Meeting</option>
                </select>
              </label>
              <label className="full">
                Message / Outcome
                <textarea
                  required
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Prepare a message or record what happened…"
                />
              </label>
              <label>
                Record event
                <select
                  value={event}
                  onChange={(e) => setEvent(e.target.value)}
                >
                  <option>Message prepared</option>
                  <option>Manual outcome</option>
                </select>
              </label>
            </div>
            <div className="tip">
              <ShieldCheck />
              <p>
                Opening an app is recorded as “Conversation opened”. Sent,
                delivery and reply events require verified provider callbacks.
                Automated delivery is currently unavailable.
              </p>
            </div>
            <FormError error={write.error} />
            <div className="modal-actions">
              <button
                type="button"
                disabled={!clientId || channel === "Meeting"}
                onClick={() => void open()}
              >
                Open {channel}
              </button>
              <Submit busy={write.isPending}>Save record</Submit>
            </div>
          </form>
          {clientId && <ConsentForm clientId={clientId} />}
        </Panel>
      )}
      <Panel title="Communication History">
        {q.isPending ? (
          <Loading />
        ) : q.error ? (
          <ErrorState error={q.error} />
        ) : q.data.data.length ? (
          q.data.data.map((c: any) => (
            <div className="record-row" key={c.id}>
              <span className="product-icon mint">
                <Mail size={18} />
              </span>
              <span>
                <Link to={"/clients/" + c.clientId}>
                  <strong>{c.client.name}</strong>
                </Link>
                <small>
                  {c.channel} · {c.event} · {date(c.createdAt)}
                </small>
                <p>{c.body}</p>
              </span>
            </div>
          ))
        ) : (
          <Empty text="No communications recorded yet" />
        )}
      </Panel>
    </>
  );
}
function ConsentForm({ clientId }: { clientId: string }) {
  const write = useWrite(),
    toast = useToast(),
    [show, setShow] = useState(false);
  return (
    <div className="consent-section">
      <button onClick={() => setShow(!show)}>
        Record communication consent
      </button>
      {show && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = Object.fromEntries(new FormData(e.currentTarget));
            try {
              await write.mutateAsync({
                path: `/clients/${clientId}/consents`,
                body: {
                  channel: f.channel,
                  source: f.source,
                  granted: f.granted === "yes",
                },
              });
              setShow(false);
              toast("Consent evidence recorded");
            } catch {
              /* Render error */
            }
          }}
        >
          <label>
            Channel
            <select name="channel">
              <option>Email</option>
              <option>WhatsApp</option>
              <option>Call</option>
            </select>
          </label>
          <label>
            Decision
            <select name="granted">
              <option value="yes">Granted</option>
              <option value="no">Withdrawn</option>
            </select>
          </label>
          <label>
            Evidence / Source
            <input
              name="source"
              minLength={5}
              required
              placeholder="How and when consent was obtained"
            />
          </label>
          <FormError error={write.error} />
          <Submit busy={write.isPending} />
        </form>
      )}
    </div>
  );
}
export function Reports() {
  const q = useData("/dashboard");
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  const d = q.data.data;
  return (
    <>
      <PageHeading
        title="Reports"
        subtitle="One set of financial definitions, across every view."
      />
      <Metrics
        items={[
          {
            label: "Client Relationships",
            value: d.totalClients,
            icon: "clients",
            to: "/clients",
          },
          {
            label: "Open Opportunities",
            value: d.activeLeads,
            icon: "leads",
            to: "/leads",
          },
          {
            label: "Premiums Due · 30 Days",
            value: rupees(d.premiumDueMinor),
            icon: "renewals",
            to: "/renewals?range=Next+30+Days",
          },
          {
            label: "Expected Commission",
            value: rupees(d.expectedRevenueMinor),
            icon: "revenue",
            to: "/products",
          },
        ]}
      />
      <Panel title="Operational Exports">
        <p>
          Exports contain authorized workspace records. Currency amounts are
          exported in exact integer paise. Formula-like cells are escaped for
          spreadsheet safety.
        </p>
        <div className="export-grid">
          {[
            {
              id: "clients",
              title: "Clients",
              description: "Client profiles, contacts & KYC status",
              icon: Users,
              color: "mint",
            },
            {
              id: "renewals",
              title: "Renewals",
              description: "Schedules, policies & premium amounts",
              icon: CalendarDays,
              color: "amber",
            },
            {
              id: "followups",
              title: "Follow-ups",
              description: "Task schedules, channels & outcomes",
              icon: CheckSquare,
              color: "blue",
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div className="export-card" key={item.id}>
                <div className="export-info">
                  <span className={`export-icon ${item.color}`}>
                    <Icon size={18} />
                  </span>
                  <div>
                    <strong>{item.title}</strong>
                    <small>{item.description}</small>
                  </div>
                </div>
                <ExportButton module={item.id} />
              </div>
            );
          })}
        </div>
      </Panel>
      <Panel title="Metric Definitions">
        <dl className="definitions">
          <dt>Total Clients</dt>
          <dd>
            All client relationships and prospects in the current organization,
            including businesses.
          </dd>
          <dt>Renewals Due</dt>
          <dd>
            Pending scheduled financial events in [today, today + 30 days),
            using the workspace timezone. Event types and amount meanings stay
            separate.
          </dd>
          <dt>Premiums Due</dt>
          <dd>
            Insurance renewal and premium payment amounts only. Principal,
            instalments, interest and maturity proceeds are excluded.
          </dd>
          <dt>Upcoming Revenue</dt>
          <dd>
            Expected commission on distinct products with pending financial
            events in the same 30-day window. This is an estimate, not
            recognized revenue.
          </dd>
          <dt>Due Today / Overdue</dt>
          <dd>
            Today uses the calendar date in Asia/Kolkata. A pending task is
            overdue once its exact due timestamp passes; today's overdue tasks
            remain in the Today filter.
          </dd>
          <dt>Calendar & Date Ranges</dt>
          <dd>
            7-day and 30-day ranges include today and overlap intentionally.
            Closed events are excluded. Custom start/end dates are inclusive.
          </dd>
        </dl>
      </Panel>
    </>
  );
}
export function Notifications() {
  const q = useData("/notifications"),
    write = useWrite(),
    navigate = useNavigate();
  return (
    <>
      <PageHeading
        title="Notifications"
        subtitle="Your reminders and workspace updates."
      />
      <Panel>
        {q.isPending ? (
          <Loading />
        ) : q.error ? (
          <ErrorState error={q.error} />
        ) : q.data.data.length ? (
          q.data.data.map((n: any) => (
            <button
              className={
                "record-row notification-row " + (!n.readAt ? "unread" : "")
              }
              key={n.id}
              onClick={async () => {
                await write.mutateAsync({
                  path: `/notifications/${n.id}/read`,
                });
                navigate(n.link);
              }}
            >
              <Bell size={22} />
              <span>
                <strong>{n.title}</strong>
                <small>{date(n.createdAt)}</small>
              </span>
              {!n.readAt && <Badge>New</Badge>}
            </button>
          ))
        ) : (
          <Empty text="You’re all caught up" />
        )}
      </Panel>
    </>
  );
}
export function Settings() {
  const user = useAuth(),
    write = useWrite(),
    toast = useToast(),
    { theme, resolvedTheme, setTheme } = useTheme(),
    jobs = useData("/jobs", user.role === "Administrator"),
    members = useData("/members"),
    catalogue = useData("/catalogue");
  return (
    <>
      <PageHeading
        title="Settings"
        subtitle="Manage your account and understand your workspace configuration."
      />
      <div className="detail-layout">
        <Panel title="Your Account">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = Object.fromEntries(new FormData(e.currentTarget));
              if (!f.newPassword) delete f.newPassword;
              try {
                await write.mutateAsync({
                  path: "/auth/account",
                  method: "PATCH",
                  body: f,
                });
                toast("Account updated");
              } catch {
                /* Render error */
              }
            }}
          >
            <label>
              Name
              <input name="name" defaultValue={user.name} required />
            </label>
            <label>
              Email
              <input disabled value={user.email} />
            </label>
            <label>
              Current Password
              <input
                name="currentPassword"
                required
                type="password"
                autoComplete="current-password"
              />
            </label>
            <label>
              New Password (optional, 12+ characters)
              <input
                name="newPassword"
                type="password"
                minLength={12}
                autoComplete="new-password"
              />
            </label>
            <FormError error={write.error} />
            <Submit busy={write.isPending} />
          </form>
        </Panel>
        <div>
          <Panel title="Appearance">
            <p className="muted" style={{ marginBottom: 12 }}>
              Choose your preferred visual theme for the CRM.
            </p>
            <div className="segmented">
              <button
                type="button"
                className={theme === "light" ? "primary" : ""}
                onClick={() => setTheme("light")}
              >
                <Sun size={15} /> Light
              </button>
              <button
                type="button"
                className={theme === "system" ? "primary" : ""}
                onClick={() => setTheme("system")}
              >
                <Laptop size={15} /> System
              </button>
              <button
                type="button"
                className={theme === "dark" ? "primary" : ""}
                onClick={() => setTheme("dark")}
              >
                <Moon size={15} /> Dark
              </button>
            </div>
            <p className="muted" style={{ marginTop: 10, fontSize: 11 }}>
              {theme === "system"
                ? `System mode is currently resolving to ${resolvedTheme === "dark" ? "Dark" : "Light"} based on browser preference. Click "Dark" to enable Dark mode directly.`
                : theme === "dark"
                  ? "Dark mode active."
                  : "Light mode active."}
            </p>
          </Panel>
          <Panel title="Workspace">
            <dl className="info-list">
              <div>
                <dt>Role</dt>
                <dd>{user.role}</dd>
              </div>
              <div>
                <dt>Timezone</dt>
                <dd>{user.timezone}</dd>
              </div>
              <div>
                <dt>Clock</dt>
                <dd>
                  {user.demoDate
                    ? "Demo: " + date(user.demoDate)
                    : "Live production clock"}
                </dd>
              </div>
              <div>
                <dt>Messaging</dt>
                <dd>Manual / deep-link provider</dd>
              </div>
              <div>
                <dt>Documents</dt>
                <dd>Private S3; scanning required</dd>
              </div>
            </dl>
          </Panel>
          <Panel
            title="Team"
            action={
              user.role === "Administrator" ? <MemberManager /> : undefined
            }
          >
            {members.data?.data.map((m: any) => (
              <div className="record-row" key={m.user.id}>
                <Avatar name={m.user.name} />
                <span>
                  <strong>{m.user.name}</strong>
                  <small>{m.role}</small>
                </span>
                {user.role === "Administrator" && m.user.id !== user.userId && (
                  <select
                    aria-label={"Role for " + m.user.name}
                    className="role-select"
                    value={m.role}
                    onChange={async (e) => {
                      try {
                        await write.mutateAsync({
                          path: "/members/" + m.id,
                          method: "PATCH",
                          body: { role: e.target.value },
                        });
                        toast("Role updated");
                      } catch {
                        /* Render error */
                      }
                    }}
                  >
                    <option>Administrator</option>
                    <option>Adviser</option>
                    <option>Operations</option>
                  </select>
                )}
              </div>
            ))}
          </Panel>
        </div>
      </div>
      {user.role === "Administrator" && (
        <>
          <Panel title="Product Catalogue">
            <form
              className="inline-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = Object.fromEntries(new FormData(e.currentTarget));
                try {
                  await write.mutateAsync({ path: "/catalogue", body: f });
                  toast("Catalogue item added");
                } catch {
                  /* Render error */
                }
              }}
            >
              <label>
                Product name
                <input name="name" required minLength={2} />
              </label>
              <label>
                Provider
                <input name="provider" required minLength={2} />
              </label>
              <label>
                Category
                <select name="category">
                  {[
                    "Life Insurance",
                    "Health Insurance",
                    "Vehicle Insurance",
                    "Home Loan",
                    "Business Loan",
                    "Investment",
                    "Term Insurance",
                  ].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <Submit busy={write.isPending}>Add product definition</Submit>
            </form>
            <p className="muted">
              {catalogue.data?.data.length || 0} product definitions. Catalogue
              items are separate from client policies.
            </p>
          </Panel>
          <Panel title="Background Jobs & Failures">
            {jobs.data?.data.length ? (
              jobs.data.data.map((j: any) => (
                <div className="record-row" key={j.id}>
                  <Badge>{j.state}</Badge>
                  <span>
                    <strong>{j.type}</strong>
                    <small>
                      {date(j.runAt)} · Attempts {j.attempts} · {j.lastError}
                    </small>
                  </span>
                  {j.state === "failed" && (
                    <button
                      onClick={async () => {
                        await write.mutateAsync({
                          path: `/jobs/${j.id}/retry`,
                        });
                        toast("Job queued for retry");
                      }}
                    >
                      Retry
                    </button>
                  )}
                </div>
              ))
            ) : (
              <Empty text="No background jobs yet" />
            )}
          </Panel>
        </>
      )}
    </>
  );
}

function MemberManager() {
  const [show, setShow] = useState(false),
    write = useWrite(),
    toast = useToast();
  return (
    <>
      <button className="small" onClick={() => setShow(true)}>
        Add Member
      </button>
      {show && (
        <Modal title="Create Workspace Member" onClose={() => setShow(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await write.mutateAsync({
                  path: "/members",
                  body: Object.fromEntries(new FormData(e.currentTarget)),
                });
                setShow(false);
                toast("Member created. Share the initial password securely.");
              } catch {
                /* Render error */
              }
            }}
          >
            <label>
              Full Name
              <input name="name" required minLength={2} />
            </label>
            <label>
              Email Address
              <input name="email" type="email" required />
            </label>
            <label>
              Role
              <select name="role">
                <option>Adviser</option>
                <option>Operations</option>
                <option>Administrator</option>
              </select>
            </label>
            <label>
              Unique Initial Password
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
              />
            </label>
            <p className="muted">
              Use a unique password and share it through a secure channel. The
              member can change it in account settings.
            </p>
            <FormError error={write.error} />
            <Submit busy={write.isPending}>Create Member</Submit>
          </form>
        </Modal>
      )}
    </>
  );
}
