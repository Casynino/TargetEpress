"use server";

import { revalidatePath } from "next/cache";

import { autoPriceShipments } from "@/lib/auto-price";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { PACKAGE_TYPE_LABELS } from "@/lib/constants";
import { normalisePhone } from "@/lib/format";
import { t } from "@/lib/i18n";
import { packageReference } from "@/lib/ids";
import { generateQrToken } from "@/lib/ids";
import type { Locale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { canAmendCargo, cargoCustody } from "@/lib/rbac";
import { authorize, type SessionUser } from "@/lib/session";
import { filesFrom, putImages } from "@/lib/storage";
import { viewerLocale } from "@/lib/viewer";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";

/**
 * Correcting a piece of cargo.
 *
 * The desk that took it in is the desk that mistyped the weight, so warehouse
 * staff can fix their own work rather than registering a second shipment for
 * the same boxes. What stops that being dangerous is custody: a floor may only
 * correct cargo that is currently its own — Guangzhou's until Dar confirms it
 * arrived, Dar's from that moment on. See canAmendCargo in lib/rbac.ts.
 *
 * Every saved change is diffed field by field and written to FieldChange. The
 * warehouse sees only the current version; the CEO can read the whole history,
 * which is the point — "the weight was 20 and now it is 22" is the question
 * that actually gets asked six weeks later.
 */

const editSchemaFor = (locale: Locale) =>
  z.object({
  shipmentId: z.string().trim().min(1),
  customerName: z.string().trim().min(2, t(locale, "The customer needs a name.")),
  /* A customer without a number cannot be rung about their cargo, and this
     form used to accept an empty one and write null over the number they had.
     Same rule the registration form has always enforced. */
  customerPhone: z
    .string()
    .trim()
    .min(7, t(locale, "That phone number is too short."))
    .regex(/^[\d+\s()-]+$/, t(locale, "That phone number is not valid.")),
  cargoTypeId: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v?.length ? v : null)),
  description: z.string().trim().min(2, t(locale, "Say what is in the boxes.")),
  weightKg: z.coerce
    .number()
    .positive(
      t(locale, "Weight must be more than zero — it is what the customer pays on.")
    )
    .max(5000),
  packages: z.coerce
    .number()
    .int()
    .min(1, t(locale, "There is at least one package."))
    .max(999),
  packageType: z.enum([
    "CARTON",
    "PIECE",
    "PACKAGE",
    "BAG",
    "BOX",
    "ENVELOPE",
    "OTHER",
  ]),
  internalNotes: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => (v?.length ? v : null)),
});

/**
 * Fields the warehouse may change, in the words the screen uses.
 *
 * Kept in English here and translated where it is read. The same label is
 * written into the audit trail and shown on the change history, and a record
 * stamped in whichever language the person editing happened to be reading is a
 * record the other half of the company cannot search.
 */
const LABELS: Record<string, string> = {
  customerName: "Customer",
  customerPhone: "Phone",
  cargoType: "Item",
  description: "Description",
  weightKg: "Weight (kg)",
  packages: "Quantity",
  packageType: "Counted as",
  internalNotes: "Internal note",
};

