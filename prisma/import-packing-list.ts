/**
 * Imports a Guangzhou packing list (.xlsx) as one batch of real cargo.
 *
 *   npx tsx prisma/import-packing-list.ts "<file.xlsx>" --batch GZ/26-22 \
 *     --date 2026-06-17 [--replace]
 *
 * The sheet's shape, which this relies on:
 *   A  carton number, e.g. GZ/26-22-7 — set only on the FIRST row of a carton
 *   B  customer name
 *   C  item, Chinese
 *   D  item, English
 *   E  quantity (pieces)
 *   F  weight of this line, kg
 *   G  customer phone
 *   H  actual weight of the whole carton — first row of a carton only
 *   I  kuaidi (domestic courier) fee
 *
 * One row is one shipment: a single customer's goods. A carton consolidates
 * several customers, which is why cartonRef lives on the shipment rather than
 * the shipment being the carton.
 *
 * `--replace` clears existing operational data first (shipments, batches,
 * customers, money, history). Staff accounts, settings and the rate card are
 * never touched.
 *
 * The xlsx is parsed from its raw XML rather than via a spreadsheet library —
 * an .xlsx is a zip of XML, and this keeps a one-off import from adding a
 * dependency to the deployed app.
 */
import { execFileSync } from "child_process";
import { mkdtempSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { randomBytes } from "crypto";

import { PrismaClient, Prisma, type GoodsType } from "@prisma/client";

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Minimal xlsx reader
// ---------------------------------------------------------------------------

type Row = Record<string, string>;

function readSheet(file: string): Row[] {
  const dir = mkdtempSync(join(tmpdir(), "xlsx-"));
  execFileSync("unzip", ["-o", "-q", file, "-d", dir]);

  const strings: string[] = [];
  const sharedPath = join(dir, "xl/sharedStrings.xml");
  try {
    const shared = readFileSync(sharedPath, "utf8");
    for (const si of shared.split("<si>").slice(1)) {
      const text = [...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
        .map((m) => m[1])
        .join("");
      strings.push(decodeEntities(text));
    }
  } catch {
    // A sheet with no shared strings is legal; inline values still parse.
  }

  const sheet = readFileSync(join(dir, "xl/worksheets/sheet1.xml"), "utf8");
  const rows: Record<number, Row> = {};

  // Cells come in two shapes and both must be handled: `<c .../>` for an empty
  // cell and `<c ...>…</c>` for one with a value. Matching only the second form
  // lets the lazy body run past an empty cell and swallow its neighbours.
  for (const cell of sheet.matchAll(
    /<c\s+r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g
  )) {
    const [, col, rowNum, attrs, rawBody] = cell;
    const body = rawBody ?? "";
    const isShared = /t="s"/.test(attrs);
    const inline = body.match(/<is>([\s\S]*?)<\/is>/);

    let value = "";
    if (inline) {
      value = [...inline[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
        .map((m) => m[1])
        .join("");
      value = decodeEntities(value);
    } else {
      const v = body.match(/<v>([\s\S]*?)<\/v>/);
      if (v) value = isShared ? (strings[Number(v[1])] ?? "") : v[1];
    }

    value = value.trim();
    if (!value) continue;
    (rows[Number(rowNum)] ??= {})[col] = value;
  }

  return Object.keys(rows)
    .map(Number)
    .sort((a, b) => a - b)
    .map((n) => ({ __row: String(n), ...rows[n] }));
}

function decodeEntities(input: string) {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// ---------------------------------------------------------------------------
// Domain mapping
// ---------------------------------------------------------------------------

/**
 * Keyword → goods type, checked in order. Matched against the Chinese and
 * English item text together, so either language classifies the row.
 *
 * Anything unmatched becomes GENERAL_MERCHANDISE and keeps its original text in
 * the description — a wrong specific category would mis-price the shipment,
 * whereas "general" is the honest default.
 */
const GOODS_RULES: [RegExp, GoodsType][] = [
  [/手机壳|phone case|cover/i, "PHONE_ACCESSORIES"],
  [
    /充电器|charger|芯片|chip|内存卡|memory card|u盘|u disk|路由器|router|遥控器|remote|开关面板|switch panel|线缆|cable|lcd|打印配件|print|电子|electronic/i,
    "ELECTRONICS",
  ],
  [/鞋|shoe|靴|boot|鞋带|shoelace|鞋垫|insole/i, "FOOTWEAR"],
  [/衣服|clothes|clothing|帽子|hat|模特|model|袜|sock|裤|布|fabric|textile/i, "TEXTILES_GARMENTS"],
  [/假发|wig|化妆|cosmetic|头发|hair/i, "COSMETICS"],
  [/仪表盘|dashboard|活塞|piston|格栅|grille|大修包|overhaul|汽车|auto part/i, "AUTO_SPARES"],
  [/工具箱|tool|钻头|drill|机器|machine|练习器|trainer|轴承|bearing/i, "MACHINERY_PARTS"],
  [/本子|book|台历|calendar|标签架|label holder|文具|stationer/i, "STATIONERY"],
  [/置物架|shelf|家具|furniture|沙发|sofa/i, "FURNITURE_FITTINGS"],
  [/空心胶囊|capsule|医疗|medical|药|drug/i, "MEDICAL_SUPPLIES"],
];

function classify(cn: string, en: string): GoodsType {
  const text = `${cn} ${en}`;
  for (const [pattern, type] of GOODS_RULES) {
    if (pattern.test(text)) return type;
  }
  return "GENERAL_MERCHANDISE";
}

/** Tanzanian numbers arrive as 0XXXXXXXXX on these sheets. */
function normalisePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length < 9) return null;
  if (digits.startsWith("255")) return `+${digits}`;
  if (digits.startsWith("0")) return `+255${digits.slice(1)}`;
  if (digits.length === 9) return `+255${digits}`;
  return `+${digits}`;
}

/** Bilingual description; the China desk works in Chinese, Dar in English. */
function describe(cn: string, en: string) {
  const english = en.replace(/\s+/g, " ").trim();
  const chinese = cn.replace(/\s+/g, " ").trim();
  if (english && chinese) return `${capitalise(english)} (${chinese})`;
  return capitalise(english) || chinese || "Unspecified goods";
}

function capitalise(text: string) {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

const pad = (n: number, width = 6) => String(n).padStart(width, "0");
const qrToken = () => `TXQ${randomBytes(20).toString("base64url")}`;

// ---------------------------------------------------------------------------

type Parsed = {
  row: number;
  cartonRef: string;
  name: string;
  cn: string;
  en: string;
  quantity: number;
  weightKg: number;
  phone: string | null;
  cartonWeightKg: number | null;
};

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  const flag = (name: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const replace = args.includes("--replace");

  if (!file) {
    console.error(
      'Usage: npx tsx prisma/import-packing-list.ts "<file.xlsx>" --batch GZ/26-22 --date 2026-06-17 [--replace]'
    );
    process.exit(1);
  }

  const batchNumber = flag("batch") ?? "IMPORTED";
  const dateArg = flag("date");
  const packedAt = dateArg ? new Date(`${dateArg}T09:00:00Z`) : new Date();
  if (Number.isNaN(packedAt.getTime())) {
    throw new Error(`--date "${dateArg}" is not a valid date.`);
  }

  // ------------------------------------------------------------------ parse
  const raw = readSheet(file);
  const parsed: Parsed[] = [];
  let currentCarton = "";
  let currentCartonWeight: number | null = null;

  for (const row of raw) {
    const rowNum = Number(row.__row);
    if (rowNum < 3) continue; // title + header

    // Carton number appears once, on the carton's first line.
    if (row.A) {
      currentCarton = row.A;
      currentCartonWeight = row.H ? Number(row.H) : null;
    }

    const weight = Number(row.F);
    if (!row.F || Number.isNaN(weight)) continue; // not a cargo line

    parsed.push({
      row: rowNum,
      cartonRef: currentCarton,
      name: (row.B ?? "").replace(/\s+/g, " ").trim(),
      cn: row.C ?? "",
      en: row.D ?? "",
      quantity: Math.max(1, Math.round(Number(row.E) || 1)),
      weightKg: weight,
      phone: normalisePhone(row.G ?? ""),
      cartonWeightKg: row.A ? currentCartonWeight : null,
    });
  }

  const cartons = [...new Set(parsed.map((p) => p.cartonRef).filter(Boolean))];
  const lineWeight = parsed.reduce((sum, p) => sum + p.weightKg, 0);
  const cartonWeight = parsed.reduce((sum, p) => sum + (p.cartonWeightKg ?? 0), 0);
  const unnamed = parsed.filter((p) => !p.name).length;
  const noPhone = parsed.filter((p) => !p.phone).length;

  console.log(`Parsed ${parsed.length} cargo lines across ${cartons.length} cartons`);
  console.log(
    `  line weight ${lineWeight.toFixed(1)} kg · carton actual ${cartonWeight.toFixed(1)} kg`
  );
  console.log(`  ${unnamed} line(s) with no customer name, ${noPhone} with no phone`);

  // --------------------------------------------------------------- staff ref
  const china = await prisma.user.findFirst({
    where: { role: "CHINA_WAREHOUSE", active: true },
    select: { id: true, email: true },
  });
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true, email: true },
  });
  if (!china) {
    throw new Error("No active China Warehouse user. Run `npm run db:seed` first.");
  }

  // ----------------------------------------------------------------- replace
  if (replace) {
    // Order matters: children before parents. Users, Settings and RateCard are
    // deliberately left alone — they are configuration, not cargo.
    const cleared = await prisma.$transaction([
      prisma.deliveryRecord.deleteMany(),
      prisma.pickupNote.deleteMany(),
      prisma.receipt.deleteMany(),
      prisma.payment.deleteMany(),
      prisma.invoice.deleteMany(),
      prisma.batchVerification.deleteMany(),
      prisma.shipmentException.deleteMany(),
      prisma.shipmentPhoto.deleteMany(),
      prisma.shipmentStatusHistory.deleteMany(),
      prisma.shipment.deleteMany(),
      prisma.batch.deleteMany(),
      prisma.customer.deleteMany(),
      prisma.auditLog.deleteMany(),
      // Restart document numbering so the imported cargo reads TX-000001 up.
      prisma.counter.deleteMany(),
    ]);
    console.log(
      `Cleared previous data: ${cleared
        .map((c) => c.count)
        .reduce((a, b) => a + b, 0)} row(s) removed.`
    );
  }

  // --------------------------------------------------------------- customers
  // A name that carries a phone anywhere on the sheet owns that phone, so
  // lines from the same person that happen to omit it still land together.
  const phoneByName = new Map<string, string>();
  for (const line of parsed) {
    if (line.name && line.phone && !phoneByName.has(line.name.toLowerCase())) {
      phoneByName.set(line.name.toLowerCase(), line.phone);
    }
  }

  const keyFor = (line: Parsed) => {
    if (!line.name) return `carton:${line.cartonRef}`;
    const phone = line.phone ?? phoneByName.get(line.name.toLowerCase()) ?? null;
    return phone ? `phone:${phone}` : `name:${line.name.toLowerCase()}`;
  };

  const customerIds = new Map<string, string>();
  let customerSeq = 0;

  for (const line of parsed) {
    const key = keyFor(line);
    if (customerIds.has(key)) continue;

    const phone = line.name
      ? (line.phone ?? phoneByName.get(line.name.toLowerCase()) ?? null)
      : null;

    const name = line.name || `Unidentified — carton ${line.cartonRef}`;

    const customer = await prisma.customer.create({
      data: {
        code: `CUS-${pad(++customerSeq)}`,
        name,
        phone,
        city: "Dar es Salaam",
        notes: line.name
          ? phone
            ? null
            : "No phone number on the Guangzhou packing list — confirm before the cargo lands."
          : `Packing list row ${line.row} had no customer name. Identify the owner of carton ${line.cartonRef} before release.`,
        createdById: china.id,
      },
    });

    customerIds.set(key, customer.id);
  }

  console.log(`Created ${customerIds.size} customer(s).`);

  // ------------------------------------------------------------------- batch
  const batch = await prisma.batch.create({
    data: {
      batchNumber,
      origin: "GUANGZHOU",
      // Received and packed in China, not yet flown.
      status: "OPEN",
      createdById: china.id,
      createdAt: packedAt,
      notes: [
        `Imported from the Guangzhou packing list, packed ${packedAt.toISOString().slice(0, 10)}.`,
        `${cartons.length} carton(s), ${parsed.length} shipment(s).`,
        `Line weights total ${lineWeight.toFixed(1)} kg; carton actual weights total ${cartonWeight.toFixed(1)} kg.`,
        Math.abs(lineWeight - cartonWeight) > 0.5
          ? `Discrepancy of ${Math.abs(lineWeight - cartonWeight).toFixed(1)} kg between line and carton weights — check before invoicing.`
          : null,
        unnamed > 0 ? `${unnamed} line(s) had no customer name.` : null,
        noPhone > 0 ? `${noPhone} line(s) had no phone number.` : null,
      ]
        .filter(Boolean)
        .join(" "),
    },
  });

  console.log(`Created batch ${batch.batchNumber}.`);

  // --------------------------------------------------------------- shipments
  let shipmentSeq = 0;
  const created: string[] = [];

  for (const line of parsed) {
    const customerId = customerIds.get(keyFor(line))!;
    const trackingNumber = `TX-${pad(++shipmentSeq)}`;

    const notes: string[] = [`Carton ${line.cartonRef}. Packing list row ${line.row}.`];
    if (line.cartonWeightKg) {
      notes.push(`Carton actual weight ${line.cartonWeightKg} kg.`);
    }
    if (!line.phone) notes.push("No phone on the packing list.");
    if (!line.name) notes.push("No customer name on the packing list.");

    const shipment = await prisma.shipment.create({
      data: {
        trackingNumber,
        qrToken: qrToken(),
        customerId,
        goodsType: classify(line.cn, line.en),
        description: describe(line.cn, line.en),
        packages: line.quantity,
        weightKg: new Prisma.Decimal(line.weightKg),
        origin: "GUANGZHOU",
        batchId: batch.id,
        cartonRef: line.cartonRef || null,
        status: "READY_TO_DEPART",
        registeredAt: packedAt,
        createdAt: packedAt,
        createdById: china.id,
        internalNotes: notes.join(" "),
      },
    });

    await prisma.shipmentStatusHistory.create({
      data: {
        shipmentId: shipment.id,
        toStatus: "READY_TO_DEPART",
        location: "Guangzhou, China",
        note: `Received and packed at the China warehouse in carton ${line.cartonRef}.`,
        actorId: china.id,
        createdAt: packedAt,
      },
    });

    created.push(trackingNumber);
  }

  // Keep the counters consistent with what was just minted, so the next
  // shipment registered in the UI continues the sequence.
  await prisma.counter.upsert({
    where: { key: "shipment" },
    create: { key: "shipment", value: shipmentSeq },
    update: { value: shipmentSeq },
  });
  await prisma.counter.upsert({
    where: { key: "customer" },
    create: { key: "customer", value: customerSeq },
    update: { value: customerSeq },
  });

  await prisma.auditLog.create({
    data: {
      actorId: admin?.id ?? china.id,
      actorEmail: admin?.email ?? china.email,
      actorRole: admin ? "ADMIN" : "CHINA_WAREHOUSE",
      action: "batch.import",
      entity: "Batch",
      entityId: batch.id,
      summary: `Imported ${created.length} shipment(s) into ${batch.batchNumber} from the Guangzhou packing list`,
      metadata: {
        cartons: cartons.length,
        lineWeightKg: Number(lineWeight.toFixed(1)),
        cartonWeightKg: Number(cartonWeight.toFixed(1)),
        unnamedLines: unnamed,
        linesWithoutPhone: noPhone,
      },
      createdAt: packedAt,
    },
  });

  console.log(
    `\nImported ${created.length} shipment(s): ${created[0]} … ${created[created.length - 1]}`
  );
  console.log(`Batch ${batch.batchNumber} is OPEN and ready to seal.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
