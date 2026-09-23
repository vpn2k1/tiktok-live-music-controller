import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  AudioTrack,
  DesktopApi,
  LiveEvent,
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
  onTikTokStatus: (callback: (status: TikTokStatus) => void) => on<TikTokStatus>('tiktok:status', callback)
};

contextBridge.exposeInMainWorld('desktop', desktopApi);
