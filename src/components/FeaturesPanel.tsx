import { GLOBAL_COMMAND_HELP } from '../game/chatCommands';
import type { LiveFeatures } from '../game/features';
import { t } from '../shared/i18n';
import Panel from './Panel';
import Toggle from './Toggle';

interface FeaturesPanelProps {
  features: LiveFeatures;
  onChange: (patch: Partial<LiveFeatures>) => void;
  cooldownSeconds: number;
  onCooldownChange: (seconds: number) => void;
  hostUsername: string | null;
}

/** Settings that apply to every game, folded so the main screen stays simple. */
export default function FeaturesPanel({ features, onChange, cooldownSeconds, onCooldownChange, hostUsername }: FeaturesPanelProps) {
  return (
    <Panel title={t('Cài đặt chung')}>
      <div className="game-stack">
        <details className="fold">
          <summary>{t('💬 Lệnh chat')} {features.chatCommandsEnabled ? '' : t('(đang tắt)')}</summary>
          <div className="fold-body">
            <Toggle
              checked={features.chatCommandsEnabled}
              onChange={(value) => onChange({ chatCommandsEnabled: value })}
              label={t('Bật !start, !stop, !help, !rank…')}
              hint={t('Lệnh riêng của game (!join, !hit…) luôn chạy khi game đang chơi')}
            />
            <div className="command-table">
              {GLOBAL_COMMAND_HELP.map((command) => (
                <span key={command.usage} className={command.host ? 'host' : ''}>
                  <code>{command.usage}</code> {t(command.description)}{command.host ? ' (streamer/mod)' : ''}
                </span>
              ))}
            </div>
            <label className="inline-field stacked">
              <span>{t('Mod được dùng lệnh streamer')}</span>
              <input value={features.moderators} maxLength={500} placeholder={t('vd: mod_1, @mod_2')} onChange={(event) => onChange({ moderators: event.target.value })} />
            </label>
            <p className="field-hint">
              {hostUsername ? t('Tài khoản LIVE @{user} luôn dùng được lệnh streamer.', { user: hostUsername }) : t('Khi kết nối, tài khoản đang LIVE luôn dùng được lệnh streamer.')} {t('Nút test trong app cũng dùng được.')}
            </p>
            <label className="inline-field flush">
              <span>{t('Chống spam (giây)')}</span>
              <input type="number" min={0} max={60} value={cooldownSeconds} onChange={(event) => onCooldownChange(Number(event.target.value))} />
            </label>
            <p className="field-hint">{t('Mỗi viewer chỉ được 1 lệnh / câu trả lời trong khoảng này. 0 = tắt.')}</p>
          </div>
        </details>

        <details className="fold">
          <summary>{t('🔊 Âm thanh game')} {features.gameSounds ? '' : t('(đang tắt)')}</summary>
          <div className="fold-body">
            <Toggle
              checked={features.gameSounds}
              onChange={(value) => onChange({ gameSounds: value })}
              label={t('Âm thanh khi bắt đầu, trúng đòn, trả lời đúng/sai, thắng')}
              hint={t('Có tiếng tích tắc 5 giây cuối. Phát trong app, OBS thu cùng âm thanh app.')}
            />
          </div>
        </details>

        <details className="fold">
          <summary>{t('🏆 Điểm fan')} {features.fanEnabled ? t('(đang bật)') : ''}</summary>
          <div className="fold-body">
            <Toggle
              checked={features.fanEnabled}
              onChange={(value) => onChange({ fanEnabled: value })}
              label={t('Cộng điểm cho mọi comment, tim, gift')}
              hint={t('Điểm vào chung bảng xếp hạng với game')}
            />
            <label className="inline-field flush">
              <span>{t('Mỗi comment')}</span>
              <input type="number" min={0} max={100} value={features.fanChatPoints} onChange={(event) => onChange({ fanChatPoints: Number(event.target.value) })} />
            </label>
            <label className="inline-field flush">
              <span>{t('Giãn cách (giây)')}</span>
              <input type="number" min={0} max={3600} value={features.fanChatCooldownSeconds} onChange={(event) => onChange({ fanChatCooldownSeconds: Number(event.target.value) })} />
            </label>
            <label className="inline-field flush">
              <span>{t('Số tim = 1 điểm')}</span>
              <input type="number" min={1} max={10000} value={features.fanLikesPerPoint} onChange={(event) => onChange({ fanLikesPerPoint: Number(event.target.value) })} />
            </label>
            <label className="inline-field flush">
              <span>{t('Mỗi gift')}</span>
              <input type="number" min={0} max={10000} value={features.fanGiftPoints} onChange={(event) => onChange({ fanGiftPoints: Number(event.target.value) })} />
            </label>
          </div>
        </details>

        <details className="fold">
          <summary>{t('👋 Chào người mới')} {features.welcomeEnabled ? '' : t('(đang tắt)')}</summary>
          <div className="fold-body">
            <Toggle
              checked={features.welcomeEnabled}
              onChange={(value) => onChange({ welcomeEnabled: value })}
              label={t('Hiện người follow bay lên màn hình')}
              hint={t('Avatar + tên nhỏ bay từ dưới lên giữa màn hình rồi biến mất')}
            />
            <Toggle
              checked={features.welcomeJoins}
              onChange={(value) => onChange({ welcomeJoins: value })}
              label={t('Hiện cả người vào phòng')}
              hint={t('Phòng đông chỉ hiện ~1 người mỗi giây, follow luôn hiện')}
            />
            <Toggle
              checked={features.welcomeLikes}
              onChange={(value) => onChange({ welcomeLikes: value })}
              label={t('Hiện tim bay lên khi thả tim')}
              hint={t('Chỉ avatar + ❤️; phòng đông tự bỏ bớt (tối đa 6 tim cùng lúc)')}
            />
            <Toggle
              checked={features.welcomeSound}
              onChange={(value) => onChange({ welcomeSound: value })}
              label={t('Tiếng chuông')}
              hint={t('Phát trong app, OBS thu cùng âm thanh app')}
            />
          </div>
        </details>
      </div>
    </Panel>
  );
}
