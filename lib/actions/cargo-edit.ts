"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { PACKAGE_TYPE_LABELS } from "@/lib/constants";
import { normalisePhone } from "@/lib/format";
import { t } from "@/lib/i18n";
import { packageReference } from "@/lib/ids";
import { generateQrToken } from "@/lib/ids";
import type { Locale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { authorize, type SessionUser } from "@/lib/session";
import { filesFrom, putImages } from "@/lib/storage";
import { viewerLocale } from "@/lib/viewer";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";

/**
 * Correcting a piece of cargo.
 *
 * The desk that took it in is the desk that mistyped the weight, so warehouse
 * staff can fix their own work rather than registering a second shipment for
 * the same boxes. What stops that being dangerous is the window: only cargo
 * still sitting in China can be edited, because once it is on a plane it has
 * been printed onto a manifest and billed against.
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
  customerPhone: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v?.length ? v : null)),
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
        packageList: { select: { sequence: true }, orderBy: { sequence: "asc" } },
      },
    });
    if (!before) return fail(t(locale, "That cargo no longer exists."));

    // The window. An admin can still correct a record after it has flown —
    // sometimes a weight genuinely was recorded wrong — but a warehouse cannot,
    // because the manifest in the customs officer's hand would stop matching.
    const stillInChina = before.status === "READY_TO_DEPART";
    if (!stillInChina && !(await canPurge(user))) {
      return fail(
        t(locale, "This cargo has already left China. Ask management to correct it.")
      );
    }

    const phone = input.customerPhone
      ? normalisePhone(input.customerPhone)
      : null;

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

    revalidatePath(`/app/cargo/${before.trackingNumber}`);
    revalidatePath("/app/batches");
    return ok({ trackingNumber: before.trackingNumber });
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

async function canPurge(user: SessionUser) {
  const { can } = await import("@/lib/rbac");
  return can(user.role, "shipment.purge");
}

/** The change history for one shipment, newest first, in the reader's language. */
export async function cargoHistory(shipmentId: string) {
  const locale = await viewerLocale();
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
