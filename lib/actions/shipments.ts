"use server";

import { revalidatePath } from "next/cache";
import type { Origin, Prisma, ShipmentStatus } from "@prisma/client";

import { recordAudit } from "@/lib/audit";
import {
  AIRPORT_LABELS,
  CATEGORY_LABELS,
  categoryFitsRoute,
  routeFor,
} from "@/lib/cargo";
import { normalisePhone } from "@/lib/format";
import {
  generateQrToken,
  nextCustomerCode,
  nextTrackingNumber,
  packageReference,
} from "@/lib/ids";
import { assignToLoadingTable } from "@/lib/batching";
import { quote } from "@/lib/pricing";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import { prisma, type TxClient } from "@/lib/prisma";
import { autoPriceShipments } from "@/lib/auto-price";
import { canAmendCargo, cargoCustody } from "@/lib/rbac";
import { translateText, translationColumns } from "@/lib/translate";
import { filesFrom, putImages } from "@/lib/storage";
import { authorize, type SessionUser } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";
import { exceptionSchema, firstError, shipmentSchema } from "@/lib/validation";

const ORIGIN_PLACE: Record<string, string> = {
  GUANGZHOU: "Guangzhou, China",
  HONG_KONG: "Hong Kong",
};

/**
 * Records a status transition. Always called inside the same transaction as
 * the status change itself, so history can never drift from reality.
 */
async function appendHistory(
  tx: TxClient,
  args: {
    shipmentId: string;
    fromStatus: ShipmentStatus | null;
    toStatus: ShipmentStatus;
    location?: string;
    note?: string;
    actorId: string;
  }
) {
  await tx.shipmentStatusHistory.create({
    data: {
      shipmentId: args.shipmentId,
      fromStatus: args.fromStatus,
      toStatus: args.toStatus,
      location: args.location,
      note: args.note,
      actorId: args.actorId,
    },
  });
}


/**
 * Finds or creates the customer a shipment belongs to.
 *
 * Three routes in, in order of trust:
 *
 *  1. The clerk picked a record from the book. That id wins outright — it is an
 *     explicit human decision and nothing else should override it.
 *  2. A phone number matches an existing customer. Phone numbers are unique, so
 *     this is safe.
 *  3. Nothing matches: a new record is created and enters the book, ready to be
 *     found by name next time.
 *
 * Deliberately does NOT match on name alone when creating. Two different traders
 * called "Daniel" are common, and silently merging their cargo would hand one
 * customer's goods to another.
 */
async function resolveCustomer(
  tx: TxClient,
  input: {
    customerId: string | null;
    customerName: string;
    customerPhone: string;
    customerCity?: string;
  },
  actorId: string,
  /* Guangzhou registers most cargo and reads the app in Chinese, so the
     refusals this throws have to be composed in their language. */
  locale: Locale
) {
  const phone = normalisePhone(input.customerPhone);

  if (input.customerId) {
    const picked = await tx.customer.findUnique({ where: { id: input.customerId } });
    if (!picked) throw new Error("That customer no longer exists.");

    /*
      The number is now collected on every consignment, and the customer the
      clerk picked may predate that. Two things can be true of what they typed:
    */
    /* Already one of theirs — the ordinary case, and the reason this table
       exists: a customer registers from whichever SIM they happened to use. */
    const theirs = await tx.customerPhone.findUnique({ where: { phone } });
    if (theirs?.customerId === picked.id) return picked;

    if (theirs) {
      /* It belongs to somebody else. Guessing which record is right is how one
         customer's cargo reaches another. */
      const owner = await tx.customer.findUnique({
        where: { id: theirs.customerId },
        select: { name: true, code: true },
      });
      /* Composed from translated fragments. A sentence carrying a phone number
         reaches the dictionary already interpolated, so it can never match a
         key — and Guangzhou, who sees this refusal most, reads in Chinese. */
      throw new Error(
        `${phone} ${t(locale, "is already on file as")} ${owner?.name ?? t(locale, "another customer")} (${owner?.code ?? ""}). ${t(locale, "Register this cargo against them, or use a different number.")}`
      );
    }

    /*
      A NEW NUMBER FOR A CUSTOMER WE ALREADY KNOW.

      Two SIMs is not two people. It used to be: the second number matched
      nobody, so a second account appeared with the same name and half the
      balance. Now it joins the account the clerk actually picked, and every
      future consignment from that SIM finds them.
    */
    await tx.customerPhone.create({
      data: {
        customerId: picked.id,
        phone,
        /* Primary only if they had none at all — the number staff already ring
           is not replaced because a customer texted from their other SIM. */
        isPrimary: picked.phone === null,
        addedById: actorId,
      },
    });
    if (picked.phone === null) {
      await tx.customer.update({ where: { id: picked.id }, data: { phone } });
      return { ...picked, phone };
    }
    return picked;
  }

  {
    /* Any of their numbers, not just the primary. */
    const known = await tx.customerPhone.findUnique({
      where: { phone },
      select: { customer: true },
    });
    const existing = known?.customer ?? null;
    if (existing) {
      if (existing.name !== input.customerName) {
        // Keep the most recent spelling the desk used, but never reassign the
        // number to a different person's shipments.
        await tx.customer.update({
          where: { id: existing.id },
          data: { name: input.customerName },
        });
      }
      return existing;
    }
  }

  return tx.customer.create({
    data: {
      code: await nextCustomerCode(tx),
      name: input.customerName,
      phone,
      city: input.customerCity || null,
      createdById: actorId,
      /* Mirrored, so every lookup has one place to ask. */
      phones: { create: { phone, isPrimary: true, addedById: actorId } },
    },
  });
}

