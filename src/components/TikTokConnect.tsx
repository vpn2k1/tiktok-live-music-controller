import { useEffect, useState, type KeyboardEvent } from 'react';
import { t } from '../shared/i18n';
import type { SignKeyStatus, TikTokStatus } from '../shared/types';
import Modal from './Modal';

/**
 * Euler Stream API key (TikTok LIVE signing). Saved encrypted in main; the
 * app only shows whether a key is set and its last 4 characters.
 */
export function SignKeyField() {
  const [status, setStatus] = useState<SignKeyStatus | null>(null);
  const [value, setValue] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void window.desktop?.signKeyStatus().then(setStatus);
  }, []);

  async function save(key: string | null): Promise<void> {
    const result = await window.desktop.setSignKey(key);
    if (!result) return;
    setStatus(result.status);
    if (result.ok) {
      setValue('');
      setNotice(key ? t('Đã lưu key. Lần kết nối sau sẽ dùng key này.') : t('Đã xoá key.'));
    } else {
      // Main's errors are Vietnamese source texts.
      setNotice(t(result.error ?? ''));
    }
  }

  return (
    <div className="game-stack">
      <p className="field-hint">
        {t('Key của Euler Stream (dịch vụ ký kết nối TikTok LIVE) giúp kết nối ổn định hơn và ít bị giới hạn số lần kết nối. Không bắt buộc: không có key app vẫn thử các cách khác. Lấy key ở trang eulerstream.com.')}
      </p>
      <p className="sign-key-state">
        {status?.hasKey
          ? t('🔑 Đang dùng key {hint}', { hint: status.hint ?? '' })
          : t('Chưa có key')}
        {status?.fromEnv ? ` · ${t('từ biến môi trường SIGN_API_KEY')}` : ''}
      </p>
      {status?.fromEnv ? null : (
        <form
          className="connect-row"
          onSubmit={(event) => {
            event.preventDefault();
            if (value.trim()) void save(value);
          }}
        >
          <input
            className="text-input"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={t('Dán key Euler Stream')}
            aria-label={t('Key Euler Stream')}
          />
          <button className="button primary" type="submit" disabled={!value.trim()}>{t('Lưu key')}</button>
          {status?.hasKey ? <button className="button ghost" type="button" onClick={() => void save(null)}>{t('Xoá key')}</button> : null}
        </form>
      )}
      {status && !status.persistent ? <p className="field-hint">{t('Máy không mã hoá được key: key chỉ giữ đến khi tắt app.')}</p> : null}
      {notice ? <p className="field-hint">{notice}</p> : null}
    </div>
  );
}

interface ConnectModalProps {
  username: string;
  onUsernameChange: (value: string) => void;
  status: TikTokStatus['status'];
  roomId: string | number | null | undefined;
  /** Already translated. */
  message: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  testVisible: boolean;
  onShowTestTools: (show: boolean) => void;
  onClose: () => void;
}

/** Topbar popup: connect to a LIVE, see why it failed, set the Euler key. */
export function ConnectModal(props: ConnectModalProps) {
  const busy = props.status === 'connected' || props.status === 'connecting';

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter' && !busy) props.onConnect();
  }

  return (
    <Modal title={t('📡 Kết nối TikTok LIVE')} onClose={props.onClose}>
      <div className="game-stack">
        <div className="connect-row">
          <input
            className="text-input"
            value={props.username}
            onChange={(event) => props.onUsernameChange(event.target.value)}
            placeholder={t('@username đang LIVE')}
            onKeyDown={onKeyDown}
            autoFocus
          />
          {busy ? (
            <button className="button" onClick={props.onDisconnect}>{t('Ngắt kết nối')}</button>
          ) : (
            <button className="button primary" onClick={props.onConnect}>{t('Kết nối')}</button>
          )}
        </div>
        {props.roomId ? <p className="field-hint">Room {props.roomId}</p> : null}
        {props.message ? <p className="error-text">{props.message}</p> : null}
        {props.status === 'connected' ? (
          props.testVisible ? (
            <p className="error-text">{t('Đang LIVE: công cụ test đang bật, event test sẽ tác động lên game thật.')} <button className="link-button" onClick={() => props.onShowTestTools(false)}>{t('Ẩn')}</button></p>
          ) : (
            <button className="link-button" onClick={() => props.onShowTestTools(true)}>{t('Hiện công cụ test')}</button>
          )
        ) : (
          <p className="field-hint">{t('Chưa LIVE vẫn thử được: chọn game rồi bấm 🤖 Chạy thử.')}</p>
        )}
        <details className="fold">
          <summary>{t('🔑 Key Euler Stream (tuỳ chọn)')}</summary>
          <div className="fold-body"><SignKeyField /></div>
        </details>
      </div>
    </Modal>
  );
}
