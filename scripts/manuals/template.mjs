/**
 * The training-manual template.
 *
 * One design system for all five departments. Content files supply words and
 * figures; every typographic and colour decision lives here, so a Guangzhou
 * manual and a Dar manual cannot drift apart as they are edited.
 *
 * BILINGUAL BY CONSTRUCTION. Every piece of prose is a pair — English and the
 * department's second language — and the template renders both, always, in a
 * fixed relationship: the reader's own language first at full contrast, the
 * other beneath it in a lighter tone. A manual where only some paragraphs got
 * translated is worse than a monolingual one, because the reader cannot tell
 * whether the missing half was an oversight or a difference in meaning. So a
 * missing translation renders a visible marker rather than silently falling
 * back to English.
 *
 * A4 portrait, 210 x 297mm, printed by headless Chrome.
 */

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Body copy carries *emphasis* — the only markup content authors get. */
const rich = (s) => esc(s).replace(/\*([^*]+)\*/g, "<b>$1</b>");

/**
 * Which languages this manual prints.
 *
 *   "bi"  english first, the second language beneath it
 *   "zh"  chinese only — the english is not printed at all
 *
 * Set once per render. A single-language manual is not a bilingual one with
 * half hidden: the second language stops being a support line under the
 * English and has to carry the page by itself, so it is promoted to full
 * contrast and body size, and the English is dropped rather than greyed.
 */
let MODE = "bi";

/**
 * Split a [english, translated] pair into what actually gets printed.
 *
 * Every render site goes through here, so adding a mode is one change rather
 * than forty. `missing` is reported rather than silently papered over: in a
 * Chinese-only manual an untranslated string would otherwise appear as a lone
 * English sentence with nothing marking it as a gap.
 */
function sides(p) {
  const [en, alt] = Array.isArray(p) ? p : [p, null];
  if (MODE === "bi") return { main: en, sub: alt, missing: !alt };
  return { main: alt ?? en, sub: null, missing: !alt };
}

/**
 * A block of prose. `p` is [english, translated].
 * Renders whatever the mode calls for, and says so loudly when it cannot.
 */
function bi(p, cls = "") {
  const { main, sub, missing } = sides(p);
  if (MODE !== "bi") {
    return `<div class="bi ${cls}">
    <p class="en${missing ? " missing" : ""}">${rich(main)}</p>
  </div>`;
  }
  return `<div class="bi ${cls}">
    <p class="en">${rich(main)}</p>
    ${sub ? `<p class="alt">${rich(sub)}</p>` : `<p class="alt missing">[translation missing]</p>`}
  </div>`;
}

/**
 * A short label in both languages, side by side: "Mission · Dhamira".
 *
 * Used for eyebrows, table headers, card labels and role names — anything too
 * short to deserve its own stacked block. Same rule as everywhere else: a
 * missing second language is shown, not hidden.
 */
function inline(p) {
  const { main, sub, missing } = sides(p);
  // A numeral or a bare symbol reads the same in every language, so flagging it
  // as untranslated would be noise on the page and would train the reader to
  // ignore the marker where it does matter.
  const bare = /^[\d\W]+$/.test(String(main ?? ""));
  if (MODE !== "bi") {
    return missing && !bare
      ? `<span class="alt-inline missing">${esc(main)}</span>`
      : esc(main);
  }
  if (sub) return `${esc(main)} <span class="alt-inline">${esc(sub)}</span>`;
  if (bare) return esc(main);
  return `${esc(main)} <span class="alt-inline missing">[?]</span>`;
}

/** A heading, same rule. */
function biHead(p, tag = "h2") {
  const { main, sub } = sides(p);
  return `<${tag} class="bihead">
    <span class="en">${esc(main)}</span>
    ${sub ? `<span class="alt">${esc(sub)}</span>` : ""}
  </${tag}>`;
}

/**
 * Fixed wording the template supplies itself, rather than the content files:
 * cover furniture and the two defaults a content file may leave unset.
 */
const CHROME = {
  kicker: ["Staff Training Manual", "员工培训手册"],
  brandSub: ["Air Cargo · China to Tanzania", "航空货运 · 中国至坦桑尼亚"],
  contents: ["Contents", "目录"],
  screen: ["The screen", "本界面"],
  stop: ["Never do this", "切勿这样做"],
  warn: ["Careful", "注意"],
  tip: ["Tip", "提示"],
  note: ["Note", "说明"],
};

