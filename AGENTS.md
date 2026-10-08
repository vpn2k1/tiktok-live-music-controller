# AGENTS.md

## Goal
Maintain a small, secure React + Electron TikTok LIVE music controller. UI must remain pure React elements + plain CSS; do not introduce a component/UI framework unless explicitly requested.

## Architecture
- `electron/main.ts`: privileged desktop/TikTok/filesystem work.
- `electron/preload.ts`: narrow IPC bridge only.
- `src/App.tsx`: renderer state, player, live event processing, user-configurable rules.
- `electron/overlay-server.ts`: loopback-only HTTP + SSE server for the OBS overlay.
- `electron/overlay-window.ts`: optional standalone overlay window for OBS Window Capture (URL built in main from whitelisted options).
- `src/game/autoplay.ts` + `useAutoPlay.ts`: game host — the play loop (a game replays round after round until a switch; gift / `!doigame` switches wait for the round to end), optional switch after N rounds / minutes, rotation, and the auto session (LIVE length).
- `src/game/bankFile.ts`: bank file import (.txt `|`, .csv, tab rows, `#` comments) and per-line checks; samples live on each textarea `SettingField.sample`, saved via main's `dialog:save-text` (user picks the path).
- `src/game/series.ts`: multi-question rounds with speed scoring (quiz, English answer games, hangman); `src/game/scoreboard.ts`: leaderboard for huge rooms; `src/shared/eventBatch.ts`: 100 ms event batches with overload caps.
- `src/game/lobby.ts`: viewer game list (vote the next game by comment number / gifts; no votes or a tie = announced random pick) and the `!doigame` whitelist; rendered as the overlay game card. It lists the active game group (`groups` in `autoplay.ts`, edited in `GameLibrary.tsx`).
- `src/game/vocab.ts`: English / Japanese / Chinese word sets shared by the word games (Lô tô, Cờ caro, Ai là triệu phú, Đoán chữ, Vòng chữ, Tìm từ); generated content in `src/game/content/vocab-{en,ja,zh}.ts` from the VpngoPlay decks by `scripts/import-vpngoplay.mjs` (re-run it, don't hand-edit). Word boards render with the overlay `grid` part.
- `src/game/chatCommands.ts`: global chat commands (`!help`, `!rank`, host-only `!start/!stop/!cancel/!games`).
- `tests/*.test.ts`: unit tests for the pure game modules (`npm test`).
- `src/game/*`: game engine, controller hook (`useLiveGames`), registry, pure game plugins in `src/game/games/*`, Vietnamese/English word helpers, default English content in `src/game/content/`.
- `src/overlay/*`: transparent overlay page (`overlay.html`) for OBS Browser Source.
- `src/components/*`: small presentational React components. Layout: sidebar tabs in `App.tsx` and popups on `Modal.tsx` (native `<dialog>`); see `docs/ARCHITECTURE.md` → Controller layout.
- `electron/signKey.ts`: Euler Stream API key for TikTok signing, stored like the AI keys (encrypted in main, renderer sees `hasKey` + last 4 characters; `SIGN_API_KEY` env wins). UI: `SignKeyField` in `src/components/TikTokConnect.tsx`.
- `electron/ai.ts` + `src/shared/ai.ts`: AI generation of bank lines (Gemini, Groq, Grok/xAI); UI in `src/components/AiPanel.tsx` (keys) and `AiBankBox.tsx` (per bank). See `docs/AI.md`.
- `src/shared/bgm.ts` (pure music loops) + `src/game/music.ts` (which theme plays when) + `src/hooks/useGameMusic.ts` (Web Audio player): game background music composed in code — never add copyrighted audio files.
- `src/shared/i18n.ts` + `src/shared/en/*.ts`: app language (Vietnamese / English). `t()` takes the Vietnamese source text as the key; the overlay gets the language in `OverlayState.lang`.

## Safety rules
1. Never enable `nodeIntegration` in renderer.
2. Keep `contextIsolation: true` and `sandbox: true`.
3. Never execute TikTok comments as JavaScript, shell commands, paths, URLs, or selectors.
4. New viewer commands must be explicit whitelist rules.
5. Do not expose raw local file paths to renderer. Use the tokenized `media://` protocol.
6. Treat `tiktok-live-connector` as unofficial and failure-prone; surface errors instead of hiding them.
7. The overlay server binds `127.0.0.1` only, checks the `Host` header, serves a fixed path whitelist, and receives only public display data (never file paths). Viewer profile pictures are the only remote content: HTTPS URLs on TikTok's image CDN, checked with `safeAvatarUrl` (`src/shared/avatar.ts`) in main and again in the overlay; the overlay CSP `img-src` allows only those hosts.
8. Viewer chat commands go through the per-viewer cooldown (`CommandRateLimiter`).
9. Host-only commands require the connected streamer's username, the configured moderator list, or `event.simulated` (set only by main's simulate IPC for the app's test tools).
10. The overlay window never loads a renderer-supplied URL; it has no preload, runs sandboxed in its own session, denies popups and blocks navigation off the overlay origin (compare parsed `URL.origin`, never string prefixes). It is frameless: the page is the drag area and closes itself with `window.close()` (✕ / Esc); main reports open/closed via `overlay:window-changed`. Its only input back to the app is the URL-hash channel (`#act=menu.<n>` / `#act=pick-<i>.<n>`, parsed by `parseWindowAction` in main from `did-navigate-in-page`, origin-checked); add new actions only to that whitelist.
11. The main window denies popups and all navigation (e.g. files dropped onto it).
12. AI API keys (and the Euler Stream key, `electron/signKey.ts`) live only in main, encrypted with `safeStorage` (session-only memory when the OS can't encrypt); the renderer can set/remove/test a key and sees only `hasKey` + the last 4 characters. Main calls only the fixed HTTPS hosts in `AI_HOSTS`, with the key in a header (never in URLs, logs or error text). The renderer sends a structured request (format, topic, count…), not URLs or raw prompts. AI output is untrusted data: it only becomes bank lines, filtered by the game's `checkBank` and reviewed by the streamer; never execute it. Never send viewer chat to an AI provider.

## Change workflow
- For TikTok events, read `.agents/skills/tiktok-events/SKILL.md`.
- For music behavior, read `.agents/skills/music-player/SKILL.md`.
- For a new user-configurable trigger/action, read `.agents/skills/add-live-rule/SKILL.md`.
- For a new LIVE game or overlay widget, read `.agents/skills/add-game/SKILL.md`.
- User-visible text: write it in Vietnamese, wrap runtime text in `t()` (params as `{name}`, not string concatenation), and add the English entry in `src/shared/en/*.ts`. Static game metadata (title, howTo, commands, settings) is translated where it is rendered. Question banks and other content stay data. `tests/i18n.test.ts` checks every game has English metadata.
- Update docs when event/action behavior changes.
