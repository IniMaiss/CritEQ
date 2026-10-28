/**
 * Numerical and grammatical constants for CritEQ Mastering Equalizer.
 * Standard parameters compliant with Equalizer APO and Audio EQ Cookbook specifications.
 */

export const FREQUENCY_HZ_MIN = 10 as const;
export const FREQUENCY_HZ_MAX = 24000 as const;

export const GAIN_DB_MIN = -24.0 as const;
export const GAIN_DB_MAX = 24.0 as const;
export const GAIN_NOTCH_DB = -128.0 as const;

export const BANDWIDTH_OCTAVES_MIN = 0.05 as const;
export const BANDWIDTH_OCTAVES_MAX = 5.0 as const;
export const BANDWIDTH_OCTAVES_DEFAULT = 1.0 as const;
export const BANDWIDTH_Q_DEFAULT = 1.41 as const;

export const DEFAULT_SAMPLE_RATE = 44100 as const;
export const NYQUIST_HEADROOM_HZ = 10 as const;

export const PEQ_FILTER_REGEX =
  /^Filter\s*\d*\s*:\s*(ON|OFF)\s+(\S+)\s+Fc\s+(\S+)\s+Hz(?:\s+Gain\s+(\S+)\s+dB)?(?:\s+(Q|BW\s+Oct)\s+(\S+))?/i;

export const PREAMP_REGEX = /^Preamp\s*:\s*([^\s]+)\s+dB/i;
export const CHANNEL_REGEX = /^Channel\s*:\s*(.+)/i;
export const DEVICE_REGEX = /^Device\s*:\s*(.+)/i;
export const NAME_REGEX = /^Name\s*:\s*(.+)/i;

export const PEQ_SUPPORTED_FILTER_TOKENS = Object.freeze([
  'PK',
  'PEQ',
  'MODAL',
  'HS',
  'HSC',
  'LS',
  'LSC',
  'NO',
]);

export const REST_ROUTES = Object.freeze({
  PRESETS: '/effects/equalizers/expert/presets',
  SELECTED_PRESET: '/effects/equalizers/expert/presets/selected',
  SELECT_PRESET: '/effects/equalizers/expert/presets/select',
  IMPORT_PRESETS: '/effects/equalizers/expert/presets/import',
  EXPORT_PRESETS: '/effects/equalizers/expert/presets/export',
  SHOW_DEFAULT_PRESETS: '/effects/equalizers/expert/settings/show-default-presets',
});
