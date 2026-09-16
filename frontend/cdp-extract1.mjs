// Exhaustive Zoho WorkDrive extraction via CDP
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
ws.onmessage = (ev) => {
  try { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id).resolve(m); pending.delete(m.id); } } catch {}
};
async function ev(expr, awaitPromise = false) {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise });
  if (r.result?.exceptionDetails) throw new Error("eval: " + JSON.stringify(r.result.exceptionDetails).slice(0, 500));
  return r.result.result.value;
}
ws.onopen = async () => {
  console.log("CDP connected - starting extraction");
  const out = {};
  try {
    // 1. Full page structure
    out.structure = await ev(`(function(){
      function desc(el, depth){
        if(!el || depth>3) return null;
        const kids = [...el.children].slice(0,12).map(c=>({
          tag: c.tagName, cls: (c.className?.baseVal ?? c.className ?? '').toString().slice(0,120),
          id: c.id||'', text: (c.innerText||'').slice(0,60).replace(/\\n/g,' | '), n: c.children.length
        }));
        return { tag: el.tagName, cls: (el.className?.baseVal ?? el.className ?? '').toString().slice(0,150), kids };
      }
      const app = document.querySelector('[class*=zwd], #ember-testing-container, body > div.ember-view');
      // top-level layout
      const topDivs = [...document.body.children].map(c=>({tag:c.tagName, cls:(c.className||'').toString().slice(0,150), id:c.id||'', n:c.children.length}));
      // header area
      const header = document.querySelector('header, [class*=header], [class*=topbar], [class*=top-bar]');
      // sidebar
      const sidebar = document.querySelector('[class*=sidebar], [class*=sidenav], [class*=leftnav], nav');
      // main table
      const table = document.querySelector('table, [role=grid], [class*=filelist], [class*=file-list], [class*=listview]');
      return { topDivs,
        headerHtml: header ? header.outerHTML.slice(0,4000) : 'NONE',
        sidebarHtml: sidebar ? sidebar.outerHTML.slice(0,3000) : 'NONE',
        tableHtml: table ? table.outerHTML.slice(0,4000) : 'NONE' };
    })()`);
    console.log("STRUCT topDivs:", JSON.stringify(out.structure.topDivs, null, 1).slice(0, 2000));
    console.log("HEADER:", out.structure.headerHtml.slice(0, 2500));
    console.log("SIDEBAR:", out.structure.sidebarHtml.slice(0, 2500));
    console.log("TABLE:", out.structure.tableHtml.slice(0, 2500));
    writeFileSync("c:/temp/zoho-structure.json", JSON.stringify(out.structure, null, 2));
    console.log("saved structure");
  } catch (e) { console.error("ERR", e.message); }
  ws.close();
};
ws.onerror = (e) => console.error("WS error", e);
