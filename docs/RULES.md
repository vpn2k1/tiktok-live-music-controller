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
| Đua vịt | `a`–`d` answers | question race: a question every `seconds` (built-in bank or own A–D lines); when it closes, every correct answer moves +1 step in answer order (the first correct answer moves first, so it wins a tie at the line); first to `goal` steps (default 7) wins and gets the winner spotlight; after `maxQuestions` the leader wins | +10 per step; top 3: +100/+50/+25 |
| 🎈 Thổi bóng bay (`thoiBong`) | `a`–`d` answers | same question race as Đua vịt (`createQuestionRace` in `race.ts`); each correct answer puffs the viewer's balloon (avatar inside) bigger; the first balloon to reach `goal` puffs (default 6) pops and wins | +10 per step; top 3: +100/+50/+25 |
| 🌱 Trồng cây (`trongCay`) | `a`–`d` answers | question race; each correct answer waters the plant one stage (🌰 → 🌱 → 🌿 → 🪴 → 🌳); first tree to bear fruit 🍎 (`goal`, default 6) wins | same |
| 🚀 Tên lửa lên Mặt Trăng (`tenLua`) | `a`–`d` answers | question race on vertical tracks; each correct answer = 1 level up; first rocket to the Moon 🌕 (`goal`, default 8) wins | same |
| 🏰 Xây tháp (`xayThap`) | `a`–`d` answers | question race; each correct answer adds a brick in the viewer's color; first tower to touch the clouds ☁️ (`goal`, default 8) wins | same |
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
| 🃏 Lật hình ghép cặp (`latHinh`) | two numbers (`3 8`, `3-8`, `!lat 3 8`) | `pairs` emoji pairs face down; a pair stays open, a miss shows for 1.8 s then flips back; every viewer's flip counts at once (up to 4 misses show together, a card in one miss at a time; a correct pair is never blocked by someone else's miss), so a busy room can open every pair in one batch; ends when all pairs are found | `points` per pair |
| ❤️ Thử thách tim (`thuThachTim`) | likes, gifts (= `giftLikes` likes each) | the room fills a heart meter; each milestone (`số tim \| thử thách`) unlocks a streamer challenge; the last milestone ends the round | every liker: likes ÷ `likesPerPoint` (top 20) |

The "Vote bài tiếp theo" game was removed (music stays controllable by the music rules).

## Versus games (đối kháng)

Team games share `src/game/teamRoster.ts`: a side is picked once and can't be switched (`!do` / `!đỏ` / `!red` → Red, `!xanh` / `!blue` → Blue, `!join` → the smaller side; bare "đỏ" / "xanh" also work). A viewer who plays without picking joins the smaller side. Members live in a mutable roster written in `commit` (no per-join copies in big rooms). Shots and team commands need the "!" so everyday chat ("đó", "bạn") never triggers them.

