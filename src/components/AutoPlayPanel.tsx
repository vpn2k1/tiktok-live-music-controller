import type { AutoPlaySession, AutoPlaySettings, GiftSwitchState } from '../game/autoplay';
import type { AnyGame } from '../game/registry';
import { useNow } from '../hooks/useNow';
import Panel from './Panel';
import Toggle from './Toggle';

interface AutoPlayPanelProps {
  games: AnyGame[];
  settings: AutoPlaySettings;
  onChange: (patch: Partial<AutoPlaySettings>) => void;
  session: AutoPlaySession | null;
  gift: GiftSwitchState;
  onBegin: () => void;
  onStop: () => void;
  onSkip: () => void;
  onExtend: (minutes: number) => void;
}

/** 1:05:09 or 05:09. */
function formatDuration(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60).toString().padStart(2, '0');
  const seconds = (total % 60).toString().padStart(2, '0');
  return hours ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
}

/** LIVE length, game switch timer, rotation list and the gift that switches game. */
export default function AutoPlayPanel({ games, settings, onChange, session, gift, onBegin, onStop, onSkip, onExtend }: AutoPlayPanelProps) {
  const now = useNow(session != null, 1000);
  const allSelected = settings.gameIds.length === 0;
  const selectedCount = allSelected ? games.length : settings.gameIds.length;
  const current = games.find((game) => game.id === session?.gameId);

  function toggleGame(id: string, checked: boolean): void {
    const ids = allSelected ? games.map((game) => game.id) : settings.gameIds;
    const next = checked ? [...ids, id] : ids.filter((item) => item !== id);
    // Keep at least one game; a full list is stored as "all" so new games join too.
    if (!next.length) return;
    onChange({ gameIds: next.length === games.length ? [] : next });
  }

  return (
    <Panel title="⏱ Tự động chuyển game" aside={session ? <span className="live-badge">● Đang tự động</span> : 'Đang tắt'}>
      <div className="game-stack">
        {session ? (
          <>
            <div className="autoplay-stats">
              <span>
                <small>{session.liveEndsAt != null ? 'LIVE còn' : 'Đã LIVE'}</small>
                <strong>{formatDuration(session.liveEndsAt != null ? session.liveEndsAt - now : now - session.startedAt)}</strong>
              </span>
              <span>
                <small>Đổi game sau</small>
                <strong>{session.gameId ? formatDuration(session.slotEndsAt - now) : '--:--'}</strong>
              </span>
              <span>
                <small>Đang chơi</small>
                <strong>{current?.title ?? '…'}</strong>
              </span>
            </div>
            <div className="control-bar">
              <button className="button primary" onClick={onSkip}>⏭ Đổi game ngay</button>
              {session.liveEndsAt != null ? <button className="button" onClick={() => onExtend(15)}>+15 phút LIVE</button> : null}
              <button className="button" onClick={onStop}>⏹ Tắt tự động</button>
            </div>
          </>
        ) : (
          <div className="control-bar">
            <button className="button primary" onClick={onBegin}>▶ Bật tự động</button>
          </div>
        )}
        <p className="field-hint">Game tự chạy liên tục, hết giờ mỗi game thì chốt kết quả và sang game tiếp theo. Hết thời lượng LIVE thì dừng.</p>

        <label className="inline-field flush">
          <span>Thời lượng LIVE (phút)</span>
          <input type="number" min={0} max={720} value={settings.liveMinutes} onChange={(event) => onChange({ liveMinutes: Number(event.target.value) })} />
        </label>
        <p className="field-hint">0 = không giới hạn. Báo trên overlay khi còn 5 phút.{session ? ' Đổi ở đây áp dụng từ lần bật sau; đang LIVE thì dùng “+15 phút”.' : ''}</p>
        <label className="inline-field flush">
          <span>Mỗi game (phút)</span>
          <input type="number" min={1} max={180} value={settings.switchMinutes} onChange={(event) => onChange({ switchMinutes: Number(event.target.value) })} />
        </label>
        <label className="inline-field flush">
          <span>Nghỉ giữa vòng (giây)</span>
          <input type="number" min={3} max={300} value={settings.roundGapSeconds} onChange={(event) => onChange({ roundGapSeconds: Number(event.target.value) })} />
        </label>
        <label className="inline-field flush">
          <span>Thứ tự</span>
          <select value={settings.order} onChange={(event) => onChange({ order: event.target.value === 'random' ? 'random' : 'sequential' })}>
            <option value="sequential">Lần lượt</option>
            <option value="random">Ngẫu nhiên</option>
          </select>
        </label>
        <Toggle
          checked={settings.startOnConnect}
          onChange={(value) => onChange({ startOnConnect: value })}
          label="Tự bật khi kết nối TikTok"
          hint="Thời lượng LIVE tính từ lúc bật tự động"
        />

        <details className="fold">
          <summary>🎮 Game trong vòng xoay ({selectedCount}/{games.length})</summary>
          <div className="fold-body">
            <div className="check-row">
              {games.map((game) => (
                <label key={game.id} className="check-chip">
                  <input
                    type="checkbox"
                    checked={allSelected || settings.gameIds.includes(game.id)}
                    onChange={(event) => toggleGame(game.id, event.target.checked)}
                  />
                  {game.title}
                </label>
              ))}
            </div>
            {!allSelected ? <button className="link-button" onClick={() => onChange({ gameIds: [] })}>Chọn tất cả</button> : null}
            <p className="field-hint">Game không bắt đầu được (vd: bình chọn khi chưa có nhạc) sẽ được bỏ qua.</p>
          </div>
        </details>

        <details className="fold">
          <summary>🎁 Quà đổi game {settings.giftSwitchEnabled ? `(${gift.progress}/${settings.giftCount} ${settings.giftName})` : '(đang tắt)'}</summary>
          <div className="fold-body">
            <Toggle
              checked={settings.giftSwitchEnabled}
              onChange={(value) => onChange({ giftSwitchEnabled: value })}
              label="Viewer tặng quà → đổi sang game tiếp theo"
              hint="Chạy cả khi không bật tự động. Overlay hiện gợi ý tặng quà."
            />
            <label className="inline-field flush">
              <span>Tên quà</span>
              <input value={settings.giftName} maxLength={60} placeholder="vd: Rose" onChange={(event) => onChange({ giftName: event.target.value })} />
            </label>
            <label className="inline-field flush">
              <span>Số lượng</span>
              <input type="number" min={1} max={10000} value={settings.giftCount} onChange={(event) => onChange({ giftCount: Number(event.target.value) })} />
            </label>
            <p className="field-hint">Cộng dồn quà của mọi viewer; đủ số lượng thì đổi game.</p>
            <label className="inline-field flush">
              <span>Giữ game tối thiểu (giây)</span>
              <input type="number" min={0} max={3600} value={settings.giftCooldownSeconds} onChange={(event) => onChange({ giftCooldownSeconds: Number(event.target.value) })} />
            </label>
            <p className="field-hint">Sau khi đổi, quà trong khoảng này không được tính để game mới kịp chơi.</p>
          </div>
        </details>
      </div>
    </Panel>
  );
}