export type ShipmentCreated = {
  /* For the mistake caught ten seconds after pressing register: the success
     screen offers delete, and delete addresses the row by id. */
  id: string;
  trackingNumber: string;
  /** The loading table it landed on — the clerk never chose this. */
  batchNumber: string;
  /** Which route's table, for wording the confirmation. */
  origin: Origin;
};

export async function createShipment(
  _prev: ActionResult<ShipmentCreated> | undefined,
  formData: FormData
): Promise<ActionResult<ShipmentCreated>> {
  let user: SessionUser;
  try {
    user = await authorize("shipment.create");
  } catch (error) {
    return fail(toActionError(error));
  }

  const parsed = shipmentSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) return fail(firstError(parsed.error));
  const input = parsed.data;
  const locale = await viewerLocale();

  /*
    Evidence is expected, never enforced.

    A photo at this moment is worth more than any note written later, so the
    form asks for one plainly and says why. But the owner's rule is that it
    must not STOP the work: a clerk with a flat battery, a broken camera or a
    customer already walking out of the door still has to be able to record
    what happened. A block here does not produce a photo — it produces a
    consignment that never gets recorded at all, which is strictly worse than
    one recorded without a picture.
  */
  const photoFiles = filesFrom(formData, "photos");

  let uploaded;
  try {
    // Uploads happen before the transaction: they are slow, and a database
    // transaction must not be held open across network I/O.
    uploaded = await putImages(photoFiles, "receiving");
  } catch (error) {
    return fail(toActionError(error));
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const customer = await resolveCustomer(tx, input, user.id, locale);

      /*
        TWO WAYS A CARGO RECORD IS BORN, AND ONE PLACE THAT WRITES IT.

        Guangzhou registers a box it is receiving: the category fixes the
        route, the route fixes the loading table, and the clerk picks neither,
        so cargo cannot be sent to the wrong hub by a mistyped field.

        Dar adds a box that came off a flight and was never on the manifest.
        There is nothing to work out — the aircraft it arrived on is a fact,
        and the origin is that flight's, not whatever the category would have
        implied. It joins that batch and is checked in with everything else.

        One function either way, so the tracking number, the per-package rows,
        the history line and the audit entry are written once and cannot come
        to differ between the two desks.
      */
      let origin = routeFor(input.cargoCategory);
      let assignment: { batchId: string; batchNumber: string };
      const intoBatch = input.batchId?.trim();

      if (intoBatch) {
        /* Adding to a flight is Dar's job on the floor, and the permission
           that says so is the one that checks a batch in. Asked for here as
           well as at the screen, because this action is a public endpoint. */
        await authorize("batch.verify");
        const batch = await tx.batch.findUnique({
          where: { id: intoBatch },
          select: {
            id: true,
            batchNumber: true,
            origin: true,
            status: true,
            permanent: true,
          },
        });
        if (!batch) throw new Error("That flight no longer exists.");
        /*
          A loading table is not a flight.

          The one refusal left. Cargo joins a loading table by being registered
          in China and waiting for an aircraft; a box the Dar floor is holding
          has already flown. Putting it there would record it as both at once.

          Nothing else is refused: a box turns up weeks after its flight was
          closed, and the desk must still be able to put it where it belongs
          rather than on whichever flight happens to be open.
        */
        if (batch.permanent) {
          throw new Error(
            `${batch.batchNumber} is a loading table, not a flight. Register the cargo normally and it will be assigned.`
          );
        }
        origin = batch.origin;
        assignment = { batchId: batch.id, batchNumber: batch.batchNumber };
      } else {
        assignment = await assignToLoadingTable(tx, origin);
      }

      // Cargo billed per item is counted in items, not cartons.
      //
      // One number does two jobs on this record: how many things the warehouse
      // must physically account for, and — for a product on a per-item rate —
      // how many units the customer is charged for. When the rate book prices
      // by the item, the label has to say so, or a manifest reads "8 packages"
      // while the invoice charges for 8 cameras and nobody can tell which is
      // meant. Enforced here rather than in the form, because the desk should
      // not have to know which products carry which kind of rate.
      const priced = await quote({
        category: input.cargoCategory,
        cargoTypeId: input.cargoTypeId,
        weightKg: input.weightKg,
        quantity: input.packages,
      });
      const packageType =
        priced.ok && priced.method === "FIXED_PER_ITEM"
          ? "PIECE"
          : input.packageType;

      /*
        Both languages, worked out before the row is written.

        The Guangzhou desk types in whichever language it thinks in; Dar,
        Finance and Support read English. Neither should translate anything by
        hand, and the original is never replaced — these only add columns
        beside it.

        Never fatal: an unknown word, or a translation service that is slow or
        down, leaves the rendering null and every screen falls back to what was
        typed. Registering cargo does not wait on a third party with a customer
        at the counter.
      */
      const describedAs = await translateText(input.description, { learn: true, tx });
      const notedAs = await translateText(input.internalNotes, { tx });

      const shipment = await tx.shipment.create({
        data: {
          trackingNumber: await nextTrackingNumber(tx),
          qrToken: generateQrToken(),
          customerId: customer.id,
          cargoCategory: input.cargoCategory,
          cargoTypeId: input.cargoTypeId,
          goodsType: input.goodsType,
          ...translationColumns("description", describedAs),
          description: input.description,
          packages: input.packages,
          packageType,
          weightKg: input.weightKg,
          volumeCbm: input.volumeCbm ?? null,
          origin,
          ...translationColumns("internalNotes", notedAs),
          internalNotes: input.internalNotes || null,
          batchId: assignment.batchId,
          /*
            ALREADY IN DAR, BECAUSE IT IS.

            The box is on the floor in front of the person filling this in.
            Recording it as in transit would send it back through an arrival
            it has already made — it would sit on the manifest waiting to land,
            and the desk that just held it would have to tick it in again.

            So it is received, the arrival is stamped, and it goes straight
            into the queue that prices everything else the floor has taken in.
          */
          status: intoBatch ? "RECEIVED_AT_DAR" : "READY_TO_DEPART",
          arrivedAt: intoBatch ? new Date() : null,
          createdById: user.id,
        },
      });

      // One row per physical package, each with its own QR. The warehouse
      // handles boxes, not orders, so every box needs its own identity.
      await tx.package.createMany({
        data: Array.from({ length: input.packages }, (_, index) => ({
          shipmentId: shipment.id,
          sequence: index + 1,
          reference: packageReference(shipment.trackingNumber, index + 1),
          qrToken: generateQrToken(),
          /*
            A BOX ADDED AT THE COUNTER IS ALREADY ON THE FLOOR.

            The row was created un-ticked, and the only four writers of
            Package.receivedAt are the check-in paths — every one of which
            refuses a flight that is not ARRIVED or VERIFIED. So a carton
            registered onto a CLOSED flight could never be ticked by anybody,
            and the release counter refuses on "0/3 packages checked in" for
            ever: billed, paid for, and then turned away.

            Somebody is holding it and has just said so, which is exactly the
            reasoning the check-in's own extra-carton branch gives.
          */
          ...(intoBatch ? { receivedAt: new Date(), receivedById: user.id } : {}),
})),
      });

      await tx.shipmentPhoto.createMany({
        data: uploaded.map((image, index) => ({
          shipmentId: shipment.id,
          url: image.url,
          kind: "CARGO" as const,
          caption:
            index === 0
              ? intoBatch
                ? "Photographed at Dar when it was found off the manifest"
                : "Received at the China warehouse"
              : null,
          uploadedById: user.id,
        })),
      });

      await appendHistory(tx, {
        shipmentId: shipment.id,
        fromStatus: null,
        toStatus: intoBatch ? "RECEIVED_AT_DAR" : "READY_TO_DEPART",
        location: intoBatch ? "Dar es Salaam" : ORIGIN_PLACE[origin],
        note: intoBatch
          ? `Found on the Dar floor and added to ${assignment.batchNumber} — it was never on the manifest. Priced from the weight recorded here, for Finance to confirm.`
          : `Cargo received and registered as ${CATEGORY_LABELS[input.cargoCategory].toLowerCase()}, waiting on the ${AIRPORT_LABELS[origin]} loading table.`,
        actorId: user.id,
      });

      await recordAudit(
        {
          actor: user,
          action: "shipment.create",
          entity: "Shipment",
          entityId: shipment.id,
          summary: intoBatch
            ? `Added ${shipment.trackingNumber} for ${customer.name} to ${assignment.batchNumber} — found at Dar, not on the manifest`
            : `Registered ${shipment.trackingNumber} for ${customer.name}`,
          metadata: {
            packages: input.packages,
            weightKg: input.weightKg,
            cargoCategory: input.cargoCategory,
            origin,
            photos: uploaded.length,
            loadingTable: assignment.batchNumber,
            addedAtDar: Boolean(intoBatch),
          },
        },
        tx
      );

      return { shipment, assignment, intoBatch: Boolean(intoBatch) };
    });

    /*
      INTO THE PRICING QUEUE, THE SAME WAY EVERY OTHER DAR ARRIVAL GETS THERE.

      A box added at Dar has landed, so it is priced from the weight recorded
      here — exactly what the manifest check-in does for the rest of the
      flight. That raises a DRAFT, which is what puts it in front of Finance,
      the manager, the owner and Support to confirm. Dar does not set the
      price; it states the weight.

      Outside the transaction, and never fatal, for the reasons priceAfterCheckIn
      gives: it is slow, and a cargo record that exists without a draft is a
      bill somebody raises by hand, while a record that failed to save is a box
      nobody can find.
    */
    if (result.intoBatch) {
      try {
        await autoPriceShipments([result.shipment.id], user.id);
      } catch (error) {
        console.error("Auto-pricing failed after cargo was added at Dar", {
          shipmentId: result.shipment.id,
          error,
        });
      }
    }

    revalidatePath("/app/cargo");
    revalidatePath("/app/dashboard");
    revalidatePath("/app/batches");
    revalidatePath("/app/finance");
    revalidatePath(`/app/batches/${result.assignment.batchId}`);
    revalidatePath(`/app/receive/${result.assignment.batchId}`);

    return ok({
      id: result.shipment.id,
      trackingNumber: result.shipment.trackingNumber,
      batchNumber: result.assignment.batchNumber,
      origin: result.shipment.origin,
    });
  } catch (error) {
    return fail(toActionError(error));
  }
}

