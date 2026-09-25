// Viewer profile pictures (src/shared/avatar.ts, src/hooks/useAvatars.ts). Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { overlayAvatarNames } from '../src/hooks/useAvatars';
import { AVATAR_CSP_SOURCES, avatarFromUser, safeAvatarUrl } from '../src/shared/avatar';

const SMALL = 'https://p16-sign-sg.tiktokcdn.com/tos-alisg-avt-0068/abc~tplv-tiktokx-cropcenter:100:100.webp?x-expires=1&x-signature=z';
const LARGE = 'https://p16-sign-sg.tiktokcdn.com/tos-alisg-avt-0068/abc~tplv-tiktokx-cropcenter:1080:1080.jpeg';

test('only HTTPS images on TikTok CDN hosts pass', () => {
  assert.equal(safeAvatarUrl(SMALL), SMALL);
  assert.ok(safeAvatarUrl('https://p19-pu-sign-useast8.tiktokcdn-us.com/a.jpeg'));
  assert.ok(safeAvatarUrl('https://p3.byteimg.com/a.png'));
  for (const bad of [
    'http://p16-sign-sg.tiktokcdn.com/a.webp',
    'https://tiktokcdn.com.evil.example/a.webp',
    'https://eviltiktokcdn.com/a.webp',
    'https://user:pw@p16.tiktokcdn.com/a.webp',
    'https://p16.tiktokcdn.com:8443/a.webp',
    'javascript:alert(1)',
    'data:image/svg+xml,<svg/>',
    'https://example.com/a.png',
    42
  ]) assert.equal(safeAvatarUrl(bad), null, String(bad));
});

test('picture from the event user: v1 urls, v2 url, prefers ~100 px', () => {
  assert.equal(avatarFromUser({ profilePicture: { url: [LARGE, SMALL] } }), SMALL);
  assert.equal(avatarFromUser({ profilePicture: { urls: [LARGE] } }), LARGE);
  assert.equal(avatarFromUser({ profilePicture: { url: ['https://example.com/x.png'] } }), null);
  assert.equal(avatarFromUser({}, SMALL), SMALL);
  assert.equal(avatarFromUser(null), null);
});

test('the overlay CSP allows exactly the avatar hosts', () => {
  assert.match(AVATAR_CSP_SOURCES, /https:\/\/\*\.tiktokcdn\.com/);
  assert.ok(!AVATAR_CSP_SOURCES.includes("'unsafe"), AVATAR_CSP_SOURCES);
});

test('names that get a picture on the overlay', () => {
  const names = overlayAvatarNames({
    game: { headline: null, hint: null, rows: [{ label: 'x', avatar: 'Linh' }], progress: null, teams: null, race: { icon: '🦆', lanes: [{ label: 'Hoa', percent: 10 }] }, wheel: null, title: '', phase: 'running', endsAt: null, timerStartedAt: null, message: '', accent: '', howTo: [] },
    effects: [{ id: 1, kind: 'win', user: 'Tuấn' }],
    leaderboard: [{ user: 'minh', nickname: 'Minh Anh', points: 5 }],
    nowPlaying: null,
    alerts: [{ id: 1, kind: 'join', name: '@usera', text: '@usera đã tham gia' }],
    lang: 'vi'
  });
  assert.deepEqual(names.sort(), ['@usera', 'Hoa', 'Linh', 'Minh Anh', 'Tuấn']);
});
