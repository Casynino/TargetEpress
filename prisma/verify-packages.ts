/**
 * The package/QR rules, checked against the real database.
 *
 * These are the ones that cost money when they break: a duplicate QR sends a
 * box to the wrong customer, and a shipment whose package rows do not match its
 * declared count is a shortage nobody will notice until the counter.
 */
import { prisma } from "../lib/prisma";
import { parseQrPayload, packageQrPayload } from "../lib/qr";
import { packageProgress } from "../lib/packages";

let failures = 0;
function check(name: string, pass: boolean, detail = "") {
  console.log(`${pass ? "  ok  " : " FAIL "} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures += 1;
}

async function main() {
  const shipments = await prisma.shipment.findMany({
    select: {
      id: true,
      trackingNumber: true,
      packages: true,
      packageType: true,
      packageList: {
        select: {
          sequence: true,
          reference: true,
          qrToken: true,
          receivedAt: true,
          deliveredAt: true,
        },
        orderBy: { sequence: "asc" },
      },
    },
  });

  // 1. Every shipment has exactly as many packages as it says it has.
  const miscounted = shipments.filter(
    (s) => s.packageList.length !== Math.max(1, s.packages)
  );
  check(
    "every shipment has one package row per counted item",
    miscounted.length === 0,
    miscounted
      .slice(0, 3)
      .map((s) => `${s.trackingNumber}: ${s.packageList.length}≠${s.packages}`)
      .join(", ")
  );

  // 2. Sequences are 1..n with no gaps — "package 4 of 5" has to mean something.
  const badSequence = shipments.filter((s) =>
    s.packageList.some((pkg, index) => pkg.sequence !== index + 1)
  );
  check(
    "package numbers run 1..n with no gaps",
    badSequence.length === 0,
    badSequence.slice(0, 3).map((s) => s.trackingNumber).join(", ")
  );

  // 3. No QR token is ever shared. This is the one that misdelivers cargo.
  const tokens = shipments.flatMap((s) => s.packageList.map((p) => p.qrToken));
  check(
    "no two packages share a QR code",
    new Set(tokens).size === tokens.length,
    `${tokens.length} packages, ${new Set(tokens).size} distinct codes`
  );

  const refs = shipments.flatMap((s) => s.packageList.map((p) => p.reference));
  check(
    "no two packages share a printed reference",
    new Set(refs).size === refs.length
  );

  // 4. A package QR round-trips through the scanner parser.
  const sample = shipments.find((s) => s.packageList.length > 0)?.packageList[0];
  if (sample) {
    const parsed = parseQrPayload(packageQrPayload(sample.qrToken));
    check(
      "a printed package QR parses back as a package",
      parsed?.kind === "package" && parsed.token === sample.qrToken,
      sample.reference
    );
  }

  // 5. A shipment cannot be delivered while one of its packages is missing.
  const delivered = await prisma.shipment.findMany({
    where: { status: "DELIVERED" },
    select: {
      trackingNumber: true,
      packageType: true,
      packageList: {
        select: { sequence: true, receivedAt: true, deliveredAt: true },
      },
    },
  });
  const partial = delivered.filter(
    (s) => !packageProgress(s.packageList, s.packageType).complete
  );
  check(
    "nothing was delivered with packages still missing",
    partial.length === 0,
    partial.slice(0, 3).map((s) => s.trackingNumber).join(", ")
  );

  console.log(
    `\n${failures === 0 ? "All package rules hold." : `${failures} rule(s) broken.`}`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
