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
import { getJobs, JOBS } from "@/lib/developer/jobs";
import { recordJobRun } from "@/lib/developer/job-log";
import { cleanMessage, cleanPath, recordServerError } from "@/lib/developer/server-errors";
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
const sessionSrc = readFileSync("lib/session.ts", "utf8");
check("work-as refuses nothing: no list of closed permissions, no check that reads impersonatedBy", !/WORK_AS_NEVER/.test(sessionSrc) && !/impersonatedBy\s*&&/.test(sessionSrc.slice(sessionSrc.indexOf("export async function authorize"), sessionSrc.indexOf("export async function currentUser"))));
check("…and the person's own password change is open too", !/impersonatedBy/.test(readFileSync("lib/actions/profile.ts", "utf8")));
check("the Developer's own powers (delete an account or a customer, suspend a customer) stay open while working as someone", /actor\.role !== DEVELOPER && !actor\.impersonatedBy/.test(users) && (readFileSync("lib/actions/customers.ts", "utf8").match(/user\.role !== "DEVELOPER" && !user\.impersonatedBy/g)?.length ?? 0) === 2);
check("a Developer account is still never touched from the app, even while working as someone", (users.match(/blockDeveloperTarget\(/g)?.length ?? 0) >= 4);
check("work-as is NOT blocked for every action any more (the owner chose Everything, recorded)", !sessionSrc.includes("which is view-only"));
check("work-as writes are attributed to the Developer in the trail", readFileSync("lib/audit.ts", "utf8").includes("workingAs: { id: input.actor!.id, name: input.actor!.name }"));

section("The Developer Home shows system problems, never operations to-dos");
const diagnoseSrc = readFileSync("lib/developer/diagnose.ts", "utf8");
const monitorSrc = readFileSync("lib/developer/monitor.ts", "utf8");
check("no alert reads the business's queues (tickets, requests, submissions, issues, flights)", !/SupportTicket|BookingRequest|PickupRequest|PaymentSubmission|ShipmentException|"Batch"/.test(diagnoseSrc + monitorSrc.split("export async function getMonitor")[1]));
check("no alert hint hands work to staff", !/\b(Ask|Tell) (the )?(Finance|Customer Care|Dar warehouse|China warehouse|warehouse|Support)\b/i.test(diagnoseSrc + monitorSrc));
const panelSrc = readFileSync("components/developer/pulse-panel.tsx", "utf8");
check("the awareness sections carry no to-do lists (oldest tickets, requests, bills, issues)", !/Oldest (open|website|bills)|Waiting for Finance|Expenses waiting|Requests waiting|Open tickets/.test(panelSrc));

section("Deleting an account removes the account, never the data");
const delSrc = readFileSync("lib/actions/users.ts", "utf8");
const delBody = delSrc.slice(delSrc.indexOf("export async function deleteUser"));
check("only the Developer may delete an account", /actor\.role !== DEVELOPER/.test(delBody));
check("never yourself, never a Developer account", /userId === actor\.id/.test(delBody) && /blockDeveloperTarget\(\s*actor,\s*target,\s*"delete"/.test(delBody));
check("never the last owner", /onlyActiveOwner\(tx, target\.id\)/.test(delBody));
check("no typing: one popup and one Confirm", !/typed|confirm/.test(delBody.slice(0, delBody.indexOf("prisma.$transaction"))));
check("the row is KEPT: no user.delete call, so every record still names them", !/tx\.user\.delete|prisma\.user\.delete/.test(delBody) && /status: "INACTIVE"/.test(delBody));
check("login, password and address are all taken away", /active: false/.test(delBody) && /passwordHash:/.test(delBody) && /email: removedEmail/.test(delBody));
check("the old email is written into the audit line", /before:\s*\{\s*email:\s*target\.email/.test(delBody));
check("deleted accounts are left out of the lists people read", ["app/app/developer/accounts/page.tsx", "app/app/admin/users/page.tsx"].every((f) => readFileSync(f, "utf8").includes("NOT_REMOVED")));
check("suspending the last owner is refused", /onlyActiveOwner\(tx, target\.id\)\)\) \{\s*return \{ error: LAST_OWNER/.test(delSrc));

section("Suspending or deleting a customer: only the Developer, never the money");
const custSrc = readFileSync("lib/actions/customers.ts", "utf8");
const susBody = custSrc.slice(custSrc.indexOf("export async function setCustomerSuspended"), custSrc.indexOf("export async function removeCustomer"));
const rmBody = custSrc.slice(custSrc.indexOf("export async function removeCustomer"));
check("only the Developer may suspend or delete a customer", /authorize\("user\.manage"\)/.test(susBody) && /user\.role !== "DEVELOPER"/.test(susBody) && /authorize\("user\.manage"\)/.test(rmBody) && /user\.role !== "DEVELOPER"/.test(rmBody));
check("both claim the row as it was read, so two presses cannot both win", /updateMany\(/.test(susBody) && /claimed\.count === 0/.test(susBody) && /updateMany\(/.test(rmBody) && /claimed\.count === 0/.test(rmBody));
check("deleting a customer KEEPS the row: no customer.delete call, so cargo, bills and payments still name them", !/tx\.customer\.delete\(|prisma\.customer\.delete\(/.test(rmBody) && /removedAt: new Date\(\)/.test(rmBody));
check("their numbers are freed and written to the audit line", /customerPhone\.deleteMany/.test(rmBody) && /phones: customer\.phones\.map/.test(rmBody) && /phone: null/.test(rmBody));
check("no typing to delete: one popup, one Confirm", !/typed|confirmText/.test(rmBody));
check("a suspended customer cannot have cargo registered", /customer\.suspendedAt/.test(readFileSync("lib/actions/shipments.ts", "utf8")));
check("a suspended customer's goods are not handed over", /customer\.suspendedAt/.test(readFileSync("lib/actions/delivery.ts", "utf8")));
const MONEY_SCREENS = ["lib/credit-queries.ts", "lib/invoice-status.ts", "app/app/finance/payments/new/page.tsx", "app/app/collections"];
const moneyHits: string[] = [];
const scanMoney = (path: string) => {
  let st;
  try { st = statSync(path); } catch { return; }
  if (st.isDirectory()) { for (const name of readdirSync(path)) scanMoney(join(path, name)); return; }
  if (/\.(ts|tsx)$/.test(path) && /removedAt/.test(readFileSync(path, "utf8"))) moneyHits.push(path);
};
MONEY_SCREENS.forEach(scanMoney);
check("no screen that tracks money hides a removed customer, so a debt never disappears", moneyHits.length === 0, moneyHits.join(", "));
check("removed customers are left out of the search, the list and the pickers", ["app/api/customers/search/route.ts", "app/app/customers/page.tsx", "app/app/support/tickets/page.tsx", "app/app/support/sourcing/page.tsx", "app/api/developer/customers/route.ts"].every((f) => readFileSync(f, "utf8").includes("removedAt: null") || /removedAt = null/.test(readFileSync(f, "utf8"))));
check("customer lookup is Developer-only", /developer\.access/.test(readFileSync("app/api/developer/customers/route.ts", "utf8")));

section("Account actions sit on the row, like ORA");
const toolSrc = readFileSync("components/app/developer-account-tool.tsx", "utf8");
check("every action is a visible button on the row: no More menu", !/t\("More"\)|<summary/.test(toolSrc) && ["Work as", "Reset password", "Suspend", "Delete"].every((w) => toolSrc.includes(w)));

section("The system watches itself: errors, jobs, checks");
const vercelCrons = (JSON.parse(readFileSync("vercel.json", "utf8")).crons ?? []) as { path: string }[];
check("every scheduled job in vercel.json is watched on the Home", vercelCrons.every((c) => JOBS.some((j) => j.path === c.path)), vercelCrons.map((c) => c.path).join(", "));
check("the scheduled storage run writes its diary line", readFileSync("app/api/cron/storage/route.ts", "utf8").includes("recordJobRun"));
check("instrumentation records unexpected server errors", /export async function onRequestError/.test(readFileSync("instrumentation.ts", "utf8")));
check("an error message loses emails and phone numbers", !/@|2557/.test(cleanMessage(new Error("Cannot email jane.doe@example.com or call +255 712 345 678"))));
check("a page path loses record ids and the query string", cleanPath("/app/customers/cmt2hd5oe025esbzl0aqul12i/edit?token=abc") === "/app/customers/:id/edit" && cleanPath("/app/cargo/TX-000123") === "/app/cargo/:id");
await prisma.auditLog.deleteMany({ where: { action: "system.error", summary: { contains: "guard boom" } } });
await recordServerError(new Error("guard boom for jane@example.com"), { path: "/app/guard/cmt2hd5oe025esbzl0aqul12i", method: "GET" }, { routeType: "render" });
const errLine = await prisma.auditLog.findFirst({ where: { action: "system.error", summary: { contains: "guard boom" } } });
check("a server error is recorded with no personal details", !!errLine && !errLine.summary.includes("jane@") && (errLine.metadata as { path?: string })?.path === "/app/guard/:id");
await recordServerError(new Error("guard boom for jane@example.com"), { path: "/app/guard/cmt2hd5oe025esbzl0aqul12i", method: "GET" }, {});
check("the same error twice in a minute is written once", (await prisma.auditLog.count({ where: { action: "system.error", summary: { contains: "guard boom" } } })) === 1);
await recordServerError(new Error("You do not have permission to do that."), { path: "/x", method: "POST" }, {});
check("a business refusal is not recorded as a server error", (await prisma.auditLog.count({ where: { action: "system.error", summary: { contains: "permission" } } })) === 0);
await prisma.auditLog.deleteMany({ where: { action: "system.error", summary: { contains: "guard boom" } } });

await prisma.auditLog.deleteMany({ where: { action: "job.run", entityId: "storage" } });
let jobs = await getJobs();
check("before any run is recorded the job is 'not recorded yet', not an alarm", jobs.rows[0]?.state === "unknown" && jobs.problems.length === 0);
await recordJobRun({ key: "storage", name: "Storage charging", ok: true, ms: 1200, detail: { looked: 5, charged: 2, held: 0, failed: 0 } });
jobs = await getJobs();
check("a good run reads as on time, with what it did", jobs.rows[0]?.state === "ok" && /charged 2/.test(jobs.rows[0]?.detail ?? "") && jobs.problems.length === 0);
await recordJobRun({ key: "storage", name: "Storage charging", ok: false, ms: 300, error: new Error("boom") });
jobs = await getJobs();
check("a failed run raises an alert that says what to do", jobs.rows[0]?.state === "failed" && jobs.problems.some((p) => /failed on its last run/.test(p.title)));
await prisma.auditLog.deleteMany({ where: { action: "job.run", entityId: "storage" } });
await prisma.auditLog.create({ data: { action: "job.run", entity: "Job", entityId: "storage", summary: "old", metadata: { outcome: "success", ms: 1 }, createdAt: new Date(Date.now() - 50 * 3_600_000) } });
jobs = await getJobs();
check("a job that last ran 50 hours ago is LATE", jobs.rows[0]?.state === "late" && jobs.problems.some((p) => /not run on time/.test(p.title)));
await prisma.auditLog.deleteMany({ where: { action: "job.run", entityId: "storage" } });

section("The Developer opens accounts — owner included — and nobody else gains that");
const usersSrc = readFileSync("lib/actions/users.ts", "utf8");
check("only the owner or the Developer may create an owner (a manager still may not)", /input\.role === OWNER\s*&&\s*actor\.role !== OWNER\s*&&\s*actor\.role !== DEVELOPER/.test(usersSrc));
check("creating a Developer account from a screen is still refused", usersSrc.includes("blockDeveloperRole(\n      actor,\n      input.role,\n      \"create\""));
check("changing a role or a password still insists on a reason from the Developer", (usersSrc.match(/developerReason\(actor, formData\)/g)?.length ?? 0) >= 2);

section("One sign-in page, one-press Work as");
check("the sign-in form has no Staff/Developer toggle", !/accountType|Developer login|Staff login/.test(readFileSync("components/login-form.tsx", "utf8")));
check("the sign-in action does not take the account type from the form", !readFileSync("lib/actions/auth.ts", "utf8").includes("accountType"));
check("Work as asks for no reason (always on the trail)", !readFileSync("lib/actions/developer.ts", "utf8").includes("developerReasonRefusal"));
check("Work as still writes its audit line before it sets the cookie",
  (() => { const f = readFileSync("lib/actions/developer.ts", "utf8"); return f.indexOf('"developer.workas.start"') < f.indexOf("setWorkAsCookie({"); })());

/* Leave the staff account as it found it. The developer is kept on purpose. */
await prisma.loginEvent.deleteMany({ where: { email: { in: [STAFF_EMAIL, DEV_EMAIL] } } });
await prisma.user.delete({ where: { id: staff.id } }).catch(() => {});
await prisma.$disconnect();

console.log(failed === 0 ? "\nEvery developer-account check passed." : `\n${failed} CHECK(S) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
