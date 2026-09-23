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
| `size` | `s`, `m`, `l`, `xl` | `xl` |
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
| Leaderboard (top 5) | at least one viewer has points |
| Now playing | a track is selected |
| Alerts (follow/join greeting) | a greeting is being shown (3.5 s each) |

The game card renders a generic `OverlayGameView` built by the running game: `headline` (big text), `hint`, `rows` (optional badge / bar / value / highlight), `progress` (HP bar), `teams` (tug-of-war), `race` (lanes) and `wheel` (animated SVG wheel; only live spins animate, a freshly loaded overlay jumps to the result).

All enabled widgets stack in one column (alerts, game, leaderboard, now playing) placed by position/size; the column is designed at 460 px and zoomed to the chosen size, so text scales with it.

## Look & effects

- Each game has an accent color (card glow, header strip, countdown ring) and a "how to join" chip row (💬 comment / ❤️ likes / 🎁 gifts) built from its command list.
- Viewers get a colored initial badge (stable color per name) on leaderboards, race lanes, winners and popups; the leaderboard shows 🥇🥈🥉.
- Game-specific visuals: letter tiles (Unscramble, Hangman, Ai nhanh tay), Kahoot-style colored answers (quiz, vote), a floating boss that flashes when hit, a tug-of-war rope, colored race lanes with a crown for the leader, a glowing spin wheel.
- Games emit one-shot effects (`OverlayEffect`: start, hit, score, correct, wrong, win, lose). The overlay shows floating numbers, shakes the card on hits, and full-frame banners with canvas confetti on wins; effects are played once per id and are not replayed when OBS reloads the page.
- The app plays matching synthesized sounds plus a tick in the last 5 seconds (toggle: Cài đặt chung → 🔊 Âm thanh game). OBS captures them with the app's audio.

## Standalone game window (Window Capture)

**🪟 Mở cửa sổ game** opens a separate Electron window showing the same overlay (layout/widgets from the panel) with a solid background: green `#00b140` for OBS *Chroma Key*, dark, or transparent. In OBS add **Window Capture → "Game Overlay"**. Resize freely: the window keeps the frame's aspect ratio and zooms the frame to fit (it opens at up to 80% of the screen). Its title stays "Game Overlay" so the OBS source keeps working when you change the frame. The window closes with the main app.

Security: the renderer only sends `{ layout, widgets, background }`; main validates them and builds the URL itself. The window is sandboxed, has no preload, denies `window.open` and blocks navigation outside the overlay origin (and the Vite origin in dev).

## "▶ Chạy thử"

Starts the selected game and turns on the demo bot so the preview/window show a live round before going on air. **■ Dừng chạy thử** stops the bot and discards the round.

## Preview in the app

The **Overlay OBS** panel embeds the exact overlay URL in a scaled, sandboxed iframe over a fake video background, so the streamer sees what viewers will see without looking at OBS.

## Data flow and security

- React builds an `OverlayState` (public display data only: titles without extension, nicknames, points, timer) and sends it via `overlay:update` IPC.
- `electron/overlay-server.ts` keeps the latest snapshot and pushes it over Server-Sent Events (`/overlay/stream`), with a 15 s heartbeat. Browsers reconnect automatically.
- The server listens on `127.0.0.1` only, rejects non-loopback `Host` headers (DNS rebinding), allows only `GET`/`HEAD`, serves a fixed path whitelist, and sends a strict CSP on the HTML.
- The overlay renders all text through React (escaped). Never switch to `innerHTML` for viewer names.
