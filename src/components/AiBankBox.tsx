import { useMemo, useState } from 'react';
import type { AnyGame } from '../game/registry';
import type { SettingField } from '../game/types';
import { aiErrorText, type AiControl } from '../hooks/useAi';
import { AI_MAX_COUNT, type AiContentLanguage, type AiDifficulty } from '../shared/ai';
import { t } from '../shared/i18n';

interface AiBankBoxProps {
  game: AnyGame;
  field: SettingField;
  /** Current bank text. */
  value: string;
  ai: AiControl;
  onApply: (value: string, message: string) => void;
  onClose: () => void;
}

const DIFFICULTIES: { value: AiDifficulty; label: string }[] = [
  { value: 'easy', label: 'Dễ' },
  { value: 'medium', label: 'Vừa' },
  { value: 'hard', label: 'Khó' }
];

const LANGUAGES: { value: AiContentLanguage; label: string }[] = [
  { value: 'sample', label: 'Theo mẫu của game' },
  { value: 'vi', label: 'Tiếng Việt' },
  { value: 'en', label: 'Tiếng Anh' }
];

function bankLines(text: string): string[] {
  return text.split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
}

/**
 * "✨ Tạo bằng AI" for one bank: topic → AI lines → the game's own parser keeps
 * the usable ones → the streamer reviews/edits, then appends or replaces.
 */
export default function AiBankBox({ game, field, value, ai, onApply, onClose }: AiBankBoxProps) {
  const [topic, setTopic] = useState('');
  const [count, setCount] = useState(10);
  const [difficulty, setDifficulty] = useState<AiDifficulty>('medium');
  const [language, setLanguage] = useState<AiContentLanguage>('sample');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  /** Generated lines the game accepts (editable before adding). */
  const [draft, setDraft] = useState<string | null>(null);
  const [dropped, setDropped] = useState(0);

  const isUsable = useMemo(() => {
    const check = game.checkBank;
    return (line: string) => (check ? check(field.key, line)?.valid === 1 : true);
  }, [field.key, game]);

  const draftLines = draft == null ? [] : bankLines(draft);
  const draftUsable = draftLines.filter(isUsable);

  async function generate(): Promise<void> {
    setBusy(true);
    setError('');
    try {
      const existingLines = bankLines(value);
      const existing = [...new Set(existingLines.map((line) => line.split('|')[0]?.trim() ?? '').filter(Boolean))].slice(0, 60);
      const result = await window.desktop.aiGenerate({
        game: `${game.title} — ${game.howTo}`,
        format: field.sample ?? field.hint ?? field.label,
        topic,
        count,
        difficulty,
        language,
        existing
      });
      if (!result.ok) {
        setError(aiErrorText(result));
        return;
      }
      const known = new Set(existingLines.map((line) => line.toLowerCase()));
      const fresh = result.lines.filter((line) => !known.has(line.toLowerCase()));
      const usable = fresh.filter(isUsable);
      setDropped(result.lines.length - usable.length);
      if (!usable.length) {
        setError(t('AI trả về {n} dòng nhưng không dòng nào đúng mẫu của game. Thử lại hoặc đổi chủ đề.', { n: result.lines.length }));
        setDraft(null);
        return;
      }
      setDraft(usable.join('\n'));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  function apply(mode: 'append' | 'replace'): void {
    const lines = draftUsable;
    if (!lines.length) return;
    const base = mode === 'append' ? bankLines(value) : [];
    const limit = field.maxLength ?? Number.POSITIVE_INFINITY;
    const kept: string[] = [];
    let length = base.join('\n').length;
    for (const line of lines) {
      const added = (length ? 1 : 0) + line.length;
      if (length + added > limit) break;
      kept.push(line);
      length += added;
    }
    const next = [...base, ...kept].join('\n');
    const skipped = lines.length - kept.length;
    onApply(next, skipped
      ? t('Đã thêm {n} dòng từ AI ({skipped} dòng không vừa giới hạn độ dài của ô).', { n: kept.length, skipped })
      : t('Đã thêm {n} dòng từ AI. Nhớ kiểm tra lại nội dung trước khi LIVE.', { n: kept.length }));
  }

  return (
    <div className="ai-box">
      <div className="ai-box-head">
        <strong>{t('✨ Tạo bằng AI')}</strong>
        <small>{ai.activeLabel}</small>
        <button type="button" className="button small ghost" onClick={onClose} aria-label={t('Đóng')}>✕</button>
      </div>

      <label className="inline-field stacked">
        <span>{t('Chủ đề')}</span>
        <input
          value={topic}
          maxLength={200}
          placeholder={t('vd: động vật, lịch sử Việt Nam, từ vựng du lịch… (để trống = đa dạng)')}
          onChange={(event) => setTopic(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !busy) void generate();
          }}
        />
      </label>
      <div className="ai-options">
        <label className="inline-field stacked">
          <span>{t('Số dòng')}</span>
          <input type="number" min={1} max={AI_MAX_COUNT} value={count} onChange={(event) => setCount(Math.min(AI_MAX_COUNT, Math.max(1, Number(event.target.value) || 1)))} />
        </label>
        <label className="inline-field stacked">
          <span>{t('Độ khó')}</span>
          <select value={difficulty} onChange={(event) => setDifficulty(event.target.value as AiDifficulty)}>
            {DIFFICULTIES.map((item) => <option key={item.value} value={item.value}>{t(item.label)}</option>)}
          </select>
        </label>
        <label className="inline-field stacked">
          <span>{t('Ngôn ngữ nội dung')}</span>
          <select value={language} onChange={(event) => setLanguage(event.target.value as AiContentLanguage)}>
            {LANGUAGES.map((item) => <option key={item.value} value={item.value}>{t(item.label)}</option>)}
          </select>
        </label>
      </div>
      <div className="control-bar">
        <button type="button" className="button primary small" disabled={busy} onClick={() => void generate()}>
          {busy ? t('⏳ Đang tạo…') : draft == null ? t('✨ Tạo') : t('🔄 Tạo lại')}
        </button>
        {busy ? <span className="field-hint">{t('AI thường mất 5–30 giây.')}</span> : null}
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      {draft != null ? (
        <>
          <small className={`bank-report ${draftUsable.length === draftLines.length ? 'ok' : 'warn'}`}>
            {t('✅ {n} dòng dùng được', { n: draftUsable.length })}
            {dropped ? ` · ${t('đã bỏ {n} dòng trùng hoặc sai mẫu', { n: dropped })}` : ''}
            {draftLines.length > draftUsable.length ? ` · ${t('⚠ {n} dòng bạn sửa bị sai mẫu, sẽ không thêm', { n: draftLines.length - draftUsable.length })}` : ''}
          </small>
          <textarea rows={6} value={draft} spellCheck={false} onChange={(event) => setDraft(event.target.value)} aria-label={t('Kết quả AI (sửa được)')} />
          <p className="field-hint">{t('Xem và sửa lại nếu cần: AI có thể sai kiến thức.')}</p>
          <div className="control-bar">
            <button type="button" className="button primary small" disabled={!draftUsable.length} onClick={() => apply('append')}>{t('➕ Thêm vào cuối')}</button>
            <button type="button" className="button small" disabled={!draftUsable.length} onClick={() => apply('replace')}>{t('🔁 Thay toàn bộ')}</button>
          </div>
        </>
      ) : null}
    </div>
  );
}
