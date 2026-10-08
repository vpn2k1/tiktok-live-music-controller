import { useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { bankFileToText } from '../game/bankFile';
import type { GameState } from '../game/engine';
import type { AnyGame } from '../game/registry';
import type { GameConfig, SettingField, TestAction, TestInput } from '../game/types';
import type { DictionaryLanguage } from '../game/useLiveGames';
import type { AiControl } from '../hooks/useAi';
import { BOT_SPEEDS, type DemoBot } from '../hooks/useDemoBot';
import type { OverlayGameView, ScoreEntry } from '../shared/types';
import { numberLocale, t } from '../shared/i18n';
import AiBankBox from './AiBankBox';
import Panel from './Panel';

const MAX_DICTIONARY_BYTES = 20 * 1024 * 1024;
/** Question/word bank files (the field itself keeps up to its maxLength characters). */
const MAX_BANK_FILE_BYTES = 2 * 1024 * 1024;
/** Games that can use an imported word list, and which language it is. */
const DICTIONARY_GAMES: Record<string, DictionaryLanguage> = { wordChain: 'vi', englishWordChain: 'en' };

/** Number format of the app language (1.440 / 1,440). */
function formatNumber(value: number): string {
  return value.toLocaleString(numberLocale());
}

function formatCountdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
}

/**
 * A textarea bank (questions, words…): import .txt/.csv, download the sample
 * file, and see which lines the game can use.
 */
function BankField({ game, field, value, disabled, onChange, ai }: {
  game: AnyGame;
  field: SettingField;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  ai: AiControl;
}) {
  const [notice, setNotice] = useState('');
  const [aiOpen, setAiOpen] = useState(false);

  function toggleAi(): void {
    if (!ai.ready) {
      setNotice(t('Thêm API key ở panel 🤖 AI tạo câu hỏi trước (Gemini, Groq hoặc Grok).'));
      return;
    }
    setAiOpen((open) => !open);
  }
  const report = useMemo(() => game.checkBank?.(field.key, value) ?? null, [field.key, game, value]);

  async function importFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_BANK_FILE_BYTES) {
      setNotice(t('File quá lớn (tối đa {mb} MB).', { mb: MAX_BANK_FILE_BYTES / 1024 / 1024 }));
      return;
    }
    const text = bankFileToText(await file.text(), file.name);
    const limit = field.maxLength ?? text.length;
    onChange(text.slice(0, limit));
    setNotice(text.length > limit
      ? t('Đã nhập “{name}” (cắt còn {limit} ký tự).', { name: file.name, limit: formatNumber(limit) })
      : t('Đã nhập “{name}”.', { name: file.name }));
  }

  async function saveSample(): Promise<void> {
    if (!field.sample) return;
    const result = await window.desktop.saveTextFile(`mau-${game.id}-${field.key}.txt`, field.sample);
    setNotice(result.ok ? t('Đã lưu file mẫu. Mở bằng Notepad/TextEdit hoặc Excel, sửa theo mẫu rồi bấm Nhập file.') : result.error ?? '');
  }

  return (
    <div className="inline-field stacked">
      <span className="bank-head">
        {t(field.label)}
        <small>{t('{n} dòng', { n: formatNumber(value.split('\n').filter((line) => line.trim()).length) })}</small>
        <span className="bank-actions">
          {field.sample ? (
            <button type="button" className={`button small ${aiOpen ? 'primary' : 'ghost'}`} disabled={disabled} onClick={toggleAi} title={ai.ready ? ai.activeLabel : undefined}>
              {t('✨ Tạo bằng AI')}
            </button>
          ) : null}
          {field.sample ? <button type="button" className="button small ghost" onClick={() => void saveSample()}>{t('⬇ File mẫu')}</button> : null}
          <label className={`button small ghost ${disabled ? 'disabled' : ''}`}>
            {t('📂 Nhập file')}
            <input type="file" accept=".txt,.csv,.tsv,text/plain,text/csv" hidden disabled={disabled} onChange={(event) => void importFile(event)} />
          </label>
        </span>
      </span>
      {aiOpen && !disabled ? (
        <AiBankBox
          game={game}
          field={field}
          value={value}
          ai={ai}
          onClose={() => setAiOpen(false)}
          onApply={(next, message) => {
            onChange(next);
            setNotice(message);
            setAiOpen(false);
          }}
        />
      ) : null}
      <textarea rows={4} value={value} maxLength={field.maxLength} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
      {report && value.trim() ? (
        <small className={`bank-report ${report.invalid.length ? 'warn' : 'ok'}`}>
          {t('✅ {n} dòng dùng được', { n: formatNumber(report.valid) })}
          {report.invalid.length
            ? ` · ${t('⚠ {n} dòng sai mẫu, sẽ bỏ qua: dòng {lines}', { n: report.invalid.length, lines: `${report.invalid.slice(0, 8).join(', ')}${report.invalid.length > 8 ? '…' : ''}` })}`
            : ''}
        </small>
      ) : null}
      {notice ? <small className="field-hint">{notice}</small> : null}
      {field.hint ? <small className="field-hint">{t(field.hint)}</small> : null}
    </div>
  );
}

