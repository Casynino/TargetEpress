/** Small formatters for the Developer console. Times are always Tanzania time. */

const TZ = "Africa/Dar_es_Salaam";

export const formatNumber = (n: number) => new Intl.NumberFormat("en-US").format(n);

/** "CHINA_WAREHOUSE" → "China warehouse". */
export const humanize = (s: string) => {
  const t = s.replace(/[_.]/g, " ").toLowerCase().trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export function timeAgo(d: Date | string): string {
  const secs = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** Hover text for times: always Tanzania time, clearly labelled. */
export const eat = (d: Date | string) =>
  `${new Intl.DateTimeFormat("en-GB", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" }).format(new Date(d))} EAT`;

export const shortDay = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export const bytes = (n: number) =>
  n >= 1073741824
    ? `${(n / 1073741824).toFixed(2)} GB`
    : n >= 1048576
      ? `${(n / 1048576).toFixed(1)} MB`
      : `${Math.max(1, Math.round(n / 1024))} KB`;

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "?";
