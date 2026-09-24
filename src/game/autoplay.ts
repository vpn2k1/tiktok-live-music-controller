/**
 * Auto host: runs games back to back for the length of a LIVE, switching game
 * every `switchMinutes`, and lets viewers switch game early with a gift.
 * Everything here is pure; `useAutoPlay` owns the timers.
 */
import { t } from '../shared/i18n';

export type AutoPlayOrder = 'sequential' | 'random';

/** A named set of games the streamer prepares before going LIVE. */
export interface GameGroup {
  id: string;
  name: string;
  /** Library order; these are the numbers viewers vote with. */
  gameIds: string[];
}

/** What grouping needs to know about a game. */
export interface GameInfo {
  id: string;
  category: string;
}

export const MAX_GROUPS = 12;

export interface AutoPlaySettings {
  /** Planned LIVE length; 0 = no limit. Autoplay stops when it runs out. */
  liveMinutes: number;
  /** When to move to the next game: after `switchMinutes`, or after `roundsPerGame` rounds. */
  switchBy: 'time' | 'rounds';
  /** How long each game stays on before switching to the next one. */
  switchMinutes: number;
  /** Rounds (question sets) each game plays before switching. */
  roundsPerGame: number;
  /** Pause between two rounds of the same game. */
  roundGapSeconds: number;
  order: AutoPlayOrder;
  /** Game groups; only the active group's games are listed, voted and rotated. */
  groups: GameGroup[];
  activeGroupId: string;
  /** Start autoplay by itself when TikTok connects. */
  startOnConnect: boolean;
  giftSwitchEnabled: boolean;
  /** Exact gift name (case-insensitive), e.g. "Rose". */
  giftName: string;
  /** Gifts of that name (summed over viewers) needed to switch. */
  giftCount: number;
  /** Minimum time a game stays on before a gift can switch it again. */
  giftCooldownSeconds: number;
  /** Viewers pick the next game on an overlay list (instead of the rotation order). */
  lobbyEnabled: boolean;
  /** Voting time. */
  lobbySeconds: number;
  /** Votes per gift unit in the list; 0 = gifts don't vote. */
  lobbyGiftVotes: number;
  /** Distinct viewers typing !doigame needed to switch game; 0 = viewers can't. */
  switchCommandVotes: number;
}

export const DEFAULT_AUTOPLAY: AutoPlaySettings = {
  liveMinutes: 60,
  switchBy: 'rounds',
  switchMinutes: 5,
  roundsPerGame: 1,
  roundGapSeconds: 8,
  order: 'sequential',
  // Filled from the game list by normalizeAutoPlay.
  groups: [],
  activeGroupId: '',
  startOnConnect: false,
  giftSwitchEnabled: true,
  giftName: 'Rose',
  giftCount: 5,
  giftCooldownSeconds: 30,
  lobbyEnabled: true,
  lobbySeconds: 20,
  lobbyGiftVotes: 5,
  switchCommandVotes: 5
};

type NumberKey = 'liveMinutes' | 'switchMinutes' | 'roundsPerGame' | 'roundGapSeconds' | 'giftCount' | 'giftCooldownSeconds'
  | 'lobbySeconds' | 'lobbyGiftVotes' | 'switchCommandVotes';

const NUMBER_LIMITS: Record<NumberKey, [number, number]> = {
  liveMinutes: [0, 720],
  switchMinutes: [1, 180],
  roundsPerGame: [1, 50],
  roundGapSeconds: [3, 300],
  giftCount: [1, 10_000],
  giftCooldownSeconds: [0, 3600],
  lobbySeconds: [5, 300],
  lobbyGiftVotes: [0, 1000],
  switchCommandVotes: [0, 100]
};

/** Starter groups: one per category plus "all games". */
export function defaultGroups(games: readonly GameInfo[]): GameGroup[] {
  const ids = (category?: string) => games.filter((game) => !category || game.category === category).map((game) => game.id);
  return [
    { id: 'fun', name: 'Giải trí 🎉', gameIds: ids('fun') },
    { id: 'english', name: 'Tiếng Anh 🇬🇧', gameIds: ids('english') },
    { id: 'japanese', name: 'Tiếng Nhật 🇯🇵', gameIds: ids('japanese') },
    { id: 'chinese', name: 'Tiếng Trung 🇨🇳', gameIds: ids('chinese') },
    { id: 'all', name: 'Tất cả game', gameIds: ids() }
  ].filter((group) => group.gameIds.length > 0);
}

