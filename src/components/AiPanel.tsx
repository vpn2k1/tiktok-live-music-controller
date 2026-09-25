import { useEffect, useRef, useState, type FormEvent } from 'react';
import { aiErrorText, type AiControl } from '../hooks/useAi';
import { AI_PROVIDERS, providerInfo, type AiProvider } from '../shared/ai';
import { t } from '../shared/i18n';
import Panel from './Panel';

/**
 * API keys for AI question generation. Keys are sent once to main, which
 * encrypts and keeps them; this panel only ever sees "saved (…a1b2)".
 */
export default function AiPanel({ ai }: { ai: AiControl }) {
  const { status, setStatus } = ai;
  const [shown, setShown] = useState<AiProvider>('gemini');
  const [keyInput, setKeyInput] = useState('');
  const [modelInput, setModelInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  // Open on the saved provider once main answers; afterwards the tabs follow clicks.
  const initialized = useRef(false);
  useEffect(() => {
    if (status && !initialized.current) {
      initialized.current = true;
      setShown(status.active);
    }
  }, [status]);

  const provider = providerInfo(shown);
  const current = status?.providers[shown] ?? null;

  useEffect(() => {
    setModelInput(current?.model ?? provider.defaultModel);
    setKeyInput('');
  }, [current?.model, provider.defaultModel, shown]);

  if (!window.desktop) return null;

  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    setNotice(null);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  function selectProvider(id: AiProvider): void {
    setShown(id);
    setNotice(null);
    // The provider you look at is the one used for generation.
    void window.desktop.aiSetSettings({ active: id }).then((result) => {
      if (result.ok) setStatus(result.status);
    });
  }

  function saveKey(event: FormEvent): void {
    event.preventDefault();
    if (!keyInput.trim()) return;
    void run(async () => {
      const result = await window.desktop.aiSetKey(shown, keyInput);
      if (!result.ok) {
        setNotice({ ok: false, text: aiErrorText(result) });
        return;
      }
      setStatus(result.status);
      setKeyInput('');
      const test = await window.desktop.aiTest(shown);
      setNotice(test.ok
        ? { ok: true, text: t('Đã lưu key và kết nối thử thành công.') }
        : { ok: false, text: `${t('Đã lưu key nhưng kết nối thử lỗi:')} ${aiErrorText(test)}` });
    });
  }

  function removeKey(): void {
    void run(async () => {
      const result = await window.desktop.aiSetKey(shown, null);
      if (result.ok) {
        setStatus(result.status);
        setNotice({ ok: true, text: t('Đã xoá key.') });
      } else {
        setNotice({ ok: false, text: aiErrorText(result) });
      }
    });
  }

  function testKey(): void {
    void run(async () => {
      const result = await window.desktop.aiTest(shown);
      setNotice(result.ok ? { ok: true, text: t('Kết nối thành công, key dùng được.') } : { ok: false, text: aiErrorText(result) });
    });
  }

  function saveModel(model: string): void {
    const next = model.trim();
    if (next === (current?.model ?? provider.defaultModel)) return;
    void run(async () => {
      const result = await window.desktop.aiSetSettings({ provider: shown, model: next === provider.defaultModel ? '' : next });
      if (result.ok) {
        setStatus(result.status);
        setNotice({ ok: true, text: t('Đã đổi model: {model}', { model: result.status.providers[shown].model }) });
      } else {
        setModelInput(current?.model ?? provider.defaultModel);
        setNotice({ ok: false, text: aiErrorText(result) });
      }
    });
  }

  return (
    <Panel title={t('🤖 AI tạo câu hỏi')} aside={ai.ready ? t('✅ Sẵn sàng') : t('Chưa có key')}>
      <div className="game-stack ai-panel">
        <p className="field-hint">
          {t('Dùng AI tạo câu hỏi và đáp án cho các game có bộ câu hỏi: mở ⚙ Cài đặt game → ✨ Tạo bằng AI. Bạn xem lại trước khi thêm vào.')}
        </p>
        <div className="segmented three" role="group" aria-label={t('Nhà cung cấp AI')}>
          {AI_PROVIDERS.map((item) => (
            <button key={item.id} type="button" className={shown === item.id ? 'active' : ''} onClick={() => selectProvider(item.id)}>
              {item.label}{status?.providers[item.id].hasKey ? ' ✓' : ''}
            </button>
          ))}
        </div>

        <p className="ai-key-state">
          {current?.hasKey
            ? t('🔐 Đã lưu key {hint}. Key được mã hoá trên máy này, app không hiển thị lại.', { hint: current.hint ?? '' })
            : t('Chưa có key {provider}. Tạo key miễn phí tại {url} rồi dán vào ô dưới.', { provider: provider.label, url: provider.keyUrl })}
        </p>

        <form className="ai-key-row" onSubmit={saveKey}>
          <input
            className="text-input"
            type="password"
            value={keyInput}
            autoComplete="off"
            spellCheck={false}
            maxLength={400}
            placeholder={current?.hasKey ? t('Dán key mới để thay') : t('Dán API key vào đây')}
            aria-label={t('API key {provider}', { provider: provider.label })}
            onChange={(event) => setKeyInput(event.target.value)}
          />
          <button className="button primary small" type="submit" disabled={busy || !keyInput.trim()}>{t('💾 Lưu key')}</button>
        </form>

        <div className="control-bar">
          <button className="button small" type="button" disabled={busy || !current?.hasKey} onClick={testKey}>{t('🔌 Kiểm tra')}</button>
          {current?.hasKey ? <button className="button small ghost" type="button" disabled={busy} onClick={removeKey}>{t('🗑 Xoá key')}</button> : null}
          {busy ? <span className="field-hint">{t('Đang xử lý…')}</span> : null}
        </div>

        <label className="inline-field flush">
          <span>{t('Model')}</span>
          <input
            value={modelInput}
            maxLength={80}
            spellCheck={false}
            placeholder={provider.defaultModel}
            disabled={busy}
            onChange={(event) => setModelInput(event.target.value)}
            onBlur={() => saveModel(modelInput || provider.defaultModel)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') saveModel(modelInput || provider.defaultModel);
            }}
          />
        </label>
        <p className="field-hint">{t('Mặc định: {model}. Để trống = mặc định. Đổi model nếu nhà cung cấp ngừng hỗ trợ model cũ.', { model: provider.defaultModel })}</p>

        {notice ? <p className={notice.ok ? 'ai-notice ok' : 'ai-notice warn'} role="status">{notice.text}</p> : null}
        {status && !status.persistent ? (
          <p className="error-text">{t('Máy này không mã hoá được key, nên key chỉ được giữ đến khi tắt app.')}</p>
        ) : null}
      </div>
    </Panel>
  );
}
