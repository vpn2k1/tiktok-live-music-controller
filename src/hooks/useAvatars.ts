import { useCallback, useRef } from 'react';
import type { LiveEvent, OverlayState } from '../shared/types';

/** Viewers remembered (most recent first out); plenty for a LIVE, bounded for huge rooms. */
const MAX_VIEWERS = 3000;
/** Pictures sent per overlay update (the overlay server caps each state at 64 KB). */
const MAX_PER_STATE = 32;

/**
 * Profile pictures seen in LIVE events, looked up by the names the overlay
 * draws (nickname for leaderboards and rows, username for follow/join bubbles).
 */
export function useAvatars() {
  const directory = useRef(new Map<string, string>());

  const remember = useCallback((event: LiveEvent) => {
    if (!event.avatar) return;
    const map = directory.current;
    for (const key of [event.user, event.nickname]) {
      if (!key) continue;
      map.delete(key);
      map.set(key, event.avatar);
    }
    while (map.size > MAX_VIEWERS * 2) map.delete(map.keys().next().value as string);
  }, []);

  /** Pictures for the given names (only those with a known picture). */
  const avatarsFor = useCallback((names: Iterable<string>) => {
    const out: Record<string, string> = {};
    let count = 0;
    for (const raw of names) {
      const name = raw.replace(/^@/, '');
      const url = directory.current.get(name);
      if (!url || out[name]) continue;
      out[name] = url;
      if (++count >= MAX_PER_STATE) break;
    }
    return out;
  }, []);

  return { remember, avatarsFor };
}

/** Names the overlay draws an avatar for (leaderboard, rows, race lanes, effects, bubbles). */
export function overlayAvatarNames(state: Omit<OverlayState, 'updatedAt' | 'avatars'>): string[] {
  return [
    ...state.leaderboard.map((entry) => entry.nickname),
    ...state.game.rows.flatMap((row) => (row.avatar ? [row.avatar] : [])),
    ...(state.game.race?.lanes.map((lane) => lane.label) ?? []),
    ...(state.game.grow?.items.map((item) => item.label) ?? []),
    ...state.effects.flatMap((effect) => [...(effect.user ? [effect.user] : []), ...(effect.podium?.map((entry) => entry.name) ?? [])]),
    ...state.alerts.flatMap((alert) => (alert.name ? [alert.name] : []))
  ];
}
