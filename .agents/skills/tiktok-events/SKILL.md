# Skill: TikTok events

TikTok connector code belongs in `electron/main.ts`.

For each new event:
1. Listen using `WebcastEvent.*` or a documented control event.
2. Normalize to a small JSON-safe object.
3. Send only needed fields through `tiktok:event` IPC.
4. Do not send the entire raw event unless debugging is explicitly requested.
5. Add a simulated version if practical.
6. Update `docs/TIKTOK.md`.

Remember the connector is unofficial and fields can change across versions; use defensive fallbacks for optional fields.
