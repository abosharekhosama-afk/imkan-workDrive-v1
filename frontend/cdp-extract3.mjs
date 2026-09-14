// Deep extraction part 3: header/file-list/sidebar computed styles
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
  if (r.result?.exceptionDetails) throw new Error("eval: " + JSON.stringify(r.result.exceptionDetails).slice(0, 1000));
  return r.result.result.value;
}
ws.onopen = async () => {
  try {
    const v = await ev(`(function(){
      function cs(el){ if(!el) return null; const s=getComputedStyle(el); const r=el.getBoundingClientRect();
        return {bg:s.backgroundColor, color:s.color, fs:s.fontSize, fw:s.fontWeight, br:s.borderRadius, pad:s.padding, border:s.border, borderBottom:s.borderBottom, shadow:s.boxShadow, h:Math.round(r.height*10)/10, w:Math.round(r.width*10)/10}; }
      function q(s){ return document.querySelector(s); }
      const out = {};
      // left dark panel
      out.leftPanel = cs(q('.ui.left.vertical.menu.zwd-leftpanel-primary'));
      // left panel active item
      out.activeItem = cs(q('.zwd-pagenv-left-panel.active, .item.active'));
      const actEl = q('.zwd-pagenv-left-panel.active, .item.active');
      out.activeItemExtra = actEl ? {text:(actEl.textContent||'').trim().slice(0,30), html:actEl.outerHTML.slice(0,600)} : null;
      // wrapper (main column)
      out.wrapper = cs(q('.wrapper'));
      // top header row (the pagenv top header)
      const topH = q('.zwd-pagenv-top-header')?.parentElement || q('[class*=pagenv-top]');
      out.topHeaderParent = topH ? {cls:(topH.className||'').toString().slice(0,150), style:cs(topH), html:topH.outerHTML.slice(0,1200)} : 'NONE';
      // breadcrumb + columns header
      const colH = [...document.querySelectorAll('*')].find(e=>/Last Modified/.test(e.textContent||'') && e.children.length<6 && (e.textContent||'').length<120);
      out.colHeader = colH ? {cls:(colH.className||'').toString().slice(0,150), style:cs(colH), text:(colH.textContent||'').slice(0,100)} : 'NONE';
      // file rows: find rows containing filename text
      const rows = [...document.querySelectorAll('[class*=row], [class*=filerow], [class*=file-row], tr, [role=row]')].slice(0,5).map(r=>({cls:(r.className||'').toString().slice(0,130), style:cs(r), text:(r.textContent||'').slice(0,80)}));
      out.rows = rows;
      // generic list container: element with most file-ish children
      const allDivs = [...document.querySelectorAll('.wrapper > div')].map(d=>({cls:(d.className||'').toString().slice(0,130), n:d.children.length, text:(d.innerText||'').slice(0,100).replace(/\\n/g,'|')}));
      out.wrapperKids = allDivs;
      // header search bar container
      const sWrap = q('[class*=search]')?.parentElement;
      out.searchWrap = sWrap ? {cls:(sWrap.className||'').toString().slice(0,150), style:cs(sWrap)} : 'NONE';
      // details tabs
      const tabs = [...document.querySelectorAll('button')].filter(b=>/Details|Data Templates|Zia|Index/i.test(b.textContent||'')).map(b=>({t:(b.textContent||'').trim().slice(0,20), auto:b.getAttribute('data-automation-id')||'', style:cs(b)}));
      out.tabs = tabs;
      return out;
    })()`);
    console.log(JSON.stringify(v, null, 1).slice(0, 9000));
  } catch (e) { console.error("ERR", e.message); }
  ws.close();
};
ws.onerror = (e) => console.error("WS error", e);
