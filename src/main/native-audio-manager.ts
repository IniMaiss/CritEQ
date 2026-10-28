/**
 * Native macOS Audio Engine Manager.
 * Spawns and manages the native Swift CoreAudio tap process, routing telemetry to the renderer
 * and forwarding band updates, preamp, volume, output device selection, and bypass commands to the DSP engine.
 */

import { spawn, ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { BrowserWindow } from 'electron';
import { ExpertEqualizerPresetBand } from '../models/preset-band.js';
import { FilterType } from '../models/filter-type.js';
import { AudioChannel } from '../models/audio-channel.js';
import { BWtoQ } from '../models/bandwidth-unit.js';
import { IPC_CHANNELS } from './ipc-schemas.js';

export interface AudioTelemetry {
  readonly peakL: number;
  readonly peakR: number;
  readonly rmsL: number;
  readonly rmsR: number;
  readonly fft: readonly number[];
}

export interface OutputDevice {
  readonly id: number;
  readonly name: string;
}

export class NativeAudioManager {
  private process: ChildProcess | null = null;
  private stdoutBuffer: string = '';
  private mockTimer: NodeJS.Timeout | null = null;
  private readonly getWindow: () => BrowserWindow | null;
  private currentVolume: number = 1.0;
  private currentPreamp: number = 0.0;
  private currentBypass: boolean = false;
  private currentSoloBandId: string | null = null;
  private cachedBands: readonly ExpertEqualizerPresetBand[] | null = null;
  private activeDeviceId: number = 81;
  private devices: OutputDevice[] = [
    { id: 81, name: 'MacBook Pro Speakers' },
    { id: 1, name: 'External Headphones / Output' },
  ];

  constructor(getWindow: () => BrowserWindow | null) {
    this.getWindow = getWindow;
  }

  /**
   * Start native audio engine child process or fallback mock generator.
   */
  public start(): void {
    const binaryPath = this.resolveBinaryPath();

    if (binaryPath && existsSync(binaryPath)) {
      this.spawnNativeProcess(binaryPath);
    } else {
      this.startMockTelemetry();
    }
  }

  /**
   * Resolve path to the compiled native binary (never inside a virtual .asar archive).
   */
  private resolveBinaryPath(): string | null {
    const resPath = (process as unknown as { resourcesPath?: string }).resourcesPath;
    const candidates = [
      ...(resPath
        ? [join(resPath, 'native-audio-engine'), join(resPath, 'dist/main/native-audio-engine')]
        : []),
      join(__dirname, 'native-audio-engine').replace('app.asar', 'app.asar.unpacked'),
      join(__dirname, 'native-audio-engine'),
      join(__dirname, '../main/native-audio-engine'),
      join(process.cwd(), 'dist/main/native-audio-engine'),
    ];

    for (const candidate of candidates) {
      if (!candidate) continue;
      // macOS kernel cannot spawn an executable path inside a virtual .asar file
      const isInsidePackedAsar =
        candidate.includes('app.asar') && !candidate.includes('app.asar.unpacked');
      if (!isInsidePackedAsar && existsSync(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  /**
   * Spawn native audio helper and pipe stdout to webContents.
   */
  private spawnNativeProcess(binaryPath: string): void {
    try {
      this.process = spawn(binaryPath, [], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.process.stdout?.setEncoding('utf-8');
      this.process.stdout?.on('data', (chunk: string) => {
        this.handleStdoutData(chunk);
      });

      this.process.stderr?.setEncoding('utf-8');
      this.process.stderr?.on('data', (_errChunk: string) => {
        // Native logging on stderr
      });

      this.process.on('close', () => {
        this.process = null;
      });

      this.process.on('error', () => {
        this.process = null;
        this.startMockTelemetry();
      });

      // Flush any state queued prior to process launch
      if (this.cachedBands) {
        this.updateBands(this.cachedBands, this.currentPreamp, this.currentSoloBandId);
      }
      if (this.currentBypass) {
        this.setBypass(this.currentBypass);
      }
      if (this.currentVolume !== 1.0) {
        this.setVolume(this.currentVolume);
      }
    } catch {
      this.process = null;
      this.startMockTelemetry();
    }
  }

  /**
   * Parse stdout lines and broadcast telemetry or update device list.
   */
  private handleStdoutData(chunk: string): void {
    this.stdoutBuffer += chunk;
    const lines = this.stdoutBuffer.split('\n');
    this.stdoutBuffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('{"type":"telemetry"')) {
        try {
          const parsed = JSON.parse(trimmed) as AudioTelemetry;
          this.broadcastTelemetry(parsed);
        } catch {
          // Ignore malformed line
        }
      } else if (trimmed.startsWith('{"type":"devices"')) {
        try {
          const parsed = JSON.parse(trimmed) as {
            activeDeviceId?: number;
            volume?: number;
            devices?: OutputDevice[];
          };
          if (typeof parsed.activeDeviceId === 'number' && parsed.activeDeviceId > 0) {
            this.activeDeviceId = parsed.activeDeviceId;
          }
          if (typeof parsed.volume === 'number' && Number.isFinite(parsed.volume)) {
            this.currentVolume = parsed.volume;
          }
          if (Array.isArray(parsed.devices) && parsed.devices.length > 0) {
            this.devices = parsed.devices;
          }
          this.broadcastOutputDevices();
        } catch {
          // Ignore malformed device line
        }
      }
    }
  }

  /**
   * Send telemetry to renderer BrowserWindow.
   */
  private broadcastTelemetry(telemetry: AudioTelemetry): void {
    const win = this.getWindow();
    if (!win || win.isDestroyed()) return;

    const isVisible = typeof win.isVisible === 'function' ? win.isVisible() : true;
    const isMinimized = typeof win.isMinimized === 'function' ? win.isMinimized() : false;

    if (isVisible && !isMinimized) {
      win.webContents.send(IPC_CHANNELS.TELEMETRY, telemetry);
    }
  }

  /**
   * Broadcast updated hardware output devices, active device ID, and volume to renderer BrowserWindow.
   */
  private broadcastOutputDevices(): void {
    const win = this.getWindow();
    if (!win || win.isDestroyed()) return;
    win.webContents.send(IPC_CHANNELS.OUTPUT_DEVICES_CHANGED, {
      devices: [...this.devices],
      activeDeviceId: this.activeDeviceId,
      volume: this.currentVolume,
    });
  }

  /**
   * Mock telemetry generator for development and non-macOS environments.
   */
  private startMockTelemetry(): void {
    if (this.mockTimer) return;

    this.mockTimer = setInterval(() => {
      const emptyFft = Array(64).fill(0.0);
      const mock: AudioTelemetry = {
        peakL: 0.0,
        peakR: 0.0,
        rmsL: 0.0,
        rmsR: 0.0,
        fft: emptyFft,
      };
      this.broadcastTelemetry(mock);
    }, 50);
  }

  /**
   * Update equalizer bands and preamp gain in the native DSP engine.
   * When soloBandId matches a band, isolates that band's frequency range using bandPass/lowPass/highPass.
   */
  public updateBands(
    bands: readonly ExpertEqualizerPresetBand[],
    preampDb?: number,
    soloBandId?: string | null
  ): boolean {
    this.cachedBands = bands;
    if (typeof preampDb === 'number' && Number.isFinite(preampDb)) {
      this.currentPreamp = Math.max(-24, Math.min(24, preampDb));
    }
    if (soloBandId !== undefined) {
      this.currentSoloBandId = soloBandId;
    }

    if (!this.process || !this.process.stdin?.writable) {
      return false;
    }

    const soloTarget = this.currentSoloBandId
      ? bands.find((b) => b.id === this.currentSoloBandId)
      : undefined;

    const payload = soloTarget
      ? JSON.stringify({
          type: 'updateBands',
          preamp: 0.0,
          bands: [
            {
              index: 0,
              frequency: soloTarget.frequency,
              gain: 0.0,
              q: BWtoQ(soloTarget.bandwidth),
              filterType: this.mapSoloFilterType(soloTarget.type),
              isEnabled: true,
              channel: this.mapChannel(soloTarget.channels),
            },
          ],
        })
      : JSON.stringify({
          type: 'updateBands',
          preamp: this.currentPreamp,
          bands: bands.slice(0, 32).map((b, idx) => ({
            index: idx,
            frequency: b.frequency,
            gain: b.gain,
            q: BWtoQ(b.bandwidth),
            filterType: this.mapFilterType(b.type),
            isEnabled: !b.bypass,
            channel: this.mapChannel(b.channels),
          })),
        });

    this.process.stdin.write(payload + '\n');
    return true;
  }

  private mapSoloFilterType(type: FilterType): string {
    switch (type) {
      case FilterType.RESONANT_LOW_SHELF:
        return 'lowPass';
      case FilterType.RESONANT_HIGH_SHELF:
        return 'highPass';
      case FilterType.BAND_STOP:
      case FilterType.PARAMETRIC:
      default:
        return 'bandPass';
    }
  }

  private mapFilterType(type: FilterType): string {
    switch (type) {
      case FilterType.RESONANT_LOW_SHELF:
        return 'lowShelf';
      case FilterType.RESONANT_HIGH_SHELF:
        return 'highShelf';
      case FilterType.BAND_STOP:
        return 'notch';
      case FilterType.PARAMETRIC:
      default:
        return 'peak';
    }
  }

  private mapChannel(channels?: readonly AudioChannel[]): string {
    if (channels && channels.length === 1) {
      if (channels[0] === AudioChannel.LEFT) return 'left';
      if (channels[0] === AudioChannel.RIGHT) return 'right';
    }
    return 'all';
  }

  /**
   * Set equalizer bypass state.
   */
  public setBypass(bypass: boolean): boolean {
    this.currentBypass = bypass;
    if (!this.process || !this.process.stdin?.writable) {
      return false;
    }
    const payload = JSON.stringify({ type: 'setBypass', bypass });
    this.process.stdin.write(payload + '\n');
    return true;
  }

  /**
   * Set master volume output level (0.0 to 2.0).
   */
  public setVolume(volume: number): boolean {
    this.currentVolume = Math.max(0.0, Math.min(2.0, volume));
    if (!this.process || !this.process.stdin?.writable) {
      return false;
    }
    const payload = JSON.stringify({ type: 'setVolume', volume: this.currentVolume });
    this.process.stdin.write(payload + '\n');
    return true;
  }

  /**
   * Switch active CoreAudio output device.
   */
  public setOutputDevice(deviceId: number): boolean {
    if (!this.process || !this.process.stdin?.writable) {
      return false;
    }
    this.activeDeviceId = deviceId;
    const payload = JSON.stringify({ type: 'setOutputDevice', deviceId });
    this.process.stdin.write(payload + '\n');
    return true;
  }

  /**
   * Retrieve available audio output devices and request a fresh enumeration from CoreAudio.
   */
  public getOutputDevices(): OutputDevice[] {
    if (this.process && this.process.stdin?.writable) {
      this.process.stdin.write('{"type":"getDevices"}\n');
    }
    return [...this.devices];
  }

  /**
   * Retrieve the currently active CoreAudio output device ID.
   */
  public getActiveDeviceId(): number {
    return this.activeDeviceId;
  }

  /**
   * Retrieve the current output volume level.
   */
  public getVolume(): number {
    return this.currentVolume;
  }

  /**
   * Terminate native process cleanly.
   */
  public stop(): void {
    if (this.mockTimer) {
      clearInterval(this.mockTimer);
      this.mockTimer = null;
    }

    if (this.process && this.process.stdin?.writable) {
      try {
        this.process.stdin.write('{"type":"quit"}\n');
        this.process.kill('SIGTERM');
      } catch {
        // Process already exited
      }
      this.process = null;
    }
  }
}
