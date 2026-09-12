(() => {
  const cs = (el) => { const c = getComputedStyle(el); return { bg: c.backgroundColor, color: c.color, fontSize: c.fontSize, fontWeight: c.fontWeight, padding: c.padding, margin: c.margin, radius: c.borderRadius, border: c.border.slice(0,120), height: c.height, lineHeight: c.lineHeight }; };
  const box = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const out = {};
  // sort header children
  const sh = document.querySelector(".zwd-sort-header");
  if (sh) out.sortHeader = { box: box(sh), style: cs(sh), kids: [...sh.children].slice(0,8).map(k=>({tag:k.tagName, cls:(k.className||'').toString().slice(0,120), text:(k.innerText||'').slice(0,40), box:box(k), style:cs(k)})) };
  // first file row internals
  const row = document.querySelector(".zwd-atom-item");
  if (row) {
    out.row = { box: box(row), style: cs(row), cls: (row.className||'').toString().slice(0,160) };
    const all = [...row.querySelectorAll("*")].slice(0,40);
    out.rowKids = all.map(k=>({tag:k.tagName, cls:(k.className||'').toString().slice(0,100), text:(k.innerText||'').slice(0,50), box:box(k), style:cs(k)})).filter(k=>k.box.w>0&&k.box.h>0).slice(0,25);
    // checkbox
    const cb = row.querySelector("input[type=checkbox], [role=checkbox], .zwd-checkbox, [class*=check]");
    if (cb) out.rowCheck = { tag: cb.tagName, cls:(cb.className||'').toString().slice(0,120), box:box(cb), style:cs(cb) };
  }
  // page/content bg + padding
  const content = document.querySelector(".zwd-pagenv-list-view, [class*=page-bg]");
  let p = row; const chain=[];
  while(p && chain.length<6){ p=p.parentElement; if(p) chain.push({tag:p.tagName, cls:(p.className||'').toString().slice(0,100), box:box(p), style:cs(p)}); }
  out.chain = chain;
  // top secondary toolbar kids
  const tb = document.querySelector(".zwd-ui.zwd-secondary.zwd-menu.zwd-fluid");
  if (tb) out.toolbar = { box:box(tb), style:cs(tb), kids:[...tb.querySelectorAll("button")].slice(0,12).map(b=>({text:(b.innerText||'').slice(0,30), cls:(b.className||'').toString().slice(0,120), box:box(b), style:cs(b)})) };
  // search input
  const inp = document.querySelector("input[type=text], input[placeholder]");
  if (inp) out.search = { ph: inp.getAttribute("placeholder"), box: box(inp), style: cs(inp) };
  return JSON.stringify(out);
})()