/** Cover furniture: one language in single-language mode, both otherwise. */
const chrome = (k) => esc(sides(CHROME[k]).main);

const CSS = `
/* macOS registers PingFang as ".PingFang SC" — dot-prefixed families are hidden
   from font matching, so naming it in a stack silently resolves to nothing and
   Chinese renders blank. Headless Chrome also does no per-codepoint fallback
   down the stack here: a CJK face listed second is never reached. Both problems
   go away by binding the CJK ranges to a real face and putting it first. */
@font-face{font-family:"TXCJK";font-style:normal;font-weight:400;
  src:local("STHeiti Light"),local("STHeitiSC-Light"),local("Heiti SC");
  unicode-range:U+2E80-2EFF,U+3000-303F,U+3400-4DBF,U+4E00-9FFF,U+F900-FAFF,U+FF00-FFEF;}
@font-face{font-family:"TXCJK";font-style:normal;font-weight:500 900;
  src:local("STHeiti Medium"),local("STHeitiSC-Medium"),local("Heiti SC");
  unicode-range:U+2E80-2EFF,U+3000-303F,U+3400-4DBF,U+4E00-9FFF,U+F900-FAFF,U+FF00-FFEF;}
:root{
  --ink:#0b1220; --ink-2:#0f1729; --panel:#131e35; --navy:#182a48; --line:#26344f;
  --signal:#d81e2a; --paid:#22a86a; --owed:#e09612; --info:#3b82f6; --draft:#7c8ba5;
  --fg:#eef2f8; --muted:#93a0b6; --dim:#5d6c85;
  --paper:#ffffff; --paper-ink:#101828; --paper-muted:#5a6478; --paper-line:#e3e8ef;
  --display:"TXCJK","Avenir Next","Helvetica Neue",sans-serif;
  --narrow:"TXCJK","Avenir Next Condensed","Avenir Next",sans-serif;
  --body:"TXCJK","Helvetica Neue",Helvetica,sans-serif;
  --mono:"TXCJK","Menlo",monospace;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:var(--paper)}
body{color:var(--paper-ink);font-family:var(--body);
  -webkit-print-color-adjust:exact;print-color-adjust:exact;-webkit-font-smoothing:antialiased}

@page{size:A4 portrait;margin:0}

.page{position:relative;width:210mm;height:296.6mm;overflow:hidden;
  padding:17mm 16mm 13mm;background:var(--paper);display:flex;flex-direction:column;
  page-break-after:always;break-after:page}
.page:last-of-type{page-break-after:auto;break-after:auto}

/* --- type ---------------------------------------------------------------- */
h1,h2,h3{font-family:var(--display);font-weight:600;margin:0;letter-spacing:-.02em}
h1{font-size:34pt;line-height:1.04}
h2{font-size:19pt;line-height:1.15}
h3{font-size:12.5pt}
p{margin:0;font-size:10pt;line-height:1.55}
b{font-weight:600}

.bi{display:flex;flex-direction:column;gap:1.2mm}
.bi .en{color:var(--paper-ink)}
.bi .alt{color:var(--paper-muted);font-size:9.5pt;line-height:1.5}
.bi .alt.missing{color:var(--signal);font-style:italic}
.alt-inline{color:var(--paper-muted);font-weight:400}
.alt-inline.missing{color:var(--signal);font-style:italic}
th .alt-inline{color:var(--paper-muted)}
.bihead .en{display:block}
.bihead .alt{display:block;font-size:.62em;font-weight:500;color:var(--paper-muted);margin-top:1mm}

.eyebrow{font-family:var(--narrow);font-size:8.5pt;font-weight:600;text-transform:uppercase;
  letter-spacing:.2em;color:var(--signal)}
.label{font-family:var(--narrow);font-size:7.5pt;font-weight:600;text-transform:uppercase;
  letter-spacing:.15em;color:var(--paper-muted)}
.rule{height:3pt;width:22mm;background:var(--signal);border-radius:2pt}
.hair{height:1px;background:var(--paper-line)}

.head{display:flex;flex-direction:column;gap:2.5mm;margin-bottom:6mm}
.foot{margin-top:auto;padding-top:4mm;border-top:1px solid var(--paper-line);
  display:flex;justify-content:space-between;align-items:baseline}
.foot span{font-family:var(--narrow);font-size:7.5pt;letter-spacing:.14em;
  text-transform:uppercase;color:var(--paper-muted)}

/* --- cover --------------------------------------------------------------- */
.cover{background:var(--ink);color:var(--fg);padding:0;justify-content:flex-end}
.cover::before{content:"";position:absolute;inset:0;
  background:radial-gradient(120% 80% at 78% 12%,rgba(24,42,72,.95) 0%,rgba(11,18,32,0) 62%)}
.cover-art{position:absolute;top:0;right:0;width:150mm;height:150mm;opacity:.5}
.cover-inner{position:relative;padding:0 18mm 20mm;display:flex;flex-direction:column;gap:6mm}
.cover .brand{display:flex;align-items:center;gap:3mm;margin-bottom:auto;padding-top:18mm}
.cover .brand-name{font-family:var(--display);font-weight:600;font-size:15pt;letter-spacing:-.01em}
.cover .brand-name span{color:var(--signal)}
.cover .brand-sub{font-family:var(--narrow);font-size:8pt;letter-spacing:.28em;
  text-transform:uppercase;color:var(--muted)}
.cover h1{font-size:42pt;color:#fff}
.cover .dept-alt{font-family:var(--display);font-size:24pt;color:var(--muted);margin-top:-2mm}
.cover .kicker{font-family:var(--narrow);font-size:11pt;letter-spacing:.24em;
  text-transform:uppercase;color:var(--signal)}
.cover .meta{display:flex;gap:8mm;padding-top:5mm;border-top:1px solid rgba(255,255,255,.14)}
.cover .meta div{display:flex;flex-direction:column;gap:1mm}
.cover .meta .k{font-family:var(--narrow);font-size:7.5pt;letter-spacing:.16em;
  text-transform:uppercase;color:var(--dim)}
.cover .meta .v{font-size:10pt;color:var(--fg)}

/* --- section divider ----------------------------------------------------- */
.divider{background:var(--navy);color:#fff;justify-content:center;gap:4mm}
.divider .num{font-family:var(--display);font-weight:600;font-size:64pt;line-height:1;
  color:rgba(255,255,255,.18)}
.divider h1{color:#fff;font-size:30pt}
.divider .alt{font-size:18pt;color:rgba(255,255,255,.7);font-family:var(--display)}
.divider p{color:rgba(255,255,255,.75);max-width:120mm;margin-top:2mm}

/* --- figures: the screenshot with numbered callouts ---------------------- */
.figure{position:relative;border:1px solid var(--paper-line);border-radius:2.5mm;
  overflow:hidden;background:#0b1220;margin:2mm 0}
.figure img{display:block;width:100%;height:auto}
.figure.crop{max-height:118mm}
.figure.crop img{object-fit:cover;object-position:top}
.pin{position:absolute;width:6.5mm;height:6.5mm;border-radius:50%;background:var(--signal);
  color:#fff;font-family:var(--display);font-weight:600;font-size:9.5pt;
  display:flex;align-items:center;justify-content:center;
  box-shadow:0 0 0 2pt rgba(255,255,255,.9),0 1mm 2mm rgba(0,0,0,.35);
  transform:translate(-50%,-50%)}
.ring{position:absolute;border:2.2pt solid var(--signal);border-radius:2mm;
  box-shadow:0 0 0 2pt rgba(216,30,42,.18)}
.figcap{font-size:8.5pt;color:var(--paper-muted);margin-top:1.5mm;font-style:italic}

/* the numbered key under a figure */
.keys{display:flex;flex-direction:column;gap:2mm;margin-top:3mm}
.key{display:grid;grid-template-columns:6.5mm 1fr;gap:3mm;align-items:start}
.key .n{width:6.5mm;height:6.5mm;border-radius:50%;background:var(--signal);color:#fff;
  font-family:var(--display);font-weight:600;font-size:9pt;display:flex;
  align-items:center;justify-content:center}
.key .body .t{font-weight:600;font-size:10pt}
.key .body .t .alt{font-weight:500;color:var(--paper-muted)}
.key .body p{font-size:9.5pt}

/* --- callouts ------------------------------------------------------------ */
.callout{display:grid;grid-template-columns:7mm 1fr;gap:3.5mm;padding:4mm;border-radius:2.5mm;
  background:#f7f9fc;border:1px solid var(--paper-line);border-left:2.5pt solid var(--info)}
.callout.warn{border-left-color:var(--owed);background:#fffaf0}
.callout.stop{border-left-color:var(--signal);background:#fff5f5}
.callout.tip{border-left-color:var(--paid);background:#f2fbf6}
.callout .ico{font-family:var(--display);font-weight:600;font-size:13pt;color:var(--info);text-align:center}
.callout.warn .ico{color:var(--owed)} .callout.stop .ico{color:var(--signal)} .callout.tip .ico{color:var(--paid)}
.callout .k{font-family:var(--narrow);font-size:7.5pt;letter-spacing:.15em;text-transform:uppercase;
  color:var(--paper-muted);margin-bottom:1mm}

/* --- cards & tables ------------------------------------------------------ */
.cards{display:grid;gap:4mm}
.cards.two{grid-template-columns:1fr 1fr}
.cards.three{grid-template-columns:repeat(3,1fr)}
.card{padding:4.5mm;border-radius:2.5mm;background:#f7f9fc;border:1px solid var(--paper-line);
  display:flex;flex-direction:column;gap:2mm}
.card .label{color:var(--signal)}

table{border-collapse:collapse;width:100%}
th,td{text-align:left;padding:2.8mm 3mm;border-bottom:1px solid var(--paper-line);
  vertical-align:top;font-size:9.5pt}
th{font-family:var(--narrow);font-size:7.5pt;text-transform:uppercase;letter-spacing:.14em;
  color:var(--paper-muted);background:#f7f9fc}
td.k{font-weight:600;width:46mm}
td .alt{display:block;color:var(--paper-muted);font-size:9pt}
tr:last-child td{border-bottom:0}

/* --- the workflow spine -------------------------------------------------- */
.flow{display:flex;flex-direction:column;gap:0;flex:1;justify-content:center}
.flow-step{display:grid;grid-template-columns:9mm 1fr;gap:0 4mm}
.flow-rail{position:relative;display:flex;justify-content:center}
.flow-rail::before{content:"";position:absolute;top:0;bottom:0;width:2pt;background:var(--seg,var(--paper-line))}
.flow-step:last-child .flow-rail::before{bottom:auto;height:4.5mm}
.flow-dot{position:relative;z-index:1;width:9mm;height:9mm;border-radius:50%;
  background:#fff;border:2pt solid var(--seg,var(--paper-line));display:flex;
  align-items:center;justify-content:center;font-family:var(--display);font-weight:600;font-size:9.5pt}
.flow-body{padding:0 0 5mm 0}
.flow-body .who{font-family:var(--narrow);font-size:7.5pt;letter-spacing:.14em;
  text-transform:uppercase;color:var(--paper-muted)}
.flow-body .what{font-weight:600;font-size:10.5pt;margin-top:.6mm}
.flow-body .what .alt{font-weight:500;color:var(--paper-muted)}
.flow-body p{font-size:9pt;color:var(--paper-muted);margin-top:.8mm}

/* --- worked example ------------------------------------------------------ */
.example-hd{display:grid;grid-template-columns:repeat(4,1fr);gap:3mm;margin-bottom:4mm}
.example-hd div{padding:3mm;border-radius:2mm;background:var(--ink);color:var(--fg)}
.example-hd .k{font-family:var(--narrow);font-size:7pt;letter-spacing:.14em;
  text-transform:uppercase;color:var(--muted)}
.example-hd .v{font-family:var(--mono);font-size:10.5pt;margin-top:1mm}

.contents{display:flex;flex-direction:column;gap:0}
.toc-row{display:grid;grid-template-columns:9mm 1fr auto;gap:3mm;padding:2.6mm 0;
  border-bottom:1px solid var(--paper-line);align-items:baseline}
.toc-row .n{font-family:var(--display);font-weight:600;color:var(--signal)}
.toc-row .t{font-weight:600;font-size:10.5pt}
.toc-row .t .alt{font-weight:500;color:var(--paper-muted)}
.toc-row .pg{font-family:var(--mono);font-size:9pt;color:var(--paper-muted)}
`;

