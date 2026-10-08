import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { overlayConfigQuery } from '../shared/overlay';
import { t } from '../shared/i18n';
import type { TikTokStatus } from '../shared/types';
import { savedOverlaySetup } from './OverlayPanel';

interface QuickStartProps {
  status: TikTokStatus['status'];
  username: string;
  onUsernameChange: (value: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  /** Already translated. */
  connectMessage: string | null;
  /** Opens the connection popup (Euler key, test tools). */
  onOpenConnect: () => void;
  overlayUrl: string | null;
  /** Already translated. */
  overlayError: string | null;
  windowOpen: boolean;
  onOpenWindow: (config: ReturnType<typeof savedOverlaySetup>['windowConfig']) => void;
  onAction: (message: string) => void;
  /** Opens Cài đặt → OBS. */
  onOpenObsSettings: () => void;
  /** Name shown after "Đã kết nối" (null until connected). */
  connectedAs: string | null;
  groupName: string;
  groupSize: number;
  /** How the group runs, e.g. "viewer bầu chọn game tiếp theo…". */
  runHint: string;
  onRunGroup: () => void;
  onPickGame: () => void;
  /** "Chạy thử" without LIVE (null while LIVE). */
  onDemo: (() => void) | null;
}

function Step({ number, done, title, children }: { number: number; done: boolean; title: string; children: ReactNode }) {
  return (
    <li className={`quick-step ${done ? 'done' : ''}`}>
      <span className="quick-step-number" aria-hidden="true">{done ? '✓' : number}</span>
      <div className="quick-step-body">
        <h3>{title}{done ? <span className="sr-only"> ✓</span> : null}</h3>
        {children}
      </div>
    </li>
  );
}

/** Home page before a game runs: three steps, each with its action right here. */
export default function QuickStart(props: QuickStartProps) {
  const [linkCopied, setLinkCopied] = useState(false);
  const connected = props.status === 'connected';
  const busy = connected || props.status === 'connecting';

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter' && !busy) props.onConnect();
  }

  function copyLink(): void {
    if (!props.overlayUrl) return;
    const { linkConfig } = savedOverlaySetup();
    navigator.clipboard.writeText(`${props.overlayUrl}${overlayConfigQuery(linkConfig)}`)
      .then(() => {
        setLinkCopied(true);
        props.onAction(t('Đã copy link. OBS → Browser Source → dán link, {width}×{height}', { width: linkConfig.width, height: linkConfig.height }));
      })
      .catch((error: unknown) => props.onAction(t('Không copy được: {error}', { error: error instanceof Error ? error.message : String(error) })));
  }

  return (
    <section className="panel quick-start">
      <header className="panel-header"><h2>{t('🚀 3 bước để LIVE')}</h2></header>
      <ol className="quick-steps">
        <Step number={1} done={connected} title={t('Kết nối TikTok')}>
          {connected ? (
            <div className="quick-row">
              <span className="quick-ok">{t('Đã kết nối @{name}', { name: props.connectedAs ?? props.username.replace(/^@/, '') })}</span>
              <button className="button small ghost" onClick={props.onDisconnect}>{t('Ngắt kết nối')}</button>
            </div>
          ) : (
            <>
              <div className="connect-row">
                <input
                  className="text-input"
                  value={props.username}
                  onChange={(event) => props.onUsernameChange(event.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder={t('@username đang LIVE')}
                  aria-label={t('Username TikTok')}
                />
                {busy ? (
                  <button className="button" onClick={props.onDisconnect}>{t('Dừng')}</button>
                ) : (
                  <button className="button primary" onClick={props.onConnect}>{t('Kết nối')}</button>
                )}
              </div>
              {props.status === 'connecting' ? <p className="field-hint">{t('Đang kết nối…')}</p> : null}
              {props.connectMessage ? <p className="error-text">{props.connectMessage}</p> : null}
              <p className="field-hint">
                {t('Bật LIVE trên TikTok trước, rồi nhập username (phần sau @).')}{' '}
                <button className="link-button inline" onClick={props.onOpenConnect}>{t('Thêm key / tuỳ chọn')}</button>
              </p>
            </>
          )}
        </Step>

        <Step number={2} done={props.windowOpen || linkCopied} title={t('Đưa game lên màn hình LIVE')}>
          {props.overlayUrl ? (
            <>
              <div className="quick-row">
                <button className="button primary" onClick={() => props.onOpenWindow(savedOverlaySetup().windowConfig)}>
                  {props.windowOpen ? t('🔄 Cập nhật cửa sổ game') : t('🪟 Mở cửa sổ game')}
                </button>
                <button className="button" onClick={copyLink}>{t('📋 Copy link OBS')}</button>
              </div>
              <p className="field-hint">
                {t('OBS / TikTok LIVE Studio: thêm Window Capture “Game Overlay”, hoặc Browser Source rồi dán link.')}{' '}
                <button className="link-button inline" onClick={props.onOpenObsSettings}>{t('Chỉnh khung, vị trí')}</button>
              </p>
            </>
          ) : (
            <p className="error-text">{props.overlayError || t('Đang mở overlay server…')}</p>
          )}
        </Step>

        <Step number={3} done={false} title={t('Bắt đầu chơi')}>
          <div className="quick-row">
            <button className="button primary large" onClick={props.onRunGroup}>{t('▶ Tự chơi {n} game', { n: props.groupSize })}</button>
            <button className="button large" onClick={props.onPickGame}>{t('🎯 Chọn 1 game')}</button>
            {props.onDemo ? <button className="button ghost" onClick={props.onDemo}>{t('🤖 Chạy thử')}</button> : null}
          </div>
          <p className="field-hint">{t('Nhóm “{group}”: {hint}', { group: props.groupName, hint: props.runHint })}</p>
        </Step>
      </ol>
    </section>
  );
}
