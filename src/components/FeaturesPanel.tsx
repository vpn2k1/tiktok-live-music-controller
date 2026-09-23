import type { LiveFeatures } from '../game/features';
import Panel from './Panel';
import Toggle from './Toggle';

interface FeaturesPanelProps {
  features: LiveFeatures;
  onChange: (patch: Partial<LiveFeatures>) => void;
}

export default function FeaturesPanel({ features, onChange }: FeaturesPanelProps) {
  return (
    <Panel title="Tính năng nền">
      <div className="rule-stack">
        <Toggle
          checked={features.fanEnabled}
          onChange={(value) => onChange({ fanEnabled: value })}
          label="Bảng xếp hạng fan"
          hint="Cộng điểm từ comment, tim, gift vào bảng xếp hạng"
        />
        <label className="inline-field">
          <span>Mỗi comment</span>
          <input type="number" min={0} max={100} value={features.fanChatPoints} onChange={(event) => onChange({ fanChatPoints: Number(event.target.value) })} />
        </label>
        <label className="inline-field">
          <span>Giãn cách (s)</span>
          <input type="number" min={0} max={3600} value={features.fanChatCooldownSeconds} onChange={(event) => onChange({ fanChatCooldownSeconds: Number(event.target.value) })} />
        </label>
        <label className="inline-field">
          <span>Tim / 1 điểm</span>
          <input type="number" min={1} max={10000} value={features.fanLikesPerPoint} onChange={(event) => onChange({ fanLikesPerPoint: Number(event.target.value) })} />
        </label>
        <label className="inline-field">
          <span>Mỗi gift</span>
          <input type="number" min={0} max={10000} value={features.fanGiftPoints} onChange={(event) => onChange({ fanGiftPoints: Number(event.target.value) })} />
        </label>

        <Toggle
          checked={features.welcomeEnabled}
          onChange={(value) => onChange({ welcomeEnabled: value })}
          label="Chào người mới"
          hint="Hiện tên trên overlay khi có người follow"
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
          label="Âm thanh chào"
          hint="Tiếng chuông ngắn, phát trong app (OBS thu cùng nhạc)"
        />
      </div>
    </Panel>
  );
}
