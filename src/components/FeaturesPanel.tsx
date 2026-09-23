import { GLOBAL_COMMAND_HELP } from '../game/chatCommands';
import type { LiveFeatures } from '../game/features';
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
    <Panel title="Cài đặt chung">
      <div className="game-stack">
        <details className="fold">
          <summary>💬 Lệnh chat {features.chatCommandsEnabled ? '' : '(đang tắt)'}</summary>
          <div className="fold-body">
            <Toggle
              checked={features.chatCommandsEnabled}
              onChange={(value) => onChange({ chatCommandsEnabled: value })}
              label="Bật !start, !stop, !help, !rank…"
              hint="Lệnh riêng của game (!join, !hit…) luôn chạy khi game đang chơi"
            />
            <div className="command-table">
              {GLOBAL_COMMAND_HELP.map((command) => (
                <span key={command.usage} className={command.host ? 'host' : ''}>
                  <code>{command.usage}</code> {command.description}{command.host ? ' (streamer/mod)' : ''}
                </span>
              ))}
            </div>
            <label className="inline-field stacked">
              <span>Mod được dùng lệnh streamer</span>
              <input value={features.moderators} maxLength={500} placeholder="vd: mod_1, @mod_2" onChange={(event) => onChange({ moderators: event.target.value })} />
            </label>
            <p className="field-hint">
              {hostUsername ? `Tài khoản LIVE @${hostUsername} luôn dùng được lệnh streamer.` : 'Khi kết nối, tài khoản đang LIVE luôn dùng được lệnh streamer.'} Nút test trong app cũng dùng được.
            </p>
            <label className="inline-field flush">
              <span>Chống spam (giây)</span>
              <input type="number" min={0} max={60} value={cooldownSeconds} onChange={(event) => onCooldownChange(Number(event.target.value))} />
            </label>
            <p className="field-hint">Mỗi viewer chỉ được 1 lệnh / câu trả lời trong khoảng này. 0 = tắt.</p>
          </div>
        </details>

        <details className="fold">
          <summary>🔊 Âm thanh game {features.gameSounds ? '' : '(đang tắt)'}</summary>
          <div className="fold-body">
            <Toggle
              checked={features.gameSounds}
              onChange={(value) => onChange({ gameSounds: value })}
              label="Âm thanh khi bắt đầu, trúng đòn, trả lời đúng/sai, thắng"
              hint="Có tiếng tích tắc 5 giây cuối. Phát trong app, OBS thu cùng âm thanh app."
            />
          </div>
        </details>

        <details className="fold">
          <summary>🏆 Điểm fan {features.fanEnabled ? '(đang bật)' : ''}</summary>
          <div className="fold-body">
            <Toggle
              checked={features.fanEnabled}
              onChange={(value) => onChange({ fanEnabled: value })}
              label="Cộng điểm cho mọi comment, tim, gift"
              hint="Điểm vào chung bảng xếp hạng với game"
            />
            <label className="inline-field flush">
              <span>Mỗi comment</span>
              <input type="number" min={0} max={100} value={features.fanChatPoints} onChange={(event) => onChange({ fanChatPoints: Number(event.target.value) })} />
            </label>
            <label className="inline-field flush">
              <span>Giãn cách (giây)</span>
              <input type="number" min={0} max={3600} value={features.fanChatCooldownSeconds} onChange={(event) => onChange({ fanChatCooldownSeconds: Number(event.target.value) })} />
            </label>
            <label className="inline-field flush">
              <span>Số tim = 1 điểm</span>
              <input type="number" min={1} max={10000} value={features.fanLikesPerPoint} onChange={(event) => onChange({ fanLikesPerPoint: Number(event.target.value) })} />
            </label>
            <label className="inline-field flush">
              <span>Mỗi gift</span>
              <input type="number" min={0} max={10000} value={features.fanGiftPoints} onChange={(event) => onChange({ fanGiftPoints: Number(event.target.value) })} />
            </label>
          </div>
        </details>

        <details className="fold">
          <summary>👋 Chào người mới {features.welcomeEnabled ? '' : '(đang tắt)'}</summary>
          <div className="fold-body">
            <Toggle
              checked={features.welcomeEnabled}
              onChange={(value) => onChange({ welcomeEnabled: value })}
              label="Hiện lời cảm ơn khi có người follow"
            />
            <Toggle
              checked={features.welcomeJoins}
              onChange={(value) => onChange({ welcomeJoins: value })}
              label="Chào cả người vào phòng"
              hint="Phòng đông sẽ bỏ bớt, follow được ưu tiên"
            />
            <Toggle
              checked={features.welcomeSound}
              onChange={(value) => onChange({ welcomeSound: value })}
              label="Tiếng chuông"
              hint="Phát trong app, OBS thu cùng âm thanh app"
            />
          </div>
        </details>
      </div>
    </Panel>
  );
}
