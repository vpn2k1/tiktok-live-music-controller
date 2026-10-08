/**
 * Pairing link of the desktop's phone screen, as shown in its QR code:
 * `http://<private LAN IPv4>:17322/phone#k=<token>`. The mobile apps (Capacitor
 * and Expo) only ever load a link that passes this check — never a URL that
 * merely came from a QR code or the clipboard.
 *
 * Kept free of DOM / Node APIs so the Expo app can import it too.
 */
export const PHONE_LINK_PORT = 17322;
export const PHONE_LINK_PATH = '/phone';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22,64}$/;

export interface PhoneLink {
  address: string;
  token: string;
  /** Canonical page URL (token in the hash). */
  url: string;
  /** `http://<address>:17322`, the only origin the app may load. */
  origin: string;
}

/** Private IPv4 ranges (10/8, 172.16/12, 192.168/16). */
export function isPrivateIPv4(address: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(address);
  if (!match) return false;
  const [a = 0, b = 0, c = 0, d = 0] = match.slice(1).map(Number);
  if ([a, b, c, d].some((part) => part > 255)) return false;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export function phoneLinkUrl(address: string, token: string): string {
  return `http://${address}:${PHONE_LINK_PORT}${PHONE_LINK_PATH}#k=${token}`;
}

/**
 * Parses a scanned / pasted pairing link strictly (scheme, private IPv4 host,
 * port, path, token), or null. No query, credentials or other hash params.
 */
export function parsePhoneLink(raw: unknown): PhoneLink | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  const match = /^http:\/\/(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})(\/[^?#]*)#k=([^&#]*)$/.exec(text);
  if (!match) return null;
  const [, address = '', port = '', path = '', token = ''] = match;
  if (!isPrivateIPv4(address) || Number(port) !== PHONE_LINK_PORT || path !== PHONE_LINK_PATH || !TOKEN_PATTERN.test(token)) return null;
  return { address, token, url: phoneLinkUrl(address, token), origin: `http://${address}:${PHONE_LINK_PORT}` };
}

/** True when `url` is the paired page itself (any hash), for navigation checks in a WebView. */
export function isPairedPage(url: string, link: PhoneLink): boolean {
  const withoutHash = url.split('#')[0] ?? '';
  return withoutHash === `${link.origin}${PHONE_LINK_PATH}`;
}
