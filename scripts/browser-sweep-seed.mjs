// Seeds a throwaway workspace with a realistic spread of synthetic records through the API, so the
// sweep has something to filter, page, correct and delete. Names carry "Sweep" and use @example.test.
const istDay = (offset = 0) =>
  new Date(Date.now() + 19800000 + offset * 86400000)
    .toISOString()
    .slice(0, 10);
const cities = ["Chennai", "Madurai", "Coimbatore", "Salem"];

export async function seed(call, ownerId) {
  const out = {
    clients: [],
    businesses: [],
    leads: [],
    products: [],
    events: [],
    followups: [],
  };
  const must = async (label, p) => {
    const r = await p;
    if (r.status >= 300)
      throw new Error(`${label}: ${r.status} ${JSON.stringify(r.body)}`);
    return r.body.data;
  };
  const insurer = await must(
    "provider",
    call("POST", "/providers", { name: "Sweep Insurer" }),
  );
  const bank = await must(
    "provider",
    call("POST", "/providers", { name: "Sweep Bank" }),
  );
  const plans = {
    life: await must(
      "plan",
      call("POST", "/catalogue", {
        name: "Sweep Life Plan",
        providerId: insurer.id,
        category: "Life Insurance",
      }),
    ),
    health: await must(
      "plan",
      call("POST", "/catalogue", {
        name: "Sweep Health Plan",
        providerId: insurer.id,
        category: "Health Insurance",
      }),
    ),
    loan: await must(
      "plan",
      call("POST", "/catalogue", {
        name: "Sweep Home Loan",
        providerId: bank.id,
        category: "Home Loan",
      }),
    ),
  };
  out.plans = plans;
  out.providers = [insurer, bank];
  const today = istDay(0);
  for (let i = 1; i <= 60; i++) {
    const n = String(i).padStart(2, "0");
    out.clients.push(
      await must(
        "client " + n,
        call("POST", "/clients", {
          name: `Sweep Client ${n}`,
          phone: `91000000${n}`,
          email: `sweep.${n}@example.test`,
          kind: "Individual",
          city: cities[i % 4],
          state: "Tamil Nadu",
          // The first few have a birthday today so the calendar and dashboard have some.
          dob:
            i <= 3
              ? `1985-${today.slice(5)}`
              : `19${70 + (i % 30)}-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 27) + 1).padStart(2, "0")}`,
          gender: i % 2 ? "Male" : "Female",
          occupation: "Engineer",
          annualIncome: "₹25–50 Lakhs",
          riskProfile: ["Conservative", "Moderate", "Growth"][i % 3],
          source: ["Direct", "Referral", "Website"][i % 3],
        }),
      ),
    );
  }
  for (let i = 1; i <= 4; i++) {
    out.businesses.push(
      await must(
        "business " + i,
        call("POST", "/clients", {
          name: `Sweep Business ${i}`,
          phone: `92000000${String(i).padStart(2, "0")}`,
          email: `sweep.biz.${i}@example.test`,
          kind: "Business",
          city: cities[i % 4],
          registrationNumber: "SW-" + i,
          industry: "Services",
        }),
      ),
    );
  }
  // Leads across the stages.
  const stages = [
    "New Enquiries",
    "Contacted",
    "Proposal / Discussion",
    "Lost",
  ];
  for (let i = 0; i < 40; i++) {
    const client = out.clients[i];
    const lead = await must(
      "lead " + i,
      call("POST", "/leads", {
        clientId: client.id,
        ownerId,
        requirement: ["Life Insurance", "Health Insurance", "Home Loan"][i % 3],
        nextAction: "Sweep follow-up " + i,
        priority: ["Normal", "High", "Urgent"][i % 3],
      }),
    );
    const stage = stages[i % 4];
    if (stage !== "New Enquiries")
      await must(
        "stage",
        call("POST", `/leads/${lead.id}/stage`, {
          stage,
          version: lead.version,
          reason: stage === "Lost" ? "Sweep: not interested" : undefined,
        }),
      );
    out.leads.push({ ...lead, stage });
  }
  // Products with events due at different distances, one already overdue.
  const offsets = [-5, 0, 3, 15, 40];
  for (let i = 0; i < 12; i++) {
    const client = out.clients[i];
    const plan = [plans.life, plans.health, plans.loan][i % 3];
    const product = await must(
      "product",
      call("POST", "/products", {
        clientId: client.id,
        definitionId: plan.id,
        identifier: `SWEEP-${String(i).padStart(3, "0")}`,
        status: "Active",
        startDate: istDay(-200),
        premiumMinor: "2400000",
      }),
    );
    out.products.push(product);
    const event = await must(
      "event",
      call("POST", "/renewals", {
        productId: product.id,
        type: plan === plans.loan ? "Loan instalment" : "Insurance renewal",
        dueDate: istDay(offsets[i % offsets.length]),
        amountMinor: String(1000000 + i * 50000),
        recurrenceMonths: 12,
      }),
    );
    out.events.push(event);
  }
  // Follow-ups: overdue, today (later), upcoming and one completed.
  const at = (offset, hhmm) =>
    new Date(`${istDay(offset)}T${hhmm}:00+05:30`).toISOString();
  const plan = [
    [-2, "10:00"],
    [0, "22:30"],
    [0, "23:00"],
    [2, "11:00"],
    [6, "16:00"],
  ];
  for (const [i, [offset, hhmm]] of plan.entries()) {
    out.followups.push(
      await must(
        "followup",
        call("POST", "/followups", {
          clientId: out.clients[i].id,
          ownerId,
          channel: ["Call", "WhatsApp", "Email", "Meeting", "Call"][i],
          dueAt: at(offset, hhmm),
          notes: "Sweep follow-up note " + i,
        }),
      ),
    );
  }
  const done = await must(
    "followup",
    call("POST", "/followups", {
      clientId: out.clients[5].id,
      ownerId,
      channel: "Call",
      dueAt: at(1, "09:00"),
      notes: "Sweep completed task",
    }),
  );
  out.followups.push(done);
  // Notes, consent, a relationship and a logged conversation.
  await must(
    "note",
    call("POST", `/clients/${out.clients[0].id}/notes`, {
      body: "Sweep seeded note",
    }),
  );
  await must(
    "consent",
    call("POST", `/clients/${out.clients[0].id}/consents`, {
      channel: "WhatsApp",
      granted: true,
      source: "Sweep seeded consent",
    }),
  );
  await must(
    "relationship",
    call("POST", `/clients/${out.clients[1].id}/relationships`, {
      clientId: out.clients[2].id,
      type: "Spouse",
    }),
  );
  await must(
    "communication",
    call("POST", "/communications", {
      clientId: out.clients[0].id,
      channel: "Call",
      event: "Manual outcome",
      body: "Sweep seeded call outcome",
    }),
  );
  return out;
}
