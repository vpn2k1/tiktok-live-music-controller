import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { GameState } from '../game/engine';
import type { AnyGame } from '../game/registry';
import { GAME_CATEGORY_LABELS, type GameCategory, type GameConfig, type SettingField, type TestAction, type TestInput } from '../game/types';
import type { DictionaryLanguage } from '../game/useLiveGames';
import type { OverlayGameView, ScoreEntry } from '../shared/types';
import Panel from './Panel';

interface GamePanelProps {
  games: AnyGame[];
  selectedId: string;
  onSelect: (id: string) => void;
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
  /** Show test buttons + demo bot (on when TikTok isn't connected). */
  testVisible: boolean;
  testActions: TestAction[];
  onTest: (input: TestInput) => void;
}

const MAX_DICTIONARY_BYTES = 20 * 1024 * 1024;
/** Games that can use an imported word list, and which language it is. */
const DICTIONARY_GAMES: Record<string, DictionaryLanguage> = { wordChain: 'vi', englishWordChain: 'en' };
const PHASE_TEXT: Record<GameState['phase'], string> = { idle: 'Đang chờ', running: 'Đang chơi', ended: 'Kết thúc' };

const BOT_SPEEDS = [
  { value: 1500, label: 'Chậm' },
  { value: 700, label: 'Vừa' },
  { value: 250, label: 'Nhanh' }
];

function pickWeighted(actions: TestAction[]): TestAction | null {
  const total = actions.reduce((sum, action) => sum + (action.weight ?? 1), 0);
  let roll = Math.random() * total;
  for (const action of actions) {
    roll -= action.weight ?? 1;
    if (roll <= 0) return action;
  }
  return actions[actions.length - 1] ?? null;
}

/** Test buttons for the running round plus a demo bot that plays as random viewers. */
function TestTools({ running, actions, onTest }: { running: boolean; actions: TestAction[]; onTest: (input: TestInput) => void }) {
  const [botOn, setBotOn] = useState(false);
  const [speed, setSpeed] = useState(700);
  const latest = useRef({ actions, onTest });

  useEffect(() => {
    latest.current = { actions, onTest };
  });

  useEffect(() => {
    if (!botOn || !running) return undefined;
    const timer = setInterval(() => {
      const action = pickWeighted(latest.current.actions);
      if (action) latest.current.onTest(action.input);
    }, speed);
    return () => clearInterval(timer);
  }, [botOn, running, speed]);

  return (
    <div className="game-block test-tools">
      <div className="game-block-header">
        <strong>🧪 Test game</strong>
        <label className="bot-toggle">
          <input type="checkbox" checked={botOn} onChange={(event) => setBotOn(event.target.checked)} />
          🤖 Bot chơi thử
        </label>
      </div>
      {running ? (
        <>
          <div className="check-row">
            {actions.map((action, index) => (
              <button key={`${index}-${action.label}`} className="chip" onClick={() => onTest(action.input)}>{action.label}</button>
            ))}
          </div>
          {botOn ? (
            <div className="segmented three" role="group" aria-label="Tốc độ bot">
              {BOT_SPEEDS.map((option) => (
                <button key={option.value} className={speed === option.value ? 'active' : ''} onClick={() => setSpeed(option.value)}>{option.label}</button>
              ))}
            </div>
          ) : null}
          <p className="field-hint">Mỗi lần bấm là một viewer ảo ngẫu nhiên; chống spam vẫn áp dụng như LIVE thật.</p>
        </>
      ) : (
        <p className="field-hint">Bấm Bắt đầu để hiện nút test cho game này{botOn ? '; bot sẽ tự chơi khi game chạy' : ''}.</p>
      )}
    </div>
  );
}

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

export default function GamePanel(props: GamePanelProps) {
  const { game, view } = props;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const running = game.phase === 'running';
  const activeId = running && game.kind ? game.kind : props.selectedId;
  const active = props.games.find((item) => item.id === activeId) ?? props.games[0];
  const raw = props.rawConfigs[active?.id ?? ''] ?? {};
  const teamTotal = view.teams ? view.teams[0].score + view.teams[1].score : 0;

  const dictionaryLanguage = active ? DICTIONARY_GAMES[active.id] : undefined;
  const dictionaryInfo = dictionaryLanguage ? props.dictionaries[dictionaryLanguage] : null;
  const categories = [...new Set(props.games.map((item) => item.category))] as GameCategory[];

  async function handleDictionaryFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || file.size > MAX_DICTIONARY_BYTES || !dictionaryLanguage) return;
    props.onImportDictionary(dictionaryLanguage, await file.text());
  }

  if (!active) return null;

  return (
    <Panel title="Game" aside={PHASE_TEXT[game.phase]}>
      <div className="game-stack">
        <div className="game-block">
          <label className="inline-field flush">
            <span>Chọn game</span>
            <select value={active.id} disabled={running} onChange={(event) => props.onSelect(event.target.value)}>
              {categories.map((category) => (
                <optgroup key={category} label={GAME_CATEGORY_LABELS[category]}>
                  {props.games.filter((item) => item.category === category).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <p className="game-howto">{active.howTo}</p>

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

          <div className="player-actions compact">
            <button className="button primary" onClick={props.onStart} disabled={running}>Bắt đầu</button>
            <button className="button" onClick={props.onFinish} disabled={!running}>Chốt kết quả</button>
            <button className="button ghost" onClick={props.onCancel} disabled={game.phase === 'idle'}>Huỷ</button>
            <button className="button ghost" onClick={() => props.onResetConfig(active.id)} disabled={running}>Cài đặt gốc</button>
          </div>
        </div>

        {props.testVisible ? <TestTools running={running} actions={props.testActions} onTest={props.onTest} /> : null}

        {game.phase !== 'idle' ? (
          <div className="game-block">
            <div className="game-block-header">
              <strong>{game.title}</strong>
              {running ? <span className="countdown">{game.endsAt == null ? 'LIVE' : formatCountdown(props.remainingMs)}</span> : null}
            </div>
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
        ) : null}

        <div className="game-block">
          <div className="game-block-header">
            <strong>Bảng xếp hạng</strong>
            <button className="button small" onClick={props.onResetScores} disabled={!props.leaderboard.length}>Reset</button>
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
