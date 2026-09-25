import { useCallback, useEffect, useState } from 'react';
import { providerInfo, type AiErrorCode, type AiStatus } from '../shared/ai';
import { t } from '../shared/i18n';

export interface AiControl {
  /** null until main answers (or outside Electron). */
  status: AiStatus | null;
  setStatus: (status: AiStatus) => void;
  /** The active provider has a key. */
  ready: boolean;
  /** "Google Gemini (gemini-2.5-flash)". */
  activeLabel: string;
}

/** AI settings as main reports them (keys themselves never reach the renderer). */
export function useAi(): AiControl {
  const [status, setStatus] = useState<AiStatus | null>(null);

  useEffect(() => {
    let alive = true;
    window.desktop?.aiStatus().then((next) => {
      if (alive && next) setStatus(next);
    }).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const set = useCallback((next: AiStatus) => setStatus(next), []);
  const active = status ? status.providers[status.active] : null;
  return {
    status,
    setStatus: set,
    ready: Boolean(active?.hasKey),
    activeLabel: status && active ? `${providerInfo(status.active).label} (${active.model})` : ''
  };
}

const ERROR_TEXT: Record<AiErrorCode, string> = {
  'no-key': 'Chưa có API key cho nhà cung cấp đang chọn (panel 🤖 AI tạo câu hỏi).',
  'bad-key': 'API key sai, hết hạn hoặc không có quyền dùng model này.',
  'bad-request': 'Yêu cầu không hợp lệ (kiểm tra tên model).',
  quota: 'Hết lượt miễn phí / vượt giới hạn của nhà cung cấp. Đợi một lúc hoặc đổi nhà cung cấp.',
  network: 'Không kết nối được tới nhà cung cấp AI (kiểm tra mạng).',
  timeout: 'AI trả lời quá lâu, thử lại với ít câu hơn.',
  empty: 'AI không trả về dòng nào dùng được, thử lại hoặc đổi chủ đề.',
  provider: 'Nhà cung cấp AI báo lỗi.',
  storage: 'Không lưu được cài đặt AI trên máy.'
};

/** Readable message for a failed AI call. */
export function aiErrorText(result: { code: AiErrorCode; detail?: string }): string {
  if (result.code === 'bad-key' && result.detail === 'format') return t('Key không đúng định dạng (dán lại, không có dấu cách).');
  if (result.code === 'bad-request' && result.detail === 'model') return t('Tên model không hợp lệ.');
  const message = t(ERROR_TEXT[result.code]);
  return result.detail && result.detail !== 'format' && result.detail !== 'model' ? `${message} (${result.detail})` : message;
}
