/**
 * Electron IPC Handlers for System Audio Sources, File Dialogs, and Storage.
 */

import { ipcMain, desktopCapturer, dialog, BrowserWindow } from 'electron';
import { promises as fs } from 'fs';
import {
  IPC_CHANNELS,
  DesktopSourcesResponse,
  OpenFileResult,
  SaveFileResult,
  UserPresetsResponse,
  OpenFileDialogOptionsSchema,
  SaveFileDialogOptionsSchema,
  SaveUserPresetsRequestSchema,
  UpdateNativeBandsRequestSchema,
  SetNativeBypassRequestSchema,
  SetNativeVolumeRequestSchema,
  SetOutputDeviceRequestSchema,
} from './ipc-schemas.js';
import { PresetStorage } from './preset-storage.js';
import { NativeAudioManager } from './native-audio-manager.js';

export function registerIpcHandlers(
  getWindow: () => BrowserWindow | null,
  presetStorage: PresetStorage,
  nativeAudioManager: NativeAudioManager
): void {
  // Desktop Audio Capture Sources
  ipcMain.handle(
    IPC_CHANNELS.GET_DESKTOP_SOURCES,
    async (): Promise<DesktopSourcesResponse> => {
      try {
        const sources = await desktopCapturer.getSources({
          types: ['screen', 'window'],
          thumbnailSize: { width: 160, height: 90 },
        });

        const items = sources.map((s) => ({
          id: s.id,
          name: s.name,
          thumbnailDataUrl: s.thumbnail.toDataURL(),
        }));

        return { success: true, sources: items };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to query desktop sources';
        return { success: false, sources: [], error: msg };
      }
    }
  );

  // Open Equalizer APO PEQ File Dialog
  ipcMain.handle(
    IPC_CHANNELS.OPEN_FILE_DIALOG,
    async (_event, rawOptions: unknown): Promise<OpenFileResult> => {
      try {
        const win = getWindow();
        const validWin = win && !win.isDestroyed() ? win : undefined;
        const options = OpenFileDialogOptionsSchema.parse(rawOptions ?? {});
        const dialogConfig = {
          title: options.title ?? 'Import Equalizer APO / PEQ File',
          filters: [{ name: 'Parametric EQ Files', extensions: options.extensions }],
          properties: ['openFile' as const],
        };
        const res = validWin
          ? await dialog.showOpenDialog(validWin, dialogConfig)
          : await dialog.showOpenDialog(dialogConfig);

        if (res.canceled || !res.filePaths[0]) {
          return { canceled: true };
        }

        const filePath = res.filePaths[0];
        const content = await fs.readFile(filePath, 'utf-8');
        return { canceled: false, content, filePath };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to open file';
        return { canceled: true, error: msg };
      }
    }
  );

  // Save Equalizer APO PEQ File Dialog
  ipcMain.handle(
    IPC_CHANNELS.SAVE_FILE_DIALOG,
    async (_event, rawOptions: unknown): Promise<SaveFileResult> => {
      try {
        const win = getWindow();
        const validWin = win && !win.isDestroyed() ? win : undefined;
        const options = SaveFileDialogOptionsSchema.parse(rawOptions);
        const dialogConfig = {
          title: options.title ?? 'Export Equalizer APO Config',
          defaultPath: options.defaultPath ?? 'EqualizerAPO_Config.txt',
          filters: [{ name: 'Text / Equalizer APO File', extensions: ['txt', 'peq'] }],
        };
        const res = validWin
          ? await dialog.showSaveDialog(validWin, dialogConfig)
          : await dialog.showSaveDialog(dialogConfig);

        if (res.canceled || !res.filePath) {
          return { canceled: true };
        }

        await fs.writeFile(res.filePath, options.content, 'utf-8');
        return { canceled: false, filePath: res.filePath };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to save file';
        return { canceled: true, error: msg };
      }
    }
  );

  // Preset Storage Handlers
  ipcMain.handle(
    IPC_CHANNELS.LOAD_USER_PRESETS,
    async (): Promise<UserPresetsResponse> => {
      return presetStorage.loadPresets();
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.SAVE_USER_PRESETS,
    async (_event, rawRequest: unknown) => {
      const parsed = SaveUserPresetsRequestSchema.parse(rawRequest);
      return presetStorage.savePresets(parsed.presets, parsed.activePreset);
    }
  );

  // Native Output Audio Equalizer Handlers
  ipcMain.handle(
    IPC_CHANNELS.UPDATE_NATIVE_BANDS,
    async (_event, rawRequest: unknown) => {
      try {
        const parsed = UpdateNativeBandsRequestSchema.parse(rawRequest);
        const success = nativeAudioManager.updateBands(
          parsed.bands,
          parsed.preamp,
          parsed.soloBandId
        );
        return { success };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Invalid bands request';
        return { success: false, error: msg };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.SET_NATIVE_BYPASS,
    async (_event, rawRequest: unknown) => {
      try {
        const parsed = SetNativeBypassRequestSchema.parse(rawRequest);
        const success = nativeAudioManager.setBypass(parsed.bypass);
        return { success };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Invalid bypass request';
        return { success: false, error: msg };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.SET_NATIVE_VOLUME,
    async (_event, rawRequest: unknown) => {
      try {
        const parsed = SetNativeVolumeRequestSchema.parse(rawRequest);
        const success = nativeAudioManager.setVolume(parsed.volume);
        return { success };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Invalid volume request';
        return { success: false, error: msg };
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.GET_OUTPUT_DEVICES, async () => {
    const devices = nativeAudioManager.getOutputDevices();
    const activeDeviceId =
      typeof nativeAudioManager.getActiveDeviceId === 'function'
        ? nativeAudioManager.getActiveDeviceId()
        : undefined;
    const volume =
      typeof nativeAudioManager.getVolume === 'function'
        ? nativeAudioManager.getVolume()
        : undefined;
    return { success: true, devices, activeDeviceId, volume };
  });

  ipcMain.handle(
    IPC_CHANNELS.SET_OUTPUT_DEVICE,
    async (_event, rawRequest: unknown) => {
      try {
        const parsed = SetOutputDeviceRequestSchema.parse(rawRequest);
        const success = nativeAudioManager.setOutputDevice(parsed.deviceId);
        return { success };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Invalid output device request';
        return { success: false, error: msg };
      }
    }
  );
}