/*
 * Typesetting for a Chinese-only manual.
 *
 * Not the bilingual sheet with one language hidden. Latin display type is
 * tightened to close the gaps between letterforms; Han characters are square
 * and evenly spaced already, so the same tightening jams them together. CJK
 * also carries no word spaces, which is what normally gives a paragraph its
 * air, so the leading has to supply it instead.
 */
const CSS_ZH = `
h1,h2,h3{letter-spacing:normal;text-wrap:balance}
h1{line-height:1.18}
h2{line-height:1.35}
p{line-height:1.8}
.bi{gap:2mm}
.bi .en{font-size:10.5pt}
/* Han is uniform in width and colour, so a long uppercase-tracked label reads
   as a grey bar. Less tracking, and a touch more size to stay legible. */
.eyebrow{letter-spacing:.1em;font-size:9pt}
.label,.foot span,.example-hd .k,.flow-body .who,th{letter-spacing:.06em;font-size:8pt}
.cover .brand-sub{letter-spacing:.14em}
.cover .kicker{letter-spacing:.14em}
.cover h1{line-height:1.15}
/* Tracking numbers, routes and USD figures stay Latin inside Chinese prose;
   they must not be broken across lines the way Han characters may be. */
.mono,td,.example-hd .v{word-break:normal;overflow-wrap:break-word}
`;

