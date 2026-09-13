"""Zoho CDP extractor - multi-step computed-style audit."""
import json, sys
from websockets.sync.client import connect
TAB = "C956FFD74533A2D23092E6BF072E8562"
WS = f"ws://127.0.0.1:9222/devtools/page/{TAB}"
_mid = [0]
def cdp(ws, method, params=None):
    _mid[0] += 1
    i = _mid[0]
    ws.send(json.dumps({"id": i, "method": method, "params": params or {}}))
    while True:
        m = json.loads(ws.recv())
        if m.get("id") == i:
            return m
def ev(ws, expr):
    r = cdp(ws, "Runtime.evaluate", {"expression": expr, "returnByValue": True})
    if r.get("result", {}).get("exceptionDetails"):
        raise RuntimeError(str(r["result"]["exceptionDetails"])[:1000])
    return r["result"]["result"]["value"]
STEP = sys.argv[1] if len(sys.argv) > 1 else "probe"
with connect(WS, max_size=20 * 1024 * 1024) as ws:
    print("CDP-OK", flush=True)
    if STEP == "all":
        out = ev(ws, open("zoho-cdp-expr.js", encoding="utf-8").read())
        open("C:/temp/zoho-audit.json", "w", encoding="utf-8").write(json.dumps(out, indent=1, ensure_ascii=False))
        print(json.dumps(out, indent=1, ensure_ascii=False)[:25000])
