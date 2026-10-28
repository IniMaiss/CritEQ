/**
 * ExpertEqualizerPreset model and immutable operations.
 */

import { z } from 'zod';
import { GAIN_DB_MIN, GAIN_DB_MAX } from '../common/constants.js';
import {
  ExpertEqualizerPresetBandSchema,
  ExpertEqualizerPresetBand,
  validatePresetBand,
} from './preset-band.js';
import { ValidationError } from '../common/errors.js';

export const ExpertEqualizerPresetSchema = z.object({
  id: z.string().min(1).default(() => crypto.randomUUID()),
  name: z.string().min(1),
  global: z.number().min(GAIN_DB_MIN).max(GAIN_DB_MAX).default(0.0),
  bands: z.array(ExpertEqualizerPresetBandSchema).readonly().default([]),
  isDefault: z.boolean().default(false),
  groups: z.record(z.unknown()).optional(),
});

export interface ExpertEqualizerPreset {
  readonly id: string;
  readonly name: string;
  readonly global: number;
  readonly bands: readonly ExpertEqualizerPresetBand[];
  readonly isDefault: boolean;
  readonly groups?: Readonly<Record<string, unknown>> | undefined;
}

export function validatePreset(input: unknown): Readonly<ExpertEqualizerPreset> {
  const result = ExpertEqualizerPresetSchema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new ValidationError('Invalid preset configuration', issues);
  }
  const preset = result.data;
  const frozenBands: readonly ExpertEqualizerPresetBand[] = Object.freeze(
    preset.bands.map((b) => validatePresetBand(b))
  );

  return Object.freeze({
    ...preset,
    bands: frozenBands,
    groups: preset.groups ? Object.freeze({ ...preset.groups }) : undefined,
  });
}

export type UpdatePresetInput = {
  [K in keyof z.input<typeof ExpertEqualizerPresetSchema>]?:
    | z.input<typeof ExpertEqualizerPresetSchema>[K]
    | undefined;
};

export function createPreset(
  params: z.input<typeof ExpertEqualizerPresetSchema>
): Readonly<ExpertEqualizerPreset> {
  return validatePreset(params);
}

export function updatePreset(
  preset: Readonly<ExpertEqualizerPreset>,
  updates: UpdatePresetInput
): Readonly<ExpertEqualizerPreset> {
  return validatePreset({
    ...preset,
    ...updates,
    bands: updates.bands !== undefined ? updates.bands : preset.bands,
  });
}

export function addPresetBand(
  preset: Readonly<ExpertEqualizerPreset>,
  band: Readonly<ExpertEqualizerPresetBand>
): Readonly<ExpertEqualizerPreset> {
  const newBands = [...preset.bands, band].sort((a, b) => a.frequency - b.frequency);
  return updatePreset(preset, { bands: newBands });
}

export function updatePresetBand(
  preset: Readonly<ExpertEqualizerPreset>,
  bandId: string,
  updates: Partial<z.input<typeof ExpertEqualizerPresetBandSchema>>
): Readonly<ExpertEqualizerPreset> {
  const newBands = preset.bands.map((b) => {
    if (b.id === bandId) {
      return { ...b, ...updates };
    }
    return b;
  });
  return updatePreset(preset, { bands: newBands });
}

export function removePresetBand(
  preset: Readonly<ExpertEqualizerPreset>,
  bandId: string
): Readonly<ExpertEqualizerPreset> {
  const newBands = preset.bands.filter((b) => b.id !== bandId);
  return updatePreset(preset, { bands: newBands });
}