/* ------------------------------------------------------------------ pieces */

const PLANE = `<svg class="cover-art" viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="230" cy="150" r="120" stroke="#26344f" stroke-width="1"/>
  <circle cx="230" cy="150" r="88" stroke="#26344f" stroke-width="1"/>
  <circle cx="230" cy="150" r="56" stroke="#26344f" stroke-width="1"/>
  <ellipse cx="230" cy="150" rx="120" ry="44" stroke="#26344f" stroke-width="1"/>
  <ellipse cx="230" cy="150" rx="120" ry="86" stroke="#26344f" stroke-width="1"/>
  <path d="M110 250 C170 205, 250 150, 350 92" stroke="#d81e2a" stroke-width="2"
        stroke-linecap="round" stroke-dasharray="5 7"/>
  <circle cx="110" cy="250" r="4.5" fill="#d81e2a"/>
  <path d="M336 84 l22 8 -18 14 -2 -10 -12 -4z" fill="#d81e2a"/>
</svg>`;

function figure(fig, dir) {
  if (!fig) return "";
  const pins = (fig.pins ?? [])
    .map((p) => `<div class="pin" style="left:${p.x}%;top:${p.y}%">${p.n}</div>`)
    .join("");
  const rings = (fig.rings ?? [])
    .map(
      (r) =>
        `<div class="ring" style="left:${r.x}%;top:${r.y}%;width:${r.w}%;height:${r.h}%"></div>`
    )
    .join("");
  return `<div class="figure ${fig.crop ? "crop" : ""}">
    <img src="${dir}/${esc(fig.shot)}.png" alt="">
    ${rings}${pins}
  </div>
  ${
    fig.caption
      ? (() => {
          const { main, sub } = sides(fig.caption);
          return `<p class="figcap">${rich(main)}${sub ? `<br>${rich(sub)}` : ""}</p>`;
        })()
      : ""
  }`;
}

