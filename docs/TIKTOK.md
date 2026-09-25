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
| Không kết nối được tới TikTok / phản hồi quá lâu | `ENOTFOUND`, timeout | Check the network, VPN or firewall; retry. |

`Euler: no permission` in the details is normal and not the cause: it is only the last fallback. Usernames are checked before connecting (letters, digits, `_`, `.`; 2–24 characters).
