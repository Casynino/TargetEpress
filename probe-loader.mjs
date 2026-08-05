import { pathToFileURL } from "node:url";
const ROOT = process.env.PROBE_ROOT;
const MAP = new Map([
  ["@/lib/session", pathToFileURL(`${ROOT}/probe-stub-session.mjs`).href],
  ["next/cache", pathToFileURL(`${ROOT}/probe-stub-cache.mjs`).href],
]);
export async function resolve(specifier, context, next) {
  const hit = MAP.get(specifier);
  if (hit) return { url: hit, shortCircuit: true, format: "module" };
  return next(specifier, context);
}
