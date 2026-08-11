/**
 * The staff guide template.
 *
 * One design system, five departments. Each department supplies content only —
 * this file owns every typographic and colour decision, so the Finance guide and
 * the Guangzhou guide cannot drift apart as they are edited.
 *
 * Renders A4 portrait (210 x 297mm). Screens are rebuilt from a small
 * declarative vocabulary rather than screenshotted, so a guide stays sharp at
 * print resolution and can be re-rendered when the real screen changes.
 */

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Body copy may carry *emphasis* — the one bit of markup content authors get. */
const rich = (s) => esc(s).replace(/\*([^*]+)\*/g, "<b>$1</b>");

const CSS = `
:root {
  --ink:#0b1220; --ink-2:#0f1729; --panel:#131e35; --navy:#182a48; --line:#26344f;
  --signal:#d81e2a; --paid:#22a86a; --owed:#e09612; --draft:#7c8ba5;
  --fg:#eef2f8; --muted:#93a0b6;
  /* PingFang trails each stack so the Guangzhou edition sets Chinese properly —
     Avenir Next carries no CJK glyphs and would silently drop to a default. */
  --display:"Avenir Next","Helvetica Neue","PingFang SC",sans-serif;
  --narrow:"Avenir Next Condensed","Avenir Next","PingFang SC",sans-serif;
  --body:"Helvetica Neue",Helvetica,"PingFang SC",sans-serif;
  --mono:"Menlo","PingFang SC",monospace;
}
@page { size: A4 portrait; margin: 0; }
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:var(--ink)}
body{color:var(--fg);font-family:var(--body);-webkit-print-color-adjust:exact;print-color-adjust:exact;-webkit-font-smoothing:antialiased}

.page{position:relative;width:210mm;height:296.6mm;overflow:hidden;padding:16mm 16mm 11mm;
  background:var(--ink);display:flex;flex-direction:column;page-break-after:always;break-after:page}
.page:last-of-type{page-break-after:auto;break-after:auto}
.page::before{content:"";position:absolute;top:-50mm;right:-40mm;width:130mm;height:130mm;
  background:radial-gradient(circle,rgba(24,42,72,.85) 0%,rgba(11,18,32,0) 70%);pointer-events:none}
.page>*{position:relative}

h1,h2{font-family:var(--display);font-weight:600;margin:0;letter-spacing:-.025em}
h1{font-size:38pt;line-height:1.03}
h2{font-size:20pt;line-height:1.12}
h3{font-family:var(--display);font-weight:600;font-size:11.5pt;margin:0;letter-spacing:-.01em}
p{margin:0;font-size:10.5pt;line-height:1.55;color:var(--muted)}
p b{color:var(--fg);font-weight:500}

.eyebrow{font-family:var(--narrow);font-size:9pt;font-weight:600;text-transform:uppercase;letter-spacing:.22em;color:var(--muted)}
.label{font-family:var(--narrow);font-size:7.5pt;font-weight:600;text-transform:uppercase;letter-spacing:.16em;color:var(--muted)}
.hairline{height:1px;background:var(--line)}
.accent-rule{height:3pt;width:24mm;background:var(--signal);border-radius:2pt}

.foot{margin-top:auto;padding-top:4mm;border-top:1px solid var(--line);display:flex;justify-content:space-between;align-items:baseline}
.foot span{font-family:var(--narrow);font-size:7.5pt;letter-spacing:.16em;text-transform:uppercase;color:#5d6c85}
.head{display:flex;flex-direction:column;gap:2.5mm;margin-bottom:7mm}

/* cover */
.cover{gap:6mm}
.cover>.accent-rule{margin-top:auto}
.cover h1{font-size:46pt}
.cover .lede{font-size:12pt;line-height:1.5}
.route{display:flex;align-items:center;gap:3mm;font-family:var(--narrow);font-size:9pt;
  letter-spacing:.2em;text-transform:uppercase;color:var(--muted)}
.route .dash{flex:0 0 18mm;height:1px;background:var(--signal)}

/* step page */
.stepno{display:flex;align-items:baseline;gap:3mm;font-family:var(--display);font-weight:600}
.stepno .n{font-size:30pt;line-height:1;letter-spacing:-.03em}
.stepno .of{font-family:var(--narrow);font-size:8.5pt;letter-spacing:.18em;text-transform:uppercase;color:var(--muted)}
.stepno[data-state=draft] .n{color:var(--draft)}
.stepno[data-state=owed] .n{color:var(--owed)}
.stepno[data-state=paid] .n{color:var(--paid)}
.stepno[data-state=plain] .n{color:var(--fg)}

.body-copy{display:flex;flex-direction:column;gap:3.5mm}
.where{font-family:var(--mono);font-size:8.5pt;color:var(--muted);padding:2mm 3mm;
  border:1px solid var(--line);border-radius:2mm;background:var(--ink-2);align-self:flex-start}
.where b{color:var(--fg);font-weight:400}
.caution{display:flex;padding:3.5mm 4mm;border-radius:2mm;background:var(--ink-2);
  border:1px solid var(--line);border-left:2pt solid var(--signal)}
.caution p{font-size:9.5pt;line-height:1.5}
.quote{border-left:2pt solid var(--line);padding-left:4mm;font-size:10pt;line-height:1.5;color:var(--fg);font-style:italic}
.quote cite{display:block;font-style:normal;margin-top:1.5mm}

/* rebuilt screens */
/* The rebuilt screen anchors to the foot of the page like a plate, absorbing
   all the slack itself — otherwise it and .foot both claim margin-top:auto and
   the slack splits, leaving the screen adrift in the middle. */
.screen{border:1px solid var(--line);border-radius:3mm;background:var(--ink-2);overflow:hidden;margin-top:auto}
.screen+.foot{margin-top:0}
.screen-bar{display:flex;align-items:center;gap:2mm;padding:2.6mm 4mm;background:var(--panel);border-bottom:1px solid var(--line)}
.screen-bar .dot{width:2mm;height:2mm;border-radius:50%;background:#3a4a68}
.screen-bar .name{font-family:var(--mono);font-size:7.5pt;color:var(--muted);margin-left:2mm}
.screen-body{padding:4.5mm;display:flex;flex-direction:column;gap:3.5mm}
.row{display:flex;justify-content:space-between;align-items:center;gap:4mm}
.stack{display:flex;flex-direction:column;gap:.8mm;min-width:0}
.value{font-family:var(--mono);font-size:9.5pt;font-variant-numeric:tabular-nums}
.big{font-family:var(--display);font-weight:600;font-size:17pt;letter-spacing:-.02em;font-variant-numeric:tabular-nums;line-height:1}
.pill{display:inline-block;padding:1mm 2.6mm;border-radius:10mm;font-family:var(--narrow);font-size:8pt;
  font-weight:600;letter-spacing:.08em;text-transform:uppercase;border:1px solid currentColor;white-space:nowrap}
.pill.draft{color:var(--draft)} .pill.owed{color:var(--owed)} .pill.paid{color:var(--paid)}
.pill.signal{color:var(--signal)} .pill.plain{color:var(--muted)}
.btn{display:inline-block;padding:1.6mm 3.6mm;border-radius:1.8mm;font-family:var(--display);
  font-size:8.5pt;font-weight:600;background:var(--navy);color:#fff;border:1px solid #24395e}
.btn.go{background:var(--signal);border-color:var(--signal)}
.btn.ghost{background:transparent;color:var(--muted);border-color:var(--line)}
.qrow{display:flex;justify-content:space-between;align-items:center;gap:3mm;padding:2.6mm 3.4mm;
  border:1px solid var(--line);border-radius:2mm;background:var(--ink);font-size:9pt}

/* the vertical spine — portrait's natural shape for a sequence */
/* Equal-height rows stretch the spine down the whole page whatever the step
   count, and keep the rail unbroken — a row gap would dash the line. */
.spine{display:grid;grid-template-columns:9mm 1fr;gap:0 6mm;flex:1;grid-auto-rows:1fr}
.rail{position:relative;display:flex;justify-content:center}
.rail::before{content:"";position:absolute;top:0;bottom:0;width:2pt;background:var(--seg,var(--line));opacity:.75}
/* Every child here is a div, so :last-of-type would match the last text column,
   never the last rail. Count from the end instead so the line stops at the
   final badge rather than trailing off the page. */
.rail:nth-last-child(2)::before{bottom:auto;height:9mm}
.badge{position:relative;z-index:1;width:9mm;height:9mm;border-radius:50%;display:flex;align-items:center;
  justify-content:center;font-family:var(--display);font-weight:600;font-size:11pt;background:var(--ink-2);border:1.5pt solid var(--line)}
.badge[data-state=draft]{border-color:var(--draft);color:var(--draft)}
.badge[data-state=owed]{border-color:var(--owed);color:var(--owed)}
.badge[data-state=paid]{border-color:var(--paid);color:var(--paid)}
.badge[data-state=plain]{border-color:var(--navy);color:var(--fg)}
.spine-item{padding-bottom:6mm;display:flex;flex-direction:column;gap:1.2mm}
.spine-item h3{font-size:11pt}
.spine-item p{font-size:9.5pt;line-height:1.45}

/* cards + tables */
.cards{display:grid;grid-template-columns:1fr 1fr;gap:5mm}
.cards.one{grid-template-columns:1fr}
.card{padding:5mm;border-radius:3mm;background:var(--ink-2);border:1px solid var(--line);
  display:flex;flex-direction:column;gap:2mm}
.card p{font-size:9.5pt;line-height:1.5}
table{border-collapse:collapse;width:100%}
th,td{text-align:left;padding:3mm 3.4mm;border-bottom:1px solid var(--line);vertical-align:top;font-size:9.5pt}
th{font-family:var(--narrow);font-size:7.5pt;text-transform:uppercase;letter-spacing:.16em;color:var(--muted)}
td.k{font-family:var(--display);font-weight:600;color:var(--fg);width:48mm}
td.m{color:var(--muted)}
tr:last-child td{border-bottom:0}

/* can / cannot */
.split{display:grid;grid-template-columns:1fr 1fr;gap:5mm}
.list{display:flex;flex-direction:column;gap:2.4mm;padding-top:3mm;border-top:2pt solid var(--line)}
.list.can{border-color:var(--paid)}
.list.cannot{border-color:var(--signal)}
.list p{font-size:9.5pt;line-height:1.45}
.list .label{margin-bottom:1mm}
`;

