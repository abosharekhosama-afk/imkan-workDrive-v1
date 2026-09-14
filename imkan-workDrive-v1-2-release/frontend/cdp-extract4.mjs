// Part 4: screenshots + open +New menu and capture it
const WS_URL = "ws://localhost:9222/devtools/page/C956FFD74533A2D23092E6BF072E8562";
import { writeFileSync } from "fs";
let msgId = 0;
const pending = new Map();
const ws = new WebSocket(WS_URL);
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error("timeout " + method)); } }, 30000);
  });
}
ws.onmessage = (ev) => { try { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id).resolve(m); pending.delete(m.id); } } catch {} };
async function ev(expr) {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error("eval: " + JSON.stringify(r.result.exceptionDetails).slice(0, 1000));
  return r.result.result.value;
}
async function shot(name) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`c:/temp/zoho-${name}.png`, Buffer.from(r.result.data, "base64"));
  console.log("saved zoho-" + name + ".png");
}
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
ws.onopen = async () => {
  try {
    await shot("1-default");
    // Click +New button
    const clicked = await ev(`(function(){
      const b = document.querySelector('[data-automation-id=create-new]');
      if(!b){ return 'NOTFOUND'; }
      b.scrollIntoView(); b.click(); return 'CLICKED:' + b.outerHTML.slice(0,200);
    })()`);
    console.log("NEW:", clicked);
    await sleep(1200);
    await shot("2-new-open");
    const menu = await ev(`(function(){
      function cs(el){ const s=getComputedStyle(el); const r=el.getBoundingClientRect();
        return {bg:s.backgroundColor, color:s.color, fs:s.fontSize, br:s.borderRadius, pad:s.padding, shadow:s.boxShadow, h:Math.round(r.height*10)/10, w:Math.round(r.width*10)/10}; }
      const dd = document.querySelector('.zwd-dropdown-renderer');
      const items = [...document.querySelectorAll('[class*=dropdown] [class*=item], [role=menuitem], [role=option]')].slice(0,30).map(e=>({t:(e.textContent||'').trim().slice(0,50).replace(/\\n/g,'|'), cls:(e.className||'').toString().slice(0,120), style:cs(e)}));
      const vis = dd ? {html: dd.outerHTML.slice(0,4000), style: cs(dd)} : 'NONE';
      const allMenus = [...document.querySelectorAll('*')].filter(e=>e.getBoundingClientRect && (e.getBoundingClientRect().width>100 && e.getBoundingClientRect().width<450 && e.getBoundingClientRect().height>100) && /Folder|Upload|Document|Spreadsheet|Presentation/i.test(e.textContent||'')).slice(0,4).map(e=>({cls:(e.className||'').toString().slice(0,130), style:cs(e), text:(e.textContent||'').slice(0,400).replace(/\\n/g,'|')}));
      return { items, vis, allMenus };
    })()`);
    console.log("NEWMENU:" + JSON.stringify(menu, null, 1).slice(0, 8000));
    // close menu with Escape
    await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); document.body.click();`);
    await sleep(600);
  } catch (e) { console.error("ERR", e.message); }
  ws.close();
};
ws.onerror = (e) => console.error("WS error", e);
