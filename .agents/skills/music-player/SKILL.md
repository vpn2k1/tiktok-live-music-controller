# Skill: Music player

Player ownership:
- React owns playlist and `HTMLAudioElement`.
- Electron main owns filesystem access.
- Selected files are exposed as `media://track/<token>`, never absolute paths.

When adding playback actions:
- keep track selection bounded to playlist length;
- handle empty playlist;
- reset like/gift progress when a track changes;
- preserve `onEnded → next` behavior;
- do not load remote media from viewer input.
