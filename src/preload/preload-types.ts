/**
 * Type Definitions for the Preload ContextBridge API.
 */

import type {
  DesktopSourcesResponse,
  OpenFileDialogOptions,
  OpenFileResult,
  SaveFileDialogOptions,
  SaveFileResult,
  UserPresetsResponse,
} from '../main/ipc-schemas.js';
import type { ExpertEqualizerPreset } from '../models/preset.js';
import type { ExpertEqualizerPresetBand } from '../models/preset-band.js';

export interface AudioTelemetry {
  readonly peakL: number;
  readonly peakR: number;
  readonly rmsL: number;
  readonly rmsR: number;
  readonly fft: readonly number[];
}

export interface OutputDeviceInfo {
  readonly id: number;
  readonly name: string;
}

export interface ElectronAPI {
  readonly getDesktopSources: () => Promise<DesktopSourcesResponse>;
  readonly openFileDialog: (options?: OpenFileDialogOptions) => Promise<OpenFileResult>;
  readonly saveFileDialog: (options: SaveFileDialogOptions) => Promise<SaveFileResult>;
  readonly loadUserPresets: () => Promise<UserPresetsResponse>;
  readonly saveUserPresets: (
    presets: readonly Readonly<ExpertEqualizerPreset>[],
    activePreset?: Readonly<ExpertEqualizerPreset>
  ) => Promise<{ success: boolean; error?: string }>;
  readonly updateNativeBands: (
    bands: readonly ExpertEqualizerPresetBand[],
    preamp?: number,
    soloBandId?: string | null
  ) => Promise<{ success: boolean; error?: string }>;
  readonly setNativeBypass: (
    bypass: boolean
  ) => Promise<{ success: boolean; error?: string }>;
  readonly setNativeVolume: (
    volume: number
  ) => Promise<{ success: boolean; error?: string }>;
  readonly getOutputDevices: () => Promise<{
    success: boolean;
    devices: readonly OutputDeviceInfo[];
    activeDeviceId?: number;
    volume?: number;
  }>;
  readonly setOutputDevice: (
    deviceId: number
  ) => Promise<{ success: boolean; error?: string }>;
  readonly onOutputDevicesChanged?: (
    callback: (payload: {
      readonly devices: readonly OutputDeviceInfo[];
      readonly activeDeviceId?: number;
      readonly volume?: number;
    }) => void
  ) => () => void;
  readonly onTelemetry: (callback: (telemetry: AudioTelemetry) => void) => () => void;
}

declare global {
  interface Window {
    readonly electronAPI?: ElectronAPI;
  }
}
