import puppeteer from 'puppeteer-core';
const BASE='http://localhost:3177';
const exec='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await puppeteer.launch({executablePath:exec,headless:'new',args:['--no-sandbox']});
const page=await browser.newPage();
await page.setViewport({width:1280,height:900});
await page.goto(BASE+'/login',{waitUntil:'networkidle0'});
let csrf=null;for(let i=0;i<10;i++){csrf=await page.evaluate(async()=>{try{const r=await fetch('/api/auth/csrf');return JSON.parse(await r.text()).csrfToken;}catch(e){return null}});if(csrf)break;await new Promise(s=>setTimeout(s,1500));}
await page.evaluate(async(c)=>{await fetch('/api/auth/callback/credentials',{method:'POST',body:new URLSearchParams({csrfToken:c,email:'ceo@targetexpress.co.tz',password:'TargetExpress2026!',callbackUrl:'/app/dashboard',json:'true'}),headers:{'content-type':'application/x-www-form-urlencoded'}})},csrf);
await page.setViewport({width:320,height:900});
await page.goto(BASE+process.argv[2],{waitUntil:'networkidle0',timeout:60000});
const res=await page.evaluate(()=>{
 const de=document.documentElement,vw=de.clientWidth,out=[];
 for(const el of document.querySelectorAll('*')){
  const rc=el.getBoundingClientRect();
  if(rc.width===0||rc.right<=vw+2) continue;
  let a=el.parentElement,abs=false;
  while(a&&a!==document.body){const cs=getComputedStyle(a);if(cs.overflowX!=='visible'){abs=true;break}a=a.parentElement}
  if(abs) continue;
  const chain=[];let n=el;
  while(n&&n!==document.body){chain.push(n.tagName+'.'+String(n.className).slice(0,120));n=n.parentElement}
  out.push({txt:(el.textContent||'').trim().slice(0,80),chain:chain.slice(0,6)});
 }
 return {vw,sw:de.scrollWidth,out:out.slice(0,4)};
});
console.log(JSON.stringify(res,null,1));
await browser.close();
