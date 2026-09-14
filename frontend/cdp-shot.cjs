const TAB_ID = "C956FFD74533A2D23092E6BF072E8562";
const WS = `ws://localhost:9222/devtools/page/${TAB_ID}`;
const ws = new WebSocket(WS);
let id = 0;
const pend = new Map();
function send(method, params = {}) {
  return new Promise((res, rej) => {
    const i = ++id;
    pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params }));
    setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error("timeout " + method)); } }, 25000);
  });
}
ws.onopen = async () => {
  try {
    const r = await send("Runtime.evaluate", { expression: "document.title + ' | rows=' + document.querySelectorAll('[class*=row],tr').length", returnByValue: true });
    console.log("TITLE:", JSON.stringify(r.result?.result?.value));
    const shot = await send("Page.captureScreenshot", { format: "png" });
    require("fs").writeFileSync("zoho-default.png", Buffer.from(shot.result.data, "base64"));
    console.log("SHOT_OK zoho-default.png bytes=" + shot.result.data.length);
  } catch (e) { console.error("ERR", e.message); }
  ws.close();
};
ws.onerror = (e) => console.error("WS_ERR", e.message);
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data.toString());
  if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); if (m.error) p.rej(new Error(JSON.stringify(m.error))); else p.res(m); }
};
