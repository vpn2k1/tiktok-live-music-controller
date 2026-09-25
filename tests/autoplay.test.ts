// Unit tests for the pure autoplay module. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  activeGroup,
  addGifts,
  createLoop,
  createSession,
  DEFAULT_AUTOPLAY,
  EMPTY_GIFT_SWITCH,
  giftMatches,
  LIVE_WARNING_MS,
  loopStep,
  MAX_GROUPS,
  nextGameOrder,
  normalizeAutoPlay,
  normalizeGroups,
  rotation,
  sessionStep
} from '../src/game/autoplay';

const IDS = ['a', 'b', 'c', 'd'];
const GAMES = [{ id: 'a', category: 'fun' }, { id: 'b', category: 'fun' }, { id: 'c', category: 'english' }, { id: 'd', category: 'english' }];
const settings = (patch = {}) => normalizeAutoPlay({ ...DEFAULT_AUTOPLAY, ...patch }, GAMES);

test('normalizeAutoPlay clamps numbers and builds starter groups', () => {
  const s = normalizeAutoPlay({ liveMinutes: -5, switchMinutes: 0, roundGapSeconds: 9999, giftCount: 'x', order: 'weird', giftName: 42 }, GAMES);
  assert.equal(s.liveMinutes, 0);
  assert.equal(s.switchMinutes, 1);
  assert.equal(s.roundGapSeconds, 300);
  assert.equal(s.giftCount, DEFAULT_AUTOPLAY.giftCount);
  assert.equal(s.order, 'sequential');
  assert.equal(s.giftName, DEFAULT_AUTOPLAY.giftName);
  assert.deepEqual(s.groups.map((group) => [group.id, group.gameIds]), [['fun', ['a', 'b']], ['english', ['c', 'd']], ['all', IDS]]);
  assert.equal(s.activeGroupId, 'fun');
  const fresh = normalizeAutoPlay(null, GAMES);
  assert.deepEqual(fresh, { ...DEFAULT_AUTOPLAY, groups: s.groups, activeGroupId: 'fun' });
});

test('normalizeGroups validates groups and migrates the old rotation list', () => {
  const raw = [
    { id: 'x', name: 'Mine', gameIds: ['d', 'zzz', 'a', 'a'] },
    { id: 'x', name: 'Duplicate id', gameIds: ['b'] },
    { id: 'empty', name: 'Empty', gameIds: ['zzz'] },
    { id: 'bad id!', name: 'Bad id', gameIds: ['b'] },
    { id: 'y', name: 'N'.repeat(99), gameIds: ['c'] },
    'junk'
  ];
  const { groups, activeGroupId } = normalizeGroups(raw, 'y', null, GAMES);
  assert.deepEqual(groups.map((group) => [group.id, group.gameIds]), [['x', ['a', 'd']], ['y', ['c']]]);
  assert.equal(groups[1]?.name.length, 40);
  assert.equal(activeGroupId, 'y');
  assert.equal(normalizeGroups(raw, 'nope', null, GAMES).activeGroupId, 'x');

  const migrated = normalizeGroups(undefined, undefined, ['b', 'c'], GAMES);
  assert.equal(migrated.activeGroupId, 'mine');
  assert.deepEqual(migrated.groups[0], { id: 'mine', name: 'Nhóm của tôi', gameIds: ['b', 'c'] });

  assert.deepEqual(normalizeGroups([{ id: 'all', name: 'Tất cả', gameIds: ['a'] }], 'all', null, GAMES).groups[0]?.gameIds, IDS, '"all" gains new games');

  const many = Array.from({ length: 20 }, (_, i) => ({ id: `g${i}`, name: '', gameIds: ['a'] }));
  assert.equal(normalizeGroups(many, 'g0', null, GAMES).groups.length, MAX_GROUPS);
});

