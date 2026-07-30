"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

import { recordAudit } from "@/lib/audit";
import { STORAGE_POLICY, storageDaysFor } from "@/lib/constants";
import { toNumber } from "@/lib/format";
import { quote } from "@/lib/pricing";
import {
  nextInvoiceNumber,
  nextPickupNoteNumber,
  nextReceiptNumber,
} from "@/lib/ids";
import { prisma } from "@/lib/prisma";
import { authorize, type SessionUser } from "@/lib/session";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";
import { firstError, invoiceSchema, paymentSchema } from "@/lib/validation";

/**
 * One-click invoice.
 *
 * Everything is derived: the rate comes from the published rate book via the
 * shipment's cargo category, storage comes from how long the cargo has actually
 * been sitting, and the quote snapshot is written back onto the shipment so the
 * figure can be explained months later.
 *
 * Nobody types a price. That is the point — a warehouse clerk cannot influence
 * it and a finance clerk cannot mistype it.
 */
export async function generateInvoice(
  _prev: ActionResult<{ invoiceNumber: string; total: number }> | undefined,
  formData: FormData
): Promise<ActionResult<{ invoiceNumber: string; total: number }>> {
  let user: SessionUser;
  try {
    user = await authorize("invoice.manage");
  } catch (error) {
    return fail(toActionError(error));
  }

  const shipmentId = String(formData.get("shipmentId") ?? "");
  if (!shipmentId) return fail("Missing shipment.");

  try {
    const result = await prisma.$transaction(async (tx) => {
      const shipment = await tx.shipment.findUnique({
        where: { id: shipmentId },
        select: {
          id: true,
          trackingNumber: true,
          customerId: true,
          cargoCategory: true,
          cargoTypeId: true,
          weightKg: true,
          volumeCbm: true,
          packages: true,
          arrivedAt: true,
          deliveredAt: true,
          invoice: { select: { id: true, amountPaid: true, invoiceNumber: true } },
        },
      });
      if (!shipment) throw new Error("Shipment not found.");

      if (shipment.invoice && toNumber(shipment.invoice.amountPaid) > 0) {
        throw new Error(
          `${shipment.invoice.invoiceNumber} already has money against it and cannot be regenerated.`
        );
      }

      const priced = await quote({
        category: shipment.cargoCategory,
        cargoTypeId: shipment.cargoTypeId,
        weightKg: toNumber(shipment.weightKg),
        quantity: shipment.packages,
        volumeCbm: shipment.volumeCbm ? toNumber(shipment.volumeCbm) : null,
      });

      if (!priced.ok) {
        throw new Error(
          `${shipment.trackingNumber} cannot be priced yet: ${priced.message}`
        );
      }

      const storageDays = storageDaysFor(shipment.arrivedAt, shipment.deliveredAt);
      const storageCharge = storageDays * STORAGE_POLICY.perDayUsd;
      const total = priced.total + storageCharge;

      // Keep the working on the shipment so a customer query in three months
      // does not require re-deriving today's rate.
      await tx.shipment.update({
        where: { id: shipment.id },
        data: {
          quotedAmount: new Prisma.Decimal(priced.total),
          quoteCurrency: priced.currency,
          quotedMethod: priced.method,
          quotedRate: new Prisma.Decimal(priced.rate),
          chargeableKg:
            priced.chargeableWeightKg === null
              ? null
              : new Prisma.Decimal(priced.chargeableWeightKg),
          currency: priced.currency,
        },
      });

      const data = {
        customerId: shipment.customerId,
        currency: priced.currency,
        freightCost: new Prisma.Decimal(priced.total),
        storageDays,
        storageCharge: new Prisma.Decimal(storageCharge),
        otherCharges: new Prisma.Decimal(0),
        discount: new Prisma.Decimal(0),
        total: new Prisma.Decimal(total),
        notes: storageDays
          ? `Includes ${storageDays} chargeable storage day(s) at ${STORAGE_POLICY.currency} ${STORAGE_POLICY.perDayUsd}/day.`
          : null,
      };

      const invoice = shipment.invoice
        ? await tx.invoice.update({
            where: { id: shipment.invoice.id },
            data,
            select: { invoiceNumber: true, total: true },
          })
        : await tx.invoice.create({
            data: {
              ...data,
              invoiceNumber: await nextInvoiceNumber(tx),
              shipmentId: shipment.id,
              issuedById: user.id,
            },
            select: { invoiceNumber: true, total: true },
          });

      await recordAudit(
        {
          actor: user,
          action: shipment.invoice ? "invoice.regenerate" : "invoice.generate",
          entity: "Invoice",
          entityId: shipment.id,
          summary: `${shipment.invoice ? "Regenerated" : "Generated"} ${invoice.invoiceNumber} for ${shipment.trackingNumber}: ${priced.currency} ${total.toFixed(2)}`,
          metadata: {
            method: priced.method,
            rate: priced.rate,
            chargeableKg: priced.chargeableWeightKg,
            storageDays,
            ruleId: priced.ruleId,
          },
        },
        tx
      );

      return { invoiceNumber: invoice.invoiceNumber, total };
    });

    revalidatePath(`/app/shipments/${shipmentId}`);
    revalidatePath("/app/finance/invoices");
    revalidatePath("/app/finance");
    return ok(result);
  } catch (error) {
    return fail(toActionError(error));
  }
}

