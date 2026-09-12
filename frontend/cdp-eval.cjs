const fs = require("fs");
const http = require("http");
function tabs() {
  return new Promise((res, rej) => {
    http.get("http://localhost:9222/json/list", (r) => {
      let b = ""; r.on("data", (c) => (b += c)); r.on("end", () => res(JSON.parse(b)));
    }).on("error", rej);
  });
}
async function main() {
  const [, , exprFile, outFile] = process.argv;
  if (!exprFile) { console.error("usage: node cdp-eval.cjs <expr.js> [out.json]"); process.exit(2); }
  const list = await tabs();
  const tab = list.find((t) => (t.url || "").includes("workdrive.zoho.com")) || list[0];
  console.error("TAB:", tab.title?.slice(0, 60), "|", tab.url?.slice(0, 100));
  const WS = tab.webSocketDebuggerUrl;
  const expression = fs.readFileSync(exprFile, "utf8");
  const ws = new WebSocket(WS);
  let id = 0;
  const pend = new Map();
  function send(method, params = {}) {
    return new Promise((res2, rej2) => {
      const i = ++id;
      pend.set(i, { res: res2, rej: rej2 });
      ws.send(JSON.stringify({ id: i, method, params }));
      setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej2(new Error("timeout " + method + " id=" + i)); } }, 90000);
    });
  }
  ws.onopen = async () => {
    try {
      const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (r.result?.exceptionDetails) {
        console.error("EXC", JSON.stringify(r.result.exceptionDetails).slice(0, 4000));
        process.exitCode = 1;
      } else {
        const val = r.result?.result?.value;
        const text = typeof val === "string" ? val : JSON.stringify(val, null, 1);
        if (outFile) fs.writeFileSync(outFile, text);
        console.log(text.slice(0, 6000));
        if (text.length > 6000) console.log(`...[truncated ${text.length - 6000} chars, full in ${outFile || "stdout"}]`);
      }
    } catch (e) { console.error("ERR", e.message); process.exitCode = 1; }
    ws.close();
  };
  ws.onerror = (e) => { console.error("WS_ERR", e.message); process.exitCode = 1; };
  ws.onmessage = (ev) => {
    let m; try { m = JSON.parse(ev.data.toString()); } catch { return; }
    if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); if (m.error) p.rej(new Error(JSON.stringify(m.error))); else p.res(m); }
  };
}
main();

