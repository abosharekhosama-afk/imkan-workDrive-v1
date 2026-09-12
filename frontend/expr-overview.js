(async () => {
  const pick = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return { sel, text: (el.innerText || "").slice(0, 120), rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, style: { background: cs.backgroundColor, color: cs.color, fontSize: cs.fontSize, fontWeight: cs.fontWeight, padding: cs.padding, margin: cs.margin, borderRadius: cs.borderRadius, border: cs.border, boxShadow: cs.boxShadow, height: cs.height, display: cs.display, alignItems: cs.alignItems } };
  };
  const all = (sel, n = 8) => [...document.querySelectorAll(sel)].slice(0, n).map((el) => {
    const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
    return { text: (el.innerText || "").slice(0, 80), cls: (el.className?.baseVal ?? el.className ?? "").toString().slice(0, 120), rect: { w: Math.round(r.width), h: Math.round(r.height) }, bg: cs.backgroundColor, color: cs.color, fontSize: cs.fontSize, padding: cs.padding, radius: cs.borderRadius };
  });
  const out = {
    title: document.title, url: location.href,
    counts: { buttons: document.querySelectorAll("button").length, rows: document.querySelectorAll("[role=row]").length, tr: document.querySelectorAll("tr").length, inputs: document.querySelectorAll("input").length, iframes: document.querySelectorAll("iframe").length },
    header: pick("header"), buttons: all("button", 14),
    hasAngular: !!document.querySelector("[ng-app],[ng-version]"),
  };
  return JSON.stringify(out);
})()