/** Creates the invoice for a shipment, or corrects it while nothing is paid. */
export async function saveInvoice(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  let user: SessionUser;
  try {
    user = await authorize("invoice.manage");
  } catch (error) {
    return fail(toActionError(error));
  }

  const parsed = invoiceSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) return fail(firstError(parsed.error));
  const input = parsed.data;

  const other = input.otherCharges ?? 0;
  const discount = input.discount ?? 0;
  const total = input.freightCost + other - discount;
  if (total < 0) return fail("The discount is larger than the total.");

  try {
    await prisma.$transaction(async (tx) => {
      const shipment = await tx.shipment.findUnique({
        where: { id: input.shipmentId },
        select: {
          id: true,
          trackingNumber: true,
          customerId: true,
          currency: true,
          invoice: {
            select: { id: true, amountPaid: true, invoiceNumber: true },
          },
        },
      });
      if (!shipment) throw new Error("Shipment not found.");

      if (shipment.invoice) {
        if (toNumber(shipment.invoice.amountPaid) > 0) {
          throw new Error(
            "Money has already been received against this invoice — it can no longer be edited."
          );
        }
        await tx.invoice.update({
          where: { id: shipment.invoice.id },
          data: {
            freightCost: input.freightCost,
            otherCharges: other,
            discount,
            total,
            notes: input.notes || null,
          },
        });
        await recordAudit(
          {
            actor: user,
            action: "invoice.update",
            entity: "Invoice",
            entityId: shipment.invoice.id,
            summary: `Adjusted ${shipment.invoice.invoiceNumber} (${shipment.trackingNumber}) to ${total}`,
          },
          tx
        );
        return;
      }

      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber: await nextInvoiceNumber(tx),
          shipmentId: shipment.id,
          customerId: shipment.customerId,
          currency: shipment.currency,
          freightCost: input.freightCost,
          otherCharges: other,
          discount,
          total,
          notes: input.notes || null,
          issuedById: user.id,
        },
      });

      await recordAudit(
        {
          actor: user,
          action: "invoice.create",
          entity: "Invoice",
          entityId: invoice.id,
          summary: `Invoiced ${shipment.trackingNumber}: ${invoice.invoiceNumber} for ${total}`,
        },
        tx
      );
    });

    revalidatePath("/app/finance/invoices");
    revalidatePath(`/app/shipments/${input.shipmentId}`);
    return ok();
  } catch (error) {
    return fail(toActionError(error));
  }
}

/**
 * Records money received and issues its receipt in the same transaction —
 * a payment without a receipt number is not a payment we can defend.
 */
