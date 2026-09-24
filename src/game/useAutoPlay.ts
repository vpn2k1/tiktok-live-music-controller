import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '../hooks/useLanguage';
import { t } from '../shared/i18n';
import type { GamePhase, LiveEvent } from '../shared/types';
import {
  activeGroup,
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
import {
  giftLobby,
  isSwitchCommand,
  lobbyOverlay,
  lobbyRanking,
  openLobby,
  parseLobbyVote,
  voteLobby,
  type LobbyState
} from './lobby';
import { GAMES, getGame } from './registry';

const STORAGE_KEY = 'autoplay-settings';
const TICK_MS = 1000;
const GAME_IDS = GAMES.map((game) => game.id);
const GAME_INFO = GAMES.map((game) => ({ id: game.id, category: game.category }));

interface AutoPlayOptions {
  /** Current round state, read synchronously (not the last rendered copy). */
  getGame: () => GameState;
  /** Rendered round phase, so the lobby opens/closes with it. */
  phase: GamePhase;
  selectedId: string;
  /** Starts a game; false when it can't (e.g. needs a playlist). */
  start: (id: string) => boolean;
  /** `quiet`: no result banner (the game list replaces the round right away). */
  finish: (options?: { quiet?: boolean }) => void;
  /** Per-viewer chat cooldown shared with games and music rules. */
  acceptCommand: (user: string) => boolean;
  /** Streamer, moderator, or the app's own test tools. */
  isHost: (user: string, simulated: boolean) => boolean;
  liveConnected: boolean;
  onAction: (message: string) => void;
  /** Short announcement on the overlay. */
  onNotify: (message: string) => void;
}

function loadSettings(): AutoPlaySettings {
  try {
    return normalizeAutoPlay(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'), GAME_INFO);
  } catch {
    return normalizeAutoPlay({}, GAME_INFO);
  }
}

function titleOf(id: string | null): string {
  return t(getGame(id)?.title ?? '');
}

/**
 * Auto host + game picker: plays games for the planned LIVE length, switching
 * game on a timer, on a gift or on `!doigame`. With the lobby on, the next game
 * is voted by viewers on an overlay list instead of following the rotation.
 */
export function useAutoPlay(options: AutoPlayOptions) {
  const [settings, setSettingsState] = useState<AutoPlaySettings>(loadSettings);
  const [session, setSessionState] = useState<AutoPlaySession | null>(null);
  const [gift, setGiftState] = useState<GiftSwitchState>(EMPTY_GIFT_SWITCH);
  const [lobby, setLobbyState] = useState<LobbyState | null>(null);

  const optionsRef = useRef(options);
  const settingsRef = useRef(settings);
  const sessionRef = useRef(session);
  const giftRef = useRef(gift);
  const lobbyRef = useRef(lobby);
  /** The list was opened by the host (☰ in the game window): it stays even with voting turned off. */
  const manualLobby = useRef(false);
  /** Viewers who typed !doigame during the round that started at `round`. */
  const switchVotes = useRef<{ round: number | null; users: Set<string> }>({ round: null, users: new Set() });

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

  const setLobby = useCallback((next: LobbyState | null) => {
    if (!next) manualLobby.current = false;
    lobbyRef.current = next;
    setLobbyState(next);
  }, []);

  const setSettings = useCallback((patch: Partial<AutoPlaySettings>) => {
    const next = normalizeAutoPlay({ ...settingsRef.current, ...patch }, GAME_INFO);
    settingsRef.current = next;
    setSettingsState(next);
  }, []);

  /** Adds time to the running LIVE (the typed LIVE length applies from the next start). */
  const extend = useCallback((minutes: number) => {
    const current = sessionRef.current;
    if (!current || current.liveEndsAt == null) return;
    const liveEndsAt = Math.max(Date.now(), current.liveEndsAt) + minutes * 60_000;
    setSession({ ...current, liveEndsAt, warned: current.warned && liveEndsAt - Date.now() <= LIVE_WARNING_MS });
    optionsRef.current.onAction(t('LIVE thêm {minutes} phút', { minutes }));
  }, [setSession]);

  /** Starts the first game from `candidates` that can start; a new game gets a full slot. */
  const startFirst = useCallback((candidates: string[]): string | null => {
    for (const id of candidates) {
      if (!optionsRef.current.start(id)) continue;
      if (sessionRef.current) {
        patchSession({ gameId: id, slotEndsAt: Date.now() + settingsRef.current.switchMinutes * 60_000, idleSince: null, roundsPlayed: 0 });
      }
      return id;
    }
    return null;
  }, [patchSession]);

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

  const stop = useCallback((message = t('Đã tắt tự động chuyển game')) => {
    if (!sessionRef.current) return;
    setSession(null);
    optionsRef.current.onAction(message);
  }, [setSession]);

  /** Starts the next rotation game now; returns its id, or null when nothing could start. */
  const switchNow = useCallback((first = false): string | null => {
    const list = candidates(first);
    if (optionsRef.current.getGame().phase === 'running') optionsRef.current.finish();
    return startFirst(list);
  }, [candidates, startFirst]);

  // ---- Lobby -------------------------------------------------------------

  /** Shows the active group's games. `timed`: the countdown starts now instead of at the first vote. */
  const showLobby = useCallback((timed: boolean) => {
    const current = settingsRef.current;
    setLobby(openLobby(rotation(current, GAME_IDS), Date.now(), timed ? current.lobbySeconds : null));
  }, [setLobby]);

  /** Starts the game with the most votes (skipping ones that can't start). */
  const resolveLobby = useCallback(() => {
    const current = lobbyRef.current;
    if (!current) return;
    setLobby(null);
    const ranking = lobbyRanking(current, Math.random);
    const votes = Math.max(0, ...current.votes);
    const id = startFirst(ranking);
    if (id) {
      optionsRef.current.onNotify(votes > 0 ? t('🎮 {title} được chọn!', { title: titleOf(id) }) : t('🎮 Chơi {title}!', { title: titleOf(id) }));
    } else {
      optionsRef.current.onAction(t('Không game nào trong danh sách bắt đầu được'));
    }
  }, [setLobby, startFirst]);

  /**
   * Back to the game list (☰ in the game window): ends the running round
   * (its result and points count) and shows the list, even with voting off.
   */
  const openMenu = useCallback(() => {
    const { getGame: currentGame, finish, onAction } = optionsRef.current;
    const running = currentGame().phase === 'running';
    if (!running && lobbyRef.current) return;
    if (running) finish({ quiet: true });
    showLobby(false);
    manualLobby.current = true;
    onAction(t('Đã mở danh sách game: bấm một game trong cửa sổ game để chơi'));
  }, [showLobby]);

  /** The host picks game number `index` (0-based) in the list: it starts right away. */
  const pickLobby = useCallback((index: number) => {
    const current = lobbyRef.current;
    const id = current?.options[index];
    if (!current || !id || optionsRef.current.getGame().phase === 'running') return;
    setLobby(null);
    if (startFirst([id])) {
      optionsRef.current.onNotify(t('🎮 Chơi {title}!', { title: titleOf(id) }));
    } else {
      setLobby(current);
      optionsRef.current.onAction(t('Không bắt đầu được {title}', { title: titleOf(id) }));
    }
  }, [setLobby, startFirst]);

  // A game started by anything (host, !start, the lobby) closes the list.
  useEffect(() => {
    if (options.phase === 'running' && lobbyRef.current) setLobby(null);
  }, [options.phase, setLobby]);

  // Switching group (or editing it) refreshes an open list; numbers change, so votes restart.
  const groupKey = rotation(settings, GAME_IDS).join(',');
  useEffect(() => {
    const current = lobbyRef.current;
    if (current && current.options.join(',') !== groupKey) showLobby(sessionRef.current != null);
  }, [groupKey, showLobby]);

  // Without autoplay the list shows whenever no game is on.
  useEffect(() => {
    if (!settings.lobbyEnabled) {
      if (lobbyRef.current && !manualLobby.current) setLobby(null);
      return;
    }
    if (options.phase === 'idle' && !lobby && !session) showLobby(false);
  }, [lobby, options.phase, session, setLobby, settings.lobbyEnabled, showLobby]);

  // Voting countdown.
  const lobbyEndsAt = lobby?.endsAt ?? null;
  useEffect(() => {
    if (lobbyEndsAt == null) return undefined;
    const timer = setTimeout(resolveLobby, Math.max(0, lobbyEndsAt - Date.now()));
    return () => clearTimeout(timer);
  }, [lobbyEndsAt, resolveLobby]);

  /**
   * Leaves the current game: gift, !doigame and "Đổi game ngay" all end here.
   * `immediate` skips showing the round result first.
   */
  const requestSwitch = useCallback((notice: string | null, immediate = false) => {
    const { getGame: currentGame, finish, onNotify, onAction } = optionsRef.current;
    const lobbyOn = settingsRef.current.lobbyEnabled;
    const running = currentGame().phase === 'running';
    const now = Date.now();

    if (sessionRef.current && !immediate) {
      // Show the result; the loop moves on after the round gap.
      if (running) finish();
      // Mark the game as done in both modes (time is up, all rounds played).
      patchSession({ slotEndsAt: now, roundsPlayed: Number.MAX_SAFE_INTEGER, idleSince: running ? now : sessionRef.current.idleSince ?? now });
      if (notice) onNotify(notice);
      return;
    }
    if (lobbyOn) {
      if (running) finish();
      // Without autoplay the list opens by itself once the result has been shown.
      if ((immediate || !running) && !lobbyRef.current) showLobby(sessionRef.current != null);
      if (notice) onNotify(notice);
      return;
    }
    const id = switchNow();
    if (id) {
      if (notice) onNotify(`${notice} → ${titleOf(id)}`);
    } else {
      onAction(t('Không game nào trong danh sách bắt đầu được'));
    }
  }, [patchSession, showLobby, switchNow]);

  // ---- Autoplay loop -----------------------------------------------------

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
    optionsRef.current.onAction(liveMinutes
      ? t('Tự động: mỗi game {switchMinutes} phút, LIVE {liveMinutes} phút', { switchMinutes, liveMinutes })
      : t('Tự động: mỗi game {switchMinutes} phút', { switchMinutes }));
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
      const openList = lobbyRef.current;

      // Follow the host: a manually started game becomes the current one.
      if (running && game.kind && game.kind !== current.gameId) {
        patchSession({ gameId: game.kind, idleSince: null, roundsPlayed: 0 });
        return;
      }
      if (running && current.idleSince != null) patchSession({ idleSince: null });
      if (!running && current.idleSince == null && current.gameId != null) {
        // A round of the current game just ended.
        patchSession({ idleSince: now, roundsPlayed: current.roundsPlayed + 1 });
        return;
      }

      const step = autoPlayStep(current, settingsRef.current, running, now);
      if (step === 'end') {
        if (running) finish();
        setLobby(null);
        onNotify(t('⏰ Hết giờ LIVE — cảm ơn mọi người đã chơi!'));
        stop(t('Hết giờ LIVE: đã tắt tự động chuyển game'));
        return;
      }
      if (step === 'warn') {
        patchSession({ warned: true });
        onNotify(t('⏰ Còn 5 phút nữa là hết LIVE!'));
        return;
      }
      if (openList && !running) {
        // Viewers are choosing; autoplay just makes sure the vote ends.
        if (openList.endsAt == null) {
          setLobby({ ...openList, endsAt: now + settingsRef.current.lobbySeconds * 1000, timerStartedAt: now });
        }
        return;
      }
      if (step === 'finish') {
        // Slot is over: show this round's result, the next game starts after the gap.
        finish();
        patchSession({ idleSince: now });
      } else if (step === 'switch') {
        if (settingsRef.current.lobbyEnabled) {
          showLobby(true);
          return;
        }
        const first = current.gameId == null;
        const id = switchNow(first);
        if (id) {
          if (!first) onNotify(t('🔄 Đổi game: {title}', { title: titleOf(id) }));
        } else {
          stop(t('Không game nào trong danh sách bắt đầu được: đã tắt tự động'));
        }
      } else if (step === 'restart' && current.gameId) {
        if (!optionsRef.current.start(current.gameId) && !switchNow()) {
          stop(t('Không game nào trong danh sách bắt đầu được: đã tắt tự động'));
        }
      }
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [active, patchSession, setLobby, showLobby, stop, switchNow]);

  // Optionally start with the LIVE.
  const wasConnected = useRef(options.liveConnected);
  useEffect(() => {
    if (options.liveConnected && !wasConnected.current && settingsRef.current.startOnConnect) begin();
    wasConnected.current = options.liveConnected;
  }, [begin, options.liveConnected]);

  // ---- Viewer input ------------------------------------------------------

  /** `!doigame` vote; returns true when the comment was the command. */
  const handleSwitchCommand = useCallback((user: string, nickname: string, simulated: boolean): boolean => {
    const { getGame: currentGame, acceptCommand, isHost, onNotify } = optionsRef.current;
    const game = currentGame();
    if (game.phase !== 'running') return true;
    if (isHost(user, simulated)) {
      requestSwitch(t('🔄 {nickname} đổi game!', { nickname }));
      return true;
    }
    const needed = settingsRef.current.switchCommandVotes;
    if (needed <= 0 || !acceptCommand(user)) return true;

    const votes = switchVotes.current;
    if (votes.round !== game.startedAt) {
      votes.round = game.startedAt;
      votes.users = new Set();
    }
    votes.users.add(user);
    if (votes.users.size >= needed) {
      votes.users = new Set();
      requestSwitch(t('🔄 {needed} người muốn đổi game!', { needed }));
    } else {
      onNotify(t('🔄 {nickname} muốn đổi game ({count}/{needed}) · gõ !doigame', { nickname, count: votes.users.size, needed }));
    }
    return true;
  }, [requestSwitch]);

  /**
   * Lobby votes, `!doigame` and gift → switch game. Returns `consumed` so the
   * comment skips the music rules (e.g. "2" is a game vote, not track #2).
   */
  const handleEvent = useCallback((event: LiveEvent): { consumed: boolean } => {
    const current = settingsRef.current;
    const openList = lobbyRef.current;
    const choosing = openList != null && optionsRef.current.getGame().phase !== 'running';
    const now = Date.now();
    const who = event.nickname || event.user;

    if (event.type === 'chat' && 'comment' in event) {
      const text = String(event.comment || '');
      if (isSwitchCommand(text)) return { consumed: handleSwitchCommand(event.user, who, event.simulated === true) };
      if (!choosing || !openList) return { consumed: false };
      const index = parseLobbyVote(text, openList.options.length);
      if (index == null) return { consumed: false };
      if (optionsRef.current.acceptCommand(event.user)) {
        setLobby(voteLobby(openList, event.user, index, 1, now, current.lobbySeconds));
      }
      return { consumed: true };
    }

    if (event.type !== 'gift' || !('giftName' in event)) return { consumed: false };
    if (choosing && openList) {
      if (current.lobbyGiftVotes > 0) {
        setLobby(giftLobby(openList, event.user, Number(event.count) || 1, current.lobbyGiftVotes, now, current.lobbySeconds));
      }
      return { consumed: false };
    }
    if (!giftMatches(current, String(event.giftName || ''))) return { consumed: false };
    const result = addGifts(giftRef.current, current, Number(event.count) || 1, now);
    setGift(result.state);
    if (result.switch) requestSwitch(t('🎁 {nickname} tặng {gift}: đổi game!', { nickname: who, gift: current.giftName }));
    return { consumed: false };
  }, [handleSwitchCommand, requestSwitch, setGift, setLobby]);

  const groupName = activeGroup(settings)?.name ?? '';
  // The overlay texts are translated: rebuild them when the language changes.
  const language = useLanguage();
  const lobbyView = useMemo(
    () => (lobby ? lobbyOverlay(lobby, settings.lobbyGiftVotes, groupName) : null),
    [groupName, language, lobby, settings.lobbyGiftVotes]
  );

  return {
    settings,
    setSettings,
    session,
    gift,
    lobby,
    lobbyView,
    begin,
    extend,
    stop: () => stop(),
    skip: () => requestSwitch(null, true),
    resolveLobby,
    openMenu,
    pickLobby,
    handleEvent
  };
}