/* ------------------------------------------------------------------ blocks */

const TONE = (t) => (t ? ` style="color: var(--${t})"` : "");

function block(b) {
  switch (b.type) {
    case "label":
      return `<span class="label">${esc(b.text)}</span>`;
    case "rule":
      return `<div class="hairline"></div>`;
    case "big":
      return `<div class="row">${b.items
        .map(
          (i) =>
            `<div class="stack"><span class="label">${esc(i.label)}</span><span class="big"${TONE(i.tone)}>${esc(i.value)}</span></div>`
        )
        .join("")}</div>`;
    case "kv":
      return `<div class="row">${b.items
        .map(
          (i) =>
            `<div class="stack"><span class="label">${esc(i.label)}</span><span class="value"${TONE(i.tone)}>${esc(i.value)}</span>${
              i.sub ? `<span class="label">${esc(i.sub)}</span>` : ""
            }</div>`
        )
        .join("")}</div>`;
    case "queue":
      return b.items
        .map(
          (i) =>
            `<div class="qrow"${i.tone ? ` style="border-color: var(--${i.tone})"` : ""}><span>${
              i.sub
                ? `<span class="stack"><span>${esc(i.text)}</span><span class="label">${esc(i.sub)}</span></span>`
                : esc(i.text)
            }</span><span>${i.value ? `<span class="value"${TONE(i.tone)} >${esc(i.value)}</span>` : ""}${
              i.pill ? ` <span class="pill ${i.pill.tone || "plain"}">${esc(i.pill.text)}</span>` : ""
            }</span></div>`
        )
        .join("");
    case "actions":
      return `<div class="row"><span class="label">${esc(b.note || "")}</span><span>${b.buttons
        .map((x) => `<span class="btn ${x.tone || ""}" style="margin-left:2mm">${esc(x.text)}</span>`)
        .join("")}</span></div>`;
    default:
      return "";
  }
}

