# Overlay (OBS / TikTok LIVE Studio)

Viewers only see what the streaming software captures. The app therefore serves a transparent page that you add as a **Browser Source**.

## URL and frame

Build the link in panel **④ Đưa lên OBS**:

- **Frame:** 9:16 (1080×1920), 16:9 (1920×1080), 1:1 (1080×1080), 4:5 (1080×1350) or **Tuỳ chỉnh** (240–3840 px each side).
- **Position:** 3×3 grid (top-left … bottom-right) for the widget column.
- **Size:** Nhỏ / Vừa / Lớn / Rất lớn = 34% / 50% / 68% / 90% of the frame's shorter side (never wider than the free area).
- **Tránh vùng TikTok che** (portrait frames): keeps the column out of TikTok's top bar (~13%), right buttons (~17%) and comments (~35% bottom); the preview shades those zones.

```text
http://127.0.0.1:17321/overlay?w=1080&h=1920&pos=top-left&size=xl&safe=1&widgets=alerts,game,leaderboard,music
```

| Param | Values | Default |
|---|---|---|
| `w`, `h` | 240–3840 (clamped) | 1080 × 1920 |
| `pos` | `top-left`, `top`, `top-right`, `left`, `center`, `right`, `bottom-left`, `bottom`, `bottom-right` | `top-left` |
| `size` | `s`, `m`, `l`, `xl`, `full` | `xl` |
| `safe` | `1` = avoid TikTok UI | off |
| `widgets` | comma list of `alerts`, `game`, `leaderboard`, `music` (unknown names ignored) | all |
| `bg` | `green`, `dark` (window capture); omit = transparent | transparent |

Old links (`?layout=portrait|landscape`, or no params = compact 420 px column) still work. The page, the in-app preview and the game window all go through `normalizeOverlayConfig` in `src/shared/overlay.ts`.

Set the Browser Source width/height to the frame size shown in the app.

## OBS setup

1. Sources → **+** → **Browser**.
2. URL: the overlay link. Width/height: the frame size shown in the app (e.g. 1080×1920).
3. Leave "Custom CSS" empty; the page background is already transparent.

TikTok LIVE Studio: add a link/browser-type source with the same URL if your version supports it; otherwise capture OBS.

## Widgets

| Widget | Shown when |
|---|---|
| Game card (title, countdown, vote options with bars, progress bar, result message) | a round is `running` or `ended` (hidden 10 s after it ends) |
| Game card as **🎮 Chọn game · <group>** list (the active game group, numbered, vote bars, countdown) | "Viewer chọn game" is on and no round is running (see RULES.md) |
| Leaderboard (top 5) | at least one viewer has points |
| Now playing | a track is selected |
| Alerts (follow/join greeting) | a greeting is being shown (3.5 s each) |

The game card renders a generic `OverlayGameView` built by the running game: `headline` (big text), `hint`, `rows` (optional badge / bar / value / highlight), `progress` (HP bar), `teams` (tug-of-war), `race` (lanes) and `wheel` (animated SVG wheel; only live spins animate, a freshly loaded overlay jumps to the result).

All enabled widgets stack in one column (alerts, game, leaderboard, now playing) placed by position/size; the column is designed at 460 px and zoomed to the chosen size, so text scales with it.

