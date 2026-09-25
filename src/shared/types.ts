import type { AiGenerateRequest, AiProvider, AiResult, AiStatus } from './ai';
import type { Language } from './i18n';
import type { LiveEventBatch } from './eventBatch';
import type { OverlayConfig, OverlayWindowAction } from './overlay';

export type TikTokEventType = 'chat' | 'gift' | 'like' | 'follow' | 'join' | string;

export interface BaseLiveEvent {
  id: string;
  type: TikTokEventType;
  user: string;
  nickname: string;
  at: number;
  /** Profile picture URL (HTTPS, TikTok CDN only; checked in main). */
  avatar?: string;
  /** Set by main for events created by the app's test tools (never for real TikTok events). */
  simulated?: boolean;
}

export interface ChatLiveEvent extends BaseLiveEvent {
  type: 'chat';
  comment: string;
}

export interface GiftLiveEvent extends BaseLiveEvent {
  type: 'gift';
  giftId: string | number | null;
  giftName: string;
  count: number;
}

export interface LikeLiveEvent extends BaseLiveEvent {
  type: 'like';
  count: number;
  total: number;
}

export interface FollowLiveEvent extends BaseLiveEvent {
  type: 'follow';
}

export interface JoinLiveEvent extends BaseLiveEvent {
  type: 'join';
}

export type LiveEvent = ChatLiveEvent | GiftLiveEvent | LikeLiveEvent | FollowLiveEvent | JoinLiveEvent | BaseLiveEvent;

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface TikTokStatus {
  status: ConnectionState;
  username?: string;
  roomId?: string | number | null;
  message?: string;
  at?: number;
}

export interface AudioTrack {
  id: string;
  name: string;
  url: string;
  source?: 'react-file-input' | 'electron-native';
  size?: number;
  mime?: string;
}

export interface MusicRules {
  autoNextEnabled: boolean;
  autoNextSeconds: number;
  commentNextEnabled: boolean;
  commentNextCommand: string;
  commentNumberEnabled: boolean;
  commentSearchEnabled: boolean;
  commentSearchCommand: string;
  likeNextEnabled: boolean;
  likeThreshold: number;
  giftNextEnabled: boolean;
  giftName: string;
  giftThreshold: number;
  commentCooldownSeconds: number;
}

export type GamePhase = 'idle' | 'running' | 'ended';

export interface ScoreEntry {
  user: string;
  nickname: string;
  points: number;
}

/** One list line on the overlay: vote option, quiz answer, attacker, chain word… */
export interface OverlayRow {
  label: string;
  /** Viewer name to draw a colored initial badge for (people rows). */
  avatar?: string;
  value?: string;
  /** 0–100; draws a bar under the label when set. */
  percent?: number;
  badge?: string;
  highlight?: boolean;
}

/** One game in the overlay's game list. */
export interface OverlayMenuItem {
  /** What viewers type to vote (1-based, = position in the list). */
  number: number;
  icon: string;
  name: string;
  /** Game category (fun / versus / english / japanese / chinese): tile color. */
  category: string;
  votes: number;
  /** Share of all votes, 0–100. */
  percent: number;
  /** Has the most votes (and at least one); after the vote, the picked game. */
  leader: boolean;
  /** The game picked when voting closed. */
  picked?: boolean;
}

export interface OverlayMenu {
  items: OverlayMenuItem[];
  /** Voting is closed and the picked game is being announced. */
  decided?: boolean;
}

export interface OverlayProgress {
  label: string;
  value: number;
  max: number;
}

export interface OverlayTeam {
  label: string;
  score: number;
  members: number;
}

export interface OverlayRace {
  icon: string;
  /** `value`: e.g. "3/7" steps. */
  lanes: { label: string; percent: number; value?: string }[];
  /** Shown while nobody has moved yet (default: "tap likes to start"). */
  emptyHint?: string;
}

/**
 * Question-race picture that grows with each correct answer: a balloon that
 * inflates, a plant that grows, a rocket flying to the moon, a tower of bricks.
 */
export interface OverlayGrow {
  kind: 'balloon' | 'plant' | 'rocket' | 'tower';
  /** Steps to win. */
  goal: number;
  /** Front runners, leader first: `label` = viewer name (for the avatar), `steps` 0..goal. */
  items: { label: string; steps: number; value?: string }[];
  /** Shown while nobody has moved yet. */
  emptyHint?: string;
}

/** Visual treatment hints a game can ask the overlay for. */
export interface OverlayStyle {
  /** `tiles`: one letter per tile (word games); `boss`: big animated character. */
  headline?: 'text' | 'tiles' | 'boss';
  /** `quiz`: Kahoot-style colored answer tiles. */
  rows?: 'list' | 'quiz';
}

/** Short "how to join" chip shown under the game (icon + text). */
export interface OverlayHowTo {
  icon: string;
  text: string;
}

/** One-shot visual/sound effect; the overlay plays each id once. */
export interface OverlayEffect {
  id: number;
  kind: 'start' | 'hit' | 'score' | 'correct' | 'wrong' | 'win' | 'lose';
  text?: string;
  /** Viewer the effect is about (for avatar badges). */
  user?: string;
  /**
   * `win` only: the big "congratulations" screen. One entry = the winner in
   * the spotlight (e.g. first across the finish line); 2–3 = a podium of the
   * round's top 3 (names + avatars + score).
   */
  podium?: { name: string; value?: string }[];
}

export interface OverlayWheel {
  segments: string[];
  /** Increments per spin; the overlay animates when it changes. */
  spinId: number;
  target: number | null;
  spinning: boolean;
  durationMs: number;
}

