import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Sun,
  Sunset,
  Moon,
  Lightbulb,
  Cake,
  CalendarDays,
  Phone,
  Target,
  FileText,
  MessageCircle,
} from "lucide-react";
import { date, rupees, time, useData } from "./api";
import {
  ArrowRight,
  Badge,
  Calendar,
  ContactActions,
  Empty,
  ErrorState,
  Loading,
  Metrics,
  Panel,
  Tabs,
  useAuth,
} from "./components";
const QUOTES = [
  "“Strong relationships\nbuild secure tomorrows.”",
  "“An investment in knowledge\npays the best interest.”",
  "“Consistency and patience\ncompound into prosperity.”",
  "“Trust is the currency\nof enduring partnerships.”",
  "“Financial peace begins\nwith clear planning.”",
  "“Protecting families today\nfor a confident tomorrow.”",
  "“Disciplined wealth management\nturns dreams into reality.”",
];

function getGreeting() {
  const hour = new Date().getHours();
  if (hour >= 4 && hour < 12) {
    return { text: "Good Morning", Icon: Sun };
  }
  if (hour >= 12 && hour < 17) {
    return { text: "Good Afternoon", Icon: Sun };
  }
  if (hour >= 17 && hour < 22) {
    return { text: "Good Evening", Icon: Sunset };
  }
  return { text: "Good Evening", Icon: Moon };
}

