# Skill: Add a LIVE game

Use when adding an interactive game (quiz, battle, race…) or a new overlay widget.

1. Create `src/game/games/<name>.ts` exporting a `GameDefinition<State, Config>` (see `src/game/types.ts`):
   - `defaultConfig` + `settings` (number/text/textarea/select with min/max/maxLength) — the app renders and clamps them.
   - `start` (return `{ error }` when it can't start), `handle` (return `null` for irrelevant input), optional `tick`, `finish` (points + optional `playTrackId`), `view` (an `OverlayGameView`).
   - Keep every function pure: use `ctx.now` / `ctx.random`, never `Date.now()` / `Math.random()`.
2. Mark chat as `consumed: true` only for this game's own command syntax (exact, whitelisted). Consumed comments get the per-viewer cooldown and skip music rules.
3. Declare `commands` (shown on the game card and by `!help`) and optional `aliases` for `!start <name>`. Parse game commands with `commandArgument(text, [...])` so `!cmd arg` and plain forms both work; use `input.isHost` for streamer-only commands.
4. Set `category` (`fun`, `versus`, `english`, `japanese` or `chinese`; a new category also needs a label in `GAME_CATEGORY_LABELS`, an accent in `useLiveGames.ts`, colors `.game-card-icon.<cat>` / `.ov-menu-item.cat-<cat>` and a starter group in `defaultGroups`) and register it in `src/game/registry.ts`. For "show a puzzle → type the answer" games, reuse `createAnswerGame` in `answerGames.ts`; for A–D questions reuse `createQuizGame`.
5. Prefer existing view parts (`headline`, `hint`, `rows`, `progress`, `teams`, `race`, `wheel`, `crossword`). A new part needs a field in `OverlayGameView`, rendering in `src/overlay/Overlay.tsx` (+ `overlay.css`) and a compact version in `src/components/GamePanel.tsx`.
6. Add `testActions` (buttons for the Test block and demo bot): a correct move, a wrong move, and like/gift where relevant. Give round-ending actions a low `weight` so the bot doesn't end the round instantly. It may use the hidden answer — it's test-only.
7. Add unit tests in `tests/` (`npm test`) and document the game in `docs/RULES.md`.
8. Team (Red / Blue) games: reuse `TeamRoster`, `teamChoice` and `isBangCommand` from `src/game/teamRoster.ts` (see `castleSiege.ts`, `teamQuiz.ts`); require "!" for action commands so everyday chat never triggers them.
9. Scale: never copy a per-viewer object/array on every answer (O(n²) in big rooms). Keep per-viewer records in a mutable structure (e.g. `AnswerBook`) and write to it only in `HandleResult.commit`; limit effects to the first few viewers; keep `view()` O(shown rows).
10. Rounds must end by themselves (timer, winner, last question): games replay round after round until a switch, and a switch waits for the round to end. Celebrate the end with `podiumEffect` / `podiumOf` (top 3) or `winnerEffect` (one winner) from `series.ts` in `FinishResult.effects`.
11. Question games: build on `series.ts` (`SERIES_SETTINGS`, `startSeries`, `scoreQuestion`, `nextQuestion`) and implement `advance` so the deadline reveals the answer and moves to the next question; award points per question via `HandleResult.awards`.
12. Banks (textarea settings): give the field a `sample` (with `#` instruction lines) and implement `checkBank(key, text)` with `checkBankLines` and your line parser; tests check every sample is valid.

13. Text: write titles, howTo, commands and settings in Vietnamese and add their English entries to `src/shared/en/*.ts` (don't wrap static metadata; the UI translates it at render). Wrap runtime text from `view`/`handle`/`finish`/`start`/`testActions` in `t()` from `src/shared/i18n.ts`, with `{name}` params instead of concatenation. `tests/i18n.test.ts` fails if a game's metadata has no English.

Never execute viewer text. Never reward gifts with random prizes of monetary value (TikTok gambling policy); prefer streamer challenges or points.
