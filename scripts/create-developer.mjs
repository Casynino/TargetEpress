#!/usr/bin/env node
// Create — or recover — the ONE Developer account. Run it yourself, in your own
// terminal; no screen in the application can do either.
//
//   Local:       node scripts/create-developer.mjs
//   Production:  node scripts/create-developer.mjs      (paste the Neon URL when asked)
//   Forgot the password:  node scripts/create-developer.mjs --recover
//
// • The password is typed at a hidden prompt — never in source, shell history
//   or a log — and must be typed twice.
// • It always ASKS which database it is about to change. It never trusts
//   whatever DATABASE_URL happens to be set in the terminal.
// • It refuses if a Developer account already exists (unless --recover), if the
//   email is already used by a staff account, or if the database has not had
//   scripts/neon-developer-account.sql applied yet.
// • The Developer's email must be DIFFERENT from your staff email: one person,
//   two separate accounts, so signing in as one can never become the other.

import { ask as askPlain, askHidden } from "./_prompt.mjs";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const recover = process.argv.includes("--recover");
const ask = (q, { hidden = false } = {}) => (hidden ? askHidden(q).then((s) => s.trim()) : askPlain(q));

function strongEnough(pw) {
  if (pw.length < 14) return "Use at least 14 characters.";
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (classes < 3) return "Mix at least three of: lowercase, uppercase, digits, symbols.";
  if (/^(.)\1+$/.test(pw)) return "That's too repetitive.";
  return null;
}

async function chooseNewPassword() {
  console.log("\nChoose a NEW password: at least 14 characters, e.g. a few words, dashes and numbers.");
  console.log("Don't reuse a password you've shown anyone or typed anywhere else.");
  for (let attempt = 1; ; attempt++) {
    if (attempt > 6) { console.log("Too many tries. Nothing was changed."); process.exit(1); }
    const pw = await askHidden("Choose a password (hidden): ");
    const weak = strongEnough(pw);
    if (weak) { console.log(`  ✗ ${weak} Try again.`); continue; }
    if (pw === (await askHidden("Repeat the password: "))) return pw;
    console.log("  ✗ The two passwords didn't match. Try again.");
  }
}

let prisma;
try {
  let url = (process.env.CREATE_DEV_DB_URL ?? "").trim();
  if (!/^postgres(ql)?:\/\//.test(url)) {
    url = await ask(
      "\nPaste your database URL (it starts with postgresql://, hidden as you paste).\nPress Enter instead to use the LOCAL test database: ",
      { hidden: true },
    );
  }
  if (url && !/^postgres(ql)?:\/\//.test(url)) {
    console.log("That doesn't look like a database URL — it must start with postgresql://   Nothing was changed.");
    process.exit(1);
  }
  prisma = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
  const host = url ? (url.match(/@([^/:?]+)/) || [])[1] ?? "(unknown host)" : "LOCAL database (.env)";
  console.log(`\nTarget database: ${host}`);
  const go = await ask(`${recover ? "Reset the Developer password" : "Create the Developer account"} on THIS database? (yes/no): `);
  if (go.toLowerCase() !== "yes") { console.log("Cancelled."); process.exit(0); }

  // Has the database been told the DEVELOPER role exists?
  const roles = await prisma.$queryRaw`SELECT unnest(enum_range(NULL::"Role"))::text AS v`;
  if (!roles.some((r) => r.v === "DEVELOPER")) {
    console.log("\nThe database doesn't know the DEVELOPER role yet. Apply scripts/neon-developer-account.sql first:");
    console.log('  npx prisma db execute --url "<that database url>" --file scripts/neon-developer-account.sql');
    process.exit(1);
  }

  const existing = await prisma.user.findFirst({ where: { role: "DEVELOPER" }, select: { id: true, email: true, name: true } });

  if (recover) {
    if (!existing) { console.log("There is no Developer account to recover. Run this without --recover to create one."); process.exit(1); }
    console.log(`\nRecovering the Developer account ${existing.email}.`);
    const pw = await chooseNewPassword();
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash: await bcrypt.hash(pw, 12), active: true, status: "ACTIVE" },
    });
    await prisma.auditLog.create({
      data: {
        actorId: null,
        action: "developer.recovered",
        entity: "User",
        entityId: existing.id,
        summary: `Developer account ${existing.email} recovered through the secure setup process.`,
        metadata: { developer: true, outcome: "success", via: "scripts/create-developer.mjs --recover", timezone: "Africa/Dar_es_Salaam" },
      },
    });
    console.log(`\n✔ Password reset for ${existing.email}. Sign in on the normal /login page, using Developer login.`);
    process.exit(0);
  }

  if (existing) { console.log(`A Developer account already exists (${existing.email}). Nothing changed. (Forgot the password? Use --recover.)`); process.exit(0); }

  const name = await ask("Your name (shown in the audit log): ");
  const email = (await ask("Developer email (must differ from your staff email): ")).toLowerCase();
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) { console.log("Need a name and a valid email."); process.exit(1); }
  if (await prisma.user.findUnique({ where: { email } })) {
    console.log("That email is already used by another account. A Developer account needs its own, separate email.");
    process.exit(1);
  }

  const pw = await chooseNewPassword();
  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash: await bcrypt.hash(pw, 12),
      role: "DEVELOPER",
      department: "MANAGEMENT",
      preferredLanguage: "en",
    },
  });
  await prisma.auditLog.create({
    data: {
      actorId: null,
      action: "developer.created",
      entity: "User",
      entityId: user.id,
      summary: `Developer account created for ${name} (${email}).`,
      metadata: { developer: true, outcome: "success", via: "scripts/create-developer.mjs", timezone: "Africa/Dar_es_Salaam" },
    },
  });

  console.log(`
✔ Developer account created for ${email}
  Sign in on the normal /login page: choose "Developer login", then use that email and your password.
`);
} finally {
  await prisma?.$disconnect();
}