/*
  updateShipment IS GONE.

  It was a second, older edit path: same fields as updateCargo, no caller
  anywhere in app/ or components/, and still a live "use server" endpoint. Two
  things made keeping it worse than deleting it — it rewrote Shipment.packages
  without creating or deleting the Package rows underneath, so the box count and
  the cartons that carry the QR codes could be walked out of step by anyone who
  could reach the endpoint; and it wrote no FieldChange at all, so a correction
  made through it left no trace on the cargo's history.

  updateCargo does both correctly and is the one the screens actually drive.
*/

export async function raiseException(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  let user: SessionUser;
  try {
    user = await authorize("exception.raise");
  } catch (error) {
    return fail(toActionError(error));
  }

  const parsed = exceptionSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) return fail(firstError(parsed.error));
  const input = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const shipment = await tx.shipment.findUnique({
        where: { id: input.shipmentId },
        select: { id: true, trackingNumber: true, batchId: true },
      });
      if (!shipment) throw new Error("Shipment not found.");

      await tx.shipmentException.create({
        data: {
          shipmentId: shipment.id,
          batchId: shipment.batchId,
          type: input.type,
          description: input.description,
          raisedById: user.id,
        },
      });

      await recordAudit(
        {
          actor: user,
          action: "exception.raise",
          entity: "Shipment",
          entityId: shipment.id,
          summary: `Exception on ${shipment.trackingNumber}: ${input.type}`,
          metadata: { description: input.description },
        },
        tx
      );
    });

    revalidatePath("/app/exceptions");
    revalidatePath(`/app/cargo/${input.shipmentId}`);
    return ok();
  } catch (error) {
    return fail(toActionError(error));
  }
}

/*
 * resolveException lived here and had no screen on it.
 *
 * Its only caller was ResolveExceptionForm, whose only caller was the
 * ExceptionCard exported from components/app/exception-card.tsx — a component
 * nothing imported. Every list renders the card defined inside
 * exception-table.tsx instead. So the button was gone and the endpoint was
 * not: a "use server" export is a public endpoint whether or not anything
 * renders it, and this one wrote a TERMINAL status, which lifts the pickup
 * lock and lets flagged cargo out of the building.
 *
 * Closing a case goes through resolveInvestigation, which asks what actually
 * happened, records it against the case and writes CLOSED.
 *
 * The "exception.resolve" audit string stays in lib/audit-humanise.ts: it is
 * still written on every live close, not merely by old rows.
 */
