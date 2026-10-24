#!/usr/bin/env python3
"""Node-side forged-signature check. Input: hex of a real, FROST-signed vault spend (captured off the wire
by the lifecycle script) and the hex of one of its spend-auth signatures. Posts to zebrad's sendrawtransaction:
the tx with one bit flipped in that signature (R half, then s half), then the untouched tx as control."""
import json, sys, urllib.request
raw = open(sys.argv[1]).read().strip(); sig = sys.argv[2]
assert raw.count(sig) == 1
def post(label, h):
    r = urllib.request.Request("http://127.0.0.1:18232", json.dumps({"jsonrpc": "2.0", "id": 1, "method": "sendrawtransaction", "params": [h]}).encode(), {"content-type": "application/json"})
    try: out = urllib.request.urlopen(r, timeout=60).read().decode()
    except urllib.error.HTTPError as e: out = e.read().decode()
    print(label, out[:260])
def flip(at):
    i = raw.index(sig) + at; return raw[:i] + ('0' if raw[i] != '0' else '1') + raw[i + 1:]
post("tampered R half:", flip(10)); post("tampered s half:", flip(100)); post("control        :", raw)
