// Comment history (src/shared/chatLog.ts). Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appendChatLog, chatLogText, filterChatLog, toChatEntry } from '../src/shared/chatLog';
import type { LiveEvent } from '../src/shared/types';

let seq = 0;
const chat = (user: string, comment: string, at = 0): LiveEvent => ({ id: `e${seq++}`, type: 'chat', user, nickname: user.toUpperCase(), comment, at } as LiveEvent);
const like = (user: string): LiveEvent => ({ id: `e${seq++}`, type: 'like', user, nickname: user, count: 5, total: 5, at: 0 } as LiveEvent);
const gift = (user: string): LiveEvent => ({ id: `e${seq++}`, type: 'gift', user, nickname: user, giftId: 1, giftName: 'Rose', count: 3, at: 0 } as LiveEvent);

test('comments, gifts and follows are kept oldest first; likes and joins are not', () => {
  const follow = { id: 'f', type: 'follow', user: 'c', nickname: 'C', at: 0 } as LiveEvent;
  const join = { id: 'j', type: 'join', user: 'd', nickname: 'D', at: 0 } as LiveEvent;
  const log = appendChatLog([], [chat('a', 'xin chào'), like('b'), gift('b'), follow, join, chat('a', 'hello')]);
  assert.deepEqual(log.map((entry) => entry.kind), ['chat', 'gift', 'follow', 'chat']);
  assert.equal(log[0]?.text, 'xin chào');
  assert.equal(log[1]?.text, 'Rose ×3');
  assert.equal(toChatEntry(like('x')), null);
});

test('the log keeps only the newest entries and is unchanged by an empty batch', () => {
  let log = appendChatLog([], [chat('a', '1'), chat('a', '2'), chat('a', '3')], 2);
  assert.deepEqual(log.map((entry) => entry.text), ['2', '3']);
  log = appendChatLog(log, [chat('a', '4')], 2);
  assert.deepEqual(log.map((entry) => entry.text), ['3', '4']);
  assert.equal(appendChatLog(log, [like('b')], 2), log);
});

test('search ignores accents and case; comments-only hides gifts', () => {
  const log = appendChatLog([], [chat('linh', 'Cảm ơn cô'), chat('minh', '!join'), gift('an')]);
  assert.deepEqual(filterChatLog(log, { query: 'cam on', commentsOnly: false }).map((entry) => entry.user), ['linh']);
  assert.deepEqual(filterChatLog(log, { query: 'MINH', commentsOnly: false }).map((entry) => entry.text), ['!join']);
  assert.equal(filterChatLog(log, { query: '', commentsOnly: true }).length, 2);
});

test('export: one line per entry with time, name, @user and text', () => {
  const log = appendChatLog([], [chat('linh', 'hello', Date.UTC(2026, 9, 7, 3, 4, 5)), gift('an')]);
  const text = chatLogText(log, 'en-GB', { gift: 'sent', follow: 'followed' });
  const lines = text.split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0] ?? '', /\d{2}:\d{2}:\d{2} {2}LINH \(@linh\): hello$/);
  assert.match(lines[1] ?? '', /an \(@an\): sent Rose ×3$/);
});
