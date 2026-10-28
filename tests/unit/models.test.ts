import { describe, it, expect } from 'vitest';
import {
  createPresetBand,
  copyPresetBand,
  validatePresetBand,
} from '../../src/models/preset-band.js';
import {
  createPreset,
  addPresetBand,
  updatePresetBand,
  removePresetBand,
  validatePreset,
} from '../../src/models/preset.js';
import { FilterType } from '../../src/models/filter-type.js';
import { AudioChannel } from '../../src/models/audio-channel.js';

describe('ExpertEqualizer Models & Immutability', () => {
  describe('ExpertEqualizerPresetBand', () => {
    it('creates a valid frozen preset band with defaults', () => {
      const band = createPresetBand({
        frequency: 1000,
        gain: 3.5,
        bandwidth: 1.0,
        type: FilterType.PARAMETRIC,
      });

      expect(band.frequency).toBe(1000);
      expect(band.gain).toBe(3.5);
      expect(band.bandwidth).toBe(1.0);
      expect(band.type).toBe(FilterType.PARAMETRIC);
      expect(band.bypass).toBe(false);
      expect(band.channels).toBeUndefined();
      expect(Object.isFrozen(band)).toBe(true);
    });

    it('rejects out-of-range frequency', () => {
      expect(() =>
        createPresetBand({
          frequency: 5, // Below 10 Hz
          gain: 0,
          bandwidth: 1.0,
          type: FilterType.PARAMETRIC,
        })
      ).toThrow();

      expect(() =>
        createPresetBand({
          frequency: 25000, // Above 24 kHz
          gain: 0,
          bandwidth: 1.0,
          type: FilterType.PARAMETRIC,
        })
      ).toThrow();
    });

    it('rejects out-of-range gain', () => {
      expect(() =>
        createPresetBand({
          frequency: 1000,
          gain: 30, // Above +24 dB
          bandwidth: 1.0,
          type: FilterType.PARAMETRIC,
        })
      ).toThrow();
    });

    it('rejects out-of-range bandwidth', () => {
      expect(() =>
        createPresetBand({
          frequency: 1000,
          gain: 0,
          bandwidth: 6.0, // Above 5.0 octaves
          type: FilterType.PARAMETRIC,
        })
      ).toThrow();
    });

    it('creates an immutable copy with copyPresetBand', () => {
      const original = createPresetBand({
        frequency: 500,
        gain: -2.0,
        bandwidth: 0.8,
        type: FilterType.PARAMETRIC,
        channels: [AudioChannel.LEFT],
      });

      const updated = copyPresetBand(original, { gain: 4.0 });

      expect(updated.gain).toBe(4.0);
      expect(original.gain).toBe(-2.0); // Immutability preserved
      expect(updated.frequency).toBe(500);
      expect(updated.channels).toEqual([AudioChannel.LEFT]);
      expect(Object.isFrozen(updated)).toBe(true);
    });
  });

  describe('ExpertEqualizerPreset', () => {
    it('creates a valid frozen preset', () => {
      const band1 = createPresetBand({
        frequency: 100,
        gain: 2.0,
        bandwidth: 1.0,
        type: FilterType.RESONANT_LOW_SHELF,
      });

      const preset = createPreset({
        name: 'Bass Boost',
        global: -2.0,
        bands: [band1],
      });

      expect(preset.name).toBe('Bass Boost');
      expect(preset.global).toBe(-2.0);
      expect(preset.bands).toHaveLength(1);
      expect(preset.isDefault).toBe(false);
      expect(Object.isFrozen(preset)).toBe(true);
      expect(Object.isFrozen(preset.bands)).toBe(true);
    });

    it('adds, updates, and removes bands without mutating original preset', () => {
      const initial = createPreset({
        name: 'Acoustic',
        global: 0,
        bands: [],
      });

      const bandA = createPresetBand({
        id: 'band-1',
        frequency: 200,
        gain: 1.5,
        bandwidth: 1.0,
        type: FilterType.PARAMETRIC,
      });

      const withBand = addPresetBand(initial, bandA);
      expect(initial.bands).toHaveLength(0);
      expect(withBand.bands).toHaveLength(1);

      const updated = updatePresetBand(withBand, 'band-1', { gain: 3.0 });
      expect(withBand.bands[0]?.gain).toBe(1.5);
      expect(updated.bands[0]?.gain).toBe(3.0);

      const removed = removePresetBand(updated, 'band-1');
      expect(updated.bands).toHaveLength(1);
      expect(removed.bands).toHaveLength(0);
    });

    it('validates schema using validatePreset', () => {
      const valid = validatePreset({
        id: 'p-1',
        name: 'Rock',
        global: 0,
        bands: [],
      });
      expect(valid.name).toBe('Rock');

      expect(() =>
        validatePreset({
          name: '', // Empty name invalid
          global: 100, // Gain invalid
          bands: [],
        })
      ).toThrow();
    });
  });
});
