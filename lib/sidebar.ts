/*
  Shared by the server layout and the client sidebar, so it lives outside the
  "use client" file: a server component importing a constant from a client
  module receives a client reference, not the string.
*/

/** Read by app/app/layout.tsx so a folded sidebar is folded on the first paint. */
export const SIDEBAR_COOKIE = "tx.sidebar";

/** The room the page leaves for the floating panel, open and folded. */
export const SIDEBAR_ROOM = { open: "17.5rem", rail: "5.9rem" } as const;
