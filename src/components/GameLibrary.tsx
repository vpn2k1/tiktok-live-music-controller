import type { AnyGame } from '../game/registry';
import { GAME_CATEGORY_LABELS, type GameCategory } from '../game/types';
import Panel from './Panel';

interface GameLibraryProps {
  games: AnyGame[];
  selectedId: string;
  runningId: string | null;
  onSelect: (id: string) => void;
}

/** First sentence of the how-to, for a one-line card description. */
function shortDescription(text: string): string {
  const first = text.split(/(?<=[.!?])\s/)[0] ?? text;
  return first.length > 90 ? `${first.slice(0, 88)}…` : first;
}

/** Game picker grouped by category. */
export default function GameLibrary({ games, selectedId, runningId, onSelect }: GameLibraryProps) {
  const categories = [...new Set(games.map((game) => game.category))] as GameCategory[];

  return (
    <Panel title="② Chọn game" aside={runningId ? 'Chốt hoặc huỷ game đang chạy để đổi' : `${games.length} game`}>
      <div className="library">
        {categories.map((category) => {
          const items = games.filter((game) => game.category === category);
          return (
            <section key={category} className="library-group">
              <h3>{GAME_CATEGORY_LABELS[category]} <small>{items.length}</small></h3>
              <div className="game-grid">
                {items.map((game) => {
                  const selected = game.id === selectedId;
                  const running = game.id === runningId;
                  return (
                    <button
                      key={game.id}
                      className={`game-card ${selected ? 'selected' : ''} ${running ? 'running' : ''}`}
                      onClick={() => onSelect(game.id)}
                      disabled={Boolean(runningId) && !running}
                      aria-pressed={selected}
                    >
                      <span className="game-card-title">
                        <strong>{game.title}</strong>
                        {running ? <span className="game-card-badge">Đang chạy</span> : null}
                      </span>
                      <span className="game-card-howto">{shortDescription(game.howTo)}</span>
                    </button>
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