/** Olympia-style crossword grid: rows aligned on the keyword column. */
export interface OverlayCrossword {
  rows: {
    /** One cell per answer letter; '' = still hidden. */
    cells: string[];
    /** Empty columns before the row, so keyword letters line up. */
    offset: number;
    /** Index in `cells` of this row's keyword letter. */
    keyIndex: number;
    state: 'hidden' | 'active' | 'solved' | 'missed';
  }[];
  columns: number;
  keyColumn: number;
  /** Keyword letters revealed so far ('' = hidden). */
  keyword: string[];
  keywordSolved: boolean;
}

/** Grid of flip cards (memory match, bomb wires…). */
export interface OverlayCards {
  cards: {
    /** Shown when the card is face up. */
    face: string;
    /** Shown on the back (usually the number viewers type). */
    label: string;
    /** closed = face down; peek = briefly face up; good / bad = done (matched, safe, boom…). */
    state: 'closed' | 'peek' | 'good' | 'bad';
  }[];
  columns: number;
}

/** Display-only description of the running game; each game builds its own. */
export interface OverlayGameView {
  headline: string | null;
  hint: string | null;
  rows: OverlayRow[];
  progress: OverlayProgress | null;
  teams: [OverlayTeam, OverlayTeam] | null;
  race: OverlayRace | null;
  wheel: OverlayWheel | null;
  crossword?: OverlayCrossword | null;
  cards?: OverlayCards | null;
  grow?: OverlayGrow | null;
  style?: OverlayStyle;
}

export interface OverlayAlert {
  id: number;
  /** `info`: replies to chat commands such as !rank / !help; `like`: a heart (avatar + ❤️ only). */
  kind: 'follow' | 'join' | 'like' | 'info';
  text: string;
  /** Viewer shown with an avatar and in bold ("@usera đã tham gia"). */
  name?: string;
}

/** Snapshot pushed to the OBS overlay. Only public, display-ready data. */
export interface OverlayState {
  game: OverlayGameView & {
    title: string;
    phase: GamePhase;
    endsAt: number | null;
    /** When the current deadline was set (for the countdown ring). */
    timerStartedAt: number | null;
    message: string;
    /** Accent color of the running game. */
    accent: string;
    howTo: OverlayHowTo[];
    /** The game list (lobby), drawn as game tiles; `rows` carry the same games for compact views. */
    menu?: OverlayMenu;
  };
  effects: OverlayEffect[];
  leaderboard: ScoreEntry[];
  nowPlaying: string | null;
  /** Recent follow / join / reply bubbles (oldest first); each floats up and fades on the overlay. */
  alerts: OverlayAlert[];
  /** Profile pictures of the viewers shown (key = the name the overlay draws: nickname or username). */
  avatars?: Record<string, string>;
  /** App language, for the overlay's own labels (game texts arrive translated). */
  lang: Language;
  updatedAt: number;
}

export interface OverlayInfo {
  url: string | null;
  error?: string;
}

export interface SimulatedEventInput {
  type: 'chat' | 'gift' | 'like' | 'follow' | 'join';
  user?: string;
  comment?: string;
  giftName?: string;
  count?: number;
  total?: number;
}

export interface TikTokConnectResult {
  connected: boolean;
  roomId?: string | number | null;
  username?: string;
}

export interface DesktopApi {
  selectAudioFiles: () => Promise<AudioTrack[]>;
  /** Saves text (e.g. a sample bank file) where the user picks in a save dialog. */
  saveTextFile: (name: string, content: string) => Promise<{ ok: boolean; error?: string }>;
  connectTikTok: (username: string) => Promise<TikTokConnectResult>;
  disconnectTikTok: () => Promise<boolean>;
  simulateTikTokEvent: (event: SimulatedEventInput) => Promise<boolean>;
  /** LIVE events in batches (every ~100 ms), see src/shared/eventBatch.ts. */
  onTikTokEvents: (callback: (batch: LiveEventBatch) => void) => () => void;
  onTikTokStatus: (callback: (status: TikTokStatus) => void) => () => void;
  getOverlayInfo: () => Promise<OverlayInfo>;
  /** Fires when the overlay server comes up later (e.g. the port was busy at start). */
  onOverlayInfo: (callback: (info: OverlayInfo) => void) => () => void;
  updateOverlay: (state: OverlayState) => void;
  /** Opens (or refreshes) a separate window showing the overlay, for OBS Window Capture. */
  openOverlayWindow: (config: OverlayConfig) => Promise<{ ok: boolean; error?: string }>;
  closeOverlayWindow: () => Promise<boolean>;
  /** Fires when the game window opens or is closed (by the app or from the window itself). */
  onOverlayWindowChange: (callback: (open: boolean) => void) => () => void;
  /** Clicks in the game window: back to the game list, or pick game number `index` (1-based). */
  onOverlayWindowAction: (callback: (action: OverlayWindowAction) => void) => () => void;
  /** Zooms the controller UI (0.8–1.6); layout reflows like browser zoom. */
  setUiZoom: (factor: number) => void;
  /** AI generation (keys stay in main; see src/shared/ai.ts). */
  aiStatus: () => Promise<AiStatus | null>;
  /** Saves a provider's API key; null removes it. */
  aiSetKey: (provider: AiProvider, key: string | null) => Promise<AiResult<{ status: AiStatus }>>;
  /** Active provider, or a provider's model id ("" = default). */
  aiSetSettings: (settings: { active?: AiProvider; provider?: AiProvider; model?: string }) => Promise<AiResult<{ status: AiStatus }>>;
  aiTest: (provider: AiProvider) => Promise<AiResult>;
  /** Bank lines from the active provider (untrusted: validate before use). */
  aiGenerate: (request: AiGenerateRequest) => Promise<AiResult<{ lines: string[]; provider: AiProvider; model: string }>>;
}
