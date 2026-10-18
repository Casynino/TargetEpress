"use server";

import { AuthError } from "next-auth";

import { signIn, signOut } from "@/auth";

export type LoginState = { error?: string };

export async function loginAction(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const callbackUrl = String(formData.get("callbackUrl") ?? "/app/dashboard");
  /* Anything but the literal word is Staff, so a form built before there were
     two doors, or a hand-made request, can only ever ask for the ordinary one. */
  const accountType =
    String(formData.get("accountType") ?? "") === "developer"
      ? "developer"
      : "staff";

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  try {
    await signIn("credentials", {
      email,
      password,
      accountType,
      /* The Developer lands on their own desk, whatever page was asked for:
         a callback to a staff page would be the first thing they see in a
         session that is supposed to announce what it is. */
      redirectTo:
        accountType === "developer" ? "/app/developer" : callbackUrl || "/app/dashboard",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      // Deliberately vague: never reveal whether the address exists.
      return { error: "Incorrect email or password, or the account is inactive." };
    }
    // signIn throws a redirect on success — let Next handle it.
    throw error;
  }

  return {};
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