const keys = (items) =>
  !items?.length
    ? ""
    : `<div class="keys">${items
        .map(
          (k, i) => {
          const { main, sub } = sides(k.title);
          return `<div class="key">
      <div class="n">${k.n ?? i + 1}</div>
      <div class="body">
        <div class="t">${esc(main)}${sub ? ` <span class="alt">${esc(sub)}</span>` : ""}</div>
        ${bi(k.body)}
      </div>
    </div>`;
        }
        )
        .join("")}</div>`;

/**
 * Default callout labels for the manual currently rendering.
 *
 * Set once per render rather than threaded through every call, because a
 * callout is nested three levels deep in a block list and passing the whole
 * manual down to reach four words would obscure what those functions do.
 */
let CALLOUT_LABELS = {};

const callout = (c) =>
  !c
    ? ""
    : `<div class="callout ${c.kind ?? ""}">
    <div class="ico">${c.kind === "stop" ? "!" : c.kind === "warn" ? "!" : c.kind === "tip" ? "★" : "i"}</div>
    <div>
      <div class="k">${inline(
        c.label ?? CALLOUT_LABELS[c.kind ?? "note"] ?? CHROME[c.kind ?? "note"] ?? CHROME.note
      )}</div>
      ${bi(c.text)}
    </div>
  </div>`;

