import "server-only";

import { AIRPORT_LABELS } from "@/lib/cargo";
import { prisma } from "@/lib/prisma";
import {
  BATCH_COST_TYPES,
  COMMON_EXPENSES,
  EXPENSE_CATEGORY_GROUPS,
  EXPENSE_CATEGORY_LABELS,
} from "@/lib/expenses";

/**
 * WHAT THIS DESK HAS ACTUALLY PAID FOR, AND WHAT IT HAS NEVER PAID FOR.
 *
 * The picker in front of a clerk recording a cost is only worth having if it
 * knows two things a plain list cannot: which costs this business really
 * records — so the ones it records weekly rise to the top on their own — and
 * which it has NOT recorded yet, which is the half that catches the mistake.
 *
 * A flight with no customs charge against it is either a flight that owed no
 * duty or a receipt nobody has written down, and the second is how a batch
 * reads as pure profit. So the flights with nothing on them come first, and
 * every cost type says whether this flight has ever carried it.
 *
 * Bounded on purpose. Habit is recent: a cost nobody has recorded since last
 * year is not a shortcut, and grouping every expense ever recorded on every
 * page load is a scan that costs nothing in year one and grows without limit
 * after it.
 */
const HABIT_DAYS = 183;

export type PickerItem = {
  label: string;
  category: string;
  /** How many times this exact cost has been recorded lately. 0 = never. */
  times: number;
  /** What it came to last time, because the same bill usually repeats. */
  last: { amount: number; currency: string } | null;
};

export type PickerGroup = {
  key: string;
  label: string;
  items: PickerItem[];
};

export type PickerFlight = {
  id: string;
  /** GZ-56 — what the clerk reads off the manifest. */
  label: string;
  /** "Guangzhou · arrived 8 Sept" — enough to tell two flights apart. */
  detail: string;
  recorded: number;
  /** The cost types already on this flight, so the rest can say they are not. */
  recordedLabels: string[];
};

export type PickerPerson = {
  name: string;
  role: string;
  /** Draws recorded against this person. 0 = nothing drawn yet. */
  draws: number;
};

export type ExpensePickerData = {
  office: PickerGroup[];
  flights: PickerFlight[];
  flightCosts: PickerItem[];
  special: PickerItem[];
  people: PickerPerson[];
  draws: PickerItem[];
};

/** The groups that belong to the office rather than to one flight. */
const OFFICE_GROUPS = ["office", "staff", "financial", "other"];

