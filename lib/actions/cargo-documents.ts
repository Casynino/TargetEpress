"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import {
  SHIPMENT_DOCUMENT_KINDS,
  SHIPMENT_DOCUMENT_KIND_LABELS,
} from "@/lib/cargo-documents";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { authorize, type SessionUser } from "@/lib/session";
import { filesFrom, putDocument } from "@/lib/storage";
import { viewerLocale } from "@/lib/viewer";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";
import { firstError } from "@/lib/validation";

/**
 * The consignment's supporting paperwork.
 *
 * Everything else that can be attached in this system hangs off a money event —
 * proof against a payment, a receipt against a cost. A consignment's own
 * paperwork had nowhere to go, so the supplier invoice, the packing list and the
 * customs entry lived in WhatsApp: fine until the person who was in that group
 * is on leave, or has cleared their chats, and Finance is being asked to prove a
 * duty figure from memory.
 *
 * The tone matches the uploads the owner already has at payment, receiving and
 * release: the prompt is plainly visible and says what is expected, and nothing
 * anywhere refuses to proceed without one. Attaching is a separate act from
 * saving the cargo, which is what makes that possible — a clerk with no file to
 * hand simply does not use this panel.
 */

const attachSchema = z.object({
  shipmentId: z.string().trim().min(1),
  kind: z.enum(SHIPMENT_DOCUMENT_KINDS).default("OTHER"),
  /// What it is, in their own words. Optional: the filename usually says it, and
  /// demanding a description is how an attachment stops being attached.
  label: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => (v?.length ? v : null)),
});

export async function attachCargoDocuments(
  _prev: ActionResult<{ attached: number }> | undefined,
  formData: FormData
): Promise<ActionResult<{ attached: number }>> {
  const locale = await viewerLocale();

  let user: SessionUser;
  try {
    user = await authorize("shipment.attach");
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }

  const parsed = attachSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) return fail(t(locale, firstError(parsed.error)));
  const input = parsed.data;

  const files = filesFrom(formData, "documents");
  if (files.length === 0) {
    return fail(t(locale, "Choose a file first — nothing was attached."));
  }

  const shipment = await prisma.shipment.findUnique({
    where: { id: input.shipmentId },
    select: { id: true, trackingNumber: true },
  });
  if (!shipment) return fail(t(locale, "That cargo no longer exists."));

  // Stored before the transaction opens, exactly as payment proofs and expense
  // receipts are: a file crossing the network must not hold a row lock, and a
  // document that fails to store has to fail loudly rather than leaving a row
  // pointing at a file nobody can open.
  let stored: { url: string; contentType: string; bytes: number; filename: string }[];
  try {
    stored = await Promise.all(
      files.map(async (file) => {
        const put = await putDocument(file, "cargo-docs");
        return { ...put, filename: file.name || "document" };
      })
    );
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.shipmentDocument.createMany({
        data: stored.map((file) => ({
          shipmentId: shipment.id,
          kind: input.kind,
          label: input.label,
          url: file.url,
          contentType: file.contentType,
          bytes: file.bytes,
          filename: file.filename,
          uploadedById: user.id,
        })),
      });

      await recordAudit(
        {
          actor: user,
          action: "shipment.attachDocument",
          entity: "Shipment",
          entityId: shipment.id,
          // English, always, and in the "what — which" shape the rest of the log
          // uses. An audit row is never rewritten, so it is stored in the one
          // language both halves of the company can search.
          summary: `Attached ${stored.length} file(s) to ${shipment.trackingNumber} — ${SHIPMENT_DOCUMENT_KIND_LABELS[input.kind]}${input.label ? `: ${input.label}` : ""}`,
          metadata: {
            trackingNumber: shipment.trackingNumber,
            kind: input.kind,
            label: input.label,
            files: stored.map((file) => file.filename),
          },
        },
        tx
      );
    });

    revalidatePath(`/app/cargo/${shipment.trackingNumber}`);
    return ok({ attached: stored.length });
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}

const removeSchema = z.object({
  documentId: z.string().trim().min(1),
  /**
   * Required, and kept forever in the audit entry.
   *
   * The same argument as deleting a piece of cargo: six months later nobody ever
   * asks whether a file was removed, they ask why. Attaching is the thing that
   * must never be blocked; taking evidence back off a consignment is not, and
   * one sentence is a fair price for it.
   */
  reason: z
    .string()
    .trim()
    .min(3, "Say why it is coming off — it is kept on the record."),
});

/**
 * Take a file back off a consignment.
 *
 * Whoever attached it may remove it, because the everyday case is their own
 * mistake — the wrong month's invoice, the same PDF twice — and making them ask
 * somebody else to undo a typo is how the wrong file stays on the record.
 *
 * Anybody else's file needs `shipment.cancel` — the owner and the manager, and
 * nobody else. This said `shipment.purge`, which is the authority to erase a
 * record for good and is the owner's at any rank; taking a wrongly filed PDF
 * off a consignment is not that act, and naming it that shut the manager out of
 * their own paperwork. What the rule protects is unchanged either way: one desk
 * must not be able to quietly remove the paper another desk filed against the
 * same cargo.
 *
 * The row goes; the audit entry keeps the filename, the kind and the URL. So a
 * removal is answerable — and, while the file itself is still in storage,
 * recoverable by whoever reads the log.
 */
export async function removeCargoDocument(
  _prev: ActionResult<{ filename: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ filename: string }>> {
  const locale = await viewerLocale();

  let user: SessionUser;
  try {
    user = await authorize("shipment.attach");
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }

  const parsed = removeSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) return fail(t(locale, firstError(parsed.error)));
  const input = parsed.data;

  try {
    const document = await prisma.shipmentDocument.findUnique({
      where: { id: input.documentId },
      select: {
        id: true,
        kind: true,
        label: true,
        url: true,
        filename: true,
        uploadedById: true,
        shipment: { select: { id: true, trackingNumber: true } },
      },
    });
    if (!document) {
      return fail(t(locale, "That file has already been removed."));
    }

    const mine = document.uploadedById === user.id;
    if (!mine && !can(user.role, "document.removeAny")) {
      return fail(
        t(
          locale,
          "Somebody else attached this file, so only the owner or a manager can take it off. Attach the right one instead — the list shows both."
        )
      );
    }

    const name = document.filename ?? "document";

    await prisma.$transaction(async (tx) => {
      // Deleted by id AND by the row still existing, so two people pressing
      // Remove on the same file do not both write an audit entry for it.
      const deleted = await tx.shipmentDocument.deleteMany({
        where: { id: document.id },
      });
      if (deleted.count === 0) {
        throw new Error(t(locale, "That file has already been removed."));
      }

      await recordAudit(
        {
          actor: user,
          action: "shipment.removeDocument",
          entity: "Shipment",
          entityId: document.shipment.id,
          summary: `Removed ${name} from ${document.shipment.trackingNumber} — ${input.reason}`,
          metadata: {
            trackingNumber: document.shipment.trackingNumber,
            kind: document.kind,
            label: document.label,
            filename: name,
            // The file itself is untouched in storage. Keeping the URL is what
            // makes this reversible by hand instead of an erasure.
            url: document.url,
            reason: input.reason,
            wasOwnUpload: mine,
          },
        },
        tx
      );
    });

    revalidatePath(`/app/cargo/${document.shipment.trackingNumber}`);
    return ok({ filename: name });
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}
