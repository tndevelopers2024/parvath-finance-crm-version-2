export const user = {
  id: "ui-user",
  name: "Parvath Adviser",
  email: "adviser@example.test",
  role: "Administrator",
  organizationId: "ui-org",
  timezone: "Asia/Kolkata",
  csrf: "ui-csrf",
};
const names = [
  "Ananya Raman",
  "Rajesh Kumar",
  "Meera Srinivasan",
  "Arun Prakash",
  "Priya Nair",
  "Suresh Reddy",
];
export const definition = {
  id: "definition-ui",
  name: "Life Protection Plan",
  category: "Life Insurance",
  providerId: "provider-ui",
  provider: { id: "provider-ui", name: "LIC" },
  eventType: "Insurance renewal",
};
export const clients = names.map((name, i) => ({
  id: "client-" + i,
  name,
  email: "client" + i + "@example.test",
  phone: "+91988000000" + i,
  kind: "Individual",
  status: i === 2 ? "Needs Attention" : "Active",
  city: "Chennai",
  state: "Tamil Nadu",
  dob: "1988-10-09",
  createdAt: "2026-09-01T06:00:00Z",
  lastContactAt: "2026-10-01T06:00:00Z",
  products: [],
  events: [],
  documents: [],
  followups: [],
  relationships: [],
  notes: [],
  communications: [],
  activity: [],
  health: { score: 86, signals: { recentContact: true } },
  consent: { call: true, email: true, whatsapp: true },
  onboardingProfile: {},
}));
export const products = clients.slice(0, 4).map((c, i) => ({
  id: "product-" + i,
  client: c,
  clientId: c.id,
  definition,
  status: "Active",
  startDate: "2026-01-01T00:00:00.000Z",
  identifier: "LIC-2026-10" + i,
  premiumMinor: "4500000",
  expectedCommissionMinor: "400000",
  events: [],
  documents: [],
}));
export const events = products.map((p, i) => ({
  id: "event-" + i,
  client: p.client,
  clientId: p.clientId,
  product: p,
  productId: p.id,
  dueDate: i < 2 ? "2026-10-09T00:00:00Z" : "2026-10-15T00:00:00Z",
  status: "Pending",
  timing: i < 2 ? "Due Today" : "Upcoming",
  amountMinor: "4500000",
  paidMinor: "0",
  outstandingMinor: "4500000",
  amountMeaning: "Premium due",
  type: "Insurance renewal",
  version: 1,
  actions: [],
  payments: [],
  history: [],
}));
export const followups = clients.slice(2, 5).map((c, i) => ({
  id: "followup-" + i,
  client: c,
  clientId: c.id,
  product: products[0],
  dueAt: "2026-10-09T08:00:00Z",
  state: "pending",
  timing: i ? "Today" : "Overdue",
  notes: "Review family protection and next steps",
  channel: "Call",
  priority: "Normal",
  version: 1,
  actions: [],
  payments: [],
  history: [],
  assignedTo: user,
}));
export const leads = clients.map((c, i) => ({
  id: "lead-" + i,
  client: c,
  clientId: c.id,
  requirement: i % 2 ? "Health Insurance" : "Life Insurance",
  stage: [
    "New Enquiries",
    "Contacted",
    "Qualified",
    "Proposal / Discussion",
    "Won",
    "Lost",
  ][i],
  priority: i === 1 ? "High" : "Normal",
  nextAction: "Discuss the coverage options",
  nextFollowUp: "2026-10-12T08:00:00Z",
  createdAt: "2026-10-05T06:00:00Z",
  source: "Referral",
  version: 1,
  activities: [],
  history: [],
}));
clients.forEach((c) => {
  c.products = products
    .filter((p) => p.clientId === c.id)
    .map((p) => ({
      ...p,
      client: undefined,
      events: events
        .filter((e) => e.productId === p.id)
        .map((e) => ({ ...e, client: undefined, product: undefined })),
    }));
  c.events = events
    .filter((e) => e.clientId === c.id)
    .map((e) => ({ ...e, client: undefined }));
  c.followups = followups
    .filter((f) => f.clientId === c.id)
    .map((f) => ({ ...f, client: undefined, product: undefined }));
});
// Avoid cycles while retaining the same response shape as the app endpoints.
const lightClient = (c) => ({ ...c, products: [], events: [], followups: [] });
products.forEach((p) => (p.client = lightClient(p.client)));
events.forEach((e) => {
  e.client = lightClient(e.client);
  e.product = { ...e.product, client: undefined };
});
followups.forEach((f) => {
  f.client = lightClient(f.client);
  f.product = { ...f.product, client: undefined };
});
leads.forEach((l) => (l.client = lightClient(l.client)));
export const dashboard = {
  today: "2026-10-09",
  totalClients: 1248,
  individuals: 1190,
  businesses: 58,
  renewalsDue: 24,
  activeLeads: 38,
  hotLeads: 7,
  followupsToday: 12,
  followupsOverdue: 3,
  followupsCompleted: 28,
  followupsWeek: 19,
  expectedRevenueMinor: "28450000",
  premiumDueMinor: "132000000",
  premiumOverdueMinor: "0",
  won: 14,
  lost: 6,
  events,
  followups,
  leads,
  birthdays: [lightClient(clients[5])],
  birthdayCalendar: [
    { id: clients[0].id, name: clients[0].name, monthDay: "10-09" },
  ],
  staleClients: 18,
  activity: [
    {
      id: "a1",
      summary: "Ananya Raman’s protection plan was updated",
      createdAt: "2026-10-09T07:20:00Z",
    },
    {
      id: "a2",
      summary: "Follow-up scheduled with Meera Srinivasan",
      createdAt: "2026-10-09T06:30:00Z",
    },
    {
      id: "a3",
      summary: "Rajesh Kumar moved to Qualified",
      createdAt: "2026-10-08T11:00:00Z",
    },
    {
      id: "a4",
      summary: "New client Priya Nair added to the workspace",
      createdAt: "2026-10-08T08:30:00Z",
    },
  ],
  bins: [
    { name: "This Week", count: 8 },
    { name: "Next Week", count: 5 },
    { name: "2 Weeks", count: 6 },
    { name: "3 Weeks", count: 3 },
    { name: "4 Weeks", count: 2 },
  ],
};
export function response(path) {
  if (path === "/auth/me") return { data: user };
  if (path === "/dashboard") return { data: dashboard };
  if (path === "/clients/summary")
    return {
      data: {
        total: 1248,
        individual: 1190,
        business: 58,
        products: 1682,
        attention: 18,
      },
    };
  if (path === "/clients") return { data: clients, meta: { total: clients.length } };
  if (path.startsWith("/clients/"))
    return {
      data:
        clients[Number(path.split("/").at(-1)?.split("-").at(-1))] ||
        clients[0],
    };
  if (path === "/products/summary")
    return {
      products: [
        {
          definitionId: definition.id,
          clients: 4,
          records: 4,
          active: 4,
          applications: 0,
          closed: 0,
        },
      ],
      data: [
        { category: definition.category, clients: 4, records: 4, active: 4 },
      ],
    };
  if (path === "/products") return { data: products, meta: { total: 4 } };
  if (path.startsWith("/products/"))
    return {
      data: {
        ...products[0],
        events,
        documents: [],
        activity: [],
        actions: [],
      },
    };
  if (path === "/renewals") return { data: events, meta: { total: 4 } };
  if (path.startsWith("/renewals/")) return { data: events[0] };
  if (path === "/followups") return { data: followups, meta: { total: 3 } };
  if (path.startsWith("/followups/")) return { data: followups[0] };
  if (path === "/leads") return { data: leads, meta: { total: 6 } };
  if (path.startsWith("/leads/")) return { data: leads[0] };
  if (path === "/providers") return { data: [definition.provider] };
  if (path === "/catalogue") return { data: [definition] };
  if (path === "/members") return { data: [{ user, role: "Administrator" }] };
  if (path === "/search")
    return {
      data: [
        {
          id: "client-0",
          title: clients[0].name,
          subtitle: "Client · Chennai",
          url: "/clients/client-0",
        },
      ],
    };
  if (path === "/notifications")
    return {
      data: [
        {
          id: "n1",
          title: "Renewals due today",
          body: "Review your upcoming client renewals.",
          createdAt: "2026-10-09T07:00:00Z",
          link: "/renewals",
          readAt: null,
        },
      ],
    };
  if (path === "/jobs" || path === "/communications") return { data: [] };
  throw Error("Unmocked endpoint " + path);
}
