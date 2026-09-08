"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { t } from "@/lib/i18n";
import { nextCombinationReference } from "@/lib/ids";
import { prisma } from "@/lib/prisma";
import { canAmendCargo, cargoCustody, COMBINABLE_STATUSES } from "@/lib/rbac";
import { authorize } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";

/**
 * SEVERAL BOXES TAPED INTO ONE, WITHOUT LOSING ANY OF THEM.
 *
 * A customer's cargo comes in as three boxes and the warehouse packs them into
 * one carton. Guangzhou does it before the flight; Dar does it after one, when
 * boxes are repacked on the floor. It is the same action either way — only the
 * screen that offers it differs.
 *
 * WHAT THIS WRITES: one PackageCombination row and a pointer on each box. That
 * is all.
 *
 * WHAT IT MUST NEVER WRITE, and the reason the feature is shaped this way. A
 * consignment is priced at Dar check-in from Shipment.weightKg and
 * Shipment.packages. The manifest totals those same two columns, the signed
 * batch statement freezes them, and the per-item rate multiplies by the second.
 * So a combination that minted a package row, or moved either figure, would
 * inflate the manifest, the statement and the price at once — and re-pricing a
 * customer's cargo because somebody taped two boxes together is exactly what
 * the owner ruled out. This owns no count and no weight that any total reads,
 * which is what makes it impossible for it to double-count anywhere.
 *
 * NOT MERGE PAYMENT. That puts several charges into one payment and lives in
 * PaymentAllocation. This puts several boxes into one parcel. A customer can
 * have both at once and neither knows the other exists.
 */

const schema = z.object({
  /**
   * WHAT THE DESK PICKED, EITHER WAY ROUND.
   *
   * The floor's own lists are lists of CONSIGNMENTS — one row per tracking
   * number, which for most cargo is one box — so that is what a warehouse
   * ticks, and `shipmentIds` combines every live box of each. A screen that
   * lists individual boxes sends `packageIds` instead. Both end up at the same
   * set of Package rows, which is the only thing this feature acts on.
   */
  packageIds: z.string().optional(),
  shipmentIds: z.string().optional(),
  /**
   * What the desk wrote on the carton, when they weighed it. Optional, and
   * read by nobody but the floor: see the model's own note.
   */
  statedWeightKg: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? Number(v) : null))
    .refine(
      (v) => v === null || (Number.isFinite(v) && v >= 0 && v <= 100_000),
      "That weight is not a figure a carton could be."
    ),
  note: z.string().trim().max(300, "Keep the note under 300 characters.").optional(),
});

