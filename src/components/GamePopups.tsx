import { useMemo, useState, type ReactNode } from 'react';
import { groupLabel, type GameGroup } from '../game/autoplay';
import type { GameState } from '../game/engine';
import type { AnyGame } from '../game/registry';
import { splitTitle } from '../shared/gameTitle';
import { t } from '../shared/i18n';
import { CommandList } from './GameParts';
import Modal from './Modal';

/** What the popups can do with a game. */
export interface GameActions {
  /** Start this game now (no round running). */
  onPlay: (id: string) => void;
  /** Start it with the demo bot (null while LIVE without test tools). */
  onDemo: ((id: string) => void) | null;
  /** End the running round (its points count) and play this game. */
  onSwitchTo: (id: string) => void;
}

/** Play / demo / switch buttons for one game, depending on what is running. */
function PlayButtons({ game, round, actions, onDone }: { game: AnyGame; round: GameState; actions: GameActions; onDone: () => void }) {
  const running = round.phase === 'running';
  if (running && round.kind === game.id) return <span className="live-badge">{t('● Đang chơi')}</span>;
  const run = (action: (id: string) => void) => () => {
    action(game.id);
    onDone();
  };
  if (running) return <button className="button primary" onClick={run(actions.onSwitchTo)}>{t('⏭ Đổi sang game này')}</button>;
  return (
    <>
      {actions.onDemo ? <button className="button" onClick={run(actions.onDemo)} title={t('Bắt đầu và cho viewer ảo tự chơi để xem overlay')}>{t('🤖 Chạy thử')}</button> : null}
      <button className="button primary" onClick={run(actions.onPlay)}>{t('▶ Chơi game này')}</button>
    </>
  );
}

function GameIcon({ game }: { game: AnyGame }) {
  const { icon } = splitTitle(t(game.title));
  return <span className={`game-card-icon ${game.category} ${icon.length > 4 ? 'wide' : ''}`} aria-hidden="true">{icon}</span>;
}

interface GameDetailsModalProps {
  game: AnyGame;
  round: GameState;
  actions: GameActions;
  /** The settings form (GameSettingsForm), built by the caller. */
  settings: ReactNode;
  onClose: () => void;
}

/** Library popup: how to play, viewer commands, settings, play. */
export function GameDetailsModal({ game, round, actions, settings, onClose }: GameDetailsModalProps) {
  const { name } = splitTitle(t(game.title));
  return (
    <Modal
      size="lg"
      title={<span className="modal-title-game"><GameIcon game={game} />{name}</span>}
      onClose={onClose}
      footer={(
        <>
          <button className="button ghost" onClick={onClose}>{t('Đóng')}</button>
          <PlayButtons game={game} round={round} actions={actions} onDone={onClose} />
        </>
      )}
    >
      <div className="game-stack">
        <p className="game-howto">{t(game.howTo)}</p>
        <CommandList game={game} />
        <h3 className="modal-section">{t('⚙ Cài đặt game')}</h3>
        {settings}
      </div>
    </Modal>
  );
}

interface StartModalProps {
  games: AnyGame[];
  groups: GameGroup[];
  activeGroupId: string;
  onGroupChange: (id: string) => void;
  selectedId: string;
  onSelect: (id: string) => void;
  round: GameState;
  actions: GameActions;
  onOpenSettings: (id: string) => void;
  /** Auto run of the active group. */
  autoRunning: boolean;
  runHint: string;
  onRunGroup: () => void;
  onStopRun: () => void;
  onClose: () => void;
}

type StartMode = 'one' | 'group';

