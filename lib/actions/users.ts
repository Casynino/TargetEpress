"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";

import { recordAudit } from "@/lib/audit";
import { ROLE_DEFAULT_DEPARTMENT, ROLE_LABELS } from "@/lib/constants";
import { normalisePhone } from "@/lib/format";
import { defaultLocaleForRole } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { authorize, type SessionUser } from "@/lib/session";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";
import { t } from "@/lib/i18n";
import { firstError, userSchema } from "@/lib/validation";
import { viewerLocale } from "@/lib/viewer";

/**
 * Staff accounts — and the four rails that stop staffing from being a way to
 * take the company.
 *
 * The owner has handed hiring to the manager: MANAGER holds `user.manage`, so a
 * manager opens accounts, assigns roles, suspends people and resets passwords
 * without asking anybody. That is the point of the delegation, and it is also
 * the one capability that can grant every other one — whoever hands out roles
 * can hand one to himself. A manager able to mint an ADMIN, or to move a second
 * account he opened an hour ago into ADMIN, would hold the rate book, the bank
 * accounts, the company settings and the power to purge records for good: every
 * line the owner deliberately kept back in lib/rbac.ts, gone in two clicks, with
 * nothing in the log looking worse than "staff account created".
 *
 * So ADMIN stays the owner's, and only an ADMIN writes it. Four places, one rule:
 *
 *   createUser         nobody but the owner creates an owner.
 *   changeUserRole     nobody but the owner moves somebody INTO the owner's
 *                      role — and nobody but the owner moves somebody OUT of
 *                      it, or a manager demotes the owner first and then does
 *                      as he likes with what is left.
 *   setUserActive      an owner account somebody else can switch off is not the
 *   resetUserPassword  owner's, and one somebody else can give a new password
 *                      to is theirs. Both are the same theft as a role change
 *                      with an extra step, so both are barred in either
 *                      direction — a manager does not reactivate a suspended
 *                      owner account either, because the owner suspended it.
 *
 * WHY HERE AND NOT IN THE PERMISSION TABLE. A permission answers "may this desk
 * edit staff accounts", and the manager may — that is exactly what was handed
 * over. What has to be said instead is "may this desk write THIS VALUE into that
 * column", and can(role, permission) has no vocabulary for a value. The only way
 * to express it in rbac.ts is to take the whole capability back, which is the
 * thing the owner just undid. So it lives at the last point before the write,
 * where the value and the row are both in hand.
 *
 * The row is read inside the same transaction that writes it, and the write is
 * then claimed on the role that was read (`where: { id, role }`, count === 0).
 * The form is not evidence of anything: it is composed by the browser of the
 * very person the rule is aimed at. And a role read a second before an
 * unconditional update is a read-then-write race whose losing case is the owner
 * being demoted by his own manager while the guard reads "he is only Finance".
 *
 * Every refusal is a fail() carrying a sentence, never a throw, and every one is
 * written to the audit log. A blocked attempt to mint an owner is the most
 * interesting line this log will ever hold — and the only trace there would be,
 * since nothing changed and so nothing else records that anything was tried.
 */

/** The role that owns the company. Named, so the rails below read as the rule. */
const OWNER: Role = "ADMIN";

/*
  The two sentences the rails refuse with.

  Written in the owner's words rather than the system's: no "permission", no
  role name, no enum. Whoever reads one is usually not attacking anything — they
  are staffing the company and have walked into the single thing that was not
  delegated — so the sentence names who can do it instead of announcing that
  they are unauthorised.
*/
const OWNER_ONLY_CREATE = "Only the owner can create another owner account.";
const OWNER_ONLY_CHANGE = "Only the owner can change the owner's account.";

/*
  What a guarded write returns to its action.

  A refusal cannot be thrown: these actions answer a form, and a throw would
  reach the manager as toActionError's generic apology instead of the sentence
  written for them. So the transaction reports its own outcome and the caller
  turns it into fail() — which also lets the refusal be audited inside the same
  transaction that read the role it refused on.
*/
type Guarded = { error: string | null };

