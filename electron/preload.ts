import { contextBridge, ipcRenderer, webFrame, type IpcRendererEvent } from 'electron';
import type { AiGenerateRequest, AiProvider, AiResult, AiStatus } from '../src/shared/ai';
import type { LiveEventBatch } from '../src/shared/eventBatch';
import type { OverlayConfig, OverlayWindowAction } from '../src/shared/overlay';
import type {
  AudioTrack,
  DesktopApi,
  LiveEvent,
  OverlayInfo,
  OverlayState,
  SignKeyStatus,
  SimulatedEventInput,
  TikTokConnectResult,
  TikTokStatus
} from '../src/shared/types';

function on<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const desktopApi: DesktopApi = {
  selectAudioFiles: () => ipcRenderer.invoke('dialog:select-audio') as Promise<AudioTrack[]>,
  saveTextFile: (name: string, content: string) => ipcRenderer.invoke('dialog:save-text', name, content) as Promise<{ ok: boolean; error?: string }>,
  connectTikTok: (username: string) => ipcRenderer.invoke('tiktok:connect', username) as Promise<TikTokConnectResult>,
  signKeyStatus: () => ipcRenderer.invoke('tiktok:sign-key-status') as Promise<SignKeyStatus | null>,
  setSignKey: (key: string | null) => ipcRenderer.invoke('tiktok:set-sign-key', key) as Promise<{ ok: boolean; status: SignKeyStatus; error?: string } | null>,
  disconnectTikTok: () => ipcRenderer.invoke('tiktok:disconnect') as Promise<boolean>,
  simulateTikTokEvent: (event: SimulatedEventInput) => ipcRenderer.invoke('tiktok:simulate', event) as Promise<boolean>,
  onTikTokEvents: (callback: (batch: LiveEventBatch) => void) => on<LiveEventBatch>('tiktok:events', callback),
  onTikTokStatus: (callback: (status: TikTokStatus) => void) => on<TikTokStatus>('tiktok:status', callback),
  getOverlayInfo: () => ipcRenderer.invoke('overlay:info') as Promise<OverlayInfo>,
  onOverlayInfo: (callback: (info: OverlayInfo) => void) => on<OverlayInfo>('overlay:info-changed', callback),
  updateOverlay: (state: OverlayState) => ipcRenderer.send('overlay:update', state),
  openOverlayWindow: (config: OverlayConfig) => ipcRenderer.invoke('overlay:open-window', config) as Promise<{ ok: boolean; error?: string }>,
  closeOverlayWindow: () => ipcRenderer.invoke('overlay:close-window') as Promise<boolean>,
  onOverlayWindowChange: (callback: (open: boolean) => void) => on<boolean>('overlay:window-changed', callback),
  onOverlayWindowAction: (callback: (action: OverlayWindowAction) => void) => on<OverlayWindowAction>('overlay:window-action', callback),
  aiStatus: () => ipcRenderer.invoke('ai:status') as Promise<AiStatus | null>,
  aiSetKey: (provider: AiProvider, key: string | null) => ipcRenderer.invoke('ai:set-key', provider, key) as Promise<AiResult<{ status: AiStatus }>>,
  aiSetSettings: (settings: { active?: AiProvider; provider?: AiProvider; model?: string }) =>
    ipcRenderer.invoke('ai:set-settings', settings) as Promise<AiResult<{ status: AiStatus }>>,
  aiTest: (provider: AiProvider) => ipcRenderer.invoke('ai:test', provider) as Promise<AiResult>,
  aiGenerate: (request: AiGenerateRequest) =>
    ipcRenderer.invoke('ai:generate', request) as Promise<AiResult<{ lines: string[]; provider: AiProvider; model: string }>>,
  setUiZoom: (factor: number) => {
    const value = Number(factor);
    if (Number.isFinite(value)) webFrame.setZoomFactor(Math.min(1.6, Math.max(0.8, value)));
  }
};

contextBridge.exposeInMainWorld('desktop', desktopApi);
