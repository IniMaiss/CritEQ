/**
 * CritEQ Mastering Color Palette, Frequency Spectrum Scale, Formatters, and Vector Icons.
 * Clean-room original implementation for CritEQ Parametric Mastering Equalizer.
 */

import { FilterType } from '../../../models/filter-type.js';
import { AudioChannel } from '../../../models/audio-channel.js';
import { BWtoQ } from '../../../models/bandwidth-unit.js';
import {
  FREQUENCY_HZ_MIN,
  FREQUENCY_HZ_MAX,
  BANDWIDTH_OCTAVES_DEFAULT,
  GAIN_DB_MIN,
} from '../../../common/constants.js';

export const CRITEQ_COLORS = Object.freeze({
  dark: '#333B4D',
  light: '#F3F4F6',
  background: '#12151E',
  backgroundDarker: '#0D1017',
  backgroundDarkest: '#080A0F',
  backgroundBrighter: '#1C212E',
  backgroundBrightest: '#262D3D',
  foreground: '#F3F4F6',
  foregroundDarker: '#9CA3AF',
  accent: '#F5A623',
  accentDarker: '#D97706',
  accentDarkest: '#B45309',
  accentLighter: '#FBBF24',
  accentLightest: '#FDE68A',
  brand: '#F5A623',
  success: '#10B981',
  warning: '#F43F5E',
  caution: '#F5A623',
  bgRedMix: '#F43F5E',
  bgGreenMix: '#F5A623',
  leftChannel: '#38BDF8',
  rightChannel: '#FB7185',
});

// Backward-compatibility alias
export const EQMAC_COLORS = CRITEQ_COLORS;

/**
 * Mastering-grade 7-stop luminous frequency spectrum palette (20 Hz -> 20 kHz).
 */
const RAINBOW_STOPS: readonly [number, number, number][] = [
  [251, 113, 133], // #FB7185 (Sub-Bass Warm Rose)
  [251, 146, 60],  // #FB923C (Bass Amber-Orange)
  [245, 166, 35],  // #F5A623 (Low-Mid Mastering Gold)
  [52, 211, 153],  // #34D399 (Mid Emerald Mint)
  [56, 189, 248],  // #38BDF8 (Upper-Mid Precision Cyan)
  [129, 140, 248], // #818CF8 (Presence Indigo)
  [192, 132, 252], // #C084FC (Air Violet)
];

function parseHexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0]! + clean[0]!, 16);
    const g = parseInt(clean[1]! + clean[1]!, 16);
    const b = parseInt(clean[2]! + clean[2]!, 16);
    return [r, g, b];
  }
  const num = parseInt(clean, 16);
  if (Number.isNaN(num)) return [79, 141, 113];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clampByte = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    '#' +
    [clampByte(r), clampByte(g), clampByte(b)]
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('')
  );
}

/**
 * Desaturates and darkens an RGB color when another band or channel bucket is highlighted
 * (matches chroma(c).desaturate(1).darken(1) in eqm-expert-eq-graph).
 */
export function desaturateAndDarkenHex(hex: string): string {
  const [r, g, b] = parseHexToRgb(hex);
  const gray = 0.299 * r + 0.587 * g + 0.114 * b;
  const mixedR = (r * 0.45 + gray * 0.55) * 0.65;
  const mixedG = (g * 0.45 + gray * 0.55) * 0.65;
  const mixedB = (b * 0.45 + gray * 0.55) * 0.65;
  return rgbToHex(mixedR, mixedG, mixedB);
}

/**
 * Maps a frequency in [10, 24000] Hz logarithmically onto the 7-stop spectrum scale.
 */
export function getColorForFrequency(freqHz: number): string {
  const clamped = Math.max(FREQUENCY_HZ_MIN, Math.min(FREQUENCY_HZ_MAX, freqHz));
  const t =
    Math.log10(clamped / FREQUENCY_HZ_MIN) /
    Math.log10(FREQUENCY_HZ_MAX / FREQUENCY_HZ_MIN);
  const scaled = Math.max(0, Math.min(1, t)) * (RAINBOW_STOPS.length - 1);
  const idx = Math.min(RAINBOW_STOPS.length - 2, Math.floor(scaled));
  const frac = scaled - idx;
  const c0 = RAINBOW_STOPS[idx]!;
  const c1 = RAINBOW_STOPS[idx + 1]!;
  return rgbToHex(
    c0[0] + (c1[0] - c0[0]) * frac,
    c0[1] + (c1[1] - c0[1]) * frac,
    c0[2] + (c1[2] - c0[2]) * frac
  );
}

/**
 * Precision frequency formatter.
 */
export function formatEqMacFrequency(freqHz: number): string {
  if (freqHz > 9999) {
    return `${parseFloat((freqHz / 1000).toFixed(1))}kHz`;
  }
  if (freqHz > 999) {
    return `${parseFloat((freqHz / 1000).toFixed(2))}kHz`;
  }
  return `${Math.round(freqHz)}Hz`;
}
export const formatCritEQFrequency = formatEqMacFrequency;

