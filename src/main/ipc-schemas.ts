/**
 * Electron IPC Request/Response Zod Schemas and Channel Constants.
 * Enforces strict runtime validation at the IPC boundary.
 */

import { z } from 'zod';
import { ExpertEqualizerPresetSchema } from '../models/preset.js';
import { ExpertEqualizerPresetBandSchema } from '../models/preset-band.js';

export const IPC_CHANNELS = {
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

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

// Desktop Audio Source Schema
export const DesktopSourceItemSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  thumbnailDataUrl: z.string().optional(),
});

export const DesktopSourcesResponseSchema = z.object({
  success: z.boolean(),
  sources: z.array(DesktopSourceItemSchema),
  error: z.string().optional(),
});

export type DesktopSourceItem = z.infer<typeof DesktopSourceItemSchema>;
export type DesktopSourcesResponse = z.infer<typeof DesktopSourcesResponseSchema>;

// File Dialog Schemas
export const OpenFileDialogOptionsSchema = z.object({
  title: z.string().optional(),
  extensions: z.array(z.string()).default(['txt', 'peq']),
});

export const OpenFileResultSchema = z.object({
  canceled: z.boolean(),
  content: z.string().optional(),
  filePath: z.string().optional(),
  error: z.string().optional(),
});

export const SaveFileDialogOptionsSchema = z.object({
  title: z.string().optional(),
  defaultPath: z.string().optional(),
  content: z.string(),
});

export const SaveFileResultSchema = z.object({
  canceled: z.boolean(),
  filePath: z.string().optional(),
  error: z.string().optional(),
});

export type OpenFileDialogOptions = z.input<typeof OpenFileDialogOptionsSchema>;
export type OpenFileResult = z.infer<typeof OpenFileResultSchema>;
export type SaveFileDialogOptions = z.input<typeof SaveFileDialogOptionsSchema>;
export type SaveFileResult = z.infer<typeof SaveFileResultSchema>;

// Preset Persistence Schemas
export const SaveUserPresetsRequestSchema = z.object({
  presets: z.array(ExpertEqualizerPresetSchema),
  activePreset: ExpertEqualizerPresetSchema.optional(),
});

export const UserPresetsResponseSchema = z.object({
  success: z.boolean(),
  presets: z.array(ExpertEqualizerPresetSchema).default([]),
  activePreset: ExpertEqualizerPresetSchema.optional(),
  error: z.string().optional(),
});

export type SaveUserPresetsRequest = z.input<typeof SaveUserPresetsRequestSchema>;
export type UserPresetsResponse = z.infer<typeof UserPresetsResponseSchema>;

// Native Audio Engine Schemas
export const UpdateNativeBandsRequestSchema = z.object({
  bands: z.array(ExpertEqualizerPresetBandSchema),
  preamp: z.number().min(-24).max(24).optional(),
  soloBandId: z.string().nullable().optional(),
});

export const SetNativeBypassRequestSchema = z.object({
  bypass: z.boolean(),
});

export const SetNativeVolumeRequestSchema = z.object({
  volume: z.number().min(0).max(2),
});

export const SetOutputDeviceRequestSchema = z.object({
  deviceId: z.number().int().positive(),
});

export type UpdateNativeBandsRequest = z.infer<typeof UpdateNativeBandsRequestSchema>;
export type SetNativeBypassRequest = z.infer<typeof SetNativeBypassRequestSchema>;
export type SetNativeVolumeRequest = z.infer<typeof SetNativeVolumeRequestSchema>;
export type SetOutputDeviceRequest = z.infer<typeof SetOutputDeviceRequestSchema>;
