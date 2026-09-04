import puppeteer from 'puppeteer-core';
const BASE='http://localhost:3177';
const exec='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await puppeteer.launch({executablePath:exec,headless:'new',args:['--no-sandbox']});
const page=await browser.newPage();
await page.setViewport({width:1440,height:900});
for(const r of ['/pickup','/china']){
 await page.goto(BASE+r,{waitUntil:'networkidle0',timeout:60000});
 const res=await page.evaluate(()=>Array.from(document.querySelectorAll('[class*="grid-cols-["]')).map(el=>({cls:String(el.className).slice(0,160),cols:getComputedStyle(el).gridTemplateColumns})));
 console.log(r, JSON.stringify(res,null,1));
}
await browser.close();
