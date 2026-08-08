"use server";

import { revalidatePath } from "next/cache";
import type { ExceptionStatus, Role } from "@prisma/client";

import { recordAudit } from "@/lib/audit";
import { EXCEPTION_STATUS_LABELS } from "@/lib/constants";
import {
  NOTE_REQUIRED_ON,
  isTerminalStep,
  stepTo,
} from "@/lib/investigation-lifecycle";
import { notify } from "@/lib/notify";
import { prisma, type TxClient } from "@/lib/prisma";
import {
  approveCompensation,
  markCargoFound,
} from "@/lib/actions/investigations";
import { can } from "@/lib/rbac";
import { authorize, type SessionUser } from "@/lib/session";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";

/**
 * Moving an investigation along.
 *
 * Everything here writes two things at once — the case row and a line in its
 * timeline — so a status that changed without anybody's name on it is not a
 * state this table can reach. Both go in the same transaction as the audit
 * entry and the notification, because a case that quietly advanced while
 * Customer Support was never told is the exact failure the owner is describing
 * when they say a customer must never see "Ready for pickup" for cargo nobody
 * can find.
 *
 * No action here trusts the form. The posted target status is looked up in
 * LIFECYCLE_STEPS against the row as it is *now*, and the permission on that
 * step is authorised before a single write happens — two people working the
 * same case on two phones cannot combine their buttons into a move neither of
 * them was allowed to make.
 */

const CASE_PATHS = ["/app/exceptions", "/app/dashboard"];

function revalidateCase(trackingNumber: string | null) {
  for (const path of CASE_PATHS) revalidatePath(path);
  if (trackingNumber) revalidatePath(`/app/cargo/${trackingNumber}`);
}

/**
 * Who hears about a case moving.
 *
 * The spec names Customer Support and Admin on every investigation event, and
 * Finance as well the moment money is on the table. Addressed explicitly rather
 * than fanned out to everyone: a notification with no clear reader is an
 * announcement, and this is a queue, not a noticeboard.
 */
async function watchers(
  tx: TxClient,
  roles: Role[],
  exclude: string
): Promise<string[]> {
  const rows = await tx.user.findMany({
    where: { active: true, role: { in: roles }, id: { not: exclude } },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

/**
 * Move a case one step along the lifecycle.
 *
 * Two of the steps this queue offers are not status changes and are not written
 * here. Finding a box puts it back in Available Cargo and can return the
 * cargo to Ready for Pickup; approving a payout opens a Finance workflow. Both
 * already have their own actions, so this one hands over to them rather than
 * writing a thinner second version of the same physical event.
 */
export async function advanceInvestigation(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  // Signed in and able to see the queue at all. Which *step* this person may
  // take is a second question, answered below against the case as it stands —
  // the permission on the step, never the role.
  let user: SessionUser;
  try {
    user = await authorize("exception.raise");
  } catch (error) {
    return fail(toActionError(error));
  }

  const id = String(formData.get("exceptionId") ?? "");
  const target = String(formData.get("to") ?? "") as ExceptionStatus;
  const note = String(formData.get("note") ?? "").trim();
  if (!id || !target) return fail("Missing case.");

  // Hand the two specialist steps over before opening a transaction of our own.
  // Both re-read the case, re-check their own permission and run their own
  // guards, so this is a routing decision, not a trust decision.
  const current = await prisma.shipmentException.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!current) return fail("Case not found.");

  const route = stepTo(current.status, target);
  if (route && route.via !== "advance") {
    const result =
      route.via === "cargoFound"
        ? await markCargoFound(undefined, formData)
        : await approveCompensation(undefined, formData);
    // The delegates carry richer payloads; the queue only needs to know whether
    // the move landed.
    return result.ok ? ok() : fail(result.error);
  }

  try {
    const trackingNumber = await prisma.$transaction(async (tx) => {
      const exception = await tx.shipmentException.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          type: true,
          shipment: { select: { trackingNumber: true } },
          compensation: { select: { id: true, paidAt: true } },
        },
      });
      if (!exception) throw new Error("Case not found.");

      const step = stepTo(exception.status, target);
      if (step && step.via !== "advance") {
        // The status moved under us between the routing read and here, into one
        // whose step belongs to another action. Refusing beats writing a
        // half-move.
        throw new Error("This case has moved on. Reload and try again.");
      }
      if (!step) {
        throw new Error(
          `A case that is ${EXCEPTION_STATUS_LABELS[
            exception.status
          ].toLowerCase()} cannot move to ${EXCEPTION_STATUS_LABELS[
            target
          ].toLowerCase()}.`
        );
      }

      // Checked against the step that is actually available now, not the one
      // the browser drew a button for. Two people working the same case on two
      // phones cannot combine their buttons into a move neither may make.
      if (!can(user.role, step.permission)) {
        throw new Error("You do not have permission to do that.");
      }

      if (NOTE_REQUIRED_ON.includes(target) && note.length < 3) {
        throw new Error("Say why — this decision is on the record.");
      }

      // Money before paperwork: a case cannot be declared finished while a
      // payout it authorised is still sitting unpaid, and a compensation case
      // cannot be closed before Finance has recorded anything at all.
      if (target === "CLOSED") {
        if (exception.compensation && !exception.compensation.paidAt) {
          throw new Error(
            "Finance has not recorded the payment yet — this case stays open until they have."
          );
        }
        if (exception.status === "COMPENSATION_APPROVED" && !exception.compensation) {
          throw new Error(
            "No compensation has been recorded against this case yet."
          );
        }
      }

      const terminal = isTerminalStep(target);
      await tx.shipmentException.update({
        where: { id },
        data: {
          status: target,
          ...(terminal
            ? {
                resolvedById: user.id,
                resolvedAt: new Date(),
                ...(note ? { resolutionNote: note } : {}),
              }
            : { resolvedById: null, resolvedAt: null }),
        },
      });

      await tx.exceptionEvent.create({
        data: {
          exceptionId: id,
          action: target === "CLOSED" ? "closed" : "status.changed",
          note:
            `${EXCEPTION_STATUS_LABELS[exception.status]} → ${EXCEPTION_STATUS_LABELS[target]}` +
            (note ? ` — ${note}` : ""),
          actorId: user.id,
        },
      });

      await recordAudit(
        {
          actor: user,
          action: "exception.status",
          entity: "ShipmentException",
          entityId: id,
          summary: `${exception.shipment.trackingNumber}: ${EXCEPTION_STATUS_LABELS[exception.status]} → ${EXCEPTION_STATUS_LABELS[target]}`,
          metadata: { from: exception.status, to: target, note: note || null },
        },
        tx
      );

      // Finance is told when a payout has been authorised — they are the desk
      // that has to act on it next.
      const roles: Role[] = ["ADMIN", "CUSTOMER_CARE"];
      if (target === "REPLACEMENT_APPROVED") roles.push("FINANCE");

      await notify(
        {
          userIds: await watchers(tx, roles, user.id),
          kind: "exception.status",
          title: `${exception.shipment.trackingNumber} — ${EXCEPTION_STATUS_LABELS[target].toLowerCase()}`,
          body: note || `Moved by ${user.name}.`,
          href: `/app/exceptions?tracking=${exception.shipment.trackingNumber}`,
        },
        tx
      );

      return exception.shipment.trackingNumber;
    });

    revalidateCase(trackingNumber);
    return ok();
  } catch (error) {
    return fail(toActionError(error));
  }
}