| Game | Viewers type | Rules | Points |
|---|---|---|---|
| 🏰 Thành trì Đỏ – Xanh (`thanhTri`) | `!do`/`!xanh`, `!ban`, `!sua`, likes, gifts | two castles with `hp` each; `!ban` −`shotDamage`, each like −`likeDamage`, each gift −`giftDamage` to the enemy castle; `!sua` +`repair` to your own (up to max). A castle at 0 ends the round; otherwise the side with more HP wins at the end | every contributor +2, winning side +5, winning MVP (most damage/repair) +10 |
| 🆚 Quiz Đỏ – Xanh (`quizDoi`) | `!do`/`!xanh`, `a`–`d` | *series* on the quiz banks (presets / own file like Quiz); each viewer's speed points also go to their side (tug-of-war bar); the side with more points wins | speed points per question + `teamBonus` for every scoring member of the winning side |
| 🤠 Đấu súng miền Tây (`dauSung`) | `!join`, `!ban` | viewers queue (max 50); two duel at a time: after a random `minWait`–`maxWait` s the overlay shows "BẮN!"; the first of the two to type `!ban` wins, shooting before the signal loses, nobody within 4 s = both out. The winner stays on; judged on the signal time (not the 4×/s phase switch) | win `winPoints` + 5 per win in a row; fastest reaction of the round +15 |
| 👑 Vua của đồi (`vuaDoi`) | `!cuop`, gifts | one crown: `!cuop` takes it unless the king is shielded (`grace` s after each take); the king's gift adds `giftShield` s of shield, a challenger's gift takes the crown through the shield | `pointsPerSecond` × seconds held; longest reign +20 |
| 🫧 Đấu trường bóng (`dauTruongBong`) | `!join` / `!thamgia` / `!vao` / `!thamchien`, then `a`–`d` | arena game (`src/game/games/arena.ts`): a waiting time `joinSeconds` (default 40) to join, up to `maxPlayers` (default 30; full = start in 3 s); each player is a small ball with their avatar in a 16:10 field. Each correct answer grows the ball by up to `grow` % (instant answer = full, at the deadline = a third); balls drift 12 % toward the centre and push each other (the smaller moves more); walls are solid; a ball squeezed by a stronger one (bigger, then more points, then joined first) by more than half its radius is pushed out. From question 3 the field shrinks `shrink` % a question (default 3, down to 30 %). Last ball wins; after `maxQuestions` the strongest | speed points per correct answer (max 100); top 3: +200/+100/+50 |
| 🏝 Đảo sinh tồn (`daoSinhTon`) | same | same waiting room; `lives` hearts each (default 3); a wrong or missing answer costs one (nobody loses one when the whole island missed); 0 = falls into the sea; the island shrinks `shrink` % a question (default 4, down to 40 %) and players huddle in. Last survivor wins | same |
| 🪑 Ghế âm nhạc (`gheAmNhac`) | same | arena game (`partyGames.ts`); each question has `chairsFor(n)` chairs (a fifth fewer, at least one fewer); chairs go to correct answers (fastest first), then wrong answers (fastest first), then the silent; no chair = out. Players walk around an outer ring, the chairs stand on an inner one | same |
| 🧊 Băng tan (`bangTan`) | same | each player stands on an ice floe (100 %); heat `12 + 3 × (question − 1)`; a correct answer melts 15–75 % of the heat (faster = less), wrong or silent melts 2 × heat; 0 % = into the water; the floe drawn smaller as it melts | same |
| 🥊 Võ đài loại trực tiếp (`voDai`) | same | players are shuffled into 1-v-1 pairs (odd one = bye 🎟️); only fighters of an undecided pair answer; in a pair the correct answer wins (both correct = faster); both miss = they fight again next question; when every pair is decided the winners are paired again; last one = champion | same |
| 💣 Chuyền bom (`chuyenBom`) | same | `bombsFor(n)` bombs (one per four players) with fuses of 1–3 questions; a holder who answers correctly passes the bomb (fastest first) to the silent, then wrong, then slowest player; each question every fuse burns one; at 0 it explodes and its holder is out; bombs are topped up to `bombsFor(alive)` | same |
| 🏹 Bắn bóng bay (`banBong`) | same | `lives` balloons each (default 3); each correct answer (fastest first) pops one balloon of an opponent not hit yet this question: players who missed first, then the slowest correct answers; 0 balloons = out | same |

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

Game commands (only while that game runs): `!vote 2`, `!hit` (boss, `chatDamage`), `!guess 42` (guess number / hangman), `!join`, `!join a|b`, `!a`, `!b` (team battle; bare `!join` picks the smaller team), `!spin` (wheel, streamer/mod only), `!ans …` (English answer games / Name It). Plain forms (`2`, `A`, `apple`) keep working.

## Background features (Tính năng nền)

