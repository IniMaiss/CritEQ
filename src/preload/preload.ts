/**
 * Secure Electron Preload Script.
 * Self-contained with zero relative runtime imports so it executes reliably in any Electron preload context.
 */

import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronAPI, AudioTelemetry } from './preload-types.js';
import type { ExpertEqualizerPreset } from '../models/preset.js';
import type { ExpertEqualizerPresetBand } from '../models/preset-band.js';

const CHANNELS = {
  GET_DESKTOP_SOURCES: 'desktop-capturer:get-sources',
  OPEN_FILE_DIALOG: 'dialog:open-file',
  SAVE_FILE_DIALOG: 'dialog:save-file',
  LOAD_USER_PRESETS: 'storage:load-presets',
  SAVE_USER_PRESETS: 'storage:save-presets',
  UPDATE_NATIVE_BANDS: 'audio:update-bands',
  SET_NATIVE_BYPASS: 'audio:set-bypass',
  SET_NATIVE_VOLUME: 'audio:set-volume',
  GET_OUTPUT_DEVICES: 'audio:get-output-devices',
  SET_OUTPUT_DEVICE: 'audio:set-output-device',
  OUTPUT_DEVICES_CHANGED: 'audio:output-devices-changed',
  TELEMETRY: 'audio:telemetry',
} as const;

const api: ElectronAPI = {
  getDesktopSources: () => ipcRenderer.invoke(CHANNELS.GET_DESKTOP_SOURCES),
  openFileDialog: (options) => ipcRenderer.invoke(CHANNELS.OPEN_FILE_DIALOG, options),
  saveFileDialog: (options) => ipcRenderer.invoke(CHANNELS.SAVE_FILE_DIALOG, options),
  loadUserPresets: () => ipcRenderer.invoke(CHANNELS.LOAD_USER_PRESETS),
  saveUserPresets: (
    presets: readonly Readonly<ExpertEqualizerPreset>[],
    activePreset?: Readonly<ExpertEqualizerPreset>
  ) => ipcRenderer.invoke(CHANNELS.SAVE_USER_PRESETS, { presets, activePreset }),
  updateNativeBands: (
    bands: readonly ExpertEqualizerPresetBand[],
    preamp?: number,
    soloBandId?: string | null
  ) => ipcRenderer.invoke(CHANNELS.UPDATE_NATIVE_BANDS, { bands, preamp, soloBandId }),
  setNativeBypass: (bypass: boolean) =>
    ipcRenderer.invoke(CHANNELS.SET_NATIVE_BYPASS, { bypass }),
  setNativeVolume: (volume: number) =>
    ipcRenderer.invoke(CHANNELS.SET_NATIVE_VOLUME, { volume }),
  getOutputDevices: () => ipcRenderer.invoke(CHANNELS.GET_OUTPUT_DEVICES),
  setOutputDevice: (deviceId: number) =>
    ipcRenderer.invoke(CHANNELS.SET_OUTPUT_DEVICE, { deviceId }),
  onOutputDevicesChanged: (callback) => {
    const handler = (
      _event: unknown,
      data: {
        devices: readonly { id: number; name: string }[];
        activeDeviceId?: number;
        volume?: number;
      }
    ) => callback(data);
    ipcRenderer.on(CHANNELS.OUTPUT_DEVICES_CHANGED, handler);
    return () => {
      ipcRenderer.removeListener(CHANNELS.OUTPUT_DEVICES_CHANGED, handler);
    };
  },
  onTelemetry: (callback: (telemetry: AudioTelemetry) => void) => {
    const handler = (_event: unknown, data: AudioTelemetry) => callback(data);
    ipcRenderer.on(CHANNELS.TELEMETRY, handler);
    return () => {
      ipcRenderer.removeListener(CHANNELS.TELEMETRY, handler);
    };
  },
};

contextBridge.exposeInMainWorld('electronAPI', Object.freeze(api));
