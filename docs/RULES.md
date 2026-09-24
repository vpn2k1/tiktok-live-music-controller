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
| Đánh boss | like, gift | like = 1 dmg, gift = `giftDamage` × count; HP 0 ends round and shows the reward text | +1 attacker, +2 if killed, +5 final blow |
| Nối chữ | chat | 2-syllable word starting with the previous word's last syllable (exact tone), no repeats; each valid word resets the turn timer; mode `syllable` (phonotactic check) or `dictionary` (imported .txt) | +1 per word |
| Quiz A/B/C/D | chat `a`–`d` (any case) | **Bộ câu hỏi có sẵn** `preset`: *Tiếng Anh – dễ* (default, 149 beginner questions: colors, numbers, animals, everyday words, am/is/are, a/an, greetings), *Tiếng Anh – ngữ pháp & từ vựng* (~200), *Kiến thức chung (tiếng Việt)* (~300); **Câu hỏi riêng** (textarea/file) is used instead when it has valid lines. A round is `count` questions; first answer to each is final; counts hidden until the reveal | speed points (see *Question series*) |
| Đoán số | chat digits | secret 1..max; overlay narrows the range (cao hơn/thấp hơn); out-of-range guesses ignored | `points` to the winner |
| Ai nhanh tay | chat | first exact match (case/space-insensitive, tone-sensitive) of the shown word wins | `points` to the winner |
| Team battle | chat `A`/`B`, like, gift | join once (no switching); members' likes +1, gifts +`giftPoints`; loser penalty text | +1 contributor, +2 winning team |
| Đua vịt | like, gift | first like joins; like = 1 step, gift = `giftBoost`; first to the line wins, else furthest | top 3: +5/+3/+2, others +1 |
| Vòng quay thử thách | gift (any or named) | each gift unit queues a spin (max 20); wheel lands on a random challenge for the streamer; no timer | +1 per spin |

## Newer fun games

All of them are pure modules in `src/game/games/`; Vietnamese content lives in `src/game/content/vietnamese.ts` and every bank is editable / importable (⬇ File mẫu, 📂 Nhập file). Series games (many questions per round, reveal, final ranking) are marked *series*.

| Game | Viewers type | Rules | Points |
|---|---|---|---|
| 🔔 Rung chuông vàng (`rungChuong`) | `a`–`d` | *series* on the quiz banks (presets like Quiz). Everyone joins on question 1; afterwards only survivors may answer, and a wrong or missing answer knocks you out. Ends when one survivor of a real crowd is left, nobody is left, or the questions run out | speed points per question + `winPoints` for every survivor |
| ⭕ Đúng hay Sai (`dungSai`) | `đúng`/`sai`, `d`/`s`, `true`/`false`, `t`/`f`, `a`/`b`, `1`/`2` | *series*; first answer final; banks: English (easy, default) / Vietnamese; line `statement \| đúng` | speed points |
| ✊ Kéo Búa Bao (`keoBuaBao`) | `búa`/`bao`/`kéo`, ✊✋✌️, `1`/`2`/`3`, rock/paper/scissors | *series* of `count` hands vs the house (random); búa > kéo > bao > búa; the winning hand lights up | win: speed points; draw: `drawPoints` |
| 🤝 Phe nào đông hơn? (`pheDong`) | `a`/`b`, `1`/`2` | *series* of A/B polls; counts hidden until the reveal; the bigger side scores (guess the crowd) | majority `maxPoints`, tie `tiePoints` to everyone |
| 🎯 Ước lượng (`uocLuong`) | a number (`1.440`, `1,440`, `1440`) | *series*; one guess per question; closest first, ties to the faster guess | 1st/2nd/3rd closest: 100% / 60% / 30% of `maxPoints`, exact ×1.5 |
| 🖼️ Đuổi hình bắt chữ (`duoiHinh`) | the Vietnamese word (accents/spaces optional) | *series*; big emoji puzzle + hint + one dot per letter | speed points |
| 🧠 Câu đố vui (`caudo`) | the answer (accents/spaces optional, `/` alternatives) | *series*; folk riddles and brain teasers | speed points |
| 💣 Gỡ bom (`goBom`) | a wire number (`3`, `!cut 3`) | `wires` numbered wires, one is the bomb; one cut per viewer; cutting every safe wire defuses it, the bomb wire ends the round with a BOOM | safe cut: `maxPoints` × (1 + 0.5 per earlier safe cut); defuse bonus `defusePoints` split among cutters |
| 🃏 Lật hình ghép cặp (`latHinh`) | two numbers (`3 8`, `3-8`, `!lat 3 8`) | `pairs` emoji pairs face down; a pair stays open, a miss shows for 1.8 s then flips back; ends when all pairs are found | `points` per pair |
| ❤️ Thử thách tim (`thuThachTim`) | likes, gifts (= `giftLikes` likes each) | the room fills a heart meter; each milestone (`số tim \| thử thách`) unlocks a streamer challenge; the last milestone ends the round | every liker: likes ÷ `likesPerPoint` (top 20) |

