export type TikTokEventType = 'chat' | 'gift' | 'like' | 'follow' | string;

export interface BaseLiveEvent {
  id: string;
  type: TikTokEventType;
  user: string;
  nickname: string;
  at: number;
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

export type LiveEvent = ChatLiveEvent | GiftLiveEvent | LikeLiveEvent | FollowLiveEvent | BaseLiveEvent;

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
}

export interface SimulatedEventInput {
  type: 'chat' | 'gift' | 'like' | 'follow';
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
}
