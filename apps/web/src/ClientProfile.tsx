import { useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Mail,
  MapPin,
  Pencil,
  Phone,
  UserRound,
  CalendarDays,
  Briefcase,
  Heart,
  Download,
  ChevronRight,
  Plus,
  Lightbulb,
  Trash2,
} from "lucide-react";
import { date, rupees, useData, useWrite } from "./api";
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
  Metrics,
  Modal,
  Panel,
  ProductIcon,
  QuickActions,
  Tabs,
  useAuth,
  useToast,
} from "./components";
export default function ClientProfile() {
  const user = useAuth(),
    { id } = useParams(),
    loc = useLocation(),
    navigate = useNavigate(),
    toast = useToast(),
    q = useData("/clients/" + id),
    write = useWrite();
  const [tab, setTab] = useState(
      new URLSearchParams(loc.search).get("tab") === "products"
        ? "Products"
        : "Overview",
    ),
    [note, setNote] = useState(""),
    [relationship, setRelationship] = useState(false),
    [health, setHealth] = useState(false),
    [showDelete, setShowDelete] = useState(false);
  const canDelete = user.role === "Administrator" || user.role === "Adviser";
  const file = useRef<HTMLInputElement>(null);
  if (q.isPending) return <Loading layout="detail" />;
  if (q.error) return <ErrorState error={q.error} />;
  const c = q.data.data;
  const onboarding = c.onboardingProfile || {};
  const edit = (
    <Link className="button small" to={`/clients/${id}/edit`}>
      <Pencil size={13} />
      Edit
    </Link>
  );
  const next = c.events.find((e: any) => e.status === "Pending");
  const upload = async (f: File) => {
    const body = new FormData();
    body.append("file", f);
    try {
      await write.mutateAsync({ path: `/clients/${id}/documents`, body });
      toast("Document uploaded to quarantine for scanning");
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const documents = (
    <Panel
      title={`Documents (${c.documents.length})`}
      action={
        <button className="text-link" onClick={() => file.current?.click()}>
          Upload
        </button>
      }
    >
      {c.documents.length ? (
        c.documents.map((d: any) => (
          <div className="document-row" key={d.id}>
            <span className="product-icon rose">
              <Download size={17} />
            </span>
            <div>
              <strong>{d.name}</strong>
              <small>
                {(d.size / 1024).toFixed(0)} KB · {date(d.createdAt)} ·{" "}
                {d.status}
              </small>
            </div>
            {d.status === "Available" ? (
              <a
                className="button icon-button"
                aria-label={"Download " + d.name}
                href={`/api/documents/${d.id}/download`}
              >
                <Download size={15} />
              </a>
            ) : (
              <Badge>{d.status}</Badge>
            )}
          </div>
        ))
      ) : (
        <Empty
          text="No documents yet"
          action={
            <button onClick={() => file.current?.click()}>
              Upload document
            </button>
          }
        />
      )}
    </Panel>
  );
  const products = (
    <Panel
      title={`Products (${c.products.length})`}
      action={
        <Link
          className="button primary small"
          to={`/products/new?clientId=${id}`}
        >
          <Plus size={14} />
          Add policy / account
        </Link>
      }
    >
      {c.products.length ? (
        c.products.map((p: any) => (
          <Link className="profile-product" to={"/products/" + p.id} key={p.id}>
            <ProductIcon category={p.definition.category} size={23} />
            <div>
              <strong>{p.definition.category}</strong>
              <small>
                {p.definition.provider.name} – {p.definition.name}
              </small>
              <small>Policy / Account: {p.identifier}</small>
              <small>
                {p.premiumMinor
                  ? "Premium: " + rupees(p.premiumMinor) + " / year"
                  : p.principalMinor
                    ? "Principal: " + rupees(p.principalMinor)
                    : "Application in progress"}
              </small>
            </div>
            <Badge>{p.status}</Badge>
            <ChevronRight size={15} />
          </Link>
        ))
      ) : (
        <Empty text="No products linked" />
      )}
    </Panel>
  );
  return (
    <>
      <Panel className="profile-top">
        <Back
          to={
            loc.state?.returnTo ||
            sessionStorage.getItem(
              "parvath-directory-" + user.organizationId,
            ) ||
            "/clients"
          }
        />
        <div className="profile-header">
          <Avatar name={c.name} photoId={c.photoId} size="large" />
          <div className="profile-identity">
            <div>
              <h1>{c.name}</h1>
              <Badge>{c.status} Client</Badge>
            </div>
            <p>
              <Phone size={16} />
              {c.phone}
              <Mail size={16} />
              {c.email || "No email"}
              <MapPin size={16} />
              {[c.city, c.state].filter(Boolean).join(", ") ||
                "Location not provided"}
            </p>
            <span className="profile-labels">
              <Badge>{c.kind}</Badge>
              <Badge tone="amber">Valued Client</Badge>
              <Badge tone="neutral">
                Since {new Date(c.createdAt).getFullYear()}
              </Badge>
            </span>
          </div>
          <div className="profile-header-actions">
            <div>
              <ContactActions client={c} />
              <Link
                className="button"
                to={`/engagement/new?clientId=${id}&channel=Email`}
              >
                <Mail size={16} />
                Email
              </Link>
              {edit}
              {canDelete && (
                <button
                  type="button"
                  className="button danger small"
                  onClick={() => setShowDelete(true)}
                  title="Delete client"
                >
                  <Trash2 size={13} />
                  Delete
                </button>
              )}
            </div>
            <p>
              <span>
                Last Contact
                <strong>{date(c.lastContactAt)}</strong>
              </span>
              <span>
                Next Follow-up
                <strong>
                  {date(
                    c.followups.find((f: any) => f.state === "pending")?.dueAt,
                  )}
                </strong>
              </span>
            </p>
          </div>
        </div>
        <Tabs
          items={[
            "Overview",
            `Products (${c.products.length})`,
            `Documents (${c.documents.length})`,
            `Follow-ups (${c.followups.length})`,
            "Communication",
            "Notes",
          ]}
          value={tab === "Products" ? `Products (${c.products.length})` : tab}
          onChange={setTab}
        />
      </Panel>
      <input
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        hidden
        ref={file}
        onChange={(e) => {
          if (e.target.files?.[0]) void upload(e.target.files[0]);
        }}
      />
      {tab === "Overview" ? (
        <div className="profile-layout">
          <div className="profile-main">
            <Metrics
              items={[
                {
                  label: "Active Products",
                  value: c.products.filter((p: any) => p.status === "Active")
                    .length,
                  icon: "insurance",
                  note: "View Products →",
                  to: `/products?clientId=${id}`,
                },
                {
                  label: "Next Renewal",
                  value: date(next?.dueDate),
                  icon: "renewals",
                  note: "View Renewals →",
                  to: `/renewals?clientId=${id}`,
                },
                {
                  label: "Last Contact",
                  value: date(c.lastContactAt),
                  icon: "attention",
                  tone: "blue",
                  note: "View History →",
                  to: `/engagement?clientId=${id}`,
                },
                {
                  label: "Relationship Health",
                  value: c.health.score + "%",
                  icon: "leads",
                  tone: "lavender",
                  note: "Based on contact & follow-through",
                  to: "#",
                  tooltip: JSON.stringify(c.health.signals),
                },
              ]}
            />
            <div className="profile-details">
              <div>
                <Panel title="Personal Information" action={edit}>
                  <dl className="info-list">
                    {[
                      [UserRound, "Full Name", c.name],
                      [Phone, "Phone Number", c.phone],
                      [Mail, "Email Address", c.email],
                      [CalendarDays, "Date of Birth", date(c.dob)],
                      [MapPin, "Address", c.address],
                      [Briefcase, "Occupation", c.occupation],
                      [Heart, "Preferred Contact", c.preferredContact],
                      [
                        CalendarDays,
                        "Client Since",
                        new Date(c.createdAt).getFullYear(),
                      ],
                      [UserRound, "Source", c.source],
                      [Pencil, "Notes", c.notesText],
                    ].map(([C, label, value]: any) => (
                      <div key={label}>
                        <dt>
                          <C size={14} />
                          {label}
                        </dt>
                        <dd>{value || "Not provided"}</dd>
                      </div>
                    ))}
                  </dl>
                </Panel>
                <Panel
                  title={
                    c.kind === "Business"
                      ? "Business Contacts"
                      : "Family Details"
                  }
                  action={
                    <button
                      className="small"
                      onClick={() => setRelationship(true)}
                    >
                      <Pencil size={13} />
                      Edit
                    </button>
                  }
                >
                  {c.relationships.length ? (
                    <dl className="info-list">
                      {c.relationships.map((r: any) => (
                        <div key={r.id}>
                          <dt>
                            <UserRound size={14} />
                            {r.type}
                          </dt>
                          <dd>
                            {r.contact.client ? (
                              <Link to={"/clients/" + r.contact.client.id}>
                                {r.contact.name}
                              </Link>
                            ) : (
                              r.contact.name
                            )}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="muted">
                      Link existing contacts to keep one identity per person.
                    </p>
                  )}
                </Panel>
              </div>
              <div>
                <Panel title="Financial Profile" action={edit}>
                  <dl className="info-list">
                    {[
                      ["Annual Income", c.annualIncome],
                      ["Investment Interest", c.investmentInterest],
                      ["Loan Interest", c.loanInterest],
                      ["Risk Profile", c.riskProfile],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <dt>{k}</dt>
                        <dd>{v || "Not provided"}</dd>
                      </div>
                    ))}
                  </dl>
                </Panel>
                <Panel title="Tags" action={edit}>
                  <div className="tag-list">
                    {c.tags?.length ? (
                      c.tags.map((t: string, i: number) => (
                        <Badge
                          tone={
                            ["amber", "rose", "blue", "lavender", "mint"][i % 5]
                          }
                          key={t}
                        >
                          {t}
                        </Badge>
                      ))
                    ) : (
                      <span className="muted">No tags added</span>
                    )}
                  </div>
                </Panel>
                <Panel
                  className="opportunities-panel"
                  title="Potential Opportunities"
                  action={<Lightbulb size={17} />}
                >
                  {[
                    "Health Insurance",
                    "Investment Products (Bonds/Debentures)",
                    "Wealth Management",
                    "Child Education Plan",
                  ].map((t) => (
                    <Link
                      key={t}
                      to={`/leads/new?clientId=${id}&requirement=${encodeURIComponent(t)}`}
                    >
                      <Plus size={15} />
                      {t}
                    </Link>
                  ))}
                </Panel>
                <Panel
                  title="Upcoming Renewals"
                  action={
                    <Link className="text-link" to={`/renewals?clientId=${id}`}>
                      View All
                    </Link>
                  }
                >
                  <div className="table-scroll">
                    <table className="small-table">
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Date</th>
                          <th>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.events
                          .filter((e: any) => e.status === "Pending")
                          .slice(0, 3)
                          .map((e: any) => (
                            <tr key={e.id}>
                              <td>
                                <Link to={"/renewals/" + e.id}>
                                  {e.product.definition.category}
                                </Link>
                              </td>
                              <td>{date(e.dueDate)}</td>
                              <td>{rupees(e.amountMinor)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              </div>
            </div>
            {Object.keys(onboarding).length > 0 && (
              <Panel title="Onboarding Details" action={edit}>
                <div className="onboard-profile-details">
                  <div>
                    <h3>Family & Professional</h3>
                    <dl className="info-list">
                      {[
                        ["Marital Status", onboarding.maritalStatus],
                        ["Spouse Name", onboarding.spouseName],
                        [
                          "Children",
                          onboarding.children
                            ?.map((child: any) => child.name)
                            .filter(Boolean)
                            .join(", "),
                        ],
                        ["Dependents", onboarding.dependents],
                        ["Company", onboarding.companyName],
                        ["Designation", onboarding.designation],
                        ["Industry", onboarding.professionalIndustry],
                        ["Experience", onboarding.experience],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>{value || "Not provided"}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                  <div>
                    <h3>Goals & Preferences</h3>
                    <dl className="info-list">
                      {[
                        [
                          "Financial Goals",
                          onboarding.financialGoals?.join(", "),
                        ],
                        ["Investment Horizon", onboarding.investmentHorizon],
                        ["Monthly Savings", onboarding.monthlySavings],
                        ["Total Savings", onboarding.totalSavings],
                        [
                          "Contact Channels",
                          onboarding.communicationChannels?.join(", "),
                        ],
                        ["Preferred Time", onboarding.preferredTime],
                        ["Best Day", onboarding.bestDay],
                        [
                          "Engagement Topics",
                          onboarding.engagementTopics?.join(", "),
                        ],
                        ["Interests", onboarding.interests?.join(", ")],
                        ["Language", onboarding.language],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>{value || "Not provided"}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </div>
                {(
                  [
                    [
                      "Reported Insurance Policies",
                      onboarding.policies,
                      "name",
                      "provider",
                    ],
                    ["Reported Loans", onboarding.loans, "type", "bank"],
                    [
                      "Reported Investments",
                      onboarding.investments,
                      "type",
                      "provider",
                    ],
                  ] as const
                ).map(([title, rows, main, secondary]) =>
                  rows?.length ? (
                    <div className="onboard-profile-list" key={title}>
                      <h3>{title}</h3>
                      <p className="muted">
                        Recorded during onboarding. Add a linked product to
                        track financial events.
                      </p>
                      {rows.map((row: any, index: number) => (
                        <div key={index}>
                          <strong>{row[main] || "Untitled"}</strong>
                          <span>
                            {row[secondary] || "Provider not entered"}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null,
                )}
              </Panel>
            )}
          </div>
          <aside className="profile-right">
            <Panel title="Quick Actions">
              <QuickActions profile={id} />
            </Panel>
            {products}
            {documents}
            <button className="text-link" onClick={() => setHealth(true)}>
              How relationship health is calculated
            </button>
          </aside>
        </div>
      ) : tab.startsWith("Products") ? (
        products
      ) : tab.startsWith("Documents") ? (
        documents
      ) : tab.startsWith("Follow-ups") ? (
        <Panel
          title="Follow-ups"
          action={
            <Link
              className="button primary"
              to={`/followups/new?clientId=${id}`}
            >
              Add Follow-up
            </Link>
          }
        >
          {c.followups.map((f: any) => (
            <Link className="record-row" to={"/followups/" + f.id} key={f.id}>
              <CalendarDays />
              <span>
                <strong>
                  {f.channel} · {date(f.dueAt)}
                </strong>
                <small>{f.notes}</small>
              </span>
              <Badge>{f.state}</Badge>
            </Link>
          ))}
          {!c.followups.length && <Empty />}
        </Panel>
      ) : tab === "Communication" ? (
        <Panel
          title="Communication"
          action={
            <Link className="button" to={`/engagement/new?clientId=${id}`}>
              Prepare message
            </Link>
          }
        >
          {c.communications.map((m: any) => (
            <div className="record-row" key={m.id}>
              <Mail />
              <span>
                <strong>
                  {m.channel} · {m.event}
                </strong>
                <small>
                  {m.body} · {date(m.createdAt)}
                </small>
              </span>
            </div>
          ))}
          {!c.communications.length && <Empty />}
        </Panel>
      ) : (
        <Panel title="Notes">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await write.mutateAsync({
                  path: `/clients/${id}/notes`,
                  body: { body: note },
                });
                setNote("");
              } catch {
                /* FormError displays error */
              }
            }}
          >
            <textarea
              aria-label="New note"
              required
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note about this relationship…"
            />
            <FormError error={write.error} />
            <button className="primary" disabled={write.isPending}>
              Add Note
            </button>
          </form>
          {c.notes.map((n: any) => (
            <div className="note" key={n.id}>
              <p>{n.body}</p>
              <small>{date(n.createdAt)}</small>
            </div>
          ))}
        </Panel>
      )}
      {relationship && (
        <RelationshipModal
          clientId={id!}
          onClose={() => setRelationship(false)}
        />
      )}
      {health && (
        <Modal title="Relationship health" onClose={() => setHealth(false)}>
          <p>
            Recent verified contact (up to 40), complete contact details (20),
            active products (20), and no overdue follow-ups (20).
          </p>
          <dl className="info-list">
            {Object.entries(c.health.signals).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{String(v)} points</dd>
              </div>
            ))}
          </dl>
        </Modal>
      )}
      {showDelete && (
        <Modal title="Delete Client" onClose={() => setShowDelete(false)}>
          <p style={{ margin: "0 0 14px" }}>
            Are you sure you want to permanently delete{" "}
            <strong>{c.name}</strong>?
          </p>
          <p
            className="muted"
            style={{ margin: "0 0 20px", fontSize: 13, lineHeight: 1.5 }}
          >
            This will permanently remove this client profile, contact details,
            notes, documents, and associated activity. This action cannot be
            undone.
          </p>
          <FormError error={write.error} />
          <div className="modal-actions">
            <button
              type="button"
              onClick={() => setShowDelete(false)}
              disabled={write.isPending}
            >
              Cancel
            </button>
            <button
              type="button"
              className="danger"
              disabled={write.isPending}
              onClick={async () => {
                try {
                  await write.mutateAsync({
                    path: `/clients/${id}`,
                    method: "DELETE",
                  });
                  toast("Client deleted successfully");
                  setShowDelete(false);
                  navigate("/clients");
                } catch {
                  /* FormError displays error */
                }
              }}
            >
              {write.isPending ? "Deleting..." : "Confirm Delete"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
function RelationshipModal({
  clientId,
  onClose,
}: {
  clientId: string;
  onClose: () => void;
}) {
  const write = useWrite();
  const [targetClientId, setTargetClientId] = useState("");
  return (
    <Modal title="Link an existing contact" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!targetClientId) return;
          const f = new FormData(e.currentTarget);
          try {
            await write.mutateAsync({
              path: `/clients/${clientId}/relationships`,
              body: Object.fromEntries(f),
            });
            onClose();
          } catch {
            /* FormError displays error */
          }
        }}
      >
        <label>
          Contact *
          <ClientCombobox
            name="clientId"
            value={targetClientId}
            onChange={(id) => setTargetClientId(id)}
            excludeId={clientId}
            placeholder="Search contact to link by name, phone..."
            required
          />
        </label>
        <label>
          Relationship
          <select name="type">
            {["Spouse", "Child", "Parent", "Business contact", "Partner"].map(
              (t) => (
                <option key={t}>{t}</option>
              ),
            )}
          </select>
        </label>
        <FormError error={write.error} />
        <button
          className="primary"
          disabled={!targetClientId || write.isPending}
        >
          {write.isPending ? "Linking…" : "Link contact"}
        </button>
      </form>
    </Modal>
  );
}