/**
 * Validates stored/typed groups: known games only (library order, no
 * duplicates), no empty groups, unique ids. Old settings with a `gameIds`
 * rotation list become a "Nhóm của tôi" group.
 */
export function normalizeGroups(
  raw: unknown,
  rawActive: unknown,
  legacyIds: unknown,
  games: readonly GameInfo[]
): { groups: GameGroup[]; activeGroupId: string } {
  const knownIds = games.map((game) => game.id);
  const pick = (ids: unknown) => (Array.isArray(ids) ? knownIds.filter((id) => ids.includes(id)) : []);
  const seen = new Set<string>();
  const groups: GameGroup[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const id = typeof record.id === 'string' && /^[\w-]{1,40}$/.test(record.id) ? record.id : '';
    // The built-in "all games" group always follows the library (new games included).
    const gameIds = id === 'all' ? [...knownIds] : pick(record.gameIds);
    if (!id || seen.has(id) || !gameIds.length || groups.length >= MAX_GROUPS) continue;
    seen.add(id);
    groups.push({ id, name: typeof record.name === 'string' ? record.name.slice(0, 40) : '', gameIds });
  }
  if (!groups.length) {
    groups.push(...defaultGroups(games));
    const legacy = pick(legacyIds);
    if (legacy.length) {
      groups.unshift({ id: 'mine', name: 'Nhóm của tôi', gameIds: legacy });
      return { groups, activeGroupId: 'mine' };
    }
  }
  const activeGroupId = groups.some((group) => group.id === rawActive) ? String(rawActive) : groups[0]?.id ?? '';
  return { groups, activeGroupId };
}

/** Stored (Vietnamese) name of a new group; shown through `groupLabel`. */
export function newGroupName(number: number): string {
  return 'Nhóm {n}'.replace('{n}', String(number));
}

/** Display name of a group: default names are translated, custom names shown as typed. */
export function groupLabel(group: Pick<GameGroup, 'name'> | undefined): string {
  const name = group?.name.trim() ?? '';
  return name ? t(name) : t('Nhóm không tên');
}

export function activeGroup(settings: AutoPlaySettings): GameGroup | undefined {
  return settings.groups.find((group) => group.id === settings.activeGroupId);
}

export function normalizeAutoPlay(raw: unknown, games: readonly GameInfo[]): AutoPlaySettings {
  const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const result: AutoPlaySettings = { ...DEFAULT_AUTOPLAY };
  for (const [key, [min, max]] of Object.entries(NUMBER_LIMITS) as [keyof typeof NUMBER_LIMITS, [number, number]][]) {
    const numeric = Number(record[key]);
    result[key] = Number.isFinite(numeric) ? Math.min(max, Math.max(min, Math.round(numeric))) : DEFAULT_AUTOPLAY[key];
  }
  result.order = record.order === 'random' ? 'random' : 'sequential';
  result.switchBy = record.switchBy === 'time' ? 'time' : 'rounds';
  for (const key of ['startOnConnect', 'giftSwitchEnabled', 'lobbyEnabled'] as const) {
    result[key] = typeof record[key] === 'boolean' ? record[key] : DEFAULT_AUTOPLAY[key];
  }
  result.giftName = typeof record.giftName === 'string' ? record.giftName.slice(0, 60) : DEFAULT_AUTOPLAY.giftName;
  Object.assign(result, normalizeGroups(record.groups, record.activeGroupId, record.gameIds, games));
  return result;
}

/** The active group's games (library order): what viewers see, vote and autoplay rotates. */
export function rotation(settings: AutoPlaySettings, allIds: readonly string[]): string[] {
  const ids = activeGroup(settings)?.gameIds ?? [];
  const picked = allIds.filter((id) => ids.includes(id));
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
  /** Rounds of the current game finished so far ("rounds" mode). */
  roundsPlayed: number;
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
    roundsPlayed: 0,
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
  const byRounds = settings.switchBy === 'rounds';
  // "rounds" mode never cuts a round short; "time" mode ends it when the game's time is up.
  if (roundRunning) return !byRounds && now >= session.slotEndsAt ? 'finish' : 'none';
  const gapOver = session.idleSince == null || now - session.idleSince >= settings.roundGapSeconds * 1000;
  if (!gapOver) return 'none';
  const gameDone = byRounds ? session.roundsPlayed >= settings.roundsPerGame : now >= session.slotEndsAt;
  return gameDone ? 'switch' : 'restart';
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
