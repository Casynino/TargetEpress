"use server";

import type { InvoiceStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit, withNote } from "@/lib/audit";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { canAmendCargo, cargoCustody } from "@/lib/rbac";
import { authorize, type SessionUser } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";

/**
 * Deleting and restoring cargo.
 *
 * Nothing is ever destroyed. A delete sets a timestamp and a person; the row,
 * its photos and its whole status history stay exactly where they were. That is
 * deliberate: the most common reason to delete is a duplicate entry, and the
 * second most common is a mistake — neither should be able to take the evidence
 * with it.
 *
 * A note may be left and usually is not. It was compulsory, and the box was
 * answered with "duplicate" often enough that requiring it bought nothing the
 * timestamp and the name did not already say.
 *
 * A restore is the same operation backwards, and is equally audited.
 */

/**
 * The English in this schema is the dictionary key, not the final wording. A
 * server action is called by a form and cannot be handed the reader's language
 * as an argument, so every message here is translated where it is returned,
 * against the locale read off the session.
 */
const deleteSchema = z.object({
  shipmentId: z.string().trim().min(1, "Missing cargo."),
  reason: z
    .string()
    .trim()
    .max(500, "Keep the note under 500 characters.")
    .optional(),
});

export async function deleteCargo(
  _prev: ActionResult<{ trackingNumber: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ trackingNumber: string }>> {
  const locale = await viewerLocale();
  let user: SessionUser;
  try {
    // The warehouse deletes its own mistakes — a duplicate registration is
    // theirs to undo, and making them ask the CEO means the duplicate stays on
    // the manifest all week. Nothing is destroyed by this; see below.
    user = await authorize("shipment.delete");
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }

  const parsed = deleteSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) {
    return fail(
      t(locale, parsed.error.issues[0]?.message ?? "Check the details.")
    );
  }
  const input = parsed.data;

  try {
    const cargo = await prisma.shipment.findUnique({
      where: { id: input.shipmentId },
      select: {
        id: true,
        trackingNumber: true,
        deletedAt: true,
        status: true,
        description: true,
        weightKg: true,
        customer: { select: { name: true } },
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            status: true,
            amountPaid: true,
            amountAdjusted: true,
            /* Approved credit is a debt, even with nothing paid against it —
               see the guard below. */
            creditStatus: true,
          },
        },
        _count: { select: { photos: true } },
      },
    });
    if (!cargo) return fail(t(locale, "That cargo no longer exists."));
    if (cargo.deletedAt) return fail(t(locale, "That cargo is already deleted."));

    // Custody, not seniority. The floor holding the cargo removes it: Guangzhou
    // while it is on the shelf or in the air, Dar from the arrival scan onward.
    // canAmendCargo is the same call the Delete button on the cargo page makes
    // to decide whether to render at all.
    if (!canAmendCargo(user.role, cargo.status)) {
      return fail(
        t(
          locale,
          cargoCustody(cargo.status) === "LANDED"
            ? "This cargo has landed in Dar. Only the Dar warehouse, a manager or the owner can change it now."
            : "This cargo has not landed in Dar yet. Only Guangzhou, a manager or the owner can change it now."
        )
      );
    }

    // Money already taken against it makes this an accounting event, not a
    // typo. Refusing here is safer than leaving a paid invoice pointing at a
    // record that has vanished from every screen.
    /* A cleared difference is a decision somebody made about this customer, the
       same as money arriving — see the write-off guards on undoBatchArrival. */
    if (
      cargo.invoice &&
      (Number(cargo.invoice.amountPaid) > 0 ||
        Number(cargo.invoice.amountAdjusted) > 0.005)
    ) {
      // The invoice number is data and stays put; the sentence around it is
      // composed from a translated fragment.
      return fail(
        `${cargo.invoice.invoiceNumber} ${t(locale, "has money against it. Void the invoice through Finance first.")}`
      );
    }

    /*
      AND AN APPROVED CREDIT IS A DEBT, WITH NOTHING PAID AGAINST IT.

      The guard above asks whether money has arrived or been let go. A credit
      sale is neither: Finance read the customer's exposure, agreed the cargo
      could leave unpaid, and the whole bill is still owed. Nothing had been
      paid, so this fell straight through — the delete voided the invoice and
      the receivable vanished from the call list, the credit book, the
      customer's own statement and the owner's owed figure. The company simply
      stopped being owed the money.

      Refused for the same reason as the line above: unwinding a debt is
      Finance's decision, made in Finance, not a side effect of tidying a
      cargo record away.
    */
    if (
      cargo.invoice &&
      cargo.invoice.creditStatus === "APPROVED" &&
      cargo.invoice.status !== "VOID" &&
      cargo.invoice.status !== "WRITTEN_OFF"
    ) {
      return fail(
        `${cargo.invoice.invoiceNumber} ${t(locale, "was released on approved credit and is still owed. Settle or write it off in Finance before deleting the cargo.")}`
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.shipment.update({
        where: { id: cargo.id },
        data: {
          deletedAt: new Date(),
          deletedById: user.id,
          deleteReason: input.reason || null,
        },
      });

      /*
        THE BILL GOES WITH THE CARGO.

        The soft-delete extension in lib/prisma.ts intercepts top-level
        operations on `shipment` only, and every receivable query reads the
        shipment as a NESTED relation — so it never filters. A deleted
        consignment's invoice went on standing in the accounts-receivable
        report, the finance dashboard's owed figure, the owner's unpaid
        position and the collections call list, and a customer was chased for
        cargo that appears on no screen.

        Voided here rather than filtered in the four queries, because voiding
        is what actually happened and it also answers the readers nobody has
        written yet. Nothing with money or a cleared difference against it
        reaches this line — both are refused above.
      */
      const voidedFrom =
        cargo.invoice && cargo.invoice.status !== "VOID"
          ? cargo.invoice.status
          : null;
      if (cargo.invoice && voidedFrom) {
        await tx.invoice.update({
          where: { id: cargo.invoice.id },
          data: { status: "VOID" },
        });
      }

      await recordAudit(
        {
          actor: user,
          action: "cargo.delete",
          entity: "Shipment",
          entityId: cargo.id,
          summary: withNote(`Deleted ${cargo.trackingNumber}`, input.reason),
          // The state at the moment of deletion, so the record can be read
          // without reconstructing it from a dozen other tables.
          metadata: {
            /* WHAT THE DELETE DID TO THE BILL, so putting the cargo back can
               put the bill back. Restoring used to clear deletedAt and leave
               the invoice VOID for ever: the consignment reappeared on every
               screen carrying a bill no payment could be recorded against and
               no new invoice could replace, and nothing said why. Null when
               the bill was already void and the delete left it alone. */
            invoiceVoidedFrom: voidedFrom,
            trackingNumber: cargo.trackingNumber,
            customer: cargo.customer.name,
            description: cargo.description,
            weightKg: cargo.weightKg.toString(),
            status: cargo.status,
            photosPreserved: cargo._count.photos,
            reason: input.reason ?? null,
          },
        },
        tx
      );
    });

    revalidatePath("/app/batches");
    revalidatePath("/app/cargo");
    revalidatePath("/app/admin/deleted");
    return ok({ trackingNumber: cargo.trackingNumber });
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}

