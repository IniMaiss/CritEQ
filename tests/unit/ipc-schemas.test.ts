import { describe, it, expect } from 'vitest';
import {
  IPC_CHANNELS,
  DesktopSourceItemSchema,
  DesktopSourcesResponseSchema,
  OpenFileDialogOptionsSchema,
  OpenFileResultSchema,
  SaveFileDialogOptionsSchema,
  SaveFileResultSchema,
  SaveUserPresetsRequestSchema,
  UserPresetsResponseSchema,
  UpdateNativeBandsRequestSchema,
  SetNativeBypassRequestSchema,
  SetNativeVolumeRequestSchema,
  SetOutputDeviceRequestSchema,
} from '../../src/main/ipc-schemas.js';
import { FilterType } from '../../src/models/filter-type.js';

describe('Electron IPC Schemas', () => {
  it('validates desktop sources response', () => {
    const valid = {
      success: true,
      sources: [
        { id: 'screen:0:0', name: 'Entire Screen', thumbnailDataUrl: 'data:image/png;base64,...' },
      ],
    };
    const parsed = DesktopSourcesResponseSchema.parse(valid);
    expect(parsed.success).toBe(true);
    expect(parsed.sources).toHaveLength(1);
    expect(parsed.sources[0]?.id).toBe('screen:0:0');

    expect(() => DesktopSourceItemSchema.parse({ id: '' })).toThrow();
  });

  it('validates open file dialog options and results', () => {
    const options = OpenFileDialogOptionsSchema.parse({ title: 'Open PEQ File' });
    expect(options.extensions).toEqual(['txt', 'peq']);

    const validResult = OpenFileResultSchema.parse({
      canceled: false,
      content: 'Filter 1: ON PK Fc 1000 Hz',
      filePath: '/path/to/peq.txt',
    });
    expect(validResult.canceled).toBe(false);
    expect(validResult.content).toContain('Filter 1');
  });

  it('validates save file dialog options and results', () => {
    const options = SaveFileDialogOptionsSchema.parse({
      content: 'Preamp: -3 dB',
      title: 'Export PEQ',
    });
    expect(options.content).toBe('Preamp: -3 dB');

    const validResult = SaveFileResultSchema.parse({
      canceled: false,
      filePath: '/path/to/saved.txt',
    });
    expect(validResult.filePath).toBe('/path/to/saved.txt');
  });

  it('validates user preset persistence payloads', () => {
    const preset = {
      id: 'custom-preset-1',
      name: 'Custom Profile',
      global: 0,
      bands: [],
      isDefault: false,
    };

    const saveReq = SaveUserPresetsRequestSchema.parse({ presets: [preset] });
    expect(saveReq.presets).toHaveLength(1);

    const loadRes = UserPresetsResponseSchema.parse({
      success: true,
      presets: [preset],
    });
    expect(loadRes.success).toBe(true);
    expect(loadRes.presets[0]?.name).toBe('Custom Profile');
  });

  it('validates native audio engine schemas correctly', () => {
    const validBands = UpdateNativeBandsRequestSchema.parse({
      bands: [
        {
          id: 'band-1',
          frequency: 500,
          gain: -3.5,
          bandwidth: 1.2,
          type: FilterType.PARAMETRIC,
          bypass: false,
        },
      ],
    });
    expect(validBands.bands).toHaveLength(1);
    expect(validBands.bands[0]?.frequency).toBe(500);

    const validBypass = SetNativeBypassRequestSchema.parse({ bypass: true });
    expect(validBypass.bypass).toBe(true);

    const validVolume = SetNativeVolumeRequestSchema.parse({ volume: 1.2 });
    expect(validVolume.volume).toBe(1.2);

    const validDevice = SetOutputDeviceRequestSchema.parse({ deviceId: 81 });
    expect(validDevice.deviceId).toBe(81);

    expect(() => SetNativeVolumeRequestSchema.parse({ volume: 3.5 })).toThrow();
    expect(() => SetOutputDeviceRequestSchema.parse({ deviceId: -1 })).toThrow();
  });

  it('exposes all defined IPC channel constants', () => {
    expect(IPC_CHANNELS.GET_DESKTOP_SOURCES).toBe('desktop-capturer:get-sources');
    expect(IPC_CHANNELS.OPEN_FILE_DIALOG).toBe('dialog:open-file');
    expect(IPC_CHANNELS.SAVE_FILE_DIALOG).toBe('dialog:save-file');
    expect(IPC_CHANNELS.LOAD_USER_PRESETS).toBe('storage:load-presets');
    expect(IPC_CHANNELS.SAVE_USER_PRESETS).toBe('storage:save-presets');
  });
});