function SettingInput({ game, field, value, disabled, onChange, ai }: {
  game: AnyGame;
  field: SettingField;
  value: string | number;
  disabled: boolean;
  onChange: (value: string | number) => void;
  ai: AiControl;
}) {
  if (field.type === 'textarea') return <BankField game={game} field={field} value={String(value)} disabled={disabled} onChange={onChange} ai={ai} />;
  return (
    <>
      <label className="inline-field flush">
        <span>{t(field.label)}</span>
        {field.type === 'select' ? (
          <select value={String(value)} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
            {field.options?.map((option) => <option key={option.value} value={option.value}>{t(option.label)}</option>)}
          </select>
        ) : (
          <input
            type={field.type === 'number' ? 'number' : 'text'}
            min={field.min}
            max={field.max}
            maxLength={field.maxLength}
            value={value}
            disabled={disabled}
            onChange={(event) => onChange(field.type === 'number' ? Number(event.target.value) : event.target.value)}
          />
        )}
      </label>
      {field.hint ? <p className="field-hint">{t(field.hint)}</p> : null}
    </>
  );
}

/** Compact live view of the round (the overlay shows the same data). */
function RoundStatus({ game, view }: { game: GameState; view: OverlayGameView }) {
  const teamTotal = view.teams ? view.teams[0].score + view.teams[1].score : 0;
  return (
    <div className="round-status">
      {view.headline ? <div className="game-headline">{view.headline}</div> : null}
      {view.hint ? <p className="field-hint">{view.hint}</p> : null}
      {view.progress ? (
        <div className="boss-hp">
          <span>{view.progress.label}: {view.progress.value} / {view.progress.max}</span>
          <span className="boss-bar"><span style={{ width: `${(view.progress.value / Math.max(1, view.progress.max)) * 100}%` }} /></span>
        </div>
      ) : null}
      {view.teams ? (
        <div className="team-bar">
          <span className="team-a" style={{ width: `${teamTotal ? (view.teams[0].score / teamTotal) * 100 : 50}%` }}>{view.teams[0].label}: {view.teams[0].score} ({view.teams[0].members})</span>
          <span className="team-b">{view.teams[1].label}: {view.teams[1].score} ({view.teams[1].members})</span>
        </div>
      ) : null}
      {view.race?.lanes.length ? (
        <ol className="vote-options">
          {view.race.lanes.map((lane, index) => (
            <li key={`${index}-${lane.label}`}>
              <span className="track-number">{index + 1}</span>
              <span className="track-name">{view.race?.icon} {lane.label}</span>
              <strong>{lane.value ?? `${lane.percent}%`}</strong>
            </li>
          ))}
        </ol>
      ) : null}
      {view.grow?.items.length ? (
        <ol className="vote-options">
          {view.grow.items.map((item, index) => (
            <li key={`${index}-${item.label}`}>
              <span className="track-number">{index + 1}</span>
              <span className="track-name">{item.label}</span>
              <strong>{item.value ?? `${item.steps}/${view.grow?.goal}`}</strong>
            </li>
          ))}
        </ol>
      ) : null}
      {view.arena?.players.length ? (
        <ol className="vote-options">
          {view.arena.players.filter((player) => player.state !== 'out').slice(0, 8).map((player, index) => (
            <li key={player.id}>
              <span className="track-number">{index + 1}</span>
              <span className="track-name">{player.label}</span>
              <strong>{player.value ?? `⌀ ${Math.round(player.r * 200)}`}</strong>
            </li>
          ))}
        </ol>
      ) : null}
      {view.crossword ? (
        <div className="cw-mini">
          {view.crossword.rows.map((row, index) => (
            <div key={index} className={`cw-mini-row ${row.state}`}>
              <span className="cw-mini-num">{index + 1}</span>
              {Array.from({ length: row.offset }, (_, pad) => <span key={`p${pad}`} className="cw-mini-pad" />)}
              {row.cells.map((letter, cell) => <span key={cell} className={`cw-mini-cell ${cell === row.keyIndex ? 'key' : ''}`}>{letter || '·'}</span>)}
            </div>
          ))}
          <div className="cw-mini-row keyword">🔑 {view.crossword.keyword.map((letter) => letter || '_').join(' ')}</div>
        </div>
      ) : null}
      {view.cards ? (
        <div className="cards-mini" style={{ gridTemplateColumns: `repeat(${view.cards.columns}, 1fr)` }}>
          {view.cards.cards.map((card, index) => <span key={index} className={`cards-mini-cell ${card.state}`}>{card.state === 'closed' ? card.label : card.face}</span>)}
        </div>
      ) : null}
      {view.grid ? (
        <div className={`grid-mini ${view.grid.kind}`} style={{ gridTemplateColumns: `repeat(${view.grid.columns}, 1fr)` }}>
          {view.grid.cells.map((cell, index) => (
            <span key={index} className={`grid-mini-cell ${cell.state}`} title={cell.sub}>{cell.text || cell.label || '·'}</span>
          ))}
        </div>
      ) : null}
      {view.wheel && view.wheel.target != null ? (
        <p className="field-hint">{view.wheel.spinning ? t('Đang quay…') : t('Ô vừa trúng: {segment}', { segment: view.wheel.segments[view.wheel.target] ?? '' })}</p>
      ) : null}
      {view.rows.length ? (
        <ol className="vote-options">
          {view.rows.map((row, index) => (
            <li key={`${index}-${row.label}`} className={row.highlight ? 'highlight' : ''}>
              <span className="track-number">{row.badge ?? ''}</span>
              <span className="track-name">{row.label}</span>
              <strong>{row.value ?? ''}</strong>
            </li>
          ))}
        </ol>
      ) : null}
      {game.message ? <p className="game-message">{game.message}</p> : null}
    </div>
  );
}

