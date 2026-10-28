/**
 * Local JSON Preset Persistence.
 * Reads and writes user presets in the OS application data folder.
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { ExpertEqualizerPreset, ExpertEqualizerPresetSchema } from '../models/preset.js';
import { UserPresetsResponse, UserPresetsResponseSchema } from './ipc-schemas.js';

export class PresetStorage {
  private readonly filePath: string;

  constructor(userDataPath: string) {
    this.filePath = join(userDataPath, 'presets.json');
  }

  public async loadPresets(): Promise<UserPresetsResponse> {
    try {
      const data = await fs.readFile(this.filePath, 'utf-8');
      const json: unknown = JSON.parse(data);
      const result = UserPresetsResponseSchema.safeParse(json);
      if (result.success) {
        return result.data;
      }
      return { success: false, presets: [], error: 'Invalid preset file format' };
    } catch (err: unknown) {
      // If file does not exist, return empty presets list gracefully
      const isNotFound = typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'ENOENT';
      if (isNotFound) {
        return { success: true, presets: [] };
      }
      const msg = err instanceof Error ? err.message : 'Failed to read presets';
      return { success: false, presets: [], error: msg };
    }
  }

  public async savePresets(
    presets: readonly Readonly<ExpertEqualizerPreset>[],
    activePreset?: Readonly<ExpertEqualizerPreset>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Validate all presets before writing to disk
      const validated = presets.map((p) => ExpertEqualizerPresetSchema.parse(p));
      const validatedActive = activePreset
        ? ExpertEqualizerPresetSchema.parse(activePreset)
        : undefined;
      const payload: UserPresetsResponse = {
        success: true,
        presets: validated,
        ...(validatedActive ? { activePreset: validatedActive } : {}),
      };
      const tempPath = `${this.filePath}.tmp`;
      await fs.writeFile(tempPath, JSON.stringify(payload, null, 2), 'utf-8');
      await fs.rename(tempPath, this.filePath);
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save presets';
      return { success: false, error: msg };
    }
  }
}
