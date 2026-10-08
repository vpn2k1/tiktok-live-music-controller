// Readable TikTok connection errors (src/shared/tiktokErrors.ts). Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { diagnoseConnectError, isRetryableSignError, isTikTokUsername, TIKTOK_CAUSES, tiktokUsername } from '../src/shared/tiktokErrors';

// Same shapes as tiktok-live-connector 2.4 (class names matter for some checks).
class InvalidResponseError extends Error {}
class InvalidResponseCompositeError extends Error {
  constructor(public config: { requestErrs: Error[] }, message: string) {
    super(message);
  }
}
class UserOfflineError extends Error {}

const EULER = new InvalidResponseError("[fetchRoomIdRoute] Failed to retrieve Room ID from Euler Stream, which was made as a last resort due to the previous methods failing. This happened due to a >>lack of permission<< for you to use Euler Stream's fallback method.");
const composite = (...errors: Error[]) => new InvalidResponseCompositeError({ requestErrs: errors }, 'Failed to retrieve Room ID from all sources.');

test('usernames: @, links and spaces are accepted', () => {
  assert.equal(tiktokUsername('  @ten_kenh.live '), 'ten_kenh.live');
  assert.equal(tiktokUsername('https://www.tiktok.com/@ten_kenh/live?lang=vi'), 'ten_kenh');
  assert.equal(tiktokUsername('tiktok.com/@abc.def'), 'abc.def');
  assert.ok(isTikTokUsername('ten_kenh.live'));
  assert.ok(!isTikTokUsername('Tên Kênh'));
  assert.ok(!isTikTokUsername('a'));
});

test('"all sources" failure with user_not_found → wrong username', () => {
  const message = diagnoseConnectError(composite(
    new InvalidResponseError('[fetchRoomInfoHtmlRoute] Failed to extract the LiveRoom object from SIGI_STATE.'),
    new InvalidResponseError('[fetchRoomInfoApiLiveRoute] API Error 19881007 (user_not_found)'),
    EULER
  ));
  assert.ok(message.startsWith(`${TIKTOK_CAUSES.notFound}: `), message);
  assert.match(message, /API: user_not_found \(19881007\)/);
  assert.match(message, /Euler: no permission/);
});

test('captcha / blocked page → network blocked by TikTok', () => {
  const message = diagnoseConnectError(composite(
    new InvalidResponseError('[fetchRoomInfoHtmlRoute] Failed to extract the SIGI_STATE HTML tag, you might be blocked by TikTok.'),
    new InvalidResponseError('[fetchRoomInfoApiLiveRoute] Invalid response from API: {}'),
    EULER
  ));
  assert.ok(message.startsWith(TIKTOK_CAUSES.blocked), message);
});

test('offline, network and unknown errors', () => {
  assert.ok(diagnoseConnectError(new UserOfflineError("The requested user isn't online :(")).startsWith(TIKTOK_CAUSES.offline));
  assert.ok(diagnoseConnectError(new Error('getaddrinfo ENOTFOUND www.tiktok.com')).startsWith(TIKTOK_CAUSES.network));
  assert.ok(diagnoseConnectError(composite(new InvalidResponseError('[fetchRoomInfoApiLiveRoute] Invalid response from API: {}'), EULER)).startsWith(TIKTOK_CAUSES.noRoom));
  assert.equal(diagnoseConnectError(new Error('Something else')), 'Something else');
});

test('sign server failures and rate limits get their own cause', () => {
  const sign = diagnoseConnectError(new Error('[Sign Error] [fetchSignedWebSocketFromEulerRoute] Unexpected sign server status 500. Payload: {"fallback_message":"illegal web id"}'));
  assert.ok(sign.startsWith(`${TIKTOK_CAUSES.signServer}: `), sign);
  const limited = diagnoseConnectError(new Error('[Rate Limited] (rate_limit_account_minute) Too many connections started, try again later.'));
  assert.ok(limited.startsWith(TIKTOK_CAUSES.rateLimited), limited);
});

test('only sign server failures are retried', () => {
  assert.equal(isRetryableSignError(new Error('[Sign Error] [fetchSignedWebSocketFromEulerRoute] Unexpected sign server status 500. Payload: {"fallback_message":"illegal web id"}')), true);
  assert.equal(isRetryableSignError(new Error('[Empty Cookies] [fetchSignedWebSocketFromEulerRoute] No cookies received from sign server.')), true);
  assert.equal(isRetryableSignError(new Error('[Rate Limited] (rate_limit_account_minute) Too many connections started, try again later.')), false);
  assert.equal(isRetryableSignError(new Error("The requested user isn't online :(")), false);
});

test('causes contain no ": " (the renderer splits cause and details there)', () => {
  for (const cause of Object.values(TIKTOK_CAUSES)) assert.ok(!cause.includes(': '), cause);
});