/** Start popup: pick one game and play it, or run the whole group automatically. */
export function StartModal(props: StartModalProps) {
  const { games, round, actions, onClose } = props;
  const [mode, setMode] = useState<StartMode>(props.autoRunning ? 'group' : 'one');
  const [query, setQuery] = useState('');
  const group = props.groups.find((item) => item.id === props.activeGroupId) ?? props.groups[0];
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return games.filter((game) => (!group || group.gameIds.includes(game.id))
      && (!needle || t(game.title).toLowerCase().includes(needle) || game.title.toLowerCase().includes(needle)));
  }, [games, group, query]);
  // The selected game when it is in the list, else the first one shown.
  const selected = shown.find((game) => game.id === props.selectedId) ?? shown[0];

  const footer = mode === 'one' ? (
    <>
      <span className="modal-footer-note">{selected ? t(selected.title) : t('Chọn một game')}</span>
      {selected ? <button className="button ghost" onClick={() => props.onOpenSettings(selected.id)}>{t('⚙ Cài đặt')}</button> : null}
      {selected ? <PlayButtons game={selected} round={round} actions={actions} onDone={onClose} /> : null}
    </>
  ) : (
    <>
      <span className="modal-footer-note">{props.runHint}</span>
      {props.autoRunning ? (
        <button className="button" onClick={() => { props.onStopRun(); onClose(); }}>{t('⏹ Dừng chạy tự động')}</button>
      ) : (
        <button className="button primary" onClick={() => { props.onRunGroup(); onClose(); }}>
          ▶ {(group?.gameIds.length ?? 0) === 1 ? t('Chạy game đã chọn') : t('Chạy {n} game đã chọn', { n: group?.gameIds.length ?? 0 })}
        </button>
      )}
    </>
  );

  return (
    <Modal size="lg" title={round.phase === 'running' ? t('⏭ Đổi game') : t('▶ Bắt đầu game')} onClose={onClose} footer={footer}>
      <div className="game-stack">
        <div className="segmented" role="tablist" aria-label={t('Cách chơi')}>
          <button role="tab" aria-selected={mode === 'one'} className={mode === 'one' ? 'active' : ''} onClick={() => setMode('one')}>{t('🎯 Chơi một game')}</button>
          <button role="tab" aria-selected={mode === 'group'} className={mode === 'group' ? 'active' : ''} onClick={() => setMode('group')}>{t('🔁 Tự động cả nhóm')}</button>
        </div>

        <div className="check-row" role="group" aria-label={t('Nhóm game')}>
          {props.groups.map((item) => (
            <button
              key={item.id}
              className={`chip group-chip ${item.id === group?.id ? 'active' : ''}`}
              aria-pressed={item.id === group?.id}
              onClick={() => props.onGroupChange(item.id)}
            >
              {groupLabel(item)} <small>{item.gameIds.length}</small>
            </button>
          ))}
        </div>

        {mode === 'one' ? (
          <>
            <input className="text-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('🔍 Tìm game…')} aria-label={t('Tìm game')} />
            <div className="pick-list" role="listbox" aria-label={t('Chọn một game')}>
              {shown.length ? shown.map((game) => {
                const { name } = splitTitle(t(game.title));
                const active = game.id === selected?.id;
                return (
                  <button
                    key={game.id}
                    role="option"
                    aria-selected={active}
                    className={`pick-item ${active ? 'active' : ''} ${round.phase === 'running' && round.kind === game.id ? 'running' : ''}`}
                    onClick={() => props.onSelect(game.id)}
                    onDoubleClick={() => {
                      if (round.phase === 'running') return;
                      actions.onPlay(game.id);
                      onClose();
                    }}
                  >
                    <GameIcon game={game} />
                    <span className="pick-text">
                      <strong>{name}</strong>
                      <small>{t(game.howTo).split(/(?<=[.!?])\s/)[0]}</small>
                    </span>
                  </button>
                );
              }) : <p className="empty-copy flush">{t('Không có game nào khớp.')}</p>}
            </div>
            <p className="field-hint">{t('Bấm để chọn, bấm đúp để chơi ngay.')}</p>
          </>
        ) : (
          <div className="group-run">
            <p>
              <strong>{groupLabel(group)}</strong> · {t('{n} game', { n: group?.gameIds.length ?? 0 })}
            </p>
            <div className="check-row">
              {games.filter((game) => group?.gameIds.includes(game.id)).map((game) => <span key={game.id} className="chip static">{t(game.title)}</span>)}
            </div>
            <p className="field-hint">{t('Game tự chơi ván này sang ván khác và đổi game theo ⚙️ Cài đặt → 🔁 Tự động. Sửa danh sách game của nhóm ở tab 📚 Game.')}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
