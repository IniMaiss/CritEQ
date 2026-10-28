/**
 * ExpertEqualizerPresetBand model and validation.
 */

import { z } from 'zod';
import {
  FREQUENCY_HZ_MIN,
  FREQUENCY_HZ_MAX,
  GAIN_DB_MAX,
  GAIN_NOTCH_DB,
  BANDWIDTH_OCTAVES_MIN,
  BANDWIDTH_OCTAVES_MAX,
  BANDWIDTH_OCTAVES_DEFAULT,
} from '../common/constants.js';
import { FilterType } from './filter-type.js';
import { AudioChannel } from './audio-channel.js';
import { ValidationError } from '../common/errors.js';

export const ExpertEqualizerPresetBandSchema = z.object({
  id: z.string().min(1).default(() => crypto.randomUUID()),
  frequency: z.number().min(FREQUENCY_HZ_MIN).max(FREQUENCY_HZ_MAX),
  gain: z.number().min(GAIN_NOTCH_DB).max(GAIN_DB_MAX),
  bandwidth: z
    .number()
    .min(BANDWIDTH_OCTAVES_MIN)
    .max(BANDWIDTH_OCTAVES_MAX)
    .default(BANDWIDTH_OCTAVES_DEFAULT),
  type: z.nativeEnum(FilterType),
  bypass: z.boolean().default(false),
  channels: z.array(z.nativeEnum(AudioChannel)).readonly().optional(),
  color: z.string().optional(),
  groupId: z.string().optional(),
});

export interface ExpertEqualizerPresetBand {
  readonly id: string;
  readonly frequency: number;
  readonly gain: number;
  readonly bandwidth: number;
  readonly type: FilterType;
  readonly bypass: boolean;
  readonly channels?: readonly AudioChannel[] | undefined;
  readonly color?: string | undefined;
  readonly groupId?: string | undefined;
}

export function validatePresetBand(input: unknown): Readonly<ExpertEqualizerPresetBand> {
  const result = ExpertEqualizerPresetBandSchema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new ValidationError('Invalid preset band configuration', issues);
  }
  const band = result.data;
  return Object.freeze({
    ...band,
    channels: band.channels ? Object.freeze([...band.channels]) : undefined,
  });
}

export type UpdatePresetBandInput = {
  [K in keyof z.input<typeof ExpertEqualizerPresetBandSchema>]?:
    | z.input<typeof ExpertEqualizerPresetBandSchema>[K]
    | undefined;
};

export function createPresetBand(
  params: z.input<typeof ExpertEqualizerPresetBandSchema>
): Readonly<ExpertEqualizerPresetBand> {
  return validatePresetBand(params);
}

export function copyPresetBand(
  original: Readonly<ExpertEqualizerPresetBand>,
  updates: UpdatePresetBandInput
): Readonly<ExpertEqualizerPresetBand> {
  return validatePresetBand({
    ...original,
    ...updates,
    channels: updates.channels !== undefined ? updates.channels : original.channels,
  });
}
