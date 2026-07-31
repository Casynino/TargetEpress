/**
 * The weekly flight rhythm.
 *
 * Cargo leaves Guangzhou every Wednesday, Friday and Sunday. Nothing about that
 * is stored, and nothing is hardcoded to a date — the schedule is derived from
 * whatever day it is now, so the website is still correct in 2031 with nobody
 * having touched it. A table of dates in a database is a table somebody has to
 * remember to extend, and the week it lapses is the week the site starts lying.
 *
 * Cut-off is the day before departure: cargo has to be on the loading table,
 * weighed and labelled, by the end of that day to make the flight.
 */

export const FLIGHT_DAYS = [3, 5, 0] as const; // Wed, Fri, Sun (JS day numbers)

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export type ScheduledFlight = {
  /** Midnight local on the departure day. */
  departsAt: Date;
  departureDay: string;
  /** Last day cargo is accepted for it. */
  cutOffAt: Date;
  cutOffDay: string;
  /** Whole days from today until departure. 0 means it leaves today. */
  daysAway: number;
  /** True once the cut-off has passed — you can still see it, not board it. */
  closed: boolean;
};

function midnight(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/**
 * The next `count` departures, starting from today.
 *
 * `from` exists so this can be tested against a fixed day rather than whatever
 * the machine believes the date is.
 */
export function upcomingFlights(count = 3, from = new Date()): ScheduledFlight[] {
  const today = midnight(from);
  const flights: ScheduledFlight[] = [];

  // Three departures a week, so the days needed scale with the count. The +7
  // absorbs however the week happens to fall — asking for ten flights on a
  // Monday needs more calendar than asking on a Saturday.
  const window = Math.ceil((count / FLIGHT_DAYS.length) * 7) + 7;

  for (let offset = 0; offset < window && flights.length < count; offset += 1) {
    const day = addDays(today, offset);
    if (!FLIGHT_DAYS.includes(day.getDay() as (typeof FLIGHT_DAYS)[number])) {
      continue;
    }

    const cutOff = addDays(day, -1);
    flights.push({
      departsAt: day,
      departureDay: DAY_NAMES[day.getDay()],
      cutOffAt: cutOff,
      cutOffDay: DAY_NAMES[cutOff.getDay()],
      daysAway: offset,
      // Today's flight has already stopped accepting cargo — the cut-off was
      // yesterday. Saying "0 days remaining" would invite someone to try.
      closed: offset === 0,
    });
  }

  return flights;
}

/** "Leaves tomorrow", "3 days left" — the phrase under a countdown. */
export function countdownLabel(flight: ScheduledFlight) {
  if (flight.closed) return "Departing today";
  if (flight.daysAway === 1) return "Leaves tomorrow";
  return `${flight.daysAway} days remaining`;
}

/** How urgent the card should look. */
export function flightTone(flight: ScheduledFlight): "closed" | "urgent" | "open" {
  if (flight.closed) return "closed";
  if (flight.daysAway <= 1) return "urgent";
  return "open";
}
