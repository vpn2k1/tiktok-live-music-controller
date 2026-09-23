// Unit tests for the pure autoplay module. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addGifts,
  autoPlayStep,
  createSession,
  DEFAULT_AUTOPLAY,
  EMPTY_GIFT_SWITCH,
  giftMatches,
  LIVE_WARNING_MS,
  nextGameOrder,
  normalizeAutoPlay,
  rotation
} from '../src/game/autoplay';

const IDS = ['a', 'b', 'c', 'd'];
const settings = (patch = {}) => normalizeAutoPlay({ ...DEFAULT_AUTOPLAY, ...patch }, IDS);

test('normalizeAutoPlay clamps numbers and drops unknown games', () => {
  const s = normalizeAutoPlay({ liveMinutes: -5, switchMinutes: 0, roundGapSeconds: 9999, giftCount: 'x', order: 'weird', gameIds: ['b', 'zzz', 'a'], giftName: 42 }, IDS);
  assert.equal(s.liveMinutes, 0);
  assert.equal(s.switchMinutes, 1);
  assert.equal(s.roundGapSeconds, 300);
  assert.equal(s.giftCount, DEFAULT_AUTOPLAY.giftCount);
  assert.equal(s.order, 'sequential');
  assert.deepEqual(s.gameIds, ['a', 'b']);
  assert.equal(s.giftName, DEFAULT_AUTOPLAY.giftName);
  assert.deepEqual(normalizeAutoPlay(null, IDS), { ...DEFAULT_AUTOPLAY, gameIds: [] });
});

test('rotation keeps library order; empty selection means every game', () => {
  assert.deepEqual(rotation(settings(), IDS), IDS);
  assert.deepEqual(rotation(settings({ gameIds: ['c', 'a'] }), IDS), ['a', 'c']);
});

test('nextGameOrder goes to the next game and keeps the current one last', () => {
  assert.deepEqual(nextGameOrder(IDS, 'b', 'sequential', Math.random), ['c', 'd', 'a', 'b']);
  assert.deepEqual(nextGameOrder(IDS, 'd', 'sequential', Math.random), ['a', 'b', 'c', 'd']);
  assert.deepEqual(nextGameOrder(IDS, null, 'sequential', Math.random), IDS);
  assert.deepEqual(nextGameOrder(IDS, 'zzz', 'sequential', Math.random), IDS);
  assert.deepEqual(nextGameOrder([], 'a', 'sequential', Math.random), []);
  const random = nextGameOrder(IDS, 'b', 'random', () => 0.99);
  assert.equal(random[0], 'a');
  assert.equal(random.at(-1), 'b');
  assert.deepEqual([...random].sort(), IDS);
});

test('giftMatches is exact, case-insensitive and respects the toggle', () => {
  assert.ok(giftMatches(settings({ giftName: 'Rose' }), ' rose '));
  assert.ok(!giftMatches(settings({ giftName: 'Rose' }), 'Roses'));
  assert.ok(!giftMatches(settings({ giftName: '  ' }), ''));
  assert.ok(!giftMatches(settings({ giftSwitchEnabled: false }), 'Rose'));
});

test('addGifts sums gifts to the threshold, then ignores gifts during the cooldown', () => {
  const s = settings({ giftCount: 5, giftCooldownSeconds: 30 });
  let r = addGifts(EMPTY_GIFT_SWITCH, s, 3, 0);
  assert.deepEqual(r, { state: { progress: 3, lastSwitchAt: null }, switch: false });
  r = addGifts(r.state, s, 2, 1000);
  assert.deepEqual(r, { state: { progress: 0, lastSwitchAt: 1000 }, switch: true });
  r = addGifts(r.state, s, 99, 20_000);
  assert.equal(r.switch, false);
  assert.equal(r.state.progress, 0);
  r = addGifts(r.state, s, 99, 31_000);
  assert.equal(r.switch, true);
});

test('autoPlayStep: first game, round gap, slot end, warning and LIVE end', () => {
  const s = settings({ liveMinutes: 30, switchMinutes: 5, roundGapSeconds: 10 });
  const start = createSession(s, 0);
  assert.equal(start.liveEndsAt, 30 * 60_000);
  assert.equal(autoPlayStep(start, s, false, 0), 'switch');

  const playing = { ...start, gameId: 'a', slotEndsAt: 5 * 60_000 };
  assert.equal(autoPlayStep(playing, s, true, 60_000), 'none');
  // Round ended inside the slot: replay the same game after the gap.
  const idle = { ...playing, idleSince: 60_000 };
  assert.equal(autoPlayStep(idle, s, false, 65_000), 'none');
  assert.equal(autoPlayStep(idle, s, false, 70_000), 'restart');
  // Slot over: finish the running round, then switch after the gap.
  assert.equal(autoPlayStep(playing, s, true, 5 * 60_000), 'finish');
  const finished = { ...playing, idleSince: 5 * 60_000 };
  assert.equal(autoPlayStep(finished, s, false, 5 * 60_000 + 5000), 'none');
  assert.equal(autoPlayStep(finished, s, false, 5 * 60_000 + 10_000), 'switch');

  assert.equal(autoPlayStep(playing, s, true, 30 * 60_000 - LIVE_WARNING_MS), 'warn');
  assert.equal(autoPlayStep({ ...playing, warned: true, slotEndsAt: Infinity }, s, true, 30 * 60_000 - 1000), 'none');
  assert.equal(autoPlayStep(playing, s, true, 30 * 60_000), 'end');
});

test('autoPlayStep: no LIVE limit never ends; short LIVE skips the warning', () => {
  const unlimited = settings({ liveMinutes: 0 });
  const session = { ...createSession(unlimited, 0), gameId: 'a', slotEndsAt: Infinity };
  assert.equal(session.liveEndsAt, null);
  assert.equal(autoPlayStep(session, unlimited, true, 10 * 3_600_000), 'none');

  const short = settings({ liveMinutes: 3 });
  const shortSession = { ...createSession(short, 0), gameId: 'a', slotEndsAt: Infinity };
  assert.equal(autoPlayStep(shortSession, short, true, 60_000), 'none');
});
