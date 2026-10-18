import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import {
  WORK_AS_COOKIE,
  WORK_AS_HOURS,
  canWorkAs,
  DEVELOPER,
} from "@/lib/developer-shared";
import { prisma } from "@/lib/prisma";

/**
 * "WORK AS", WITHOUT TOUCHING THE SIGN-IN SESSION.
 *
 * The developer's session stays exactly what it was — their own, signed in
 * through Developer Login. Working as somebody is a second, signed cookie that
 * says "this developer is looking as that person", and every request asks the
 * database whether it is still true. Kept out of the Auth.js token on
 * purpose: the token is edge-readable and shared with the middleware, and the
 * more that lives in it the more places can disagree about who is signed in.
 *
 * THE COOKIE IS A CLAIM, NEVER A KEY. Signed with the app's own secret so it
 * cannot be forged, and then distrusted anyway: it only counts while ALL of
 * these hold, re-checked on every request —
 *   · the signature is right and it belongs to the developer who is signed in,
 *   · it is under WORK_AS_HOURS old,
 *   · the developer's NEWEST start/stop line in the audit trail is the start
 *     line this cookie names — so pressing Stop (or starting another) kills
 *     every copy of the cookie at once, and an old one cannot be replayed,
 *   · the person is still active and still an account that may be looked as.
 */

type Payload = { dev: string; target: string; aid: string; at: number };

const secret = () => {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not set.");
  return value;
};

const sign = (body: string) =>
  createHmac("sha256", secret()).update(body).digest("base64url");

export function encodeWorkAs(payload: Payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function decodeWorkAs(value: string | undefined | null): Payload | null {
  if (!value) return null;
  const [body, mac] = value.split(".");
  if (!body || !mac) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (
      typeof parsed?.dev === "string" &&
      typeof parsed?.target === "string" &&
      typeof parsed?.aid === "string" &&
      typeof parsed?.at === "number"
    ) {
      return parsed as Payload;
    }
  } catch {
    /* a cookie that does not parse is not a work-as */
  }
  return null;
}

export async function setWorkAsCookie(payload: Payload) {
  (await cookies()).set(WORK_AS_COOKIE, encodeWorkAs(payload), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: WORK_AS_HOURS * 3600,
  });
}

export async function clearWorkAsCookie() {
  (await cookies()).delete(WORK_AS_COOKIE);
}

/**
 * The person the developer is looking as right now, or null.
 *
 * `developerId` is the REAL signed-in developer, resolved by the caller from
 * the Auth.js session — this never decides who the developer is.
 */
export async function activeWorkAs(developerId: string) {
  const store = await cookies();
  const payload = decodeWorkAs(store.get(WORK_AS_COOKIE)?.value);
  if (!payload || payload.dev !== developerId) return null;
  if (Date.now() - payload.at > WORK_AS_HOURS * 3_600_000) return null;

  const [target, latest] = await Promise.all([
    prisma.user.findUnique({
      where: { id: payload.target },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        department: true,
        active: true,
        status: true,
      },
    }),
    prisma.auditLog.findFirst({
      where: {
        actorId: developerId,
        action: { in: ["developer.workas.start", "developer.workas.stop"] },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, action: true, entityId: true },
    }),
  ]);

  if (
    !target ||
    !canWorkAs(target, developerId) ||
    latest?.id !== payload.aid ||
    latest.action !== "developer.workas.start" ||
    latest.entityId !== payload.target
  ) {
    return null;
  }
  return {
    id: target.id,
    name: target.name,
    email: target.email,
    role: target.role,
    department: target.department,
  };
}

export { DEVELOPER };
