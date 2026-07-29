"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";

import { recordAudit } from "@/lib/audit";
import { ROLE_DEFAULT_DEPARTMENT, ROLE_LABELS } from "@/lib/constants";
import { normalisePhone } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { authorize, type SessionUser } from "@/lib/session";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";
import { firstError, userSchema } from "@/lib/validation";

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
    if (existing) return fail("A staff account already uses that email.");

    const user = await prisma.user.create({
      data: {
        name: input.name,
        email,
        phone: input.phone ? normalisePhone(input.phone) : null,
        passwordHash: await bcrypt.hash(input.password, 12),
        role: input.role,
        department: ROLE_DEFAULT_DEPARTMENT[input.role],
        createdById: actor.id,
      },
    });

    await recordAudit({
      actor,
      action: "user.create",
      entity: "User",
      entityId: user.id,
      summary: `Created ${user.name} as ${ROLE_LABELS[user.role]}`,
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
  if (!userId) return fail("Missing staff member.");
  // Locking yourself out would leave the company with no way back in.
  if (userId === actor.id) return fail("You cannot deactivate your own account.");

  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { active },
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
  if (!userId) return fail("Missing staff member.");
  if (password.length < 8) return fail("Password must be at least 8 characters.");

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
  if (!userId || !ROLE_LABELS[role]) return fail("Choose a valid role.");
  if (userId === actor.id) return fail("You cannot change your own role.");

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
