import { activeGroup, groupLabel, type AutoPlaySession, type AutoPlaySettings, type GiftSwitchState, type PlayLoop, type SwitchBy } from '../game/autoplay';
import { lobbyResultText, type LobbyState } from '../game/lobby';
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
  /** The game being played round after round (null = none). */
  loop: PlayLoop | null;
  gift: GiftSwitchState;
  onBegin: () => void;
  onStop: () => void;
  onSkip: () => void;
  onSwitchLater: () => void;
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

const SWITCH_OPTIONS: { value: SwitchBy; label: string }[] = [
  { value: 'command', label: 'Chỉ khi có lệnh đổi game (chơi mãi)' },
  { value: 'rounds', label: 'Chơi xong số ván' },
  { value: 'time', label: 'Chơi đủ số phút' }
];

/** The game being played, how it switches (rounds, time, gift, !doigame, the viewer list) and the LIVE length. */
export default function AutoPlayPanel({ games, settings, onChange, session, loop, gift, onBegin, onStop, onSkip, onSwitchLater, onExtend, lobby, onResolveLobby }: AutoPlayPanelProps) {
  const now = useNow(session != null || loop != null || lobby?.endsAt != null, 1000);
  const group = activeGroup(settings);
  const current = games.find((game) => game.id === loop?.gameId);
  const [switchCommandBefore, switchCommandAfter = ''] = t('Đủ số viewer gõ {command} thì hết ván này sẽ quay lại màn chọn game. Streamer/mod gõ là đủ. 0 = viewer không đổi được.').split('{command}');
  const switchRule = settings.switchBy === 'rounds' ? t('ván {n}/{total}', { n: Math.min(settings.roundsPerGame, (loop?.roundsPlayed ?? 0) + 1), total: settings.roundsPerGame })
    : settings.switchBy === 'time' && loop ? t('đổi sau {time}', { time: formatDuration(loop.since + settings.switchMinutes * 60_000 - now) })
      : t('ván {n} · chơi mãi', { n: (loop?.roundsPlayed ?? 0) + 1 });

  return (
    <Panel title={t('🎮 Chọn & chuyển game')} aside={session ? <span className="live-badge">{t('● Đang tự động')}</span> : t('Tự động: tắt')}>
      <div className="game-stack">
        {lobby ? (
          <div className="lobby-status">
            <div className="lobby-head">
              <strong>{lobby.result ? lobbyResultText(lobby.result, t(games.find((game) => game.id === lobby.result?.ranking[0])?.title ?? '')) : t('🗳 Viewer đang chọn game')}</strong>
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
              <button className="button primary" onClick={onResolveLobby}>{lobby.result ? t('▶ Chơi ngay') : t('✅ Chốt ngay')}</button>
            </div>
          </div>
        ) : null}
        {loop ? (
          <div className="lobby-status">
            <div className="lobby-head">
              <strong>{t('🔁 Đang chơi: {title}', { title: current ? t(current.title) : '…' })}</strong>
              <span className="countdown">{switchRule}</span>
            </div>
            {loop.switchPending ? <p className="field-hint">{t('🔄 Đã nhận lệnh đổi game: hết ván này sẽ về màn chọn game.')}</p> : null}
            <div className="control-bar">
              {loop.switchPending ? null : <button className="button" onClick={onSwitchLater}>{t('🔄 Đổi khi hết ván')}</button>}
              <button className="button primary" onClick={onSkip}>{t('⏭ Đổi game ngay')}</button>
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
            </div>
            <div className="control-bar">
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
          ? t('Game đang chơi tự chạy ván mới liên tục. Khi có lệnh đổi game (quà, !doigame) thì chờ hết ván, chúc mừng người thắng rồi mở danh sách cho viewer chọn; không ai chọn hoặc hoà phiếu thì bốc ngẫu nhiên.')
          : t('Game đang chơi tự chạy ván mới liên tục. Khi có lệnh đổi game (quà, !doigame) thì chờ hết ván rồi sang game tiếp theo.')}</p>
        <p className="field-hint">{t('“Bật tự động”: tự mở game đầu tiên và dừng khi hết thời lượng LIVE.')}</p>

        <label className="inline-field flush">
          <span>{t('Thời lượng LIVE (phút)')}</span>
          <input type="number" min={0} max={720} value={settings.liveMinutes} onChange={(event) => onChange({ liveMinutes: Number(event.target.value) })} />
        </label>
        <p className="field-hint">{t('0 = không giới hạn. Báo trên overlay khi còn 5 phút.')}{session ? ` ${t('Đổi ở đây áp dụng từ lần bật sau; đang LIVE thì dùng “+15 phút”.')}` : ''}</p>
        <label className="inline-field flush">
          <span>{t('Đổi game khi')}</span>
          <select value={settings.switchBy} onChange={(event) => onChange({ switchBy: event.target.value as SwitchBy })}>
            {SWITCH_OPTIONS.map((option) => <option key={option.value} value={option.value}>{t(option.label)}</option>)}
          </select>
        </label>
        {settings.switchBy === 'rounds' ? (
          <label className="inline-field flush">
            <span>{t('Số ván mỗi game')}</span>
            <input type="number" min={1} max={50} value={settings.roundsPerGame} onChange={(event) => onChange({ roundsPerGame: Number(event.target.value) })} />
          </label>
        ) : settings.switchBy === 'time' ? (
          <label className="inline-field flush">
            <span>{t('Mỗi game (phút)')}</span>
            <input type="number" min={1} max={180} value={settings.switchMinutes} onChange={(event) => onChange({ switchMinutes: Number(event.target.value) })} />
          </label>
        ) : null}
        <p className="field-hint">{t('1 ván = 1 bộ câu hỏi (vd 10 câu) hoặc 1 trận. Quà / !doigame luôn đổi được game; đổi game luôn chờ hết ván đang chơi, không cắt ngang.')}</p>
        <label className="inline-field flush">
          <span>{t('Nghỉ giữa ván (giây)')}</span>
          <input type="number" min={3} max={300} value={settings.roundGapSeconds} onChange={(event) => onChange({ roundGapSeconds: Number(event.target.value) })} />
        </label>
        <label className="inline-field flush">
          <span>{t('Thứ tự')}</span>
          <select value={settings.order} onChange={(event) => onChange({ order: event.target.value === 'random' ? 'random' : 'sequential' })}>
            <option value="sequential">{t('Lần lượt')}</option>
            <option value="random">{t('Ngẫu nhiên')}</option>
          </select>
        </label>
        <p className="field-hint">{t('Thời gian xem màn chúc mừng người thắng trước ván mới.')}</p>
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
            <p className="field-hint">{t('Mỗi comment số = 1 phiếu (có chống spam). Sau mỗi lần đổi game thì đếm ngược ngay; hết giờ mà không ai chọn hoặc hoà phiếu thì báo trên overlay và bốc ngẫu nhiên. Lần đầu (chưa chơi game nào) đếm từ phiếu đầu tiên.')}</p>
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
              label={settings.lobbyEnabled ? t('Viewer tặng quà → hết ván đổi game (về màn chọn game)') : t('Viewer tặng quà → hết ván đổi sang game tiếp theo')}
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
            <p className="field-hint">{t('Cộng dồn quà của mọi viewer; đủ số lượng thì hết ván này sẽ đổi game.')}</p>
            <label className="inline-field flush">
              <span>{t('Giữ game tối thiểu (giây)')}</span>
              <input type="number" min={0} max={3600} value={settings.giftCooldownSeconds} onChange={(event) => onChange({ giftCooldownSeconds: Number(event.target.value) })} />
            </label>
            <p className="field-hint">{t('Quà trong khoảng này tính từ lúc game bắt đầu không được tính, để game mới kịp chơi.')}</p>
          </div>
        </details>
      </div>
    </Panel>
  );
}
