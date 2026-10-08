/**
 * Readable TikTok connection errors. `tiktok-live-connector` looks up the LIVE
 * room in three places (the @user/live web page, TikTok's API, Euler Stream)
 * and, when all fail, throws one generic "Failed to retrieve Room ID from all
 * sources." with each source's reason in `error.config.requestErrs`. This turns
 * those reasons into one cause the streamer can act on.
 *
 * Messages are "<Vietnamese cause>: <technical details>"; the renderer
 * translates the cause (see translateMainMessage in App.tsx) and keeps the details.
 */

/** Username from what the streamer typed: "@name", "name", or a tiktok.com/@name/live link. */
export function tiktokUsername(input: string): string {
  const text = String(input || '').trim();
  const fromLink = /tiktok\.com\/@([^/?#\s]+)/i.exec(text);
  return (fromLink?.[1] ?? text).replace(/^@+/, '').replace(/\s+/g, '');
}

/** TikTok usernames: letters, digits, "_" and "." (2–24 characters). */
export function isTikTokUsername(name: string): boolean {
  return /^[A-Za-z0-9._]{2,24}$/.test(name);
}

export const TIKTOK_CAUSES = {
  notFound: 'Không tìm thấy tài khoản TikTok này. Nhập đúng username (phần sau @ trong link tiktok.com/@…), không phải tên hiển thị',
  offline: 'Tài khoản chưa LIVE. Bắt đầu LIVE trên TikTok (điện thoại hoặc LIVE Studio) rồi bấm Kết nối lại',
  blocked: 'TikTok đang chặn hoặc bắt xác minh (captcha) mạng này. Thử mạng khác (4G / Wi-Fi khác), bật/tắt VPN, hoặc đợi vài phút rồi thử lại',
  network: 'Không kết nối được tới TikTok. Kiểm tra mạng / VPN / tường lửa rồi thử lại',
  timeout: 'TikTok phản hồi quá lâu. Thử kết nối lại',
  rateLimited: 'Kết nối quá nhiều lần trong thời gian ngắn (giới hạn của máy chủ Euler Stream). Đợi 1–2 phút rồi bấm Kết nối lại',
  signServer: 'Máy chủ Euler Stream (bước lấy kết nối LIVE) đang lỗi. Thử lại sau ít phút; nếu vẫn lỗi, cập nhật app lên bản mới',
  noRoom: 'Không lấy được phòng LIVE của tài khoản này. Hãy kiểm tra username, tài khoản đang LIVE, và LIVE không bị giới hạn (18+, riêng tư, theo khu vực)'
} as const;

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message);
  return String(error ?? '');
}

/** Each source's reason, shortened ("HTML: …; API: user_not_found; Euler: no permission"). */
function sourceDetails(errors: unknown[]): string {
  return errors
    .map((sub) => {
      const text = messageOf(sub);
      const source = /fetchRoomInfoHtml/i.test(text) ? 'HTML' : /ApiLive/i.test(text) ? 'API' : /Euler/i.test(text) ? 'Euler' : '';
      let reason = text.replace(/^\[[^\]]+\]\s*/, '');
      if (/lack of permission/i.test(reason)) reason = 'no permission (Euler Stream API key)';
      const api = /API Error (\d+) \(([^)]*)\)/.exec(reason);
      if (api) reason = `${api[2]} (${api[1]})`;
      return `${source ? `${source}: ` : ''}${reason.slice(0, 120)}`;
    })
    .join('; ');
}

/** "<cause>: <details>" for a failed connect, from the connector's error. */
export function diagnoseConnectError(error: unknown): string {
  const message = messageOf(error);
  const name = error && typeof error === 'object' ? (error as object).constructor?.name ?? '' : '';
  const config = error && typeof error === 'object' ? (error as { config?: { requestErrs?: unknown[] } }).config : undefined;
  const subErrors = Array.isArray(config?.requestErrs) ? config.requestErrs : [];
  const all = [message, ...subErrors.map(messageOf)].join('\n');
  const details = subErrors.length ? sourceDetails(subErrors) : message;

  let cause: string;
  if (name === 'UserOfflineError' || /isn't online|user.*offline|LIVE has ended/i.test(all)) cause = TIKTOK_CAUSES.offline;
  else if (/user_not_found|19881007|InvalidUniqueId/i.test(all + name)) cause = TIKTOK_CAUSES.notFound;
  else if (/captcha|blocked by TikTok|SIGI_STATE HTML tag/i.test(all)) cause = TIKTOK_CAUSES.blocked;
  else if (/Rate Limited|rate_limit|Too many connections|SignatureRateLimit/i.test(all + name)) cause = TIKTOK_CAUSES.rateLimited;
  else if (/Sign Error|sign server|SignAPIError|illegal web id/i.test(all + name)) cause = TIKTOK_CAUSES.signServer;
  else if (/ConnectTimeout|timed? ?out|ETIMEDOUT/i.test(all + name)) cause = TIKTOK_CAUSES.timeout;
  else if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|ENETUNREACH|network|socket hang up|getaddrinfo/i.test(all)) cause = TIKTOK_CAUSES.network;
  else if (/Room ID/i.test(all)) cause = TIKTOK_CAUSES.noRoom;
  else return message;
  return details ? `${cause}: ${details}` : cause;
}

/**
 * Sign server 500 ("illegal web id") / missing cookies: Euler Stream rejects one
 * connection's ids, and a new connection usually gets through. Rate limits and
 * other errors are not retried.
 */
export function isRetryableSignError(error: unknown): boolean {
  const text = `${error && typeof error === 'object' ? (error as object).constructor?.name ?? '' : ''} ${messageOf(error)}`;
  return /Sign Error|Empty Cookies|sign server status 5\d\d/i.test(text) && !/Rate Limited|rate_limit/i.test(text);
}
