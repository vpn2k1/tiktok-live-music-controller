/**
 * Auto host: runs games back to back for the length of a LIVE, switching game
 * every `switchMinutes`, and lets viewers switch game early with a gift.
 * Everything here is pure; `useAutoPlay` owns the timers.
 */
export type AutoPlayOrder = 'sequential' | 'random';

export interface AutoPlaySettings {
  /** Planned LIVE length; 0 = no limit. Autoplay stops when it runs out. */
  liveMinutes: number;
  /** How long each game stays on before switching to the next one. */
  switchMinutes: number;
  /** Pause between two rounds of the same game. */
  roundGapSeconds: number;
  order: AutoPlayOrder;
  /** Games in the rotation (empty = every game). */
  gameIds: string[];
  /** Start autoplay by itself when TikTok connects. */
  startOnConnect: boolean;
  giftSwitchEnabled: boolean;
  /** Exact gift name (case-insensitive), e.g. "Rose". */
  giftName: string;
  /** Gifts of that name (summed over viewers) needed to switch. */
  giftCount: number;
  /** Minimum time a game stays on before a gift can switch it again. */
  giftCooldownSeconds: number;
}

export const DEFAULT_AUTOPLAY: AutoPlaySettings = {
  liveMinutes: 60,
  switchMinutes: 5,
  roundGapSeconds: 8,
  order: 'sequential',
  gameIds: [],
  startOnConnect: false,
  giftSwitchEnabled: true,
  giftName: 'Rose',
  giftCount: 5,
  giftCooldownSeconds: 30
};

const NUMBER_LIMITS: Record<'liveMinutes' | 'switchMinutes' | 'roundGapSeconds' | 'giftCount' | 'giftCooldownSeconds', [number, number]> = {
  liveMinutes: [0, 720],
  switchMinutes: [1, 180],
  roundGapSeconds: [3, 300],
  giftCount: [1, 10_000],
  giftCooldownSeconds: [0, 3600]
};

export function normalizeAutoPlay(raw: unknown, knownIds: readonly string[]): AutoPlaySettings {
  const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const result: AutoPlaySettings = { ...DEFAULT_AUTOPLAY };
  for (const [key, [min, max]] of Object.entries(NUMBER_LIMITS) as [keyof typeof NUMBER_LIMITS, [number, number]][]) {
    const numeric = Number(record[key]);
    result[key] = Number.isFinite(numeric) ? Math.min(max, Math.max(min, Math.round(numeric))) : DEFAULT_AUTOPLAY[key];
  }
  result.order = record.order === 'random' ? 'random' : 'sequential';
  result.startOnConnect = typeof record.startOnConnect === 'boolean' ? record.startOnConnect : DEFAULT_AUTOPLAY.startOnConnect;
  result.giftSwitchEnabled = typeof record.giftSwitchEnabled === 'boolean' ? record.giftSwitchEnabled : DEFAULT_AUTOPLAY.giftSwitchEnabled;
  result.giftName = typeof record.giftName === 'string' ? record.giftName.slice(0, 60) : DEFAULT_AUTOPLAY.giftName;
  const ids = Array.isArray(record.gameIds) ? record.gameIds : [];
  result.gameIds = knownIds.filter((id) => ids.includes(id));
  return result;
}

/** The games autoplay may pick, in library order. */
export function rotation(settings: AutoPlaySettings, allIds: readonly string[]): string[] {
  const picked = allIds.filter((id) => settings.gameIds.includes(id));
  return picked.length ? picked : [...allIds];
}

/**
 * Candidates for the next game, best first: the one after `currentId` (or a
 * random other one), then the rest so a game that can't start is skipped.
 */
export function nextGameOrder(list: readonly string[], currentId: string | null, order: AutoPlayOrder, random: () => number): string[] {
  if (!list.length) return [];
  const index = currentId ? list.indexOf(currentId) : -1;
  const after = [...list.slice(index + 1), ...list.slice(0, index + 1)];
  // Keep the current game last: only replay it when nothing else can start.
  const others = after.filter((id) => id !== currentId);
  const tail = currentId && list.includes(currentId) ? [currentId] : [];
  if (order === 'random' && others.length > 1) {
    const first = Math.min(others.length - 1, Math.floor(random() * others.length));
    return [others[first]!, ...others.filter((_, i) => i !== first), ...tail];
  }
  return [...others, ...tail];
}

export function giftMatches(settings: AutoPlaySettings, giftName: string): boolean {
  const wanted = settings.giftName.trim().toLowerCase();
  return settings.giftSwitchEnabled && wanted !== '' && giftName.trim().toLowerCase() === wanted;
}

export interface AutoPlaySession {
  startedAt: number;
  /** null = no LIVE time limit. */
  liveEndsAt: number | null;
  /** Game currently on (null until the first one starts). */
  gameId: string | null;
  /** When the current game's slot ends and the next game starts. */
  slotEndsAt: number;
  /** When the current game last stopped running (for the gap between rounds). */
  idleSince: number | null;
  /** "LIVE is almost over" was already announced. */
  warned: boolean;
}

export function createSession(settings: AutoPlaySettings, now: number): AutoPlaySession {
  return {
    startedAt: now,
    liveEndsAt: settings.liveMinutes > 0 ? now + settings.liveMinutes * 60_000 : null,
    gameId: null,
    slotEndsAt: now,
    idleSince: null,
    warned: false
  };
}

/** Announce the end of the LIVE this long before it. */
export const LIVE_WARNING_MS = 5 * 60_000;

export type AutoPlayStep = 'none' | 'end' | 'warn' | 'finish' | 'switch' | 'restart';

/**
 * What the controller should do right now. When a game's time is up its round
 * is finished first ('finish'), and the next game starts after the round gap
 * so viewers see the result.
 */
export function autoPlayStep(
  session: AutoPlaySession,
  settings: AutoPlaySettings,
  roundRunning: boolean,
  now: number
): AutoPlayStep {
  if (session.liveEndsAt != null && now >= session.liveEndsAt) return 'end';
  if (
    !session.warned &&
    session.liveEndsAt != null &&
    session.liveEndsAt - session.startedAt > LIVE_WARNING_MS &&
    session.liveEndsAt - now <= LIVE_WARNING_MS
  ) return 'warn';
  if (session.gameId == null) return 'switch';
  if (roundRunning) return now >= session.slotEndsAt ? 'finish' : 'none';
  const gapOver = session.idleSince == null || now - session.idleSince >= settings.roundGapSeconds * 1000;
  if (!gapOver) return 'none';
  return now >= session.slotEndsAt ? 'switch' : 'restart';
}

export interface GiftSwitchState {
  /** Matching gifts collected towards the next switch. */
  progress: number;
  /** When a gift last switched the game. */
  lastSwitchAt: number | null;
}

export const EMPTY_GIFT_SWITCH: GiftSwitchState = { progress: 0, lastSwitchAt: null };

/** Adds matching gifts; `switch` is true when they reach the threshold (outside the cooldown). */
export function addGifts(
  state: GiftSwitchState,
  settings: AutoPlaySettings,
  count: number,
  now: number
): { state: GiftSwitchState; switch: boolean } {
  if (state.lastSwitchAt != null && now - state.lastSwitchAt < settings.giftCooldownSeconds * 1000) {
    return { state, switch: false };
  }
  const progress = state.progress + Math.max(1, Math.floor(count) || 1);
  if (progress >= settings.giftCount) return { state: { progress: 0, lastSwitchAt: now }, switch: true };
  return { state: { ...state, progress }, switch: false };
}
