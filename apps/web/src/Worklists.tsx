import { Link, useSearchParams } from "react-router-dom";
import { CalendarDays, Mail, MessageCircle, Phone } from "lucide-react";
import { date, query, rupees, time, useData } from "./api";
import {
  Avatar,
  Badge,
  ContactActions,
  Empty,
  ErrorState,
  ExportButton,
  Loading,
  Metrics,
  PageHeading,
  Pagination,
  Panel,
  ProductIcon,
  SearchInput,
  Tabs,
} from "./components";
export default function Worklists({
  type,
}: {
  type: "renewals" | "followups";
}) {
  const renewal = type === "renewals",
    [params, setParams] = useSearchParams();
  const stats = useData("/dashboard"),
    catalogue = useData("/catalogue");
  const range = params.get("range") || "All",
    page = Number(params.get("page") || 1),
    limit = renewal ? 8 : 10;
  const q = useData(
    "/" + type + "?" + query({ ...Object.fromEntries(params), limit }),
  );
  const change = (key: string, value: string) =>
    setParams((p) => {
      if (value) p.set(key, value);
      else p.delete(key);
      if (key !== "page") p.delete("page");
      return p;
    });
  const d = stats.data?.data || {},
    events = d.events || [],
    today = d.today || "2026-09-04";
  const pending = events.filter((e: any) => e.status === "Pending");
  const rangeEvents = (days: number) =>
    pending.filter(
      (e: any) =>
        e.dueDate.slice(0, 10) >= today &&
        e.dueDate.slice(0, 10) <
          new Date(new Date(today).getTime() + days * 86400000)
            .toISOString()
            .slice(0, 10),
    );
  const cards = renewal
    ? [
        {
          label: "Due Today",
          value: rangeEvents(1).length,
          icon: "renewals",
          tone: "rose",
          note:
            rupees(
              rangeEvents(1)
                .filter((e: any) => e.amountMeaning === "Premium due")
                .reduce((a: bigint, e: any) => a + BigInt(e.amountMinor), 0n),
            ) + " premiums",
          to: "/renewals?range=Today",
        },
        {
          label: "Due in 7 Days",
          value: rangeEvents(7).length,
          icon: "renewals",
          tone: "amber",
          note: "Including today",
          to: "/renewals?range=Next+7+Days",
        },
        {
          label: "Due in 30 Days",
          value: rangeEvents(30).length,
          icon: "renewals",
          tone: "blue",
          note: "Including today",
          to: "/renewals?range=Next+30+Days",
        },
        {
          label: "Already Renewed",
          value: events.filter((e: any) => e.status === "Confirmed").length,
          icon: "won",
          tone: "mint",
          note: "Confirmed events",
          to: "/renewals?range=Renewed",
        },
      ]
    : [
        {
          label: "Overdue",
          value: d.followupsOverdue,
          icon: "renewals",
          tone: "rose",
          note: "Needs attention",
          to: "/followups?range=Overdue",
        },
        {
          label: "Due Today",
          value: d.followupsToday,
          icon: "attention",
          tone: "amber",
          note: "Let’s get it done",
          to: "/followups?range=Today",
        },
        {
          label: "This Week",
          value: d.followupsWeek,
          icon: "renewals",
          tone: "blue",
          note: "Stay on track",
          to: "/followups?range=This+Week",
        },
        {
          label: "Completed",
          value: d.followupsCompleted,
          icon: "won",
          tone: "mint",
          note: "Good progress",
          to: "/followups?range=Completed",
        },
      ];
  const tabs = renewal
    ? ["All", "Today", "Next 7 Days", "Next 30 Days", "Overdue", "Renewed"]
    : [
        "All",
        "Overdue",
        "Today",
        "Tomorrow",
        "This Week",
        "Next Week",
        "Completed",
      ];
  return (
    <>
      <PageHeading
        title={renewal ? "Renewals" : "Follow-ups"}
        subtitle={
          renewal
            ? "Stay ahead with upcoming renewals and never miss an opportunity."
            : "Never miss a conversation. Stay on top of your client relationships."
        }
        actions={renewal ? <ExportButton module="renewals" /> : undefined}
      />
      <div className="worklist-layout worklist-full-width">
        <div>
          <Metrics items={cards} />
          <Panel className="worklist-table">
            <Tabs
              items={tabs}
              value={range}
              onChange={(v) => change("range", v)}
            />
            <div className="filters">
              <SearchInput
                value={params.get("q") || ""}
                onChange={(v) => change("q", v)}
                placeholder={
                  renewal
                    ? "Search by client name, policy number..."
                    : "Search follow-ups..."
                }
              />
              {renewal ? (
                <>
                  <select
                    aria-label="Event type"
                    value={params.get("type") || ""}
                    onChange={(e) => change("type", e.target.value)}
                  >
                    <option value="">All Product Types</option>
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
                  <select
                    aria-label="Provider"
                    value={params.get("provider") || ""}
                    onChange={(e) => change("provider", e.target.value)}
                  >
                    <option value="">All Providers</option>
                    {catalogue.data?.data.map((c: any) => (
                      <option key={c.id} value={c.providerId}>
                        {c.provider.name}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <>
                  <select
                    aria-label="Channel"
                    value={params.get("channel") || ""}
                    onChange={(e) => change("channel", e.target.value)}
                  >
                    <option value="">All Types</option>
                    <option>Call</option>
                    <option>WhatsApp</option>
                    <option>Email</option>
                    <option>Meeting</option>
                  </select>
                  <select
                    aria-label="Task status"
                    value={range}
                    onChange={(e) => change("range", e.target.value)}
                  >
                    <option value="All">All Statuses</option>
                    <option>Overdue</option>
                    <option>Today</option>
                    <option>Completed</option>
                    <option>Cancelled</option>
                  </select>
                </>
              )}
              <button className="text-link" onClick={() => setParams({})}>
                Reset
              </button>
            </div>
            {renewal && (params.has("from") || params.has("to")) && (
              <div className="filter-details">
                <label>
                  From
                  <input
                    type="date"
                    value={params.get("from") || ""}
                    onChange={(e) => change("from", e.target.value)}
                  />
                </label>
                <label>
                  Through
                  <input
                    type="date"
                    value={params.get("to") || ""}
                    onChange={(e) => change("to", e.target.value)}
                  />
                </label>
              </div>
            )}
            {q.isPending ? (
              <Loading />
            ) : q.error ? (
              <ErrorState error={q.error} />
            ) : (
              <>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Client {renewal ? "Name" : ""}</th>
                        {renewal ? (
                          <>
                            <th>Product</th>
                            <th>Provider</th>
                            <th>Policy / Account No.</th>
                            <th>Renewal Date</th>
                            <th>Amount</th>
                          </>
                        ) : (
                          <>
                            <th>Type</th>
                            <th>Product</th>
                            <th>Follow-up Date</th>
                            <th>Notes</th>
                          </>
                        )}
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {q.data.data.map((r: any) => {
                        const C =
                          r.channel === "Call"
                            ? Phone
                            : r.channel === "Email"
                              ? Mail
                              : r.channel === "WhatsApp"
                                ? MessageCircle
                                : CalendarDays;
                        return (
                          <tr key={r.id}>
                            <td>
                              <Link
                                className="person-cell"
                                to={"/clients/" + r.clientId}
                              >
                                <Avatar name={r.client.name} />
                                <span>
                                  <strong>{r.client.name}</strong>
                                  <small>
                                    {renewal ? r.client.city : r.client.phone}
                                  </small>
                                </span>
                              </Link>
                            </td>
                            {renewal ? (
                              <>
                                <td>
                                  <Link
                                    className="product-cell"
                                    to={"/products/" + r.productId}
                                  >
                                    <ProductIcon
                                      category={r.product.definition.category}
                                    />
                                    <span>{r.product.definition.category}</span>
                                  </Link>
                                </td>
                                <td>{r.product.definition.provider.name}</td>
                                <td>{r.product.identifier}</td>
                                <td>
                                  <Link to={"/renewals/" + r.id}>
                                    {date(r.dueDate)}
                                  </Link>
                                  <small className="muted">{r.type}</small>
                                </td>
                                <td>
                                  {rupees(r.amountMinor)}
                                  <small title="Amount semantics">
                                    {r.amountMeaning}
                                  </small>
                                </td>
                              </>
                            ) : (
                              <>
                                <td>
                                  <span className="product-cell">
                                    <span
                                      className={`product-icon ${r.channel === "Call" ? "blue" : r.channel === "WhatsApp" ? "mint" : "lavender"}`}
                                    >
                                      <C size={17} />
                                    </span>
                                    {r.channel}
                                  </span>
                                </td>
                                <td>
                                  {r.product?.definition.category ||
                                    r.opportunity?.requirement ||
                                    "General"}
                                  <small>
                                    {r.product?.definition.provider.name}
                                  </small>
                                </td>
                                <td>
                                  <Link to={"/followups/" + r.id}>
                                    {date(r.dueAt)}
                                  </Link>
                                  <small>{time(r.dueAt)}</small>
                                </td>
                                <td className="notes-cell">
                                  <Link to={"/followups/" + r.id}>
                                    {r.notes}
                                  </Link>
                                </td>
                              </>
                            )}
                            <td>
                              <Link to={`/${type}/${r.id}`}>
                                <Badge>{r.timing}</Badge>
                              </Link>
                            </td>
                            <td>
                              <ContactActions
                                client={r.client}
                                compact
                                detail={`/${type}/${r.id}`}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {!q.data.data.length && <Empty />}
                <Pagination
                  total={q.data.meta.total}
                  page={page}
                  limit={limit}
                  onChange={(n) => change("page", String(n))}
                />
              </>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
