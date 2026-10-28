import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NativeAudioManager } from '../../src/main/native-audio-manager.js';
import { ExpertEqualizerPresetBand } from '../../src/models/preset-band.js';
import { FilterType } from '../../src/models/filter-type.js';
import { AudioChannel } from '../../src/models/audio-channel.js';
import { IPC_CHANNELS } from '../../src/main/ipc-schemas.js';

describe('NativeAudioManager', () => {
  let manager: NativeAudioManager;
  let mockSend: ReturnType<typeof vi.fn>;
  let mockWindow: { webContents: { send: ReturnType<typeof vi.fn> }; isDestroyed: () => boolean };

  beforeEach(() => {
    vi.useFakeTimers();
    mockSend = vi.fn();
    mockWindow = {
      webContents: { send: mockSend },
      isDestroyed: () => false,
      isVisible: () => true,
      isMinimized: () => false,
    };
    manager = new NativeAudioManager(() => mockWindow as never);
  });

  afterEach(() => {
    manager.stop();
    vi.useRealTimers();
  });

  it('starts fallback mock telemetry when binary is not present or in test environment', () => {
    (manager as unknown as { resolveBinaryPath: () => string | null }).resolveBinaryPath = () => null;
    manager.start();
    expect(mockSend).not.toHaveBeenCalled();

    // Advance 60ms
    vi.advanceTimersByTime(60);
    expect(mockSend).toHaveBeenCalledWith(
      IPC_CHANNELS.TELEMETRY,
      expect.objectContaining({
        peakL: 0,
        peakR: 0,
        rmsL: 0,
        rmsR: 0,
        fft: expect.any(Array),
      })
    );
  });

  it('returns available physical output devices', () => {
    const devices = manager.getOutputDevices();
    expect(devices.length).toBeGreaterThan(0);
    expect(devices[0]!.name).toContain('MacBook Pro Speakers');
  });

  it('handles updateBands, setBypass, and setVolume safely when process is offline', () => {
    const band: ExpertEqualizerPresetBand = {
      id: 'band-1',
      frequency: 1000,
      gain: 2.5,
      bandwidth: 1.0,
      type: FilterType.PARAMETRIC,
      bypass: false,
    };

    expect(manager.updateBands([band], 3.0)).toBe(false);
    expect(manager.setBypass(true)).toBe(false);
    expect(manager.setVolume(0.75)).toBe(false);
    expect(manager.setOutputDevice(81)).toBe(false);
  });

  it('updates bands with proper filter type and channel mapping when stdin is available', () => {
    const mockStdinWrite = vi.fn();
    (manager as unknown as { process: unknown }).process = {
      stdin: { writable: true, write: mockStdinWrite },
      kill: vi.fn(),
    };

    const bands: ExpertEqualizerPresetBand[] = [
      {
        id: 'b1',
        frequency: 80,
        gain: 3,
        bandwidth: 0.7,
        type: FilterType.RESONANT_LOW_SHELF,
        bypass: false,
        channels: [AudioChannel.LEFT],
      },
      {
        id: 'b2',
        frequency: 8000,
        gain: -2,
        bandwidth: 1.0,
        type: FilterType.RESONANT_HIGH_SHELF,
        bypass: false,
        channels: [AudioChannel.RIGHT],
      },
      {
        id: 'b3',
        frequency: 1000,
        gain: 0,
        bandwidth: 2.0,
        type: FilterType.BAND_STOP,
        bypass: true,
      },
    ];

    const ok = manager.updateBands(bands, -4.5);
    expect(ok).toBe(true);
    expect(mockStdinWrite).toHaveBeenCalled();

    const writtenJson = JSON.parse(mockStdinWrite.mock.calls[0]![0].trim());
    expect(writtenJson.type).toBe('updateBands');
    expect(writtenJson.preamp).toBe(-4.5);
    expect(writtenJson.bands[0].filterType).toBe('lowShelf');
    expect(writtenJson.bands[0].channel).toBe('left');
    expect(writtenJson.bands[1].filterType).toBe('highShelf');
    expect(writtenJson.bands[1].channel).toBe('right');
    expect(writtenJson.bands[2].filterType).toBe('notch');
    expect(writtenJson.bands[2].channel).toBe('all');
    expect(writtenJson.bands[2].isEnabled).toBe(false);

    expect(manager.setBypass(true)).toBe(true);
    expect(manager.setVolume(0.9)).toBe(true);
    expect(manager.setOutputDevice(81)).toBe(true);

    // Soloing a band sends a single isolated filter (bandPass/lowPass/highPass) with 0 dB preamp
    mockStdinWrite.mockClear();
    manager.updateBands(bands, -4.5, 'b3');
    const soloJson = JSON.parse(mockStdinWrite.mock.calls[0]![0].trim());
    expect(soloJson.preamp).toBe(0);
    expect(soloJson.bands).toHaveLength(1);
    expect(soloJson.bands[0].filterType).toBe('bandPass');
    expect(soloJson.bands[0].isEnabled).toBe(true);

    mockStdinWrite.mockClear();
    manager.updateBands(bands, -4.5, 'b1');
    const lowSoloJson = JSON.parse(mockStdinWrite.mock.calls[0]![0].trim());
    expect(lowSoloJson.bands[0].filterType).toBe('lowPass');

    mockStdinWrite.mockClear();
    manager.updateBands(bands, -4.5, 'b2');
    const highSoloJson = JSON.parse(mockStdinWrite.mock.calls[0]![0].trim());
    expect(highSoloJson.bands[0].filterType).toBe('highPass');
  });

  it('parses incoming stdout telemetry lines and broadcasts to BrowserWindow', () => {
    const chunk = `{"type":"telemetry","peakL":0.42,"peakR":0.38,"rmsL":0.15,"rmsR":0.14,"fft":[0.1,0.2,0.3]}\n{"type":"devices","activeDeviceId":99,"volume":0.65,"devices":[{"id":99,"name":"Studio Display Speakers"}]}\n`;
    (manager as unknown as { handleStdoutData: (c: string) => void }).handleStdoutData(chunk);

    expect(mockSend).toHaveBeenCalledWith(
      IPC_CHANNELS.TELEMETRY,
      expect.objectContaining({
        peakL: 0.42,
        peakR: 0.38,
        rmsL: 0.15,
        rmsR: 0.14,
        fft: [0.1, 0.2, 0.3],
      })
    );
    expect(manager.getOutputDevices()).toEqual([{ id: 99, name: 'Studio Display Speakers' }]);
    expect(manager.getActiveDeviceId()).toBe(99);
    expect(manager.getVolume()).toBe(0.65);
    expect(mockSend).toHaveBeenCalledWith(
      IPC_CHANNELS.OUTPUT_DEVICES_CHANGED,
      expect.objectContaining({
        activeDeviceId: 99,
        volume: 0.65,
        devices: [{ id: 99, name: 'Studio Display Speakers' }],
      })
    );
  });

  it('stops timers and terminates process cleanly on stop()', () => {
    manager.start();
    const mockKill = vi.fn();
    const mockWrite = vi.fn();
    (manager as unknown as { process: unknown }).process = {
      stdin: { writable: true, write: mockWrite },
      kill: mockKill,
    };

    manager.stop();
    expect(mockWrite).toHaveBeenCalledWith('{"type":"quit"}\n');
    expect(mockKill).toHaveBeenCalledWith('SIGTERM');
  });
});
