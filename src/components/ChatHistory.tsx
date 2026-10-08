import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { chatLogText, filterChatLog, type ChatEntry } from '../shared/chatLog';
import { t } from '../shared/i18n';

interface ChatHistoryProps {
  log: ChatEntry[];
  locale: string;
  /** Streamer or moderator (gets a badge). */
  isHost: (user: string) => boolean;
  onClear: () => void;
  onNotify: (message: string) => void;
}

/** Rows rendered at once (the newest matching ones); the full log stays in memory. */
const SHOWN = 400;
/** Within this many pixels of the bottom counts as "following" the chat. */
const STICK_PX = 40;

const COLORS = ['#f43f5e', '#f59e0b', '#10b981', '#0ea5e9', '#8b5cf6', '#ec4899', '#14b8a6', '#6366f1'];

function colorOf(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length] as string;
}

function Avatar({ entry }: { entry: ChatEntry }) {
  const [broken, setBroken] = useState(false);
  if (entry.avatar && !broken) {
    return <img className="chat-avatar" src={entry.avatar} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} />;
  }
  return <span className="chat-avatar" style={{ background: colorOf(entry.user) }}>{Array.from(entry.nickname)[0]?.toUpperCase() ?? '?'}</span>;
}

/**
 * The LIVE's comments over time, like TikTok's chat: oldest at the top, new
 * ones at the bottom. Follows the newest comment unless the streamer scrolled
 * up to read; then a button shows how many came in meanwhile.
 */
export default function ChatHistory({ log, locale, isHost, onClear, onNotify }: ChatHistoryProps) {
  const [query, setQuery] = useState('');
  const [commentsOnly, setCommentsOnly] = useState(false);
  const [following, setFollowing] = useState(true);
  /** Newest entry the streamer has seen (the log is capped, so count by id, not length). */
  const [seenId, setSeenId] = useState<string | undefined>(undefined);
  const listRef = useRef<HTMLDivElement | null>(null);

  const matching = useMemo(() => filterChatLog(log, { query, commentsOnly }), [log, query, commentsOnly]);
  const shown = matching.slice(-SHOWN);
  const newest = log[log.length - 1]?.id;
  const unread = useMemo(() => {
    if (following) return 0;
    const index = seenId ? log.findIndex((entry) => entry.id === seenId) : -1;
    return log.length - 1 - index;
  }, [following, log, seenId]);

  // Keep the newest comment in view while following.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (list && following) list.scrollTop = list.scrollHeight;
  }, [newest, following, query, commentsOnly]);

  useEffect(() => {
    if (following) setSeenId(newest);
  }, [following, newest]);

  function onScroll(): void {
    const list = listRef.current;
    if (!list) return;
    const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < STICK_PX;
    if (atBottom !== following) setFollowing(atBottom);
  }

  function jumpToNewest(): void {
    setFollowing(true);
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }

  async function exportLog(): Promise<void> {
    if (!matching.length) return;
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const text = chatLogText(matching, locale, { gift: t('🎁 tặng'), follow: t('➕ đã follow') });
    const result = await window.desktop.saveTextFile(`binh-luan-${stamp}.txt`, text);
    if (result.ok) onNotify(t('Đã lưu {count} dòng bình luận.', { count: matching.length }));
    else if (result.error) onNotify(t('Không lưu được file: {error}', { error: result.error }));
  }

  const time = (at: number) => new Date(at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="chat-history">
      <div className="chat-tools">
        <input className="text-input chat-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('Tìm theo tên hoặc nội dung…')} />
        <label className="check-chip">
          <input type="checkbox" checked={commentsOnly} onChange={(event) => setCommentsOnly(event.target.checked)} />
          {t('Chỉ bình luận')}
        </label>
        <button className="button small" onClick={() => void exportLog()} disabled={!matching.length}>{t('Xuất .txt')}</button>
        <button className="button small ghost" onClick={onClear} disabled={!log.length}>{t('Xoá')}</button>
      </div>
      <div className="chat-list" ref={listRef} onScroll={onScroll}>
        {!shown.length ? (
          <p className="empty-copy">{log.length ? t('Không có bình luận nào khớp.') : t('Bình luận trong LIVE sẽ hiện ở đây theo thời gian.')}</p>
        ) : shown.map((entry) => (
          <div key={entry.id} className={`chat-row ${entry.kind} ${entry.kind === 'chat' && entry.text.trim().startsWith('!') ? 'command' : ''}`}>
            <Avatar entry={entry} />
            <div className="chat-body">
              <div className="chat-meta">
                <strong title={`@${entry.user}`}>{entry.nickname}</strong>
                {isHost(entry.user) ? <span className="chat-badge host">{t('Host')}</span> : null}
                {entry.simulated ? <span className="chat-badge test">test</span> : null}
                <time>{time(entry.at)}</time>
              </div>
              <p>
                {entry.kind === 'chat' ? entry.text : entry.kind === 'gift' ? `${t('🎁 tặng')} ${entry.text}` : t('➕ đã follow')}
              </p>
            </div>
          </div>
        ))}
      </div>
      <div className="chat-footer">
        <small>
          {matching.length > SHOWN
            ? t('Đang hiện {shown}/{total} dòng mới nhất', { shown: SHOWN, total: matching.length })
            : t('{count} dòng', { count: matching.length })}
        </small>
        {unread > 0 ? <button className="button small primary" onClick={jumpToNewest}>{t('↓ {count} bình luận mới', { count: unread })}</button> : null}
      </div>
    </div>
  );
}