- **Bảng xếp hạng fan** (off by default): comment +`fanChatPoints` at most once per `fanChatCooldownSeconds`; every `fanLikesPerPoint` likes = +1 (remainder carried); each gift unit +`fanGiftPoints`.
- **Nhạc nền game** (on by default, "🔊 Âm thanh & nhạc nền game" in Cài đặt chung): music composed in code — no audio files, so no copyrighted songs for TikTok to mute. Pure loops in `src/shared/bgm.ts` (chords, bass, drums, lead per theme), played by `src/hooks/useGameMusic.ts` with Web Audio in the app (OBS captures app audio); what plays when is `musicCue` in `src/game/music.ts`:
  - Themes: 🎉 Vui nhộn (fun games), ❓ Hồi hộp (quiz, golden bell, bomb, estimate, guess number, fastest finger, crossword, English quiz), ⚔️ Đối kháng (versus games, boss), 🎧 Nhẹ nhàng (English / Japanese / Chinese games), 🗳 Chờ chọn game (the game list). "Kiểu nhạc" = match each game (default) or one theme for all.
  - A running round plays its game's theme, 12 % faster with busier drums in the last 30 % of a timer (max 10 s; answer reveals never count); a finished round keeps it at 35 % under the winner's fanfare; the game list plays the lobby theme; nothing on = silence. Theme changes crossfade.
  - With the playlist playing: the game music stops (default) or plays with the playlist at 30 % volume. Volume 0–100 (default 40). "Nghe thử" plays a theme for 10 s.
- **Chào người mới** (on by default, follows only): overlay toast + short synthesized chime for follows; optional joins. Queue max 5; joins are dropped first so big rooms don't flood the overlay.

## Tự động chuyển game (auto host)

Panel "🎮 Chọn & chuyển game" in the Game tab (`src/game/autoplay.ts` pure logic — `hostStep` decides each tick, tested in `tests/host.test.ts` — and `src/game/useAutoPlay.ts` timers). Settings persist in `localStorage` (`autoplay-settings`, `version` 2).

### Endless play (play loop)

- A started game (voted in the list, started by the host, `!start`, autoplay) **plays round after round without end**: each finished round shows its result and the big congratulations screen (see below), and after **Nghỉ giữa ván** (`roundGapSeconds`, 3–300, default 8) the same game starts a new round (`loopStep` → `restart`). The last round's state is passed to `start` as `previous`, so question games continue without repeats.
- It stops only when the game is switched or cancelled:
  - **Switch requests** — gift (below), `!doigame`, the host's "🔄 Đổi khi hết ván": the switch is marked (`PlayLoop.switchPending`) and **the current round plays to its end**; its winners are celebrated during the round gap, then the game list opens (or the next game of the group when the list is off). The overlay shows a "🔄 Hết ván này sẽ đổi game" chip meanwhile. A round without a timer (the wheel) ends at once.
  - **Host, immediately** — "⏭ Đổi game ngay", "⏭ Đổi sang <game>" (pick another game in ② while one runs), ☰ in the game window: the round ends now (its points count) and the next game / the list comes at once.
  - **Huỷ / `!cancel`**: the round is dropped and the game stops (no next round); the list shows again (its countdown waits for the first vote).
  - **Chốt / `!stop`** only ends the current round early; the game continues with a new round after the gap.
- **Đổi game khi** `switchBy`: **Chỉ khi có lệnh đổi game (chơi mãi)** (`command`, default — endless), **Chơi xong số ván** (`rounds`, `roundsPerGame` 1–50) or **Chơi đủ số phút** (`time`, `switchMinutes` 1–180). All of them switch only at the end of a round. Settings saved before version 2 get `command`.
- **Thứ tự**: sequential (library order) or random, within the active game group (below), when the list is off. A game that can't start (e.g. vote without music) is skipped.

### Auto session (LIVE length)