export async function createUser(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  let actor: SessionUser;
  try {
    actor = await authorize("user.manage");
  } catch (error) {
    return fail(toActionError(error));
  }

  const parsed = userSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) return fail(firstError(parsed.error));
  const input = parsed.data;
  const email = input.email.toLowerCase();

  try {
    /*
      The first rail. No transaction here and none needed: this account does not
      exist yet, so there is no row whose role could change underneath the check
      — and the value tested is literally the one the create below writes.
    */
    if (input.role === OWNER && actor.role !== OWNER) {
      await recordAudit({
        actor,
        action: "user.escalationBlocked",
        entity: "User",
        summary: `Blocked an attempt to create ${input.name} as ${ROLE_LABELS[OWNER]}`,
        metadata: { attempted: "create", requestedRole: input.role, email },
      });
      return fail(t(await viewerLocale(), OWNER_ONLY_CREATE));
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return fail(t(await viewerLocale(), "A staff account already uses that email."));

    if (input.employeeId) {
      const clash = await prisma.user.findUnique({
        where: { employeeId: input.employeeId },
        select: { name: true },
      });
      if (clash) {
        // Built by interpolation, so it can never match a dictionary keyed on
        // the finished sentence. The key carries the slots instead and the
        // sentence is composed here, where each language can put the number
        // and the name where its own grammar wants them.
        const locale = await viewerLocale();
        return fail(
          t(locale, "Employee ID {id} already belongs to {name}.")
            .replace("{id}", input.employeeId)
            .replace("{name}", clash.name)
        );
      }
    }

    const warehouse =
      input.role === "CHINA_WAREHOUSE" || input.role === "DAR_WAREHOUSE";

    const user = await prisma.user.create({
      data: {
        name: input.name,
        email,
        phone: input.phone ? normalisePhone(input.phone) : null,
        passwordHash: await bcrypt.hash(input.password, 12),
        role: input.role,
        department: ROLE_DEFAULT_DEPARTMENT[input.role],
        employeeId: input.employeeId,
        // A rank on a Finance account would be a field nobody can act on.
        rank: warehouse ? input.rank ?? "OPERATOR" : null,
        // Guangzhou opens in Chinese; every Tanzanian desk opens in English.
        // A starting point only — whatever the person picks later overrides it.
        preferredLanguage: defaultLocaleForRole(input.role),
        status: input.status,
        active: input.status === "ACTIVE",
        createdById: actor.id,
      },
    });

    await recordAudit({
      actor,
      action: "user.create",
      entity: "User",
      entityId: user.id,
      summary: `Created ${user.name} as ${ROLE_LABELS[user.role]}`,
      metadata: {
        employeeId: user.employeeId ?? "not set",
        rank: user.rank ?? "n/a",
        status: user.status,
      },
    });

    revalidatePath("/app/admin/users");
    return ok();
  } catch (error) {
    return fail(toActionError(error));
  }
}

export async function setUserActive(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  let actor: SessionUser;
  try {
    actor = await authorize("user.manage");
  } catch (error) {
    return fail(toActionError(error));
  }

  const userId = String(formData.get("userId") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  if (!userId) return fail(t(await viewerLocale(), "Missing staff member."));
  // Locking yourself out would leave the company with no way back in.
  if (userId === actor.id) return fail(t(await viewerLocale(), "You cannot deactivate your own account."));

  try {
    const outcome = await prisma.$transaction(async (tx): Promise<Guarded> => {
      const target = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, role: true },
      });
      if (!target) return { error: "That staff member no longer exists." };

      /*
        Barred in both directions, deliberately. Switching the owner off is the
        obvious attack; switching a suspended owner account back ON is the
        quieter one — the owner is the only person who could have suspended it,
        and a manager reviving it is overruling that decision on the one account
        that answers to nobody.
      */
      if (target.role === OWNER && actor.role !== OWNER) {
        await recordAudit(
          {
            actor,
            action: "user.escalationBlocked",
            entity: "User",
            entityId: target.id,
            summary: `Blocked an attempt to ${active ? "reactivate" : "deactivate"} ${target.name}, the ${ROLE_LABELS[OWNER]} account`,
            metadata: { attempted: active ? "activate" : "deactivate", targetRole: target.role },
          },
          tx
        );
        return { error: OWNER_ONLY_CHANGE };
      }

      const claimed = await tx.user.updateMany({
        // Claimed on the role the guard just read, so a promotion landing
        // between the read and the write loses instead of slipping past it.
        where: { id: target.id, role: target.role },
        // `status` is what a manager reads; `active` is what the sign-in check
        // asks. They have to move together or someone is locked out of a screen
        // that says they are fine.
        data: { active, status: active ? "ACTIVE" : "SUSPENDED" },
      });
      if (claimed.count === 0) {
        return {
          error: "That person's role changed a moment ago. Reload before changing their account.",
        };
      }

      await recordAudit(
        {
          actor,
          action: active ? "user.activate" : "user.deactivate",
          entity: "User",
          entityId: target.id,
          summary: `${active ? "Reactivated" : "Deactivated"} ${target.name}`,
        },
        tx
      );
      return { error: null };
    });

    if (outcome.error) return fail(t(await viewerLocale(), outcome.error));

    revalidatePath("/app/admin/users");
    return ok();
  } catch (error) {
    return fail(toActionError(error));
  }
}

