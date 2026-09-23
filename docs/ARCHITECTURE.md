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

## Games

```text
LiveEvent → useLiveGames.handleEvent → running GameDefinition.handle (pure)
          → cooldown check (chat commands) → state update → overlay view
timer / tick → GameDefinition.finish → points + optional track change
useAutoPlay (1 s loop) → finish / start next game on the LIVE + per-game timers
gift LiveEvent → useAutoPlay.handleEvent → switch game (after the running game saw it)
```

Game modules never touch React, the filesystem or the network; they receive a context (`now`, `random`, dictionary, playlist) and return new state.

## Overlay flow

```text
React App (game state, leaderboard, now playing)
   ↓ IPC: overlay:update (OverlayState, public data only)
Electron main → overlay-server.ts (127.0.0.1:17321)
   ↓ SSE: /overlay/stream
overlay.html in OBS / TikTok LIVE Studio Browser Source
```

See `docs/OVERLAY.md`.

## Why TikTok runs in Electron main
The connector uses Node networking and should not be bundled into the renderer. Keeping it in main also prevents exposing Node privileges to untrusted viewer text.

## Why music plays in React
The renderer owns `HTMLAudioElement`, player state, progress, volume, and playlist UI. This keeps playback behavior simple and makes rules easy to visualize.