**Toàn màn** (`size=full`, `fullStage()` in `src/shared/overlay.ts`): the column fills the whole frame (or the TikTok-safe part when "Tránh vùng TikTok che" is on; picking Toàn màn unchecks it) and position is ignored. The game card stretches to the height left by the other widgets: lists (vote/lobby) share the height (rows up to 110 px, shrinking evenly when long), short content (word tiles, boss, wheel) is centered. Zoom follows the width, but never below a 560 px design height, so on wide frames (16:9) the design canvas gets wide: the game sits on the left, other widgets in a 360 px right column (the game takes the full width when it's alone), and lists with more than 5 rows use two columns.

## Look & effects

- Game-UI theme (casual mobile-game look, pure CSS, no images): cards with a thick dark outline, accent inner frame, glossy top and a 3D base; the game title sits on a ribbon with a moving shine; text uses a cartoon outline (layered `text-shadow`, so older OBS browsers render it too); quiz answers are candy buttons; lists are 3D plates (long lists fill the plate with the vote share); the leaderboard has a gold ribbon and gold/silver/bronze plates; crossword cells are 3D blocks with an orange keyword column; win/start/time-up banners spin light rays behind them. Loop animations stop when the OS asks for reduced motion.
- Font: **Baloo 2** (variable, OFL, `@fontsource-variable/baloo-2`), bundled into `dist/assets` and served by the overlay server — works offline, Vietnamese included. The controller app uses the same font and theme (candy buttons, outlined panels, game cards with icon tiles).
- Each game has an accent color (card glow, header strip, countdown ring) and a "how to join" chip row (💬 comment / ❤️ likes / 🎁 gifts) built from its command list.
- Viewers get a colored initial badge (stable color per name) on leaderboards, race lanes, winners and popups; the leaderboard shows 🥇🥈🥉.
- Game-specific visuals: letter tiles (Unscramble, Hangman, Ai nhanh tay), Kahoot-style colored answers (quiz, vote), a floating boss that flashes when hit, a tug-of-war rope, colored race lanes with a crown for the leader, a glowing spin wheel.
- Games emit one-shot effects (`OverlayEffect`: start, hit, score, correct, wrong, win, lose). The overlay shows floating numbers, shakes the card on hits, and full-frame banners with canvas confetti on wins; effects are played once per id and are not replayed when OBS reloads the page.
- The app plays matching synthesized sounds plus a tick in the last 5 seconds (toggle: Cài đặt chung → 🔊 Âm thanh game). OBS captures them with the app's audio.

## Game list (lobby)

The game list is drawn as rectangular game tiles in 2 columns (`GameMenu` in `src/overlay/parts.tsx`, data in `OverlayState.game.menu` from `lobbyOverlay`): an icon plate colored by category with the number viewers type as a gold coin, the game name, a vote bar with count and share, and a gold ring + 👑 on the leading game. Long lists scroll inside the card: with the mouse wheel in the game window, and slowly by themselves (pausing at each end, and while the streamer hovers or scrolls) so OBS viewers see every game.

## Standalone game window (Window Capture)

**🪟 Mở cửa sổ game** opens a separate Electron window showing the same overlay (layout/widgets from the panel) with a solid background: green `#00b140` for OBS *Chroma Key*, dark, or transparent. In OBS add **Window Capture → "Game Overlay"**. Resize freely: the window keeps the frame's aspect ratio and zooms the frame to fit (it opens at up to 80% of the screen). Its title stays "Game Overlay" so the OBS source keeps working when you change the frame.

The window is frameless (no title bar in the capture):
- **Move**: drag anywhere on it (the page is a `-webkit-app-region: drag` area). **Resize**: drag an edge/corner.
- **Close**: click the window to show a small round ✕ in its top-right corner, then click it or press Esc; or **✕ Đóng cửa sổ game** in the app (shown while the window is open; the open button becomes **🔄 Cập nhật cửa sổ game**). The buttons only show while the window is focused, so they disappear from the capture as soon as you click back into the app.
- **☰ Back to the game list** (top-left, during a game): ends the round quietly (its points count, no result banner) and shows the active group's game list, even when viewer voting is off. Viewers can still vote with numbers / gifts.
- **Pick a game**: in the list, click a game to start it right away (hover highlights it). Scroll the list with the mouse wheel. The window accepts the first click even when unfocused (macOS `acceptFirstMouse`).
- Reopening puts it back where you left it (same size if the frame didn't change) for this app session. It also closes with the main app.
- Main adds `win=1` to the URL it builds (never renderer-supplied); only then does the page show the bar and drag area. OBS Browser Source links never have it.

Security: the renderer only sends `{ layout, widgets, background }`; main validates them and builds the URL itself. The window is sandboxed, has no preload, denies `window.open` and blocks navigation outside the overlay origin (and the Vite origin in dev).

Clicks (☰, picking a game) travel without a preload: the page sets its own URL hash to `#act=menu.<n>` or `#act=pick-<1–99>.<n>` (`windowActionHash`); main listens to `did-navigate-in-page` on the overlay window only, checks the origin, accepts only those two forms (`parseWindowAction`) and forwards `{ type: 'menu' } | { type: 'pick', index }` to the controller on `overlay:window-action`. OBS Browser Source pages never have the buttons (no `win=1`) and nothing listens to their hash.

## "▶ Chạy thử"

Starts the selected game and turns on the demo bot so the preview/window show a live round before going on air. **■ Dừng chạy thử** stops the bot and discards the round.

## Preview in the app

The **Overlay OBS** panel embeds the exact overlay URL in a scaled, sandboxed iframe over a fake video background, so the streamer sees what viewers will see without looking at OBS.

## Data flow and security

- React builds an `OverlayState` (public display data only: titles without extension, nicknames, points, timer) and sends it via `overlay:update` IPC.
- Game texts in the state are already in the app language; `OverlayState.lang` (`vi` / `en`) tells the overlay page which language to use for its own labels (leaderboard, “finished”, window bar).
- `electron/overlay-server.ts` keeps the latest snapshot and pushes it over Server-Sent Events (`/overlay/stream`), with a 15 s heartbeat. Browsers reconnect automatically.
- The server listens on `127.0.0.1` only, rejects non-loopback `Host` headers (DNS rebinding), allows only `GET`/`HEAD`, serves a fixed path whitelist, and sends a strict CSP on the HTML.
- The overlay renders all text through React (escaped). Never switch to `innerHTML` for viewer names.