export async function resetUserPassword(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  let actor: SessionUser;
  try {
    actor = await authorize("user.manage");
  } catch (error) {
    return fail(toActionError(error));
  }

  const userId = String(formData.get("userId") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!userId) return fail(t(await viewerLocale(), "Missing staff member."));
  if (password.length < 8) return fail(t(await viewerLocale(), "Password must be at least 8 characters."));

  try {
    // Hashed before the transaction opens. bcrypt at cost 12 is deliberately
    // ~100ms of CPU, and spending it holding a row lock on a staff account is
    // how the admin screen starts timing out under two people at once.
    const passwordHash = await bcrypt.hash(password, 12);

    const outcome = await prisma.$transaction(async (tx): Promise<Guarded> => {
      const target = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, role: true },
      });
      if (!target) return { error: "That staff member no longer exists." };

      /*
        Handing somebody a password is handing them the account. Left open, this
        is the cheapest of all the routes: no role changes, nothing on the users
        screen looks different, and the manager simply signs in as the owner.
      */
      if (target.role === OWNER && actor.role !== OWNER) {
        await recordAudit(
          {
            actor,
            action: "user.escalationBlocked",
            entity: "User",
            entityId: target.id,
            summary: `Blocked an attempt to reset the password of ${target.name}, the ${ROLE_LABELS[OWNER]} account`,
            metadata: { attempted: "resetPassword", targetRole: target.role },
          },
          tx
        );
        return { error: OWNER_ONLY_CHANGE };
      }

      const claimed = await tx.user.updateMany({
        where: { id: target.id, role: target.role },
        data: { passwordHash },
      });
      if (claimed.count === 0) {
        return {
          error: "That person's role changed a moment ago. Reload before resetting their password.",
        };
      }

      await recordAudit(
        {
          actor,
          action: "user.resetPassword",
          entity: "User",
          entityId: target.id,
          summary: `Reset the password for ${target.name}`,
        },
        tx
      );
      return { error: null };
    });

    if (outcome.error) return fail(t(await viewerLocale(), outcome.error));

    revalidatePath("/app/admin/users");
    return ok();
  } catch (error) {
    return fail(toActionError(error));
  }
}

export async function changeUserRole(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  let actor: SessionUser;
  try {
    actor = await authorize("user.manage");
  } catch (error) {
    return fail(toActionError(error));
  }

  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "") as keyof typeof ROLE_LABELS;
  if (!userId || !ROLE_LABELS[role]) return fail(t(await viewerLocale(), "Choose a valid role."));
  if (userId === actor.id) return fail(t(await viewerLocale(), "You cannot change your own role."));

  try {
    const outcome = await prisma.$transaction(async (tx): Promise<Guarded> => {
      const target = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, role: true },
      });
      if (!target) return { error: "That staff member no longer exists." };

      /*
        Both halves of the same rule, and the second is the one that is easy to
        forget: barring promotion INTO the owner's role alone still leaves a
        manager able to demote the owner to Finance, at which point there is no
        owner left to overrule anything and the manager runs the company by
        default.

        `role` is the form's, and that is correct — it is the request itself, and
        the same value the write below carries. Who the person IS comes off the
        row read a line ago, inside this transaction, because that is the half a
        browser would lie about.
      */
      if (actor.role !== OWNER && (role === OWNER || target.role === OWNER)) {
        await recordAudit(
          {
            actor,
            action: "user.escalationBlocked",
            entity: "User",
            entityId: target.id,
            summary: `Blocked an attempt to move ${target.name} from ${ROLE_LABELS[target.role]} to ${ROLE_LABELS[role]}`,
            metadata: { attempted: "changeRole", from: target.role, to: role },
          },
          tx
        );
        return { error: OWNER_ONLY_CHANGE };
      }

      const claimed = await tx.user.updateMany({
        where: { id: target.id, role: target.role },
        data: { role, department: ROLE_DEFAULT_DEPARTMENT[role] },
      });
      if (claimed.count === 0) {
        return {
          error: "Somebody changed that person's role a moment ago. Reload before changing it again.",
        };
      }

      await recordAudit(
        {
          actor,
          action: "user.changeRole",
          entity: "User",
          entityId: target.id,
          summary: `Moved ${target.name} to ${ROLE_LABELS[role]}`,
        },
        tx
      );
      return { error: null };
    });

    if (outcome.error) return fail(t(await viewerLocale(), outcome.error));

    revalidatePath("/app/admin/users");
    return ok();
  } catch (error) {
    return fail(toActionError(error));
  }
}