- "▶ Bật tự động" (or "Tự bật khi kết nối TikTok"): with nothing on, opens the game list with the countdown running (or starts the selected game when the list is off); the play loop does the rest.
- **Thời lượng LIVE** (`liveMinutes`, 0–720, 0 = no limit): 5 minutes before the end the overlay announces it; at the end the running round is finished, the game stops and the list stays closed until the host plays again. The app never ends the TikTok LIVE itself. While running, the typed value applies from the next start; use "+15 phút LIVE" to extend.

### Gift → switch game

- Exact gift name (case-insensitive, default `Rose`) summed across viewers until `giftCount` (default 5), then a switch is requested: the round finishes normally, the winners are celebrated, then the game list opens (or the next rotation game). Works with or without the auto session. Gifts after the request are not counted.
- Matching gifts are ignored during the first `giftCooldownSeconds` (default 30) of each game, counted from the game's start (not from the request, since the switch waits for the round to end), so a new game always gets played.
- The running game still sees the gift first (e.g. boss damage, fan points). The overlay shows a "🎁 Tặng N <gift> · đổi game" chip while it's on. The reward is only a game change, never a prize.

### End-of-round celebration

`FinishResult.effects` may carry a `win` effect with `podium` (`podiumEffect` / `podiumOf` / `winnerEffect` / `roundEndEffect` in `src/game/series.ts`). The overlay (`Celebration` in `src/overlay/effects.tsx`) shows it for 6.5 s with confetti:
- **Top 3 podium** (2nd · 1st · 3rd, avatar + name + score): every ranking game — quiz / English quiz / answer games / hangman / estimate / majority / rock-paper-scissors (round totals), golden bell (survivors), crossword, team quiz and castle siege (best players of the winning team), duel (wins), king of the hill (seconds held), memory (pairs), like challenge (likes), boss (damage). Games without their own effect get a podium of their round awards.
- **Winner spotlight** (one big avatar with a crown, name, value): the race winner.
- Avatar names are added to `OverlayState.avatars` (`overlayAvatarNames`), so real TikTok profile pictures show when known.

### Run one or several games

In "② Chọn game": tick games with ✓ / ＋ on the cards (the active group), then **▶ Chạy N game đã chọn** (starts the auto session; **⏹ Dừng chạy tự động** stops it). With "Viewer chọn game" on, viewers vote the next game among the ticked ones; otherwise the next one follows the order (sequential/random).

### Bank files (điền chữ, chọn đáp án…)

Every bank field (Quiz, English Quiz, Đua vịt, Unscramble, Dịch nhanh, Emoji, Sentence Builder, Hangman, Name It, Ai nhanh tay) has:
- **⬇ File mẫu**: saves a sample `.txt` (UTF-8 with BOM, opens in Excel) through a save dialog; `#` lines explain the columns.
- **📂 Nhập file**: `.txt` with `|` columns, `.csv` (comma or semicolon; quoted cells ok; a `|` inside a cell becomes `/`), or tab-separated rows pasted from a spreadsheet. `#` comments and blank lines are dropped (`src/game/bankFile.ts`). Import replaces the bank (up to the field limit).
- A live check under the field: "✅ N dòng dùng được · ⚠ M dòng sai mẫu, sẽ bỏ qua: dòng …" (`GameDefinition.checkBank`).
- Quiz answer cell: letter A–D **or** the correct answer copied as text.
- **Thứ tự câu hỏi** (series games): **Ngẫu nhiên** (no repeats until the bank is used) or **Đúng thứ tự trong ngân hàng / file** (each round continues where the last one stopped, wrapping at the end).

### Arena games: waiting room and matches

