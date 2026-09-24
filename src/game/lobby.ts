import type { OverlayRow, OverlayState } from '../shared/types';
import { splitTitle } from '../shared/gameTitle';
import { t } from '../shared/i18n';
import { getGame } from './registry';

/**
 * Game lobby: the overlay lists the streamer's chosen game group by number,
 * viewers pick the next game by commenting a number (every accepted comment is
 * a vote) or by sending gifts.
 * Pure; `useAutoPlay` owns the timer.
 */
export interface LobbyState {
  /** Game ids shown as options 1..n. */
  options: string[];
  votes: number[];
  /**
   * Last option each viewer voted for (gifts go to it). Shared between lobby
   * snapshots and updated in place: copying it per vote doesn't scale.
   */
  choices: Map<string, number>;
  openedAt: number;
  /** null = the countdown starts with the first vote. */
  endsAt: number | null;
  timerStartedAt: number | null;
}

export const LOBBY_ACCENT = '#7867ff';

export function openLobby(options: string[], now: number, timedSeconds: number | null): LobbyState {
  return {
    options,
    votes: options.map(() => 0),
    choices: new Map(),
    openedAt: now,
    endsAt: timedSeconds != null ? now + timedSeconds * 1000 : null,
    timerStartedAt: timedSeconds != null ? now : null
  };
}

/** "3", "#3", "!game 3", "!chon 3" → option index; null when it isn't a vote. */
export function parseLobbyVote(text: string, optionCount: number): number | null {
  const match = /^(?:!(?:game|chon|chọn|vote)\s*)?#?(\d{1,2})$/i.exec(text.trim());
  if (!match) return null;
  const index = Number(match[1]) - 1;
  return index >= 0 && index < optionCount ? index : null;
}

/** `!doigame`, `!đổi game`, `!skipgame` (viewer vote to switch game). */
export function isSwitchCommand(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith('!') || trimmed.length > 20) return false;
  const simple = trimmed.slice(1).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/\s+/g, '');
  return simple === 'doigame' || simple === 'skipgame' || simple === 'doi';
}

function withTimer(state: LobbyState, now: number, seconds: number): LobbyState {
  return state.endsAt != null ? state : { ...state, endsAt: now + seconds * 1000, timerStartedAt: now };
}

export function voteLobby(state: LobbyState, user: string, index: number, weight: number, now: number, seconds: number): LobbyState {
  if (index < 0 || index >= state.options.length || weight <= 0) return state;
  const votes = state.votes.map((value, i) => (i === index ? value + weight : value));
  state.choices.set(user, index);
  return withTimer({ ...state, votes }, now, seconds);
}

/** Gifts count for the viewer's chosen game, or the leading one when they haven't picked. */
export function giftLobby(state: LobbyState, user: string, count: number, votesPerGift: number, now: number, seconds: number): LobbyState {
  const weight = Math.max(1, Math.floor(count) || 1) * votesPerGift;
  if (weight <= 0) return state;
  const chosen = state.choices.get(user);
  const index = chosen ?? state.votes.indexOf(Math.max(...state.votes));
  const votes = state.votes.map((value, i) => (i === index ? value + weight : value));
  return withTimer({ ...state, votes }, now, seconds);
}

/** Options best first; ties (and a lobby without votes) are broken randomly. */
export function lobbyRanking(state: LobbyState, random: () => number): string[] {
  return state.options
    .map((id, i) => ({ id, votes: state.votes[i] ?? 0, key: random() }))
    .sort((a, b) => b.votes - a.votes || a.key - b.key)
    .map((item) => item.id);
}

/** The lobby as the overlay's game card (same shape as a running game). */
export function lobbyOverlay(state: LobbyState, votesPerGift: number, groupName = ''): OverlayState['game'] {
  const total = state.votes.reduce((sum, value) => sum + value, 0);
  const top = Math.max(0, ...state.votes);
  const rows: OverlayRow[] = state.options.map((id, i) => {
    const votes = state.votes[i] ?? 0;
    return {
      badge: String(i + 1),
      label: t(getGame(id)?.title ?? id),
      value: String(votes),
      percent: total ? Math.round((votes / total) * 100) : 0,
      highlight: votes > 0 && votes === top
    };
  });
  const items = state.options.map((id, i) => {
    const game = getGame(id);
    const { name, icon } = splitTitle(t(game?.title ?? id));
    const votes = state.votes[i] ?? 0;
    return {
      number: i + 1,
      icon,
      name,
      category: game?.category ?? 'fun',
      votes,
      percent: total ? Math.round((votes / total) * 100) : 0,
      leader: votes > 0 && votes === top
    };
  });
  const count = state.options.length;
  return {
    // The headline says "type 1–N to pick a game"; the title only names the group (it has to fit next to the timer).
    title: groupName.trim() ? `🎮 ${t(groupName.trim())}` : t('🎮 Chọn game'),
    phase: 'running',
    endsAt: state.endsAt,
    timerStartedAt: state.timerStartedAt,
    message: '',
    accent: LOBBY_ACCENT,
    menu: { items },
    headline: t('Gõ 1–{count} để chọn game!', { count }),
    hint: state.endsAt == null ? t('Có phiếu đầu tiên là bắt đầu đếm ngược') : t('Game nhiều phiếu nhất sẽ được chơi'),
    rows,
    progress: null,
    teams: null,
    race: null,
    wheel: null,
    howTo: [
      { icon: '💬', text: t('Gõ 1–{count} · chọn game', { count }) },
      ...(votesPerGift > 0 ? [{ icon: '🎁', text: t('Tặng quà · +{votes} phiếu / quà', { votes: votesPerGift }) }] : [])
    ]
  };
}
