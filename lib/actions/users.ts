"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";

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
    const user = await prisma.user.update({
      where: { id: userId },
      // `status` is what a manager reads; `active` is what the sign-in check
      // asks. They have to move together or someone is locked out of a screen
      // that says they are fine.
      data: { active, status: active ? "ACTIVE" : "SUSPENDED" },
      select: { id: true, name: true },
    });

    await recordAudit({
      actor,
      action: active ? "user.activate" : "user.deactivate",
      entity: "User",
      entityId: user.id,
      summary: `${active ? "Reactivated" : "Deactivated"} ${user.name}`,
    });

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
    const user = await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(password, 12) },
      select: { id: true, name: true },
    });

    await recordAudit({
      actor,
      action: "user.resetPassword",
      entity: "User",
      entityId: user.id,
      summary: `Reset the password for ${user.name}`,
    });

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
    const user = await prisma.user.update({
      where: { id: userId },
      data: { role, department: ROLE_DEFAULT_DEPARTMENT[role] },
      select: { id: true, name: true },
    });

    await recordAudit({
      actor,
      action: "user.changeRole",
      entity: "User",
      entityId: user.id,
      summary: `Moved ${user.name} to ${ROLE_LABELS[role]}`,
    });

    revalidatePath("/app/admin/users");
    return ok();
  } catch (error) {
    return fail(toActionError(error));
  }
}
