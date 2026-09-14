// Deep extraction part 2: layout containers, toolbar, sidebar, table
const WS_URL = "ws://localhost:9222/devtools/page/C956FFD74533A2D23092E6BF072E8562";
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
  if (r.result?.exceptionDetails) throw new Error("eval: " + JSON.stringify(r.result.exceptionDetails).slice(0, 800));
  return r.result.result.value;
}
ws.onopen = async () => {
  try {
    const layout = await ev(`(function(){
      const c = document.querySelector('.zwd-outer-container');
      function kids(el){ return el ? [...el.children].map(x=>({tag:x.tagName, cls:(x.className||'').toString().slice(0,160), id:x.id||'', n:x.children.length, text:(x.innerText||'').slice(0,80).replace(/\\n/g,' | ')})) : []; }
      const outer = kids(c);
      // find left panel
      const left = document.querySelector('.zwd-leftpanel-topheader')?.parentElement;
      const leftKids = left ? kids(left) : [];
      // find all buttons in top area with text
      const topBtns = [...document.querySelectorAll('.zwd-outer-container button')].slice(0,60).map(b=>({t:(b.textContent||'').trim().slice(0,30), cls:(b.className||'').toString().slice(0,120), auto:b.getAttribute('data-automation-id')||''}));
      return { outer, leftKids, topBtns };
    })()`);
    console.log(JSON.stringify(layout, null, 1).slice(0, 6000));

    const toolbar = await ev(`(function(){
      function cs(el){ const s=getComputedStyle(el); return {bg:s.backgroundColor, color:s.color, fs:s.fontSize, br:s.borderRadius, pad:s.padding, h:el.getBoundingClientRect().height}; }
      const out={};
      const btns=[...document.querySelectorAll('button')].filter(b=>/New|Record|Manage|Get Started/i.test(b.textContent||''));
      out.actionBtns = btns.map(b=>({t:(b.textContent||'').trim().slice(0,20), auto:b.getAttribute('data-automation-id')||'', cls:(b.className||'').toString().slice(0,150), style:cs(b)}));
      // search input
      const inp = document.querySelector('input[type=text], input[placeholder], input[class*=search]');
      out.search = inp ? {ph:inp.placeholder||'', cls:(inp.className||'').toString().slice(0,120), style:cs(inp), rect:inp.getBoundingClientRect().toJSON()} : 'NONE';
      // left panel items
      const lp = document.querySelectorAll('.zwd-leftpanel-topheader, [class*=leftpanel] button, [class*=leftpanel] a');
      out.leftPanel = [...lp].slice(0,30).map(b=>({t:(b.textContent||'').trim().slice(0,30), cls:(b.className||'').toString().slice(0,120)}));
      return out;
    })()`);
    console.log("TOOLBAR:" + JSON.stringify(toolbar, null, 1).slice(0, 6000));
  } catch (e) { console.error("ERR", e.message); }
  ws.close();
};
ws.onerror = (e) => console.error("WS error", e);