The "Vote bài tiếp theo" game was removed (music stays controllable by the music rules).

## Japanese 🇯🇵 and Chinese 🇨🇳 games

`src/game/games/languageGames.ts`, content in `src/game/content/japanese.ts` / `chinese.ts`, library groups "Tiếng Nhật 🇯🇵" / "Tiếng Trung 🇨🇳". They reuse the English engines, so they are *series* games (speed points, reveal, final ranking) or memory / A–D quiz games, with ⬇ File mẫu / 📂 Nhập file for every bank.

- Viewers may answer with a Japanese / Chinese keyboard or in Latin letters. `foldJapanese`: full-width → half-width, katakana = hiragana, romaji macrons ignored (kōhī = kohi). `foldChinese`: pinyin tone marks, tone numbers or none (nǐ hǎo = ni3hao3 = nihao), `v` = `ü`. Spaces and punctuation never matter; `/` in a bank adds accepted spellings (shi/si, tsu/tu…).
- **Đọc Kana** (`docKana`): big kana → type romaji (or the kana). Presets: Hiragana (46), Katakana (46), short kana words; own lines `kana | romaji[/alt] | nghĩa`.
- **Từ vựng tiếng Nhật** (`tuVungNhat`): Vietnamese meaning → the word in kanji, kana or romaji. Bank `漢字 | かな/romaji… | nghĩa` (63 words).
- **Quiz tiếng Nhật** (`quizNhat`) / **Quiz tiếng Trung** (`quizTrung`): the A–D quiz engine (answers a–d) with ~40 beginner questions each.
- **Ghép cặp Kana** (`ghepKana`) / **Ghép cặp chữ Hán** (`ghepHan`): the memory game with two different faces per pair (あ ↔ a, 猫 ↔ mèo); own pairs `mặt A | mặt B`. The generic memory engine (`createMemoryGame`) also powers "Lật hình ghép cặp" (emoji pairs).
- **Đọc Pinyin** (`docPinyin`): big characters → pinyin. **Từ vựng tiếng Trung** (`tuVungTrung`): Vietnamese meaning → characters or pinyin. Both use the same bank `汉字 | pinyin | nghĩa` (64 HSK 1 words).
- Answer games may declare `presets` (built-in banks in a select; the textarea then holds only the streamer's own lines) — used by Đọc Kana.

## Ô chữ 🔠 (Olympia-style crossword)

`src/game/games/crossword.ts`, puzzles in `src/game/content/crossword.ts` (15 English puzzles with Vietnamese clues, 8 Vietnamese). One puzzle per round.

- Puzzle line: `KEYWORD : hint | clue = answer | clue = answer | …` — one row per keyword letter (2–10); row *i*'s answer must contain keyword letter *i* and the rows are aligned on it (the highlighted column). Answers are compared without accents, spaces or case ("Hà Nội" = "hanoi", "ice cream" = "icecream").
- Rows are asked in order, each with its own countdown (`seconds`). Correct answers score speed points (`maxPoints`, "all" or "first" scoring like the answer games) and open the row. A row nobody answers is either still shown (default, easier) or kept closed like Olympia (`revealMissed`).
- The keyword can be typed at any time (also `!key WORD`): the first correct guess ends the round with `keywordPoints × (1 − 0.5 × open rows / rows)` — full points before any row is open, half when all are. After the last row there is a final keyword stage (`keywordSeconds`). Wrong guesses cost nothing.
- Presets: *Từ tiếng Anh, gợi ý tiếng Việt* (default) or *Kiến thức tiếng Việt*; **Ô chữ riêng** (textarea / file, sample via ⬇ File mẫu) replaces them when valid.
- Overlay: the grid (numbered rows, key column, active row outlined) plus the 🔑 keyword row; the app panel shows a compact text grid.

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

- Unscramble / Dịch nhanh / Emoji / Sentence share one factory (`answerGames.ts`) with `scoring`: **all** (default: everyone correct before the deadline scores by speed) or **first** (the puzzle closes at the first correct answer). Wrong answers are ignored and never use the cooldown.
- Items/questions/categories don't repeat until the whole bank has been used.
- Hangman: a round is `count` words (default 5). Each revealed letter gives its finder 10% of `maxPoints`; the solver gets speed points; wrong letters cost a life, wrong whole-word guesses don't (so trolls can't burn lives). A word closes when solved, out of lives or out of time.
- Built-in banks: 149 beginner English quiz questions (`content/english-easy.ts`), ~300 Vietnamese quiz questions (`content/quiz-vi.ts`: capitals, geography, history, science, math, proverbs, culture, sports, tech), ~200 English quiz questions, ~270 words (Unscramble, Dịch nhanh, Hangman), ~150 emoji puzzles, 140 sentences, 40 Name It categories (`content/english.ts`). Every bank field has **📂 Nhập từ file .txt** (up to 500,000 characters, ~5,000+ lines). No API key or network is needed. Tests check that every built-in line parses, has no duplicate and fits its field.

