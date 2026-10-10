import { db } from "./db.js";
import { config } from "./config.js";
import { assertDemoDatabase, clearWorkspaceData } from "./demoGuard.js";
import { dateOnly, now } from "./domain.js";
import { stages } from "../../../packages/contracts/src/index.js";
if (config.NODE_ENV === "production" || !config.DEMO_DATE)
  throw new Error("Demo seed requires a fixed DEMO_DATE outside production");
const m = await db.membership.findFirst({
  where: { role: "Administrator" },
  include: { user: true },
});
if (!m) throw new Error("Create an administrator first: npm run admin:create");
const org = m.organizationId,
  owner = m.userId;
const forceReset =
  process.argv.includes("--reset") || process.argv.includes("--force");
if (await db.client.count({ where: { organizationId: org } })) {
  if (forceReset) {
    console.log("Reset flag detected. Clearing previous records for fresh Tamil Nadu demo seed...");
    assertDemoDatabase("Resetting the demo seed");
    await clearWorkspaceData(org);
  } else {
    console.log("Workspace has records; seed skipped to protect existing data. Use --reset to re-seed.");
    await db.close();
    process.exit(0);
  }
}
const names = [
  "Rajesh Kumar",
  "Meenakshi Sundaram",
  "Arunachalam P",
  "Priya Natarajan",
  "Suresh Babu",
  "Kavitha Ramanathan",
  "Vikram Saravanan",
  "Anandhi Thangavel",
  "Mohamed Riyaz",
  "Divya Shankar",
  "Arun Prakash",
  "Latha Rajagopal",
  "Karthikeyan S",
  "Nivetha Murugesan",
  "Ramesh Kannan",
  "Balamurugan T",
  "Selvakumar M",
  "Manoj Sundar",
  "Senthil Kumar",
  "Harini Srinivasan",
  "Vigneshwaran S",
  "Sathish Kumar R",
  "Gokulnath V",
  "Gayathri Muthuraman",
  "Kishore Manickam",
  "Deepak Subramaniam",
  "Kavitha Rajesh",
  "Cauvery Textile Mills",
  "Kongu Precision Engineering",
  "Chola Agro Foods & Exports",
];
const clientCities = [
  "Chennai",
  "Coimbatore",
  "Madurai",
  "Tiruchirappalli",
  "Salem",
  "Tirunelveli",
  "Erode",
  "Kanchipuram",
  "Vellore",
  "Thanjavur",
  "Chennai",
  "Karur",
  "Tiruppur",
  "Chennai",
  "Madurai",
  "Tiruchirappalli",
  "Salem",
  "Nagercoil",
  "Chennai",
  "Chennai",
  "Coimbatore",
  "Tirunelveli",
  "Chennai",
  "Karaikudi",
  "Dindigul",
  "Chennai",
  "Chennai",
  "Tiruppur",
  "Coimbatore",
  "Thanjavur",
];
const addresses = [
  "No. 42, 2nd Avenue, Anna Nagar, Chennai, Tamil Nadu – 600040",
  "No. 18, West Club Road, RS Puram, Coimbatore, Tamil Nadu – 641002",
  "Plot 105, 80 Feet Road, KK Nagar, Madurai, Tamil Nadu – 625020",
  "No. 12, 11th Cross, Thillai Nagar, Tiruchirappalli, Tamil Nadu – 620018",
  "No. 88, Brindavan Road, Fairlands, Salem, Tamil Nadu – 636016",
  "No. 24, Trivandrum Road, Palayamkottai, Tirunelveli, Tamil Nadu – 627002",
  "No. 55, Perundurai Road, Erode, Tamil Nadu – 638011",
  "No. 16, Gandhi Road, Near Kamakshi Temple, Kanchipuram, Tamil Nadu – 631501",
  "No. 7, Katpadi Main Road, Vellore, Tamil Nadu – 632014",
  "No. 31, South Rampart, Near Big Temple, Thanjavur, Tamil Nadu – 613001",
  "No. 14, South Mada Street, Mylapore, Chennai, Tamil Nadu – 600004",
  "No. 29, Sengunthapuram 3rd Cross, Karur, Tamil Nadu – 639002",
  "No. 65, Kumaran Road, Tiruppur, Tamil Nadu – 641601",
  "No. 8, Usman Road, T. Nagar, Chennai, Tamil Nadu – 600017",
  "No. 112, Simmakkal Main Road, Madurai, Tamil Nadu – 625001",
  "No. 4, Officers Colony, Cantonment, Tiruchirappalli, Tamil Nadu – 620001",
  "No. 19, Hasthampatti Main Road, Salem, Tamil Nadu – 636007",
  "No. 5, Court Road, Nagercoil, Tamil Nadu – 629001",
  "No. 72, 100 Feet Bypass Road, Velachery, Chennai, Tamil Nadu – 600042",
  "No. 21, Kasturi Rangan Road, Alwarpet, Chennai, Tamil Nadu – 600018",
  "No. 450, Avinashi Road, Peelamedu, Coimbatore, Tamil Nadu – 641004",
  "No. 83, South Bypass Road, Vannarpettai, Tirunelveli, Tamil Nadu – 627003",
  "No. 15, GST Road, West Tambaram, Chennai, Tamil Nadu – 600045",
  "No. 9, Subbarayalu Street, Kalanivasal, Karaikudi, Tamil Nadu – 630002",
  "No. 62, Palani Road, Collectorate Post, Dindigul, Tamil Nadu – 624004",
  "No. 101, Rajiv Gandhi Salai, OMR, Sholinganallur, Chennai, Tamil Nadu – 600119",
  "No. 42, 2nd Avenue, Anna Nagar, Chennai, Tamil Nadu – 600040",
  "SF No. 240/1, Textile Park Road, Tiruppur, Tamil Nadu – 641652",
  "Plot 18, SIDCO Industrial Estate, Kurichi, Coimbatore, Tamil Nadu – 641021",
  "NH 67, Cauvery Delta Agro Zone, Thanjavur, Tamil Nadu – 613005",
];
const occupations = [
  "IT Solutions Architect (OMR Chennai)",
  "Consultant Cardiologist (Coimbatore)",
  "Civil Infrastructure Contractor (Madurai)",
  "Engineering College Professor (Trichy)",
  "Textile Merchant (Salem)",
  "Educational Institution Secretary (Tirunelveli)",
  "Auto Components Manufacturer (Erode)",
  "Silk Weaver & Boutique Owner (Kanchipuram)",
  "Leather Exporter (Vellore)",
  "Senior Chartered Accountant (Chennai)",
  "Rice Mill & Agro Enterprise Owner (Thanjavur)",
  "Home Textiles Exporter (Karur)",
  "Knitwear Garments Exporter (Tiruppur)",
  "Retail Jeweller (T. Nagar Chennai)",
  "Wholesale Spice & Grain Merchant (Madurai)",
  "Senior Heavy Equipment Specialist (Trichy)",
  "Steel & Structural Trader (Salem)",
  "Rubber & Spice Planter (Nagercoil)",
  "Fintech Software Lead (Velachery Chennai)",
  "Classical Arts Academy Director (Chennai)",
  "Precision Engineering Founder (Coimbatore)",
  "Renewable & Wind Energy Consultant (Tirunelveli)",
  "Aerospace Component Engineer (Tambaram)",
  "Chettinad Heritage Hospitality (Karaikudi)",
  "Foundry & Casting Operator (Dindigul)",
  "AI & Machine Learning Scientist (OMR Chennai)",
  "Architectural & Interior Designer (Chennai)",
];
const industries = [
  "Textiles & Knitwear Apparel",
  "Automotive Precision Engineering",
  "Agro Food Processing & Exports",
];
const clientNotes = [
  "Prefers evening calls after 6 PM. Family portfolio review planned for Diwali season.",
  "Consultant cardiologist at RS Puram. Prefers meeting during morning clinic break.",
  "Madurai municipal contractor. Exploring commercial equipment financing options.",
  "Birthday today (04 Sep). Follow up on children education annuity plan.",
  "Salem textile merchant. Follow up on keyman insurance renewal before grace period.",
  "Managing trustee of Tirunelveli educational society. Interested in institutional gratuity funds.",
  "Supplies components to Coimbatore auto cluster. Review comprehensive plant fire insurance.",
  "Traditional Kanchipuram silk enterprise. Reviewing artisan working capital scheme.",
  "Vellore leather export cluster. Inquiring about foreign exchange risk cover.",
  "Mylapore residence. Looking for retirement corpus planning and mutual fund SIP top-up.",
  "Thanjavur delta rice processor. Follow up on warehouse stock insurance and cash credit.",
  "Karur home textiles exporter. Reviewing marine transit cover for US export shipment.",
  "Tiruppur knitwear export unit director. Discussion on term insurance cover upgrade.",
  "Practicing CA in T. Nagar. Interested in high-yield corporate bonds.",
  "Wholesale spice trader at Simmakkal. Seeking business expansion line of credit.",
  "BHEL senior engineer. Follow up on superannuation pension top-up options.",
  "Hasthampatti steel yard owner. Discussing fleet vehicle commercial insurance package.",
  "Rubber plantation owner in Kanyakumari district. Evaluating agricultural land loan terms.",
  "Senior engineering manager at TIDEL Park. Reviewing family health floater coverage.",
  "Adyar arts school founder. Seeking advice on trust corpus investment options.",
  "Coimbatore foundry owner. Commercial loan inquiry for German CNC machine purchase.",
  "Windmill operator across Muppandal corridor. Power purchase agreement insurance review.",
  "Tambaram avionics engineer. Planning child higher education endowment policy.",
  "Heritage homestay owner in Chettinad. Property all-risk policy under review.",
  "Lock & hardware manufacturer at Dindigul. Working capital renewal scheduled.",
  "AI lab researcher on OMR. High net-worth tax-saving investment advisory requested.",
  "Spouse of Rajesh Kumar. Managing family interior studio portfolio in Anna Nagar.",
  "Tiruppur export house with 450 sewing stations. Annual fire & marine cargo cover due.",
  "Coimbatore CNC precision supplier to Chennai EV plant. Working capital limit enhancement under review.",
  "Thanjavur modern rice mill & organic export unit. Monsoon harvest inventory insurance active.",
];
const specs = [
  ["Life Insurance", "LIC", "Jeevan Anand"],
  ["Health Insurance", "Star Health", "Family Health Optima"],
  ["Vehicle Insurance", "United India Insurance", "Motor Secure"],
  ["Home Loan", "Indian Bank", "IB Home Loan"],
  ["Investment", "Sundaram Mutual Fund", "Mid Cap Growth Fund"],
  ["Term Insurance", "Max Life", "Smart Total Secure"],
  ["Business Loan", "Canara Bank", "MSME Growth Loan"],
];
await db.transaction(async (tx) => {
  const definitions = [];
  for (const [category, provider, name] of specs) {
    const p = await tx.provider.create({
      data: { organizationId: org, name: provider },
    });
    definitions.push(
      await tx.productDefinition.create({
        data: { organizationId: org, providerId: p.id, name, category },
      }),
    );
  }
  const clients: any[] = [];
  for (const [i, name] of names.entries()) {
    const kind = i >= 27 ? "Business" : "Individual";
    clients.push(
      await tx.client.create({
        data: {
          organization: { connect: { id: org } },
          ownerId: owner,
          isClient: i < 10 || i >= 27,
          status: [2, 8].includes(i)
            ? "Lead"
            : i === 4
              ? "Needs Attention"
              : "Active",
          source: "Referral",
          annualIncome: i < 10 ? "₹25 – 50 Lakhs" : undefined,
          riskProfile: "Moderate",
          investmentInterest: "Mutual Funds, Bonds, Debentures",
          loanInterest: "Home Loan, Personal Loan",
          preferredContact: "WhatsApp",
          notesText: clientNotes[i],
          createdAt: new Date("2025-09-01T00:00:00Z"),
          contact: {
            create: {
              organizationId: org,
              name,
              phone: `+91900000${String(i + 1).padStart(4, "0")}`,
              email: `${name.toLowerCase().replaceAll(" ", ".")}@example.test`,
              kind,
              city: clientCities[i],
              state: "Tamil Nadu",
              address: addresses[i],
              occupation:
                kind === "Individual"
                  ? occupations[i] || "Professional"
                  : undefined,
              dob:
                kind === "Individual"
                  ? dateOnly(i === 3 ? "1990-09-04" : "1985-03-14")
                  : null,
              ...(kind === "Business"
                ? { business: { create: { industry: industries[i - 27] || "Services" } } }
                : {}),
            },
          },
        },
      }),
    );
  }
  await tx.contactRelationship.create({
    data: {
      fromId: clients[0].contactId,
      toId: clients[26].contactId,
      type: "Spouse",
    },
  });
  for (const name of [
    "HNI",
    "Family",
    "Insurance",
    "Investment",
    "Home Loan",
  ]) {
    const t = await tx.tag.upsert({
      where: { name },
      create: { name },
      update: {},
    });
    await tx.clientTag.create({
      data: { clientId: clients[0].id, tagId: t.id },
    });
  }
  const products = [];
  for (let i = 0; i < 14; i++) {
    const ci = i < 10 ? i : i === 13 ? 6 : 0,
      di = i < 10 ? i % 7 : i - 9;
    const d = definitions[di];
    const loan = d.category.includes("Loan"),
      investment = d.category === "Investment";
    const amount = [
      2450000, 1820000, 850000, 3500000, 4000000, 1200000, 5000000,
    ][di];
    const p = await tx.clientProduct.create({
      data: {
        organizationId: org,
        clientId: clients[ci].id,
        definitionId: d.id,
        identifier: `PV-${["LI", "HI", "VI", "HL", "BI", "TI", "BL"][di]}-${String(i + 1).padStart(6, "0")}`,
        status: "Active",
        premiumMinor: loan || investment ? null : BigInt(amount),
        principalMinor: loan ? 425000000n : investment ? 50000000n : null,
        expectedCommissionMinor:
          loan || investment ? 0n : BigInt(Math.round(amount * 0.05)),
        startDate: dateOnly("2025-09-04"),
        ...(loan
          ? { loanDetails: { interestBasisPoints: 850, termMonths: 240 } }
          : investment
            ? {
                investmentDetails: {
                  units: "100",
                  maturityDate: "2028-09-04",
                },
              }
            : {
                insuranceDetails: {
                  sumAssuredMinor: "100000000",
                  termYears: 20,
                },
              }),
      },
    });
    products.push(p);
    const date = [
      "2026-09-04",
      "2026-09-07",
      "2026-09-12",
      "2026-09-15",
      "2026-09-25",
      "2026-10-01",
      "2026-10-05",
      "2026-10-10",
      "2026-09-18",
      "2026-09-27",
      "2027-01-14",
      "2026-10-02",
      "2026-09-20",
      "2026-08-30",
    ][i];
    await tx.financialEvent.create({
      data: {
        organizationId: org,
        clientId: clients[ci].id,
        productId: p.id,
        type: loan
          ? "Loan instalment"
          : investment
            ? "Bond interest"
            : "Insurance renewal",
        dueDate: dateOnly(date),
        amountMinor: investment ? 1000000n : BigInt(amount),
        amountMeaning: loan
          ? "Instalment due"
          : investment
            ? "Interest receivable"
            : "Premium due",
        recurrenceMonths: loan ? 1 : 12,
      },
    });
  }
  for (let i = 0; i < 24; i++) {
    const ci = i < 10 ? i : i % names.length;
    const due = new Date(
      `2026-09-${String(i < 3 ? 3 : i < 6 ? 4 : i < 10 ? 5 : i < 16 ? 6 : 10).padStart(2, "0")}T${i % 2 ? "10:00" : "04:30"}:00Z`,
    );
    await tx.followUp.create({
      data: {
        organizationId: org,
        clientId: clients[ci].id,
        productId: products.find((p) => p.clientId === clients[ci].id)?.id,
        ownerId: owner,
        channel: ["Call", "WhatsApp", "Meeting", "Email"][i % 4],
        dueAt: due,
        notes: [
          "Discuss renewal. Share new plan options.",
          "Send document checklist.",
          "Discuss loan eligibility and documents.",
          "Follow up on quotation.",
          "Share updated report.",
          "Send renewal reminder.",
        ][i % 6],
        state: i >= 20 ? "completed" : "pending",
        outcome: i >= 20 ? "Connected" : null,
        completedAt: i >= 20 ? now() : null,
      },
    });
  }
  let idx = 0;
  for (const [si, count] of [5, 5, 4, 3, 4, 2].entries()) {
    for (let n = 0; n < count; n++) {
      const ci = (10 + idx) % 26,
        di = idx % 7;
      const o = await tx.opportunity.create({
        data: {
          organizationId: org,
          clientId: clients[ci].id,
          ownerId: owner,
          requirement: definitions[di].category,
          stage: stages[si],
          createdAt: new Date("2026-09-01T05:30:00Z"),
          priority: idx % 4 === 0 ? "High" : "Normal",
          source: ["Website", "Referral", "Call", "WhatsApp", "Meeting"][
            idx % 5
          ],
          nextAction: "Discuss requirements and share suitable options",
          nextFollowUp: new Date("2026-09-08T05:30:00Z"),
          lostReason: si === 5 ? "Went with another provider" : null,
          history: {
            create: {
              toStage: stages[si],
              actorId: owner,
              reason: "Synthetic demo scenario",
              createdAt: new Date("2026-09-01T05:30:00Z"),
            },
          },
        },
      });
      if (si === 4)
        await tx.clientProduct.create({
          data: {
            organizationId: org,
            clientId: clients[ci].id,
            definitionId: definitions[di].id,
            opportunityId: o.id,
            identifier: `APP-${idx}`,
            startDate: dateOnly("2026-09-01"),
          },
        });
      idx++;
    }
  }
  for (let i = 0; i < 7; i++) {
    await tx.communication.create({
      data: {
        clientId: clients[i].id,
        channel: ["Call", "WhatsApp", "Email"][i % 3],
        event: "Manual outcome",
        body: "Connected; discussed financial requirements.",
        actorId: owner,
        createdAt: new Date(`2026-09-0${(i % 3) + 1}T05:30:00Z`),
      },
    });
    await tx.activity.create({
      data: {
        organizationId: org,
        actorId: owner,
        action: "create",
        entityType: "Client",
        entityId: clients[i].id,
        summary: [
          "Call outcome recorded",
          "Follow-up scheduled",
          "New client added",
          "Opportunity created",
          "Client details updated",
          "Product added",
          "Renewal scheduled",
        ][i],
        createdAt: new Date(`2026-09-0${4 - (i % 3)}T0${5 - (i % 4)}:00:00Z`),
      },
    });
  }
  await tx.note.create({
    data: {
      clientId: clients[0].id,
      body: "Discuss family protection and review current cover at the next meeting.",
      authorId: owner,
    },
  });
  await tx.notification.create({
    data: {
      organizationId: org,
      userId: owner,
      title: "Your relationship workspace is ready",
      link: "/dashboard",
    },
  });
});
console.log(
  "Seeded deterministic synthetic workspace: 30 clients, 23 opportunities, 18 products, 14 events, 24 follow-ups.",
);
await db.close();
