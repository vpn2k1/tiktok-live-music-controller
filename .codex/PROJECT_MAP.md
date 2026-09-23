# Project map

```text
TikTok LIVE
  ↓ tiktok-live-connector
Electron main
  ↓ safe IPC
React renderer
  ↓ processLiveEvent()
Rule matching
  ↓
HTMLAudioElement
  ↓
local audio via media:// token protocol
```

```text
React renderer
  ↓ IPC overlay:update
Electron main overlay-server (127.0.0.1:17321, SSE)
  ↓
overlay.html in OBS Browser Source
```

No Express/WebSocket dependency: the overlay uses Node `http` + Server-Sent Events.
