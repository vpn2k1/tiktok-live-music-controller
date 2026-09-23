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

No Express/WebSocket server is required in this Electron version.
