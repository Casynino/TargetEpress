/**
 * The public tracking page, checked against the real database.
 *
 * One rule is being tested here, in the owner's words: a customer must never
 * see "Ready for Pickup" for cargo that is missing, damaged or otherwise
 * unavailable. The rest of the checks exist because the two ways to break that
 * rule are silent — an open case the page does not read, and a staff note the
 * page reads too much of.
 *
 * Run with:  npx tsx --conditions=react-server prisma/verify-tracking-hold.ts
 * (the react-server condition is what lets a script import "server-only" code,
 * same as the other verify scripts here.)
 *
 * Part B mutates one shipment for about a second and puts it back in a finally.
 * There is no other way to prove the rule holds on a READY_FOR_PICKUP shipment
 * when no live shipment happens to be in that state today.
 */
import { prisma } from "../lib/prisma";
import { trackByCode } from "../lib/tracking";
import { PUBLIC_HOLD_TYPES } from "../lib/tracking-investigation";
import { EXCEPTION_OPEN_STATUSES, blocksPickup } from "../lib/constants";

let failures = 0;
function check(name: string, pass: boolean, detail = "") {
  console.log(`${pass ? "  ok  " : " FAIL "} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures += 1;
}

const openStatuses = [...EXCEPTION_OPEN_STATUSES];

async function main() {
  // ---------------------------------------------------------------------
  // Part A — every shipment in the database, as the public page renders it.
  // ---------------------------------------------------------------------
  const shipments = await prisma.shipment.findMany({
    select: {
      trackingNumber: true,
      status: true,
      exceptions: {
        select: {
          type: true,
          status: true,
          description: true,
          resolutionNote: true,
          raisedBy: { select: { name: true } },
          compensation: { select: { amount: true, note: true, paidAt: true } },
        },
      },
    },
  });

  const held: string[] = [];
  const wronglyCollectable: string[] = [];
  const wronglyLabelled: string[] = [];
  const timelineOvershot: string[] = [];
  const leaked: string[] = [];
  const falseAlarms: string[] = [];

  for (const shipment of shipments) {
    const blocking = shipment.exceptions.filter(
      (exception) =>
        PUBLIC_HOLD_TYPES.includes(exception.type) &&
        blocksPickup(exception.status)
    );

    const result = await trackByCode(shipment.trackingNumber);
    if (result.kind !== "shipment") {
      leaked.push(`${shipment.trackingNumber}: did not resolve`);
      continue;
    }

    if (blocking.length > 0) {
      held.push(shipment.trackingNumber);
      if (result.collectable) wronglyCollectable.push(shipment.trackingNumber);
      if (/ready for pickup/i.test(result.statusLabel)) {
        wronglyLabelled.push(`${shipment.trackingNumber}: "${result.statusLabel}"`);
      }
      const pickupStep = result.timeline.find(
        (step) => step.status === "READY_FOR_PICKUP"
      );
      if (pickupStep && (pickupStep.done || pickupStep.current || pickupStep.at)) {
        timelineOvershot.push(shipment.trackingNumber);
      }
    } else if (
      result.investigation &&
      result.investigation.blocksCollection
    ) {
      // The opposite failure: a paperwork case that strands good cargo.
      falseAlarms.push(shipment.trackingNumber);
    }

    // Nothing a member of staff typed, and no money figure, may appear in the
    // payload — including through a field added later by somebody else.
    const payload = JSON.stringify(result);
    for (const exception of shipment.exceptions) {
      const secrets = [
        exception.description,
        exception.resolutionNote,
        exception.raisedBy?.name,
        exception.compensation?.note,
        exception.compensation?.amount.toString(),
      ].filter((value): value is string => Boolean(value) && String(value).length > 3);

      for (const secret of secrets) {
        if (payload.includes(secret)) {
          leaked.push(`${shipment.trackingNumber}: "${secret.slice(0, 40)}"`);
        }
      }
    }
  }

  console.log(
    `\nScanned ${shipments.length} shipment(s); ${held.length} with a blocking case${
      held.length > 0 ? ` (${held.join(", ")})` : ""
    }.\n`
  );

  check(
    "no shipment with an open blocking case reports collectable",
    wronglyCollectable.length === 0,
    wronglyCollectable.join(", ")
  );
  check(
    'no held shipment is labelled "Ready for pickup"',
    wronglyLabelled.length === 0,
    wronglyLabelled.join(", ")
  );
  check(
    "the timeline of a held shipment does not run past arrival",
    timelineOvershot.length === 0,
    timelineOvershot.join(", ")
  );
  check(
    "a weight or batch dispute alone never holds cargo from its owner",
    falseAlarms.length === 0,
    falseAlarms.join(", ")
  );
  check(
    "no staff note, name or settlement amount reaches the public payload",
    leaked.length === 0,
    leaked.slice(0, 3).join(" | ")
  );

  // ---------------------------------------------------------------------
  // Part B — the case the rule was written for, proved end to end.
  //
  // Ready for pickup → a carton cannot be found → cargo found. The shipment and
  // the case are both put back at the end, whatever happens.
  // ---------------------------------------------------------------------
  const subject = await prisma.shipment.findFirst({
    where: {
      status: "RECEIVED_AT_DAR",
      exceptions: {
        none: {
          status: { in: openStatuses },
          type: { in: PUBLIC_HOLD_TYPES },
        },
      },
    },
    select: {
      id: true,
      trackingNumber: true,
      status: true,
      readyForPickup: true,
      batchId: true,
    },
  });

  if (!subject) {
    check("a shipment was available to run the pickup scenario on", false);
  } else {
    console.log(`\nScenario on ${subject.trackingNumber} (restored afterwards):`);
    let caseId: string | null = null;

    try {
      await prisma.shipment.update({
        where: { id: subject.id },
        data: { status: "READY_FOR_PICKUP", readyForPickup: new Date() },
      });

      const ready = await trackByCode(subject.trackingNumber);
      check(
        "baseline: a clean shipment at READY_FOR_PICKUP is collectable",
        ready.kind === "shipment" &&
          ready.collectable &&
          ready.investigation === null,
        ready.kind === "shipment" ? ready.statusLabel : ready.kind
      );

      const raised = await prisma.shipmentException.create({
        data: {
          shipmentId: subject.id,
          batchId: subject.batchId,
          type: "MISSING_SHIPMENT",
          status: "OPEN",
          description: "verify-tracking-hold: unable to locate cargo at pickup",
        },
        select: { id: true },
      });
      caseId = raised.id;

      const investigating = await trackByCode(subject.trackingNumber);
      check(
        "the same shipment stops being collectable the moment a case is open",
        investigating.kind === "shipment" && investigating.collectable === false,
        investigating.kind === "shipment"
          ? `collectable=${investigating.collectable}`
          : investigating.kind
      );
      check(
        'the customer is shown "Under investigation", not "Ready for pickup"',
        investigating.kind === "shipment" &&
          investigating.statusLabel === "Under investigation" &&
          investigating.investigation?.state === "UNDER_INVESTIGATION",
        investigating.kind === "shipment" ? investigating.statusLabel : ""
      );
      check(
        "the note does not tell them to come to the counter",
        investigating.kind === "shipment" &&
          !/bring your pickup note/i.test(investigating.collectionNote),
        investigating.kind === "shipment"
          ? investigating.collectionNote.slice(0, 60)
          : ""
      );
      check(
        "the description the warehouse typed is nowhere in the payload",
        !JSON.stringify(investigating).includes("unable to locate cargo")
      );

      // Compensation approved on the open case → "Compensation in progress".
      await prisma.shipmentException.update({
        where: { id: raised.id },
        data: { status: "COMPENSATION_APPROVED" },
      });
      const compensating = await trackByCode(subject.trackingNumber);
      check(
        'an approved settlement reads "Compensation in progress" and still blocks pickup',
        compensating.kind === "shipment" &&
          compensating.collectable === false &&
          compensating.investigation?.state === "COMPENSATION_IN_PROGRESS" &&
          compensating.statusLabel === "Compensation in progress",
        compensating.kind === "shipment" ? compensating.statusLabel : ""
      );

      // Cargo found → the case is finished and the cargo goes back to being
      // exactly what it was before anyone raised it.
      await prisma.shipmentException.update({
        where: { id: raised.id },
        data: { status: "CARGO_FOUND" },
      });
      const found = await trackByCode(subject.trackingNumber);
      check(
        "cargo found restores the shipment to Ready for pickup",
        found.kind === "shipment" &&
          found.collectable &&
          found.investigation === null &&
          found.statusLabel === "Ready for pickup",
        found.kind === "shipment" ? found.statusLabel : ""
      );
    } finally {
      if (caseId) {
        await prisma.shipmentException.delete({ where: { id: caseId } });
      }
      await prisma.shipment.update({
        where: { id: subject.id },
        data: { status: subject.status, readyForPickup: subject.readyForPickup },
      });
      console.log(`  (${subject.trackingNumber} restored to ${subject.status})`);
    }
  }

  console.log(
    `\n${failures === 0 ? "Public tracking tells the truth." : `${failures} rule(s) broken.`}`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
