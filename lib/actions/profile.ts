"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { currentUser, type SessionUser } from "@/lib/session";
import { putImage } from "@/lib/storage";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";

/**
 * What an employee may change about themselves.
 *
 * The dividing line is whether a field is a claim about the person or a claim
 * about their employment. How you want to be called and which number to ring in
 * an emergency are yours; your employee number, department, rank and company
 * address are the company's, and are set once by the CEO.
 *
 * Every action here reads the session for the id and never accepts one from the
 * form. That is the whole of the "you can only edit yourself" rule — there is
 * no id to tamper with.
 */

const personalSchema = z.object({
  /// One name, and the employee owns it. It is what appears against every
  /// piece of cargo they receive — on the batch screen, on the manifest and in
  /// the audit trail — so the person doing the work decides how it reads.
  name: z
    .string()
    .trim()
    .min(2, "Your name is required.")
    .max(60, "Keep your name under 60 characters."),
  phone: z
    .string()
    .trim()
    .max(30)
    .optional()
    .transform((v) => (v?.length ? v : null)),
  emergencyContact: z
    .string()
    .trim()
    .max(120, "Keep the emergency contact short — a name and a number.")
    .optional()
    .transform((v) => (v?.length ? v : null)),
  preferredLanguage: z.enum(["en", "sw", "zh"]),
});

export async function updateMyProfile(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const user = await currentUser();
  if (!user) return fail("Your session has expired. Sign in again.");

  const parsed = personalSchema.safeParse({
    name: formData.get("name")?.toString(),
    phone: formData.get("phone")?.toString(),
    emergencyContact: formData.get("emergencyContact")?.toString(),
    preferredLanguage: formData.get("preferredLanguage")?.toString() ?? "en",
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Check the details.");
  }

  try {
    // The photo is optional on every save — leaving the file input empty means
    // "keep the one I have", not "remove it".
    const photo = formData.get("photo");
    let photoUrl: string | undefined;
    if (photo instanceof File && photo.size > 0) {
      photoUrl = (await putImage(photo, "staff")).url;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { ...parsed.data, ...(photoUrl ? { photoUrl } : {}) },
    });

    await recordAudit({
      actor: user,
      action: "profile.update",
      entity: "User",
      entityId: user.id,
      summary:
        parsed.data.name === user.name
          ? `${user.name} updated their profile`
          : `${user.name} is now known as ${parsed.data.name}`,
      metadata: photoUrl ? { photoChanged: true } : undefined,
    });

    // The name appears against every piece of cargo this person received, so
    // the screens that print it have to be rebuilt, not just their own profile.
    revalidatePath("/app/profile");
    revalidatePath("/app/profile/settings");
    revalidatePath("/app/batches", "layout");
    revalidatePath("/app/dashboard");
    return ok();
  } catch (error) {
    return fail(toActionError(error));
  }
}

const passwordSchema = z
  .object({
    current: z.string().min(1, "Enter your current password."),
    next: z
      .string()
      .min(10, "Use at least 10 characters — this account moves other people's cargo."),
    confirm: z.string().min(1, "Type the new password twice."),
  })
  .refine((v) => v.next === v.confirm, {
    message: "The two new passwords do not match.",
  });

export async function changeMyPassword(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const user = await currentUser();
  if (!user) return fail("Your session has expired. Sign in again.");

  const parsed = passwordSchema.safeParse({
    current: formData.get("current")?.toString() ?? "",
    next: formData.get("next")?.toString() ?? "",
    confirm: formData.get("confirm")?.toString() ?? "",
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Check the details.");
  }

  try {
    const record = await prisma.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });
    if (!record) return fail("Your account no longer exists.");

    // Proving they know the current one is what stops a walk-up at an unlocked
    // screen from becoming a locked-out employee.
    const matches = await bcrypt.compare(parsed.data.current, record.passwordHash);
    if (!matches) return fail("That is not your current password.");

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(parsed.data.next, 12) },
    });

    await recordAudit({
      actor: user,
      action: "profile.password",
      entity: "User",
      entityId: user.id,
      summary: `${user.name} changed their password`,
    });

    return ok();
  } catch (error) {
    return fail(toActionError(error));
  }
}

/** Marks everything in the bell as read. */
export async function markNotificationsRead(): Promise<ActionResult> {
  const user: SessionUser | null = await currentUser();
  if (!user) return fail("Your session has expired. Sign in again.");

  try {
    await prisma.notification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    revalidatePath("/app/notifications");
    revalidatePath("/app/profile");
    return ok();
  } catch (error) {
    return fail(toActionError(error));
  }
}