test('rotation is the active group in library order', () => {
  const s = settings({ groups: [{ id: 'x', name: 'X', gameIds: ['c', 'a'] }], activeGroupId: 'x' });
  assert.equal(activeGroup(s)?.id, 'x');
  assert.deepEqual(rotation(s, IDS), ['a', 'c']);
  assert.deepEqual(rotation(settings({ activeGroupId: 'english' }), IDS), ['c', 'd']);
  assert.deepEqual(rotation({ ...s, groups: [] }, IDS), IDS, 'no group → every game');
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

test('games play on forever by default; old settings migrate to it', () => {
  assert.equal(DEFAULT_AUTOPLAY.switchBy, 'command');
  assert.equal(settings({ switchBy: 'weird' }).switchBy, 'command');
  assert.equal(settings({ switchBy: 'rounds' }).switchBy, 'rounds');
  // Version 1 defaulted to "switch after 1 round": stored settings without a version play on instead.
  assert.equal(normalizeAutoPlay({ switchBy: 'rounds', roundsPerGame: 1 }, GAMES).switchBy, 'command');
  assert.equal(normalizeAutoPlay({ switchBy: 'time' }, GAMES).switchBy, 'command');

  const s = settings({ roundGapSeconds: 8 });
  const loop = { ...createLoop('a', 0), idleSince: 1000, roundsPlayed: 999 };
  assert.equal(loopStep(createLoop('a', 0), s, true, 10 * 3_600_000), 'none', 'a running round is never cut');
  assert.equal(loopStep(loop, s, false, 5000), 'none', 'the result stays on screen for the gap');
  assert.equal(loopStep(loop, s, false, 9000), 'restart', 'then the same game plays another round, forever');
  assert.equal(loopStep({ ...loop, since: -10 * 3_600_000 }, s, false, 9000), 'restart');
});

test('a switch request waits for the round to end, then the result gap', () => {
  const s = settings({ roundGapSeconds: 5 });
  const pending = { ...createLoop('a', 0), switchPending: true };
  assert.equal(loopStep(pending, s, true, 60_000), 'none', 'the round plays to its end');
  assert.equal(loopStep({ ...pending, idleSince: 60_000 }, s, false, 62_000), 'none', 'the winner is celebrated first');
  assert.equal(loopStep({ ...pending, idleSince: 60_000 }, s, false, 65_000), 'switch');
});

test('optional switch rules: after N rounds or M minutes, still at a round end', () => {
  const rounds = settings({ switchBy: 'rounds', roundsPerGame: 2, roundGapSeconds: 5 });
  const loop = createLoop('a', 0);
  assert.equal(loopStep(loop, rounds, true, 999_999), 'none', 'no time limit on a running round');
  assert.equal(loopStep({ ...loop, idleSince: 1000, roundsPlayed: 1 }, rounds, false, 6000), 'restart');
  assert.equal(loopStep({ ...loop, idleSince: 1000, roundsPlayed: 2 }, rounds, false, 3000), 'none', 'result stays for the gap');
  assert.equal(loopStep({ ...loop, idleSince: 1000, roundsPlayed: 2 }, rounds, false, 6000), 'switch');

  const time = settings({ switchBy: 'time', switchMinutes: 5, roundGapSeconds: 10 });
  assert.equal(loopStep(loop, time, true, 9 * 60_000), 'none', 'time is up but the round finishes first');
  assert.equal(loopStep({ ...loop, idleSince: 60_000 }, time, false, 70_000), 'restart');
  assert.equal(loopStep({ ...loop, idleSince: 5 * 60_000 }, time, false, 5 * 60_000 + 10_000), 'switch');
});

test('sessionStep: warning and LIVE end; no limit never ends', () => {
  const s = settings({ liveMinutes: 30 });
  const session = createSession(s, 0);
  assert.equal(session.liveEndsAt, 30 * 60_000);
  assert.equal(sessionStep(session, 60_000), 'none');
  assert.equal(sessionStep(session, 30 * 60_000 - LIVE_WARNING_MS), 'warn');
  assert.equal(sessionStep({ ...session, warned: true }, 30 * 60_000 - 1000), 'none');
  assert.equal(sessionStep(session, 30 * 60_000), 'end');

  const unlimited = createSession(settings({ liveMinutes: 0 }), 0);
  assert.equal(unlimited.liveEndsAt, null);
  assert.equal(sessionStep(unlimited, 10 * 3_600_000), 'none');
  assert.equal(sessionStep(createSession(settings({ liveMinutes: 3 }), 0), 60_000), 'none', 'short LIVE skips the warning');
});
