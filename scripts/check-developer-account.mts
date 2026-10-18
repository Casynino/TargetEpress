/**
 * THE DEVELOPER ACCOUNT — IDENTITY, PERMISSIONS, AUDIT, AND THE MONEY IT MUST NOT TOUCH.
 *
 *   npx tsx --conditions=react-server scripts/check-developer-account.mts
 *
 * Runs against the LOCAL database (and refuses anything else). It needs the
 * Developer role and the append-only trigger applied first:
 *   npx prisma db execute --file scripts/neon-developer-account.sql --schema prisma/schema.prisma
 *
 * ONE PERSISTENT TEST DEVELOPER, ON PURPOSE. Everything a Developer does is
 * written to rows the database refuses to update or delete — that is the
 * feature under test — so a test developer who signs in can never be cleaned
 * up afterwards. It is created once and reused. The staff test account is
 * ordinary and is removed again.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import bcrypt from "bcryptjs";

import { recordAudit } from "@/lib/audit";
import {
  DEVELOPER_LOCKOUT,
  DEVELOPER_SESSION_HOURS,
  canWorkAs,
  developerAssignmentRefusal,
  developerMetadata,
  developerReasonRefusal,
  developerTargetRefusal,
  formatTanzania,
} from "@/lib/developer-shared";
import {
  recordDeniedAttempt,
  recordDeveloperAudit,
  verifyCredentials,
} from "@/lib/developer";
import { decodeWorkAs, encodeWorkAs } from "@/lib/developer-workas";
import { prisma } from "@/lib/prisma";
import { can, ROLE_PERMISSIONS, type Permission } from "@/lib/rbac";
import type { SessionUser } from "@/lib/session";

if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "")) {
  console.error("Refusing to run: DATABASE_URL is not the local database.");
  process.exit(1);
}
process.env.AUTH_SECRET ||= "guard-test-secret";

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failed++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${detail ? "   " + detail : ""}`);
};
const section = (title: string) => console.log(`\n${title}`);

/* ---------- 1. permissions ---------- */
section("Permissions");
const roles = Object.keys(ROLE_PERMISSIONS) as (keyof typeof ROLE_PERMISSIONS)[];
check(
  "only the Developer holds developer.access",
  roles.every((r) => can(r, "developer.access") === (r === "DEVELOPER"))
);

/* Everything that moves, approves or destroys money or its records. A new
   permission added to the Developer must not be on this list; a new money
   permission added to the system belongs on it. */
const MONEY_AND_DESTRUCTIVE: Permission[] = [
  "payment.record", "payment.verify", "payment.submit",
  "invoice.manage", "invoice.edit", "invoice.priceConfirm", "invoice.priceReview",
  "invoice.discount", "invoice.rate", "invoice.storage.waive", "invoice.send",
  "credit.request", "credit.approve", "credit.limit",
  "pickupNote.issue", "pickupNote.cancel",
  "fx.manage", "account.manage", "treasury.move", "loan.record",
  "expense.record", "expense.approve", "ledger.adjust",
  "payroll.prepare", "payroll.approve", "account.reconcile", "pricing.manage",
  "exception.compensate", "exception.approve",
  "shipment.release", "shipment.purge", "shipment.delete", "shipment.depart", "shipment.move",
  "customer.delete", "customer.merge", "document.removeAny",
  "delivery.undo", "batch.undoArrival", "batch.close", "batch.create", "batch.manage",
];
const held = MONEY_AND_DESTRUCTIVE.filter((p) => can("DEVELOPER", p));
check(
  "the Developer holds no money-writing or destructive permission",
  held.length === 0,
  held.length ? `holds: ${held.join(", ")}` : `${MONEY_AND_DESTRUCTIVE.length} checked`
);
check("the Developer CAN read the audit trail", can("DEVELOPER", "audit.view"));
check("the Developer CAN manage accounts", can("DEVELOPER", "user.manage"));

/* ---------- 2. the rails ---------- */
section("Rails");
check("no one may be given the Developer role", developerAssignmentRefusal("DEVELOPER") !== null);
check("any other role may be assigned", developerAssignmentRefusal("FINANCE") === null && developerAssignmentRefusal("ADMIN") === null);
check("a Developer account cannot be acted on", developerTargetRefusal({ role: "DEVELOPER" }) !== null);
check("a staff account can be acted on", developerTargetRefusal({ role: "FINANCE" }) === null);
check("the Developer must give a reason", developerReasonRefusal("DEVELOPER", "ok") !== null && developerReasonRefusal("DEVELOPER", "") !== null);
check("a real reason is accepted", developerReasonRefusal("DEVELOPER", "Moved after the restructure") === null);
check("staff are not asked for one", developerReasonRefusal("FINANCE", "") === null);

