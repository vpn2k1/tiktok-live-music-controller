// Unit tests for the pure autoplay module. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  activeGroup,
  addGifts,
  autoPlayStep,
  createSession,
  DEFAULT_AUTOPLAY,
  EMPTY_GIFT_SWITCH,
  giftMatches,
  LIVE_WARNING_MS,
  MAX_GROUPS,
  nextGameOrder,
  normalizeAutoPlay,
  normalizeGroups,
  rotation
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

test('autoPlayStep: first game, round gap, slot end, warning and LIVE end', () => {
  const s = settings({ liveMinutes: 30, switchBy: 'time', switchMinutes: 5, roundGapSeconds: 10 });
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

test('autoPlayStep "rounds": replay until N rounds, never cut a round short', () => {
  const s = settings({ switchBy: 'rounds', roundsPerGame: 2, roundGapSeconds: 5 });
  const playing = { ...createSession(s, 0), gameId: 'a', slotEndsAt: 0 };
  assert.equal(autoPlayStep(playing, s, true, 999_999), 'none', 'no time limit on a running round');
  assert.equal(autoPlayStep({ ...playing, idleSince: 1000, roundsPlayed: 1 }, s, false, 6000), 'restart');
  assert.equal(autoPlayStep({ ...playing, idleSince: 1000, roundsPlayed: 2 }, s, false, 3000), 'none', 'result stays for the gap');
  assert.equal(autoPlayStep({ ...playing, idleSince: 1000, roundsPlayed: 2 }, s, false, 6000), 'switch');
  assert.equal(DEFAULT_AUTOPLAY.switchBy, 'rounds');
  assert.equal(settings({ switchBy: 'weird' }).switchBy, 'rounds');
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
