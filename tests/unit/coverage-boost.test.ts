import { describe, it, expect } from 'vitest';
import {
  clamp,
  roundToDecimals,
  linearToDb,
  dbToLinear,
  isClose,
} from '../../src/common/math.js';
import { AudioDSPError, ValidationError, PresetNotFoundError } from '../../src/common/errors.js';
import {
  AudioChannel,
  audioChannelToName,
  parseAudioChannel,
} from '../../src/models/audio-channel.js';
import {
  FilterType,
  filterTypeToPEQToken,
  peqTokenToFilterType,
} from '../../src/models/filter-type.js';
import { BWtoQ, QtoBW, BandwidthUnit } from '../../src/models/bandwidth-unit.js';
import { processBiquadSample } from '../../src/dsp/biquad-filter.js';
import { calculateBiquadCoefficients } from '../../src/dsp/biquad-coefficients.js';
import { DataBusEventEmitter } from '../../src/databus/databus-event-emitter.js';
import { DataBusRouter } from '../../src/databus/databus-router.js';
import { PresetRepository } from '../../src/repository/preset-repository.js';
import { ExpertEqualizerController } from '../../src/databus/expert-equalizer-controller.js';
import { parsePEQ } from '../../src/peq/peq-parser.js';
import { serializePEQ } from '../../src/peq/peq-serializer.js';
import { createPreset } from '../../src/models/preset.js';
import { createPresetBand } from '../../src/models/preset-band.js';
import { REST_ROUTES } from '../../src/common/constants.js';