/**
 * Precision gain formatter.
 */
export function formatEqMacGain(gainDb: number, type?: FilterType): string {
  if (type === FilterType.BAND_STOP) {
    return '-128dB';
  }
  const clean = Math.abs(gainDb) < 0.05 ? 0 : gainDb;
  return `${clean > 0 ? '+' : ''}${clean.toFixed(1)}dB`;
}
export const formatCritEQGain = formatEqMacGain;

/**
 * Precision bandwidth value screen formatter.
 */
export function formatEqMacBandwidthScreen(
  bandwidthOctaves: number,
  unit: 'Q' | 'OCTAVES'
): string {
  if (unit === 'Q') {
    const q = BWtoQ(bandwidthOctaves);
    return `Q: ${q.toFixed(q >= 10 ? 2 : 3)}`;
  }
  return `O: ${bandwidthOctaves.toFixed(3)}`;
}
export const formatCritEQBandwidthScreen = formatEqMacBandwidthScreen;

export function getDefaultBandwidthForType(type: FilterType): number {
  switch (type) {
    case FilterType.RESONANT_LOW_SHELF:
    case FilterType.RESONANT_HIGH_SHELF:
      return 1.9;
    case FilterType.BAND_STOP:
    case FilterType.PARAMETRIC:
    default:
      return BANDWIDTH_OCTAVES_DEFAULT;
  }
}

export function getDefaultGainForType(type: FilterType): number {
  if (type === FilterType.BAND_STOP) {
    return GAIN_DB_MIN;
  }
  return 0;
}

export function getBandTypeName(type: FilterType): string {
  switch (type) {
    case FilterType.PARAMETRIC:
      return 'Peaking';
    case FilterType.BAND_STOP:
      return 'Notch';
    case FilterType.RESONANT_LOW_SHELF:
      return 'Low Shelf';
    case FilterType.RESONANT_HIGH_SHELF:
      return 'High Shelf';
  }
}

export function getBandProcessesChannel(
  channels: readonly AudioChannel[] | undefined,
  channel: AudioChannel
): boolean {
  if (!channels || channels.length === 0) return true;
  return channels.includes(channel);
}

export function isAllChannelsBand(channels: readonly AudioChannel[] | undefined): boolean {
  if (!channels || channels.length === 0) return true;
  return channels.includes(AudioChannel.LEFT) && channels.includes(AudioChannel.RIGHT);
}

export function getBandChannelBuckets(
  channels: readonly AudioChannel[] | undefined
): ('all' | 'left' | 'right')[] {
  if (isAllChannelsBand(channels)) return ['all'];
  const result: ('all' | 'left' | 'right')[] = [];
  if (channels?.includes(AudioChannel.LEFT)) result.push('left');
  if (channels?.includes(AudioChannel.RIGHT)) result.push('right');
  return result.length > 0 ? result : ['all'];
}

/**
 * Clean-room vector icons for CritEQ filter topologies and channel controls.
 */
export const CRITEQ_ICONS = Object.freeze({
  filterPeaking: `<svg viewBox="0 0 24 16" width="15" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 13h5c2 0 3.5-10 5-10s3 10 5 10h5"/></svg>`,
  filterBandStop: `<svg viewBox="0 0 24 16" width="15" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h5c2 0 3.5 10 5 10s3-10 5-10h5"/></svg>`,
  filterLowShelf: `<svg viewBox="0 0 24 16" width="15" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h6c2 0 4 8 7 8h7"/></svg>`,
  filterHighShelf: `<svg viewBox="0 0 24 16" width="15" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h7c3 0 5-8 7-8h6"/></svg>`,
  speakerLeft: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.5 8.5a5 5 0 0 1 0 7"></path></svg>`,
  speakerRight: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.5 8.5a5 5 0 0 1 0 7"></path><path d="M19 5a10 10 0 0 1 0 14"></path></svg>`,
  pencil: `<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`,
  minus: `<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="4" y1="12" x2="20" y2="12"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="12" y1="4" x2="12" y2="20"/><line x1="4" y1="12" x2="20" y2="12"/></svg>`,
  expand: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`,
  check: `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
});

// Backward-compatibility alias
export const EQMAC_ICONS = CRITEQ_ICONS;

export function getFilterSvgIcon(type: FilterType): string {
  switch (type) {
    case FilterType.PARAMETRIC:
      return EQMAC_ICONS.filterPeaking;
    case FilterType.BAND_STOP:
      return EQMAC_ICONS.filterBandStop;
    case FilterType.RESONANT_LOW_SHELF:
      return EQMAC_ICONS.filterLowShelf;
    case FilterType.RESONANT_HIGH_SHELF:
      return EQMAC_ICONS.filterHighShelf;
  }
}
