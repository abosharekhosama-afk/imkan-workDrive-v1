"""Live Zoho audit via CDP (stdlib only where possible, websocket via 'websocket' fallback)."""
import json, subprocess, urllib.request, base64, os, sys, re

OUT = os.path.join(os.path.dirname(__file__), ".zoho-audit")
os.makedirs(OUT, exist_ok=True)

def get_tabs():
    with urllib.request.urlopen("http://localhost:9222/json/list", timeout=5) as r:
        return json.loads(r.read().decode())

tabs = get_tabs()
target = None
for t in tabs:
    if "workdrive.zoho.com" in (t.get("url") or ""):
        target = t
        break
if not target:
    print("NO_ZOHO_TAB"); sys.exit(1)
wsurl = target["webSocketDebuggerUrl"]
print("TAB:", target["title"][:60], target["url"][:100])

# Try python websocket libs
ws_mod = None
try:
    import websocket  # websocket-client (sync)
    ws_mod = "websocket-client"
except Exception as e:
    pass
try:
    from websockets.sync.client import connect as ws_connect
    ws_mod = ws_mod or "websockets-sync"
except Exception:
    pass
print("WSMOD:", ws_mod)

EXPR = open(os.path.join(os.path.dirname(__file__), "zoho-cdp-expr.js"), encoding="utf-8").read() if os.path.exists(os.path.join(os.path.dirname(__file__), "zoho-cdp-expr.js")) else None

AUDIT_JS = r"""
(() => {
  const out = {url: location.href, title: document.title, ts: Date.now()};
  const cs = (el) => { if(!el) return null; const c = getComputedStyle(el);
    return {bg:c.backgroundColor,color:c.color,font:c.fontSize+'/'+c.lineHeight,pad:c.padding,padTop:c.paddingTop,padRight:c.paddingRight,padBottom:c.paddingBottom,padLeft:c.paddingLeft,margin:c.margin,radius:c.borderRadius,border:c.border,height:el.getBoundingClientRect().height|0,width:el.getBoundingClientRect().width|0,shadow:c.boxShadow,hover:null}; };
  const q = (s) => document.querySelector(s);
  const qa = (s) => Array.from(document.querySelectorAll(s));
  const findBtn = (re) => qa('button').find(b => re.test(b.textContent||''));
  // header
  out.header = cs(q('header')) || cs(q('[class*=topbar]'));
  // search input
  const search = q('input[placeholder*="Search"]') || q('input[type="search"]') || q('input[placeholder*="search" i]');
  out.searchInput = search ? {...cs(search), placeholder: search.getAttribute('placeholder'), rect: search.getBoundingClientRect().toJSON()} : null;
  // + New
  const newBtn = findBtn(/^\s*\+\s*New/i) || findBtn(/New/);
  out.newButton = newBtn ? {...cs(newBtn), text:(newBtn.textContent||'').trim().slice(0,40), rect:newBtn.getBoundingClientRect().toJSON(), cls:newBtn.className} : null;
  // Manage capsule
  const manage = findBtn(/Manage/i);
  out.manageBtn = manage ? {...cs(manage), text:(manage.textContent||'').trim().slice(0,40), rect:manage.getBoundingClientRect().toJSON()} : null;
  // sidebar
  const aside = q('aside') || q('nav');
  out.sidebar = aside ? {...cs(aside), rect: aside.getBoundingClientRect().toJSON()} : null;
  // sidebar links sample
  out.sideLinks = qa('aside a, nav a').slice(0,14).map(a=>({text:(a.textContent||'').trim().slice(0,30), ...cs(a)}));
  // table
  const tbl = q('table');
  out.table = tbl ? {found:true, rect: tbl.getBoundingClientRect().toJSON()} : {found:false};
  const tr = q('tbody tr') || q('tr');
  out.row = tr ? {...cs(tr), html: tr.outerHTML.slice(0,500)} : null;
  const ths = qa('th').map(th=>({text:(th.textContent||'').trim().slice(0,20), ...cs(th)}));
  out.headers = ths.slice(0,8);
  const tds = tr ? Array.from(tr.querySelectorAll('td')).map(td=>({...cs(td), text:(td.textContent||'').trim().slice(0,30)})) : [];
  out.cells = tds.slice(0,8);
  // checkbox
  const cb = q('input[type="checkbox"]');
  out.checkbox = cb ? {...cs(cb), rect: cb.getBoundingClientRect().toJSON()} : null;
  // selection bar (any blue bar)
  const cands = qa('div').filter(d=>/selected|item.*select/i.test(d.textContent||'') && d.getBoundingClientRect().height>20 && d.getBoundingClientRect().height<80).slice(0,3);
  out.selCands = cands.map(d=>({text:(d.textContent||'').trim().slice(0,120), ...cs(d)}));
  // menus currently open
  out.menus = qa('[role="menu"],[role="listbox"],ul[class*=menu]').slice(0,4).map(m=>({items: m.querySelectorAll('[role="menuitem"],li,button').length, ...cs(m), html:m.outerHTML.slice(0,1200)}));
  // inspector
  const insp = qa('aside').find(a=>/Details|Activity|Properties/i.test(a.textContent||''));
  out.inspector = insp ? {...cs(insp), rect: insp.getBoundingClientRect().toJSON(), text:(insp.textContent||'').slice(0,200)} : null;
  // buttons sample for radius
  out.btnSample = qa('button').slice(0,6).map(b=>({text:(b.textContent||'').trim().slice(0,20), radius:getComputedStyle(b).borderRadius, bg:getComputedStyle(b).backgroundColor}));
  // fonts
  out.bodyFont = {font:getComputedStyle(document.body).fontFamily, size:getComputedStyle(document.body).fontSize, bg:getComputedStyle(document.body).backgroundColor};
  // all text buttons with hints (shortcuts)
  out.hints = document.body.innerHTML.slice(0,2000).length;
  return out;
})()
"""
