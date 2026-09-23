# AGENTS.md

## Goal
Maintain a small, secure React + Electron TikTok LIVE music controller. UI must remain pure React elements + plain CSS; do not introduce a component/UI framework unless explicitly requested.

## Architecture
- `electron/main.ts`: privileged desktop/TikTok/filesystem work.
- `electron/preload.ts`: narrow IPC bridge only.
- `src/App.tsx`: renderer state, player, live event processing, user-configurable rules.
- `src/components/*`: small presentational React components.

## Safety rules
1. Never enable `nodeIntegration` in renderer.
2. Keep `contextIsolation: true` and `sandbox: true`.
3. Never execute TikTok comments as JavaScript, shell commands, paths, URLs, or selectors.
4. New viewer commands must be explicit whitelist rules.
5. Do not expose raw local file paths to renderer. Use the tokenized `media://` protocol.
6. Treat `tiktok-live-connector` as unofficial and failure-prone; surface errors instead of hiding them.

## Change workflow
- For TikTok events, read `.agents/skills/tiktok-events/SKILL.md`.
- For music behavior, read `.agents/skills/music-player/SKILL.md`.
- For a new user-configurable trigger/action, read `.agents/skills/add-live-rule/SKILL.md`.
- Update docs when event/action behavior changes.
