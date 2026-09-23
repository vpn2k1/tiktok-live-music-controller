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

### Anti-spam (per-viewer cooldown)
`commentCooldownSeconds` (default 2, range 0–60, 0 = off). A viewer can trigger at most one chat command per window. Only comments that match a command consume the cooldown, so normal chatting never blocks a viewer. Likes and gifts are not rate-limited.

## Games

Each game is a pure plugin in `src/game/games/` (see `src/game/types.ts`), listed in `src/game/registry.ts` and driven by `src/game/useLiveGames.ts`.

- The streamer picks a game in the **Game** panel (locked while a round runs), edits its settings, clicks **Bắt đầu**. **Chốt kết quả** ends early; **Huỷ** discards the round.
- Phases: `idle` → `running` (optional timer) → `ended` → back to `idle` after 10 s.
- The running game sees every event first. Comments it *consumes* (its own commands) count against the per-viewer cooldown and skip the music rules; likes/gifts still reach the music rules.
- Points go into one session leaderboard (keyed by TikTok `uniqueId`) until **Reset**.
- Settings are validated/clamped from each game's `settings` list and saved in `localStorage` (`game-configs`).

| Game | Input | Rules | Points |
|---|---|---|---|
| Vote bài tiếp theo | chat `1`–`3` | 3 random tracks; one ballot per viewer (changeable); digit comments are ballots while voting; winner plays; ties random | +1 vote, +2 backing winner |
| Đánh boss | like, gift | like = 1 dmg, gift = `giftDamage` × count; HP 0 ends round and shows the reward text | +1 attacker, +2 if killed, +5 final blow |
| Nối chữ | chat | 2-syllable word starting with the previous word's last syllable (exact tone), no repeats; each valid word resets the turn timer; mode `syllable` (phonotactic check) or `dictionary` (imported .txt) | +1 per word |
| Quiz A/B/C/D | chat `A`–`D` | question bank lines `Q | A | B | C | D | correct`; first answer is final; counts hidden until reveal; questions don't repeat until all are asked | `points` if correct, +1 fastest |
| Đoán số | chat digits | secret 1..max; overlay narrows the range (cao hơn/thấp hơn); out-of-range guesses ignored | `points` to the winner |
| Ai nhanh tay | chat | first exact match (case/space-insensitive, tone-sensitive) of the shown word wins | `points` to the winner |
| Team battle | chat `A`/`B`, like, gift | join once (no switching); members' likes +1, gifts +`giftPoints`; loser penalty text | +1 contributor, +2 winning team |
| Đua vịt | like, gift | first like joins; like = 1 step, gift = `giftBoost`; first to the line wins, else furthest | top 3: +5/+3/+2, others +1 |
| Vòng quay thử thách | gift (any or named) | each gift unit queues a spin (max 20); wheel lands on a random challenge for the streamer; no timer | +1 per spin |

## English games (nhóm "Tiếng Anh 🇬🇧")

For English-teaching channels. Answers are compared after `normalizeEnglish` (lowercase, apostrophes/punctuation removed, spaces collapsed). Only ASCII comments count as answer attempts, so Vietnamese chat is never swallowed or rate-limited. Default banks live in `src/game/content/english.ts` and are editable per game in the app.

| Game | Screen shows | Viewer types | Bank line format |
|---|---|---|---|
| Unscramble | shuffled letters + Vietnamese meaning | the English word | `english[/alias] | nghĩa` |
| Dịch nhanh | Vietnamese word + first-letter mask | the English word (any alias) | `english[/alias] | nghĩa` |
| Emoji Guess | emoji puzzle (🧈🪰) + mask | `butterfly` | `emoji | answer[/alias] | gợi ý` |
| Sentence Builder | shuffled words `go / I / school / to` | the sentence (case/punctuation ignored) | `sentence | nghĩa` |
| Hangman | `A _ P L _`, meaning, lives bar | one letter, or the whole word | `english | nghĩa` (single words, 3–16 letters) |
| Name It! | category + hidden answer slots | any answer in the category (plural ok) | `Category | a[/alias] | b | …` (2–12) |
| English Quiz | grammar/vocab question | `A`–`D` | same as Quiz |
| Word Chain (EN) | current word | word starting with its last letter | — (optional imported word list) |

