import type { Role } from "@prisma/client";

/**
 * THE DEVELOPER ACCOUNT — THE PARTS THAT ARE JUST RULES.
 *
 * No database, no session, no `server-only`: everything here is a constant or
 * a pure function, so a client component can show the banner, and a test can
 * hold the rules up to the light without standing up a server. The parts that
 * touch the database live in lib/developer.ts.
 */

/** The only role value this file is about. Named so a typo is a type error. */
export const DEVELOPER: Role = "DEVELOPER";

export const isDeveloper = (role: Role | string | null | undefined) =>
  role === DEVELOPER;

/**
 * How long a Developer session lasts, absolute.
 *
 * Staff sessions roll forward while somebody works, because a clerk thrown out
 * mid-invoice loses work. This account is the opposite case: it can see
 * everything, so the window never extends, whatever the account does inside it.
 * Eight hours is a working day — the same the owner already runs the developer
 * account on in ORA.
 */
export const DEVELOPER_SESSION_HOURS = 8;

/**
 * Sign-in throttling for Developer Login only. Staff sign-in is untouched.
 *
 * Two limits, because one alone is wrong either way. Failures from ONE address
 * stop quickly, so guessing from a single machine goes nowhere. Failures from
 * ANYWHERE stop at a higher number, so a spread-out guesser is still stopped —
 * but a stranger cannot lock the developer out for ever by failing five times,
 * since five from their own address never reaches the global limit.
 */
export const DEVELOPER_LOCKOUT = {
  windowMinutes: 15,
  perAddress: 5,
  anywhere: 20,
} as const;

/** What the setup script will accept as a password. */
export const DEVELOPER_PASSWORD_MIN = 14;

/** Sensitive operations need a stated reason of at least this many characters. */
export const DEVELOPER_REASON_MIN = 10;

/** The zone every developer-facing timestamp is shown in. */
export const TANZANIA_TZ = "Africa/Dar_es_Salaam";

/**
 * A timestamp in Tanzania time, whatever zone the server or the browser is in.
 *
 * The rest of the app formats through date-fns, which uses the process's own
 * zone — right on a laptop in Dar and wrong on a server in Frankfurt. The audit
 * trail is the one place a wrong hour is a wrong fact, so it names the zone.
 */
