(() => {
  const cs = (el) => { const c = getComputedStyle(el); return { bg: c.backgroundColor, color: c.color, fontSize: c.fontSize, fontWeight: c.fontWeight, padding: c.padding, radius: c.borderRadius, border: c.border.slice(0,140), shadow: c.boxShadow.slice(0,200), height: c.height, width: c.width }; };
  const box = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  function click(el){ el.dispatchEvent(new MouseEvent("mousedown",{bubbles:true})); el.dispatchEvent(new MouseEvent("mouseup",{bubbles:true})); el.click(); }
  const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));
  return (async () => {
    const out = {};
    // --- open +New menu
    const newBtn = [...document.querySelectorAll("button")].find(e=>((e.innerText||"").trim()==="New") && (e.className||"").includes("create-new"));
    out.newBtnFound = !!newBtn;
    if (newBtn) {
      click(newBtn); await sleep(900);
      const menus = [...document.querySelectorAll("[role=menu], .zwd-menu, [class*=dropdown], [class*=popup], [class*=context-menu]")].filter(m=>m.offsetParent!==null);
      out.openMenusAfterNew = menus.map(m=>({cls:(m.className||"").toString().slice(0,180), box:box(m), style:cs(m), items:[...m.querySelectorAll("[role=menuitem], li, button, a")].slice(0,24).map(it=>({text:(it.innerText||"").split("\n").join(" | ").slice(0,90), cls:(it.className||"").toString().slice(0,120), box:box(it), style:cs(it)}))}));
      out.bodyTail = document.body.innerHTML.slice(-3000);
      // screenshot happens outside; close with Esc
      document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true})); await sleep(400);
    }
    return JSON.stringify(out);
  })();
})()