- Not enough players (`minPlayers`, default 2) when the waiting time ends: it is extended by half, twice; then the round ends ("Chưa đủ người chơi") and the play loop opens a fresh waiting room after the round gap — new viewers can join between matches.
- Only players on the field answer; other viewers' letters stay normal chat. `!join` during a match is swallowed (no music rule).
- Questions never repeat inside a match, and the next match continues with questions not asked yet (the finished match's `asked` list), until the bank is used up.
- A question never empties the field: if everyone still in would be knocked out, the best of them (by the ranking before the question) stays.
- Balance check (simulated 40 matches of 12 and 40 players with mixed skill): every game ends within 4–30 questions, and the top third of players wins 80–97 % of the matches.

### Nhóm game (game groups)

Set up in "② Chọn game" before going LIVE: `groups` + `activeGroupId` in `autoplay-settings` (validated by `normalizeGroups`).

- Starter groups: "Giải trí 🎉" (fun games), "Tiếng Anh 🇬🇧" (English games), "Tất cả game" (always every game, new ones included; its ✓ buttons are locked). "＋ Nhóm mới" (max 12) starts with the selected game; rename in the text box, "Xoá nhóm" (the last group can't be deleted).
- The ✓ / ＋ button on each game card adds/removes it from the active group (a group keeps at least one game). Cards outside the group are dimmed; cards inside show their number — the number viewers type in the list (library order).
- Only the active group's games are shown and votable in the game list and rotated by autoplay. Changing the group (or its games) while the list is open refreshes it and restarts the votes, since numbers change. The streamer can still start any game manually (▶ Bắt đầu, `!start <name>`).
- Old settings with a rotation checklist (`gameIds`) become a "Nhóm của tôi" group.

### Viewer chọn game (game list / lobby)

`src/game/lobby.ts` (pure) + `useAutoPlay`. On by default (`lobbyEnabled`).

- Whenever no game is being played (app start, after a switch or a cancel), the overlay game card — including the standalone game window — shows **🎮 Chọn game · <group name>**: every game of the active group, numbered 1..n in library order (same numbers all stream). Keep groups to ~10 games so the list fits the overlay.
- Votes: comment `2`, `#2`, `!game 2` or `!chon 2` (whitelist, in range only). Every accepted comment is 1 vote; the per-viewer cooldown applies, so more comments = more votes but no flooding. While the list is shown these comments are consumed (music "Comment số → chọn bài" doesn't fire).
- Gifts (any gift) add `lobbyGiftVotes` (default 5) votes per gift unit to the gifter's last chosen game, or the leading game if they haven't voted. 0 = gifts don't vote. While the list is shown the "gift → switch game" gift only votes.
- Countdown `lobbySeconds` (5–300, default 20): after a game switch (and with the auto session) it starts right away; the very first list (nothing played yet) waits for the first vote.
- When it ends (`closeLobby`): the game with the most votes is picked; **nobody voted** or **a tie** → a random game (among the tied ones for a tie). The pick is announced for 4 s (`LOBBY_RESULT_MS`) on the list — headline "🎲 Không ai chọn — bốc ngẫu nhiên: X!" / "🎲 Hoà phiếu (N game) — bốc ngẫu nhiên: X!" / "✅ Nhiều phiếu nhất: X!", the picked tile pulses, the others dim — and as an overlay notice; then it starts. Votes are closed during the announcement. Games that can't start are skipped.
- App control: "✅ Chốt ngay" (close the vote now), then "▶ Chơi ngay" (skip the announcement). Starting any game manually (▶ Bắt đầu, `!start`) closes the list.

### `!doigame` (switch game by command)

- Also `!đổi game`, `!skipgame`, `!doi` (fixed whitelist). Only while a game is running.
- Viewers: counts distinct viewers while the current game is played (all its rounds; cooldown applies); at `switchCommandVotes` (default 5) a switch is requested: the current round plays to its end, then the next game is chosen (game list or rotation). Each vote is announced on the overlay (`2/5`). 0 = viewers can't switch.
- Streamer / moderators / app test tools: one `!doigame` requests the switch (still at the end of the round; the app's "⏭ Đổi game ngay" switches at once).
- The overlay shows a "🔄 !doigame · N người gõ là đổi game" chip during games.

## Rule security
Never change these rules so arbitrary comment text becomes code, a shell command, a filesystem path, or a network URL.
