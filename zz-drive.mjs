import puppeteer from "puppeteer-core";
import fs from "node:fs";
const BASE = "http://localhost:3188";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const cookieLine = fs.readFileSync(process.argv[2], "utf8").trim();
const cookies = cookieLine.split("; ").map((p) => { const i = p.indexOf("="); return { name: p.slice(0, i).trim(), value: p.slice(i + 1), url: BASE }; });
const url = process.argv[3];
const label = process.argv[4]; // button text to click
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
page.on("dialog", (d) => d.accept());
await page.setViewport({ width: 1400, height: 1200 });
await page.setCookie(...cookies);
await page.goto(url, { waitUntil: "networkidle2" });
const clicked = await page.evaluate((text) => {
  const els = [...document.querySelectorAll("button, a")];
  const el = els.find((e) => e.textContent.trim().toLowerCase().includes(text.toLowerCase()));
  if (!el) return false;
  el.click();
  return true;
}, label);
console.log("clicked:", clicked);
await wait(4000);
const body = await page.evaluate(() => document.body.innerText);
console.log("---- page text after ----");
console.log(body.slice(0, 2500));
await browser.close();
