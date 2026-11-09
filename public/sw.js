// Target Express service worker. It stores NOTHING on the phone (no pages, no business data) and changes no request except one thing:
// when a page cannot load because the phone has no signal, it shows a short "No internet" page instead of the browser's error.
// Its other job is to make the app installable: Android Chrome only offers its one-tap Install button to sites with a service worker
// that has a fetch handler. Without this file Android shows the menu steps instead. Never add caching here: staff data must always come live.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

const OFFLINE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#0f131c"><title>No internet</title>
<style>html,body{margin:0;height:100%;background:#0f131c;color:#fff;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center}
h1{margin:0;font-size:20px;font-weight:600}p{margin:0;max-width:20rem;color:rgba(255,255,255,.7);font-size:15px;line-height:1.45}
.zh{color:rgba(255,255,255,.5);font-size:14px}
button{margin-top:6px;height:44px;padding:0 26px;border:0;border-radius:999px;background:#fdc400;color:#0b1a33;font-size:15px;font-weight:600}</style></head>
<body><main><h1>No internet</h1><p>Target Express needs a connection. Nothing you did is lost. Check your signal or Wi-Fi, then try again.</p>
<p class="zh">没有网络连接。您的操作没有丢失。请检查信号或 Wi-Fi，然后重试。</p><button onclick="location.reload()">Try again · 重试</button></main></body></html>`;

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return; // pictures, data and form posts go straight to the network, untouched
  event.respondWith(
    fetch(event.request).catch(() => new Response(OFFLINE, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } })),
  );
});
