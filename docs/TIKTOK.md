# TikTok LIVE integration

The app uses `tiktok-live-connector` in `electron/main.ts`.

Handled events:
- `WebcastEvent.CHAT`
- `WebcastEvent.GIFT`
- `WebcastEvent.LIKE`
- `WebcastEvent.FOLLOW` → `follow`
- `WebcastEvent.MEMBER` (viewer joined the room) → `join`

The simulate IPC only accepts `chat`, `gift`, `like`, `follow`, `join`.

Events reach the renderer in batches (`tiktok:events`, every 100 ms, see `src/shared/eventBatch.ts`): comments are capped at 2,000 per batch and joins at 20 (the rest are counted in `dropped`), likes are merged per viewer, gifts and follows are never dropped, and simulated events always pass.

Gift streaks: for streakable gifts (`giftDetails.giftType === 1`) the connector fires repeatedly with a growing `repeatCount`, then once more with `repeatEnd: true`. Main forwards only the final event, so `count` is the streak total and rules/games never double count.

Normalized event example:

```json
{
  "type": "chat",
  "user": "viewer123",
  "nickname": "Viewer",
  "comment": "!next",
  "at": 0
}
```

Every event also carries the viewer's display name (`nickname`), username (`user`) and, when TikTok sends one, `avatar`: a profile picture URL taken from `user.profilePicture` (a ~100 px size when listed) and kept only if it is an HTTPS image on TikTok's CDN (`src/shared/avatar.ts`). The renderer remembers pictures per name (`src/hooks/useAvatars.ts`) and sends the overlay only those of viewers on screen (`OverlayState.avatars`, at most 32 per update); the overlay shows them on the leaderboard, rows, race lanes, effects and follow / join bubbles, falling back to a colored initial when a picture is missing or fails to load.

The connector is unofficial. Connection/event behavior may change when TikTok changes Webcast internals.

## Connection errors (Kết nối báo lỗi)

To find a LIVE, `tiktok-live-connector` looks up the room ID in three places: the `tiktok.com/@user/live` page, TikTok's `api-live` endpoint, then Euler Stream (a paid signing service; without an API key it always answers "lack of permission"). When all three fail it throws only *"Failed to retrieve Room ID from all sources."*. `src/shared/tiktokErrors.ts` reads each source's reason (`error.config.requestErrs`) and the app shows one cause plus the details:

| App says | Typical detail | What to do |
|---|---|---|
| Không tìm thấy tài khoản TikTok này… | `API: user_not_found (19881007)` | Type the **username** (the part after `@` in `tiktok.com/@…`), not the display name. A pasted `tiktok.com/@name/live` link also works. |
| Tài khoản chưa LIVE… | `The requested user isn't online` | Start the LIVE first (phone or LIVE Studio), then **Kết nối** again. |
| TikTok đang chặn hoặc bắt xác minh (captcha)… | `HTML: Failed to extract the SIGI_STATE HTML tag, you might be blocked` | Try another network (4G / other Wi-Fi), toggle the VPN, or wait a few minutes. |
| Không lấy được phòng LIVE… | `API: Invalid response…` | Check the username and that the LIVE is on and not restricted (18+, private, region-limited). |
| Máy chủ Euler Stream … đang lỗi | `[Sign Error] … sign server status 500 … illegal web id` | After the room is found, the connector asks Euler Stream to sign the LIVE WebSocket URL. The app retries with a new connection (3 attempts, 6 s apart; with an Euler Stream key, 6 attempts 2 s apart). Measured in Oct 2026 it fails about half the time in every version (2.4.0, 2.4.4, 2.5.0) — a server-side problem, not a library bug. Keep 2.5.0: 2.4.x crash on rate limits (`Cannot read properties of undefined (reading 'retry-after')`). An Euler Stream API key raises the limits but does not stop the 500s. |
| TikTok không cho vào phòng LIVE … (after a moment of *connected*) | close code 1000, `payload_handler_im_enter_room` | TikTok refused the anonymous "enter room" message. Main cause: a LIVE limited to chosen viewers / friends — the app is a logged-out viewer, so the LIVE must be **Public**. Otherwise TikTok may be flagging the network (captcha on tiktok.com after many connections): wait 15–30 minutes or switch network. |
| Kết nối quá nhiều lần … | `[Rate Limited] (rate_limit_account_minute)` | Euler Stream's free tier limits connections per minute: wait 1–2 minutes before Kết nối again. |
| Không kết nối được tới TikTok / phản hồi quá lâu | `ENOTFOUND`, timeout | Check the network, VPN or firewall; retry. |

`Euler: no permission` in the details is normal and not the cause: it is only the last fallback.

### Euler Stream API key

Optional; it raises Euler Stream's limits (fewer *Kết nối quá nhiều lần* errors) and lets the room-ID fallback work. Get one at eulerstream.com, then paste it in **⚙️ Cài đặt → 🔑 Kết nối TikTok** (or in the connection popup: click the status pill at the top → **🔑 Key Euler Stream**). `electron/signKey.ts` keeps it in main, encrypted with the OS like the AI keys (`tiktok-sign.json` in the app data folder); the renderer only sees whether a key is set and its last 4 characters. A new key applies on the next **Kết nối** (main resets the connector's cached Euler client). The `SIGN_API_KEY` environment variable still works and wins over the saved key (e.g. `SIGN_API_KEY=… npm run dev`). Usernames are checked before connecting (letters, digits, `_`, `.`; 2–24 characters).