export async function combinePackages(
  _prev: ActionResult<{ reference: string; packages: number }> | undefined,
  formData: FormData
): Promise<ActionResult<{ reference: string; packages: number }>> {
  const locale = await viewerLocale();
  try {
    /*
      The verb both warehouses already hold. Combining amends the physical
      record of cargo the desk is holding; it is not a new department and does
      not need a new key. Which of the two floors may act on a given box is
      decided by custody, below.
    */
    const user = await authorize("shipment.edit");
    const parsed = schema.safeParse(
      Object.fromEntries(formData) as Record<string, string>
    );
    if (!parsed.success) {
      return fail(t(locale, parsed.error.issues[0]?.message ?? "That is not valid."));
    }
    const input = parsed.data;
    const list = (v: string | undefined) =>
      Array.from(new Set((v ?? "").split(",").map((s) => s.trim()).filter(Boolean)));
    const pickedPackages = list(input.packageIds);
    const pickedShipments = list(input.shipmentIds);
    if (pickedPackages.length === 0 && pickedShipments.length === 0) {
      return fail(t(locale, "Pick the packages to combine."));
    }

    const result = await prisma.$transaction(async (tx) => {
      /*
        A consignment's boxes, when the desk ticked consignments.

        Only the ones that are not already in a carton: re-combining a
        consignment that has one box loose and two taped together should take
        the loose one, not refuse the whole row.
      */
      const fromShipments = pickedShipments.length
        ? await tx.package.findMany({
            where: { shipmentId: { in: pickedShipments }, combinationId: null },
            select: { id: true },
          })
        : [];
      const ids = Array.from(
        new Set([...pickedPackages, ...fromShipments.map((p) => p.id)])
      );
      if (ids.length < 2) {
        throw new Error("Pick at least two packages to combine into one.");
      }
      /*
        Read the boxes THROUGH their consignments, and ask for deletedAt by
        name.

        The client filters deleted cargo on top-level shipment reads only. This
        query starts at the package, so a box belonging to a deleted
        consignment comes back with no filter and no error — and would then
        carry a reference and a QR into a carton, breaking the rule that
        deleted cargo appears nowhere but the delete history.
      */
      const boxes = await tx.package.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          reference: true,
          sequence: true,
          weightKg: true,
          deliveredAt: true,
          combinationId: true,
          shipment: {
            select: {
              id: true,
              trackingNumber: true,
              status: true,
              customerId: true,
              deletedAt: true,
              batchId: true,
              customer: { select: { name: true } },
            },
          },
        },
      });

      if (boxes.length !== ids.length) {
        throw new Error(
          "One of those packages no longer exists. Reload the page and pick again."
        );
      }
      for (const box of boxes) {
        if (box.shipment.deletedAt !== null) {
          throw new Error(
            "One of those packages belongs to cargo that has been deleted."
          );
        }
      }

      /*
        THE SAME-CUSTOMER RULE.

        Two people's boxes must never be taped together — the carton would be
        one parcel that two customers can each claim, and there is no honest way
        to release it. Refused before anything is written, and the model carries
        the rule too so no future writer can produce one by accident.
      */
      const customerIds = new Set(boxes.map((b) => b.shipment.customerId));
      if (customerIds.size > 1) {
        throw new Error(
          "Those packages belong to different customers. Only one customer's packages can be combined."
        );
      }

      for (const box of boxes) {
        if (box.combinationId !== null) {
          throw new Error(
            `${box.reference} is already part of a combined package. Undo that one first.`
          );
        }
        if (box.deliveredAt !== null) {
          throw new Error(`${box.reference} has already been handed over.`);
        }
        if (!COMBINABLE_STATUSES.includes(box.shipment.status)) {
          throw new Error(
            `${box.shipment.trackingNumber} cannot be combined while it is ${box.shipment.status.toLowerCase().replace(/_/g, " ")}. Packages are combined on the Guangzhou shelf or on the Dar floor.`
          );
        }
        /* The same custody pair every other amendment uses, with the same two
           sentences — a door that opens on a wider rule than the action behind
           it is a form that refuses to save. */
        if (!canAmendCargo(user.role, box.shipment.status)) {
          throw new Error(
            cargoCustody(box.shipment.status) === "LANDED"
              ? "This cargo has landed in Dar. Only the Dar warehouse, a manager or the owner can change it now."
              : "This cargo has not landed in Dar yet. Only Guangzhou, a manager or the owner can change it now."
          );
        }
      }

      /*
        Which floor this is, taken from the cargo rather than from the reader.

        The statuses are already checked to be one of the two, and a selection
        cannot mix them: a box on Guangzhou's shelf and a box on Dar's floor are
        not in the same room, so they cannot have been taped together.
      */
      const stages = new Set(
        boxes.map((b) =>
          b.shipment.status === "READY_TO_DEPART" ? "CHINA" : "DAR"
        )
      );
      if (stages.size > 1) {
        throw new Error(
          "Those packages are not in the same warehouse, so they cannot have been packed together."
        );
      }
      const stage = [...stages][0] as "CHINA" | "DAR";

      /*
        ONE CARTON CANNOT BE ON TWO FLIGHTS.

        Guangzhou tapes boxes together before departure, and the manifest the
        forwarder signs is per flight. Boxes from two batches in one carton is
        physically impossible and would leave one flight's manifest expecting a
        box that is taped inside another's.
      */
      if (stage === "CHINA") {
        const batches = new Set(boxes.map((b) => b.shipment.batchId ?? "none"));
        if (batches.size > 1) {
          throw new Error(
            "Those packages are loading onto different flights, so they cannot be packed into one carton."
          );
        }
      }

      const reference = await nextCombinationReference(tx);

      const combination = await tx.packageCombination.create({
        data: {
          reference,
          customerId: boxes[0]!.shipment.customerId,
          stage,
          statedWeightKg: input.statedWeightKg,
          note: input.note || null,
          combinedById: user.id,
          combinedByName: user.name ?? user.email ?? null,
        },
        select: { id: true, reference: true },
      });

      /*
        The claim: every box must still be uncombined at the moment of writing.
        Two desks taping the same box into two cartons at once is the race this
        closes — the second finds fewer rows than it asked for and the whole
        transaction unwinds, carton and all.
      */
      const claimed = await tx.package.updateMany({
        where: { id: { in: ids }, combinationId: null },
        data: { combinationId: combination.id },
      });
      if (claimed.count !== ids.length) {
        throw new Error(
          "One of those packages was combined a moment ago. Reload the page and look again."
        );
      }

      /*
        THE FLOOR'S OWN TIMELINE, one line per consignment involved.

        A no-op transition — nothing moved, the status is unchanged — which is
        the same shape an investigation note uses. It is on the cargo page a
        warehouse actually reads, which the audit log is not.
      */
      const refs = boxes.map((b) => b.reference).sort();
      const summed =
        Math.round(
          boxes.reduce((kg, b) => kg + Number(b.weightKg ?? 0), 0) * 1000
        ) / 1000;
      const shownKg = input.statedWeightKg ?? (summed > 0 ? summed : null);
      const where = stage === "CHINA" ? "Guangzhou warehouse" : "Dar es Salaam warehouse";

      const shipmentIds = Array.from(new Set(boxes.map((b) => b.shipment.id)));
      for (const shipmentId of shipmentIds) {
        const shipment = boxes.find((b) => b.shipment.id === shipmentId)!.shipment;
        await tx.shipmentStatusHistory.create({
          data: {
            shipmentId,
            fromStatus: shipment.status,
            toStatus: shipment.status,
            location: where,
            note:
              `Packages combined — ${refs.join(" + ")} packed into ${reference}` +
              (shownKg === null ? "" : `, ${shownKg} kg`) +
              "." +
              (input.note ? ` ${input.note}` : ""),
            actorId: user.id,
          },
        });
      }

      await recordAudit(
        {
          actor: user,
          action: "package.combine",
          entity: "PackageCombination",
          entityId: combination.id,
          summary:
            `${reference}: ${refs.join(" + ")} packed into one carton for ` +
            `${boxes[0]!.shipment.customer.name}` +
            (shownKg === null ? "" : `, ${shownKg} kg`),
          metadata: {
            reference,
            stage,
            customer: boxes[0]!.shipment.customer.name,
            packages: refs,
            trackingNumbers: Array.from(
              new Set(boxes.map((b) => b.shipment.trackingNumber))
            ).sort(),
            /* Both figures, because they answer different questions: what the
               boxes weighed on their own, and what the desk wrote on the
               carton. Neither is a price. */
            summedWeightKg: summed > 0 ? summed : null,
            statedWeightKg: input.statedWeightKg,
            note: input.note ?? null,
          },
        },
        tx
      );

      return {
        reference: combination.reference,
        packages: boxes.length,
        trackingNumbers: shipmentIds,
      };
    });

    revalidatePath("/app/inventory");
    revalidatePath("/app/cargo");
    revalidatePath("/app/batches");
    revalidatePath("/app/shipments");
    return ok({ reference: result.reference, packages: result.packages });
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}