section("Work as");
const me = "dev-1";
check("cannot work as yourself", !canWorkAs({ id: me, role: "FINANCE", active: true, status: "ACTIVE" }, me));
check("cannot work as another Developer", !canWorkAs({ id: "x", role: "DEVELOPER", active: true, status: "ACTIVE" }, me));
check("cannot work as a suspended account", !canWorkAs({ id: "x", role: "FINANCE", active: false, status: "SUSPENDED" }, me));
check("can work as active staff and as the owner", canWorkAs({ id: "x", role: "CUSTOMER_CARE", active: true, status: "ACTIVE" }, me) && canWorkAs({ id: "y", role: "ADMIN", active: true, status: "ACTIVE" }, me));
const cookie = encodeWorkAs({ dev: me, target: "t1", aid: "a1", at: Date.now() });
check("a signed work-as cookie reads back", decodeWorkAs(cookie)?.target === "t1");
check("a tampered cookie is refused", decodeWorkAs(cookie.replace(/.$/, (c) => (c === "A" ? "B" : "A"))) === null);
check("a cookie re-signed with another body is refused", decodeWorkAs(encodeWorkAs({ dev: me, target: "t2", aid: "a1", at: 1 }).split(".")[0] + "." + cookie.split(".")[1]) === null);
check("junk is refused", decodeWorkAs("not-a-cookie") === null && decodeWorkAs("") === null && decodeWorkAs(undefined) === null);

/* ---------- 3. time and metadata ---------- */
section("Time and metadata");
check("timestamps are shown in Tanzania time", formatTanzania("2026-10-10T21:00:00Z") === "11 Oct 2026, 00:00:00 EAT", formatTanzania("2026-10-10T21:00:00Z"));
const meta = developerMetadata({ keep: 1, developer: false }, { reason: "why", before: { a: 1 }, after: { a: 2 } });
check("developer metadata keeps what the action wrote", (meta as Record<string, unknown>).keep === 1);
check("…and cannot be told it is not a developer line", meta.developer === true);
check("…carries outcome, reason, before, after and the zone", meta.outcome === "success" && meta.reason === "why" && !!meta.before && !!meta.after && meta.timezone === "Africa/Dar_es_Salaam");
check("the session is eight hours, like ORA", DEVELOPER_SESSION_HOURS === 8);

/* ---------- 4. database: identity separation ---------- */
section("Sign-in: identity separation");
const STAFF_EMAIL = "zz-guard-staff@test.invalid";
const DEV_EMAIL = "zz-guard-dev@test.invalid";
const STAFF_PW = "Staff-Password-123!";
const DEV_PW = "Developer-Password-456!";
const run = Math.floor(Math.random() * 200) + 20;
const ip = (n: number) => `10.${run}.${run}.${n}`;

/* The login events are ordinary rows and safe to clear; counting them is how
   the throttle works, so stale ones from a run a minute ago would lock this one. */
await prisma.loginEvent.deleteMany({ where: { email: { in: [STAFF_EMAIL, DEV_EMAIL] } } });

const staff = await prisma.user.upsert({
  where: { email: STAFF_EMAIL },
  update: { passwordHash: await bcrypt.hash(STAFF_PW, 4), active: true, status: "ACTIVE", role: "FINANCE" },
  create: { name: "Guard Staff", email: STAFF_EMAIL, passwordHash: await bcrypt.hash(STAFF_PW, 4), role: "FINANCE", department: "FINANCE" },
});
const dev = await prisma.user.upsert({
  where: { email: DEV_EMAIL },
  update: { passwordHash: await bcrypt.hash(DEV_PW, 4), active: true, status: "ACTIVE", role: "DEVELOPER" },
  create: { name: "Guard Developer", email: DEV_EMAIL, passwordHash: await bcrypt.hash(DEV_PW, 4), role: "DEVELOPER", department: "MANAGEMENT" },
});

const attempt = (email: string, password: string, n = 1) =>
  verifyCredentials({ email, password, ip: ip(n), userAgent: "guard" });

const a1 = await attempt(STAFF_EMAIL, STAFF_PW);
check("one sign-in page: a staff account opens a staff session", a1?.accountType === "staff" && a1.role === "FINANCE");
const a3 = await attempt(DEV_EMAIL, DEV_PW);
check("one sign-in page: the Developer account opens a Developer session", a3?.accountType === "developer" && a3.role === "DEVELOPER");
check("a wrong staff password is refused", (await attempt(STAFF_EMAIL, "wrong-password")) === null);
check("a wrong developer password is refused", (await attempt(DEV_EMAIL, "wrong-password")) === null);
check("an unknown address is refused", (await attempt("nobody@test.invalid", "x")) === null);

