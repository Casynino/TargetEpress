import "server-only";

import bcrypt from "bcryptjs";
import type { Department, Prisma, Role } from "@prisma/client";

import { recordAudit } from "@/lib/audit";
import {
  DEVELOPER,
  DEVELOPER_LOCKOUT,
  developerMetadata,
  type DeveloperAuditMeta,
} from "@/lib/developer-shared";
import { prisma, type TxClient } from "@/lib/prisma";
import type { SessionUser } from "@/lib/session";

export type AccountType = "staff" | "developer";

type Attempt = {
  email: string;
  password: string;
  ip: string | null;
  userAgent: string | null;
};

export type SignedInUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  department: Department;
  accountType: AccountType;
};

/**
 * THE ONE PLACE A PASSWORD IS CHECKED.
 *
 * One sign-in page for everybody: the ACCOUNT decides what kind of session
 * opens, never a button the person pressed. A Developer row gets the guarded
 * path below (lockout, advisory lock, fail-closed, audited) and a Developer
 * session; every other row signs in exactly as it always did — the same
 * lookups, the same events, the same single audit line, no new failure modes.
 *
 * Every refusal is the same single error, so the form cannot be used to learn
 * which addresses exist or which kind they are. The reason is kept on the
 * record, where only the owner and the developer read.
 */
