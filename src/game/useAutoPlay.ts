import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '../hooks/useLanguage';
import { t } from '../shared/i18n';
import type { GamePhase, LiveEvent } from '../shared/types';
import {
  activeGroup,
  addGifts,
  applyHostAction,
  createLoop,
  createSession,
  EMPTY_GIFT_SWITCH,
  giftMatches,
  hostStep,
  LIVE_WARNING_MS,
  nextGameOrder,
  normalizeAutoPlay,
  rotation,
  sessionStep,
  type AutoPlaySession,
  type AutoPlaySettings,
  type GiftSwitchState,
  type PlayLoop
} from './autoplay';
import type { GameState } from './engine';
import {
  closeLobby,
  giftLobby,
  isSwitchCommand,
  lobbyOverlay,
  lobbyResultText,
  openLobby,
  parseLobbyVote,
  startLobbyTimer,
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
  /** Rendered cancel count: a cancelled round (Huỷ / !cancel) stops the game. */
  cancels: number;
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
 * Game host. A started game plays round after round, without end (the play
 * loop): each round's result is celebrated, then the next round starts after
 * the round gap. A gift, `!doigame` or the switch rule (rounds / minutes)
 * marks a switch; it happens when the current round ends, never mid-round.
 * Then the game list opens for viewers to vote (no votes or a tie = random
 * pick), or the next game of the group starts. The host can switch at once
 * from the app. The auto session adds the LIVE length and starts the first
 * game by itself.
 */
export function useAutoPlay(options: AutoPlayOptions) {
  const [settings, setSettingsState] = useState<AutoPlaySettings>(loadSettings);
  const [session, setSessionState] = useState<AutoPlaySession | null>(null);
  const [loop, setLoopState] = useState<PlayLoop | null>(null);
  const [gift, setGiftState] = useState<GiftSwitchState>(EMPTY_GIFT_SWITCH);
  const [lobby, setLobbyState] = useState<LobbyState | null>(null);
  /** The LIVE ended: don't open the list again until the host plays something. */
  const [halted, setHalted] = useState(false);

  const optionsRef = useRef(options);
  const settingsRef = useRef(settings);
  const sessionRef = useRef(session);
  const loopRef = useRef(loop);
  const giftRef = useRef(gift);
  const lobbyRef = useRef(lobby);
  /** The list was opened by the host (☰ in the game window): it stays even with voting turned off. */
  const manualLobby = useRef(false);
  /** Viewers who typed !doigame for the game chosen at `since`. */
  const switchVotes = useRef<{ since: number | null; users: Set<string> }>({ since: null, users: new Set() });

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

  const setLoop = useCallback((next: PlayLoop | null) => {
    loopRef.current = next;
    setLoopState(next);
  }, []);

  const patchLoop = useCallback((patch: Partial<PlayLoop>) => {
    if (loopRef.current) setLoop({ ...loopRef.current, ...patch });
  }, [setLoop]);

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

  /** Starts the first game from `candidates` that can start; the play loop follows it. */
  const startFirst = useCallback((candidates: string[]): string | null => {
    for (const id of candidates) {
      if (!optionsRef.current.start(id)) continue;
      setLoop(createLoop(id, Date.now()));
      return id;
    }
    return null;
  }, [setLoop]);

  const stop = useCallback((message = t('Đã tắt tự động')) => {
    if (!sessionRef.current) return;
    setSession(null);
    optionsRef.current.onAction(message);
  }, [setSession]);

  // ---- Lobby -------------------------------------------------------------

  /** Shows the active group's games. `timed`: the countdown starts now instead of at the first vote. */
  const showLobby = useCallback((timed: boolean) => {
    const current = settingsRef.current;
    setLobby(openLobby(rotation(current, GAME_IDS), Date.now(), timed ? current.lobbySeconds : null));
  }, [setLobby]);

  /**
   * Voting time is up (or "Chốt ngay"): first the pick is announced — most
   * votes, or a random game when nobody voted or votes are tied — and on the
   * next call (after `LOBBY_RESULT_MS`) that game starts.
   */
  const resolveLobby = useCallback(() => {
    const current = lobbyRef.current;
    if (!current) return;
    const { onNotify, onAction } = optionsRef.current;
    if (!current.result) {
      const closed = closeLobby(current, Math.random, Date.now());
      setLobby(closed);
      if (closed.result) onNotify(lobbyResultText(closed.result, titleOf(closed.result.ranking[0] ?? null)));
      return;
    }
    setLobby(null);
    if (!startFirst(current.result.ranking)) onAction(t('Không game nào trong danh sách bắt đầu được'));
  }, [setLobby, startFirst]);

  /** Leaves the current game now: the game list (voting on) or the next game of the group. */
  const goNext = useCallback((currentId: string | null) => {
    const { onNotify, onAction } = optionsRef.current;
    setLoop(null);
    if (settingsRef.current.lobbyEnabled) {
      // Timed: when nobody votes, a random game starts.
      if (!lobbyRef.current) showLobby(true);
      return;
    }
    const current = settingsRef.current;
    const id = startFirst(nextGameOrder(rotation(current, GAME_IDS), currentId, current.order, Math.random));
    if (id) onNotify(t('🔄 Đổi game: {title}', { title: titleOf(id) }));
    else onAction(t('Không game nào trong danh sách bắt đầu được'));
  }, [setLoop, showLobby, startFirst]);

  /**
   * Back to the game list (☰ in the game window): ends the running round
   * (its points count) and shows the list, even with voting off.
   */
  const openMenu = useCallback(() => {
    const { getGame: currentGame, finish, onAction } = optionsRef.current;
    const running = currentGame().phase === 'running';
    if (!running && lobbyRef.current) return;
    if (running) finish({ quiet: true });
    setLoop(null);
    showLobby(false);
    manualLobby.current = true;
    onAction(t('Đã mở danh sách game: bấm một game trong cửa sổ game để chơi'));
  }, [setLoop, showLobby]);

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
    if (options.phase === 'running') {
      setHalted(false);
      if (lobbyRef.current) setLobby(null);
    }
  }, [options.phase, setLobby]);

  // Huỷ / !cancel: the round is dropped and the game stops (no next round).
  const seenCancels = useRef(options.cancels);
  useEffect(() => {
    if (options.cancels === seenCancels.current) return;
    seenCancels.current = options.cancels;
    setLoop(null);
  }, [options.cancels, setLoop]);

  // Switching group (or editing it) refreshes an open list; numbers change, so votes restart.
  const groupKey = rotation(settings, GAME_IDS).join(',');
  useEffect(() => {
    const current = lobbyRef.current;
    if (current && !current.result && current.options.join(',') !== groupKey) showLobby(current.endsAt != null);
  }, [groupKey, showLobby]);

  // With nothing being played, the list shows (its countdown starts with the first vote).
  useEffect(() => {
    if (!settings.lobbyEnabled) {
      if (lobbyRef.current && !manualLobby.current) setLobby(null);
      return;
    }
    if (options.phase === 'idle' && !lobby && !loop && !halted) showLobby(false);
  }, [halted, lobby, loop, options.phase, setLobby, settings.lobbyEnabled, showLobby]);

  // Voting countdown, then the "picked game" announcement.
  const lobbyEndsAt = lobby?.endsAt ?? null;
  useEffect(() => {
    if (lobbyEndsAt == null) return undefined;
    const timer = setTimeout(resolveLobby, Math.max(0, lobbyEndsAt - Date.now()));
    return () => clearTimeout(timer);
  }, [lobbyEndsAt, resolveLobby]);

  // ---- Switching ---------------------------------------------------------

  /**
   * A switch asked by viewers (gift, !doigame) or the host's "switch after
   * this round": the round plays to its end, its result is celebrated, then
   * the list opens. A round without a timer (e.g. the wheel) ends now.
   */
  const requestSwitch = useCallback((notice: string | null) => {
    const { getGame: currentGame, finish, onNotify } = optionsRef.current;
    const game = currentGame();
    const running = game.phase === 'running';
    if (!loopRef.current && running && game.kind) setLoop(createLoop(game.kind, Date.now()));
    const current = loopRef.current;
    if (!current || current.switchPending) return;
    patchLoop({ switchPending: true });
    if (running && game.endsAt == null) finish();
    if (notice) onNotify(running && game.endsAt != null ? `${notice} ${t('Hết ván này sẽ đổi game.')}` : notice);
  }, [patchLoop, setLoop]);

  /** "⏭ Đổi game ngay" (host): ends the round now (its points count) and moves on. */
  const skipNow = useCallback(() => {
    const { getGame: currentGame, finish } = optionsRef.current;
    const game = currentGame();
    const currentId = loopRef.current?.gameId ?? (game.phase === 'running' ? game.kind : null);
    if (game.phase === 'running') finish({ quiet: true });
    goNext(currentId);
  }, [goNext]);

  /** The host switches to another game from the app: the running round ends now (points count). */
  const switchTo = useCallback((id: string) => {
    const { getGame: currentGame, finish, onNotify, onAction } = optionsRef.current;
    if (currentGame().phase === 'running') finish({ quiet: true });
    setLobby(null);
    if (startFirst([id])) onNotify(t('🎮 Chơi {title}!', { title: titleOf(id) }));
    else onAction(t('Không bắt đầu được {title}', { title: titleOf(id) }));
  }, [setLobby, startFirst]);

  // ---- Play loop + auto session -----------------------------------------

  const begin = useCallback(() => {
    if (sessionRef.current) return;
    setSession(createSession(settingsRef.current, Date.now()));
    setGift(EMPTY_GIFT_SWITCH);
    setHalted(false);
    const { liveMinutes } = settingsRef.current;
    optionsRef.current.onAction(liveMinutes ? t('Tự động: LIVE {liveMinutes} phút', { liveMinutes }) : t('Tự động: bật'));
  }, [setGift, setSession]);

  // Main loop: next round of the same game, switching, and the LIVE timer.
  const active = session != null || loop != null;
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => {
      const { getGame: currentGame, finish, onNotify, start, selectedId } = optionsRef.current;
      const game = currentGame();
      const now = Date.now();
      const running = game.phase === 'running';
      const auto = sessionRef.current;

      if (auto) {
        const step = sessionStep(auto, now);
        if (step === 'end') {
          if (running) finish();
          setLoop(null);
          setLobby(null);
          setHalted(true);
          onNotify(t('⏰ Hết giờ LIVE — cảm ơn mọi người đã chơi!'));
          stop(t('Hết giờ LIVE: đã tắt tự động'));
          return;
        }
        if (step === 'warn') {
          setSession({ ...auto, warned: true });
          onNotify(t('⏰ Còn 5 phút nữa là hết LIVE!'));
        }
      }

      const current = loopRef.current;
      const list = lobbyRef.current;
      const action = hostStep(current, settingsRef.current, {
        running,
        kind: game.kind,
        auto: auto != null,
        list: list ? { timed: list.endsAt != null } : null
      }, now);
      switch (action.type) {
        case 'adopt':
        case 'roundStarted':
        case 'roundEnded':
          setLoop(applyHostAction(current, action, now));
          break;
        case 'timeList':
          if (list) setLobby(startLobbyTimer(list, now, settingsRef.current.lobbySeconds));
          break;
        case 'openList':
          showLobby(true);
          break;
        case 'startFirst': {
          const group = rotation(settingsRef.current, GAME_IDS);
          const first = group.includes(selectedId) ? [selectedId, ...group.filter((id) => id !== selectedId)] : group;
          if (!startFirst(first)) stop(t('Không game nào trong danh sách bắt đầu được: đã tắt tự động'));
          break;
        }
        case 'switch':
          goNext(action.gameId);
          break;
        case 'restart':
          if (start(action.gameId)) setLoop(applyHostAction(loopRef.current, { type: 'roundStarted' }, now));
          else goNext(action.gameId);
          break;
        case 'none':
          break;
      }
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [active, goNext, setLobby, setLoop, setSession, showLobby, startFirst, stop]);

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
    const current = loopRef.current;
    if ((game.phase !== 'running' && !current) || current?.switchPending) return true;
    if (isHost(user, simulated)) {
      requestSwitch(t('🔄 {nickname} đổi game!', { nickname }));
      return true;
    }
    const needed = settingsRef.current.switchCommandVotes;
    if (needed <= 0 || !acceptCommand(user)) return true;

    // Votes count for the game being played (all of its rounds).
    const votes = switchVotes.current;
    const since = current?.since ?? game.startedAt;
    if (votes.since !== since) {
      votes.since = since;
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
      if (!openList.result && optionsRef.current.acceptCommand(event.user)) {
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
    // Nothing to switch, or a switch is already on its way: the gift doesn't count.
    const playing = loopRef.current != null || optionsRef.current.getGame().phase === 'running';
    if (!playing || loopRef.current?.switchPending) return { consumed: false };
    const result = addGifts(giftRef.current, current, Number(event.count) || 1, now, loopRef.current?.since ?? optionsRef.current.getGame().startedAt);
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
    loop,
    /** A switch is waiting for the current round to end. */
    switchPending: loop?.switchPending === true,
    gift,
    lobby,
    lobbyView,
    begin,
    extend,
    stop: () => stop(),
    skip: skipNow,
    /** Host: switch game when the current round ends. */
    switchLater: () => requestSwitch(t('🔄 Streamer đổi game!')),
    switchTo,
    resolveLobby,
    openMenu,
    pickLobby,
    handleEvent
  };
}
