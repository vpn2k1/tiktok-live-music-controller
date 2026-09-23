# Rules

Rules currently live in `src/App.tsx` inside `processLiveEvent()` plus the timer effect.

## Included rules

### Time → next
When `currentTime >= autoNextSeconds`, select the next playlist item.

### Comment command → next
Exact case-insensitive match of `commentNextCommand`, default `!next`.

### Comment number → select
A comment containing digits only maps 1-based playlist position to a track.

### Comment search → select
Default syntax: `!song <text>`. Search is limited to the already-loaded local playlist filename.

### Likes → next
Accumulate `likeCount`; reset to zero after reaching the configured threshold and changing track.

### Gift → next
Gift name must exactly match the configured gift name case-insensitively. Repeat count accumulates to the threshold.

## Rule security
Never change these rules so arbitrary comment text becomes code, a shell command, a filesystem path, or a network URL.