/** The game a round is running, or else the selected one. */
export function activeGameOf(games: AnyGame[], game: GameState, selectedId: string): AnyGame | undefined {
  const id = game.phase === 'running' && game.kind ? game.kind : selectedId;
  return games.find((item) => item.id === id) ?? games[0];
}

/** What viewers type for a game (chips). */
export function CommandList({ game }: { game: AnyGame }) {
  return (
    <div className="command-list">
      {game.commands.map((command) => (
        <span key={command.usage}><code>{t(command.usage)}</code> {t(command.description)}</span>
      ))}
    </div>
  );
}

interface LiveGameCardProps {
  games: AnyGame[];
  selectedId: string;
  game: GameState;
  view: OverlayGameView;
  remainingMs: number;
  bot: DemoBot;
  /** Opens the start popup (pick a game, run it or the group). */
  onOpenStart: () => void;
  onFinish: () => void;
  onCancel: () => void;
  /** Opens the test tools popup (null while LIVE without test tools). */
  onOpenTests: (() => void) | null;
}

/** Control tab: the round on air (countdown, end / cancel, live view) or a big start button. */
export function LiveGameCard(props: LiveGameCardProps) {
  const { game, view, bot } = props;
  const running = game.phase === 'running';
  const active = activeGameOf(props.games, game, props.selectedId);
  if (!active) return null;
  const demoRunning = running && bot.enabled;

  return (
    <Panel
      title={game.phase === 'idle' ? t('🎮 Chưa có game nào chạy') : `🎮 ${t(active.title)}`}
      aside={running ? <span className="live-badge">{t('● Đang chơi')}</span> : game.phase === 'ended' ? t('Vừa kết thúc') : null}
    >
      <div className="game-stack">
        <div className="control-bar">
          {running ? (
            <>
              <span className="countdown big">{game.endsAt == null ? 'LIVE' : formatCountdown(props.remainingMs)}</span>
              <button className="button primary" onClick={() => props.onFinish()} title={t('Chốt ván này; game tự chơi tiếp ván mới')}>{t('⏹ Chốt kết quả')}</button>
              <button className="button" onClick={props.onCancel} title={t('Huỷ ván này và dừng game')}>{t('✕ Huỷ')}</button>
              <button className="button" onClick={props.onOpenStart}>{t('⏭ Đổi game')}</button>
              {demoRunning ? <button className="button ghost" onClick={() => bot.setEnabled(false)}>{t('Tắt bot')}</button> : null}
            </>
          ) : (
            <button className="button primary large" onClick={props.onOpenStart}>{t('▶ Bắt đầu game')}</button>
          )}
          {props.onOpenTests ? <button className="button ghost" onClick={props.onOpenTests}>{t('🧪 Test')}</button> : null}
        </div>

        {game.phase !== 'idle' ? (
          <>
            <RoundStatus game={game} view={view} />
            <CommandList game={active} />
          </>
        ) : (
          <p className="empty-copy flush">{t('Bấm ▶ Bắt đầu game để chọn game và chơi, hoặc bật chạy tự động cả nhóm game.')}</p>
        )}
      </div>
    </Panel>
  );
}

interface GameSettingsFormProps {
  game: AnyGame;
  raw: Partial<GameConfig>;
  /** Settings are locked while this game's round runs. */
  locked: boolean;
  onConfigChange: (id: string, key: string, value: string | number) => void;
  onResetConfig: (id: string) => void;
  dictionaries: Record<DictionaryLanguage, { builtinCount: number; importedCount: number }>;
  onImportDictionary: (language: DictionaryLanguage, text: string) => void;
  onClearDictionary: (language: DictionaryLanguage) => void;
  ai: AiControl;
}

