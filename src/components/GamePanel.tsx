import { useRef, type ChangeEvent, type ReactNode } from 'react';
import type { GameState } from '../game/engine';
import type { AnyGame } from '../game/registry';
import type { GameConfig, SettingField, TestAction, TestInput } from '../game/types';
import type { DictionaryLanguage } from '../game/useLiveGames';
import { BOT_SPEEDS, type DemoBot } from '../hooks/useDemoBot';
import type { OverlayGameView, ScoreEntry } from '../shared/types';
import Panel from './Panel';

interface GamePanelProps {
  games: AnyGame[];
  selectedId: string;
  rawConfigs: Record<string, Partial<GameConfig>>;
  onConfigChange: (id: string, key: string, value: string | number) => void;
  onResetConfig: (id: string) => void;
  game: GameState;
  view: OverlayGameView;
  remainingMs: number;
  leaderboard: ScoreEntry[];
  onStart: () => void;
  onFinish: () => void;
  onCancel: () => void;
  onResetScores: () => void;
  dictionaries: Record<DictionaryLanguage, { builtinCount: number; importedCount: number }>;
  onImportDictionary: (language: DictionaryLanguage, text: string) => void;
  onClearDictionary: (language: DictionaryLanguage) => void;
  /** Test tools + "Chạy thử" are only offered while TikTok isn't connected (or on request). */
  testVisible: boolean;
  testActions: TestAction[];
  onTest: (input: TestInput) => void;
  bot: DemoBot;
  /** "Chạy thử": start with the demo bot. */
  onDemo: () => void;
  /** Extra generic test controls (follow/join/free comment) rendered inside the Test section. */
  extraTestTools: ReactNode;
}

const MAX_DICTIONARY_BYTES = 20 * 1024 * 1024;
/** Games that can use an imported word list, and which language it is. */
const DICTIONARY_GAMES: Record<string, DictionaryLanguage> = { wordChain: 'vi', englishWordChain: 'en' };

function formatCountdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
}

