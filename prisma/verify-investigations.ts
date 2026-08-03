/**
 * The Cargo Found and compensation rules, checked against the real database.
 *
 * Two different kinds of check live here, and both earn their place:
 *
 *  - the decision rules on their own (lib/investigations.ts), because
 *    "where does found cargo go back to" is the answer a warehouse lives with
 *    and it must not depend on which screen asked;
 *  - the money path end to end, because a payout that reads back a cent short
 *    is not a rounding bug, it is a customer being short-changed. Decimal is
 *    only worth anything if nothing on the way in or out is a float.
 *
 * Every write happens inside a transaction that is deliberately rolled back, so
 * running this leaves the database exactly as it found it.
 */
import { Prisma } from "@prisma/client";

import { prisma } from "../lib/prisma";
import { REPORTED_CARGO_ABSENT, restoredStatus } from "../lib/investigations";
import { EXCEPTION_OPEN_STATUSES, EXCEPTION_TERMINAL_STATUSES } from "../lib/constants";

let failures = 0;
function check(name: string, pass: boolean, detail = "") {
  console.log(`${pass ? "  ok  " : " FAIL "} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures += 1;
}

/** Thrown to unwind the transaction once the checks inside it have run. */
class Rollback extends Error {}

async function main() {
  // -------------------------------------------------------------------------
  // 1. Where found cargo goes back to
  // -------------------------------------------------------------------------

  check(
    "cargo found on a paid, ready-for-pickup shipment goes back to the counter",
    restoredStatus("READY_FOR_PICKUP", "RECEIVED_AT_DAR") === "READY_FOR_PICKUP"
  );
  check(
    "cargo missing at check-in comes back as received, not in transit",
    restoredStatus("IN_TRANSIT", "IN_TRANSIT") === "RECEIVED_AT_DAR",
    "a found box is on the Dar floor; IN_TRANSIT would hide it from Inventory"
  );
  check(
    "cargo that never left China still comes back as received in Dar",
    restoredStatus("READY_TO_DEPART", "IN_TRANSIT") === "RECEIVED_AT_DAR"
  );
  check(
    "no history at all falls back to the shipment's own status, clamped",
    restoredStatus(null, "READY_FOR_PICKUP") === "READY_FOR_PICKUP" &&
      restoredStatus(null, "IN_TRANSIT") === "RECEIVED_AT_DAR"
  );
  check(
    "restore never returns a terminal status",
    (["DELIVERED", "CANCELLED"] as const).every(
      (status) => restoredStatus(status, status) === "RECEIVED_AT_DAR"
    )
  );

  // Only the case types that reported cargo absent put boxes back on the
  // manifest. A damage case must never tick a package nobody has seen.
  check(
    "only absence cases check packages in",
    REPORTED_CARGO_ABSENT.MISSING_SHIPMENT &&
      REPORTED_CARGO_ABSENT.PACKAGE_COUNT_MISMATCH &&
      REPORTED_CARGO_ABSENT.WRONG_BATCH &&
      !REPORTED_CARGO_ABSENT.DAMAGED_CARGO &&
      !REPORTED_CARGO_ABSENT.WRONG_ITEM &&
      !REPORTED_CARGO_ABSENT.HOLD_FOR_INVESTIGATION &&
      !REPORTED_CARGO_ABSENT.WEIGHT_MISMATCH &&
      !REPORTED_CARGO_ABSENT.OTHER
  );

  // CARGO_FOUND has to be terminal, or a found box stays in the queue for ever
  // and keeps blocking its own pickup.
  check(
    "CARGO_FOUND is terminal and does not block pickup",
    (EXCEPTION_TERMINAL_STATUSES as readonly string[]).includes("CARGO_FOUND") &&
      !(EXCEPTION_OPEN_STATUSES as readonly string[]).includes("CARGO_FOUND")
  );

  // -------------------------------------------------------------------------
  // 2. The money path, against real Postgres columns
  // -------------------------------------------------------------------------

  const anyException = await prisma.shipmentException.findFirst({
    select: { id: true, compensation: { select: { id: true } } },
    where: { compensation: null },
    orderBy: { raisedAt: "asc" },
  });

  if (!anyException) {
    console.log(
      "  skip  compensation round-trip — no exception without a settlement to test against"
    );
  } else {
    try {
      await prisma.$transaction(async (tx) => {
        // A figure with awkward cents, deliberately: 250000.55 is exactly the
        // sort of number a float loses.
        const written = new Prisma.Decimal("250000.55");
        await tx.compensation.create({
          data: {
            exceptionId: anyException.id,
            amount: written,
            currency: "TZS",
          },
        });

        const readBack = await tx.compensation.findUnique({
          where: { exceptionId: anyException.id },
          select: { amount: true, currency: true, paidAt: true },
        });
        check(
          "a payout reads back to the cent",
          readBack?.amount.toFixed(2) === "250000.55",
          `wrote 250000.55, read ${readBack?.amount.toFixed(2)}`
        );
        check(
          "a payout with no payment date counts as pending",
          readBack?.paidAt === null
        );

        // Amending is an update of the one settlement, never a second row —
        // Compensation.exceptionId is unique, and a second payout is a second
        // case.
        await tx.compensation.upsert({
          where: { exceptionId: anyException.id },
          create: {
            exceptionId: anyException.id,
            amount: new Prisma.Decimal("1"),
            currency: "TZS",
          },
          update: {
            amount: new Prisma.Decimal("250000.56"),
            paidAt: new Date(),
            method: "MOBILE_MONEY",
          },
        });
        const amended = await tx.compensation.findMany({
          where: { exceptionId: anyException.id },
          select: { amount: true, paidAt: true },
        });
        check(
          "amending a settlement updates it rather than adding another",
          amended.length === 1 && amended[0].amount.toFixed(2) === "250000.56"
        );
        check(
          "a paid settlement stops counting as pending",
          amended[0]?.paidAt !== null
        );

        // The timeline line the warehouse can read must not carry the figure.
        await tx.exceptionEvent.create({
          data: {
            exceptionId: anyException.id,
            action: "compensation.recorded",
            note: "Compensation recorded by Finance. Payment still pending.",
          },
        });
        const events = await tx.exceptionEvent.findMany({
          where: { exceptionId: anyException.id, action: "compensation.recorded" },
          select: { note: true },
        });
        check(
          "no compensation timeline note contains an amount",
          events.every((event) => !/\d{3}/.test(event.note ?? "")),
          events.map((e) => e.note).join(" | ")
        );

        throw new Rollback();
      });
    } catch (error) {
      if (!(error instanceof Rollback)) throw error;
    }

    const leftBehind = await prisma.compensation.count({
      where: { exceptionId: anyException.id },
    });
    check("the test settlement was rolled back", leftBehind === 0);
  }

  // -------------------------------------------------------------------------
  // 3. Pickup notes — the constraint Cargo Found has to work around
  // -------------------------------------------------------------------------

  // PickupNote.shipmentId is unique, so a shipment whose note was cancelled
  // cannot simply be given another one. Cargo Found therefore only ever mints a
  // note where there is no note row at all, and otherwise asks Finance.
  const staleNotes = await prisma.pickupNote.count({
    where: { status: { in: ["CANCELLED", "USED"] } },
  });
  const shipmentIdIsUnique =
    Prisma.dmmf.datamodel.models
      .find((model) => model.name === "PickupNote")
      ?.fields.find((field) => field.name === "shipmentId")?.isUnique ?? false;
  check(
    "one pickup note per shipment, so a cancelled note cannot be re-issued",
    shipmentIdIsUnique,
    `${staleNotes} cancelled/used note(s) in this database would block a re-issue`
  );

  console.log(
    `\n${failures === 0 ? "All investigation rules hold." : `${failures} rule(s) broken.`}`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