const screen = (s) =>
  !s
    ? ""
    : `<div class="screen"><div class="screen-bar"><span class="dot"></span><span class="name">${esc(
        s.name
      )}</span></div><div class="screen-body">${s.blocks.map(block).join("")}</div></div>`;

const foot = (l, r) => `<div class="foot"><span>${esc(l)}</span><span>${esc(r)}</span></div>`;

const pageNo = (n) => String(n).padStart(2, "0");

/* ------------------------------------------------------------------- pages */

function coverPage(d) {
  return `<section class="page cover">
  <div class="accent-rule"></div>
  <p class="eyebrow">${esc(d.brand)} &middot; ${esc(d.department)}</p>
  <h1>${esc(d.title)}</h1>
  <p class="lede">${rich(d.lede)}</p>
  <div class="route"><span>${esc(d.route[0])}</span><span class="dash"></span><span>${esc(d.route[1])}</span></div>
  ${foot("Staff guide", d.department)}
</section>`;
}

function authorityPage(d, n) {
  return `<section class="page">
  <div class="head"><p class="eyebrow">${esc(d.authorities.eyebrow)}</p><h2>${esc(d.authorities.title)}</h2></div>
  <div class="cards ${d.authorities.items.length > 2 ? "" : "one"}" style="margin-bottom:6mm">
    ${d.authorities.items
      .map(
        (a) =>
          `<div class="card"><span class="label"${TONE(a.tone)}>${esc(a.label)}</span><h3>${esc(
            a.title
          )}</h3><p>${rich(a.body)}</p></div>`
      )
      .join("")}
  </div>
  <div class="split">
    <div class="list can"><span class="label" style="color:var(--paid)">What you may do</span>
      ${d.canDo.map((x) => `<p>${rich(x)}</p>`).join("")}</div>
    <div class="list cannot"><span class="label" style="color:var(--signal)">What you may not do</span>
      ${d.cannotDo.map((x) => `<p>${rich(x)}</p>`).join("")}</div>
  </div>
  ${foot(d.shortName, pageNo(n))}
</section>`;
}