export async function recordPayment(
  _prev: ActionResult<{ receiptNumber: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ receiptNumber: string }>> {
  let user: SessionUser;
  try {
    user = await authorize("payment.record");
  } catch (error) {
    return fail(toActionError(error));
  }

  const parsed = paymentSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) return fail(firstError(parsed.error));
  const input = parsed.data;

  try {
    const receiptNumber = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id: input.invoiceId },
        select: {
          id: true,
          invoiceNumber: true,
          total: true,
          amountPaid: true,
          status: true,
          currency: true,
          shipment: { select: { id: true, trackingNumber: true } },
        },
      });
      if (!invoice) throw new Error("Invoice not found.");
      if (invoice.status === "VOID") throw new Error("This invoice is void.");

      const total = toNumber(invoice.total);
      const paid = toNumber(invoice.amountPaid);
      const outstanding = total - paid;

      if (outstanding <= 0) throw new Error("This invoice is already settled.");
      // Overpayment is almost always a typo at the counter. Reject it rather
      // than quietly creating a credit the system has no concept of.
      if (input.amount > outstanding + 0.001) {
        throw new Error(
          `That is more than the ${invoice.currency} ${outstanding.toLocaleString()} still outstanding.`
        );
      }

      const payment = await tx.payment.create({
        data: {
          invoiceId: invoice.id,
          amount: new Prisma.Decimal(input.amount),
          currency: invoice.currency,
          method: input.method,
          reference: input.reference || null,
          note: input.note || null,
          receivedById: user.id,
        },
      });

      const receipt = await tx.receipt.create({
        data: {
          receiptNumber: await nextReceiptNumber(tx),
          paymentId: payment.id,
          issuedById: user.id,
        },
      });

      const newPaid = paid + input.amount;
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          amountPaid: new Prisma.Decimal(newPaid),
          status: newPaid + 0.001 >= total ? "PAID" : "PARTIALLY_PAID",
        },
      });

      await recordAudit(
        {
          actor: user,
          action: "payment.record",
          entity: "Payment",
          entityId: payment.id,
          summary: `Received ${invoice.currency} ${input.amount.toLocaleString()} for ${invoice.shipment.trackingNumber} (${receipt.receiptNumber})`,
          metadata: { method: input.method, reference: input.reference ?? null },
        },
        tx
      );

      return receipt.receiptNumber;
    });

    revalidatePath("/app/finance");
    revalidatePath("/app/finance/invoices");
    revalidatePath("/app/finance/payments");
    return ok({ receiptNumber });
  } catch (error) {
    return fail(toActionError(error));
  }
}

/**
 * The gate between money and cargo. A pickup note is the only thing that moves
 * a shipment to READY_FOR_PICKUP, and only Finance can issue one.
 */
