import { useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { date, rupees, time, useData } from "./api";
import {
  Avatar,
  Badge,
  Empty,
  ErrorState,
  Loading,
  PageHeading,
  Panel,
  SearchInput,
  Tabs,
} from "./components";
const iso = (value: Date) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
const localDay = (value: string) =>
  new Date(value).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
export default function CalendarPage() {
  const agenda = useRef<HTMLDivElement>(null);
  const q = useData("/dashboard");
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState("All"),
    [search, setSearch] = useState(""),
    [view, setView] = useState("Month");
  if (q.isPending) return <Loading layout="calendar" />;
  if (q.error) return <ErrorState error={q.error} retry={q.refetch} />;
  const d = q.data.data,
    selected = /^\d{4}-\d{2}-\d{2}$/.test(params.get("date") || "")
      ? params.get("date")!
      : d.today;
  const focus = new Date(selected + "T12:00:00"),
    year = focus.getFullYear(),
    month = focus.getMonth();
  const monthStart = new Date(year, month, 1),
    first = monthStart.getDay(),
    last = new Date(year, month + 1, 0).getDate();
  const items = [
    ...(d.events || []).map((r: any) => ({
      id: r.id,
      kind: "Renewals",
      day: r.dueDate.slice(0, 10),
      name: r.client.name,
      details: `${r.type} · ${r.product?.definition?.name || "Policy"}`,
      status: r.status,
      amount: r.amountMinor,
      href: "/renewals/" + r.id,
      clientId: r.client.id,
      clock: "All day",
      completed: r.status === "Confirmed",
      cancelled: r.status === "Cancelled",
    })),
    ...(d.followups || []).map((r: any) => ({
      id: r.id,
      kind: "Follow-ups",
      day: localDay(r.dueAt),
      name: r.client.name,
      details: `${r.channel} · ${r.product?.definition?.name || r.notes || "Client follow-up"}`,
      status: r.state,
      href: "/followups/" + r.id,
      clientId: r.client.id,
      clock: time(r.dueAt),
      sort: r.dueAt,
      completed: r.state === "completed",
      cancelled: r.state === "cancelled",
    })),
    ...(d.birthdayCalendar || [])
      .filter((r: any) => r.id)
      .map((r: any) => ({
        id: "birthday-" + r.id,
        kind: "Birthdays",
        day: `${year}-${r.monthDay}`,
        name: r.name,
        details: "Client birthday",
        status: "Birthday",
        href: "/clients/" + r.id,
        clientId: r.id,
        clock: "All day",
        completed: false,
        cancelled: false,
      })),
  ].filter(
    (r: any) =>
      (filter === "All" || r.kind === filter) &&
      `${r.name} ${r.details}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  const selectedItems = items
    .filter((r) => r.day === selected)
    .sort((a: any, b: any) => (a.sort || "").localeCompare(b.sort || ""));
  const monthItems = items.filter((r) =>
    r.day.startsWith(selected.slice(0, 7)),
  );
  const choose = (value: string) => setParams({ date: value });
  const move = (n: number) => choose(iso(new Date(year, month + n, 1)));
  return (
    <div className="dedicated-calendar apple-calendar">
      <PageHeading
        title="Calendar"
        subtitle="Plan client conversations, track renewals, and remember birthdays."
        actions={
          <Link className="button primary" to="/followups/new">
            <Plus size={16} />
            Schedule follow-up
          </Link>
        }
      />
      <Panel className="calendar-workspace">
        <div className="calendar-page-toolbar">
          <div className="calendar-month-controls">
            <button aria-label="Previous month" onClick={() => move(-1)}>
              <ChevronLeft size={18} />
            </button>
            <h2>
              {focus.toLocaleDateString("en-IN", {
                month: "long",
                year: "numeric",
              })}
            </h2>
            <button aria-label="Next month" onClick={() => move(1)}>
              <ChevronRight size={18} />
            </button>
            <button onClick={() => choose(d.today)}>Today</button>
          </div>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search clients, products or activities..."
          />
        </div>
        <div
          className="calendar-view-switch"
          role="tablist"
          aria-label="Calendar view"
        >
          {["Month", "Day", "List"].map((value) => (
            <button
              key={value}
              role="tab"
              aria-selected={view === value}
              onClick={() => setView(value)}
            >
              {value}
            </button>
          ))}
        </div>
        <div className="apple-calendar-body">
          <aside className="apple-calendar-sidebar">
            <h3>Calendars</h3>
            <Tabs
              items={["All", "Renewals", "Follow-ups", "Birthdays"]}
              value={filter}
              onChange={setFilter}
            />
            <div className="calendar-month-summary">
              {monthItems.length} activities this month ·{" "}
              {
                monthItems.filter(
                  (r) => !r.completed && !r.cancelled && r.day < d.today,
                ).length
              }{" "}
              overdue
            </div>
            <div className="calendar-sidebar-tip">
              Select a date to see its activities below.
            </div>
          </aside>
          <div className="apple-calendar-content">
            {view === "Month" && (
              <>
                <div className="calendar-month-scroll">
                  <div className="calendar-month-grid">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                      (day) => (
                        <div className="calendar-weekday" key={day}>
                          {day}
                        </div>
                      ),
                    )}
                    {Array.from(
                      { length: Math.ceil((first + last) / 7) * 7 },
                      (_, i) => {
                        const n = i - first + 1;
                        if (n < 1 || n > last)
                          return (
                            <div
                              className="calendar-date-cell outside"
                              key={i}
                            />
                          );
                        const key = iso(new Date(year, month, n)),
                          events = items.filter((r) => r.day === key);
                        return (
                          <button
                            className={
                              "calendar-date-cell " +
                              (key === selected ? "selected " : "") +
                              (key === d.today ? "today" : "")
                            }
                            key={key}
                            onClick={() => {
                              choose(key);
                              requestAnimationFrame(() =>
                                agenda.current?.scrollIntoView({
                                  behavior: "smooth",
                                  block: "start",
                                }),
                              );
                            }}
                            aria-label={`${date(key)}, ${events.length} activities`}
                            aria-pressed={key === selected}
                          >
                            <span className="calendar-date-number">{n}</span>
                            {events.slice(0, 3).map((r) => (
                              <span
                                className={
                                  "calendar-event-chip " +
                                  (r.kind === "Birthdays"
                                    ? "birthday"
                                    : r.kind === "Renewals"
                                      ? "renewal"
                                      : "followup")
                                }
                                key={r.id}
                              >
                                {r.kind === "Renewals"
                                  ? "Renewal"
                                  : r.kind === "Birthdays"
                                    ? "Birthday"
                                    : r.clock}{" "}
                                · {r.name}
                              </span>
                            ))}
                            {events.length > 3 && (
                              <span className="calendar-more">
                                +{events.length - 3} more
                              </span>
                            )}
                          </button>
                        );
                      },
                    )}
                  </div>
                </div>
              </>
            )}
            {view === "Day" && (
              <div className="calendar-day-preview">
                <h2>{date(selected)}</h2>
                <p className="muted">
                  {selectedItems.length} activities scheduled
                </p>
                {selectedItems.length ? (
                  selectedItems.map((r) => (
                    <Link className="calendar-day-entry" key={r.id} to={r.href}>
                      <time>{r.clock}</time>
                      <div>
                        <strong>{r.name}</strong>
                        <small>{r.details}</small>
                      </div>
                      <Badge>{r.kind}</Badge>
                      <span>
                        {r.amount != null ? rupees(r.amount) : r.status}
                      </span>
                    </Link>
                  ))
                ) : (
                  <Empty text="No activities for this day." />
                )}
              </div>
            )}
            {view === "List" && (
              <div className="calendar-list-view">
                {monthItems.length ? (
                  [...monthItems]
                    .sort((a, b) => a.day.localeCompare(b.day))
                    .map((r) => (
                      <Link
                        className="calendar-list-entry"
                        to={r.href}
                        key={r.id}
                      >
                        <span>
                          {date(r.day)} · {r.clock}
                        </span>
                        <strong>{r.name}</strong>
                        <small>{r.details}</small>
                        <Badge>{r.kind}</Badge>
                      </Link>
                    ))
                ) : (
                  <Empty text="No activities this month." />
                )}
              </div>
            )}
          </div>
        </div>
      </Panel>
      <div ref={agenda} className="calendar-agenda-anchor">
        <Panel className="calendar-agenda">
          <div className="register-heading">
            <h2>{date(selected)}</h2>
            <span>{selectedItems.length} activities</span>
          </div>
          {selectedItems.length ? (
            selectedItems.map((r) => (
              <div className="calendar-agenda-row" key={r.id}>
                <span className="calendar-agenda-time">{r.clock}</span>
                <Avatar name={r.name} />
                <div className="calendar-agenda-person">
                  <Link to={"/clients/" + r.clientId}>
                    <strong>{r.name}</strong>
                  </Link>
                  <small>{r.details}</small>
                </div>
                <Badge>{r.kind}</Badge>
                <span>{r.amount != null ? rupees(r.amount) : r.status}</span>
                <Link className="button" to={r.href}>
                  View details
                </Link>
              </div>
            ))
          ) : (
            <Empty text="No activities for this date or these filters." />
          )}
        </Panel>
      </div>
    </div>
  );
}
