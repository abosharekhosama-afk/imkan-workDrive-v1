(() => {
  const cs = (el) => { const c = getComputedStyle(el); return { bg: c.backgroundColor, color: c.color, fontSize: c.fontSize, fontWeight: c.fontWeight, padding: c.padding, margin: c.margin, radius: c.borderRadius, border: c.border.slice(0,140), shadow: c.boxShadow.slice(0,180), height: c.height, width: c.width, lineHeight: c.lineHeight, gap: c.gap }; };
  const box = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const out = {};
  // 1. Left sidebar item sample
  const sideLink = document.querySelector(".zwd-leftpanel-primary a, .zwd-leftpanel-primary .item, [class*=leftpanel] a");
  // sidebar links list
  out.sidebarLinks = [...document.querySelectorAll(".zwd-leftpanel-primary a")].slice(0,14).map(el=>({text:(el.innerText||'').slice(0,40), cls:(el.className||'').toString().slice(0,140), box:box(el), style:cs(el)}));
  // active sidebar item
  const active = document.querySelector(".zwd-leftpanel-primary a.active, .zwd-leftpanel-primary .active, [class*=leftpanel] .active");
  if (active) out.sidebarActive = { text:(active.innerText||'').slice(0,60), cls:(active.className||'').toString().slice(0,160), box:box(active), style:cs(active) };
  // 2. breadcrumb / title area
  const crumbs = [...document.querySelectorAll("[class*=breadcrumb] a, [class*=breadcrumb] span")].slice(0,8).map(el=>({text:(el.innerText||'').slice(0,40), box:box(el), style:cs(el)}));
  out.breadcrumbs = crumbs;
  const h1 = document.querySelector("h1,h2,[class*=folder-title],[class*=pagetitle]");
  if (h1) out.titleEl = { text:(h1.innerText||'').slice(0,80), box:box(h1), style:cs(h1) };
  // 3. New button + Record + Manage details
  const byText = (t) => [...document.querySelectorAll("button")].find(e=>(e.innerText||'').trim().startsWith(t));
  for (const t of ["New","+ New","Record","Manage","Upload","Download","Share","Move","Copy","Rename","Delete","Details","Favorite"]) {
    const el = byText(t);
    if (el) out["btn_"+t] = { text:(el.innerText||'').slice(0,60), cls:(el.className||'').toString().slice(0,180), box:box(el), style:cs(el), html: el.outerHTML.slice(0,700) };
  }
  // 4. Table: thead + first body rows — enumerate all table-like structures
  const tables = [...document.querySelectorAll("table")].slice(0,2);
  out.tables = tables.map(tb=>{
    const rs=[...tb.querySelectorAll("tr")].slice(0,4).map(tr=>({
      box:box(tr), style:cs(tr),
      cells:[...tr.querySelectorAll("th,td")].slice(0,6).map(td=>({tag:td.tagName, text:(td.innerText||'').slice(0,50), box:box(td), style:cs(td)}))
    }));
    return { cls:(tb.className||'').toString().slice(0,140), box:box(tb), style:cs(tb), rows:rs };
  });
  // div-based rows
  const divrows = [...document.querySelectorAll("[class*=zwd-list] > div, [class*=file-list] > div, [role=row]")].slice(0,3);
  out.divRows = divrows.map(el=>({cls:(el.className||'').toString().slice(0,160), box:box(el), style:cs(el), text:(el.innerText||'').slice(0,200)}));
  // column headers text
  out.headerCells = [...document.querySelectorAll("th, [role=columnheader]")].slice(0,8).map(el=>({text:(el.innerText||'').slice(0,40), box:box(el), style:cs(el)}));
  // 5. checkbox + selection colors: row hover bg via class? capture selected row
  const sel = document.querySelector("[class*=selected], [class*=checked], tr[class*=active]");
  if (sel) out.selectedRow = { cls:(sel.className||'').toString().slice(0,160), box:box(sel), style:cs(sel) };
  return JSON.stringify(out);
})()