export async function updateCargo(
  _prev: ActionResult<{ trackingNumber: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ trackingNumber: string }>> {
  const locale = await viewerLocale();

  let user: SessionUser;
  try {
    user = await authorize("shipment.edit");
  } catch (error) {
    return fail(toActionError(error));
  }

  const parsed = editSchemaFor(locale).safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? t(locale, "Check the details."));
  }
  const input = parsed.data;

  try {
    const before = await prisma.shipment.findUnique({
      where: { id: input.shipmentId },
      select: {
        id: true,
        trackingNumber: true,
        status: true,
        description: true,
        weightKg: true,
        packages: true,
        packageType: true,
        internalNotes: true,
        cargoTypeId: true,
        cargoType: { select: { name: true } },
        customer: { select: { id: true, name: true, phone: true } },
        packageList: {
          /* receivedAt and deliveredAt, because a scanned box is not deleted
             by lowering a number — see the guard below. */
          select: { sequence: true, receivedAt: true, deliveredAt: true },
          orderBy: { sequence: "asc" },
        },
      },
    });
    if (!before) return fail(t(locale, "That cargo no longer exists."));

    // The window is custody: whichever floor is holding the cargo corrects its
    // record. A weight genuinely does get typed wrong and a flight sits in the
    // air for days, so Guangzhou keeps the record until Dar confirms arrival —
    // and from that scan onward it is Dar's, because Dar has said the boxes are
    // here and counted.
    //
    // /app/cargo/[id]/edit/page.tsx calls the same function to decide whether to
    // open the page at all. The two must agree: a door that opens on a wider
    // rule than the action behind it is a form that saves nothing.
    if (!canAmendCargo(user.role, before.status)) {
      return fail(
        t(
          locale,
          cargoCustody(before.status) === "LANDED"
            ? "This cargo has landed in Dar. Only the Dar warehouse, a manager or the owner can change it now."
            : "This cargo has not landed in Dar yet. Only Guangzhou, a manager or the owner can change it now."
        )
      );
    }

    const phone = normalisePhone(input.customerPhone);

    const cargoType = input.cargoTypeId
      ? await prisma.cargoType.findUnique({
          where: { id: input.cargoTypeId },
          select: { name: true },
        })
      : null;

    // Diff first, write second. A change list built from the saved row cannot
    // tell "set to 22" apart from "was already 22".
    const changes: { field: string; before: string | null; after: string | null }[] =
      [];
    const note = (field: string, from: unknown, to: unknown) => {
      const a = from === null || from === undefined ? null : String(from);
      const b = to === null || to === undefined ? null : String(to);
      if (a !== b) changes.push({ field, before: a, after: b });
    };

    note("customerName", before.customer.name, input.customerName);
    note("customerPhone", before.customer.phone, phone);
    note("cargoType", before.cargoType?.name ?? null, cargoType?.name ?? null);
    note("description", before.description, input.description);
    note("weightKg", Number(before.weightKg), input.weightKg);
    note("packages", before.packages, input.packages);
    note("packageType", before.packageType, input.packageType);
    note("internalNotes", before.internalNotes, input.internalNotes);

    const photoFiles = filesFrom(formData, "photos");
    const uploaded = photoFiles.length > 0 ? await putImages(photoFiles, "cargo") : [];

    if (changes.length === 0 && uploaded.length === 0) {
      return fail(t(locale, "Nothing was changed."));
    }

    await prisma.$transaction(async (tx) => {
      /*
        A NUMBER IS AN IDENTITY, SO CHANGING ONE IS CHECKED AND MIRRORED.

        Two things went wrong here. The number could be taken — typed onto this
        cargo while it was already on file as somebody else, which is how one
        customer's consignment reaches another's phone. And the CustomerPhone
        list, which every lookup reads, was left describing the old number, so
        the customer could still be found by a number they no longer use and
        not by the one they do.
      */
      if (phone !== before.customer.phone) {
        const theirs = await tx.customerPhone.findUnique({ where: { phone } });
        if (theirs && theirs.customerId !== before.customer.id) {
          const owner = await tx.customer.findUnique({
            where: { id: theirs.customerId },
            select: { name: true, code: true },
          });
          throw new Error(
            `${phone} is already on file as ${owner?.name ?? "another customer"} (${owner?.code ?? ""}). Use a different number, or merge the two records.`
          );
        }
        const taken = await tx.customer.findUnique({
          where: { phone },
          select: { id: true, name: true, code: true },
        });
        if (taken && taken.id !== before.customer.id) {
          throw new Error(
            `${phone} is already on file as ${taken.name} (${taken.code}). Use a different number, or merge the two records.`
          );
        }

        /* The list follows the main number: the new one becomes primary, the
           old one stays as a number they can still be reached on. */
        await tx.customerPhone.updateMany({
          where: { customerId: before.customer.id },
          data: { isPrimary: false },
        });
        await tx.customerPhone.upsert({
          where: { phone },
          create: {
            phone,
            customerId: before.customer.id,
            isPrimary: true,
            addedById: user.id,
          },
          update: { isPrimary: true },
        });
      }

      await tx.customer.update({
        where: { id: before.customer.id },
        data: { name: input.customerName, phone },
      });

      await tx.shipment.update({
        where: { id: before.id },
        data: {
          cargoTypeId: input.cargoTypeId,
          description: input.description,
          weightKg: input.weightKg,
          packages: input.packages,
          packageType: input.packageType,
          internalNotes: input.internalNotes,
        },
      });

      // The count changed, so the boxes have to. Extra packages get their own
      // QR like any other; removed ones go from the top down, because package 5
      // of 5 is the one that was never there.
      if (input.packages !== before.packageList.length) {
        if (input.packages > before.packageList.length) {
          await tx.package.createMany({
            data: Array.from(
              { length: input.packages - before.packageList.length },
              (_, index) => {
                const sequence = before.packageList.length + index + 1;
                return {
                  shipmentId: before.id,
                  sequence,
                  reference: packageReference(before.trackingNumber, sequence),
                  qrToken: generateQrToken(),
                };
              }
            ),
          });
        } else {
          /*
            A BOX THAT HAS BEEN SCANNED IS NOT DELETED BY A NUMBER.

            Removing from the top down is right for a booking Guangzhou is
            correcting before it flies: package 5 of 5 is the one that was
            never there. It is wrong the moment a carton has been checked in or
            handed over — the row carries the proof that somebody scanned it,
            and lowering a count would erase that quietly, which is exactly how
            a warehouse ends up unable to say what it received.

            So the count may come down over boxes nobody has touched, and stops
            at the first one that has. A count that disagrees with cartons
            already scanned is a mis-scan, and that is a case to raise, not a
            row to delete.
          */
          const doomed = before.packageList.filter(
            (pkg) => pkg.sequence > input.packages
          );
          const scanned = doomed.filter(
            (pkg) => pkg.receivedAt !== null || pkg.deliveredAt !== null
          );
          if (scanned.length > 0) {
            throw new Error(
              t(
                locale,
                "Some of those boxes have already been checked in or handed over, so the count cannot be lowered past them. Raise a case instead."
              )
            );
          }
          await tx.package.deleteMany({
            where: { shipmentId: before.id, sequence: { gt: input.packages } },
          });
        }
      }

      if (uploaded.length > 0) {
        await tx.shipmentPhoto.createMany({
          data: uploaded.map((image) => ({
            shipmentId: before.id,
            url: image.url,
            kind: "CARGO" as const,
            caption: "Added when the record was corrected",
            uploadedById: user.id,
          })),
        });
      }

      if (changes.length > 0) {
        await tx.fieldChange.createMany({
          data: changes.map((change) => ({
            entity: "Shipment",
            entityId: before.id,
            field: change.field,
            before: change.before,
            after: change.after,
            actorId: user.id,
            actorName: user.name,
          })),
        });
      }

      await recordAudit(
        {
          actor: user,
          action: "shipment.update",
          entity: "Shipment",
          entityId: before.id,
          summary: `Edited ${before.trackingNumber} — ${describe(changes, uploaded.length)}`,
          metadata: {
            trackingNumber: before.trackingNumber,
            changes: changes.map(
              (c) => `${LABELS[c.field] ?? c.field}: ${c.before ?? "—"} → ${c.after ?? "—"}`
            ),
            photosAdded: uploaded.length,
          },
        },
        tx
      );
    });

    /*
      A CORRECTED WEIGHT HAS TO REACH THE BILL.

      Editing the kilos here changed the record and left the invoice standing
      on the old figure, so a consignment re-weighed after check-in was billed
      the weight Guangzhou typed — silently, with the right number on the cargo
      page and the wrong one on the customer's bill.

      autoPriceShipments refuses to touch anything that is not still a DRAFT,
      so a confirmed bill and a paid one are untouched: correcting those is
      Finance's, through a discount or an adjustment, and must never happen by
      somebody editing a weight.

      Outside the transaction and unable to fail the edit — the same rule
      check-in follows. The record is already saved; a pricing engine having a
      bad moment must not tell the clerk their correction did not happen.
    */
    const repriced =
      changes.some((c) => c.field === "weightKg" || c.field === "packages")
        ? await autoPriceShipments([before.id], user.id).catch(() => null)
        : null;

    revalidatePath(`/app/cargo/${before.trackingNumber}`);
    revalidatePath("/app/batches");
    revalidatePath("/app/finance");
    return ok({
      trackingNumber: before.trackingNumber,
      repriced: (repriced?.priced ?? 0) > 0,
    });
  } catch (error) {
    return fail(toActionError(error));
  }
}