export async function restoreCargo(
  shipmentId: string
): Promise<ActionResult<{ trackingNumber: string }>> {
  const locale = await viewerLocale();
  let user: SessionUser;
  try {
    /* Restoring is management's call, not the warehouse's — putting a record
       back onto a batch that has since flown is how a manifest stops matching.
       It said so and then guarded on a key both warehouses held.
       records.viewDeleted resolves to the owner and a manager, and it is the
       permission on the only screen this is driven from. */
    user = await authorize("records.viewDeleted");
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }

  try {
    const cargo = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      select: {
        id: true,
        trackingNumber: true,
        deletedAt: true,
        status: true,
        invoice: { select: { id: true, status: true } },
      },
    });
    if (!cargo) return fail(t(locale, "That cargo no longer exists."));
    if (!cargo.deletedAt) return fail(t(locale, "That cargo is not deleted."));
    /* Custody, the same test deleteCargo makes. Putting a record back is the
       same intervention as taking it away, and the floor holding the cargo is
       the one that answers for it. */
    if (!canAmendCargo(user.role, cargo.status)) {
      return fail(
        t(
          locale,
          cargoCustody(cargo.status) === "LANDED"
            ? "This cargo has landed in Dar. Only the Dar warehouse, a manager or the owner can change it now."
            : "This cargo has not landed in Dar yet. Only Guangzhou, a manager or the owner can change it now."
        )
      );
    }

    /*
      THE BILL COMES BACK WITH THE CARGO.

      Deleting a consignment voids its invoice so a customer is not chased for
      cargo that appears on no screen. Restoring has to undo the same thing: a
      bill left VOID refuses every payment, cannot be replaced by a new one,
      and quietly writes the money off — the consignment is back and it can
      never be billed for.

      The delete recorded which state it took the bill out of, so this puts
      back exactly that: a draft returns as a draft, not as a confirmed demand
      nobody signed off. A bill voided by anything OTHER than this delete is
      left alone — its own door undoes it.
    */
    const deleteEntry = await prisma.auditLog.findFirst({
      where: { entity: "Shipment", entityId: cargo.id, action: "cargo.delete" },
      orderBy: { createdAt: "desc" },
      select: { metadata: true },
    });
    const voidedFrom = (deleteEntry?.metadata as { invoiceVoidedFrom?: string } | null)
      ?.invoiceVoidedFrom;
    const putBack =
      cargo.invoice &&
      cargo.invoice.status === "VOID" &&
      voidedFrom &&
      voidedFrom !== "VOID"
        ? (voidedFrom as InvoiceStatus)
        : null;

    await prisma.$transaction(async (tx) => {
      await tx.shipment.update({
        where: { id: cargo.id },
        data: { deletedAt: null, deletedById: null, deleteReason: null },
      });

      if (cargo.invoice && putBack) {
        /* Claimed on the status the read saw, so a bill somebody reopened in
           Finance between the two is not overwritten by this. */
        await tx.invoice.updateMany({
          where: { id: cargo.invoice.id, status: "VOID" },
          data: { status: putBack },
        });
      }

      await recordAudit(
        {
          actor: user,
          action: "cargo.restore",
          entity: "Shipment",
          entityId: cargo.id,
          summary: putBack
            ? `Restored ${cargo.trackingNumber} — its bill returned to ${putBack}`
            : `Restored ${cargo.trackingNumber}`,
          metadata: { invoiceRestoredTo: putBack },
        },
        tx
      );
    });

    revalidatePath("/app/batches");
    revalidatePath("/app/admin/deleted");
    return ok({ trackingNumber: cargo.trackingNumber });
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}


