# TikTok LIVE integration

The app uses `tiktok-live-connector` in `electron/main.ts`.

Handled events:
- `WebcastEvent.CHAT`
- `WebcastEvent.GIFT`
- `WebcastEvent.LIKE`
- `WebcastEvent.FOLLOW` → `follow`
- `WebcastEvent.MEMBER` (viewer joined the room) → `join`

The simulate IPC only accepts `chat`, `gift`, `like`, `follow`, `join`.

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

The connector is unofficial. Connection/event behavior may change when TikTok changes Webcast internals.