function SettingInput({ field, value, disabled, onChange }: {
  field: SettingField;
  value: string | number;
  disabled: boolean;
  onChange: (value: string | number) => void;
}) {
  if (field.type === 'textarea') {
    return (
      <label className="inline-field stacked">
        <span>{field.label}</span>
        <textarea rows={4} value={String(value)} maxLength={field.maxLength} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
        {field.hint ? <small className="field-hint">{field.hint}</small> : null}
      </label>
    );
  }
  return (
    <>
      <label className="inline-field flush">
        <span>{field.label}</span>
        {field.type === 'select' ? (
          <select value={String(value)} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
            {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
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
      {field.hint ? <p className="field-hint">{field.hint}</p> : null}
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
              <strong>{lane.percent}%</strong>
            </li>
          ))}
        </ol>
      ) : null}
      {view.wheel && view.wheel.target != null ? (
        <p className="field-hint">{view.wheel.spinning ? 'Đang quay…' : `Ô vừa trúng: ${view.wheel.segments[view.wheel.target] ?? ''}`}</p>
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

export default function GamePanel(props: GamePanelProps) {
  const { game, view, bot } = props;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const running = game.phase === 'running';
  const activeId = running && game.kind ? game.kind : props.selectedId;
  const active = props.games.find((item) => item.id === activeId) ?? props.games[0];
  const raw = props.rawConfigs[active?.id ?? ''] ?? {};
  const dictionaryLanguage = active ? DICTIONARY_GAMES[active.id] : undefined;
  const dictionaryInfo = dictionaryLanguage ? props.dictionaries[dictionaryLanguage] : null;
  const demoRunning = running && bot.enabled;

  async function handleDictionaryFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || file.size > MAX_DICTIONARY_BYTES || !dictionaryLanguage) return;
    props.onImportDictionary(dictionaryLanguage, await file.text());
  }

  if (!active) return null;

  return (
    <Panel title={`③ ${active.title}`} aside={running ? <span className="live-badge">● Đang chơi</span> : game.phase === 'ended' ? 'Vừa kết thúc' : 'Sẵn sàng'}>
      <div className="game-stack">
        <div className="control-bar">
          {running ? (
            <>
              <span className="countdown big">{game.endsAt == null ? 'LIVE' : formatCountdown(props.remainingMs)}</span>
              <button className="button primary" onClick={props.onFinish}>⏹ Chốt kết quả</button>
              <button className="button" onClick={props.onCancel}>✕ Huỷ</button>
              {demoRunning ? <button className="button ghost" onClick={() => bot.setEnabled(false)}>Tắt bot</button> : null}
            </>
          ) : (
            <>
              <button className="button primary large" onClick={props.onStart}>▶ Bắt đầu</button>
              {props.testVisible ? (
                <button className="button" onClick={props.onDemo} title="Bắt đầu và cho viewer ảo tự chơi để xem overlay">🤖 Chạy thử</button>
              ) : null}
            </>
          )}
        </div>

        {game.phase !== 'idle' ? <RoundStatus game={game} view={view} /> : <p className="game-howto">{active.howTo}</p>}

        <div className="command-list">
          {active.commands.map((command) => (
            <span key={command.usage}><code>{command.usage}</code> {command.description}</span>
          ))}
        </div>

        <details className="fold">
          <summary>⚙ Cài đặt game</summary>
          <div className="fold-body">
            {active.settings.map((field) => (
              <SettingInput
                key={field.key}
                field={field}
                value={(raw[field.key] ?? active.defaultConfig[field.key]) as string | number}
                disabled={running}
                onChange={(value) => props.onConfigChange(active.id, field.key, value)}
              />
            ))}
            {dictionaryLanguage && dictionaryInfo ? (
              <div className="dictionary-row">
                <span>Từ điển {dictionaryLanguage === 'vi' ? 'tiếng Việt' : 'tiếng Anh'}: {dictionaryInfo.builtinCount} từ có sẵn + {dictionaryInfo.importedCount} từ đã nhập</span>
                <input ref={fileInputRef} type="file" accept=".txt,text/plain" style={{ display: 'none' }} onChange={(event) => void handleDictionaryFile(event)} />
                <button className="button small" onClick={() => fileInputRef.current?.click()}>Nhập .txt</button>
                {dictionaryInfo.importedCount ? <button className="button small ghost" onClick={() => props.onClearDictionary(dictionaryLanguage)}>Xoá</button> : null}
              </div>
            ) : null}
            <button className="button small ghost" onClick={() => props.onResetConfig(active.id)} disabled={running}>Khôi phục cài đặt gốc</button>
          </div>
        </details>

        {props.testVisible ? (
          <details className="fold">
            <summary>🧪 Test không cần LIVE</summary>
            <div className="fold-body">
              {running ? (
                <>
                  <span className="fold-label">Giả lập viewer chơi game này</span>
                  <div className="check-row">
                    {props.testActions.map((action, index) => (
                      <button key={`${index}-${action.label}`} className="chip" onClick={() => props.onTest(action.input)}>{action.label}</button>
                    ))}
                  </div>
                  <div className="bot-row">
                    <label className="bot-toggle">
                      <input type="checkbox" checked={bot.enabled} onChange={(event) => bot.setEnabled(event.target.checked)} />
                      🤖 Bot tự chơi
                    </label>
                    {bot.enabled ? (
                      <div className="segmented three" role="group" aria-label="Tốc độ bot">
                        {BOT_SPEEDS.map((option) => (
                          <button key={option.value} className={bot.speed === option.value ? 'active' : ''} onClick={() => bot.setSpeed(option.value)}>{option.label}</button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </>
              ) : (
                <p className="field-hint">Bấm ▶ Bắt đầu (hoặc 🤖 Chạy thử) để hiện nút giả lập cho game này.</p>
              )}
              {props.extraTestTools}
            </div>
          </details>
        ) : null}

        <div className="leaderboard-block">
          <div className="game-block-header">
            <strong>🏆 Bảng xếp hạng</strong>
            <button className="button small ghost" onClick={props.onResetScores} disabled={!props.leaderboard.length}>Reset</button>
          </div>
          {props.leaderboard.length ? (
            <ol className="vote-options">
              {props.leaderboard.map((entry, index) => (
                <li key={entry.user}>
                  <span className="track-number">{index + 1}</span>
                  <span className="track-name">{entry.nickname}</span>
                  <strong>{entry.points}</strong>
                </li>
              ))}
            </ol>
          ) : (
            <p className="empty-copy flush">Chưa có điểm. Điểm cộng dồn qua mọi game đến khi Reset.</p>
          )}
        </div>
      </div>
    </Panel>
  );
}
