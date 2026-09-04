import puppeteer from 'puppeteer-core';
const BASE='http://localhost:3177';
const EMAIL='ceo@targetexpress.co.tz';
const PASS='TargetExpress2026!';
const ROUTES=process.argv.slice(2);
const WIDTHS=(process.env.WIDTHS||'320,768,1024,1280').split(',').map(Number);
const exec='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await puppeteer.launch({executablePath:exec,headless:'new',args:['--no-sandbox']});
const page=await browser.newPage();
await page.setViewport({width:1280,height:900});
await page.goto(BASE+'/login',{waitUntil:'networkidle0'});
let csrf=null;
for(let i=0;i<10;i++){csrf=await page.evaluate(async()=>{try{const r=await fetch('/api/auth/csrf');return JSON.parse(await r.text()).csrfToken;}catch(e){return null}});if(csrf)break;await new Promise(s=>setTimeout(s,1500));}
await page.evaluate(async(csrf,email,pass)=>{const body=new URLSearchParams({csrfToken:csrf,email,password:pass,callbackUrl:'/app/dashboard',json:'true'});await fetch('/api/auth/callback/credentials',{method:'POST',body,headers:{'content-type':'application/x-www-form-urlencoded'}});},csrf,EMAIL,PASS);
for(const r of ROUTES){
 for(const w of WIDTHS){
  try{
   await page.setViewport({width:w,height:900});
   await page.goto(BASE+r,{waitUntil:'networkidle0',timeout:60000});
   await new Promise(s=>setTimeout(s,400));
   const res=await page.evaluate(()=>{
    const de=document.documentElement,vw=de.clientWidth;
    const out={p:location.pathname,vw,sw:de.scrollWidth,off:[]};
    if(de.scrollWidth<=vw+2) return out;
    for(const el of document.querySelectorAll('*')){
     const rc=el.getBoundingClientRect();
     if(rc.width===0||rc.right<=vw+2) continue;
     let a=el.parentElement,abs=false;
     while(a&&a!==document.body){const cs=getComputedStyle(a);if(cs.overflowX!=='visible'){abs=true;break}a=a.parentElement}
     if(abs) continue;
     out.off.push({t:el.tagName,c:String(el.className).slice(0,180),r:Math.round(rc.right),w:Math.round(rc.width)});
    }
    out.off=out.off.slice(0,8);
    return out;
   });
   if(res.off.length||res.sw>res.vw+2) console.log(JSON.stringify(res));
  }catch(e){console.log(JSON.stringify({p:r,w,err:String(e).slice(0,90)}));}
 }
}
await browser.close();
