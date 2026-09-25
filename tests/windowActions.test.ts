// Clicks in the standalone game window (src/shared/overlay.ts). Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lobbyOverlay, openLobby } from '../src/game/lobby';
import { parseWindowAction, windowActionHash } from '../src/shared/overlay';

const base = 'http://127.0.0.1:17321/overlay?w=1080&h=1920&win=1';

test('window actions round-trip through the URL hash', () => {
  assert.deepEqual(parseWindowAction(base + windowActionHash({ type: 'menu' }, 1727)), { type: 'menu' });
  assert.deepEqual(parseWindowAction(base + windowActionHash({ type: 'pick', index: 3 }, 1727)), { type: 'pick', index: 3 });
  assert.deepEqual(parseWindowAction(base + windowActionHash({ type: 'pick', index: 12 }, 5)), { type: 'pick', index: 12 });
  // Repeated clicks differ only by their counter.
  assert.notEqual(windowActionHash({ type: 'menu' }, 1), windowActionHash({ type: 'menu' }, 2));
});

test('anything else in the hash is ignored', () => {
  for (const hash of ['', '#', '#act=menu', '#act=close.1', '#act=pick-0.1', '#act=pick-100.1', '#act=pick-3.1&x=1', '#act=menu.1;alert(1)', '#act=pick--1.1']) {
    assert.equal(parseWindowAction(base + hash), null, hash);
  }
  assert.equal(parseWindowAction('not a url'), null);
});

test('the lobby card is the game list: one tile per game, in order, with icon and votes', () => {
  const lobby = openLobby(['quiz', 'hangman', 'wheel'], 0, null);
  lobby.votes = [1, 3, 0];
  const view = lobbyOverlay(lobby, 0);
  assert.deepEqual(view.rows.map((row) => row.badge), ['1', '2', '3']);
  const items = view.menu?.items ?? [];
  assert.deepEqual(items.map((item) => item.number), [1, 2, 3]);
  assert.deepEqual(items.map((item) => item.leader), [false, true, false]);
  assert.deepEqual(items.map((item) => item.percent), [25, 75, 0]);
  assert.equal(items[0]?.icon, '❓');
  assert.equal(items[0]?.name, 'Quiz A/B/C/D');
  assert.equal(items[1]?.category, 'english');
});