export function formatTanzania(value: Date | string | null | undefined) {
  if (!value) return "—";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TANZANIA_TZ,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(value));
  const at = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${at("day")} ${at("month")} ${at("year")}, ${at("hour")}:${at("minute")}:${at("second")} EAT`;
}

/* ------------------------------------------------------------------------- */
/* The rails. Each returns the English reason it refuses, or null to allow.   */
/* The caller translates it — these stay free of any locale.                  */
/* ------------------------------------------------------------------------- */

/**
 * NOBODY IS MADE A DEVELOPER FROM INSIDE THE APPLICATION.
 *
 * Refused for every actor, the owner included. The role changes who may do
 * what, so a screen able to grant it would make every other control decorative
 * — whoever could press the button could promote themselves, or a second
 * account they opened an hour ago. Creation is the setup script's alone.
 */
export function developerAssignmentRefusal(role: Role | string): string | null {
  return role === DEVELOPER
    ? "The Developer role cannot be given from inside the application. It is created only by the secure setup process."
    : null;
}

/**
 * A DEVELOPER ACCOUNT IS NOT MANAGED FROM A SCREEN — BY ANYBODY.
 *
 * Suspending, reactivating, resetting the password of, or moving a Developer
 * account is refused for every actor. A password reset is a login: whoever can
 * reset this one can sign in as it, with its reach and under its name. Recovery
 * is the setup script's, which needs the database itself.
 */
export function developerTargetRefusal(target: {
  role: Role | string;
}): string | null {
  return target.role === DEVELOPER
    ? "A Developer account is managed only through the secure setup process, never from the application."
    : null;
}

/**
 * A reason, where the actor is the developer and the act is sensitive.
 *
 * Staff are not asked: their sensitive actions already carry the note field the
 * owner decided should be optional ("warn, confirm, do"). The developer's
 * reach is wider and its actions are the ones read later by somebody asking
 * why, so for this account the reason is part of the act. Server-side — a form
 * that forgets to ask still gets refused.
 */
export function developerReasonRefusal(
  actorRole: Role | string,
  reason: string | null | undefined,
): string | null {
  if (actorRole !== DEVELOPER) return null;
  return (reason ?? "").trim().length >= DEVELOPER_REASON_MIN
    ? null
    : "A Developer must state why, in at least a sentence. This is read later by whoever asks what happened.";
}

/** The shape every developer audit line's `metadata` takes. */
export type DeveloperAuditMeta = {
  developer: true;
  outcome: "success" | "failure";
  reason?: string | null;
  before?: unknown;
  after?: unknown;
  /** Related invoice, payment, cargo or ledger reference, where there is one. */
  refs?: Record<string, string | null>;
  /** Stamped by the server so the log carries its own zone. */
  timezone: typeof TANZANIA_TZ;
  [key: string]: unknown;
};

/**
 * Whatever an action already puts in `metadata`, with the developer fields on
 * top — never replacing what was there.
 *
 * Applied inside recordAudit for a Developer actor, so every audit line the
 * developer produces anywhere in the app carries the same fields without one
 * of two hundred call sites having to remember to ask.
 */
export function developerMetadata(
  existing: unknown,
  extra: Partial<
    Pick<DeveloperAuditMeta, "outcome" | "reason" | "before" | "after" | "refs">
  > = {},
): DeveloperAuditMeta {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : existing === undefined || existing === null
        ? {}
        : { detail: existing };
  /* An undefined field is "not given", not "erase what the action wrote". */
  const given = Object.fromEntries(
    Object.entries(extra).filter(([, value]) => value !== undefined),
  );
  return {
    outcome: "success",
    ...base,
    ...given,
    developer: true,
    timezone: TANZANIA_TZ,
  } as DeveloperAuditMeta;
}

/* ------------------------------------------------------------------------- */
/* "Work as" — the developer sees the app exactly as one person does.         */
/* ------------------------------------------------------------------------- */

/** The cookie that carries a work-as, signed — see lib/developer-workas.ts. */
export const WORK_AS_COOKIE = "tx.workas";

/** Working-as ends by itself after this long, so a forgotten one cannot linger. */
export const WORK_AS_HOURS = 4;

/**
 * WHO THE DEVELOPER MAY LOOK AS.
 *
 * Anybody who is signed in as an ordinary account right now: the owner and the
 * manager included, since "why can't she see that" is as likely to be asked
 * about them. Never another Developer account and never yourself — a
 * developer "working as" themselves would just be a second way to hold the
 * same session, and one working as a developer would stack two identities.
 */
export function canWorkAs(
  target: { id: string; role: Role | string; active: boolean; status: string },
  developerId: string,
): boolean {
  return (
    target.id !== developerId &&
    target.role !== DEVELOPER &&
    target.active &&
    target.status === "ACTIVE"
  );
}

/** Who is REALLY behind a session that is looking as somebody else. */
export type ImpersonatedBy = { id: string; name: string; email: string };

/**
 * A DELETED ACCOUNT IS GONE, NOT ERASED.
 *
 * "Delete" removes a person's way in — the login, the password, the email
 * address — and takes them off every list. It does NOT touch what they did:
 * every payment, cargo record and audit line they made still names them, which
 * is the whole point of keeping the books honest. The row stays; its sign-in
 * does not.
 *
 * The row is marked `INACTIVE` (the status that already means "has left") and
 * its email is rewritten to an unusable address on this domain. That rewrite is
 * the marker lists filter on, so no schema change is needed, and it frees the
 * original address for a new account. The original is written into the audit
 * line, so nothing is lost.
 */
export const REMOVED_EMAIL_DOMAIN = "removed.invalid";

export const removedEmail = (id: string) =>
  `removed-${id}@${REMOVED_EMAIL_DOMAIN}`;

export const isRemovedAccount = (account: { email: string }) =>
  account.email.endsWith(`@${REMOVED_EMAIL_DOMAIN}`);

/** For any `where` that lists people: leaves out accounts that were deleted. */
export const NOT_REMOVED = {
  NOT: { email: { endsWith: `@${REMOVED_EMAIL_DOMAIN}` } },
} as const;