describe('Coverage & Edge Cases Boost', () => {
  it('covers math utility functions thoroughly', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
    expect(clamp(NaN, 0, 10)).toBe(0);

    expect(roundToDecimals(1.23456, 2)).toBe(1.23);
    expect(roundToDecimals(1.235, 2)).toBe(1.24);

    expect(linearToDb(1.0)).toBe(0);
    expect(linearToDb(0)).toBe(-128.0);
    expect(linearToDb(-1.0)).toBe(-128.0);
    expect(dbToLinear(0)).toBe(1.0);

    expect(isClose(1.0, 1.00001, 1e-4)).toBe(true);
    expect(isClose(1.0, 1.1, 1e-4)).toBe(false);
  });

  it('covers AudioChannel and FilterType edge cases', () => {
    expect(audioChannelToName(AudioChannel.LEFT)).toBe('L');
    expect(audioChannelToName(AudioChannel.RIGHT)).toBe('R');
    expect(audioChannelToName(999 as never)).toBe('L');

    expect(parseAudioChannel('L')).toBe(AudioChannel.LEFT);
    expect(parseAudioChannel('LEFT')).toBe(AudioChannel.LEFT);
    expect(parseAudioChannel('1')).toBe(AudioChannel.LEFT);
    expect(parseAudioChannel('R')).toBe(AudioChannel.RIGHT);
    expect(parseAudioChannel('RIGHT')).toBe(AudioChannel.RIGHT);
    expect(parseAudioChannel('2')).toBe(AudioChannel.RIGHT);
    expect(parseAudioChannel('INVALID')).toBeNull();

    expect(filterTypeToPEQToken(FilterType.PARAMETRIC)).toBe('PK');
    expect(filterTypeToPEQToken(FilterType.BAND_STOP)).toBe('NO');
    expect(filterTypeToPEQToken(FilterType.RESONANT_LOW_SHELF)).toBe('LS');
    expect(filterTypeToPEQToken(FilterType.RESONANT_HIGH_SHELF)).toBe('HS');
    expect(filterTypeToPEQToken(999 as never)).toBe('PK');

    expect(peqTokenToFilterType('Modal')).toBe(FilterType.PARAMETRIC);
    expect(peqTokenToFilterType('NOTCH')).toBe(FilterType.BAND_STOP);
    expect(peqTokenToFilterType('HSC')).toBe(FilterType.RESONANT_HIGH_SHELF);
    expect(peqTokenToFilterType('LSC')).toBe(FilterType.RESONANT_LOW_SHELF);
    expect(peqTokenToFilterType('UNKNOWN')).toBeNull();
  });

  it('covers Bandwidth boundary checks (zero/negative)', () => {
    expect(BWtoQ(0)).toBe(100.0);
    expect(BWtoQ(-1)).toBe(100.0);
    expect(QtoBW(0)).toBe(5.0);
    expect(QtoBW(-1)).toBe(5.0);
  });

  it('covers processBiquadSample step-by-step', () => {
    const coeffs = calculateBiquadCoefficients(
      {
        frequency: 1000,
        gain: 3.0,
        bandwidth: 1.0,
        type: FilterType.PARAMETRIC,
      },
      44100
    );

    const s0 = { d1: 0, d2: 0 };
    const step1 = processBiquadSample(s0, coeffs, 1.0);
    expect(Number.isFinite(step1.y)).toBe(true);

    const step2 = processBiquadSample(step1.nextState, coeffs, 0.0);
    expect(Number.isFinite(step2.y)).toBe(true);
  });

  it('covers DataBusEventEmitter off and error protection', () => {
    const emitter = new DataBusEventEmitter();
    let count = 0;
    const fn = () => {
      count++;
    };

    emitter.on('ch', fn);
    emitter.emit('ch', 'msg');
    expect(count).toBe(1);

    emitter.off('ch', fn);
    emitter.emit('ch', 'msg');
    expect(count).toBe(1);

    // Emitter exception handling
    let caughtError: unknown = null;
    emitter.on('error', (err) => {
      caughtError = err;
    });

    const throwingFn = () => {
      throw new Error('Boom');
    };
    emitter.on('err', throwingFn);
    expect(() => emitter.emit('err', null)).not.toThrow();
    expect(caughtError).toBeInstanceOf(Error);
    expect((caughtError as Error).message).toBe('Boom');

    emitter.clear();
  });

  it('covers DataBusRouter PUT method and exception dispatching', async () => {
    const router = new DataBusRouter();
    router.put('/test-put', () => ({
      status: 200,
      body: { success: true },
    }));

    const res = await router.dispatch({ method: 'PUT', path: '/test-put' });
    expect(res.status).toBe(200);

    // Throwing handler
    router.get('/throws', () => {
      throw new Error('Router crash');
    });
    const errRes = await router.dispatch({ method: 'GET', path: '/throws' });
    expect(errRes.status).toBe(500);
    expect(errRes.body.error).toBe('Router crash');
  });

  it('covers PresetRepository update and delete error paths', async () => {
    const repo = new PresetRepository();
    await expect(repo.update('non-existent', { name: 'X' })).rejects.toThrow(PresetNotFoundError);
    await expect(repo.delete('non-existent')).rejects.toThrow(PresetNotFoundError);
  });

  it('covers DataBusController update existing preset, select error, delete missing', async () => {
    const repo = new PresetRepository();
    const controller = new ExpertEqualizerController(repo);

    // Update preset via POST /presets with an existing id
    const created = await repo.create({ name: 'Initial', global: 0, bands: [] });
    const updateRes = await controller.handleRequest({
      method: 'POST',
      path: REST_ROUTES.PRESETS,
      body: { id: created.id, name: 'Renamed' },
    });
    expect(updateRes.status).toBe(201);
    expect(updateRes.body.data).toHaveProperty('name', 'Renamed');

    // Missing id on POST /presets/select
    const missingIdSelect = await controller.handleRequest({
      method: 'POST',
      path: REST_ROUTES.SELECT_PRESET,
      body: {},
    });
    expect(missingIdSelect.status).toBe(400);

    // Missing id on DELETE /presets
    const missingIdDelete = await controller.handleRequest({
      method: 'DELETE',
      path: REST_ROUTES.PRESETS,
      body: {},
    });
    expect(missingIdDelete.status).toBe(400);

    // Delete default preset error via controller
    const all = await repo.findAll();
    const defaultPreset = all.find((p) => p.isDefault)!;
    const deleteDefault = await controller.handleRequest({
      method: 'DELETE',
      path: REST_ROUTES.PRESETS,
      body: { id: defaultPreset.id },
    });
    expect(deleteDefault.status).toBe(400);

    // Import missing peq payload
    const importNoBody = await controller.handleRequest({
      method: 'POST',
      path: REST_ROUTES.IMPORT_PRESETS,
      body: {},
    });
    expect(importNoBody.status).toBe(400);

    // Filter list when showDefaultPresets is false
    await controller.handleRequest({
      method: 'POST',
      path: REST_ROUTES.SHOW_DEFAULT_PRESETS,
      body: { show: false },
    });
    const filteredList = await controller.handleRequest({
      method: 'GET',
      path: REST_ROUTES.PRESETS,
    });
    expect((filteredList.body.data as unknown[]).every((p: any) => !p.isDefault)).toBe(true);
  });

  it('covers PEQ serialization with OCTAVES unit and showBandwidth false', () => {
    const preset = createPreset({
      name: 'Octave Test',
      global: 0,
      bands: [
        createPresetBand({
          frequency: 1000,
          gain: 3.0,
          bandwidth: 1.0,
          type: FilterType.PARAMETRIC,
        }),
      ],
    });

    const octText = serializePEQ(preset, {
      bandwidthUnit: BandwidthUnit.OCTAVES,
      showBandwidth: true,
    });
    expect(octText).toContain('BW Oct 1.000');

    const noBwText = serializePEQ(preset, {
      showBandwidth: false,
    });
    expect(noBwText).not.toContain('Q');
    expect(noBwText).not.toContain('BW Oct');
  });

  it('covers PEQ parser error cases and custom domain errors', () => {
    try {
      parsePEQ('Preamp: not-a-number dB');
      expect.unreachable();
    } catch (e: any) {
      expect(e.code).toBe('invalid-number');
    }

    try {
      parsePEQ('Preamp: 50 dB');
      expect.unreachable();
    } catch (e: any) {
      expect(e.code).toBe('out-of-range');
    }

    try {
      parsePEQ('Channel: INVALID_CHAN');
      expect.unreachable();
    } catch (e: any) {
      expect(e.code).toBe('unknown-channel');
    }

    try {
      parsePEQ('Filter 1: ON PK Fc not-a-number Hz Gain 0 dB Q 1.0');
      expect.unreachable();
    } catch (e: any) {
      expect(e.code).toBe('invalid-number');
    }

    try {
      parsePEQ('Filter 1: ON PK Fc 1000 Hz Gain not-a-number dB Q 1.0');
      expect.unreachable();
    } catch (e: any) {
      expect(e.code).toBe('invalid-number');
    }

    try {
      parsePEQ('Filter 1: ON PK Fc 1000 Hz Gain 0 dB Q invalid-bw');
      expect.unreachable();
    } catch (e: any) {
      expect(e.code).toBe('invalid-bandwidth');
    }

    try {
      parsePEQ('Filter 1: ON PK Fc 1000 Hz Gain 0 dB Q 100.0');
      expect.unreachable();
    } catch (e: any) {
      expect(e.code).toBe('bandwidth-out-of-range');
    }

    try {
      parsePEQ('Preamp line is bad');
      expect.unreachable();
    } catch (e: any) {
      expect(e.code).toBe('invalid-preamp-syntax');
    }

    const dspErr = new AudioDSPError('Audio test error');
    expect(dspErr.name).toBe('AudioDSPError');
  });
});