- Unscramble / Dịch nhanh / Emoji / Sentence share one factory (`answerGames.ts`) with `scoring`: **first** (first correct wins, round ends) or **all** (everyone correct scores `points`, fastest +1).
- Items/questions/categories don't repeat until the whole bank has been used.
- Hangman: each correct letter +1 to its finder, solving the word +`points`; wrong letters cost a life, wrong whole-word guesses don't (so trolls can't burn lives).
- Name It!: +1 per revealed slot; the round ends early when all slots are found.
- Word Chain (EN): `letters` mode accepts plausible words (letters only, has a vowel, no triple letters); `dictionary` mode needs the word in the built-in list or an imported `.txt` word list.

## Chat commands

Global commands (whitelist in `src/game/chatCommands.ts`, toggle "Lệnh chat" in the app). All share the per-viewer cooldown.

| Command | Who | Effect |
|---|---|---|
| `!help` (`!huongdan`) | everyone | overlay shows the running game's commands |
| `!rank` (`!diem`) | everyone | overlay shows the viewer's points and rank |
| `!start` | streamer/mod | start the selected game |
| `!start <name>` | streamer/mod | select and start a game by id/alias (`quiz`, `hangman`, `doanso`, `team`…); accents/case ignored |
| `!stop` (`!chot`) | streamer/mod | finish the round now |
| `!cancel` (`!huy`) | streamer/mod | discard the round |
| `!games` | streamer/mod | overlay lists game names for `!start` |

Streamer/mod = the connected TikTok account, a username in the moderator list, or an event from the app's own test tools (main marks those `simulated: true`; real TikTok events never carry it). A non-fatal connector error keeps the status "connected", so it can't open host commands to viewers.

Only accepted answers count as commands for the cooldown: wrong answers and ordinary chat during a round are ignored, so they never block a viewer's next real answer.

Game commands (only while that game runs): `!vote 2`, `!hit` (boss, `chatDamage`), `!guess 42` (guess number / hangman), `!join`, `!join a|b`, `!a`, `!b` (team battle; bare `!join` picks the smaller team), `!join`, `!run` (race, `chatStep`), `!spin` (wheel, streamer/mod only), `!ans …` (English answer games / Name It). Plain forms (`2`, `A`, `apple`) keep working.

## Background features (Tính năng nền)

- **Bảng xếp hạng fan** (off by default): comment +`fanChatPoints` at most once per `fanChatCooldownSeconds`; every `fanLikesPerPoint` likes = +1 (remainder carried); each gift unit +`fanGiftPoints`.
- **Chào người mới** (on by default, follows only): overlay toast + short synthesized chime for follows; optional joins. Queue max 5; joins are dropped first so big rooms don't flood the overlay.

## Tự động chuyển game (auto host)

Panel "⏱ Tự động chuyển game" in the Game tab (`src/game/autoplay.ts` pure logic, `src/game/useAutoPlay.ts` timers). Settings persist in `localStorage` (`autoplay-settings`).

- **Thời lượng LIVE** (`liveMinutes`, 0–720, 0 = no limit): counted from "▶ Bật tự động" (or from connecting, if "Tự bật khi kết nối TikTok" is on). 5 minutes before the end the overlay announces it; at the end the running round is finished and autoplay stops. The app never ends the TikTok LIVE itself. While running, the typed value applies from the next start; use "+15 phút LIVE" to extend.
- **Mỗi game** (`switchMinutes`, 1–180): when a game's time is up its round is finished (points awarded, result shown), and after the round gap the next game in the rotation starts.
- **Nghỉ giữa vòng** (`roundGapSeconds`, 3–300): inside a game's time, a finished round is replayed after this pause.
- **Thứ tự / Game trong vòng xoay**: sequential (library order) or random; all games by default. A game that can't start (e.g. vote without music) is skipped; if none can start, autoplay stops.
- A game the host starts manually becomes the current game; Chốt/Huỷ just leads to the next round after the gap.

### Gift → switch game

- Exact gift name (case-insensitive, default `Rose`) summed across viewers until `giftCount` (default 5), then the game switches to the next one in the rotation. Works with or without autoplay (without it, the next game starts right away; with it, the result shows for the round gap first).
- After a switch, matching gifts are ignored for `giftCooldownSeconds` (default 30) so the new game gets played.
- The running game still sees the gift first (e.g. boss damage, fan points). The overlay shows a "🎁 Tặng N <gift> · đổi game" chip while it's on. The reward is only a game change, never a prize.

## Rule security
Never change these rules so arbitrary comment text becomes code, a shell command, a filesystem path, or a network URL.
