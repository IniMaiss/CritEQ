import { describe, it, expect } from 'vitest';
import {
  extractBrandFromPreset,
  groupPresetsByBrand,
  getSortedBrandList,
  FOLDER_FLAT,
  FOLDER_MACBOOK,
} from '../../src/renderer/components/presets/brand-extractor.js';
import { createPreset } from '../../src/models/preset.js';

describe('Brand Extractor', () => {
  it('correctly categorizes Flat and default presets', () => {
    const flatPreset = createPreset({
      id: 'preset-default-flat',
      name: 'Flat',
      global: 0,
      isDefault: true,
      bands: [],
    });
    expect(extractBrandFromPreset(flatPreset)).toBe(FOLDER_FLAT);
  });

  it('correctly categorizes MacBook speakers presets', () => {
    const macPreset = createPreset({
      name: 'MacBook Pro M1 2020 - Balanced & Clean',
      global: 0,
      bands: [],
    });
    expect(extractBrandFromPreset(macPreset)).toBe(FOLDER_MACBOOK);
  });

  it('identifies multi-word brand names', () => {
    const p1 = createPreset({ name: '64 Audio U12t (m15 Apex module)', global: 0, bands: [] });
    const p2 = createPreset({ name: 'Kiwi Ears Cadenza (Crinacle)', global: 0, bands: [] });
    const p3 = createPreset({ name: 'Campfire Audio Andromeda', global: 0, bands: [] });
    const p4 = createPreset({ name: 'Final Audio E3000', global: 0, bands: [] });

    expect(extractBrandFromPreset(p1)).toBe('64 Audio');
    expect(extractBrandFromPreset(p2)).toBe('Kiwi Ears');
    expect(extractBrandFromPreset(p3)).toBe('Campfire Audio');
    expect(extractBrandFromPreset(p4)).toBe('Final Audio');
  });

  it('identifies single word brands and Lafitear models', () => {
    const p1 = createPreset({ name: 'Lafitear LM1 (Harpo)', global: 0, bands: [] });
    const p2 = createPreset({ name: 'Lafitear LF1 (ianfann)', global: 0, bands: [] });
    const p3 = createPreset({ name: 'Moondrop Blessing 2 (Crinacle)', global: 0, bands: [] });
    const p4 = createPreset({ name: 'Truthear Hexa (Super Review)', global: 0, bands: [] });
    const p5 = createPreset({ name: 'KZ ZSN Pro', global: 0, bands: [] });

    expect(extractBrandFromPreset(p1)).toBe('Lafitear');
    expect(extractBrandFromPreset(p2)).toBe('Lafitear');
    expect(extractBrandFromPreset(p3)).toBe('Moondrop');
    expect(extractBrandFromPreset(p4)).toBe('Truthear');
    expect(extractBrandFromPreset(p5)).toBe('KZ');
  });

  it('groups presets and sorts brand lists with Flat first', () => {
    const presets = [
      createPreset({ id: 'preset-default-flat', name: 'Flat', isDefault: true, global: 0, bands: [] }),
      createPreset({ name: 'Moondrop Chu', global: 0, bands: [] }),
      createPreset({ name: 'Lafitear LM1', global: 0, bands: [] }),
      createPreset({ name: '64 Audio U12t', global: 0, bands: [] }),
      createPreset({ name: 'Lafitear LM2', global: 0, bands: [] }),
    ];

    const grouped = groupPresetsByBrand(presets);
    expect(grouped.get(FOLDER_FLAT)?.length).toBe(1);
    expect(grouped.get('Lafitear')?.length).toBe(2);
    expect(grouped.get('Moondrop')?.length).toBe(1);
    expect(grouped.get('64 Audio')?.length).toBe(1);

    const sortedBrands = getSortedBrandList(presets);
    expect(sortedBrands[0]).toBe(FOLDER_FLAT);
    // Alphabetical order for the rest
    expect(sortedBrands).toEqual([FOLDER_FLAT, '64 Audio', 'Lafitear', 'Moondrop']);
  });
});
