# Architecture

## Data flow

```text
TikTok LIVE
   ↓
TikTokLiveConnection (Electron main)
   ↓ normalize
{ type, user, comment/gift/count }
   ↓ LiveEventBatcher (100 ms batches, overload caps)
   ↓ IPC: tiktok:events
React App (one render per batch)
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

## Controller layout

`src/App.tsx` holds the state; the screen is split into 5 sidebar tabs (every page stays mounted, hidden when inactive, so music keeps playing):

| Tab | Content |
|---|---|
| 🏠 Trang chính | Before a game runs: **3 bước để LIVE** (`QuickStart`: ① username + Kết nối, ② open the game window / copy the OBS link, ③ auto-play the group, pick 1 game, or Chạy thử), each step ticks itself. While playing: the round (`LiveGameCard`), auto run status (`AutoPlayStatus`), leaderboard |
| 📚 Game | `GameLibrary` (groups + cards); a card opens `GameDetailsModal` (how to play, commands, settings, play) |
| 💬 Bình luận | comment history + LIVE log |
| 🎵 Nhạc | player, playlist, music rules |
| ⚙️ Cài đặt | sub-tabs: 🔊 Chung (`FeaturesPanel`), 🔁 Tự động (`AutoPlaySettingsPanel`), 📺 OBS (`OverlayPanel`), 🤖 AI (`AiPanel`), 🔑 TikTok (`SignKeyField`) |

Popups (`Modal`, native `<dialog>`): **▶ Bắt đầu game** / **🎯 Chọn 1 game** (`StartModal`: one game, or auto-run the group), game details, **🧪 Test** tools, and the TikTok connection (status pill in the top bar → `ConnectModal`).

## Games

```text
LiveEvent → useLiveGames.handleEvent → running GameDefinition.handle (pure)
          → cooldown check (chat commands) → state update → overlay view
timer / tick → GameDefinition.finish → points + optional track change
useAutoPlay (1 s loop) → finish / start next game on the LIVE + per-game timers
gift / chat LiveEvent → useAutoPlay.handleEvent → lobby votes, !doigame, gift → switch game
idle + lobby on → lobby list as the overlay game card → most votes → start that game
```

Game modules never touch React, the filesystem or the network; they receive a context (`now`, `random`, dictionary, playlist) and return new state. Two hooks matter at scale: `HandleResult.commit` (write per-viewer records in place, only when the result is applied) and `advance` (the round deadline moves a question series on instead of finishing). The session leaderboard is a mutable `Scoreboard` (O(log n) per award); `GameState.scoreVersion` signals changes.

## AI generation

```text
AiBankBox (renderer) → ai:generate {game, format = bank sample, topic, count…}
  → electron/ai.ts: decrypt key (safeStorage) → buildPrompt → net.fetch fixed host
  → cleanGeneratedLines → renderer keeps lines the game's checkBank accepts → streamer edits → append / replace
```

Keys never cross to the renderer (`AiStatus` has only `hasKey` and the last 4 characters). `src/shared/ai.ts` holds the pure parts (validation, prompt, provider request/response formats) and is unit-tested in `tests/ai.test.ts`.

## Language

The UI and game texts are written in Vietnamese; `t(text, params)` (`src/shared/i18n.ts`) returns the English entry from `src/shared/en/*.ts` when the app language is English. The language is module state set by the 🇻🇳 VI / 🇬🇧 EN switch (saved in localStorage); hooks that memoize text read `useLanguage()` so they recompute on a switch. Game modules call `t()` for runtime text; static metadata (titles, howTo, commands, settings) is translated where it is rendered. The overlay receives the language in `OverlayState.lang`. Question banks are data and are never translated.

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
