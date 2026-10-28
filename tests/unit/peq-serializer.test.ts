import { describe, it, expect } from 'vitest';
import { serializePEQ } from '../../src/peq/peq-serializer.js';
import { parsePEQ } from '../../src/peq/peq-parser.js';
import { createPreset } from '../../src/models/preset.js';
import { createPresetBand } from '../../src/models/preset-band.js';
import { FilterType } from '../../src/models/filter-type.js';
import { AudioChannel } from '../../src/models/audio-channel.js';

describe('Equalizer APO / REW PEQ Serializer', () => {
  it('serializes a preset into Equalizer APO format', () => {
    const band1 = createPresetBand({
      frequency: 100,
      gain: 3.5,
      bandwidth: 1.0,
      type: FilterType.RESONANT_LOW_SHELF,
    });
    const band2 = createPresetBand({
      frequency: 1000,
      gain: -2.0,
      bandwidth: 0.8,
      type: FilterType.PARAMETRIC,
      bypass: true,
    });

    const preset = createPreset({
      name: 'Custom Profile',
      global: -3.5,
      bands: [band1, band2],
    });

    const text = serializePEQ(preset);

    expect(text).toContain('Name: Custom Profile');
    expect(text).toContain('Preamp: -3.50 dB');
    expect(text).toContain('Filter 1: ON  LS  Fc 100 Hz  Gain 3.50 dB');
    expect(text).toContain('Filter 2: OFF  PK  Fc 1000 Hz  Gain -2.00 dB');
  });

  it('separates stereo and per-channel filters under Channel: L and Channel: R sections', () => {
    const stereoBand = createPresetBand({
      frequency: 80,
      gain: 2.0,
      bandwidth: 1.0,
      type: FilterType.PARAMETRIC,
    });
    const leftBand = createPresetBand({
      frequency: 500,
      gain: 1.5,
      bandwidth: 1.0,
      type: FilterType.PARAMETRIC,
      channels: [AudioChannel.LEFT],
    });
    const rightBand = createPresetBand({
      frequency: 500,
      gain: -1.5,
      bandwidth: 1.0,
      type: FilterType.PARAMETRIC,
      channels: [AudioChannel.RIGHT],
    });

    const preset = createPreset({
      name: 'Binaural EQ',
      global: 0,
      bands: [stereoBand, leftBand, rightBand],
    });

    const text = serializePEQ(preset);

    expect(text).toContain('Filter 1: ON  PK  Fc 80 Hz');
    expect(text).toContain('Channel: L');
    expect(text).toContain('Channel: R');
  });

  it('preserves round-trip fidelity (Preset -> PEQ String -> Parsed Preset)', () => {
    const original = createPreset({
      name: 'Roundtrip Test',
      global: -2.0,
      bands: [
        createPresetBand({
          frequency: 60,
          gain: 4.0,
          bandwidth: 1.0,
          type: FilterType.RESONANT_LOW_SHELF,
        }),
        createPresetBand({
          frequency: 1000,
          gain: -128,
          bandwidth: 0.5,
          type: FilterType.BAND_STOP,
        }),
        createPresetBand({
          frequency: 8000,
          gain: 2.5,
          bandwidth: 1.2,
          type: FilterType.RESONANT_HIGH_SHELF,
        }),
      ],
    });

    const peqText = serializePEQ(original);
    const parsed = parsePEQ(peqText)[0]!;

    expect(parsed.name).toBe(original.name);
    expect(parsed.global).toBe(original.global);
    expect(parsed.bands).toHaveLength(original.bands.length);

    expect(parsed.bands[0]?.frequency).toBe(original.bands[0]?.frequency);
    expect(parsed.bands[0]?.gain).toBe(original.bands[0]?.gain);
    expect(parsed.bands[0]?.type).toBe(original.bands[0]?.type);

    expect(parsed.bands[1]?.type).toBe(FilterType.BAND_STOP);
    expect(parsed.bands[1]?.frequency).toBe(1000);
  });

  it('preserves fractional frequencies such as 31.5 Hz', () => {
    const preset = createPreset({
      name: 'Sub-bass test',
      global: 0,
      bands: [
        createPresetBand({
          frequency: 31.5,
          gain: 3.0,
          bandwidth: 1.0,
          type: FilterType.PARAMETRIC,
        }),
      ],
    });

    const peqText = serializePEQ(preset);
    expect(peqText).toContain('Fc 31.5 Hz');
    const parsed = parsePEQ(peqText)[0]!;
    expect(parsed.bands[0]?.frequency).toBe(31.5);
  });
});
