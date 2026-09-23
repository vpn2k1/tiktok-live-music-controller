/** Always-on LIVE features that run beside (not instead of) games. */
export interface LiveFeatures {
  fanEnabled: boolean;
  fanChatPoints: number;
  fanChatCooldownSeconds: number;
  fanLikesPerPoint: number;
  fanGiftPoints: number;
  welcomeEnabled: boolean;
  welcomeJoins: boolean;
  welcomeSound: boolean;
}

export const DEFAULT_FEATURES: LiveFeatures = {
  fanEnabled: false,
  fanChatPoints: 1,
  fanChatCooldownSeconds: 30,
  fanLikesPerPoint: 20,
  fanGiftPoints: 5,
  welcomeEnabled: true,
  welcomeJoins: false,
  welcomeSound: true
};

const NUMBER_LIMITS: Partial<Record<keyof LiveFeatures, [number, number]>> = {
  fanChatPoints: [0, 100],
  fanChatCooldownSeconds: [0, 3600],
  fanLikesPerPoint: [1, 10_000],
  fanGiftPoints: [0, 10_000]
};

export function normalizeFeatures(raw: Partial<Record<keyof LiveFeatures, unknown>> | undefined): LiveFeatures {
  const result = { ...DEFAULT_FEATURES };
  for (const key of Object.keys(DEFAULT_FEATURES) as (keyof LiveFeatures)[]) {
    const value = raw?.[key];
    const fallback = DEFAULT_FEATURES[key];
    if (typeof fallback === 'boolean') {
      (result as Record<string, unknown>)[key] = typeof value === 'boolean' ? value : fallback;
    } else {
      const [min, max] = NUMBER_LIMITS[key] ?? [0, Number.MAX_SAFE_INTEGER];
      const numeric = Number(value);
      (result as Record<string, unknown>)[key] = Number.isFinite(numeric) ? Math.min(max, Math.max(min, Math.round(numeric))) : fallback;
    }
  }
  return result;
}

/** Converts likes into fan points, carrying the remainder to the next batch. */
export function likePoints(carry: number, count: number, perPoint: number): { points: number; carry: number } {
  const total = carry + Math.max(0, Math.floor(count));
  const step = Math.max(1, perPoint);
  return { points: Math.floor(total / step), carry: total % step };
}
