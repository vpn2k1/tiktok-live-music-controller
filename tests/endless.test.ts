/* eslint-disable @typescript-eslint/no-explicit-any */
// Endless play: every game must end its rounds by itself and start again from
// its previous round, and every celebration must be well-formed. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildEnglishDictionary } from '../src/game/english';
import { GAMES, normalizeConfig } from '../src/game/registry';
import { awardsPodium } from '../src/game/series';
import { buildDictionary } from '../src/game/words';

const dictionary = buildDictionary([]);
const englishDictionary = buildEnglishDictionary([]);
const tracks = ['a.mp3', 'b.mp3', 'c.mp3', 'd.mp3'].map((name, i) => ({ id: `t${i}`, name, url: '' }));
/** Games that run until the host (or a switch) ends them: no timer by design. */
const NO_TIMER = new Set(['wheel']);

function seeded(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

/**
 * Plays one round like the controller + demo bot: random test actions from a
 * few viewers, the clock moving on, `advance` at each deadline and `tick`
 * for clock-driven games. Returns the finish result, or null when the round
 * never ended within the step budget.
 */
function playRound(game: any, config: any, previous: any, random: () => number, start = 0) {
  let now = start + 1000;
  const ctx = () => ({ now, random, dictionary, englishDictionary });
  const started = game.start(config, { ...ctx(), playlist: tracks, currentTrackId: 't0', previous });
  assert.ok(!('error' in started), `${game.id} start: ${(started as any).error}`);
  let state = started.state;
  let endsAt: number | null = started.durationMs == null ? null : now + Math.max(1000, started.durationMs);
  const apply = (r: any): boolean => {
    if (!r) return false;
    r.commit?.();
    state = r.state;
    if (r.endsAt != null) endsAt = r.endsAt;
    return r.finish === true;
  };
  for (let step = 0; step < 4000; step += 1) {
    now += 250;
    const actions = game.testActions?.(state, config, ctx()) ?? [];
    if (actions.length && random() < 0.6) {
      const action = actions[Math.floor(random() * actions.length)];
      const user = `v${Math.floor(random() * 12)}`;
      const base = { user, nickname: user.toUpperCase() };
      const input = action.input.kind === 'chat' ? { ...base, kind: 'chat', text: action.input.text, isHost: true } : { ...base, ...action.input };
      if (apply(game.handle(state, input, config, ctx()))) return { state, result: game.finish(state, config, ctx()), now };
    }
    if (game.tick && apply(game.tick(state, config, ctx()))) return { state, result: game.finish(state, config, ctx()), now };
    if (endsAt != null && now >= endsAt) {
      const next = game.advance?.(state, config, ctx());
      if (!next) return { state, result: game.finish(state, config, ctx()), now };
      if (apply(next) || next.endsAt == null) return { state, result: game.finish(state, config, ctx()), now };
    }
  }
  return null;
}

for (const game of GAMES) {
  test(`endless: ${game.id} plays 3 rounds in a row, each ending by itself`, () => {
    const config = normalizeConfig(game, {});
    const random = seeded(game.id.length * 7919 + 1);
    let previous: any = null;
    let clock = 0;
    for (let round = 0; round < 3; round += 1) {
      const played = playRound(game, config, previous, random, clock);
      if (NO_TIMER.has(game.id)) {
        assert.equal(played, null, `${game.id} is expected to run until ended by the host`);
        return;
      }
      assert.ok(played, `${game.id} round ${round + 1} never ended by itself (the play loop would wait forever)`);
      const { result } = played;
      assert.equal(typeof result.message, 'string');
      // Games without their own effect get the controller's default podium from their awards.
      const effects = result.effects ?? [awardsPodium(result.awards, result.message)].filter(Boolean);
      for (const effect of effects) {
        if (!effect.podium) continue;
        assert.equal(effect.kind, 'win', `${game.id}: a podium is a win`);
        assert.ok(effect.podium.length >= 1 && effect.podium.length <= 3, `${game.id}: 1–3 on the podium`);
        const names = effect.podium.map((entry: any) => entry.name);
        assert.equal(new Set(names).size, names.length, `${game.id}: nobody twice on the podium (${names})`);
        assert.ok(names.every((name: string) => name.trim()), `${game.id}: podium names for the avatars`);
        assert.equal(effect.user, names[0]);
      }
      for (const award of result.awards) assert.ok(Number.isFinite(award.points) && award.points >= 0, `${game.id}: bad award ${award.points}`);
      previous = result.state;
      clock = played.now + 8000;
    }
  });
}