/* ------------------------------------------------------------------- pages */

const foot = (m, left, right) =>
  `<div class="foot"><span>${esc(left ?? sides(m.department).main)}</span><span>${esc(right)}</span></div>`;

function coverPage(m) {
  const dept = sides(m.department);
  return `<section class="page cover">
  ${PLANE}
  <div class="cover-inner">
    <div class="brand">
      <div>
        <div class="brand-name"><span>Target</span> Express</div>
        <div class="brand-sub">${chrome("brandSub")}</div>
      </div>
    </div>
    <div class="kicker">${chrome("kicker")}</div>
    <h1>${esc(dept.main)}</h1>
    ${dept.sub ? `<div class="dept-alt">${esc(dept.sub)}</div>` : ""}
    <div class="meta">
      <div><span class="k">${inline(m.labels?.version ?? "Version")}</span><span class="v">${esc(sides(m.version).main)}</span></div>
      <div><span class="k">${inline(m.labels?.languages ?? "Languages")}</span><span class="v">${esc(sides(m.languages).main)}</span></div>
      <div><span class="k">${inline(m.labels?.audience ?? "For")}</span><span class="v">${esc(sides(m.audience).main)}</span></div>
      <div><span class="k">${inline(m.labels?.issued ?? "Issued")}</span><span class="v">${esc(sides(m.issued).main)}</span></div>
    </div>
  </div>
</section>`;
}

function contentsPage(m, sections) {
  return `<section class="page">
  <div class="head"><div class="rule"></div>
    ${biHead([CHROME.contents[0], m.contentsAlt ?? CHROME.contents[1]], "h2")}
  </div>
  <div class="contents">
    ${sections
      .map((s, i) => {
        const { main, sub } = sides(s.title);
        return `<div class="toc-row">
      <span class="n">${String(i + 1).padStart(2, "0")}</span>
      <span class="t">${esc(main)}${sub ? ` <span class="alt">${esc(sub)}</span>` : ""}</span>
      <span class="pg">${s.page}</span>
    </div>`;
      })
      .join("")}
  </div>
  ${foot(m, sides(m.department).main, chrome("contents"))}
</section>`;
}

function dividerPage(m, n, s) {
  const t = sides(s.title);
  const b = s.blurb ? sides(s.blurb) : null;
  return `<section class="page divider">
  <div class="num">${String(n).padStart(2, "0")}</div>
  <h1>${esc(t.main)}</h1>
  ${t.sub ? `<div class="alt">${esc(t.sub)}</div>` : ""}
  ${b ? `<p>${rich(b.main)}</p>` : ""}
  ${b && b.sub ? `<p>${rich(b.sub)}</p>` : ""}
</section>`;
}

/** A screen chapter: what it is, the picture, and every control on it. */
function screenPage(m, dir, s, pageNo) {
  return `<section class="page">
  <div class="head">
    <div class="eyebrow">${inline(s.eyebrow ?? CHROME.screen)}</div>
    ${biHead(s.title, "h2")}
    ${s.route ? `<p class="label" style="font-family:var(--mono);text-transform:none;letter-spacing:0">${esc(s.route)}</p>` : ""}
  </div>
  ${s.intro ? bi(s.intro) : ""}
  ${figure(s.figure, dir)}
  ${keys(s.keys)}
  ${s.callout ? callout(s.callout) : ""}
  ${foot(m, sides(s.title).main, String(pageNo).padStart(2, "0"))}
</section>`;
}

