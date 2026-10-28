import { describe, it, expect } from 'vitest';
import {
  calculateBiquadCoefficients,
  calculateSoloIsolationCoefficients,
  frequencyResponseMagnitude,
} from '../../src/dsp/biquad-coefficients.js';
import { FilterType } from '../../src/models/filter-type.js';
import { isClose } from '../../src/common/math.js';

describe('Biquad Coefficients (Audio EQ Cookbook)', () => {
  const sampleRate = 44100;

  it('calculates Peaking EQ coefficients accurately matching center frequency gain', () => {
    const coeffs = calculateBiquadCoefficients(
      {
        frequency: 1000,
        gain: 6.0, // +6 dB boost
        bandwidth: 1.0,
        type: FilterType.PARAMETRIC,
      },
      sampleRate
    );

    // At center frequency (1000 Hz), gain should be ~6 dB (factor of ~2.0)
    const magAtCenter = frequencyResponseMagnitude(coeffs, 1000, sampleRate);
    expect(isClose(magAtCenter, 10 ** (6.0 / 20), 0.05)).toBe(true);

    // At frequencies far from center (e.g. 50 Hz, 18000 Hz), gain should be ~0 dB (factor of ~1.0)
    const magLow = frequencyResponseMagnitude(coeffs, 50, sampleRate);
    const magHigh = frequencyResponseMagnitude(coeffs, 18000, sampleRate);
    expect(isClose(magLow, 1.0, 0.05)).toBe(true);
    expect(isClose(magHigh, 1.0, 0.05)).toBe(true);
  });

  it('calculates Notch (Band Stop) filter with deep attenuation at center frequency', () => {
    const coeffs = calculateBiquadCoefficients(
      {
        frequency: 1000,
        gain: 0,
        bandwidth: 0.5,
        type: FilterType.BAND_STOP,
      },
      sampleRate
    );

    const magAtCenter = frequencyResponseMagnitude(coeffs, 1000, sampleRate);
    expect(magAtCenter).toBeLessThan(0.01); // Attenuation > 40 dB

    const magLow = frequencyResponseMagnitude(coeffs, 100, sampleRate);
    const magHigh = frequencyResponseMagnitude(coeffs, 10000, sampleRate);
    expect(isClose(magLow, 1.0, 0.05)).toBe(true);
    expect(isClose(magHigh, 1.0, 0.05)).toBe(true);
  });

  it('calculates Resonant Low Shelf filter accurately', () => {
    const coeffs = calculateBiquadCoefficients(
      {
        frequency: 200,
        gain: 8.0, // +8 dB
        bandwidth: 1.0,
        type: FilterType.RESONANT_LOW_SHELF,
      },
      sampleRate
    );

    // Well below 200 Hz (e.g. 30 Hz), gain should be ~8 dB
    const magLow = frequencyResponseMagnitude(coeffs, 30, sampleRate);
    expect(isClose(magLow, 10 ** (8.0 / 20), 0.1)).toBe(true);

    // Well above 200 Hz (e.g. 5000 Hz), gain should be ~0 dB
    const magHigh = frequencyResponseMagnitude(coeffs, 5000, sampleRate);
    expect(isClose(magHigh, 1.0, 0.05)).toBe(true);
  });

  it('calculates Resonant High Shelf filter accurately', () => {
    const coeffs = calculateBiquadCoefficients(
      {
        frequency: 4000,
        gain: -6.0, // -6 dB cut
        bandwidth: 1.0,
        type: FilterType.RESONANT_HIGH_SHELF,
      },
      sampleRate
    );

    // Well below 4000 Hz (e.g. 100 Hz), gain should be ~0 dB
    const magLow = frequencyResponseMagnitude(coeffs, 100, sampleRate);
    expect(isClose(magLow, 1.0, 0.05)).toBe(true);

    // Well above 4000 Hz (e.g. 12000 Hz), gain should be ~ -6 dB (factor of ~0.501)
    const magHigh = frequencyResponseMagnitude(coeffs, 12000, sampleRate);
    expect(isClose(magHigh, 10 ** (-6.0 / 20), 0.1)).toBe(true);
  });

  it('handles frequencies near Nyquist gracefully without NaN', () => {
    const coeffs = calculateBiquadCoefficients(
      {
        frequency: 22000, // Near 22050 Hz Nyquist
        gain: 3.0,
        bandwidth: 1.0,
        type: FilterType.PARAMETRIC,
      },
      sampleRate
    );

    expect(Number.isFinite(coeffs.b0)).toBe(true);
    expect(Number.isFinite(coeffs.b1)).toBe(true);
    expect(Number.isFinite(coeffs.b2)).toBe(true);
    expect(Number.isFinite(coeffs.a1)).toBe(true);
    expect(Number.isFinite(coeffs.a2)).toBe(true);
  });

  it('calculates Solo Band isolation coefficients (bandpass, lowpass, highpass)', () => {
    const bpCoeffs = calculateSoloIsolationCoefficients(
      {
        frequency: 1000,
        gain: 6.0,
        bandwidth: 1.0,
        type: FilterType.PARAMETRIC,
      },
      sampleRate
    );
    // Bandpass has unity (1.0) peak at center frequency and deep attenuation at extremes
    expect(isClose(frequencyResponseMagnitude(bpCoeffs, 1000, sampleRate), 1.0, 0.05)).toBe(true);
    expect(frequencyResponseMagnitude(bpCoeffs, 50, sampleRate)).toBeLessThan(0.15);
    expect(frequencyResponseMagnitude(bpCoeffs, 15000, sampleRate)).toBeLessThan(0.15);

    const lpCoeffs = calculateSoloIsolationCoefficients(
      {
        frequency: 300,
        gain: 4.0,
        bandwidth: 1.0,
        type: FilterType.RESONANT_LOW_SHELF,
      },
      sampleRate
    );
    expect(frequencyResponseMagnitude(lpCoeffs, 40, sampleRate)).toBeGreaterThan(0.85);
    expect(frequencyResponseMagnitude(lpCoeffs, 8000, sampleRate)).toBeLessThan(0.05);

    const hpCoeffs = calculateSoloIsolationCoefficients(
      {
        frequency: 4000,
        gain: 4.0,
        bandwidth: 1.0,
        type: FilterType.RESONANT_HIGH_SHELF,
      },
      sampleRate
    );
    expect(frequencyResponseMagnitude(hpCoeffs, 100, sampleRate)).toBeLessThan(0.05);
    expect(frequencyResponseMagnitude(hpCoeffs, 16000, sampleRate)).toBeGreaterThan(0.85);
  });
});
