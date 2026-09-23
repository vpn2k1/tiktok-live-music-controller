# Architecture

## Data flow

```text
TikTok LIVE
   ↓
TikTokLiveConnection (Electron main)
   ↓ normalize
{ type, user, comment/gift/count }
   ↓ IPC: tiktok:event
React App
   ↓ processLiveEvent
Rules
   ↓
Music actions: select / next / play
   ↓
<audio> element
   ↓
media://track/<token>
   ↓
Electron custom protocol → local file
```

## Why TikTok runs in Electron main
The connector uses Node networking and should not be bundled into the renderer. Keeping it in main also prevents exposing Node privileges to untrusted viewer text.

## Why music plays in React
The renderer owns `HTMLAudioElement`, player state, progress, volume, and playlist UI. This keeps playback behavior simple and makes rules easy to visualize.
