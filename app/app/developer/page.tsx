import type { Metadata } from "next";
import { BarChart3, ScrollText } from "lucide-react";

import { DeveloperAddPerson } from "@/components/app/developer-add-person";
import { DeveloperWorkAs } from "@/components/app/developer-work-as";
import { DevHero } from "@/components/developer/dev-hero";
import {
  ActivityPanel,
  Attention,
  PeoplePanel,
  SecurityPanel,
  SettingsPanel,
  SpeedPanel,
  StatusStrip,
} from "@/components/developer/home-sections";
import { Band, Section } from "@/components/developer/section";
import {
  CargoPanel,
  MessagesPanel,
  MoneyPanel,
} from "@/components/developer/pulse-panel";
import { QuickLink } from "@/components/developer/info";
import { ROLE_LABELS } from "@/lib/constants";
import {
  ChecksPanel,
  ErrorsJobsPanel,
} from "@/components/developer/system-panels";
import {
  failureProblem,
  runChecks,
  systemChecks,
} from "@/lib/developer/diagnose";
import { getErrors, getSecurity } from "@/lib/developer/events";
import { getJobs } from "@/lib/developer/jobs";
import { getMonitor, runProbes, scoreOf } from "@/lib/developer/monitor";
import { workAsPeople } from "@/lib/developer/people";
import { getOps, getPulse } from "@/lib/developer/pulse";
import { requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Developer home" };

/**
 * THE DEVELOPER'S HOME: one verdict, what needs attention, then the detail one
 * tab at a time. Read-only — nothing on this page changes anything, and the
 * only way to act is through Access, where every action is recorded.
 */
export default async function DeveloperHomePage() {
  const me = await requirePermission("developer.access");
  /* The speed probes first and alone — timed in a crowd they would measure the
     queue, not the database. Then everything else the Home needs, asked at once:
     the reads do not depend on each other, and run one after another they were
     what made this page slow. */
  const ready = await runProbes();
  const [monitor, people, pulse, ops, checks, sec, errors, jobs] =
    await Promise.all([
      getMonitor(ready),
      workAsPeople(),
      getPulse(),
      getOps(),
      runChecks(),
      getSecurity(),
      getErrors(),
      getJobs(),
    ]);

  /* One list of everything wrong: the infrastructure checks, plus the rules the
     system promises. Worst first. */
  const readFailures = [
    ...monitor.readFailures,
    ...pulse.readFailures,
    ...ops.readFailures,
    ...sec.readFailures,
    ...errors.readFailures,
    ...jobs.failures,
  ];
  const failed = failureProblem(readFailures, checks.couldNot);
  const rank = { critical: 0, warning: 1, info: 2 } as const;
  const problems = [
    ...monitor.problems,
    ...checks.problems,
    ...errors.problems,
    ...jobs.problems,
    ...(failed ? [failed] : []),
  ].sort((a, b) => rank[a.level] - rank[b.level]);
  const m = { ...monitor, problems, score: scoreOf(problems) };

  /* The list behind "System checks": the page-level facts, every rule checked,
     and the jobs, each with how it came out. */
  const checkList = [
    ...systemChecks(monitor, readFailures.length),
    ...checks.checks,
    ...jobs.rows.map((j) => ({
      label: `${j.name} runs on time`,
      group: "Jobs",
      status:
        j.state === "ok"
          ? ("ok" as const)
          : j.state === "unknown"
            ? ("unknown" as const)
            : ("look" as const),
      note:
        j.state === "unknown"
          ? "No run recorded yet — the first is tonight"
          : undefined,
    })),
    {
      label: "No unexpected server errors in the last 24 hours",
      group: "Servers",
      status: errors.kinds24 ? ("look" as const) : ("ok" as const),
      note: errors.kinds24 ? `${errors.kinds24} different error(s)` : undefined,
    },
  ];

  /* Every role but Developer: that one is never given from a screen. */
  const roles = Object.entries(ROLE_LABELS)
    .filter(([value]) => value !== "DEVELOPER")
    .map(([value, label]) => ({ value, label }));

  const firstName = me.name.split(" ")[0] || "Developer";
  const eatHour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Dar_es_Salaam",
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
  );
  const greeting =
    eatHour >= 5 && eatHour < 12
      ? "Good morning"
      : eatHour >= 12 && eatHour < 17
        ? "Good afternoon"
        : "Good evening";
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Dar_es_Salaam",
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());

  return (
    <div className="space-y-6">
      <DevHero
        eyebrow={dateLabel}
        title={`${greeting}, ${firstName}.`}
        subtitle="Your control room for Target Express — health, people and everything done, in one place."
      />

      {/* What you press, in one row: the two things that act, then the two that look. */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DeveloperWorkAs tile people={people} />
        <DeveloperAddPerson tile roles={roles} />
        <QuickLink
          href="/app/developer/audit"
          icon={ScrollText}
          title="Audit"
          text="Everything done in the system, by staff and by you."
        />
        <QuickLink
          href="/app/developer/business"
          icon={BarChart3}
          title="Business"
          text="Cargo, bills, payments and customers. Read only."
        />
      </section>

      <StatusStrip m={m} />
      <Attention m={m} />

      <Section
        id="activity"
        title="Activity"
        text="Who is signing in and what the team is doing."
      >
        <ActivityPanel m={m} online={pulse.onlineNow} />
      </Section>

      <Band>The system</Band>

      <Section
        id="checks"
        title="System checks"
        text="Every rule the system promises, checked just now."
      >
        <ChecksPanel checks={checkList} />
      </Section>

      <Section
        id="errors"
        title="Errors &amp; jobs"
        text="Server errors the app recorded, and the jobs it runs by itself."
      >
        <ErrorsJobsPanel errors={errors} jobs={jobs.rows} />
      </Section>

      <Section
        id="security"
        title="Sign-ins &amp; security"
        text="Wrong passwords, locked sign-ins and what was refused to you."
      >
        <SecurityPanel m={m} sec={sec} />
      </Section>

      <Section
        id="speed"
        title="Speed &amp; size"
        text="Real queries timed now, and how big the database has grown."
      >
        <SpeedPanel m={m} />
      </Section>

      <Section
        id="settings"
        title="Settings"
        text="What the site is configured with."
      >
        <SettingsPanel m={m} />
      </Section>

      <Band>The business, for awareness</Band>

      <Section
        id="cargo"
        title="Cargo"
        text="What is in the system and where it is. The business's work, not yours."
      >
        <CargoPanel p={pulse} o={ops} />
      </Section>

      <Section
        id="money"
        title="Money"
        text="Bills, payments and the money book. Finance's work, not yours."
      >
        <MoneyPanel p={pulse} o={ops} />
      </Section>

      <Section
        id="messages"
        title="Messages &amp; requests"
        text="What customers ask for. Customer Care's work, not yours."
      >
        <MessagesPanel o={ops} />
      </Section>

      <Section
        id="people"
        title="People &amp; my actions"
        text="Who has an account, and what you have done."
      >
        <PeoplePanel m={m} />
      </Section>
    </div>
  );
}
