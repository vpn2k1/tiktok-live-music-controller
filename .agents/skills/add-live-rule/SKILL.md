# Skill: Add a LIVE rule

Use when adding `comment/gift/like/follow/time → music action`.

1. Add a clear setting to `DEFAULT_RULES` when user-configurable.
2. Add a pure React control under the Rules panel.
3. Match the normalized event in `processLiveEvent()`.
4. Validate numbers and use exact/explicit command syntax.
5. Route only to existing safe player actions (`nextTrack`, `selectTrack`, play state, volume).
6. Add/update `docs/RULES.md`.
7. Add a simulation button only if it helps test the rule.

Never execute comment text.