/**
 * A note on the case.
 *
 * Support's phone calls and the warehouse's search notes land in the same
 * timeline as the status changes, because "we called her on Tuesday, she wants
 * a refund" is the reason the next status change makes sense.
 */
export async function addInvestigationNote(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  let user: SessionUser;
  try {
    user = await authorize("exception.investigate");
  } catch (error) {
    return fail(toActionError(error));
  }

  const id = String(formData.get("exceptionId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!id) return fail("Missing case.");
  if (note.length < 3) return fail("Write the note before adding it.");

  try {
    const trackingNumber = await prisma.$transaction(async (tx) => {
      const exception = await tx.shipmentException.findUnique({
        where: { id },
        select: { id: true, shipment: { select: { trackingNumber: true } } },
      });
      if (!exception) throw new Error("Case not found.");

      await tx.exceptionEvent.create({
        data: {
          exceptionId: id,
          action: "note.added",
          note,
          actorId: user.id,
        },
      });

      await recordAudit(
        {
          actor: user,
          action: "exception.note",
          entity: "ShipmentException",
          entityId: id,
          summary: `Note on ${exception.shipment.trackingNumber}`,
          metadata: { note },
        },
        tx
      );

      return exception.shipment.trackingNumber;
    });

    revalidateCase(trackingNumber);
    return ok();
  } catch (error) {
    return fail(toActionError(error));
  }
}

/** Hand a case to a named person. The CEO's reassign. */
export async function assignInvestigation(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  let user: SessionUser;
  try {
    user = await authorize("exception.approve");
  } catch (error) {
    return fail(toActionError(error));
  }

  const id = String(formData.get("exceptionId") ?? "");
  const assigneeId = String(formData.get("assignedToId") ?? "");
  if (!id) return fail("Missing case.");

  try {
    const trackingNumber = await prisma.$transaction(async (tx) => {
      const exception = await tx.shipmentException.findUnique({
        where: { id },
        select: {
          id: true,
          assignedToId: true,
          shipment: { select: { trackingNumber: true } },
        },
      });
      if (!exception) throw new Error("Case not found.");

      let assignee: { id: string; name: string; role: Role } | null = null;
      if (assigneeId) {
        assignee = await tx.user.findFirst({
          where: { id: assigneeId, active: true },
          select: { id: true, name: true, role: true },
        });
        if (!assignee) throw new Error("That person is not an active user.");
        if (!can(assignee.role, "exception.investigate")) {
          throw new Error(
            "That person's role cannot work investigations — pick someone from the warehouse, support or management."
          );
        }
      }

      if (exception.assignedToId === (assignee?.id ?? null)) return null;

      await tx.shipmentException.update({
        where: { id },
        data: { assignedToId: assignee?.id ?? null },
      });

      await tx.exceptionEvent.create({
        data: {
          exceptionId: id,
          action: "assigned",
          note: assignee
            ? `Assigned to ${assignee.name}.`
            : "Assignment cleared.",
          actorId: user.id,
        },
      });

      await recordAudit(
        {
          actor: user,
          action: "exception.assign",
          entity: "ShipmentException",
          entityId: id,
          summary: assignee
            ? `${exception.shipment.trackingNumber} assigned to ${assignee.name}`
            : `${exception.shipment.trackingNumber} unassigned`,
          metadata: { assignedToId: assignee?.id ?? null },
        },
        tx
      );

      if (assignee) {
        await notify(
          {
            userIds: [assignee.id],
            kind: "exception.assigned",
            title: `You are now carrying ${exception.shipment.trackingNumber}`,
            body: `${user.name} handed you this investigation.`,
            href: `/app/exceptions?tracking=${exception.shipment.trackingNumber}`,
          },
          tx
        );
      }

      return exception.shipment.trackingNumber;
    });

    revalidateCase(trackingNumber);
    return ok();
  } catch (error) {
    return fail(toActionError(error));
  }
}
