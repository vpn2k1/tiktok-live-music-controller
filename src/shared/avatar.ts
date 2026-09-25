/**
 * Viewer profile pictures from TikTok events. Only HTTPS images on TikTok's own
 * image CDNs are accepted (main checks events, the overlay checks again, and the
 * overlay page's CSP allows exactly these hosts), so a crafted event can't make
 * the overlay load anything else.
 */
export const AVATAR_HOST_SUFFIXES = ['tiktokcdn.com', 'tiktokcdn-us.com', 'tiktokcdn-eu.com', 'ibyteimg.com', 'byteimg.com'];

/** `img-src` sources for the overlay page's Content-Security-Policy. */
export const AVATAR_CSP_SOURCES = AVATAR_HOST_SUFFIXES.map((suffix) => `https://*.${suffix}`).join(' ');

/** The URL if it is an HTTPS image on a TikTok CDN host, else null. */
export function safeAvatarUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  return AVATAR_HOST_SUFFIXES.some((suffix) => host.endsWith(`.${suffix}`)) ? url.toString() : null;
}

function urlsOf(image: unknown): string[] {
  if (!image || typeof image !== 'object') return [];
  const record = image as Record<string, unknown>;
  // Protobuf v2 `Image.url`, v1 `ProfilePicture.urls`, web API `urlList`.
  for (const key of ['url', 'urls', 'urlList']) {
    const list = record[key];
    if (Array.isArray(list)) return list.filter((item): item is string => typeof item === 'string');
  }
  return [];
}

/**
 * Best small profile picture of an event's `user` (TikTok lists several sizes;
 * prefer a ~100 px one), or null.
 */
export function avatarFromUser(user: unknown, fallback?: unknown): string | null {
  const record = user && typeof user === 'object' ? (user as Record<string, unknown>) : {};
  const candidates = [
    ...urlsOf(record.profilePicture),
    ...urlsOf(record.profilePictureMedium),
    ...urlsOf(record.avatarThumb),
    ...(typeof record.profilePictureUrl === 'string' ? [record.profilePictureUrl] : []),
    ...(typeof fallback === 'string' ? [fallback] : [])
  ];
  const safe = candidates.map(safeAvatarUrl).filter((url): url is string => url != null);
  return safe.find((url) => /100[x:]100/.test(url)) ?? safe[0] ?? null;
}
