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
import { HomeTabs, type HomeTab } from "@/components/developer/home-tabs";
import {
  CargoPanel,
  MessagesPanel,
  MoneyPanel,
} from "@/components/developer/pulse-panel";
import { QuickLink } from "@/components/developer/info";
import { ROLE_LABELS } from "@/lib/constants";
import { failureProblem, runChecks } from "@/lib/developer/diagnose";
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
  const [monitor, people, pulse, ops, checks] = await Promise.all([
    getMonitor(ready),
    workAsPeople(),
    getPulse(),
    getOps(),
    runChecks(),
  ]);

  /* One list of everything wrong: the infrastructure checks, plus the rules the
     system promises. Worst first. */
  const failed = failureProblem(
    [...monitor.readFailures, ...pulse.readFailures, ...ops.readFailures],
    checks.couldNot,
  );
  const rank = { critical: 0, warning: 1, info: 2 } as const;
  const problems = [
    ...monitor.problems,
    ...checks.problems,
    ...(failed ? [failed] : []),
  ].sort((a, b) => rank[a.level] - rank[b.level]);
  const m = { ...monitor, problems, score: scoreOf(problems) };

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

  const missing = m.env.filter((e) => !e.set && e.required).length;
  const securityBadge = m.security.failed24 + m.security.devRefused24;

  const tabs: HomeTab[] = [
    { id: "activity", label: "Activity" },
    { id: "cargo", label: "Cargo" },
    { id: "money", label: "Money" },
    { id: "messages", label: "Messages & requests" },
    {
      id: "speed",
      label: "Speed & size",
      badge: `${m.avgMs} ms`,
      tone: m.avgMs >= 400 ? "bad" : m.avgMs >= 150 ? "warn" : "neutral",
    },
    {
      id: "security",
      label: "Sign-ins & security",
      badge: securityBadge > 0 ? String(securityBadge) : null,
      tone: m.security.failed24 >= 10 ? "bad" : "warn",
    },
    {
      id: "settings",
      label: "Settings",
      badge: missing > 0 ? String(missing) : null,
      tone: "bad",
    },
    { id: "people", label: "People & my actions" },
  ];

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

      <HomeTabs
        tabs={tabs}
        initial="activity"
        panels={{
          activity: <ActivityPanel m={m} online={pulse.onlineNow} />,
          cargo: <CargoPanel p={pulse} o={ops} />,
          money: <MoneyPanel p={pulse} o={ops} />,
          messages: <MessagesPanel o={ops} />,
          speed: <SpeedPanel m={m} />,
          security: <SecurityPanel m={m} />,
          settings: <SettingsPanel m={m} />,
          people: <PeoplePanel m={m} />,
        }}
      />
    </div>
  );
}
