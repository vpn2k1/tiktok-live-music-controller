import type { LiveEvent } from './types';

/**
 * Comment history of the LIVE (oldest first, like TikTok's chat): comments,
 * plus gifts and follows as small system lines. Likes and joins stream too
 * fast to read and stay in the LIVE log only. Viewer text is data: it is only
 * shown as text and written to a file the streamer picks.
 */
export interface ChatEntry {
  id: string;
  kind: 'chat' | 'gift' | 'follow';
  user: string;
  nickname: string;
  /** The comment, or "Rose ×5" for a gift. */
  text: string;
  at: number;
  avatar?: string;
  simulated?: boolean;
}

/** Entries kept in memory (older ones drop off). */
export const CHAT_LOG_MAX = 2000;

export function toChatEntry(event: LiveEvent): ChatEntry | null {
  const base = { id: event.id, user: event.user, nickname: event.nickname || event.user, at: event.at, avatar: event.avatar, simulated: event.simulated };
  if (event.type === 'chat' && 'comment' in event) return { ...base, kind: 'chat', text: event.comment };
  if (event.type === 'gift' && 'giftName' in event) return { ...base, kind: 'gift', text: `${event.giftName} ×${event.count}` };
  if (event.type === 'follow') return { ...base, kind: 'follow', text: '' };
  return null;
}

/** Adds a batch of events (in arrival order) and keeps the newest `max` entries. */
export function appendChatLog(log: ChatEntry[], events: LiveEvent[], max = CHAT_LOG_MAX): ChatEntry[] {
  const added = events.flatMap((event) => {
    const entry = toChatEntry(event);
    return entry ? [entry] : [];
  });
  if (!added.length) return log;
  const next = log.length + added.length > max ? [...log, ...added].slice(-max) : [...log, ...added];
  return next;
}

/** Folds case and Vietnamese accents so "cam on" finds "Cảm ơn". */
function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
}

export function filterChatLog(log: ChatEntry[], options: { query: string; commentsOnly: boolean }): ChatEntry[] {
  const query = fold(options.query.trim());
  return log.filter((entry) => {
    if (options.commentsOnly && entry.kind !== 'chat') return false;
    if (!query) return true;
    return fold(`${entry.nickname} ${entry.user} ${entry.text}`).includes(query);
  });
}

/** "HH:MM:SS  Name (@user): comment" lines for the exported .txt. */
export function chatLogText(log: ChatEntry[], locale: string, labels: { gift: string; follow: string }): string {
  return log
    .map((entry) => {
      const time = new Date(entry.at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const who = `${entry.nickname} (@${entry.user})`;
      const what = entry.kind === 'chat' ? entry.text : entry.kind === 'gift' ? `${labels.gift} ${entry.text}` : labels.follow;
      return `${time}  ${who}: ${what}${entry.simulated ? ' [test]' : ''}`;
    })
    .join('\n');
}
