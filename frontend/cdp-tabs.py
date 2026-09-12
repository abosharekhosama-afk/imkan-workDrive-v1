import json, urllib.request
tabs = json.load(urllib.request.urlopen("http://localhost:9222/json/list"))
print(f"TABS:{len(tabs)}")
for t in tabs:
    print(f"- id={t.get('id')} title={t.get('title','')[:90]}")
    print(f"  url={t.get('url','')[:160]}")
    print(f"  ws={t.get('webSocketDebuggerUrl','')[:120]}")
