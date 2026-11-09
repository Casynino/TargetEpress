/**
 * Nino's work, as shown on /nino. Every line comes from the project's own live site (its title and description) or
 * from Nino — nothing invented. Screenshots in /public/nino are the live home pages, taken 2026-10-05 (Vegas page);
 * Target and Super Drive retaken 2026-11-09. Copied from the Vegas project's /nino and kept in step with it.
 */

export type Project = {
  name: string;
  /** What it is, in a few words. */
  kind: string;
  line: string;
  url: string;
  /** Shown on the card: the address without https:// and www. */
  domain: string;
  shot?: string;
  tags: string[];
  code?: string;
  status?: "soon";
};

const GH = "https://github.com/Casynino";

/** Live, in production. Target first: the visitor is standing on it. */
export const LIVE: Project[] = [
  {
    name: "Target Express Air Cargo", kind: "Air cargo website & operations system",
    line: "You're on it. Air freight from Guangzhou and Hong Kong to Dar es Salaam — the public site with tracking and bookings, and the whole staff system behind it: both warehouses, finance, pickup and the owner's dashboard.",
    url: "https://www.targetexpressaircargo.com", domain: "targetexpressaircargo.com", shot: "/nino/target.webp",
    tags: ["Tracking", "Bookings", "Staff system", "Two warehouses"],
  },
  {
    name: "Super Drive Oil", kind: "Sales, stock & credit system",
    line: "Sales, stock and credit in one place. Every sale, payment and stock movement is recorded against the person who made it.",
    url: "https://super-drive-os.vercel.app", domain: "super-drive-os.vercel.app", shot: "/nino/superdrive.webp",
    tags: ["Live stock", "Cash and daily closing", "Credit control"],
  },
  {
    name: "Vegas Luxury Hotel", kind: "Hotel website & operations system",
    line: "The hotel's website, online booking and mobile-money payments — and the whole staff system behind it: reception, restaurant and room service, finance, stock and daily reports to the owner on WhatsApp.",
    url: "https://www.vegashoteltz.com", domain: "vegashoteltz.com", shot: "/nino/vegas.webp",
    tags: ["Booking engine", "Mobile money", "Staff system", "Reports"],
  },
  {
    name: "Swift Cargo", kind: "Sea freight · China → Tanzania",
    line: "Loose cargo and full containers from Guangzhou to Dar es Salaam — track a shipment, work out the CBM and see the price.",
    url: "https://www.swiftcargotz.com", domain: "swiftcargotz.com", shot: "/nino/swiftcargo.webp",
    tags: ["Tracking", "Price calculator"],
  },
  {
    name: "AiTransit Cargo", kind: "Air cargo · China → Zambia",
    line: "Air cargo to Lusaka with duty included, supplier payments in RMB and money exchange — one team on both ends of the route.",
    url: "https://ai-transit-rouge.vercel.app", domain: "ai-transit-rouge.vercel.app", shot: "/nino/aitransit.webp",
    tags: ["Tracking", "Payments"], code: `${GH}/AiTransit`,
  },
  {
    name: "EA Trade Link SIS", kind: "Education & business · China ↔ Tanzania",
    line: "Scholarships, visas, sourcing, factory visits and currency exchange — one platform for studying and doing business in China.",
    url: "https://www.eatradelink.com", domain: "eatradelink.com", shot: "/nino/eatradelink.webp",
    tags: ["Platform", "Accounts"], code: `${GH}/EA-Trade-link-SIS-`,
  },
  {
    name: "Hǎodeals", kind: "Online store",
    line: "Limited deals, in stock and delivered fast — browse by category, shop and check out.",
    url: "https://www.haodealtz.com", domain: "haodealtz.com", shot: "/nino/haodeals.webp",
    tags: ["E-commerce", "Checkout"],
  },
  {
    name: "HA GROUP", kind: "Engineering company",
    line: "Turnkey electrical and electro-mechanical projects for mining, manufacturing and commercial clients across Africa.",
    url: "https://hag-mancom.vercel.app", domain: "hag-mancom.vercel.app", shot: "/nino/hagroup.webp",
    tags: ["Company site"],
  },
  {
    name: "KOTES (T) Limited", kind: "ICT infrastructure",
    line: "Fibre networks, systems integration and 24/7 managed support for government and enterprise in Tanzania.",
    url: "https://kotes.vercel.app", domain: "kotes.vercel.app", shot: "/nino/kotes.webp",
    tags: ["Company site"],
  },
  {
    name: "ORA Pads", kind: "Social-impact brand",
    line: "Menstrual health, education and period dignity for every girl and woman across Tanzania.",
    url: "https://www.ora.co.tz", domain: "ora.co.tz", shot: "/nino/ora.webp",
    tags: ["Brand site", "Community"],
  },
  {
    name: "Hao Labs", kind: "Stock, settlement & commission system",
    line: "Every box that leaves the Lab is on the system — who took it, what came back, what is still owed, and what each rep has earned. We keep Tanzania stocked.",
    url: "https://hao-stock.vercel.app", domain: "hao-stock.vercel.app", shot: "/nino/haolabs.webp",
    tags: ["Stock control", "Settlements", "Commission", "Reports"],
  },
  {
    name: "Reckless Lab", kind: "Fashion label & store",
    line: "A laboratory where fashion rules are broken to make something alive.",
    url: "https://www.recklesslab.shop", domain: "recklesslab.shop", shot: "/nino/reckless.webp",
    tags: ["Store", "Brand"],
  },
];

