# Overlay (OBS / TikTok LIVE Studio)

Viewers only see what the streaming software captures. The app therefore serves a transparent page that you add as a **Browser Source**.

## URL

Build the link in the app's **Overlay OBS** panel: choose 9:16 or 16:9, tick widgets, check the live preview, then **Copy**.

```text
http://127.0.0.1:17321/overlay?layout=portrait&widgets=game,leaderboard,music
```

| Param | Values | Default |
|---|---|---|
| `layout` | `portrait` (1080×1920), `landscape` (1920×1080), `stack` (compact 420 px column) | `stack` |
| `widgets` | comma list of `alerts`, `game`, `leaderboard`, `music` (unknown names ignored) | all |

Set the Browser Source width/height to the canvas size shown in the app. To position widgets freely, add several sources that each use one widget.

- Production (`npm start`): Electron main serves `dist/overlay.html` and `dist/assets/*`.
- Development (`npm run dev`): `/overlay` redirects to Vite (`127.0.0.1:5173/overlay.html`); Vite proxies `/overlay/stream` back to Electron main.

If port 17321 is taken, the panel shows the error instead of a URL.

## OBS setup

1. Sources → **+** → **Browser**.
2. URL: the overlay link. Width/height: 1080×1920 for 9:16, 1920×1080 for 16:9 (460×720 for `stack`).
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

Positions: **16:9** pins alerts top-center, leaderboard top-left, game top-right, now playing bottom-left. **9:16** stacks widgets in one column inside TikTok's safe zone (below ~250 px top bar, left of ~180 px right button column, above ~680 px bottom comment area). The app preview shades those TikTok zones in red.

## Preview in the app

The **Overlay OBS** panel embeds the exact overlay URL in a scaled, sandboxed iframe over a fake video background, so the streamer sees what viewers will see without looking at OBS.

## Data flow and security

- React builds an `OverlayState` (public display data only: titles without extension, nicknames, points, timer) and sends it via `overlay:update` IPC.
- `electron/overlay-server.ts` keeps the latest snapshot and pushes it over Server-Sent Events (`/overlay/stream`), with a 15 s heartbeat. Browsers reconnect automatically.
- The server listens on `127.0.0.1` only, rejects non-loopback `Host` headers (DNS rebinding), allows only `GET`/`HEAD`, serves a fixed path whitelist, and sends a strict CSP on the HTML.
- The overlay renders all text through React (escaped). Never switch to `innerHTML` for viewer names.
