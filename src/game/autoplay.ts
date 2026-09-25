/**
 * Game host: a started game plays round after round without end (the play
 * loop) until someone asks to switch — a gift, `!doigame`, or (optionally)
 * a number of rounds / minutes. A switch never cuts a round: the round ends
 * normally, its result is celebrated, then the game list opens. The optional
 * auto session adds the LIVE length. Everything here is pure; `useAutoPlay`
 * owns the timers.
 */
import { t } from '../shared/i18n';

export type AutoPlayOrder = 'sequential' | 'random';
export type SwitchBy = 'command' | 'rounds' | 'time';

/** Bumped when a default changes meaning; older stored settings get the new default. */
export const AUTOPLAY_SETTINGS_VERSION = 2;

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
  /**
   * When a game ends by itself: `command` = never (it plays until a gift,
   * `!doigame` or the host switches), or after `roundsPerGame` rounds, or
   * after `switchMinutes`. Switching always waits for the round to end.
   */
  switchBy: SwitchBy;
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
  /** Minimum time a game stays on (from its start) before gifts can switch it. */
  giftCooldownSeconds: number;
  /** Viewers pick the next game on an overlay list (instead of the rotation order). */
  lobbyEnabled: boolean;
  /** Voting time. */
  lobbySeconds: number;
  /** Votes per gift unit in the list; 0 = gifts don't vote. */
  lobbyGiftVotes: number;
  /** Distinct viewers typing !doigame needed to switch game; 0 = viewers can't. */
  switchCommandVotes: number;
  version: number;
}

