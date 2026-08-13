import puppeteer from "puppeteer-core";
import { readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { pathToFileURL } from "node:url";
const [html, out, ...pages] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless:"new", args:["--no-sandbox"] });
const src = await readFile(html, "utf8");
await mkdir(out, { recursive: true });
for (const n of pages) {
  const tmp = join(dirname(html), `_p${n}.html`);
  await writeFile(tmp, src + `<style>.page{display:none!important}.page:nth-of-type(${n}){display:flex!important}</style>`);
  const p = await b.newPage();
  await p.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1.6 });
  await p.goto(pathToFileURL(tmp).href, { waitUntil: "networkidle2" });
  await new Promise(r => setTimeout(r, 500));
  await p.screenshot({ path: join(out, `p${n}.png`) });
  await p.close(); await rm(tmp, { force: true });
}
await b.close(); console.log("shot", pages.join(" "));
