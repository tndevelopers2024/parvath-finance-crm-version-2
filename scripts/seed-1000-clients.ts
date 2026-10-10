import { db } from "../apps/api/src/db.js";
import {
  assertDemoDatabase,
  clearWorkspaceData,
} from "../apps/api/src/demoGuard.js";
import { dateOnly } from "../apps/api/src/domain.js";

// Deterministic PRNG to ensure reproducible, non-repetitive real-time distribution
function makeRandom(seed = 987654321) {
  let s = seed;
  return function () {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}
const rand = makeRandom(42);

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function main() {
  console.log("========================================================");
  console.log(" Starting Real-Time Distributed 1,000 Client Workspace Seed");
  console.log("========================================================");

  assertDemoDatabase("The 1,000 client seed");
  const m = await db.membership.findFirst({
    where: { role: "Administrator" },
    include: { user: true },
  });
  if (!m) throw new Error("Create an administrator first: npm run admin:create");

  const org = m.organizationId;
  const owner = m.userId;
  console.log(`Organization: ${org}`);
  console.log(`Owner: ${m.user.name} (${owner})`);

  // Clear previous records for fresh, clean seed
  console.log("Clearing previous client and activity records...");
  await clearWorkspaceData(org);

  // 1. Providers and Product Definitions (14 Providers, 22 Products)
  console.log("Registering financial providers and product catalogue...");
  const specs = [
    // Life & Term Insurance
    ["Life Insurance", "LIC", "Jeevan Anand", "LI"],
    ["Term Insurance", "LIC", "Tech Term Cover", "TT"],
    ["Life Insurance", "LIC", "Jeevan Umang Whole Life", "JU"],
    ["Life Insurance", "HDFC Life", "Sanchay Plus Guaranteed", "SP"],
    ["Term Insurance", "HDFC Life", "Click 2 Protect Super", "CP"],
    ["Term Insurance", "Max Life", "Smart Total Secure", "ST"],
    ["Life Insurance", "Max Life", "Smart Wealth Plan", "SW"],
    ["Life Insurance", "SBI Life", "Smart Elite Protection", "SE"],
    ["Term Insurance", "SBI Life", "eShield Next Term", "SN"],
    ["Term Insurance", "ICICI Prudential", "iProtect Smart", "PS"],

    // Health Insurance
    ["Health Insurance", "Star Health", "Family Health Optima", "FHO"],
    ["Health Insurance", "Star Health", "Star Comprehensive Health", "SCH"],
    ["Health Insurance", "Care Health Insurance", "Care Supreme", "CS"],
    ["Health Insurance", "Care Health Insurance", "Care Advantage 1Cr", "CA"],
    ["Health Insurance", "Niva Bupa", "ReAssure 2.0 Platinum", "RA"],
    ["Health Insurance", "United India Insurance", "Individual Medishield", "IM"],

    // General & Motor Insurance
    ["Vehicle Insurance", "United India Insurance", "Motor Secure Private Car", "MS"],
    ["Vehicle Insurance", "New India Assurance", "Commercial Fleet Package", "CF"],
    ["Commercial Insurance", "United India Insurance", "Standard Fire & Special Perils", "SF"],

    // Banking & Loans
    ["Home Loan", "Indian Bank", "IB Home Loan Regular", "IBH"],
    ["Business Loan", "Canara Bank", "MSME Growth Credit", "CMG"],
    ["Home Loan", "Canara Bank", "Canara Housing Loan", "CHL"],
    ["Home Loan", "State Bank of India", "SBI Regular Home Loan", "SBH"],
    ["Business Loan", "State Bank of India", "SBI SME Credit Express", "SME"],

    // Mutual Funds & Wealth
    ["Investment", "Sundaram Mutual Fund", "Mid Cap Growth Fund", "SMG"],
    ["Investment", "Sundaram Mutual Fund", "Large & Mid Cap Fund", "SLM"],
    ["Investment", "SBI Mutual Fund", "Bluechip Equity Fund", "SBF"],
    ["Investment", "SBI Mutual Fund", "Small Cap Growth Fund", "SSF"],
    ["Investment", "HDFC Mutual Fund", "Flexi Cap Growth Fund", "HFF"],
  ];

  const definitions: any[] = [];
  const providerMap = new Map<string, any>();

  for (const [category, providerName, productName, code] of specs) {
    let p = providerMap.get(providerName);
    if (!p) {
      p = await db.provider.create({
        data: { organizationId: org, name: providerName },
      });
      providerMap.set(providerName, p);
    }
    const def = await db.productDefinition.create({
      data: {
        organizationId: org,
        providerId: p.id,
        name: productName,
        category,
      },
    });
    definitions.push({ ...def, code, providerName });
  }

  // Tags
  const tagNames = ["HNI", "Family", "Insurance", "Investment", "Home Loan", "Senior Citizen", "Corporate", "NRI"];
  const tags: any[] = [];
  for (const name of tagNames) {
    tags.push(
      await db.tag.upsert({
        where: { name },
        create: { name },
        update: {},
      }),
    );
  }

  // Realistic Tamil Nadu Names
  const firstNames = [
    "Rajesh", "Priya", "Suresh", "Meenakshi", "Arunachalam", "Kavitha", "Vikram", "Anandhi",
    "Mohamed", "Divya", "Karthikeyan", "Nivetha", "Ramesh", "Balamurugan", "Selvakumar", "Manoj",
    "Senthil", "Harini", "Vigneshwaran", "Sathish", "Gokulnath", "Gayathri", "Kishore", "Deepak",
    "Ananya", "Swaminathan", "Soundarya", "Vijay", "Keerthana", "Murali", "Preethi", "Madhavan",
    "Revathi", "Saravanan", "Janani", "Sridhar", "Uma", "Balaji", "Deepa", "Prakash",
    "Radhika", "Ashwin", "Pavithra", "Naveen", "Sowmya", "Arvind", "Lakshmi", "Karthi",
    "Lavanya", "Dinesh", "Shalini", "Vignesh", "Nithya", "Manikandan", "Poornima", "Prasanna",
    "Suganya", "Raghavan", "Shanthi", "Venkatesh", "Malathi", "Shankar", "Vasanthi", "Hariharan",
    "Subhashini", "Kumaran", "Geetha", "Yuvaraj", "Vani", "Muthukumar", "Hema", "Jayanth",
    "Sumathi", "Rajendran", "Mythili", "Ilango", "Shobana", "Padmanabhan", "Rohini", "Sundararajan",
    "Vidya", "Chelladurai", "Jayalakshmi", "Annamalai", "Gowri", "Natarajan", "Bhuvana", "Murugesan",
    "Shobha", "Pandian", "Indira", "Velmurugan", "Rekha", "Ganapathy", "Sudha", "Marimuthu",
    "Saradha", "Subramanian", "Pushpa", "Alagappan", "Kamakshi", "Baskar", "Abirami", "Ganesan",
    "Menaka", "Chandran", "Kalyani", "Dhanasekaran", "Chitra", "Elango", "Hemalatha", "Kannan"
  ];

  const lastNames = [
    "Kumar", "Sundaram", "Natarajan", "Babu", "Ramanathan", "Saravanan", "Thangavel", "Riyaz",
    "Shankar", "Rajagopal", "Murugesan", "Kannan", "Srinivasan", "Muthuraman", "Manickam",
    "Subramaniam", "Rajesh", "Swaminathan", "Iyer", "Iyengar", "Pillai", "Mudaliar", "Chettiar",
    "Nadar", "Gounder", "Thevar", "Naidu", "Reddy", "Rao", "Pandian", "Moorthy", "Mani",
    "Dass", "Raj", "Selvam", "Velan", "Nathan", "S", "R", "P", "K", "M", "V", "T", "B",
    "Krishnan", "Venkataraman", "Chidambaram", "Sethuraman", "Palanisamy", "Shanmugam", "Arumugam",
    "Karuppiah", "Meenakshisundaram", "Veerappan", "Govindasamy", "Alagesan", "Paramasivam",
    "Sivakumar", "Somasundaram", "Vaithiyanathan", "Balakrishnan", "Ramasamy", "Jayaraman"
  ];

  const businessNames = [
    "Cauvery Textile Mills", "Kongu Precision Engineering", "Chola Agro Foods & Exports",
    "Pandian Transport & Logistics", "Annamalai Spinning Mills", "Thanjavur Delta Rice Processors",
    "Madurai Meenakshi Silks & Sarees", "Kovai CNC Technologies", "Tirunelveli Wind Energy Systems",
    "Salem Steel & Fabrication Works", "Erode Turmeric Agro Exports", "Kanchi Kamakshi Traditional Weavers",
    "Vellore Tanners & Leather Products", "Chettinad Heritage Hospitality", "Karur Home Furnishings Export",
    "Nagercoil Spices & Rubber Plantations", "Dindigul Locks & Hardware Manufacturing", "Hosur Automotive Engineering",
    "Tiruppur Knitwear & Garments", "Sivakasi Print & Packaging Solutions", "Pollachi Coconut Products & Oils",
    "Cuddalore Chemical & Pharma Works", "Kumbakonam Brass & Utensils Emporium", "Tuticorin Marine Logistics & Shipping",
    "OMR Cloud Infotech Solutions", "Chennai Coastal Port Logistics", "Tambaram Precision Tooling Works",
    "Perundurai Textile Processing Mills", "Bhavani Carpet & Mat Weaving Society", "Rajapalayam Cotton Mill Enterprises",
    "Ambur Footwear & Leather Works", "Vaniyambadi Tanneries & Export House", "Kovilpatti Confectionery & Agro",
    "Namakkal Poultry & Hatcheries Federation", "Udumalpet Dairy & Cattle Feed", "Aruppukottai Handlooms & Prints",
    "Attur Sago & Starch Industries", "Melur Granite & Stone Works", "Oddanchatram Vegetable Cold Chain",
    "Gobichettipalayam Sugar & Distillery", "Mayiladuthurai Agro Implements", "Theni Cardamom & Spices Co-op",
    "Neyveli Industrial Electricals", "Ranipet Chemical Formulations", "Tiruvannamalai Agro Commodities",
    "Perambalur Cashew Nut Processors", "Ariyalur Mineral & Cement Logistics", "Nagapattinam Fishery Marine Exports",
    "Pudukkottai Auto Components", "Sivagangai Coir & Natural Fibres", "Tirupathur Timber & Plywood Mart",
    "Vedaranyam Salt & Marine Chemicals", "Vellore Healthcare Equipments", "Coimbatore Foundry Associates",
    "Chennai Modern Retail & Marts", "Madurai Logistics Fleet Carriers", "Salem Agro Machinery Works",
    "Trichy Fabrication & Piping Services", "Tirunelveli Solar Power Developers", "Tiruppur Organic Cotton Apparels"
  ];

  const cityData = [
    {
      city: "Chennai",
      state: "Tamil Nadu",
      areas: [
        { name: "Anna Nagar", pin: "600040", street: "2nd Avenue" },
        { name: "T. Nagar", pin: "600017", street: "Usman Road" },
        { name: "Mylapore", pin: "600004", street: "South Mada Street" },
        { name: "Velachery", pin: "600042", street: "100 Feet Bypass Road" },
        { name: "Adyar", pin: "600020", street: "Sardar Patel Road" },
        { name: "OMR Sholinganallur", pin: "600119", street: "Rajiv Gandhi Salai" },
        { name: "Alwarpet", pin: "600018", street: "Kasturi Rangan Road" },
        { name: "West Tambaram", pin: "600045", street: "GST Road" },
        { name: "Kilpauk", pin: "600010", street: "Poonamallee High Road" },
      ],
    },
    {
      city: "Coimbatore",
      state: "Tamil Nadu",
      areas: [
        { name: "RS Puram", pin: "641002", street: "West Club Road" },
        { name: "Peelamedu", pin: "641004", street: "Avinashi Road" },
        { name: "Gandhipuram", pin: "641012", street: "Cross Cut Road" },
        { name: "Saibaba Colony", pin: "641011", street: "NSR Road" },
        { name: "Kurichi SIDCO", pin: "641021", street: "Industrial Estate Road" },
      ],
    },
    {
      city: "Madurai",
      state: "Tamil Nadu",
      areas: [
        { name: "KK Nagar", pin: "625020", street: "80 Feet Road" },
        { name: "Simmakkal", pin: "625001", street: "Main Bazaar Road" },
        { name: "Anna Nagar", pin: "625020", street: "Melur Road" },
        { name: "SS Colony", pin: "625016", street: "Bypass Road" },
      ],
    },
    {
      city: "Tiruchirappalli",
      state: "Tamil Nadu",
      areas: [
        { name: "Thillai Nagar", pin: "620018", street: "11th Cross" },
        { name: "Cantonment", pin: "620001", street: "Officers Colony" },
        { name: "Srirangam", pin: "620006", street: "South Chitra Street" },
      ],
    },
    {
      city: "Salem",
      state: "Tamil Nadu",
      areas: [
        { name: "Fairlands", pin: "636016", street: "Brindavan Road" },
        { name: "Hasthampatti", pin: "636007", street: "Main Road" },
        { name: "Suramangalam", pin: "636005", street: "Junction Road" },
      ],
    },
    {
      city: "Tirunelveli",
      state: "Tamil Nadu",
      areas: [
        { name: "Palayamkottai", pin: "627002", street: "Trivandrum Road" },
        { name: "Vannarpettai", pin: "627003", street: "South Bypass Road" },
      ],
    },
    {
      city: "Erode",
      state: "Tamil Nadu",
      areas: [
        { name: "Perundurai Road", pin: "638011", street: "Brough Road" },
        { name: "Veerappanchatram", pin: "638004", street: "Sathy Road" },
      ],
    },
    {
      city: "Tiruppur",
      state: "Tamil Nadu",
      areas: [
        { name: "Kumaran Road", pin: "641601", street: "Avinashi Road" },
        { name: "Textile Park", pin: "641652", street: "SF Road" },
      ],
    },
    {
      city: "Vellore",
      state: "Tamil Nadu",
      areas: [
        { name: "Katpadi", pin: "632014", street: "Main Road" },
        { name: "Gandhi Nagar", pin: "632006", street: "East Main Road" },
      ],
    },
    {
      city: "Thanjavur",
      state: "Tamil Nadu",
      areas: [
        { name: "South Rampart", pin: "613001", street: "Big Temple Road" },
        { name: "Medical College Road", pin: "613004", street: "VOC Nagar" },
      ],
    },
  ];

  const occupations = [
    "IT Solutions Architect (OMR Chennai)",
    "Consultant Cardiologist",
    "Civil Infrastructure Contractor",
    "Engineering College Professor",
    "Textile Merchant & Exporter",
    "Educational Society Trustee",
    "Auto Components Manufacturer",
    "Senior Chartered Accountant",
    "Modern Rice Mill Owner",
    "Garments & Knitwear Exporter",
    "Retail Jeweller",
    "Wholesale Spice & Commodity Merchant",
    "Wind Energy & Solar Consultant",
    "Precision Casting & Foundry Operator",
    "Fintech Engineering Lead",
    "Architectural & Structural Designer",
    "Automotive Dealership Partner",
    "Cold Chain Storage Operator",
  ];

  const industries = [
    "Textiles & Knitwear Apparel",
    "Automotive Precision Engineering",
    "Agro Food Processing & Exports",
    "Logistics & Cargo Transport",
    "Chemicals & Allied Products",
    "Healthcare & Medical Services",
    "Hospitality & Tourism",
    "Information Technology & Software",
    "Renewable Energy & Wind Power",
    "Print, Packaging & Publishing",
  ];

  const incomes = [
    "< ₹10 Lakhs", "₹10 – 25 Lakhs", "₹25 – 50 Lakhs", "₹50 Lakhs – 1 Crore", "> ₹1 Crore"
  ];

  const clientNotes = [
    "Prefers evening calls after 6 PM. Annual portfolio review during festival season.",
    "Senior consultant. Prefers WhatsApp communication or morning meetings before clinic hours.",
    "Infrastructure contractor. Exploring machinery purchase and working capital credit line.",
    "Interested in retirement planning and mutual fund SIP top-ups.",
    "Business owner inquiring about comprehensive fire and marine transit insurance.",
    "Family protection advisory requested; looking into term plan upgrades.",
    "Evaluating child higher education endowment policy and Sukanya Samriddhi top-up.",
    "Inquiring about fixed maturity plans and high-yield corporate bonds.",
    "Fleet commercial vehicle insurance package under annual renewal review.",
    "Interested in commercial property loan and working capital credit limits."
  ];

  // 2. Create 1,000 Clients (930 Individuals, 70 Businesses)
  const totalClients = 1000;
  console.log(`Generating ${totalClients} client records across Tamil Nadu cities...`);

  const allClients: any[] = [];
  const CHUNK_SIZE = 50;

  for (let start = 0; start < totalClients; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE, totalClients);
    const chunkClients = [];

    for (let i = start; i < end; i++) {
      const isBusiness = i >= 930;
      const name = isBusiness
        ? businessNames[i % businessNames.length] + (i >= 930 + businessNames.length ? ` Unit ${Math.floor(i / businessNames.length)}` : "")
        : `${firstNames[i % firstNames.length]} ${lastNames[(i * 13 + 7) % lastNames.length]}`;

      // Pick city using pseudo-random distribution so every date/view gets diverse cities
      const cityGroup = cityData[(i * 7 + 11) % cityData.length];
      const area = cityGroup.areas[i % cityGroup.areas.length];
      const streetNum = ((i * 19) % 240) + 1;
      const address = `No. ${streetNum}, ${area.street}, ${area.name}, ${cityGroup.city}, ${cityGroup.state} – ${area.pin}`;

      const kind = isBusiness ? "Business" : "Individual";
      const occupation = isBusiness ? undefined : occupations[i % occupations.length];
      const industry = isBusiness ? industries[i % industries.length] : undefined;

      const phonePrefix = ["9840", "9841", "9444", "9884", "9790", "9842", "9443", "9843", "9789", "9940"][i % 10];
      const phone = `+91${phonePrefix}${String(100000 + i).slice(1)}`;
      const emailSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "");
      const email = `${emailSlug}.${i + 1}@parvath.test`;

      const isClient = i % 5 !== 0; // 80% clients, 20% prospects
      const status = i % 30 === 0 ? "Needs Attention" : i % 8 === 0 ? "Lead" : i % 40 === 0 ? "Inactive" : "Active";
      const source = ["Referral", "Website", "Call", "WhatsApp", "Meeting", "Walk-in"][i % 6];
      const annualIncome = isClient ? incomes[i % incomes.length] : undefined;
      const riskProfile = ["Conservative", "Moderate", "Aggressive"][i % 3];
      const preferredContact = ["WhatsApp", "Call", "Email", "Meeting"][i % 4];

      // Give 3 clients a birthday today (09-04) so the Birthday widget populates!
      let dob: Date | null = null;
      if (!isBusiness) {
        if (i === 12 || i === 45 || i === 118) {
          dob = dateOnly("1988-09-04");
        } else {
          const birthYear = 1968 + (i % 35);
          const birthMonth = String((i % 12) + 1).padStart(2, "0");
          const birthDay = String((i % 27) + 1).padStart(2, "0");
          dob = dateOnly(`${birthYear}-${birthMonth}-${birthDay}`);
        }
      }

      const client = await db.client.create({
        data: {
          organization: { connect: { id: org } },
          ownerId: owner,
          isClient,
          status,
          source,
          annualIncome,
          riskProfile,
          investmentInterest: i % 2 === 0 ? "Mutual Funds, Bonds, SIP" : "Equity, Gold ETF, Sovereign Bonds",
          loanInterest: i % 3 === 0 ? "Home Loan" : i % 5 === 0 ? "MSME Growth Loan" : null,
          preferredContact,
          notesText: clientNotes[i % clientNotes.length],
          createdAt: new Date(Date.now() - (1000 - i) * 3600 * 1000 * 6),
          contact: {
            create: {
              organizationId: org,
              name,
              phone,
              email,
              kind,
              city: cityGroup.city,
              state: "Tamil Nadu",
              address,
              occupation,
              dob,
              ...(isBusiness ? { business: { create: { industry } } } : {}),
            },
          },
        },
      });

      chunkClients.push(client);
    }

    allClients.push(...chunkClients);
    process.stdout.write(`\rCreated ${allClients.length} / ${totalClients} clients...`);
  }

  console.log(`\nAll ${totalClients} clients created successfully!`);

  // Attach Tags to clients
  console.log("Attaching tags to client records...");
  for (let i = 0; i < allClients.length; i += 4) {
    const t = tags[i % tags.length];
    await db.clientTag.create({
      data: { clientId: allClients[i].id, tagId: t.id },
    });
  }

  // 3. Client Products Catalogue Assignment (~950 Products)
  console.log("Generating products and policy portfolios...");
  const clientProducts: any[] = [];
  const totalProducts = 950;

  // Realistic premium / instalment tiers
  const productAmounts = [
    1420000, 1850000, 2160000, 2480000, 2850000, 3240000, 3800000, // Term
    1150000, 1580000, 1940000, 2320000, 2750000, 3360000, 4200000, // Health
    2400000, 3150000, 4500000, 5600000, 7200000, 10800000,         // Life / Endowment
    680000,  920000,  1240000, 1560000, 1890000, 2450000,          // Motor & General
    2850000, 3420000, 4180000, 5200000, 6850000, 8500000,          // Home Loan EMI
    4500000, 6500000, 8800000, 12500000, 17500000,                 // MSME EMI
    500000,  1000000, 1500000, 2500000, 5000000                    // Mutual Fund SIP
  ];

  // Shuffle client indices to ensure zero modulo clumping
  const shuffledClients = shuffle(allClients);

  for (let i = 0; i < totalProducts; i++) {
    const client = shuffledClients[i % shuffledClients.length];
    // Decoupled product definition assignment
    const def = definitions[(i * 7 + 13) % definitions.length];

    const isLoan = def.category.includes("Loan");
    const isInvestment = def.category === "Investment";
    const amount = productAmounts[(i * 11 + 5) % productAmounts.length];

    const p = await db.clientProduct.create({
      data: {
        organizationId: org,
        clientId: client.id,
        definitionId: def.id,
        identifier: `PV-${def.code}-${String(100000 + i + 1)}`,
        status: i % 25 === 0 ? "Underwriting" : i % 40 === 0 ? "Lapsed" : "Active",
        premiumMinor: isLoan || isInvestment ? null : BigInt(amount),
        principalMinor: isLoan ? BigInt(amount * 120) : isInvestment ? 50000000n : null,
        expectedCommissionMinor: isLoan || isInvestment ? 0n : BigInt(Math.round(amount * 0.05)),
        startDate: dateOnly("2025-09-04"),
        ...(isLoan
          ? { loanDetails: { interestBasisPoints: 850, termMonths: 240 } }
          : isInvestment
            ? { investmentDetails: { units: "100", maturityDate: "2028-09-04" } }
            : { insuranceDetails: { sumAssuredMinor: "100000000", termYears: 20 } }),
      },
    });

    clientProducts.push({ product: p, client, def, amount });
    if ((i + 1) % 100 === 0) {
      process.stdout.write(`\rCreated ${i + 1} / ${totalProducts} products...`);
    }
  }

  console.log(`\nAll ${totalProducts} client products created!`);

  // 4. Financial Events (Renewals, Instalments, SIPs)
  // Clean real-time distribution across:
  // - Already Renewed (Confirmed): ~65 events (Aug 01 – Sep 03)
  // - Overdue (Pending): ~35 events (Aug 15 – Sep 03)
  // - Due Today (2026-09-04): Exactly 15 events (Pending)
  // - Due in 7 Days (2026-09-05 – 09-11): ~55 events (Pending)
  // - Due in 30 Days (2026-09-12 – 10-03): ~190 events (Pending)
  // - Future Renewals (2026-10-04 – 2027-08-31): ~450 events (Pending)
  console.log("Generating non-repetitive real-time financial renewal schedule...");

  let eventIndex = 0;
  const createdEvents: any[] = [];

  // Helper to format ISO date string YYYY-MM-DD
  const makeDateStr = (year: number, month: number, day: number) => {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  };

  // Helper to create an event with payment if confirmed
  const createFinancialEvent = async (
    item: any,
    dateStr: string,
    status: "Confirmed" | "Pending",
    amountOverride?: number,
  ) => {
    const isLoan = item.def.category.includes("Loan");
    const isInvestment = item.def.category === "Investment";
    const amount = amountOverride || item.amount;

    const event = await db.financialEvent.create({
      data: {
        organizationId: org,
        clientId: item.client.id,
        productId: item.product.id,
        type: isLoan
          ? "Loan instalment"
          : isInvestment
            ? "Bond interest"
            : "Insurance renewal",
        dueDate: dateOnly(dateStr),
        amountMinor: isInvestment ? 1000000n : BigInt(amount),
        amountMeaning: isLoan
          ? "Instalment due"
          : isInvestment
            ? "Interest receivable"
            : "Premium due",
        recurrenceMonths: isLoan ? 1 : 12,
        status,
        completedAt: status === "Confirmed" ? new Date(`${dateStr}T14:30:00.000Z`) : null,
      },
    });

    if (status === "Confirmed") {
      await db.payment.create({
        data: {
          eventId: event.id,
          amountMinor: BigInt(amount),
          reference: `PAY-${item.def.code}-${dateStr.replace(/-/g, "")}-${String(1000 + (eventIndex % 8999))}`,
          recordedBy: owner,
          recordedAt: new Date(`${dateStr}T14:30:00.000Z`),
        },
      });
    }

    eventIndex++;
    createdEvents.push(event);
    return event;
  };

  // A. Already Renewed (Confirmed) Events (65 events, Aug 01 to Sep 03)
  console.log("  Populating Already Renewed (Confirmed) events...");
  for (let i = 0; i < 65; i++) {
    const item = clientProducts[(i * 13 + 3) % clientProducts.length];
    // Dates distributed across August 2026 and early September
    const d = (i % 34) + 1;
    const dateStr = d <= 31 ? makeDateStr(2026, 8, d) : makeDateStr(2026, 9, d - 31);
    await createFinancialEvent(item, dateStr, "Confirmed");
  }

  // B. Overdue Events (35 events, Aug 15 to Sep 03)
  console.log("  Populating Overdue renewals...");
  for (let i = 0; i < 35; i++) {
    const item = clientProducts[(i * 17 + 100) % clientProducts.length];
    // Spread across Aug 15 to Sep 03
    const d = 15 + (i % 20);
    const dateStr = d <= 31 ? makeDateStr(2026, 8, d) : makeDateStr(2026, 9, d - 31);
    await createFinancialEvent(item, dateStr, "Pending");
  }

  // C. Due Today Events (Exactly 15 events on 2026-09-04)
  // Ensure completely distinct products, providers, amounts, and clients!
  console.log("  Populating Due Today (2026-09-04) renewals...");
  const todayDateStr = "2026-09-04";
  const todaySpecs = [
    { defIdx: 0, amount: 2850000 },  // LIC Jeevan Anand
    { defIdx: 10, amount: 1840000 }, // Star Health Optima
    { defIdx: 21, amount: 4250000 }, // Canara Housing Loan EMI
    { defIdx: 3, amount: 3500000 },  // HDFC Life Sanchay Plus
    { defIdx: 16, amount: 1280000 }, // United India Motor Secure
    { defIdx: 5, amount: 2200000 },  // Max Life Smart Total Secure
    { defIdx: 24, amount: 1500000 }, // Sundaram Mutual Fund Mid Cap
    { defIdx: 12, amount: 2420000 }, // Care Health Care Supreme
    { defIdx: 19, amount: 5600000 }, // Indian Bank Home Loan
    { defIdx: 8, amount: 1950000 },  // SBI Life eShield Next
    { defIdx: 17, amount: 3100000 }, // New India Commercial Fleet
    { defIdx: 14, amount: 1680000 }, // Niva Bupa ReAssure 2.0
    { defIdx: 22, amount: 4800000 }, // SBI Regular Home Loan
    { defIdx: 9, amount: 2750000 },  // ICICI Pru iProtect Smart
    { defIdx: 26, amount: 2500000 }, // SBI Mutual Fund Bluechip
  ];

  for (let i = 0; i < todaySpecs.length; i++) {
    const spec = todaySpecs[i];
    const item = clientProducts[(i * 23 + 200) % clientProducts.length];
    await createFinancialEvent(item, todayDateStr, "Pending", spec.amount);
  }

  // D. Due in Next 7 Days (56 events, Sep 05 to Sep 11, exactly 8 per day with varied products)
  console.log("  Populating Next 7 Days renewals...");
  for (let dayOffset = 1; dayOffset <= 7; dayOffset++) {
    const dateStr = makeDateStr(2026, 9, 4 + dayOffset);
    for (let k = 0; k < 8; k++) {
      const idx = (dayOffset * 8 + k + 300) * 19;
      const item = clientProducts[idx % clientProducts.length];
      await createFinancialEvent(item, dateStr, "Pending");
    }
  }

  // E. Due in Next 30 Days (180 events, Sep 12 to Oct 04)
  console.log("  Populating Next 30 Days renewals...");
  for (let dayOffset = 8; dayOffset <= 30; dayOffset++) {
    const targetDate = new Date(Date.UTC(2026, 8, 4 + dayOffset));
    const dateStr = targetDate.toISOString().slice(0, 10);
    const count = 7 + (dayOffset % 3); // 7 to 9 per day
    for (let k = 0; k < count; k++) {
      const idx = (dayOffset * 11 + k + 450) * 13;
      const item = clientProducts[idx % clientProducts.length];
      await createFinancialEvent(item, dateStr, "Pending");
    }
  }

  // F. Future Renewals (450 events, Oct 2026 to Aug 2027)
  console.log("  Populating Future renewals through 2027...");
  for (let i = 0; i < 450; i++) {
    const dayOffset = 31 + (i % 320);
    const targetDate = new Date(Date.UTC(2026, 8, 4 + dayOffset));
    const dateStr = targetDate.toISOString().slice(0, 10);
    const item = clientProducts[(i * 7 + 100) % clientProducts.length];
    await createFinancialEvent(item, dateStr, "Pending");
  }

  console.log(`\nCreated ${createdEvents.length} financial events with realistic distribution!`);

  // 5. Follow-up Tasks (~250 tasks)
  // - Overdue: 28 tasks (state: "pending", dueAt < now())
  // - Today's Schedule: 15 tasks on 2026-09-04 afternoon/evening (state: "pending", dueAt >= now())
  // - This Week: 45 tasks (state: "pending", 2026-09-05 to 2026-09-11)
  // - Next Week: 35 tasks (state: "pending", 2026-09-12 to 2026-09-18)
  // - Future: 40 tasks (state: "pending", 2026-09-19 to 2026-10-15)
  // - Completed: 85 tasks (state: "completed", with outcomes and completedAt)
  console.log("Generating follow-up tasks and Today's Schedule...");

  const realisticNotes = [
    "Discuss upcoming policy renewal terms. Share revised quote with loyalty discount.",
    "Send KYC document checklist and collect updated Aadhaar & PAN copy.",
    "Review health insurance family floater coverage. Explain OPD and maternity add-ons.",
    "Follow up on mutual fund SIP performance and suggest asset rebalancing.",
    "Discuss commercial vehicle fleet renewal quotation and zero-depreciation rider.",
    "Schedule family financial portfolio consultation for Diwali tax planning.",
    "Verify updated communication address and bank account details for NACH auto-debit.",
    "Send annual policy summary and Section 80C / 80D tax exemption certificates.",
    "Follow up on MSME machinery expansion loan sanction letter with bank manager.",
    "Review fire and burglary coverage for industrial warehouse and stock in transit.",
    "Discuss term insurance upgrade to 2 Crore sum assured considering recent liability.",
    "Meeting with director to finalize group health insurance cover for 50 employees."
  ];

  const completedOutcomes = [
    "Connected via call. Client agreed to renew policy; shared digital payment link.",
    "Meeting concluded at client premises. Signed proposal forms and cheque collected.",
    "WhatsApp confirmation received. KYC documents uploaded to insurer portal.",
    "Call completed. Client requested policy enhancement and added spouse as nominee.",
    "Informed client about grace period. Premium payment verified via portal.",
    "Sent detailed mutual fund SIP statement; scheduled quarterly review call.",
    "Document verification completed and sent to underwriter for clearance.",
    "Home loan sanction letter handed over to client; loan agreement executed."
  ];

  let followUpTotal = 0;

  // A. Overdue Follow-ups (28 tasks)
  console.log("  Populating Overdue follow-up tasks...");
  for (let i = 0; i < 28; i++) {
    const client = allClients[(i * 17 + 23) % allClients.length];
    const matchingProd = clientProducts.find((cp) => cp.client.id === client.id);
    const dayOffset = -1 - (i % 9); // -1 to -9 days ago (Aug 26 - Sep 03)
    // 10:30 AM or 03:30 PM IST on past dates
    const hourUTC = i % 2 === 0 ? 5 : 10;
    const dueAt = new Date(Date.UTC(2026, 8, 4 + dayOffset, hourUTC, (i % 4) * 15));

    await db.followUp.create({
      data: {
        organizationId: org,
        clientId: client.id,
        productId: matchingProd?.product.id,
        ownerId: owner,
        channel: ["Call", "WhatsApp", "Meeting", "Email"][i % 4],
        dueAt,
        notes: realisticNotes[i % realisticNotes.length],
        state: "pending",
      },
    });
    followUpTotal++;
  }

  // B. Due Today Follow-ups (Exactly 15 tasks on 2026-09-04 for Today's Schedule)
  // Times set in the afternoon/evening (06:45 UTC to 13:30 UTC = 12:15 PM to 07:00 PM IST)
  // so timing is "Due Today" and they populate "Today's Schedule" widget!
  console.log("  Populating Today's Schedule (2026-09-04)...");
  const todayScheduleSlots = [
    { hour: 6, min: 45, channel: "Call", note: "Urgent: Follow up on term insurance policy expiring this evening." },
    { hour: 7, min: 15, channel: "WhatsApp", note: "Share Star Health renewal UPI payment link with premium breakdown." },
    { hour: 7, min: 45, channel: "Call", note: "Discuss LIC Jeevan Anand maturity payout and reinvestment options." },
    { hour: 8, min: 30, channel: "Meeting", note: "In-person consultation at office: Family health floater plan presentation." },
    { hour: 9, min: 0, channel: "Email", note: "Send Canara Bank home loan provisional interest certificate for IT return." },
    { hour: 9, min: 30, channel: "Call", note: "Remind client about health insurance grace period closing tomorrow." },
    { hour: 10, min: 0, channel: "WhatsApp", note: "Confirm dispatch tracking number for physical insurance policy document." },
    { hour: 10, min: 30, channel: "Meeting", note: "Meet MD of Cauvery Textile Mills regarding commercial fire policy review." },
    { hour: 11, min: 0, channel: "Call", note: "Explain HDFC Life Sanchay Plus guaranteed return schedule." },
    { hour: 11, min: 30, channel: "WhatsApp", note: "Send KYC video verification link for SBI Mutual Fund SIP top-up." },
    { hour: 12, min: 0, channel: "Email", note: "Share quotation comparison for commercial vehicle fleet cover." },
    { hour: 12, min: 30, channel: "Call", note: "Evening follow-up regarding children higher education endowment proposal." },
    { hour: 13, min: 0, channel: "Call", note: "Confirm receipt of revised quotation for Care Supreme health insurance." },
    { hour: 13, min: 30, channel: "WhatsApp", note: "Send reminder to upload missing bank statement for loan underwriting." },
    { hour: 14, min: 0, channel: "Call", note: "Discuss retirement corpus SIP allocation and monthly pension expectations." },
  ];

  for (let i = 0; i < todayScheduleSlots.length; i++) {
    const slot = todayScheduleSlots[i];
    const client = allClients[(i * 31 + 50) % allClients.length];
    const matchingProd = clientProducts.find((cp) => cp.client.id === client.id);
    const dueAt = new Date(Date.UTC(2026, 8, 4, slot.hour, slot.min));

    await db.followUp.create({
      data: {
        organizationId: org,
        clientId: client.id,
        productId: matchingProd?.product.id,
        ownerId: owner,
        channel: slot.channel,
        dueAt,
        notes: slot.note,
        state: "pending",
      },
    });
    followUpTotal++;
  }

  // C. This Week Follow-ups (45 tasks, Sep 05 to Sep 11)
  console.log("  Populating This Week follow-up tasks...");
  for (let i = 0; i < 45; i++) {
    const client = allClients[(i * 29 + 150) % allClients.length];
    const matchingProd = clientProducts.find((cp) => cp.client.id === client.id);
    const dayOffset = 1 + (i % 7); // 1 to 7 days from now
    const hourUTC = 4 + (i % 6);   // 09:30 AM to 03:30 PM IST
    const dueAt = new Date(Date.UTC(2026, 8, 4 + dayOffset, hourUTC, (i % 4) * 15));

    await db.followUp.create({
      data: {
        organizationId: org,
        clientId: client.id,
        productId: matchingProd?.product.id,
        ownerId: owner,
        channel: ["Call", "WhatsApp", "Meeting", "Email"][i % 4],
        dueAt,
        notes: realisticNotes[i % realisticNotes.length],
        state: "pending",
      },
    });
    followUpTotal++;
  }

  // D. Next Week & Later Follow-ups (75 tasks, Sep 12 to Oct 15)
  console.log("  Populating Next Week & Future follow-up tasks...");
  for (let i = 0; i < 75; i++) {
    const client = allClients[(i * 37 + 250) % allClients.length];
    const matchingProd = clientProducts.find((cp) => cp.client.id === client.id);
    const dayOffset = 8 + (i % 30);
    const hourUTC = 5 + (i % 5);
    const dueAt = new Date(Date.UTC(2026, 8, 4 + dayOffset, hourUTC, (i % 4) * 15));

    await db.followUp.create({
      data: {
        organizationId: org,
        clientId: client.id,
        productId: matchingProd?.product.id,
        ownerId: owner,
        channel: ["Call", "WhatsApp", "Meeting", "Email"][i % 4],
        dueAt,
        notes: realisticNotes[i % realisticNotes.length],
        state: "pending",
      },
    });
    followUpTotal++;
  }

  // E. Completed Follow-ups (85 tasks)
  console.log("  Populating Completed follow-up tasks...");
  for (let i = 0; i < 85; i++) {
    const client = allClients[(i * 41 + 400) % allClients.length];
    const matchingProd = clientProducts.find((cp) => cp.client.id === client.id);
    const dayOffset = -1 - (i % 20); // -1 to -20 days ago
    const hourUTC = 4 + (i % 7);
    const dueAt = new Date(Date.UTC(2026, 8, 4 + dayOffset, hourUTC, (i % 4) * 15));
    const completedAt = new Date(dueAt.getTime() + 1800000 + (i % 3) * 900000);

    await db.followUp.create({
      data: {
        organizationId: org,
        clientId: client.id,
        productId: matchingProd?.product.id,
        ownerId: owner,
        channel: ["Call", "WhatsApp", "Meeting", "Email"][i % 4],
        dueAt,
        notes: realisticNotes[i % realisticNotes.length],
        state: "completed",
        outcome: completedOutcomes[i % completedOutcomes.length],
        completedAt,
      },
    });
    followUpTotal++;
  }

  console.log(`\nAll ${followUpTotal} follow-up tasks created!`);

  // 6. Opportunities (Leads Pipeline - 320 Leads)
  console.log("Generating opportunities pipeline across 8 stages...");
  const leadDistribution = [
    { stage: "New", count: 50 },
    { stage: "Contacted", count: 60 },
    { stage: "Meeting Scheduled", count: 45 },
    { stage: "Proposal Sent", count: 50 },
    { stage: "Negotiation", count: 35 },
    { stage: "Underwriting", count: 30 },
    { stage: "Won", count: 35 },
    { stage: "Lost", count: 15 },
  ];

  let leadIndex = 0;
  for (const { stage, count } of leadDistribution) {
    for (let c = 0; c < count; c++) {
      const client = allClients[(leadIndex * 17 + 73) % allClients.length];
      const def = definitions[(leadIndex * 13 + 5) % definitions.length];
      const priority = leadIndex % 5 === 0 ? "Urgent" : leadIndex % 3 === 0 ? "High" : "Normal";
      const source = ["Referral", "Website", "Call", "WhatsApp", "Meeting", "Walk-in"][leadIndex % 6];
      const createdDaysAgo = 1 + (leadIndex % 45);
      const createdAt = new Date(Date.now() - createdDaysAgo * 86400000);

      await db.opportunity.create({
        data: {
          organizationId: org,
          clientId: client.id,
          ownerId: owner,
          requirement: `${def.category} - ${def.name}`,
          stage,
          createdAt,
          priority,
          source,
          nextAction: stage === "Won"
            ? "Policy issued. Schedule onboarding welcome call."
            : stage === "Lost"
              ? "File closed. Schedule re-engagement in 6 months."
              : "Follow up on proposal terms and share quotation revision.",
          nextFollowUp: ["Won", "Lost"].includes(stage)
            ? null
            : new Date(Date.UTC(2026, 8, 5 + (leadIndex % 20))),
          lostReason: stage === "Lost" ? "Opted for alternate corporate group policy" : null,
          history: {
            create: {
              toStage: stage,
              actorId: owner,
              reason: "Pipeline progression based on client interaction",
              createdAt,
            },
          },
        },
      });

      leadIndex++;
    }
  }

  console.log(`Created ${leadIndex} opportunities across all pipeline stages!`);

  // 7. Recent Touchpoints and Activity Logs (75 items)
  console.log("Generating recent communication touchpoints and activity audit trail...");
  for (let i = 0; i < 75; i++) {
    const client = allClients[(i * 23 + 17) % allClients.length];
    const hoursAgo = (75 - i) * 2;
    const createdAt = new Date(Date.now() - hoursAgo * 3600 * 1000);

    await db.communication.create({
      data: {
        clientId: client.id,
        channel: ["Call", "WhatsApp", "Email", "Meeting"][i % 4],
        event: i % 2 === 0 ? "Manual outcome" : "Conversation opened",
        body: [
          "Followed up regarding annual renewal terms and revised payment schedule.",
          "Discussed health insurance floater top-up rider benefits and tax deduction.",
          "Shared mutual fund portfolio performance report and proposed rebalancing.",
          "Verified client communication address and collected PAN card copy for KYC.",
          "Sent comparative quote for commercial vehicle fleet insurance renewal.",
        ][i % 5],
        actorId: owner,
        createdAt,
      },
    });

    await db.activity.create({
      data: {
        organizationId: org,
        actorId: owner,
        action: ["create", "update", "convert"][i % 3],
        entityType: ["Client", "Opportunity", "Product", "FollowUp"][i % 4],
        entityId: client.id,
        summary: [
          "Client KYC verification and documentation updated",
          "Follow-up task scheduled for portfolio review",
          "Opportunity moved to next evaluation stage",
          "Renewal statement and reminder notice dispatched",
          "Annual policy audit report recorded",
        ][i % 5],
        createdAt,
      },
    });
  }

  // System notification
  await db.notification.create({
    data: {
      organizationId: org,
      userId: owner,
      title: "Workspace live: 1,000 clients populated with real-time distributed data",
      link: "/clients",
    },
  });

  // Final verification counts
  const finalClientCount = await db.client.count({ where: { organizationId: org } });
  const finalProductCount = await db.clientProduct.count({ where: { organizationId: org } });
  const finalEventCount = await db.financialEvent.count({ where: { organizationId: org } });
  const finalPaymentCount = await db.payment.count({ where: { event: { organizationId: org } } });
  const finalLeadCount = await db.opportunity.count({ where: { organizationId: org } });
  const finalFollowUpCount = await db.followUp.count({ where: { organizationId: org } });

  console.log("\n========================================================");
  console.log(" WORKSPACE SEEDING SUMMARY (Real-Time Distributed Data)");
  console.log("========================================================");
  console.log(` Clients:         ${finalClientCount}`);
  console.log(` Products:        ${finalProductCount}`);
  console.log(` Renewals/Events: ${finalEventCount}`);
  console.log(` Payments:        ${finalPaymentCount}`);
  console.log(` Opportunities:   ${finalLeadCount}`);
  console.log(` Follow-ups:      ${finalFollowUpCount}`);
  console.log("========================================================\n");

  await db.close();
}

main().catch(async (e) => {
  console.error("Seed error:", e);
  try {
    await db.close();
  } catch {
    // ignore close error
  }
  process.exit(1);
});