function describe(
  changes: { field: string }[],
  photos: number
) {
  const parts = changes.map((c) => LABELS[c.field] ?? c.field);
  if (photos > 0) parts.push(`${photos} photo(s)`);
  return parts.join(", ");
}

/** The change history for one shipment, newest first, in the reader's language. */
export async function cargoHistory(shipmentId: string) {
  const locale = await viewerLocale();
  /*
    THE GUARD THE CALLERS ONLY PRETENDED TO BE.

    Every page that shows this history first checks audit.view — but a "use
    server" export is its own public endpoint, and this one answered anybody
    who invoked it with a shipment id: every before/after value, every staff
    name, every timestamp. The check the UI applies now lives where it can
    actually refuse.
  */
  await authorize("audit.view");
  const rows = await prisma.fieldChange.findMany({
    where: { entity: "Shipment", entityId: shipmentId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map((row) => ({
    id: row.id,
    label: t(locale, LABELS[row.field] ?? row.field),
    before: humanise(row.field, row.before),
    after: humanise(row.field, row.after),
    actorName: row.actorName ?? t(locale, "Unknown"),
    createdAt: row.createdAt,
  }));
}

/** Enum values are stored; people read words. */
function humanise(field: string, value: string | null) {
  if (value === null) return "—";
  if (field === "packageType") {
    return PACKAGE_TYPE_LABELS[value]?.many ?? value;
  }
  return value;
}