export const DEFAULT_AUTOPLAY: AutoPlaySettings = {
  liveMinutes: 60,
  switchBy: 'command',
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
  switchCommandVotes: 5,
  version: AUTOPLAY_SETTINGS_VERSION
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
    { id: 'versus', name: 'Đối kháng ⚔️', gameIds: ids('versus') },
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
  // Version 1 switched game after 1 round by default; games now play on until asked to switch.
  const current = record.version === AUTOPLAY_SETTINGS_VERSION;
  result.switchBy = current && (record.switchBy === 'time' || record.switchBy === 'rounds') ? record.switchBy : 'command';
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

/** The game being played continuously (null in the host = no game / the list is open). */
export interface PlayLoop {
  gameId: string;
  /** When this game was chosen (for "switch after N minutes"). */
  since: number;
  /** When the last round ended; null while a round runs. */
  idleSince: number | null;
  /** Rounds of this game finished so far. */
  roundsPlayed: number;
  /** A switch was asked (gift, !doigame…): when the current round ends, go to the next game. */
  switchPending: boolean;
}

export function createLoop(gameId: string, now: number): PlayLoop {
  return { gameId, since: now, idleSince: null, roundsPlayed: 0, switchPending: false };
}

/**
 * What the play loop should do now: nothing while a round runs (a switch is
 * never forced mid-round) or while the last result is on screen, then either
 * play another round of the same game or switch.
 */
export function loopStep(loop: PlayLoop, settings: AutoPlaySettings, roundRunning: boolean, now: number): 'none' | 'restart' | 'switch' {
  if (roundRunning || loop.idleSince == null) return 'none';
  if (now - loop.idleSince < settings.roundGapSeconds * 1000) return 'none';
  if (loop.switchPending) return 'switch';
  if (settings.switchBy === 'rounds' && loop.roundsPlayed >= settings.roundsPerGame) return 'switch';
  if (settings.switchBy === 'time' && now - loop.since >= settings.switchMinutes * 60_000) return 'switch';
  return 'restart';
}

/** What the host sees each tick. */
export interface HostInput {
  /** A round is running, and its game. */
  running: boolean;
  kind: string | null;
  /** The auto session is on. */
  auto: boolean;
  /** The game list is shown (`timed`: its countdown runs). */
  list: { timed: boolean } | null;
}

export type HostAction =
  | { type: 'none' }
  /** A game started another way (host, !start, the list) becomes the one being played. */
  | { type: 'adopt'; gameId: string }
  | { type: 'roundStarted' }
  /** A round just ended: its result stays on screen for the round gap. */
  | { type: 'roundEnded' }
  | { type: 'restart'; gameId: string }
  | { type: 'switch'; gameId: string }
  /** Auto session: start the countdown of a list that waits for its first vote. */
  | { type: 'timeList' }
  /** Auto session with nothing on: open the list, or start the first game when the list is off. */
  | { type: 'openList' }
  | { type: 'startFirst' };

const NOTHING: HostAction = { type: 'none' };

/** One tick of the game host (the auto session's LIVE timer is `sessionStep`). */
export function hostStep(loop: PlayLoop | null, settings: AutoPlaySettings, input: HostInput, now: number): HostAction {
  if (input.running && input.kind && input.kind !== loop?.gameId) return { type: 'adopt', gameId: input.kind };
  if (!loop) {
    if (!input.auto || input.running) return NOTHING;
    if (input.list) return input.list.timed ? NOTHING : { type: 'timeList' };
    return { type: settings.lobbyEnabled ? 'openList' : 'startFirst' };
  }
  if (input.running) return loop.idleSince != null ? { type: 'roundStarted' } : NOTHING;
  if (loop.idleSince == null) return { type: 'roundEnded' };
  const step = loopStep(loop, settings, false, now);
  return step === 'none' ? NOTHING : { type: step, gameId: loop.gameId };
}

/** The play loop after a bookkeeping action (other actions leave it as is). */
export function applyHostAction(loop: PlayLoop | null, action: HostAction, now: number): PlayLoop | null {
  if (action.type === 'adopt') return createLoop(action.gameId, now);
  if (!loop) return loop;
  if (action.type === 'roundStarted') return { ...loop, idleSince: null };
  if (action.type === 'roundEnded') return { ...loop, idleSince: now, roundsPlayed: loop.roundsPlayed + 1 };
  return loop;
}

/** The auto session: LIVE length on top of the play loop. */
export interface AutoPlaySession {
  startedAt: number;
  /** null = no LIVE time limit. */
  liveEndsAt: number | null;
  /** "LIVE is almost over" was already announced. */
  warned: boolean;
}

export function createSession(settings: AutoPlaySettings, now: number): AutoPlaySession {
  return {
    startedAt: now,
    liveEndsAt: settings.liveMinutes > 0 ? now + settings.liveMinutes * 60_000 : null,
    warned: false
  };
}

/** Announce the end of the LIVE this long before it. */
export const LIVE_WARNING_MS = 5 * 60_000;

export function sessionStep(session: AutoPlaySession, now: number): 'none' | 'end' | 'warn' {
  if (session.liveEndsAt != null && now >= session.liveEndsAt) return 'end';
  if (
    !session.warned &&
    session.liveEndsAt != null &&
    session.liveEndsAt - session.startedAt > LIVE_WARNING_MS &&
    session.liveEndsAt - now <= LIVE_WARNING_MS
  ) return 'warn';
  return 'none';
}

export interface GiftSwitchState {
  /** Matching gifts collected towards the next switch. */
  progress: number;
  /** When a gift last switched the game. */
  lastSwitchAt: number | null;
}

export const EMPTY_GIFT_SWITCH: GiftSwitchState = { progress: 0, lastSwitchAt: null };

/**
 * Adds matching gifts; `switch` is true when they reach the threshold. Gifts
 * in the first `giftCooldownSeconds` of a game (`gameSince` = when it was
 * chosen) are ignored, so a new game gets played — counted from the game's
 * start, since a switch waits for the previous round to end.
 */
export function addGifts(
  state: GiftSwitchState,
  settings: AutoPlaySettings,
  count: number,
  now: number,
  gameSince: number | null
): { state: GiftSwitchState; switch: boolean } {
  if (gameSince != null && now - gameSince < settings.giftCooldownSeconds * 1000) {
    return { state, switch: false };
  }
  const progress = state.progress + Math.max(1, Math.floor(count) || 1);
  if (progress >= settings.giftCount) return { state: { progress: 0, lastSwitchAt: now }, switch: true };
  return { state: { ...state, progress }, switch: false };
}