## Question series (Quiz, English Quiz, Unscramble, Dịch nhanh, Emoji, Sentence Builder, Hangman)

`src/game/series.ts`. Settings: **Số câu mỗi lượt** `count` (1–100), **Giây mỗi câu** `seconds`, **Điểm tối đa mỗi câu** `maxPoints` (default 100), **Giây xem đáp án** `reveal` (default 4).

1. Question *n* is shown with its own countdown. Answers are recorded with the time since the question started.
2. At the deadline (or at once in "first" mode / when Hangman is solved) the answer is revealed for `reveal` seconds with the fastest correct answers (name, time, points) and, for A–D, the vote counts. Points go to the session leaderboard immediately.
3. The next question starts; after the last one the round ends with the **round ranking** (top 5 by points in this round). **Chốt kết quả** mid-question scores the answers so far; **Huỷ** stops the round but points from questions already revealed stay on the leaderboard.

Speed points: `round(maxPoints × (1 − 0.5 × answerTime / seconds))` — instant answer = 100, at the deadline = 50, never below 1. The session leaderboard (`!rank`, overlay 🏆) is the sum over all rounds and games until **Reset**.

## Big rooms (throughput)

- Main batches TikTok events every 100 ms (`src/shared/eventBatch.ts`): one IPC message and one React render per batch. Per batch it keeps every gift/follow, merges likes per viewer, and processes up to 2,000 comments (20,000/s) and 20 joins; extra comments are counted and shown as "⚠ phòng quá đông: bỏ qua N comment" in the LIVE log. TikTok itself only delivers a sample of comments for very large rooms.
- Session leaderboard (`src/game/scoreboard.ts`): adding points O(log P), top list kept incrementally, `!rank` O(log P) — tested with 1,000,000 viewers.
- Per-question answers are an append-only `AnswerBook` written in `HandleResult.commit` (runs only when the result is applied, i.e. not for rate-limited viewers) — tested with 200,000 answers to one question. Overlay popups/sounds stop after the first 5 correct answers per question.
- The per-viewer cooldown (`CommandRateLimiter`) is O(1) per check and only remembers viewers from the last two cooldown windows.
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

Panel "🎮 Chọn & chuyển game" in the Game tab (`src/game/autoplay.ts` pure logic, `src/game/useAutoPlay.ts` timers). Settings persist in `localStorage` (`autoplay-settings`).

- **Thời lượng LIVE** (`liveMinutes`, 0–720, 0 = no limit): counted from "▶ Bật tự động" (or from connecting, if "Tự bật khi kết nối TikTok" is on). 5 minutes before the end the overlay announces it; at the end the running round is finished and autoplay stops. The app never ends the TikTok LIVE itself. While running, the typed value applies from the next start; use "+15 phút LIVE" to extend.
- **Mỗi game** (`switchMinutes`, 1–180): when a game's time is up its round is finished (points awarded, result shown), and after the round gap the next game starts: voted in the game list when "Viewer chọn game" is on, otherwise the next one in the rotation.
- **Nghỉ giữa vòng** (`roundGapSeconds`, 3–300): inside a game's time, a finished round is replayed after this pause.
- **Thứ tự**: sequential (library order) or random, within the active game group (below). A game that can't start (e.g. vote without music) is skipped; if none can start, autoplay stops.
- A game the host starts manually becomes the current game; Chốt/Huỷ just leads to the next round after the gap.

### Gift → switch game

