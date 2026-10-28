import { describe, it, expect } from 'vitest';
import { parsePEQ } from '../../src/peq/peq-parser.js';
import { FilterType } from '../../src/models/filter-type.js';
import { AudioChannel } from '../../src/models/audio-channel.js';
import { PEQParseError } from '../../src/common/errors.js';

describe('Equalizer APO / REW PEQ Parser', () => {
  it('parses standard multi-band Equalizer APO configuration', () => {
    const config = `
# EqualizerAPO Configuration
Preamp: -4.5 dB
Filter 1: ON PK Fc 32 Hz Gain 2.5 dB Q 1.41
Filter 2: ON LS Fc 100 Hz Gain 4.0 dB Q 0.71
Filter 3: OFF PK Fc 1000 Hz Gain -3.0 dB Q 2.0
Filter 4: ON NO Fc 60 Hz Q 10.0
Filter 5: ON HS Fc 10000 Hz Gain 1.5 dB BW Oct 1.2
    `;

    const presets = parsePEQ(config);
    expect(presets).toHaveLength(1);
    const preset = presets[0]!;

    expect(preset.global).toBe(-4.5);
    expect(preset.bands).toHaveLength(5);

    // Band 1: 32 Hz PK
    expect(preset.bands[0]?.type).toBe(FilterType.PARAMETRIC);
    expect(preset.bands[0]?.frequency).toBe(32);
    expect(preset.bands[0]?.gain).toBe(2.5);
    expect(preset.bands[0]?.bypass).toBe(false);

    // Band 2: 60 Hz Notch / NO (gain defaults to -128 dB)
    expect(preset.bands[1]?.type).toBe(FilterType.BAND_STOP);
    expect(preset.bands[1]?.frequency).toBe(60);
    expect(preset.bands[1]?.gain).toBe(-128);

    // Band 3: 100 Hz LS
    expect(preset.bands[2]?.type).toBe(FilterType.RESONANT_LOW_SHELF);
    expect(preset.bands[2]?.frequency).toBe(100);
    expect(preset.bands[2]?.gain).toBe(4.0);

    // Band 4: 1000 Hz Bypassed PK
    expect(preset.bands[3]?.bypass).toBe(true);
    expect(preset.bands[3]?.gain).toBe(-3.0);

    // Band 5: 10000 Hz HS with BW Oct
    expect(preset.bands[4]?.type).toBe(FilterType.RESONANT_HIGH_SHELF);
    expect(preset.bands[4]?.bandwidth).toBeCloseTo(1.2, 2);
  });

  it('parses channel assignments for Left and Right channels', () => {
    const config = `
Preamp: 0 dB
Channel: L
Filter 1: ON PK Fc 250 Hz Gain 3.0 dB Q 1.41
Channel: R
Filter 2: ON PK Fc 250 Hz Gain -3.0 dB Q 1.41
Channel: ALL
Filter 3: ON PK Fc 5000 Hz Gain 1.0 dB Q 1.41
    `;

    const presets = parsePEQ(config);
    expect(presets).toHaveLength(1);
    const bands = presets[0]!.bands;

    expect(bands[0]?.channels).toEqual([AudioChannel.LEFT]);
    expect(bands[1]?.channels).toEqual([AudioChannel.RIGHT]);
    expect(bands[2]?.channels).toBeUndefined(); // ALL -> undefined
  });

  it('parses multi-preset file split by Device or Name headers', () => {
    const config = `
Device: Headphone Preset A
Preamp: -2.0 dB
Filter 1: ON PK Fc 100 Hz Gain 3.0 dB Q 1.0

Device: Headphone Preset B
Preamp: -1.0 dB
Filter 1: ON PK Fc 200 Hz Gain -2.0 dB Q 1.5
    `;

    const presets = parsePEQ(config);
    expect(presets).toHaveLength(2);
    expect(presets[0]?.name).toBe('Headphone Preset A');
    expect(presets[0]?.global).toBe(-2.0);
    expect(presets[1]?.name).toBe('Headphone Preset B');
    expect(presets[1]?.global).toBe(-1.0);
  });

  it('throws PEQParseError with 1-based line number for invalid frequency', () => {
    const config = `
Preamp: 0 dB
Filter 1: ON PK Fc 999999 Hz Gain 0 dB Q 1.0
    `;

    try {
      parsePEQ(config);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(PEQParseError);
      const peqErr = err as PEQParseError;
      expect(peqErr.lineNumber).toBe(3);
      expect(peqErr.code).toBe('out-of-range');
    }
  });

  it('throws PEQParseError for unknown filter type', () => {
    const config = `
Preamp: 0 dB
Filter 1: ON UNKNOWN_FILTER Fc 1000 Hz Gain 0 dB Q 1.0
    `;

    try {
      parsePEQ(config);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(PEQParseError);
      const peqErr = err as PEQParseError;
      expect(peqErr.code).toBe('unknown-filter-type');
    }
  });

  it('throws PEQParseError for invalid filter syntax', () => {
    const config = `
Preamp: 0 dB
Filter is totally malformed
    `;

    expect(() => parsePEQ(config)).toThrow(PEQParseError);
  });
});