/** A page of prose blocks: heading, paragraphs, cards, table, callouts. */
function prosePage(m, dir, p, pageNo) {
  const blocks = (p.blocks ?? [])
    .map((b) => {
      if (b.type === "text") return bi(b.text);
      if (b.type === "figure") return figure(b, dir);
      if (b.type === "keys") return keys(b.items);
      if (b.type === "callout") return callout(b);
      if (b.type === "cards")
        return `<div class="cards ${b.columns === 3 ? "three" : "two"}">${b.items
          .map((c) => {
            const { main, sub } = sides(c.title);
            return `<div class="card">
          <span class="label">${c.label ? inline(c.label) : ""}</span>
          <h3>${esc(main)}</h3>
          ${sub ? `<h3 style="color:var(--paper-muted);font-size:11pt;margin-top:-1mm">${esc(sub)}</h3>` : ""}
          ${bi(c.body)}
        </div>`;
          })
          .join("")}</div>`;
      if (b.type === "table")
        return `<table><tr>${b.head.map((h) => `<th>${inline(h)}</th>`).join("")}</tr>
        ${b.rows
          .map(
            (r) =>
              `<tr>${r
                .map((cell, i) => {
                  const { main, sub } = sides(cell);
                  return `<td class="${i === 0 ? "k" : ""}">${rich(main)}${sub ? `<span class="alt">${rich(sub)}</span>` : ""}</td>`;
                })
                .join("")}</tr>`
          )
          .join("")}</table>`;
      if (b.type === "flow")
        return `<div class="flow">${b.steps
          .map((st, i) => {
            const what = sides(st.what);
            const note = st.note ? sides(st.note) : null;
            return `<div class="flow-step" style="--seg:${st.tone ? `var(--${st.tone})` : "var(--paper-line)"}">
          <div class="flow-rail"><div class="flow-dot">${i + 1}</div></div>
          <div class="flow-body">
            <div class="who">${st.who ? inline(st.who) : ""}</div>
            <div class="what">${esc(what.main)}${what.sub ? ` <span class="alt">${esc(what.sub)}</span>` : ""}</div>
            ${note ? `<p>${rich(note.main)}${note.sub ? `<br>${rich(note.sub)}` : ""}</p>` : ""}
          </div>
        </div>`;
          })
          .join("")}</div>`;
      if (b.type === "example")
        return `<div class="example-hd">${b.fields
          .map((f) => `<div><div class="k">${inline(f.k)}</div><div class="v">${esc(sides(f.v).main)}</div></div>`)
          .join("")}</div>`;
      return "";
    })
    .join("\n");

  return `<section class="page">
  ${
    p.title
      ? `<div class="head">
    ${p.eyebrow ? `<div class="eyebrow">${inline(p.eyebrow)}</div>` : ""}
    ${biHead(p.title, "h2")}
  </div>`
      : ""
  }
  ${blocks}
  ${foot(m, sides(p.title ?? m.department).main, String(pageNo).padStart(2, "0"))}
</section>`;
}

/* ------------------------------------------------------------------ render */

export function renderManual(m, shotsDir) {
  MODE = m.lang === "zh" ? "zh" : "bi";
  CALLOUT_LABELS = m.callouts ?? {};
  const pages = [coverPage(m)];
  let n = 2;

  // Contents, with page numbers worked out from the section list.
  const toc = [];
  let cursor = 3;
  for (const s of m.sections) {
    toc.push({ title: s.title, page: String(cursor).padStart(2, "0") });
    cursor += 1 + (s.pages?.length ?? 0);
  }
  pages.push(contentsPage(m, toc));

  for (const [i, s] of m.sections.entries()) {
    pages.push(dividerPage(m, i + 1, s));
    n++;
    for (const p of s.pages ?? []) {
      n++;
      pages.push(
        p.kind === "screen" ? screenPage(m, shotsDir, p, n) : prosePage(m, shotsDir, p, n)
      );
    }
  }

  const title = esc(sides(m.department).main);
  return `<meta charset="utf-8">
<html lang="${MODE === "zh" ? "zh-Hans" : "en"}">
<title>${title} — ${chrome("kicker")}</title>
<style>${CSS}${MODE === "zh" ? CSS_ZH : ""}</style>
${pages.join("\n")}
`;
}