- Exact gift name (case-insensitive, default `Rose`) summed across viewers until `giftCount` (default 5), then the game switches (to the game list when it's on, else the next rotation game). Works with or without autoplay; the round result is shown first (round gap with autoplay, 10 s without it when the list is on).
- After a switch, matching gifts are ignored for `giftCooldownSeconds` (default 30) so the new game gets played.
- The running game still sees the gift first (e.g. boss damage, fan points). The overlay shows a "🎁 Tặng N <gift> · đổi game" chip while it's on. The reward is only a game change, never a prize.

### Run one or several games

In "② Chọn game": tick games with ✓ / ＋ on the cards (the active group), then **▶ Chạy N game đã chọn** (starts autoplay; **⏹ Dừng chạy tự động** stops it). One ticked game = that game repeats. How they run comes from the "🎮 Chọn & chuyển game" panel:
- **Đổi game khi** `switchBy`: **Chơi xong số lượt** (default; `roundsPerGame` 1–50, a round = one question set or one match, never cut short) or **Hết thời gian mỗi game** (`switchMinutes`, the running round is finished when time is up).
- With "Viewer chọn game" on, viewers vote the next game among the ticked ones; otherwise the next one follows the order (sequential/random). Gift switch and `!doigame` end the current game in both modes.

### Bank files (điền chữ, chọn đáp án…)

Every bank field (Quiz, English Quiz, Unscramble, Dịch nhanh, Emoji, Sentence Builder, Hangman, Name It, Ai nhanh tay) has:
- **⬇ File mẫu**: saves a sample `.txt` (UTF-8 with BOM, opens in Excel) through a save dialog; `#` lines explain the columns.
- **📂 Nhập file**: `.txt` with `|` columns, `.csv` (comma or semicolon; quoted cells ok; a `|` inside a cell becomes `/`), or tab-separated rows pasted from a spreadsheet. `#` comments and blank lines are dropped (`src/game/bankFile.ts`). Import replaces the bank (up to the field limit).
- A live check under the field: "✅ N dòng dùng được · ⚠ M dòng sai mẫu, sẽ bỏ qua: dòng …" (`GameDefinition.checkBank`).
- Quiz answer cell: letter A–D **or** the correct answer copied as text.
- **Thứ tự câu hỏi** (series games): **Ngẫu nhiên** (no repeats until the bank is used) or **Đúng thứ tự trong ngân hàng / file** (each round continues where the last one stopped, wrapping at the end).

### Nhóm game (game groups)

Set up in "② Chọn game" before going LIVE: `groups` + `activeGroupId` in `autoplay-settings` (validated by `normalizeGroups`).

- Starter groups: "Giải trí 🎉" (fun games), "Tiếng Anh 🇬🇧" (English games), "Tất cả game" (always every game, new ones included; its ✓ buttons are locked). "＋ Nhóm mới" (max 12) starts with the selected game; rename in the text box, "Xoá nhóm" (the last group can't be deleted).
- The ✓ / ＋ button on each game card adds/removes it from the active group (a group keeps at least one game). Cards outside the group are dimmed; cards inside show their number — the number viewers type in the list (library order).
- Only the active group's games are shown and votable in the game list and rotated by autoplay. Changing the group (or its games) while the list is open refreshes it and restarts the votes, since numbers change. The streamer can still start any game manually (▶ Bắt đầu, `!start <name>`).
- Old settings with a rotation checklist (`gameIds`) become a "Nhóm của tôi" group.

### Viewer chọn game (game list / lobby)

`src/game/lobby.ts` (pure) + `useAutoPlay`. On by default (`lobbyEnabled`).

- Whenever no game is running (app start, a round ended and hid, a switch), the overlay game card — including the standalone game window — shows **🎮 Chọn game · <group name>**: every game of the active group, numbered 1..n in library order (same numbers all stream). Keep groups to ~10 games so the list fits the overlay.
- Votes: comment `2`, `#2`, `!game 2` or `!chon 2` (whitelist, in range only). Every accepted comment is 1 vote; the per-viewer cooldown applies, so more comments = more votes but no flooding. While the list is shown these comments are consumed (music "Comment số → chọn bài" doesn't fire).
- Gifts (any gift) add `lobbyGiftVotes` (default 5) votes per gift unit to the gifter's last chosen game, or the leading game if they haven't voted. 0 = gifts don't vote. While the list is shown the "gift → switch game" gift only votes.
- Countdown `lobbySeconds` (5–300, default 20) starts with the first vote; with autoplay on it starts right away and, with no votes, a random listed game is played. The game with the most votes starts (ties random; games that can't start are skipped).
- App control: "✅ Chốt ngay" (start the leader now). Starting any game manually (▶ Bắt đầu, `!start`) closes the list.

### `!doigame` (switch game by command)

- Also `!đổi game`, `!skipgame`, `!doi` (fixed whitelist). Only while a game is running.
- Viewers: counts distinct viewers during the current round (cooldown applies); at `switchCommandVotes` (default 5) the round is finished and the next game is chosen (game list or rotation). Each vote is announced on the overlay (`2/5`). 0 = viewers can't switch.
- Streamer / moderators / app test tools: switch at once.
- The overlay shows a "🔄 !doigame · N người gõ là đổi game" chip during games.

## Rule security
Never change these rules so arbitrary comment text becomes code, a shell command, a filesystem path, or a network URL.
