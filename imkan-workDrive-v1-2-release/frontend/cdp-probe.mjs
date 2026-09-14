// CDP probe: connect to Zoho tab and evaluate basic DOM info
const WS_URL = "ws://localhost:9222/devtools/page/C956FFD74533A2D23092E6BF072E8562";
let msgId = 0;
const pending = new Map();
const ws = new WebSocket(WS_URL);
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error("timeout " + method)); } }, 15000);
  });
}
ws.onopen = async () => {
  console.log("CDP connected");
  try {
    const evalRes = await send("Runtime.evaluate", { expression: "({title: document.title, url: location.href, ready: document.readyState})", returnByValue: true });
    console.log("PAGE:", JSON.stringify(evalRes.result.result.value));
    // Count key elements
    const eval2 = await send("Runtime.evaluate", { expression: `(function(){
      const out = {};
      out.bodyClasses = document.body ? document.body.className.slice(0,300) : '';
      const btns = [...document.querySelectorAll('button')].map(b=>(b.textContent||'').trim().slice(0,40)).filter(Boolean).slice(0,40);
      out.buttons = btns;
      out.allBtnCount = document.querySelectorAll('button').length;
      out.checkboxes = document.querySelectorAll('input[type=checkbox]').length;
      out.tableRows = document.querySelectorAll('[role=row]').length;
      out.trCount = document.querySelectorAll('tr').length;
      return out;
    })()`, returnByValue: true });
    console.log("DOM:", JSON.stringify(eval2.result.result.value, null, 2));
  } catch (e) { console.error("ERR", e.message); }
  ws.close();
};
ws.onerror = (e) => console.error("WS error", e);
pendingHandler();
function pendingHandler() {
  ws.onmessage = (ev) => {
    try {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id).resolve(m); pending.delete(m.id); }
    } catch {}
  };
}
