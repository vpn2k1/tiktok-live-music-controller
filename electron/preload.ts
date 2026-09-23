import { contextBridge, ipcRenderer, webFrame, type IpcRendererEvent } from 'electron';
import type { OverlayConfig } from '../src/shared/overlay';
import type {
  AudioTrack,
  DesktopApi,
  LiveEvent,
  OverlayInfo,
  OverlayState,
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
  connectTikTok: (username: string) => ipcRenderer.invoke('tiktok:connect', username) as Promise<TikTokConnectResult>,
  disconnectTikTok: () => ipcRenderer.invoke('tiktok:disconnect') as Promise<boolean>,
  simulateTikTokEvent: (event: SimulatedEventInput) => ipcRenderer.invoke('tiktok:simulate', event) as Promise<boolean>,
  onTikTokEvent: (callback: (event: LiveEvent) => void) => on<LiveEvent>('tiktok:event', callback),
  onTikTokStatus: (callback: (status: TikTokStatus) => void) => on<TikTokStatus>('tiktok:status', callback),
  getOverlayInfo: () => ipcRenderer.invoke('overlay:info') as Promise<OverlayInfo>,
  onOverlayInfo: (callback: (info: OverlayInfo) => void) => on<OverlayInfo>('overlay:info-changed', callback),
  updateOverlay: (state: OverlayState) => ipcRenderer.send('overlay:update', state),
  openOverlayWindow: (config: OverlayConfig) => ipcRenderer.invoke('overlay:open-window', config) as Promise<{ ok: boolean; error?: string }>,
  setUiZoom: (factor: number) => {
    const value = Number(factor);
    if (Number.isFinite(value)) webFrame.setZoomFactor(Math.min(1.6, Math.max(0.8, value)));
  }
};

contextBridge.exposeInMainWorld('desktop', desktopApi);