/** Launching soon, and the code on GitHub. */
export const MORE: Project[] = [
  {
    name: "BlueWave Cargo", kind: "Sourcing & cargo · China → Tanzania", status: "soon",
    line: "Explore China's markets and factories, source products, plan a business visit and ship home from the Foshan warehouse.",
    url: "https://bluewave-cargo.vercel.app", domain: "bluewave-cargo.vercel.app", shot: "/nino/bluewave.webp",
    tags: ["Sourcing", "Cargo"],
  },
  {
    name: "Budgeta", kind: "Personal & business finance app",
    line: "Income, expenses, budgets, savings and debts in one place, with a financial health score. Mambo ya pesa.",
    url: `${GH}/Budgeta-App`, domain: "github.com/Casynino/Budgeta-App", tags: ["React", "Charts"], code: `${GH}/Budgeta-App`,
  },
  {
    name: "Power Popote", kind: "Powerbank rental platform",
    line: "Rent and return a powerbank by scanning a QR code — live rentals, M-Pesa payments, fees worked out automatically, an admin dashboard.",
    url: `${GH}/PowerPopote`, domain: "github.com/Casynino/PowerPopote", tags: ["QR", "M-Pesa", "Dashboard"], code: `${GH}/PowerPopote`,
  },
  {
    name: "OBTC", kind: "Procurement & logistics · China → Africa",
    line: "Wuhan OBTC's site: end-to-end sourcing, procurement and shipping for businesses in Africa.",
    url: `${GH}/OBTC-site`, domain: "github.com/Casynino/OBTC-site", tags: ["Company site"], code: `${GH}/OBTC-site`,
  },
];

export const EXPERTISE = [
  { icon: "Smartphone", label: "iOS & Android apps" },
  { icon: "Globe", label: "Web platforms" },
  { icon: "PenTool", label: "UI/UX design" },
  { icon: "LayoutDashboard", label: "Admin dashboards" },
  { icon: "Plug", label: "API integrations" },
  { icon: "CreditCard", label: "Online payments" },
  { icon: "MapPin", label: "Maps & location" },
  { icon: "Bot", label: "AI integration" },
  { icon: "Database", label: "Cloud & databases" },
  { icon: "Workflow", label: "Systems analysis" },
  { icon: "TrendingUp", label: "Business strategy" },
] as const;

export const STACK: { area: string; tools: string[] }[] = [
  { area: "Mobile", tools: ["React Native", "Flutter", "Swift"] },
  { area: "Web", tools: ["Next.js", "React", "TypeScript"] },
  { area: "Backend & data", tools: ["Node.js", "PostgreSQL", "Supabase", "Firebase"] },
  { area: "Payments & maps", tools: ["Stripe", "Mobile money", "Google Maps"] },
];

export const CONTACT = {
  email: "casmiry21@icloud.com",
  whatsapp: [
    { place: "Tanzania", shown: "+255 752 828 082", digits: "255752828082" },
    { place: "China", shown: "+86 155 2761 0603", digits: "8615527610603" },
  ],
};
