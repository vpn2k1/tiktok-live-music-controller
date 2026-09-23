# AGENTS.md

## Goal
Maintain a small, secure React + Electron TikTok LIVE music controller. UI must remain pure React elements + plain CSS; do not introduce a component/UI framework unless explicitly requested.

## Architecture
- `electron/main.ts`: privileged desktop/TikTok/filesystem work.
- `electron/preload.ts`: narrow IPC bridge only.
- `src/App.tsx`: renderer state, player, live event processing, user-configurable rules.
- `electron/overlay-server.ts`: loopback-only HTTP + SSE server for the OBS overlay.
- `electron/overlay-window.ts`: optional standalone overlay window for OBS Window Capture (URL built in main from whitelisted options).
- `src/game/autoplay.ts` + `useAutoPlay.ts`: auto host (LIVE length, per-game switch timer, rotation, gift → switch game).
- `src/game/chatCommands.ts`: global chat commands (`!help`, `!rank`, host-only `!start/!stop/!cancel/!games`).
- `tests/*.test.ts`: unit tests for the pure game modules (`npm test`).
- `src/game/*`: game engine, controller hook (`useLiveGames`), registry, pure game plugins in `src/game/games/*`, Vietnamese/English word helpers, default English content in `src/game/content/`.
- `src/overlay/*`: transparent overlay page (`overlay.html`) for OBS Browser Source.
- `src/components/*`: small presentational React components.

## Safety rules
1. Never enable `nodeIntegration` in renderer.
2. Keep `contextIsolation: true` and `sandbox: true`.
3. Never execute TikTok comments as JavaScript, shell commands, paths, URLs, or selectors.
4. New viewer commands must be explicit whitelist rules.
5. Do not expose raw local file paths to renderer. Use the tokenized `media://` protocol.
6. Treat `tiktok-live-connector` as unofficial and failure-prone; surface errors instead of hiding them.
7. The overlay server binds `127.0.0.1` only, checks the `Host` header, serves a fixed path whitelist, and receives only public display data (never file paths).
8. Viewer chat commands go through the per-viewer cooldown (`CommandRateLimiter`).
9. Host-only commands require the connected streamer's username, the configured moderator list, or `event.simulated` (set only by main's simulate IPC for the app's test tools).
10. The overlay window never loads a renderer-supplied URL; it has no preload, runs sandboxed in its own session, denies popups and blocks navigation off the overlay origin (compare parsed `URL.origin`, never string prefixes).
11. The main window denies popups and all navigation (e.g. files dropped onto it).

## Change workflow
- For TikTok events, read `.agents/skills/tiktok-events/SKILL.md`.
- For music behavior, read `.agents/skills/music-player/SKILL.md`.
- For a new user-configurable trigger/action, read `.agents/skills/add-live-rule/SKILL.md`.
- For a new LIVE game or overlay widget, read `.agents/skills/add-game/SKILL.md`.
- Update docs when event/action behavior changes.
