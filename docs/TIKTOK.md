# TikTok LIVE integration

The app uses `tiktok-live-connector` in `electron/main.ts`.

Handled events:
- `WebcastEvent.CHAT`
- `WebcastEvent.GIFT`
- `WebcastEvent.LIKE`
- `WebcastEvent.SOCIAL` (follow is detected from social metadata)

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
