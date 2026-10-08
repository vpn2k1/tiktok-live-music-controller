import { MAX_GROUPS, groupLabel, newGroupName, type GameGroup } from '../game/autoplay';
import type { AnyGame } from '../game/registry';
import { GAME_CATEGORY_LABELS, type GameCategory } from '../game/types';
import { splitTitle } from '../shared/gameTitle';
import { t } from '../shared/i18n';
import Panel from './Panel';

interface GameLibraryProps {
  games: AnyGame[];
  selectedId: string;
  runningId: string | null;
  /** Opens the game's popup (how to play, settings, play). */
  onOpen: (id: string) => void;
  groups: GameGroup[];
  activeGroupId: string;
  onGroupsChange: (patch: { groups?: GameGroup[]; activeGroupId?: string }) => void;
  /** Autoplay (running the selected games) is on. */
  autoRunning: boolean;
  /** How the selected games will run, e.g. "lần lượt, mỗi game 1 lượt". */
  runHint: string;
  onRun: () => void;
  onStopRun: () => void;
}

/** First sentence of the how-to, for a one-line card description. */
function shortDescription(text: string): string {
  const first = text.split(/(?<=[.!?])\s/)[0] ?? text;
  return first.length > 90 ? `${first.slice(0, 88)}…` : first;
}

/** Game picker grouped by category, plus the game groups viewers will see on LIVE. */
export default function GameLibrary({ games, selectedId, runningId, onOpen, groups, activeGroupId, onGroupsChange, autoRunning, runHint, onRun, onStopRun }: GameLibraryProps) {
  const categories = [...new Set(games.map((game) => game.category))] as GameCategory[];
  const active = groups.find((group) => group.id === activeGroupId) ?? groups[0];
  // The built-in "all games" group always holds every game (see normalizeGroups).
  const locked = active?.id === 'all';
  // Numbers viewers vote with: position in the group, library order.
  const numbers = new Map(games.filter((game) => active?.gameIds.includes(game.id)).map((game, index) => [game.id, index + 1]));

  function updateActive(patch: Partial<GameGroup>): void {
    if (!active) return;
    onGroupsChange({ groups: groups.map((group) => (group.id === active.id ? { ...group, ...patch } : group)) });
  }

  function toggleGame(id: string): void {
    if (!active) return;
    const inGroup = active.gameIds.includes(id);
    // A group always keeps at least one game.
    if (inGroup && active.gameIds.length <= 1) return;
    updateActive({ gameIds: inGroup ? active.gameIds.filter((item) => item !== id) : [...active.gameIds, id] });
  }

  function addGroup(): void {
    const group: GameGroup = { id: `g-${Date.now().toString(36)}`, name: newGroupName(groups.length + 1), gameIds: [selectedId] };
    onGroupsChange({ groups: [...groups, group], activeGroupId: group.id });
  }

  function removeGroup(): void {
    if (!active || groups.length <= 1) return;
    const rest = groups.filter((group) => group.id !== active.id);
    onGroupsChange({ groups: rest, activeGroupId: rest[0]?.id });
  }

  return (
    <Panel title={t('📚 Thư viện game')} aside={t('{n} game', { n: games.length })}>
      <div className="library">
        <section className="group-bar">
          <h3>{t('✅ Chọn 1 hoặc nhiều game để chạy')}</h3>
          <div className="check-row">
            {groups.map((group) => (
              <button
                key={group.id}
                className={`chip group-chip ${group.id === active?.id ? 'active' : ''}`}
                aria-pressed={group.id === active?.id}
                onClick={() => onGroupsChange({ activeGroupId: group.id })}
              >
                {groupLabel(group)} <small>{group.gameIds.length}</small>
              </button>
            ))}
            <button className="chip" onClick={addGroup} disabled={groups.length >= MAX_GROUPS}>{t('＋ Nhóm mới')}</button>
          </div>
          {active ? (
            <div className="group-edit">
              <input className="text-input" value={t(active.name)} maxLength={40} placeholder={t('Tên nhóm')} onChange={(event) => updateActive({ name: event.target.value })} />
              <button className="button small ghost" onClick={removeGroup} disabled={groups.length <= 1}>{t('Xoá nhóm')}</button>
            </div>
          ) : null}
          <p className="field-hint">
            {t('Bấm vào thẻ để xem cách chơi, cài đặt và chơi game. Bấm ✓ / ＋ ở góc thẻ để thêm / bỏ game khỏi nhóm.')}{' '}
            <strong>{t('Viewer chỉ thấy và chọn được {n} game của nhóm này', { n: active?.gameIds.length ?? 0 })}</strong>{' '}
            {t('(số trên thẻ = số viewer gõ khi bầu chọn).')}{(active?.gameIds.length ?? 0) > 10 ? ` ${t('Nhóm dài có thể tràn overlay, nên để ≤ 10 game.')}` : ''}
            {locked ? ` ${t('Nhóm “Tất cả game” luôn gồm mọi game; bấm ＋ Nhóm mới để chọn riêng.')}` : ''}
          </p>
          <div className="control-bar">
            {autoRunning ? (
              <button className="button" onClick={onStopRun}>{t('⏹ Dừng chạy tự động')}</button>
            ) : (
              <button className="button primary" onClick={onRun}>
                ▶ {(active?.gameIds.length ?? 0) === 1 ? t('Chạy game đã chọn') : t('Chạy {n} game đã chọn', { n: active?.gameIds.length ?? 0 })}
              </button>
            )}
            <span className="field-hint">{runHint}</span>
          </div>
        </section>

        {categories.map((category) => {
          const items = games.filter((game) => game.category === category);
          return (
            <section key={category} className="library-group">
              <h3>{t(GAME_CATEGORY_LABELS[category])} <small>{items.length}</small></h3>
              <div className="game-grid">
                {items.map((game) => {
                  const selected = game.id === selectedId;
                  const running = game.id === runningId;
                  const number = numbers.get(game.id);
                  const { name, icon } = splitTitle(t(game.title));
                  return (
                    <div key={game.id} className={`game-card-shell ${number ? 'in-group' : 'out-group'}`}>
                      <button
                        className={`game-card ${selected ? 'selected' : ''} ${running ? 'running' : ''}`}
                        onClick={() => onOpen(game.id)}
                        aria-haspopup="dialog"
                      >
                        <span className={`game-card-icon ${game.category} ${icon.length > 4 ? 'wide' : ''}`} aria-hidden="true">{icon}</span>
                        <span className="game-card-text">
                          <span className="game-card-title">
                            <strong>{number ? <span className="game-card-number">{number}</span> : null}{name}</strong>
                            {running ? <span className="game-card-badge">{t('Đang chạy')}</span> : null}
                          </span>
                          <span className="game-card-howto">{shortDescription(t(game.howTo))}</span>
                        </span>
                      </button>
                      <button
                        className="group-toggle"
                        aria-pressed={Boolean(number)}
                        title={number ? t('Bỏ khỏi nhóm “{name}”', { name: groupLabel(active) }) : t('Thêm vào nhóm “{name}”', { name: groupLabel(active) })}
                        disabled={locked || (Boolean(number) && (active?.gameIds.length ?? 0) <= 1)}
                        onClick={() => toggleGame(game.id)}
                      >
                        {number ? '✓' : '＋'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </Panel>
  );
}
