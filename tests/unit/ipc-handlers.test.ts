import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ipcMain, desktopCapturer, dialog } from 'electron';
import { promises as fs } from 'fs';
import { registerIpcHandlers } from '../../src/main/ipc-handlers.js';
import { IPC_CHANNELS } from '../../src/main/ipc-schemas.js';
import { PresetStorage } from '../../src/main/preset-storage.js';
import { NativeAudioManager } from '../../src/main/native-audio-manager.js';

vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn(async () => 'Preamp: -2 dB\nFilter 1: ON PK Fc 1000 Hz Gain 3.0 dB Q 1.0'),
    writeFile: vi.fn(async () => undefined),
  },
}));

vi.mock('electron', () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return {
    ipcMain: {
      handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
        handlers.set(channel, handler);
      }),
      _handlers: handlers,
    },
    desktopCapturer: {
      getSources: vi.fn(async () => [
        {
          id: 'screen:0:0',
          name: 'Main Display',
          thumbnail: { toDataURL: () => 'data:image/png;base64,abc' },
        },
      ]),
    },
    dialog: {
      showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })),
      showSaveDialog: vi.fn(async () => ({ canceled: true, filePath: undefined })),
    },
    BrowserWindow: vi.fn(),
  };
});

describe('IPC Handlers', () => {
  let mockStorage: PresetStorage;
  let mockNativeAudio: NativeAudioManager;
  let handlers: Map<string, (...args: unknown[]) => unknown>;

  beforeEach(() => {
    mockStorage = {
      loadPresets: vi.fn(async () => ({ success: true, presets: [] })),
      savePresets: vi.fn(async () => ({ success: true })),
    } as unknown as PresetStorage;

    mockNativeAudio = {
      updateBands: vi.fn(() => true),
      setBypass: vi.fn(() => true),
      setVolume: vi.fn(() => true),
      setOutputDevice: vi.fn(() => true),
      getOutputDevices: vi.fn(() => [{ id: 81, name: 'MacBook Pro Speakers' }]),
    } as unknown as NativeAudioManager;

    handlers = (ipcMain as unknown as { _handlers: Map<string, (...args: unknown[]) => unknown> })._handlers;
    handlers.clear();

    registerIpcHandlers(() => null, mockStorage, mockNativeAudio);
  });

  it('registers all required IPC channels', () => {
    expect(handlers.has(IPC_CHANNELS.GET_DESKTOP_SOURCES)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.OPEN_FILE_DIALOG)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.SAVE_FILE_DIALOG)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.LOAD_USER_PRESETS)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.SAVE_USER_PRESETS)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.UPDATE_NATIVE_BANDS)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.SET_NATIVE_BYPASS)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.SET_NATIVE_VOLUME)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.GET_OUTPUT_DEVICES)).toBe(true);
  });

  it('handles native audio band updates, bypass, and volume', async () => {
    const updateHandler = handlers.get(IPC_CHANNELS.UPDATE_NATIVE_BANDS)!;
    const updateRes = (await updateHandler({} as never, {
      bands: [
        {
          id: 'b1',
          frequency: 100,
          gain: 3,
          bandwidth: 1.0,
          type: 0,
          bypass: false,
        },
      ],
    })) as { success: boolean };
    expect(updateRes.success).toBe(true);
    expect(mockNativeAudio.updateBands).toHaveBeenCalled();

    const bypassHandler = handlers.get(IPC_CHANNELS.SET_NATIVE_BYPASS)!;
    const bypassRes = (await bypassHandler({} as never, { bypass: true })) as { success: boolean };
    expect(bypassRes.success).toBe(true);
    expect(mockNativeAudio.setBypass).toHaveBeenCalledWith(true);

    const volHandler = handlers.get(IPC_CHANNELS.SET_NATIVE_VOLUME)!;
    const volRes = (await volHandler({} as never, { volume: 0.8 })) as { success: boolean };
    expect(volRes.success).toBe(true);
    expect(mockNativeAudio.setVolume).toHaveBeenCalledWith(0.8);

    const devHandler = handlers.get(IPC_CHANNELS.GET_OUTPUT_DEVICES)!;
    const devRes = (await devHandler({} as never)) as { success: boolean; devices: unknown[] };
    expect(devRes.success).toBe(true);
    expect(devRes.devices).toHaveLength(1);

    const setDevHandler = handlers.get(IPC_CHANNELS.SET_OUTPUT_DEVICE)!;
    const setDevRes = (await setDevHandler({} as never, { deviceId: 81 })) as { success: boolean };
    expect(setDevRes.success).toBe(true);
    expect(mockNativeAudio.setOutputDevice).toHaveBeenCalledWith(81);
  });

  it('handles invalid native audio requests safely', async () => {
    const updateHandler = handlers.get(IPC_CHANNELS.UPDATE_NATIVE_BANDS)!;
    const res1 = (await updateHandler({} as never, { bands: 'invalid' })) as { success: boolean; error?: string };
    expect(res1.success).toBe(false);
    expect(res1.error).toBeDefined();

    const bypassHandler = handlers.get(IPC_CHANNELS.SET_NATIVE_BYPASS)!;
    const res2 = (await bypassHandler({} as never, { bypass: 'not-bool' })) as { success: boolean; error?: string };
    expect(res2.success).toBe(false);

    const volHandler = handlers.get(IPC_CHANNELS.SET_NATIVE_VOLUME)!;
    const res3 = (await volHandler({} as never, { volume: -5 })) as { success: boolean; error?: string };
    expect(res3.success).toBe(false);

    const setDevHandler = handlers.get(IPC_CHANNELS.SET_OUTPUT_DEVICE)!;
    const res4 = (await setDevHandler({} as never, { deviceId: -1 })) as { success: boolean; error?: string };
    expect(res4.success).toBe(false);
  });

  it('handles GET_DESKTOP_SOURCES successfully', async () => {
    const handler = handlers.get(IPC_CHANNELS.GET_DESKTOP_SOURCES)!;
    const res = (await handler({} as never)) as { success: boolean; sources: unknown[] };

    expect(res.success).toBe(true);
    expect(res.sources).toHaveLength(1);
  });

  it('handles canceled file dialogs gracefully', async () => {
    const openHandler = handlers.get(IPC_CHANNELS.OPEN_FILE_DIALOG)!;
    const openRes = (await openHandler({} as never, {})) as { canceled: boolean };
    expect(openRes.canceled).toBe(true);

    const saveHandler = handlers.get(IPC_CHANNELS.SAVE_FILE_DIALOG)!;
    const saveRes = (await saveHandler({} as never, { content: 'test' })) as { canceled: boolean };
    expect(saveRes.canceled).toBe(true);
  });

  it('handles successful file open and save dialogs with BrowserWindow', async () => {
    const mockWin = { isDestroyed: () => false };
    registerIpcHandlers(() => mockWin as never, mockStorage, mockNativeAudio);

    vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({
      canceled: false,
      filePaths: ['/tmp/preset.peq'],
    });

    const openHandler = handlers.get(IPC_CHANNELS.OPEN_FILE_DIALOG)!;
    const openRes = (await openHandler({} as never, { title: 'Open PEQ' })) as {
      canceled: boolean;
      content?: string;
      filePath?: string;
    };

    expect(openRes.canceled).toBe(false);
    expect(openRes.content).toContain('Preamp');
    expect(openRes.filePath).toBe('/tmp/preset.peq');
    expect(fs.readFile).toHaveBeenCalledWith('/tmp/preset.peq', 'utf-8');

    vi.mocked(dialog.showSaveDialog).mockResolvedValueOnce({
      canceled: false,
      filePath: '/tmp/saved.txt',
    });

    const saveHandler = handlers.get(IPC_CHANNELS.SAVE_FILE_DIALOG)!;
    const saveRes = (await saveHandler({} as never, { content: 'Saved config' })) as {
      canceled: boolean;
      filePath?: string;
    };

    expect(saveRes.canceled).toBe(false);
    expect(saveRes.filePath).toBe('/tmp/saved.txt');
    expect(fs.writeFile).toHaveBeenCalledWith('/tmp/saved.txt', 'Saved config', 'utf-8');
  });

  it('delegates preset storage calls', async () => {
    const loadHandler = handlers.get(IPC_CHANNELS.LOAD_USER_PRESETS)!;
    await loadHandler({} as never);
    expect(mockStorage.loadPresets).toHaveBeenCalled();

    const saveHandler = handlers.get(IPC_CHANNELS.SAVE_USER_PRESETS)!;
    await saveHandler({} as never, { presets: [] });
    expect(mockStorage.savePresets).toHaveBeenCalled();
  });
});