export default function Dashboard() {
  const { data, isPending, error, refetch } = useData("/dashboard");
  const [tab, setTab] = useState("All"),
    [selected, setSelected] = useState("");
  const [quoteIndex, setQuoteIndex] = useState(
    () => new Date().getDate() % QUOTES.length,
  );
  const user = useAuth();
  if (isPending) return <Loading />;
  if (error) return <ErrorState error={error} retry={refetch} />;
  const d = data.data,
    day = selected || d.today;
  const events = d.events.filter((e: any) => e.status === "Pending"),
    tasks = d.followups.filter((f: any) => f.state === "pending");
  const attention = [
    ...events.slice(0, 2).map((e: any) => ({
      type: "Renewals",
      label:
        e.timing === "Due Today"
          ? "RENEWAL DUE TODAY"
          : `RENEWAL · ${date(e.dueDate)}`,
      title: e.client.name,
      subtitle:
        e.product.definition.provider.name + " – " + e.product.definition.name,
      extra: "Policy No: " + e.product.identifier,
      amount: rupees(e.amountMinor),
      status: e.timing,
      client: e.client,
      icon: CalendarDays,
      to: "/renewals/" + e.id,
      tone: "rose",
    })),
    ...tasks.slice(0, 1).map((f: any) => ({
      type: "Follow-ups",
      label: "FOLLOW-UP " + f.timing.toUpperCase(),
      title: f.client.name,
      subtitle: f.product?.definition.category || "Financial planning",
      extra: f.notes,
      status: f.timing,
      client: f.client,
      icon: Phone,
      to: "/followups/" + f.id,
      tone: "lavender",
    })),
    ...d.birthdays.slice(0, 1).map((c: any) => ({
      type: "Birthdays",
      label: "BIRTHDAY TODAY",
      title: c.name,
      subtitle: "Valued Client",
      extra: "Send birthday wishes",
      client: c,
      icon: Cake,
      to: "/clients/" + c.id,
      tone: "mint",
    })),
    ...d.leads
      .filter((l: any) => !["Won", "Lost"].includes(l.stage))
      .slice(0, 2)
      .map((l: any) => ({
        type: "Leads",
        label: "LEAD · " + l.stage.toUpperCase(),
        title: l.client.name,
        subtitle: l.requirement,
        extra: l.nextAction,
        client: l.client,
        icon: Target,
        to: "/leads/" + l.id,
        tone: "lavender",
      })),
  ].filter((a) => (tab === "All" ? a.type !== "Leads" : a.type === tab));
  const { text: greetingText, Icon: GreetingIcon } = getGreeting();
  const dueTodayCount =
    (d.followupsToday || 0) +
    events.filter((e: any) => e.timing === "Due Today").length +
    (d.birthdays?.length || 0);

  return (
    <div className="dashboard-layout">
      <div className="dashboard-main">
        <section className="greeting">
          <GreetingIcon size={56} />
          <div>
            <h1>
              {greetingText}, {user?.name ? user.name.split(" ")[0] : "Advisor"}
              !
            </h1>
            <p>
              {dueTodayCount > 0
                ? `Here’s what needs your attention today (${dueTodayCount} priority item${dueTodayCount === 1 ? "" : "s"}).`
                : "Here’s what needs your attention today."}
            </p>
          </div>
          <blockquote
            onClick={() => setQuoteIndex((i) => (i + 1) % QUOTES.length)}
            title="Click to cycle quote"
            style={{ cursor: "pointer", userSelect: "none" }}
          >
            {QUOTES[quoteIndex].split("\n").map((line, idx) => (
              <span key={idx}>
                {line}
                {idx === 0 && <br />}
              </span>
            ))}
          </blockquote>
          <img src="/assets/logo.png" alt="" />
        </section>
        <Metrics
          items={[
            {
              label: "Total Clients",
              value: d.totalClients,
              icon: "clients",
              note: "Workspace total",
              to: "/clients",
            },
            {
              label: "Renewals Due",
              value: d.renewalsDue,
              icon: "renewals",
              note: "Next 30 days",
              to: "/renewals?range=Next+30+Days",
            },
            {
              label: "Active Leads",
              value: d.activeLeads,
              icon: "leads",
              note: d.hotLeads + " hot leads",
              to: "/leads",
            },
            {
              label: "Follow-ups",
              value: d.followupsToday,
              icon: "followups",
              note: "Due today",
              to: "/followups?range=Today",
            },
            {
              label: "Upcoming Revenue",
              value: rupees(d.expectedRevenueMinor),
              icon: "revenue",
              note: "Commission · 30 days",
              tooltip:
                "Expected commission on distinct products with events due in the next 30 days; not premiums or principal.",
              to: "/reports",
            },
          ]}
        />
        <div className="dashboard-center">
          <Panel
            title="Today’s Attention"
            action={
              <Link className="text-link" to="/followups">
                View All <ArrowRight size={14} />
              </Link>
            }
            className="attention-panel"
          >
            <Tabs
              items={["All", "Renewals", "Follow-ups", "Leads", "Birthdays"]}
              value={tab}
              onChange={setTab}
            />
            {attention.length ? (
              attention.map((a: any, i: number) => (
                <div className="attention-row" key={i}>
                  <span className={`circle-icon ${a.tone}`}>
                    <a.icon size={29} />
                  </span>
                  <Link to={a.to} className="attention-person">
                    <small className={a.tone}>{a.label}</small>
                    <strong>{a.title}</strong>
                    <span>{a.subtitle}</span>
                    <span>{a.extra}</span>
                  </Link>
                  <div className="attention-amount">
                    {a.amount && <strong>{a.amount}</strong>}
                    {a.status && <Badge>{a.status}</Badge>}
                  </div>
                  <ContactActions client={a.client} detail={a.to} />
                </div>
              ))
            ) : (
              <Empty text="Nothing needs attention in this category." />
            )}
          </Panel>

          <div className="dashboard-activity-col">
            <Panel
              title="Recent Activity"
              action={
                <Link className="text-link" to="/reports">
                  View All <ArrowRight size={14} />
                </Link>
              }
            >
              {d.activity.slice(0, 5).map((a: any, i: number) => (
                <div className="activity-row" key={a.id}>
                  <span
                    className={`product-icon ${["mint", "blue", "lavender"][i % 3]}`}
                  >
                    <FileText size={18} />
                  </span>
                  <div>
                    <strong>{a.summary}</strong>
                    <small>{date(a.createdAt)}</small>
                  </div>
                  <time>{time(a.createdAt)}</time>
                </div>
              ))}
            </Panel>
          </div>

          <div className="dashboard-right-inline">
            <Panel className="dashboard-calendar">
              <Calendar selected={day} onSelect={setSelected} />
              <div className="day-summary">
                <h3>
                  {day === d.today ? "Today, " : ""}
                  {date(day)}
                </h3>
                <Link to={"/renewals?from=" + day + "&to=" + day}>
                  <span className="product-icon rose">
                    <CalendarDays size={17} />
                  </span>
                  <b>
                    {
                      events.filter((e: any) => e.dueDate.slice(0, 10) === day)
                        .length
                    }
                  </b>{" "}
                  Renewals due
                </Link>
                <Link to="/followups">
                  <span className="product-icon blue">
                    <FileText size={17} />
                  </span>
                  <b>
                    {
                      tasks.filter(
                        (f: any) =>
                          new Date(f.dueAt).toLocaleDateString("en-CA", {
                            timeZone: "Asia/Kolkata",
                          }) === day,
                      ).length
                    }
                  </b>{" "}
                  Follow-ups
                </Link>
                <Link to="/clients">
                  <span className="product-icon mint">
                    <Cake size={17} />
                  </span>
                  <b>
                    {d.birthdayCalendar?.filter(
                      (b: any) => b.monthDay === day.slice(5),
                    ).length || 0}
                  </b>{" "}
                  Birthdays
                </Link>
                <Link className="text-link align-end" to="/followups">
                  View All <ArrowRight size={14} />
                </Link>
              </div>
            </Panel>
          </div>
        </div>
        <div className="relationship-banner">
          <Lightbulb size={40} />
          <div>
            <strong>Relationship Reminder</strong>
            <p>
              You haven’t contacted {d.staleClients} clients in the last 90
              days. Keep the relationship warm!
            </p>
          </div>
          <Link className="button" to="/clients">
            View Clients <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </div>
  );
}
