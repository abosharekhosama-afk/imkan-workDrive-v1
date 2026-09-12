(() => {
  const cs = (el) => { const c = getComputedStyle(el); return { bg: c.backgroundColor, color: c.color, fontSize: c.fontSize, fontFamily: c.fontFamily.slice(0, 80), fontWeight: c.fontWeight, padding: c.padding, margin: c.margin, radius: c.borderRadius, border: c.border.slice(0, 120), shadow: c.boxShadow.slice(0, 150), display: c.display, height: c.height, width: c.width }; };
  const box = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const desc = (el, depth = 0) => {
    if (!el || depth > 6) return null;
    const kids = [...el.children].slice(0, 12).map((k) => desc(k, depth + 1));
    return { tag: el.tagName, cls: (el.className?.baseVal ?? el.className ?? "").toString().slice(0, 160), id: el.id || "", text: (el.innerText || "").split("\n").slice(0, 3).join(" | ").slice(0, 140), box: box(el), style: cs(el), kids };
  };
  const byText = (t) => [...document.querySelectorAll("button,div,a,span")].find((e) => (e.innerText || "").trim() === t);
  const out = { regions: {}, keyButtons: {} };
  // main layout landmarks
  const cands = {
    leftPanel: [".zwd-leftpanel", "[class*=leftpanel]", "[class*=left-panel]", "[class*=sidebar]"],
    topHeader: [".zwd-pagenv-top-header", "[class*=top-header]", "[class*=topheader]"],
    mainList: ["[class*=file-list]", "[class*=files-view]", "[class*=list-view]", "[class*=content-area]", "main"],
    toolbar: ["[class*=toolbar]", "[class*=action-bar]", "[class*=topbar]"],
  };
  for (const [k, sels] of Object.entries(cands)) {
    for (const s of sels) { const el = document.querySelector(s); if (el) { out.regions[k] = desc(el, 2); break; } }
  }
  for (const t of ["+ New", "New", "Record", "Manage", "Search", "My Folders", "Favorites", "Recent", "Shared", "Trash"]) {
    const el = byText(t);
    if (el) out.keyButtons[t] = { cls: (el.className?.baseVal ?? el.className ?? "").toString().slice(0, 160), box: box(el), style: cs(el) };
  }
  // list a sample row: look for file row elements
  const rowSels = ["[class*=file-row]", "[class*=list-row]", "[class*=zwd-row]", "[role=row]", ".zwd-list-item", "[class*=listitem]", "[class*=file-item]"];
  for (const s of rowSels) {
    const els = [...document.querySelectorAll(s)].slice(0, 3);
    if (els.length) { out.sampleRows = els.map((el) => ({ sel: s, cls: (el.className?.toString() || "").slice(0, 160), box: box(el), style: cs(el), text: (el.innerText || "").slice(0, 160) })); break; }
  }
  // checkbox sample
  const cb = document.querySelector("input[type=checkbox]");
  if (cb) out.checkbox = { box: box(cb), style: cs(cb), parentText: (cb.closest("div,li,tr")?.innerText || "").slice(0, 100) };
  // search input
  const si = document.querySelector("input[type=search], input[placeholder*=Search], input[placeholder*=search]");
  if (si) out.searchInput = { ph: si.placeholder, box: box(si), style: cs(si) };
  return JSON.stringify(out);
})()
