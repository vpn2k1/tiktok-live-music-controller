import type { OverlayConfig } from './overlay';

export type TikTokEventType = 'chat' | 'gift' | 'like' | 'follow' | 'join' | string;

export interface BaseLiveEvent {
  id: string;
  type: TikTokEventType;
  user: string;
  nickname: string;
  at: number;
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
  lanes: { label: string; percent: number }[];
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
}

export interface OverlayWheel {
  segments: string[];
  /** Increments per spin; the overlay animates when it changes. */
  spinId: number;
  target: number | null;
  spinning: boolean;
  durationMs: number;
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
  style?: OverlayStyle;
}

export interface OverlayAlert {
  id: number;
  /** `info`: replies to chat commands such as !rank / !help. */
  kind: 'follow' | 'join' | 'info';
  text: string;
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
  };
  effects: OverlayEffect[];
  leaderboard: ScoreEntry[];
  nowPlaying: string | null;
  alert: OverlayAlert | null;
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
  connectTikTok: (username: string) => Promise<TikTokConnectResult>;
  disconnectTikTok: () => Promise<boolean>;
  simulateTikTokEvent: (event: SimulatedEventInput) => Promise<boolean>;
  onTikTokEvent: (callback: (event: LiveEvent) => void) => () => void;
  onTikTokStatus: (callback: (status: TikTokStatus) => void) => () => void;
  getOverlayInfo: () => Promise<OverlayInfo>;
  /** Fires when the overlay server comes up later (e.g. the port was busy at start). */
  onOverlayInfo: (callback: (info: OverlayInfo) => void) => () => void;
  updateOverlay: (state: OverlayState) => void;
  /** Opens (or refreshes) a separate window showing the overlay, for OBS Window Capture. */
  openOverlayWindow: (config: OverlayConfig) => Promise<{ ok: boolean; error?: string }>;
  /** Zooms the controller UI (0.8–1.6); layout reflows like browser zoom. */
  setUiZoom: (factor: number) => void;
}