const lastFailed = await prisma.auditLog.findFirst({
  where: { action: "developer.login.failed" },
  orderBy: { createdAt: "desc" },
});
check("a failed developer sign-in is attributed to NOBODY", lastFailed !== null && lastFailed.actorId === null && lastFailed.actorRole === null);
const login = await prisma.auditLog.findFirst({
  where: { action: "auth.login", actorId: dev.id },
  orderBy: { createdAt: "desc" },
});
check("a developer sign-in is recorded under the Developer", login?.actorRole === "DEVELOPER" && (login.metadata as { developer?: boolean })?.developer === true);
const staffLogin = await prisma.auditLog.findFirst({ where: { action: "auth.login", actorId: staff.id }, orderBy: { createdAt: "desc" } });
check("a staff sign-in is recorded as before, not as a developer line", staffLogin?.actorRole === "FINANCE" && staffLogin.metadata === null);

section("Sign-in: lockout");
for (let i = 0; i < DEVELOPER_LOCKOUT.perAddress; i++) await attempt(DEV_EMAIL, "guess-" + i, 7);
check("the right password from a locked address is refused", (await attempt(DEV_EMAIL, DEV_PW, 7)) === null);
check("…but a different address is not locked out by a stranger", (await attempt(DEV_EMAIL, DEV_PW, 8))?.accountType === "developer");
const suspended = await prisma.user.update({ where: { id: dev.id }, data: { active: false, status: "SUSPENDED" } });
check("a suspended Developer cannot sign in", (await attempt(DEV_EMAIL, DEV_PW, 9)) === null && suspended.active === false);
await prisma.user.update({ where: { id: dev.id }, data: { active: true, status: "ACTIVE" } });

/* ---------- 5. database: audit ---------- */
section("Audit");
const devActor: SessionUser = { id: dev.id, name: dev.name, email: dev.email, role: "DEVELOPER", department: "MANAGEMENT" };
const staffActor: SessionUser = { id: staff.id, name: staff.name, email: staff.email, role: "FINANCE", department: "FINANCE" };

let threw = false;
try {
  await recordDeveloperAudit({ actor: staffActor, action: "developer.x", entity: "X", summary: "s" });
} catch {
  threw = true;
}
check("a staff member cannot be recorded as doing a developer action", threw);

const id = await recordDeveloperAudit({
  actor: devActor, action: "developer.guard.test", entity: "User", entityId: "e-1",
  summary: "guard test", reason: "checking the trail", before: { role: "A" }, after: { role: "B" },
  refs: { invoice: "INV-1" },
});
const row = await prisma.auditLog.findUnique({ where: { id } });
const m = (row?.metadata ?? {}) as Record<string, unknown>;
check("a developer audit line carries identity, role, outcome, reason, before, after and refs",
  row?.actorId === dev.id && row.actorRole === "DEVELOPER" && m.developer === true && m.outcome === "success" &&
  m.reason === "checking the trail" && !!m.before && !!m.after && !!m.refs && m.timezone === "Africa/Dar_es_Salaam");

const viaRecordAudit = await recordAudit({ actor: devActor, action: "guard.plain", entity: "X", summary: "plain" });
const plain = await prisma.auditLog.findUnique({ where: { id: viaRecordAudit } });
check("ANY audit line the developer writes anywhere is stamped as a developer's", (plain?.metadata as { developer?: boolean })?.developer === true && plain?.actorRole === "DEVELOPER");

const borrowed = await recordAudit({
  actor: { ...staffActor, impersonatedBy: { id: dev.id, name: dev.name, email: dev.email } },
  action: "guard.borrowed", entity: "X", summary: "while looking as staff",
});
const b = await prisma.auditLog.findUnique({ where: { id: borrowed } });
check("a line written while looking as staff is attributed to the DEVELOPER, not the staff member", b?.actorId === dev.id && b.actorRole === "DEVELOPER" && (b.metadata as { workingAs?: { id: string } })?.workingAs?.id === staff.id);

const staffLine = await recordAudit({ actor: staffActor, action: "guard.staff", entity: "X", summary: "staff", metadata: { a: 1 } });
const sl = await prisma.auditLog.findUnique({ where: { id: staffLine } });
check("a staff member's line is stored exactly as before", sl?.actorRole === "FINANCE" && JSON.stringify(sl.metadata) === '{"a":1}');