/**
 * Opening the carton again.
 *
 * The boxes were untaped, or somebody combined the wrong ones. The combination
 * row is kept and stamped rather than deleted, so "these three were once one
 * carton" stays answerable — the same habit the ledger has with a reversing
 * line. The boxes go back to standing on their own, which they never stopped
 * doing as far as every count and every price is concerned.
 */
export async function undoCombination(
  _prev: ActionResult<{ reference: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ reference: string }>> {
  const locale = await viewerLocale();
  try {
    const user = await authorize("shipment.edit");
    const id = String(formData.get("combinationId") ?? "").trim();
    const reason = String(formData.get("reason") ?? "").trim();
    if (!id) return fail(t(locale, "That combined package no longer exists."));

    const result = await prisma.$transaction(async (tx) => {
      const combination = await tx.packageCombination.findUnique({
        where: { id },
        select: {
          id: true,
          reference: true,
          undoneAt: true,
          members: {
            select: {
              reference: true,
              shipment: {
                select: { id: true, status: true, trackingNumber: true },
              },
            },
          },
        },
      });
      if (!combination) throw new Error("That combined package no longer exists.");
      if (combination.undoneAt !== null) {
        throw new Error("That combined package has already been opened again.");
      }
      for (const member of combination.members) {
        if (!canAmendCargo(user.role, member.shipment.status)) {
          throw new Error(
            cargoCustody(member.shipment.status) === "LANDED"
              ? "This cargo has landed in Dar. Only the Dar warehouse, a manager or the owner can change it now."
              : "This cargo has not landed in Dar yet. Only Guangzhou, a manager or the owner can change it now."
          );
        }
      }

      /* Stamped, not deleted, and only if nobody has stamped it already. */
      const claimed = await tx.packageCombination.updateMany({
        where: { id, undoneAt: null },
        data: {
          undoneAt: new Date(),
          undoneById: user.id,
          undoneReason: reason || null,
        },
      });
      if (claimed.count === 0) {
        throw new Error("That combined package was opened a moment ago.");
      }
      await tx.package.updateMany({
        where: { combinationId: id },
        data: { combinationId: null },
      });

      const shipmentIds = Array.from(
        new Set(combination.members.map((m) => m.shipment.id))
      );
      for (const shipmentId of shipmentIds) {
        const status = combination.members.find(
          (m) => m.shipment.id === shipmentId
        )!.shipment.status;
        await tx.shipmentStatusHistory.create({
          data: {
            shipmentId,
            fromStatus: status,
            toStatus: status,
            location:
              status === "READY_TO_DEPART"
                ? "Guangzhou warehouse"
                : "Dar es Salaam warehouse",
            note:
              `Combined package ${combination.reference} opened again — the boxes stand on their own.` +
              (reason ? ` ${reason}` : ""),
            actorId: user.id,
          },
        });
      }

      await recordAudit(
        {
          actor: user,
          action: "package.combine.undo",
          entity: "PackageCombination",
          entityId: id,
          summary: `${combination.reference} opened again — ${combination.members.length} package(s) stand on their own`,
          metadata: {
            reference: combination.reference,
            packages: combination.members.map((m) => m.reference).sort(),
            reason: reason || null,
          },
        },
        tx
      );

      return { reference: combination.reference };
    });

    revalidatePath("/app/inventory");
    revalidatePath("/app/cargo");
    revalidatePath("/app/batches");
    revalidatePath("/app/shipments");
    return ok(result);
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}
