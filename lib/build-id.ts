/**
 * Which build this is — the one fact a running page needs to know it is stale.
 *
 * Read at build time, not at request time. Vercel stamps the commit into the
 * environment when it compiles, so every deployment carries a different string
 * and two deployments of the same commit carry the same one. Locally there is
 * no commit, so it falls back to a constant: a dev server rebuilding under your
 * feet should not nag you to reload.
 */
export const BUILD_ID =
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ??
  process.env.VERCEL_GIT_COMMIT_SHA ??
  "development";