export async function issuePickupNote(
  _prev: ActionResult<{ noteNumber: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ noteNumber: string }>> {
  let user: SessionUser;
  try {
    user = await authorize("pickupNote.issue");
  } catch (error) {
    return fail(toActionError(error));
  }

  const shipmentId = String(formData.get("shipmentId") ?? "");
  if (!shipmentId) return fail("Missing shipment.");

  try {
    const noteNumber = await prisma.$transaction(async (tx) => {
      const shipment = await tx.shipment.findUnique({
        where: { id: shipmentId },
        select: {
          id: true,
          trackingNumber: true,
          status: true,
          customerId: true,
          currency: true,
          pickupNote: { select: { id: true, status: true, noteNumber: true } },
          invoice: {
            select: { id: true, status: true, total: true, amountPaid: true },
          },
          exceptions: {
            where: { status: "OPEN", type: "MISSING_SHIPMENT" },
            select: { id: true },
          },
        },
      });
      if (!shipment) throw new Error("Shipment not found.");

      if (shipment.pickupNote && shipment.pickupNote.status === "ACTIVE") {
        throw new Error(
          `A pickup note (${shipment.pickupNote.noteNumber}) is already active for this shipment.`
        );
      }
      if (shipment.status !== "RECEIVED_AT_DAR") {
        throw new Error(
          "Cargo must be checked in at the Dar warehouse before a pickup note can be issued."
        );
      }
      if (shipment.exceptions.length > 0) {
        throw new Error(
          "This shipment is flagged as missing. Resolve the exception first."
        );
      }
      if (!shipment.invoice) throw new Error("Raise an invoice first.");
      if (shipment.invoice.status !== "PAID") {
        const outstanding =
          toNumber(shipment.invoice.total) - toNumber(shipment.invoice.amountPaid);
        throw new Error(
          `${shipment.currency} ${outstanding.toLocaleString()} is still outstanding on this invoice.`
        );
      }

      const note = await tx.pickupNote.create({
        data: {
          noteNumber: await nextPickupNoteNumber(tx),
          shipmentId: shipment.id,
          customerId: shipment.customerId,
          amountPaid: shipment.invoice.amountPaid,
          currency: shipment.currency,
          issuedById: user.id,
        },
      });

      const now = new Date();
      await tx.shipment.update({
        where: { id: shipment.id },
        data: { status: "READY_FOR_PICKUP", readyForPickup: now },
      });

      await tx.shipmentStatusHistory.create({
        data: {
          shipmentId: shipment.id,
          fromStatus: "RECEIVED_AT_DAR",
          toStatus: "READY_FOR_PICKUP",
          location: "Dar es Salaam warehouse",
          note: `Payment confirmed. Pickup note ${note.noteNumber} issued.`,
          actorId: user.id,
        },
      });

      await recordAudit(
        {
          actor: user,
          action: "pickupNote.issue",
          entity: "PickupNote",
          entityId: note.id,
          summary: `Issued ${note.noteNumber} for ${shipment.trackingNumber}`,
        },
        tx
      );

      return note.noteNumber;
    });

    revalidatePath("/app/finance/pickup-notes");
    revalidatePath(`/app/shipments/${shipmentId}`);
    revalidatePath("/app/release");
    return ok({ noteNumber });
  } catch (error) {
    return fail(toActionError(error));
  }
}

export async function cancelPickupNote(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  let user: SessionUser;
  try {
    user = await authorize("pickupNote.cancel");
  } catch (error) {
    return fail(toActionError(error));
  }

  const noteId = String(formData.get("noteId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!noteId) return fail("Missing pickup note.");
  if (reason.length < 3) return fail("Give a reason for cancelling.");

  try {
    await prisma.$transaction(async (tx) => {
      const note = await tx.pickupNote.findUnique({
        where: { id: noteId },
        select: {
          id: true,
          status: true,
          noteNumber: true,
          shipment: { select: { id: true, status: true, trackingNumber: true } },
        },
      });
      if (!note) throw new Error("Pickup note not found.");
      if (note.status !== "ACTIVE") {
        throw new Error("Only an active pickup note can be cancelled.");
      }

      await tx.pickupNote.update({
        where: { id: noteId },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelReason: reason,
        },
      });

      // The cargo goes back to sitting in the warehouse, still paid for.
      if (note.shipment.status === "READY_FOR_PICKUP") {
        await tx.shipment.update({
          where: { id: note.shipment.id },
          data: { status: "RECEIVED_AT_DAR", readyForPickup: null },
        });
        await tx.shipmentStatusHistory.create({
          data: {
            shipmentId: note.shipment.id,
            fromStatus: "READY_FOR_PICKUP",
            toStatus: "RECEIVED_AT_DAR",
            location: "Dar es Salaam warehouse",
            note: `Pickup note ${note.noteNumber} cancelled: ${reason}`,
            actorId: user.id,
          },
        });
      }

      await recordAudit(
        {
          actor: user,
          action: "pickupNote.cancel",
          entity: "PickupNote",
          entityId: noteId,
          summary: `Cancelled ${note.noteNumber} (${note.shipment.trackingNumber}): ${reason}`,
        },
        tx
      );
    });

    revalidatePath("/app/finance/pickup-notes");
    revalidatePath("/app/release");
    return ok();
  } catch (error) {
    return fail(toActionError(error));
  }
}