export async function verifyCredentials(
  attempt: Attempt
): Promise<SignedInUser | null> {
  const email = attempt.email.trim().toLowerCase();
  const probe = await prisma.user.findUnique({
    where: { email },
    select: { role: true },
  });
  const guarded = probe?.role === DEVELOPER;

  /* Staff sign-in is exactly what it was: no transaction, no lock, no extra
     failure mode. */
  if (!guarded) return checkAttempt(prisma, email, attempt, false);

  /*
    THE WHOLE DEVELOPER ATTEMPT UNDER ONE LOCK.

    "Count the failures, compare the password, record the failure" is three
    steps, and fifty guesses fired at once all pass step one before any of them
    reaches step three — the throttle would count nothing and stop nobody. So
    the attempt runs in a single transaction holding a per-account advisory
    lock: guesses queue, and each one sees the failures recorded by the ones
    before it. It returns rather than throws on a refusal, so the failure it
    just recorded commits. Any error at all fails CLOSED: no session.
  */
  try {
    return await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"dev-login:" + email}))`;
        return checkAttempt(tx, email, attempt, true);
      },
      { maxWait: 10_000, timeout: 20_000 }
    );
  } catch (error) {
    console.error("[developerLogin]", error instanceof Error ? error.message : error);
    return null;
  }
}

/** The project's own name for "the client, or one inside a transaction". */
type Db = TxClient;

async function checkAttempt(
  db: Db,
  email: string,
  attempt: Attempt,
  guarded: boolean
): Promise<SignedInUser | null> {
  const user = await db.user.findUnique({ where: { email } });

  const record = (ok: boolean) =>
    db.loginEvent.create({
      data: {
        userId: user?.id ?? null,
        email,
        ok,
        ipAddress: attempt.ip,
        userAgent: attempt.userAgent,
      },
    });

  const developerRow = user?.role === DEVELOPER;

  /*
    THROTTLE BEFORE THE PASSWORD IS COMPARED.

    Counted from the same LoginEvent rows every attempt already writes, so it
    holds across serverless instances without a store of its own. A locked
    attempt is still recorded as a failure — and not as an audit line: the lock
    is announced once, and an attacker must not be able to fill the trail by
    hammering a locked door.
  */
  if (guarded) {
    const since = new Date(
      Date.now() - DEVELOPER_LOCKOUT.windowMinutes * 60_000
    );
    const failures = await db.loginEvent.findMany({
      where: { email, ok: false, createdAt: { gte: since } },
      select: { ipAddress: true },
    });
    const fromHere = failures.filter((f) => f.ipAddress === attempt.ip).length;
    if (
      fromHere >= DEVELOPER_LOCKOUT.perAddress ||
      failures.length >= DEVELOPER_LOCKOUT.anywhere
    ) {
      await record(false);
      if (fromHere === DEVELOPER_LOCKOUT.perAddress) {
        await failedDeveloperAttempt(db, email, attempt, "locked");
      }
      return null;
    }
  }

  // Suspended and former staff keep their history but lose access.
  if (!user || !user.active || user.status !== "ACTIVE") {
    await record(false);
    if (guarded) {
      await failedDeveloperAttempt(db, email, attempt, "unknown-or-inactive");
    }
    return null;
  }

  const ok = await bcrypt.compare(attempt.password, user.passwordHash);
  if (!ok) {
    await record(false);
    if (guarded) {
      await failedDeveloperAttempt(db, email, attempt, "wrong-password");
    }
    return null;
  }

  await record(true);

  const now = new Date();
  await db.user.update({
    where: { id: user.id },
    data: { lastLoginAt: now, lastActiveAt: now },
  });

  await db.auditLog.create({
    data: {
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: "auth.login",
      entity: "User",
      entityId: user.id,
      summary: developerRow
        ? `${user.name} signed in as Developer`
        : `${user.name} signed in`,
      metadata: developerRow
        ? (developerMetadata(undefined, {
            outcome: "success",
          }) as unknown as Prisma.InputJsonValue)
        : undefined,
    },
  });

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    department: user.department,
    accountType: developerRow ? "developer" : "staff",
  };
}

/**
 * A FAILED DEVELOPER-MODE SIGN-IN, ON THE AUDIT TRAIL.
 *
 * Attributed to NOBODY: the actor of an attempt that did not authenticate is
 * unknown, and writing the Developer's id on it would put a stranger's guesses
 * under the developer's name — the one attribution mistake this feature exists
 * to prevent. The address that was tried goes in the metadata instead.
 */
async function failedDeveloperAttempt(
  db: Db,
  email: string,
  attempt: Attempt,
  why: string,
  extra: Record<string, unknown> = {}
) {
  await db.auditLog.create({
    data: {
      actorId: null,
      actorEmail: null,
      actorRole: null,
      action: "developer.login.failed",
      entity: "User",
      entityId: null,
      summary:
        why === "locked"
          ? `Developer sign-in locked after repeated failures for ${email}`
          : `Failed Developer sign-in for ${email}`,
      metadata: {
        /* Flagged, so the database's append-only trigger protects it too. */
        developer: true,
        outcome: "failure",
        why,
        attemptedEmail: email,
        ipAddress: attempt.ip,
        timezone: "Africa/Dar_es_Salaam",
        ...extra,
      } satisfies Prisma.InputJsonValue,
    },
  });
}

/* ------------------------------------------------------------------------- */

type DeveloperAction = {
  actor: SessionUser;
  action: string;
  entity: string;
  entityId?: string | null;
  summary: string;
  outcome?: "success" | "failure";
  /** Why — required by the rails for sensitive acts, stored here. */
  reason?: string | null;
  before?: unknown;
  after?: unknown;
  refs?: DeveloperAuditMeta["refs"];
};

/**
 * AN ACT OF THE DEVELOPER'S, ON THE RECORD, UNDER THE DEVELOPER'S NAME.
 *
 * Refuses to write for anybody else. This function is the one place the words
 * "developer action" are produced, and a line that said so under a staff
 * member's id would be the misattribution the whole feature is built against:
 * so the check is not a convention for callers to follow, it is a throw.
 */
export async function recordDeveloperAudit(input: DeveloperAction): Promise<string> {
  if (input.actor.role !== DEVELOPER) {
    throw new Error(
      "recordDeveloperAudit was called for an actor who is not the Developer."
    );
  }
  return recordAudit({
    actor: input.actor,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId,
    summary: input.summary,
    metadata: developerMetadata(undefined, {
      outcome: input.outcome ?? "success",
      reason: input.reason ?? null,
      before: input.before,
      after: input.after,
      refs: input.refs,
    }) as unknown as Prisma.InputJsonValue,
  });
}

/**
 * A REFUSED ACTION BY THE DEVELOPER IS A FACT, NOT A SILENCE.
 *
 * "Developer attempted to modify a payment" is the line the owner asked to be
 * able to read. authorize() calls this whenever the Developer is refused, so
 * every server action — all of which authorize first — contributes to it with
 * no change to any of them.
 *
 * It never throws: a log that failed to write must not turn a clean refusal
 * into a crash, nor — worse — into a different answer. The refusal happens
 * either way; the failure to record it goes to the server log.
 */
export async function recordDeniedAttempt(
  actor: SessionUser,
  permission: string
) {
  if (actor.role !== DEVELOPER) return;
  try {
    await recordDeveloperAudit({
      actor,
      action: "developer.denied",
      entity: "Permission",
      entityId: permission,
      summary: `Developer attempted "${permission}" — refused, the Developer role does not hold it`,
      outcome: "failure",
    });
  } catch (error) {
    console.error("Could not record a refused developer action", {
      permission,
      error,
    });
  }
}

/**
 * MAY THE DEVELOPER REACTIVATE THIS ACCOUNT? ONLY IF THE DEVELOPER SUSPENDED IT.
 *
 * An account the owner or the manager suspended was suspended by a business
 * decision — somebody left, somebody was under investigation — and the person
 * who can see every screen is the last who should overrule it. So the
 * Developer may undo only their own suspension, and only while nobody has
 * touched the account since: the newest suspend/reactivate line must be the
 * Developer's own suspend, and the account must not have changed after it.
 *
 * Fails closed. In any doubt it is not allowed, and the refusal says whose
 * decision it is.
 */
export async function developerMayReactivate(
  db: TxClient,
  target: { id: string; updatedAt: Date }
): Promise<boolean> {
  const last = await db.auditLog.findFirst({
    where: {
      entity: "User",
      entityId: target.id,
      action: { in: ["user.deactivate", "user.activate"] },
    },
    orderBy: { createdAt: "desc" },
    select: { action: true, actorRole: true, createdAt: true },
  });
  if (!last || last.action !== "user.deactivate") return false;
  if (last.actorRole !== DEVELOPER) return false;
  /* A short grace: the account's own timestamp and the audit line are written
     moments apart, in either order. */
  return target.updatedAt.getTime() <= last.createdAt.getTime() + 10_000;
}
