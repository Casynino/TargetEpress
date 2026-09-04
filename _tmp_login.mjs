import fs from "node:fs";
const BASE = "http://localhost:3177";
export const pw = fs.readFileSync(".env", "utf8")
  .match(/SEED_ADMIN_PASSWORD=(.*)/)[1].trim().replace(/^["']|["']$/g, "");
export async function login(email) {
  const jar = new Map();
  const put = (r) => { for (const c of r.headers.getSetCookie()) { const [kv] = c.split(";"); const i = kv.indexOf("="); jar.set(kv.slice(0, i), kv.slice(i + 1)); } };
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  let r = await fetch(`${BASE}/api/auth/csrf`); put(r);
  const { csrfToken } = await r.json();
  r = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookie() },
    body: new URLSearchParams({ csrfToken, email, password: pw, callbackUrl: `${BASE}/app` }),
    redirect: "manual",
  });
  put(r);
  const s = await fetch(`${BASE}/api/auth/session`, { headers: { cookie: cookie() } });
  const session = await s.json();
  if (!session?.user) throw new Error("login failed for " + email);
  return { cookie: cookie(), session };
}
export { BASE };
