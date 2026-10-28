/**
 * Brand & Folder Extraction Utility for CritEQ Presets.
 * Categorizes 5,900+ IEM/headphone presets into neat brand folders.
 */

import { ExpertEqualizerPreset } from '../../../models/preset.js';

export const FOLDER_FLAT = 'Flat / Default';
export const FOLDER_CUSTOM = 'Custom Presets';
export const FOLDER_MACBOOK = 'MacBook Speakers';
export const FOLDER_ALL = '__ALL__';

const KNOWN_MULTI_WORD_BRANDS: readonly string[] = Object.freeze([
  '64 Audio',
  '7th Acoustics',
  'Alpha Omega',
  'Anker Soundcore',
  'Campfire Audio',
  'Custom Art',
  'Dita Audio',
  'Empire Ears',
  'Fearless Audio',
  'Final Audio',
  'Fir Audio',
  'Fischer Audio',
  'IMR Acoustics',
  'JH Audio',
  'Kinera Celest',
  'Kiwi Ears',
  'Lark Studio',
  'Letshuoer',
  'Little Dot',
  'LZ Hi-Fi',
  'Meze Audio',
  'NF ACOUS',
  'Noble Audio',
  'Periodic Audio',
  'Queen of Audio',
  'SeeAudio',
  'Simgot Audio',
  'Sonic Memory',
  'Sound Rhyme',
  'Symphonium Audio',
  'Tansio Mirai',
  'Tin HiFi',
  'Ultimate Ears',
  'Unique Melody',
  'Venture Electronics',
  'Vision Ears',
  'Westone Audio',
  'Xenns Mangird',
]);

/**
 * Extracts a normalized brand/folder name from a preset or preset name.
 */
export function extractBrandFromPreset(preset: ExpertEqualizerPreset): string {
  if (preset.isDefault || preset.name === 'Flat' || preset.id === 'preset-default-flat') {
    return FOLDER_FLAT;
  }

  const name = preset.name.trim();

  if (name.startsWith('MacBook')) {
    return FOLDER_MACBOOK;
  }

  // Check known multi-word brands
  const lowerName = name.toLowerCase();
  for (const brand of KNOWN_MULTI_WORD_BRANDS) {
    if (lowerName.startsWith(brand.toLowerCase())) {
      return brand;
    }
  }

  // Extract first word delimiter (space, dash, slash, paren)
  const firstWord = name.split(/[\s-_(]/)[0];
  if (!firstWord || firstWord.length === 0) {
    return FOLDER_CUSTOM;
  }

  // Common capitalization & aliases
  const lowerFirst = firstWord.toLowerCase();
  if (lowerFirst === 'lafitear') return 'Lafitear';
  if (lowerFirst === 'moondrop') return 'Moondrop';
  if (lowerFirst === 'thieaudio') return 'Thieaudio';
  if (lowerFirst === 'simgot') return 'Simgot Audio';
  if (lowerFirst === 'sennheiser') return 'Sennheiser';
  if (lowerFirst === 'truthear') return 'Truthear';
  if (lowerFirst === 'tangzu') return 'Tangzu';
  if (lowerFirst === 'dunu') return 'DUNU';
  if (lowerFirst === 'sony') return 'Sony';
  if (lowerFirst === 'kz') return 'KZ';
  if (lowerFirst === 'cca') return 'CCA';
  if (lowerFirst === '7hz') return '7Hz';
  if (lowerFirst === 'aful') return 'AFUL';
  if (lowerFirst === 'qdc') return 'QDC';
  if (lowerFirst === 'fiio') return 'FiiO';
  if (lowerFirst === 'hifiman') return 'HiFiMAN';

  // Capitalize first letter, preserve rest if uppercase (like BQEYZ, TRN)
  return firstWord.charAt(0).toUpperCase() + firstWord.slice(1);
}

/**
 * Groups presets into a Map of brand -> presets array.
 */
export function groupPresetsByBrand(
  presets: readonly ExpertEqualizerPreset[]
): Map<string, ExpertEqualizerPreset[]> {
  const map = new Map<string, ExpertEqualizerPreset[]>();

  for (const preset of presets) {
    const brand = extractBrandFromPreset(preset);
    const existing = map.get(brand);
    if (existing) {
      existing.push(preset);
    } else {
      map.set(brand, [preset]);
    }
  }

  return map;
}

/**
 * Returns an ordered array of brand names with Flat & Custom at top,
 * followed by alphabetical brands.
 */
export function getSortedBrandList(presets: readonly ExpertEqualizerPreset[]): string[] {
  const brandMap = groupPresetsByBrand(presets);
  const brands = Array.from(brandMap.keys());

  const specialTop = [FOLDER_FLAT, FOLDER_CUSTOM, FOLDER_MACBOOK];
  const alphaBrands = brands
    .filter((b) => !specialTop.includes(b))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

  const result: string[] = [];
  for (const s of specialTop) {
    if (brandMap.has(s)) {
      result.push(s);
    }
  }

  return result.concat(alphaBrands);
}