function mapPage(d, n) {
  return `<section class="page">
  <div class="head"><p class="eyebrow">${esc(d.map.eyebrow)}</p><h2>${esc(d.map.title)}</h2></div>
  <div class="spine">
    ${d.map.stations
      .map(
        (s, i) => `<div class="rail" style="--seg: var(--${s.state === "plain" ? "navy" : s.state})">
      <div class="badge" data-state="${s.state}">${i + 1}</div></div>
    <div class="spine-item"><h3>${esc(s.title)}</h3><p>${rich(s.body)}</p></div>`
      )
      .join("")}
  </div>
  ${foot(d.shortName, pageNo(n))}
</section>`;
}

function stepPage(d, s, n) {
  return `<section class="page">
  <div class="body-copy" style="gap:4mm">
    <div class="stepno" data-state="${s.state}"><span class="n">${s.n}</span><span class="of">Step ${s.n} of ${d.steps.length}</span></div>
    <h2>${esc(s.title)}</h2>
    <p class="where">${s.where.replace(/\[([^\]]+)\]/g, (_, m) => `<b>${esc(m)}</b>`)}</p>
    ${s.quote ? `<p class="quote">&ldquo;${esc(s.quote)}&rdquo;<cite class="label">&mdash; the screen&rsquo;s own words</cite></p>` : ""}
    ${s.body.map((p) => `<p>${rich(p)}</p>`).join("")}
    ${s.caution ? `<div class="caution"><p>${rich(s.caution)}</p></div>` : ""}
  </div>
  ${screen(s.screen)}
  ${foot(`Step ${s.n} — ${s.title}`, pageNo(n))}
</section>`;
}