const before = await prisma.auditLog.count({ where: { action: "developer.denied" } });
await recordDeniedAttempt(staffActor, "payment.record");
check("a refused STAFF action writes nothing extra", (await prisma.auditLog.count({ where: { action: "developer.denied" } })) === before);
await recordDeniedAttempt(devActor, "payment.record");
const denied = await prisma.auditLog.findFirst({ where: { action: "developer.denied", actorId: dev.id }, orderBy: { createdAt: "desc" } });
check("a refused DEVELOPER action is recorded as a failure under the Developer",
  (await prisma.auditLog.count({ where: { action: "developer.denied" } })) === before + 1 &&
  (denied?.metadata as { outcome?: string })?.outcome === "failure" && denied?.entityId === "payment.record");

/* ---------- 6. database: the audit trail cannot be rewritten ---------- */
section("Audit trail is append-only");
const tryDb = async (fn: () => Promise<unknown>) => {
  try { await fn(); return false; } catch { return true; }
};
check("a developer audit row cannot be UPDATED", await tryDb(() => prisma.auditLog.update({ where: { id }, data: { summary: "tampered" } })));
check("a developer audit row cannot be DELETED", await tryDb(() => prisma.auditLog.delete({ where: { id } })));
check("a row flagged as the developer's by metadata cannot be deleted either", await tryDb(() => prisma.auditLog.delete({ where: { id: viaRecordAudit } })));
check("a failed developer sign-in row cannot be deleted", lastFailed !== null && (await tryDb(() => prisma.auditLog.delete({ where: { id: lastFailed.id } }))));
check("the developer's own account cannot be deleted out from under its trail", await tryDb(() => prisma.user.delete({ where: { id: dev.id } })));
check("an ordinary staff audit row can still be changed (nothing else moved)", !(await tryDb(() => prisma.auditLog.update({ where: { id: staffLine }, data: { summary: "ok" } }))));

/* ---------- 7. nothing in the code can edit the trail ---------- */
section("Nothing in the application edits or deletes audit rows");
const offenders: string[] = [];
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    if (["node_modules", ".next", ".git", "scripts"].includes(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(ts|tsx)$/.test(name) && /auditLog\s*\.\s*(update|updateMany|delete|deleteMany|upsert)\b/.test(readFileSync(path, "utf8"))) offenders.push(path);
  }
};
["app", "lib", "components"].forEach(walk);
check("no application code updates or deletes an audit row", offenders.length === 0, offenders.join(", "));

section("The role is never offered or assignable from a screen");
const users = readFileSync("lib/actions/users.ts", "utf8");
check("create, role change and target actions all run the Developer rails",
  (users.match(/blockDeveloperRole\(/g)?.length ?? 0) >= 3 && (users.match(/blockDeveloperTarget\(/g)?.length ?? 0) >= 4);
check("a Developer cannot reactivate an account somebody else suspended", users.includes("developerMayReactivate"));
check("the role dropdowns leave Developer out", readFileSync("components/app/user-admin.tsx", "utf8").includes('o.value !== "DEVELOPER"'));
check("the Developer cannot reach the staff screen that asks no reason", readFileSync("app/app/admin/users/page.tsx", "utf8").includes('redirect("/app/developer/accounts")'));
check("work-as is view-only: authorize() refuses every action while it is on", readFileSync("lib/session.ts", "utf8").includes("if (user.impersonatedBy)"));

section("One sign-in page, one-press Work as");
check("the sign-in form has no Staff/Developer toggle", !/accountType|Developer login|Staff login/.test(readFileSync("components/login-form.tsx", "utf8")));
check("the sign-in action does not take the account type from the form", !readFileSync("lib/actions/auth.ts", "utf8").includes("accountType"));
check("Work as asks for no reason (view-only, always on the trail)", !readFileSync("lib/actions/developer.ts", "utf8").includes("developerReasonRefusal"));
check("Work as still writes its audit line before it sets the cookie",
  (() => { const f = readFileSync("lib/actions/developer.ts", "utf8"); return f.indexOf('"developer.workas.start"') < f.indexOf("setWorkAsCookie({"); })());

/* Leave the staff account as it found it. The developer is kept on purpose. */
await prisma.loginEvent.deleteMany({ where: { email: { in: [STAFF_EMAIL, DEV_EMAIL] } } });
await prisma.user.delete({ where: { id: staff.id } }).catch(() => {});
await prisma.$disconnect();

console.log(failed === 0 ? "\nEvery developer-account check passed." : `\n${failed} CHECK(S) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
