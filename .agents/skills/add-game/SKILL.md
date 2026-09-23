# Skill: Add a LIVE game

Use when adding an interactive game (quiz, battle, race…) or a new overlay widget.

1. Create `src/game/games/<name>.ts` exporting a `GameDefinition<State, Config>` (see `src/game/types.ts`):
   - `defaultConfig` + `settings` (number/text/textarea/select with min/max/maxLength) — the app renders and clamps them.
   - `start` (return `{ error }` when it can't start), `handle` (return `null` for irrelevant input), optional `tick`, `finish` (points + optional `playTrackId`), `view` (an `OverlayGameView`).
   - Keep every function pure: use `ctx.now` / `ctx.random`, never `Date.now()` / `Math.random()`.
2. Mark chat as `consumed: true` only for this game's own command syntax (exact, whitelisted). Consumed comments get the per-viewer cooldown and skip music rules.
3. Set `category` (`fun` or `english`) and register it in `src/game/registry.ts`. For "show a puzzle → type the answer" games, reuse `createAnswerGame` in `answerGames.ts`; for A–D questions reuse `createQuizGame`.
4. Prefer existing view parts (`headline`, `hint`, `rows`, `progress`, `teams`, `race`, `wheel`). A new part needs a field in `OverlayGameView`, rendering in `src/overlay/Overlay.tsx` (+ `overlay.css`) and a compact version in `src/components/GamePanel.tsx`.
5. Add `testActions` (buttons for the Test block and demo bot): a correct move, a wrong move, and like/gift where relevant. Give round-ending actions a low `weight` so the bot doesn't end the round instantly. It may use the hidden answer — it's test-only.
6. Add unit tests for the pure module and document the game in `docs/RULES.md`.

Never execute viewer text. Never reward gifts with random prizes of monetary value (TikTok gambling policy); prefer streamer challenges or points.
