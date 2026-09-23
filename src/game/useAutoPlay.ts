import { useCallback, useEffect, useRef, useState } from 'react';
import type { LiveEvent } from '../shared/types';
import {
  addGifts,
  autoPlayStep,
  createSession,
  EMPTY_GIFT_SWITCH,
  giftMatches,
  nextGameOrder,
  normalizeAutoPlay,
  rotation,
  type AutoPlaySession,
  type AutoPlaySettings,
  type GiftSwitchState,
  LIVE_WARNING_MS
} from './autoplay';
import type { GameState } from './engine';
import { GAMES, getGame } from './registry';

const STORAGE_KEY = 'autoplay-settings';
const TICK_MS = 1000;
const GAME_IDS = GAMES.map((game) => game.id);

interface AutoPlayOptions {
  /** Current round state, read synchronously (not the last rendered copy). */
  getGame: () => GameState;
  selectedId: string;
  /** Starts a game; false when it can't (e.g. needs a playlist). */
  start: (id: string) => boolean;
  finish: () => void;
  liveConnected: boolean;
  onAction: (message: string) => void;
  /** Short announcement on the overlay. */
  onNotify: (message: string) => void;
}

function loadSettings(): AutoPlaySettings {
  try {
    return normalizeAutoPlay(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'), GAME_IDS);
  } catch {
    return normalizeAutoPlay({}, GAME_IDS);
  }
}

function titleOf(id: string | null): string {
  return getGame(id)?.title ?? '';
}

/**
 * Auto host: plays the rotation for the planned LIVE length, switching game on
 * a timer or when viewers send the configured gift.
 */
export function useAutoPlay(options: AutoPlayOptions) {
  const [settings, setSettingsState] = useState<AutoPlaySettings>(loadSettings);
  const [session, setSessionState] = useState<AutoPlaySession | null>(null);
  const [gift, setGiftState] = useState<GiftSwitchState>(EMPTY_GIFT_SWITCH);

  const optionsRef = useRef(options);
  const settingsRef = useRef(settings);
  const sessionRef = useRef(session);
  const giftRef = useRef(gift);

  useEffect(() => {
    optionsRef.current = options;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Settings still work for this session.
    }
  }, [settings]);

  const setSession = useCallback((next: AutoPlaySession | null) => {
    sessionRef.current = next;
    setSessionState(next);
  }, []);

  const patchSession = useCallback((patch: Partial<AutoPlaySession>) => {
    if (sessionRef.current) setSession({ ...sessionRef.current, ...patch });
  }, [setSession]);

  const setGift = useCallback((next: GiftSwitchState) => {
    giftRef.current = next;
    setGiftState(next);
  }, []);

  const setSettings = useCallback((patch: Partial<AutoPlaySettings>) => {
    const next = normalizeAutoPlay({ ...settingsRef.current, ...patch }, GAME_IDS);
    settingsRef.current = next;
    setSettingsState(next);
  }, []);

  /** Adds time to the running LIVE (the typed LIVE length applies from the next start). */
  const extend = useCallback((minutes: number) => {
    const current = sessionRef.current;
    if (!current || current.liveEndsAt == null) return;
    const liveEndsAt = Math.max(Date.now(), current.liveEndsAt) + minutes * 60_000;
    setSession({ ...current, liveEndsAt, warned: current.warned && liveEndsAt - Date.now() <= LIVE_WARNING_MS });
    optionsRef.current.onAction(`LIVE thêm ${minutes} phút`);
  }, [setSession]);

  /** Starts the first game from `candidates` that can start. */
  const startFirst = useCallback((candidates: string[]): string | null => {
    for (const id of candidates) {
      if (optionsRef.current.start(id)) return id;
    }
    return null;
  }, []);

  /** Candidates after the current game (or, for the first game, the selected one first). */
  const candidates = useCallback((first: boolean): string[] => {
    const { getGame: current, selectedId } = optionsRef.current;
    const game = current();
    const list = rotation(settingsRef.current, GAME_IDS);
    const currentId = game.phase === 'running' ? game.kind : sessionRef.current?.gameId ?? selectedId;
    const order = nextGameOrder(list, currentId, settingsRef.current.order, Math.random);
    if (first && currentId && list.includes(currentId)) return [currentId, ...order.filter((id) => id !== currentId)];
    return order;
  }, []);

  const stop = useCallback((message = 'Đã tắt tự động chuyển game') => {
    if (!sessionRef.current) return;
    setSession(null);
    optionsRef.current.onAction(message);
  }, [setSession]);

  /** Starts the next game now; returns its id, or null when nothing could start. */
  const switchNow = useCallback((first = false): string | null => {
    const list = candidates(first);
    if (optionsRef.current.getGame().phase === 'running') optionsRef.current.finish();
    const id = startFirst(list);
    if (id && sessionRef.current) {
      patchSession({ gameId: id, slotEndsAt: Date.now() + settingsRef.current.switchMinutes * 60_000, idleSince: null });
    }
    return id;
  }, [candidates, patchSession, startFirst]);

  const begin = useCallback(() => {
    if (sessionRef.current) return;
    const now = Date.now();
    const game = optionsRef.current.getGame();
    const running = game.phase === 'running' ? game.kind : null;
    const fresh = createSession(settingsRef.current, now);
    // Keep a round that's already on; it gets a full slot.
    setSession(running ? { ...fresh, gameId: running, slotEndsAt: now + settingsRef.current.switchMinutes * 60_000 } : fresh);
    setGift(EMPTY_GIFT_SWITCH);
    const { liveMinutes, switchMinutes } = settingsRef.current;
    optionsRef.current.onAction(`Tự động: mỗi game ${switchMinutes} phút${liveMinutes ? `, LIVE ${liveMinutes} phút` : ''}`);
  }, [setGift, setSession]);

  // Main loop: LIVE timer, game switching and restarting rounds.
  const active = session != null;
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => {
      const current = sessionRef.current;
      if (!current) return;
      const { getGame: currentGame, finish, onNotify } = optionsRef.current;
      const game = currentGame();
      const now = Date.now();
      const running = game.phase === 'running';

      // Follow the host: a manually started game becomes the current one.
      if (running && game.kind && game.kind !== current.gameId) {
        patchSession({ gameId: game.kind, idleSince: null });
        return;
      }
      if (running && current.idleSince != null) patchSession({ idleSince: null });
      if (!running && current.idleSince == null && current.gameId != null) {
        patchSession({ idleSince: now });
        return;
      }

      const step = autoPlayStep(current, settingsRef.current, running, now);
      if (step === 'end') {
        if (running) finish();
        onNotify('⏰ Hết giờ LIVE — cảm ơn mọi người đã chơi!');
        stop('Hết giờ LIVE: đã tắt tự động chuyển game');
      } else if (step === 'warn') {
        patchSession({ warned: true });
        onNotify('⏰ Còn 5 phút nữa là hết LIVE!');
      } else if (step === 'finish') {
        // Slot is over: show this round's result, the next game starts after the gap.
        finish();
        patchSession({ idleSince: now });
      } else if (step === 'switch') {
        const first = current.gameId == null;
        const id = switchNow(first);
        if (id) {
          if (!first) onNotify(`🔄 Đổi game: ${titleOf(id)}`);
        } else {
          stop('Không game nào trong danh sách bắt đầu được: đã tắt tự động');
        }
      } else if (step === 'restart' && current.gameId) {
        if (!optionsRef.current.start(current.gameId) && !switchNow()) {
          stop('Không game nào trong danh sách bắt đầu được: đã tắt tự động');
        }
      }
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [active, patchSession, stop, switchNow]);

  // Optionally start with the LIVE.
  const wasConnected = useRef(options.liveConnected);
  useEffect(() => {
    if (options.liveConnected && !wasConnected.current && settingsRef.current.startOnConnect) begin();
    wasConnected.current = options.liveConnected;
  }, [begin, options.liveConnected]);

  /** Gift → switch game. Works with or without autoplay running. */
  const handleEvent = useCallback((event: LiveEvent) => {
    if (event.type !== 'gift' || !('giftName' in event)) return;
    const current = settingsRef.current;
    if (!giftMatches(current, String(event.giftName || ''))) return;

    const now = Date.now();
    const result = addGifts(giftRef.current, current, Number(event.count) || 1, now);
    setGift(result.state);
    if (!result.switch) return;

    const who = event.nickname || event.user;
    const { getGame: currentGame, finish, onNotify } = optionsRef.current;
    if (sessionRef.current && currentGame().phase === 'running') {
      // Show the result first; the loop starts the next game after the gap.
      finish();
      patchSession({ slotEndsAt: now, idleSince: now });
      onNotify(`🎁 ${who} tặng ${current.giftName}: đổi game!`);
      return;
    }
    if (sessionRef.current) {
      patchSession({ slotEndsAt: now });
      return;
    }
    const id = switchNow();
    if (id) onNotify(`🎁 ${who} tặng ${current.giftName}: đổi sang ${titleOf(id)}!`);
  }, [patchSession, setGift, switchNow]);

  return {
    settings,
    setSettings,
    session,
    gift,
    begin,
    extend,
    stop: () => stop(),
    skip: () => {
      if (!switchNow()) optionsRef.current.onAction('Không game nào trong danh sách bắt đầu được');
    },
    handleEvent
  };
}
