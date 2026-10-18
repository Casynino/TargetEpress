import type { Metadata } from "next";
import { BarChart3, LogIn, ScrollText } from "lucide-react";

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
import { QuickLink } from "@/components/developer/info";
import { ROLE_LABELS } from "@/lib/constants";
import { getMonitor } from "@/lib/developer/monitor";
import { workAsPeople } from "@/lib/developer/people";
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
  const m = await getMonitor();
  const people = await workAsPeople();

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
    <div className="space-y-8">
      <DevHero
        eyebrow={dateLabel}
        title={`${greeting}, ${firstName}.`}
        subtitle="Your control room for Target Express — health, people and everything done, in one place."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <DeveloperWorkAs onHero people={people} />
            <DeveloperAddPerson onHero roles={roles} />
          </div>
        }
      />

      <StatusStrip m={m} />
      <Attention m={m} />

      <section className="grid gap-3 md:grid-cols-3">
        <QuickLink
          href="/app/developer/accounts"
          icon={LogIn}
          title="Open Access (work as someone)"
          text="Open the app as the owner, Finance or a warehouse clerk to see exactly what they see. One click. View only, and every start is recorded under your name."
        />
        <QuickLink
          href="/app/developer/audit"
          icon={ScrollText}
          title="Open Audit"
          text="The permanent diary of everything done in the system — by staff and by you. Developer lines can never be edited or deleted."
        />
        <QuickLink
          href="/app/developer/business"
          icon={BarChart3}
          title="Open Business"
          text="See cargo, bills, payments and customers in read-only tables. Good for checking a number without risking a change."
        />
      </section>

      <HomeTabs
        tabs={tabs}
        initial="activity"
        panels={{
          activity: <ActivityPanel m={m} />,
          speed: <SpeedPanel m={m} />,
          security: <SecurityPanel m={m} />,
          settings: <SettingsPanel m={m} />,
          people: <PeoplePanel m={m} />,
        }}
      />
    </div>
  );
}
