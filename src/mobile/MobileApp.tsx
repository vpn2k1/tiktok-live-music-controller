import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { t } from '../shared/i18n';
import { parsePhoneLink, PHONE_LINK_PATH, type PhoneLink } from '../shared/phoneLink';
import { isNative, onBackButton, scanQr, setShowing } from './native';

const STORAGE_KEY = 'phone-link';
/** Wait between attempts while the computer can't be reached. */
const RETRY_MS = 3000;
const PROBE_TIMEOUT_MS = 4000;
/** Hold the top-left corner this long to open the menu. */
const HOLD_MS = 1200;

function loadLink(): PhoneLink | null {
  try {
    return parsePhoneLink(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function saveLink(link: PhoneLink): void {
  try {
    localStorage.setItem(STORAGE_KEY, link.url);
  } catch {
    // Storage unavailable: pair again next time.
  }
}

/** True when the computer's phone page answers (any HTTP answer counts; the page itself checks the code). */
async function reachable(link: PhoneLink): Promise<boolean> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    await fetch(`${link.origin}${PHONE_LINK_PATH}`, { method: 'HEAD', mode: 'no-cors', cache: 'no-store', signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

function Pairing({ saved, onPaired, onOpen }: { saved: PhoneLink | null; onPaired: (link: PhoneLink) => void; onOpen: () => void }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  function accept(raw: string | null): void {
    if (raw == null) return;
    const link = parsePhoneLink(raw);
    if (!link) {
      setError(t('Link không hợp lệ. Hãy quét mã QR trong panel 📱 LIVE bằng điện thoại trên máy tính.'));
      return;
    }
    setError(null);
    onPaired(link);
  }

  async function scan(): Promise<void> {
    try {
      accept(await scanQr(t('Đưa mã QR trên máy tính vào khung')));
    } catch (reason) {
      setError(t('Không mở được camera: {error}', { error: reason instanceof Error ? reason.message : String(reason) }));
    }
  }

  function submit(event: FormEvent): void {
    event.preventDefault();
    accept(text);
  }

  return (
    <main className="pair">
      <h1>{t('📱 Màn hình LIVE')}</h1>
      <p className="pair-lead">{t('Hiện màn game từ app TikLiveVPN trên máy tính, toàn màn hình, để LIVE bằng chế độ chia sẻ màn hình của TikTok.')}</p>
      {saved ? (
        <section className="pair-card">
          <p>{t('Máy tính đã ghép nối: {address}', { address: saved.address })}</p>
          <button type="button" className="pair-button primary" onClick={onOpen}>{t('▶ Mở màn game')}</button>
        </section>
      ) : null}
      <section className="pair-card">
        <ol className="pair-steps">
          <li>{t('Cho điện thoại vào cùng mạng Wi-Fi với máy tính.')}</li>
          <li>{t('Trên máy tính: TikLiveVPN → panel 📱 LIVE bằng điện thoại → Bật màn hình điện thoại.')}</li>
          <li>{t('Quét mã QR hiện trên máy tính.')}</li>
        </ol>
        {isNative ? <button type="button" className="pair-button primary" onClick={() => void scan()}>{t('📷 Quét mã QR')}</button> : null}
        <form className="pair-form" onSubmit={submit}>
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="http://192.168.x.x:17322/phone#k=…"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            inputMode="url"
            aria-label={t('Hoặc dán link')}
          />
          <button type="submit" className="pair-button">{t('Kết nối')}</button>
        </form>
        {error ? <p className="pair-error">{error}</p> : null}
      </section>
      <p className="pair-hint">{t('Khi đang hiện game: giữ ngón tay ở góc trên bên trái (hoặc nút Back trên Android) để mở menu.')}</p>
    </main>
  );
}

function Screen({ link, onLeave }: { link: PhoneLink; onLeave: () => void }) {
  const [online, setOnline] = useState<boolean | null>(null);
  const [frameKey, setFrameKey] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const holdTimer = useRef<number | null>(null);

  // Show the frame only once the computer answers, so a closed app gives a clear message instead of a WebView error page.
  useEffect(() => {
    if (online) return undefined;
    let cancelled = false;
    let timer: number | null = null;
    const attempt = async () => {
      const ok = await reachable(link);
      if (cancelled) return;
      setOnline(ok);
      if (!ok) timer = window.setTimeout(() => void attempt(), RETRY_MS);
    };
    void attempt();
    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
    };
  }, [link, online, frameKey]);

  useEffect(() => {
    void setShowing(true);
    return () => void setShowing(false);
  }, []);

  useEffect(() => onBackButton(() => setMenuOpen((open) => !open)), []);

  const reload = useCallback(() => {
    setMenuOpen(false);
    setOnline(null);
    setFrameKey((key) => key + 1);
  }, []);

  function startHold(): void {
    holdTimer.current = window.setTimeout(() => setMenuOpen(true), HOLD_MS);
  }

  function endHold(): void {
    if (holdTimer.current != null) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
  }

  return (
    <div className="screen">
      {online ? (
        <iframe
          key={frameKey}
          className="screen-frame"
          src={link.url}
          title={t('Màn game')}
          // Its own origin (the computer), scripts on; no popups, top navigation or forms. No access to the app's plugins.
          sandbox="allow-scripts allow-same-origin"
          allow="autoplay"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="screen-status">
          <p>
            {online === null
              ? t('Đang kết nối tới máy tính {address}…', { address: link.address })
              : t('Không kết nối được máy tính {address}. Kiểm tra app trên máy tính đã bật màn hình điện thoại và hai máy cùng Wi-Fi. Đang tự thử lại…', { address: link.address })}
          </p>
          <button type="button" className="pair-button" onClick={onLeave}>{t('Đổi máy tính')}</button>
        </div>
      )}
      <div
        className="screen-corner"
        onPointerDown={startHold}
        onPointerUp={endHold}
        onPointerLeave={endHold}
        onPointerCancel={endHold}
        aria-hidden="true"
      />
      {menuOpen ? (
        <div className="screen-menu" role="dialog" aria-label={t('Menu')}>
          <button type="button" className="pair-button primary" onClick={reload}>{t('🔄 Tải lại')}</button>
          <button type="button" className="pair-button" onClick={onLeave}>{t('Đổi máy tính')}</button>
          <button type="button" className="pair-button" onClick={() => setMenuOpen(false)}>{t('Đóng')}</button>
        </div>
      ) : null}
    </div>
  );
}

export default function MobileApp() {
  const [link, setLink] = useState<PhoneLink | null>(loadLink);
  // A paired phone opens straight on the game screen.
  const [showing, setShowingState] = useState(() => link != null);

  if (showing && link) return <Screen link={link} onLeave={() => setShowingState(false)} />;
  return (
    <Pairing
      saved={link}
      onOpen={() => setShowingState(true)}
      onPaired={(next) => {
        saveLink(next);
        setLink(next);
        setShowingState(true);
      }}
    />
  );
}