/**
 * Erasing a record for good.
 *
 * The only operation in the system that destroys anything, and it exists
 * because occasionally a record must genuinely go — a test entry, a duplicate
 * created by a bad import, a customer exercising a right to be forgotten.
 *
 * It is CEO-only, it refuses anything that has money or a flight attached to
 * it, and it demands the tracking number typed out in full. That last one is
 * not ceremony: it is the difference between deleting the record you are
 * looking at and the one you meant.
 */
export async function purgeCargo(
  _prev: ActionResult<{ trackingNumber: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ trackingNumber: string }>> {
  const locale = await viewerLocale();
  let user: SessionUser;
  try {
    user = await authorize("shipment.purge");
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }

  const shipmentId = String(formData.get("shipmentId") ?? "");
  const typed = String(formData.get("confirm") ?? "").trim().toUpperCase();
  if (!shipmentId) return fail(t(locale, "Missing cargo."));

  try {
    const cargo = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      select: {
        id: true,
        trackingNumber: true,
        deletedAt: true,
        batch: { select: { permanent: true } },
        invoice: { select: { invoiceNumber: true, amountPaid: true, amountAdjusted: true } },
        _count: { select: { photos: true, packageList: true } },
      },
    });
    if (!cargo) return fail(t(locale, "That cargo no longer exists."));

    if (!cargo.deletedAt) {
      return fail(
        t(
          locale,
          "Delete it first. Permanent removal only applies to records already in Deleted records."
        )
      );
    }
    if (typed !== cargo.trackingNumber) {
      return fail(
        `${t(locale, "Type")} ${cargo.trackingNumber} ${t(locale, "exactly to confirm. Nothing has been removed.")}`
      );
    }
    if (cargo.invoice) {
      return fail(
        `${cargo.invoice.invoiceNumber} ${t(locale, "is raised against this cargo. Void the invoice through Finance first.")}`
      );
    }
    if (cargo.batch && !cargo.batch.permanent) {
      return fail(
        t(
          locale,
          "This cargo is on a dispatched batch. It has to stay on the record for that manifest."
        )
      );
    }

    await prisma.$transaction(async (tx) => {
      // The audit entry is written before the row disappears, and deliberately
      // carries everything worth knowing — after this there is nothing left to
      // look the record up from.
      await recordAudit(
        {
          actor: user,
          action: "cargo.purge",
          entity: "Shipment",
          entityId: cargo.id,
          summary: `Permanently removed ${cargo.trackingNumber}`,
          metadata: {
            trackingNumber: cargo.trackingNumber,
            photosDestroyed: cargo._count.photos,
            packagesDestroyed: cargo._count.packageList,
          },
        },
        tx
      );

      await tx.shipment.delete({ where: { id: cargo.id } });
    });

    revalidatePath("/app/admin/deleted");
    return ok({ trackingNumber: cargo.trackingNumber });
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}