export async function expensePickerData(): Promise<ExpensePickerData> {
  const since = new Date(Date.now() - HABIT_DAYS * 24 * 60 * 60 * 1000);

  const [habit, recent, flights, drawn, managers] = await Promise.all([
    /* Every distinct cost this desk has written down lately, with how often.
       Void rows are not habit — they are a cost that turned out not to be
       one. */
    prisma.expense.groupBy({
      by: ["description", "category"],
      where: { status: { not: "VOID" }, incurredAt: { gte: since } },
      _count: true,
      orderBy: { _count: { description: "desc" } },
      take: 120,
    }),
    /* The last figure against each name. One scan of recent costs rather
       than a query per row: the same bill usually costs what it cost last
       time, and offering that saves the typing that gets a nought wrong. */
    prisma.expense.findMany({
      where: { status: { not: "VOID" }, incurredAt: { gte: since } },
      orderBy: { incurredAt: "desc" },
      take: 400,
      select: { description: true, category: true, amount: true, currency: true },
    }),
    /* Flights a cost can still be recorded against. A closed flight takes no
       more costs (recordExpense refuses one), so offering it here would be
       offering a refusal. */
    prisma.batch.findMany({
      where: { closedAt: null },
      orderBy: [{ arrivedAt: "desc" }, { createdAt: "desc" }],
      take: 12,
      select: {
        id: true,
        batchNumber: true,
        origin: true,
        status: true,
        arrivedAt: true,
        expenses: {
          where: { status: { not: "VOID" } },
          select: { description: true },
        },
      },
    }),
    /* Who has drawn money out of the business, and how often. The draw is
       recorded against the person in `vendor` — there is no other link from a
       cost to a person in this system. */
    prisma.expense.groupBy({
      by: ["vendor"],
      where: { category: "EXECUTIVE_DRAW", status: { not: "VOID" }, vendor: { not: null } },
      _count: true,
      orderBy: { _count: { vendor: "desc" } },
    }),
    prisma.user.findMany({
      where: { active: true, role: { in: ["ADMIN", "MANAGER"] } },
      select: { name: true, role: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const keyOf = (label: string, category: string) =>
    `${label.trim().toLowerCase()}|${category}`;

  const lastOf = new Map<string, { amount: number; currency: string }>();
  for (const row of recent) {
    const key = keyOf(row.description, row.category);
    if (lastOf.has(key)) continue;
    lastOf.set(key, { amount: Number(row.amount), currency: row.currency });
  }

  const timesOf = (label: string, category: string) =>
    habit.find(
      (row) =>
        row.description.trim().toLowerCase() === label.trim().toLowerCase() &&
        row.category === category
    )?._count ?? 0;

  /* The seeded costs, plus anything this desk has typed itself. A name the
     business uses — "DAWASA", "TRA duty" — belongs in the list beside the
     seeded ones, under the same group its category sits in. */
  const catalogue: PickerItem[] = [];
  const seen = new Set<string>();
  for (const item of [
    ...habit.map((row) => ({ label: row.description, category: row.category as string })),
    ...COMMON_EXPENSES,
  ]) {
    const key = `${item.label.trim().toLowerCase()}|${item.category}`;
    if (!item.label.trim() || seen.has(key)) continue;
    seen.add(key);
    catalogue.push({
      ...item,
      times: timesOf(item.label, item.category),
      last: lastOf.get(key) ?? null,
    });
  }

  const groupOf = (key: string) =>
    EXPENSE_CATEGORY_GROUPS.find((group) => group.key === key);

  /*
    A KIND NOBODY HAS PAID FOR STILL HAS TO BE PICKABLE.

    The list is built from what has been recorded, so a category this business
    has never once used would simply not appear — and the first electricity
    bill would have nowhere to go but "Something else". Each category with
    nothing against it stands in for itself, named after the category, and the
    row says "Never recorded yet" in as many words.
  */
  const office: PickerGroup[] = EXPENSE_CATEGORY_GROUPS.filter((group) =>
    OFFICE_GROUPS.includes(group.key)
  ).map((group) => {
    const items = catalogue.filter((item) => group.categories.includes(item.category));
    const standIns = group.categories
      .filter((category) => !items.some((item) => item.category === category))
      .map((category) => ({
        label: EXPENSE_CATEGORY_LABELS[category] ?? category,
        category,
        times: 0,
        last: null,
      }));
    return {
      key: group.key,
      label: group.label,
      items: [...items, ...standIns].sort(
        (a, b) => b.times - a.times || a.label.localeCompare(b.label)
      ),
    };
  });

  return {
    office,
    flights: flights.map((batch) => ({
      id: batch.id,
      label: batch.batchNumber,
      detail: `${AIRPORT_LABELS[batch.origin]} · ${
        batch.arrivedAt ? "arrived" : "in the air"
      }`,
      recorded: batch.expenses.length,
      recordedLabels: batch.expenses.map((e) => e.description),
    })),
    flightCosts: BATCH_COST_TYPES.map((type) => ({
      label: type.label,
      category: type.category as string,
      times: timesOf(type.label, type.category),
      last: lastOf.get(keyOf(type.label, type.category)) ?? null,
    })),
    /* What has been recorded as special before — the only honest "used most"
       for a kind of cost the business records twice a year. */
    special: catalogue.filter((item) => item.category === "EXECUTIVE_DRAW"),
    people: [
      ...managers.map((user) => ({
        name: user.name,
        role: user.role === "ADMIN" ? "Owner" : "Manager",
        draws: drawn.find((row) => row.vendor === user.name)?._count ?? 0,
      })),
      /* Anybody already drawn against who is not a manager here — the record
         is what it is, and hiding them would hide the draws. */
      ...drawn
        .filter((row) => row.vendor && !managers.some((u) => u.name === row.vendor))
        .map((row) => ({ name: row.vendor as string, role: "Drawn before", draws: row._count })),
    ],
    draws: [
      { label: "Executive draw", category: "EXECUTIVE_DRAW" },
      { label: "Travel", category: "TRAVEL" },
      { label: "Allowance", category: "ALLOWANCE" },
      { label: "Staff welfare", category: "STAFF_WELFARE" },
    ].map((item) => ({
      ...item,
      times: timesOf(item.label, item.category),
      last: lastOf.get(keyOf(item.label, item.category)) ?? null,
    })),
  };
}
