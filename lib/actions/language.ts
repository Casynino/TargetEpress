"use server";

import { revalidatePath } from "next/cache";

import { LOCALES, type Locale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/session";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";

/**
 * Switch the language this person reads the system in.
 *
 * Stored on the user rather than in a cookie: a Guangzhou packer who works
 * from the bench computer in the morning and a phone in the afternoon should
 * not have to set it twice, and it is a fact about the person rather than
 * about the browser.
 *
 * The permission is deliberately the weakest one there is — every signed-in
 * member of staff may choose the language they read. What differs by role is
 * where the switch is offered, not who is allowed to use it.
 */
export async function setLanguage(locale: string): Promise<ActionResult> {
  try {
    const user = await authorize("shipment.view");
    if (!LOCALES.includes(locale as Locale)) {
      return fail("That is not a language this system speaks.");
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { preferredLanguage: locale },
    });

    // Language changes what every server-rendered page says, so the whole app
    // shell is stale — not just the screen the switch was pressed on.
    revalidatePath("/app", "layout");
    return ok();
  } catch (error) {
    return fail(toActionError(error));
  }
}
