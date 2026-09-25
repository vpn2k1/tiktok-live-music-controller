// Unit tests for the pure game lobby module. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  closeLobby,
  giftLobby,
  isSwitchCommand,
  lobbyOverlay,
  lobbyRanking,
  lobbyResultText,
  LOBBY_RESULT_MS,
  openLobby,
  parseLobbyVote,
  voteLobby
} from '../src/game/lobby';

let seed = 7;
const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

test('parseLobbyVote accepts numbers and !game N inside the option range only', () => {
  assert.equal(parseLobbyVote('2', 5), 1);
  assert.equal(parseLobbyVote(' #3 ', 5), 2);
  assert.equal(parseLobbyVote('!game 5', 5), 4);
  assert.equal(parseLobbyVote('!chọn 1', 5), 0);
  assert.equal(parseLobbyVote('6', 5), null);
  assert.equal(parseLobbyVote('0', 5), null);
  assert.equal(parseLobbyVote('2 nha', 5), null);
  assert.equal(parseLobbyVote('game 2', 5), null);
});

test('isSwitchCommand is a fixed whitelist', () => {
  for (const text of ['!doigame', '!đổi game', '!Doi Game', '!skipgame', '!doi']) assert.ok(isSwitchCommand(text), text);
  for (const text of ['doigame', '!doigame now', '!start quiz', '!doigamee']) assert.ok(!isSwitchCommand(text), text);
});

test('votes start the countdown; gifts go to the viewer choice or the leader', () => {
  let lobby = openLobby(['a', 'b', 'c'], 1000, null);
  assert.equal(lobby.endsAt, null);
  lobby = voteLobby(lobby, 'u1', 1, 1, 2000, 20);
  assert.equal(lobby.endsAt, 22_000);
  assert.equal(lobby.timerStartedAt, 2000);
  lobby = voteLobby(lobby, 'u1', 1, 1, 3000, 20);
  assert.equal(lobby.endsAt, 22_000, 'later votes keep the deadline');
  assert.deepEqual(lobby.votes, [0, 2, 0]);

  lobby = voteLobby(lobby, 'u2', 2, 1, 4000, 20);
  lobby = giftLobby(lobby, 'u2', 3, 5, 5000, 20);
  assert.deepEqual(lobby.votes, [0, 2, 16]);
  lobby = giftLobby(lobby, 'stranger', 1, 5, 5000, 20);
  assert.deepEqual(lobby.votes, [0, 2, 21], 'no choice → leading game');
  assert.equal(giftLobby(lobby, 'u2', 1, 0, 5000, 20), lobby, '0 votes per gift changes nothing');
  assert.equal(voteLobby(lobby, 'u1', 9, 1, 5000, 20), lobby, 'out of range');

  const timed = openLobby(['a', 'b'], 1000, 30);
  assert.equal(timed.endsAt, 31_000);
});

test('lobbyRanking sorts by votes and the overlay card lists every option', () => {
  const lobby = { ...openLobby(['a', 'b', 'c'], 0, 10), votes: [1, 5, 3] };
  assert.deepEqual(lobbyRanking(lobby, random), ['b', 'c', 'a']);
  const empty = openLobby(['a', 'b', 'c'], 0, 10);
  assert.deepEqual([...lobbyRanking(empty, random)].sort(), ['a', 'b', 'c']);

  const view = lobbyOverlay({ ...openLobby(['boss', 'quiz'], 0, 10), votes: [1, 3] }, 5);
  assert.equal(view.phase, 'running');
  assert.equal(view.endsAt, 10_000);
  assert.deepEqual(view.rows.map((row) => [row.badge, row.value, row.percent, row.highlight]), [['1', '1', 25, false], ['2', '3', 75, true]]);
  assert.equal(view.howTo.length, 2);
  assert.equal(lobbyOverlay(openLobby(['boss'], 0, null), 0).howTo.length, 1);
  assert.equal(view.title, '🎮 Chọn game');
  assert.equal(lobbyOverlay(openLobby(['boss'], 0, null), 0, ' Giải trí ').title, '🎮 Giải trí');
});

test('closing the vote: most votes wins; no votes or a tie = random pick, announced first', () => {
  const voted = closeLobby({ ...openLobby(['a', 'b', 'c'], 0, 10), votes: [1, 4, 2] }, random, 5000);
  assert.equal(voted.result?.reason, 'votes');
  assert.equal(voted.result?.ranking[0], 'b');
  assert.equal(voted.endsAt, 5000 + LOBBY_RESULT_MS, 'the pick is shown before the game starts');
  assert.equal(closeLobby(voted, random, 9000), voted, 'closing twice changes nothing');
  assert.equal(voteLobby(voted, 'late', 0, 1, 6000, 20), voted, 'no votes after the close');
  assert.equal(giftLobby(voted, 'late', 5, 5, 6000, 20), voted);

  const picks = new Set<string>();
  for (let i = 0; i < 40; i += 1) {
    const tie = closeLobby({ ...openLobby(['a', 'b', 'c'], 0, 10), votes: [3, 0, 3] }, random, 0);
    assert.equal(tie.result?.reason, 'tie');
    assert.deepEqual(tie.result?.tied, [0, 2]);
    picks.add(tie.result?.ranking[0] ?? '');
  }
  assert.deepEqual([...picks].sort(), ['a', 'c'], 'a tie is broken randomly among the tied games only');

  const none = new Set<string>();
  for (let i = 0; i < 60; i += 1) {
    const empty = closeLobby(openLobby(['a', 'b', 'c'], 0, 10), random, 0);
    assert.equal(empty.result?.reason, 'none');
    none.add(empty.result?.ranking[0] ?? '');
  }
  assert.deepEqual([...none].sort(), ['a', 'b', 'c'], 'nobody voted → any game');

  assert.match(lobbyResultText({ ranking: ['a'], reason: 'none', tied: [] }, 'Quiz'), /ngẫu nhiên: Quiz/);
  assert.match(lobbyResultText({ ranking: ['a'], reason: 'tie', tied: [0, 2] }, 'Quiz'), /Hoà phiếu \(2 game\)/);

  const view = lobbyOverlay(closeLobby({ ...openLobby(['boss', 'quiz'], 0, 10), votes: [0, 0] }, () => 0.9, 0), 5);
  assert.equal(view.menu?.decided, true);
  assert.equal(view.menu?.items.filter((item) => item.picked).length, 1);
  assert.match(view.headline ?? '', /ngẫu nhiên/);
});
