/**
 * Default flat 0 dB workspace preset for CritEQ.
 * Starts clean with 5 neutral bands ready for user customization, with no pre-made built-in profiles.
 */

import { ExpertEqualizerPreset, createPreset } from '../models/preset.js';
import { createPresetBand } from '../models/preset-band.js';
import { FilterType } from '../models/filter-type.js';

export const DEFAULT_PRESETS: readonly ExpertEqualizerPreset[] = Object.freeze([
  createPreset({
    id: 'preset-default-flat',
    name: 'Flat',
    global: 0.0,
    isDefault: true,
    bands: [
      createPresetBand({
        id: 'band-flat-1',
        frequency: 60,
        gain: 0.0,
        bandwidth: 1.9,
        type: FilterType.RESONANT_LOW_SHELF,
      }),
      createPresetBand({
        id: 'band-flat-2',
        frequency: 250,
        gain: 0.0,
        bandwidth: 1.0,
        type: FilterType.PARAMETRIC,
      }),
      createPresetBand({
        id: 'band-flat-3',
        frequency: 1000,
        gain: 0.0,
        bandwidth: 1.0,
        type: FilterType.PARAMETRIC,
      }),
      createPresetBand({
        id: 'band-flat-4',
        frequency: 4000,
        gain: 0.0,
        bandwidth: 1.0,
        type: FilterType.PARAMETRIC,
      }),
      createPresetBand({
        id: 'band-flat-5',
        frequency: 12000,
        gain: 0.0,
        bandwidth: 1.9,
        type: FilterType.RESONANT_HIGH_SHELF,
      }),
    ],
  }),
]);
