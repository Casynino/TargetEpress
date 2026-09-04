import puppeteer from 'puppeteer-core';
const BASE='http://localhost:3177';
const EMAIL=process.argv[2]||'admin@targetexpress.co.tz';
const PASS='TargetExpress2026!';
const ROUTES=process.argv.slice(3);
const exec='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await puppeteer.launch({executablePath:exec,headless:'new',args:['--no-sandbox']});
const page=await browser.newPage();
const VW=Number(process.env.VW||375);
await page.setViewport({width:VW,height:812,deviceScaleFactor:1});
// login
await page.goto(BASE+'/login',{waitUntil:'networkidle0'});
let csrf=null;
for(let i=0;i<10;i++){
  csrf=await page.evaluate(async()=>{try{const r=await fetch('/api/auth/csrf');const t=await r.text();return JSON.parse(t).csrfToken;}catch(e){return null;}});
  if(csrf) break;
  await new Promise(s=>setTimeout(s,1500));
}
if(!csrf){console.log('NO CSRF');process.exit(1);}
await page.evaluate(async(csrf,email,pass)=>{
  const body=new URLSearchParams({csrfToken:csrf,email,password:pass,callbackUrl:'/app/dashboard',json:'true'});
  await fetch('/api/auth/callback/credentials',{method:'POST',body,headers:{'content-type':'application/x-www-form-urlencoded'}});
},csrf,EMAIL,PASS);
for(const r of ROUTES){
  try{
    await page.goto(BASE+r,{waitUntil:'networkidle0',timeout:60000});
    await new Promise(s=>setTimeout(s,600));
    const res=await page.evaluate(()=>{
      const de=document.documentElement;
      const vw=de.clientWidth;
      const out={url:location.pathname,vw,scrollW:de.scrollWidth,n:document.querySelectorAll('*').length,h1:(document.querySelector('h1')||{}).textContent||'',offenders:[]};
      if(de.scrollWidth<=vw+1) return out;
      for(const el of document.querySelectorAll('*')){
        const r=el.getBoundingClientRect();
        if(r.width===0) return;
        if(r.right>vw+1){
          // only report if no scrollable ancestor absorbs it
          let anc=el.parentElement, absorbed=false;
          while(anc && anc!==document.body){
            const cs=getComputedStyle(anc);
            if((cs.overflowX==='auto'||cs.overflowX==='scroll'||cs.overflowX==='hidden')) {absorbed=true;break;}
            anc=anc.parentElement;
          }
          if(absorbed) continue;
          out.offenders.push({tag:el.tagName,cls:(el.className&&el.className.baseVal!==undefined?el.className.baseVal:String(el.className)).slice(0,220),right:Math.round(r.right),w:Math.round(r.width),txt:(el.textContent||'').trim().slice(0,60)});
        }
      }
      // keep the shallowest few
      out.offenders=out.offenders.slice(0,12);
      return out;
    });
    console.log(JSON.stringify(res));
  }catch(e){console.log(JSON.stringify({url:r,error:String(e).slice(0,120)}));}
}
await browser.close();
