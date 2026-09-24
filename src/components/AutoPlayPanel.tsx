import { activeGroup, groupLabel, type AutoPlaySession, type AutoPlaySettings, type GiftSwitchState } from '../game/autoplay';
import type { LobbyState } from '../game/lobby';
import type { AnyGame } from '../game/registry';
import { useNow } from '../hooks/useNow';
import { t } from '../shared/i18n';
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
  lobby: LobbyState | null;
  onResolveLobby: () => void;
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
export default function AutoPlayPanel({ games, settings, onChange, session, gift, onBegin, onStop, onSkip, onExtend, lobby, onResolveLobby }: AutoPlayPanelProps) {
  const now = useNow(session != null || lobby?.endsAt != null, 1000);
  const group = activeGroup(settings);
  const current = games.find((game) => game.id === session?.gameId);
  const [switchCommandBefore, switchCommandAfter = ''] = t('Đang chơi, đủ số viewer gõ {command} thì chốt game và quay lại màn chọn. Streamer/mod gõ là đổi ngay. 0 = viewer không đổi được.').split('{command}');

  return (
    <Panel title={t('🎮 Chọn & chuyển game')} aside={session ? <span className="live-badge">{t('● Đang tự động')}</span> : t('Tự động: tắt')}>
      <div className="game-stack">
        {lobby ? (
          <div className="lobby-status">
            <div className="lobby-head">
              <strong>{t('🗳 Viewer đang chọn game')}</strong>
              <span className="countdown">{lobby.endsAt != null ? formatDuration(lobby.endsAt - now) : t('chờ phiếu đầu')}</span>
            </div>
            <ol className="vote-options">
              {lobby.options.map((id, index) => (
                <li key={id} className={lobby.votes[index] && lobby.votes[index] === Math.max(...lobby.votes) ? 'highlight' : ''}>
                  <span className="track-number">{index + 1}</span>
                  <span className="track-name">{t(games.find((game) => game.id === id)?.title ?? id)}</span>
                  <strong>{lobby.votes[index] ?? 0}</strong>
                </li>
              ))}
            </ol>
            <div className="control-bar">
              <button className="button primary" onClick={onResolveLobby}>{t('✅ Chốt ngay')}</button>
            </div>
          </div>
        ) : null}
        {session ? (
          <>
            <div className="autoplay-stats">
              <span>
                <small>{session.liveEndsAt != null ? t('LIVE còn') : t('Đã LIVE')}</small>
                <strong>{formatDuration(session.liveEndsAt != null ? session.liveEndsAt - now : now - session.startedAt)}</strong>
              </span>
              <span>
                <small>{settings.switchBy === 'rounds' ? t('Lượt của game') : t('Đổi game sau')}</small>
                <strong>
                  {!session.gameId ? '--:--'
                    : settings.switchBy === 'rounds' ? `${Math.min(settings.roundsPerGame, session.roundsPlayed + 1)}/${settings.roundsPerGame}`
                      : formatDuration(session.slotEndsAt - now)}
                </strong>
              </span>
              <span>
                <small>{t('Đang chơi')}</small>
                <strong>{current ? t(current.title) : '…'}</strong>
              </span>
            </div>
            <div className="control-bar">
              <button className="button primary" onClick={onSkip}>{t('⏭ Đổi game ngay')}</button>
              {session.liveEndsAt != null ? <button className="button" onClick={() => onExtend(15)}>{t('+15 phút LIVE')}</button> : null}
              <button className="button" onClick={onStop}>{t('⏹ Tắt tự động')}</button>
            </div>
          </>
        ) : (
          <div className="control-bar">
            <button className="button primary" onClick={onBegin}>{t('▶ Bật tự động')}</button>
          </div>
        )}
        <p className="group-note">
          {t('📚 Nhóm game đang dùng:')} <strong>{groupLabel(group)}</strong> {t('({n} game). Viewer chỉ thấy và chọn được các game này; đổi nhóm ở ② Chọn game.', { n: group?.gameIds.length ?? games.length })}
        </p>
        <p className="field-hint">{settings.lobbyEnabled
          ? t('Game tự chạy liên tục, hết giờ mỗi game thì chốt kết quả và cho viewer chọn game tiếp theo. Hết thời lượng LIVE thì dừng.')
          : t('Game tự chạy liên tục, hết giờ mỗi game thì chốt kết quả và sang game tiếp theo. Hết thời lượng LIVE thì dừng.')}</p>

        <label className="inline-field flush">
          <span>{t('Thời lượng LIVE (phút)')}</span>
          <input type="number" min={0} max={720} value={settings.liveMinutes} onChange={(event) => onChange({ liveMinutes: Number(event.target.value) })} />
        </label>
        <p className="field-hint">{t('0 = không giới hạn. Báo trên overlay khi còn 5 phút.')}{session ? ` ${t('Đổi ở đây áp dụng từ lần bật sau; đang LIVE thì dùng “+15 phút”.')}` : ''}</p>
        <label className="inline-field flush">
          <span>{t('Đổi game khi')}</span>
          <select value={settings.switchBy} onChange={(event) => onChange({ switchBy: event.target.value === 'rounds' ? 'rounds' : 'time' })}>
            <option value="rounds">{t('Chơi xong số lượt')}</option>
            <option value="time">{t('Hết thời gian mỗi game')}</option>
          </select>
        </label>
        {settings.switchBy === 'rounds' ? (
          <label className="inline-field flush">
            <span>{t('Số lượt mỗi game')}</span>
            <input type="number" min={1} max={50} value={settings.roundsPerGame} onChange={(event) => onChange({ roundsPerGame: Number(event.target.value) })} />
          </label>
        ) : (
          <label className="inline-field flush">
            <span>{t('Mỗi game (phút)')}</span>
            <input type="number" min={1} max={180} value={settings.switchMinutes} onChange={(event) => onChange({ switchMinutes: Number(event.target.value) })} />
          </label>
        )}
        {settings.switchBy === 'rounds' ? <p className="field-hint">{t('1 lượt = 1 bộ câu hỏi (vd 10 câu) hoặc 1 ván. Chơi xong đủ lượt thì chốt và sang game tiếp theo, không cắt ngang.')}</p> : null}
        <label className="inline-field flush">
          <span>{t('Nghỉ giữa vòng (giây)')}</span>
          <input type="number" min={3} max={300} value={settings.roundGapSeconds} onChange={(event) => onChange({ roundGapSeconds: Number(event.target.value) })} />
        </label>
        <label className="inline-field flush">
          <span>{t('Thứ tự')}</span>
          <select value={settings.order} onChange={(event) => onChange({ order: event.target.value === 'random' ? 'random' : 'sequential' })}>
            <option value="sequential">{t('Lần lượt')}</option>
            <option value="random">{t('Ngẫu nhiên')}</option>
          </select>
        </label>
        <Toggle
          checked={settings.startOnConnect}
          onChange={(value) => onChange({ startOnConnect: value })}
          label={t('Tự bật khi kết nối TikTok')}
          hint={t('Thời lượng LIVE tính từ lúc bật tự động')}
        />

        <details className="fold">
          <summary>{t('🗳 Viewer chọn game')} {settings.lobbyEnabled ? '' : t('(đang tắt)')}</summary>
          <div className="fold-body">
            <Toggle
              checked={settings.lobbyEnabled}
              onChange={(value) => onChange({ lobbyEnabled: value })}
              label={t('Hiện danh sách game để viewer chọn')}
              hint={t('Khi chưa có game (và mỗi lần đổi game), overlay hiện các game của nhóm đang dùng, đánh số; viewer comment số để chọn')}
            />
            <label className="inline-field flush">
              <span>{t('Thời gian chọn (giây)')}</span>
              <input type="number" min={5} max={300} value={settings.lobbySeconds} onChange={(event) => onChange({ lobbySeconds: Number(event.target.value) })} />
            </label>
            <p className="field-hint">{t('Mỗi comment số = 1 phiếu (có chống spam). Đếm ngược từ phiếu đầu tiên; khi bật tự động thì đếm ngay và không ai chọn sẽ bốc ngẫu nhiên.')}</p>
            <label className="inline-field flush">
              <span>{t('Phiếu mỗi quà')}</span>
              <input type="number" min={0} max={1000} value={settings.lobbyGiftVotes} onChange={(event) => onChange({ lobbyGiftVotes: Number(event.target.value) })} />
            </label>
            <p className="field-hint">{t('Quà bất kỳ cộng phiếu cho game người tặng đã chọn (chưa chọn thì cho game đang dẫn đầu). 0 = quà không tính.')}</p>
            <label className="inline-field flush">
              <span>{t('!doigame cần (người)')}</span>
              <input type="number" min={0} max={100} value={settings.switchCommandVotes} onChange={(event) => onChange({ switchCommandVotes: Number(event.target.value) })} />
            </label>
            <p className="field-hint">{switchCommandBefore}<code>!doigame</code>{switchCommandAfter}</p>
          </div>
        </details>

        <details className="fold">
          <summary>{t('🎁 Quà đổi game')} {settings.giftSwitchEnabled ? `(${gift.progress}/${settings.giftCount} ${settings.giftName})` : t('(đang tắt)')}</summary>
          <div className="fold-body">
            <Toggle
              checked={settings.giftSwitchEnabled}
              onChange={(value) => onChange({ giftSwitchEnabled: value })}
              label={settings.lobbyEnabled ? t('Viewer tặng quà → đổi game (về màn chọn game)') : t('Viewer tặng quà → đổi sang game tiếp theo')}
              hint={t('Chạy cả khi không bật tự động. Overlay hiện gợi ý tặng quà.')}
            />
            <label className="inline-field flush">
              <span>{t('Tên quà')}</span>
              <input value={settings.giftName} maxLength={60} placeholder={t('vd: Rose')} onChange={(event) => onChange({ giftName: event.target.value })} />
            </label>
            <label className="inline-field flush">
              <span>{t('Số lượng')}</span>
              <input type="number" min={1} max={10000} value={settings.giftCount} onChange={(event) => onChange({ giftCount: Number(event.target.value) })} />
            </label>
            <p className="field-hint">{t('Cộng dồn quà của mọi viewer; đủ số lượng thì đổi game.')}</p>
            <label className="inline-field flush">
              <span>{t('Giữ game tối thiểu (giây)')}</span>
              <input type="number" min={0} max={3600} value={settings.giftCooldownSeconds} onChange={(event) => onChange({ giftCooldownSeconds: Number(event.target.value) })} />
            </label>
            <p className="field-hint">{t('Sau khi đổi, quà trong khoảng này không được tính để game mới kịp chơi.')}</p>
          </div>
        </details>
      </div>
    </Panel>
  );
}
