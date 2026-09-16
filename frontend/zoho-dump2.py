import json
from websockets.sync.client import connect
TAB = "C956FFD74533A2D23092E6BF072E8562"
WS = f"ws://127.0.0.1:9222/devtools/page/{TAB}"
expr = open("zoho-audit.js", encoding="utf-8").read()
with connect(WS, max_size=30*1024*1024) as ws:
    ws.send(json.dumps({"id": 1, "method": "Runtime.evaluate", "params": {"expression": expr, "returnByValue": True}}))
    while True:
        m = json.loads(ws.recv())
        if m.get("id") == 1:
            res = m["result"]["result"]["value"]
            open("C:/temp/zoho-audit.json", "w", encoding="utf-8").write(json.dumps(res, indent=1, ensure_ascii=False))
            print(json.dumps(res, indent=1, ensure_ascii=False))
            break