function guardrailPage(d, n) {
  return `<section class="page">
  <div class="head"><p class="eyebrow">Enforced by the system, not by memory</p><h2>Rules that protect you</h2></div>
  <div class="cards">
    ${d.guardrails
      .map(
        (g) =>
          `<div class="card"><span class="label" style="color:var(--paid)">${esc(g.label)}</span><h3>${esc(
            g.title
          )}</h3><p>${rich(g.body)}</p></div>`
      )
      .join("")}
  </div>
  <div class="caution" style="margin-top:6mm"><p>${rich(d.guardrailNote)}</p></div>
  ${foot(d.shortName, pageNo(n))}
</section>`;
}

function mistakePage(d, n) {
  return `<section class="page">
  <div class="head"><p class="eyebrow">What actually goes wrong</p><h2>Mistakes worth knowing about</h2></div>
  <table><tr><th>The mistake</th><th>What it causes</th><th>Do this instead</th></tr>
    ${d.mistakes
      .map(
        (m) =>
          `<tr><td class="k" style="width:52mm">${esc(m.mistake)}</td><td class="m">${esc(
            m.consequence
          )}</td><td class="m">${esc(m.correct)}</td></tr>`
      )
      .join("")}
  </table>
  ${foot(d.shortName, pageNo(n))}
</section>`;
}

function menuPage(d, n) {
  return `<section class="page">
  <div class="head"><p class="eyebrow">${esc(d.menu.eyebrow)}</p><h2>${esc(d.menu.title)}</h2></div>
  <table><tr><th>Screen</th><th>What it answers</th></tr>
    ${d.menu.rows.map((r) => `<tr><td class="k">${esc(r.screen)}</td><td class="m">${esc(r.answers)}</td></tr>`).join("")}
  </table>
  ${foot(d.shortName, pageNo(n))}
</section>`;
}

function closingPage(d, n) {
  return `<section class="page">
  <div class="head"><p class="eyebrow">If you remember nothing else</p><h2>${esc(d.closing.title)}</h2></div>
  <div class="cards one" style="gap:4mm">
    ${d.closing.cards
      .map(
        (c, i) =>
          `<div class="card"><span class="label" style="color:var(--signal)">${i + 1}</span><h3>${esc(
            c.title
          )}</h3><p>${rich(c.body)}</p></div>`
      )
      .join("")}
  </div>
  <p style="margin:6mm 0 8mm;font-size:11pt">${rich(d.closing.line)}</p>
  ${foot(`${d.brand} · ${d.department}`, pageNo(n))}
</section>`;
}

/* ------------------------------------------------------------------ render */

export function renderGuide(d) {
  const pages = [coverPage(d)];
  let n = 2;
  pages.push(authorityPage(d, n++));
  pages.push(mapPage(d, n++));
  for (const s of d.steps) pages.push(stepPage(d, s, n++));
  pages.push(guardrailPage(d, n++));
  if (d.mistakes?.length) pages.push(mistakePage(d, n++));
  if (d.menu?.rows?.length) pages.push(menuPage(d, n++));
  pages.push(closingPage(d, n++));

  return `<meta charset="utf-8">
<title>${esc(d.brand)} — ${esc(d.title)}</title>
<style>${CSS}</style>
${pages.join("\n")}
`;
}