/** A game's settings (banks with file import / AI, word list for word chains, reset). */
export function GameSettingsForm(props: GameSettingsFormProps) {
  const { game, raw, locked } = props;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dictionaryLanguage = DICTIONARY_GAMES[game.id];
  const dictionaryInfo = dictionaryLanguage ? props.dictionaries[dictionaryLanguage] : null;

  async function handleDictionaryFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || file.size > MAX_DICTIONARY_BYTES || !dictionaryLanguage) return;
    props.onImportDictionary(dictionaryLanguage, await file.text());
  }

  return (
    <div className="game-stack">
      {locked ? <p className="field-hint">{t('Game đang chạy: chốt hoặc huỷ ván để sửa cài đặt.')}</p> : null}
      {game.settings.map((field) => (
        <SettingInput
          key={field.key}
          game={game}
          field={field}
          value={(raw[field.key] ?? game.defaultConfig[field.key]) as string | number}
          disabled={locked}
          onChange={(value) => props.onConfigChange(game.id, field.key, value)}
          ai={props.ai}
        />
      ))}
      {dictionaryLanguage && dictionaryInfo ? (
        <div className="dictionary-row">
          <span>{t(dictionaryLanguage === 'vi'
            ? 'Từ điển tiếng Việt: {builtin} từ có sẵn + {imported} từ đã nhập'
            : 'Từ điển tiếng Anh: {builtin} từ có sẵn + {imported} từ đã nhập', { builtin: dictionaryInfo.builtinCount, imported: dictionaryInfo.importedCount })}</span>
          <input ref={fileInputRef} type="file" accept=".txt,text/plain" style={{ display: 'none' }} onChange={(event) => void handleDictionaryFile(event)} />
          <button className="button small" onClick={() => fileInputRef.current?.click()}>{t('Nhập .txt')}</button>
          {dictionaryInfo.importedCount ? <button className="button small ghost" onClick={() => props.onClearDictionary(dictionaryLanguage)}>{t('Xoá')}</button> : null}
        </div>
      ) : null}
      <div>
        <button className="button small ghost" onClick={() => props.onResetConfig(game.id)} disabled={locked}>{t('Khôi phục cài đặt gốc')}</button>
      </div>
    </div>
  );
}

interface TestToolsProps {
  running: boolean;
  testActions: TestAction[];
  onTest: (input: TestInput) => void;
  bot: DemoBot;
  /** Generic test controls (commands, likes, gifts, free comment). */
  extra: ReactNode;
}

/** Fake viewers for the running game, the demo bot and generic events. */
export function TestTools({ running, testActions, onTest, bot, extra }: TestToolsProps) {
  return (
    <div className="game-stack">
      {running ? (
        <>
          <span className="fold-label">{t('Giả lập viewer chơi game này')}</span>
          <div className="check-row">
            {testActions.map((action, index) => (
              <button key={`${index}-${action.label}`} className="chip" onClick={() => onTest(action.input)}>{t(action.label)}</button>
            ))}
          </div>
          <div className="bot-row">
            <label className="bot-toggle">
              <input type="checkbox" checked={bot.enabled} onChange={(event) => bot.setEnabled(event.target.checked)} />
              {t('🤖 Bot tự chơi')}
            </label>
            {bot.enabled ? (
              <div className="segmented three" role="group" aria-label={t('Tốc độ bot')}>
                {BOT_SPEEDS.map((option) => (
                  <button key={option.value} className={bot.speed === option.value ? 'active' : ''} onClick={() => bot.setSpeed(option.value)}>{t(option.label)}</button>
                ))}
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <p className="field-hint">{t('Bấm ▶ Bắt đầu (hoặc 🤖 Chạy thử) để hiện nút giả lập cho game này.')}</p>
      )}
      {extra}
    </div>
  );
}

/** Points across every game until Reset. */
export function LeaderboardCard({ leaderboard, onReset }: { leaderboard: ScoreEntry[]; onReset: () => void }) {
  return (
    <Panel title={t('🏆 Bảng xếp hạng')} aside={<button className="button small ghost" onClick={onReset} disabled={!leaderboard.length}>Reset</button>}>
      {leaderboard.length ? (
        <ol className="vote-options">
          {leaderboard.map((entry, index) => (
            <li key={entry.user}>
              <span className="track-number">{index + 1}</span>
              <span className="track-name">{entry.nickname}</span>
              <strong>{entry.points}</strong>
            </li>
          ))}
        </ol>
      ) : (
        <p className="empty-copy flush">{t('Chưa có điểm. Điểm cộng dồn qua mọi game đến khi Reset.')}</p>
      )}
    </Panel>
  );
}
