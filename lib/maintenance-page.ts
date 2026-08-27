/**
 * The black page the whole site shows while the owner is checking something.
 *
 * Deliberately self-contained: no imports, no CSS file, no /_next asset, no
 * font to fetch. The middleware hands this back as the entire response before
 * anything else runs, so it has to be able to render when nothing else is
 * being served — including itself.
 *
 * Kiswahili first, then English, the same order as the storage notice on an
 * invoice: the people who hit this page are in Dar es Salaam.
 */
export function maintenancePage(): string {
  return `<!doctype html>
<html lang="sw">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Target Express Air Cargo</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{height:100%}
  body{
    background:#000;color:#fff;
    font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    display:grid;place-items:center;padding:2rem;text-align:center;
    -webkit-font-smoothing:antialiased;
  }
  main{max-width:32rem;display:grid;gap:1.75rem;justify-items:center}
  .mark{
    font-size:.7rem;letter-spacing:.28em;text-transform:uppercase;
    color:#8a8a8a;font-weight:600;
  }
  h1{font-size:clamp(1.6rem,6vw,2.4rem);font-weight:600;line-height:1.15;letter-spacing:-.01em}
  p{color:#a1a1a1;font-size:.95rem;line-height:1.6}
  p+p{margin-top:-.9rem}
  .rule{width:2.5rem;height:1px;background:#2a2a2a}
  .dot{
    display:inline-block;width:6px;height:6px;border-radius:50%;
    background:#fff;margin-right:.55rem;vertical-align:middle;
    animation:pulse 1.8s ease-in-out infinite;
  }
  .status{font-size:.8rem;color:#6f6f6f;letter-spacing:.04em}
  @keyframes pulse{0%,100%{opacity:.25}50%{opacity:1}}
  @media (prefers-reduced-motion:reduce){.dot{animation:none;opacity:.7}}
</style>
</head>
<body>
  <main>
    <div class="mark">Target Express Air Cargo</div>
    <h1>Tunafanya matengenezo madogo</h1>
    <p>Tutarudi hivi punde. Mzigo wako uko salama.</p>
    <div class="rule"></div>
    <p>We are making a few changes. The site will be back shortly &mdash; your cargo is safe and nothing has been lost.</p>
    <div class="status"><span class="dot"></span>Under construction</div>
  </main>
</body>
</html>`;
}
