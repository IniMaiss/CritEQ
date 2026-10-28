/**
 * Audio EQ Cookbook Biquad Coefficient Calculations.
 * Formulas by Robert Bristow-Johnson.
 */

import { FilterType } from '../models/filter-type.js';
import { BWtoQ } from '../models/bandwidth-unit.js';
import { NYQUIST_HEADROOM_HZ } from '../common/constants.js';

export interface BiquadCoefficients {
  readonly b0: number;
  readonly b1: number;
  readonly b2: number;
  readonly a1: number;
  readonly a2: number;
}

export interface BiquadParams {
  readonly frequency: number;
  readonly gain: number;
  readonly bandwidth: number;
  readonly type: FilterType;
}

export function calculateBiquadCoefficients(
  params: BiquadParams,
  sampleRate: number
): Readonly<BiquadCoefficients> {
  // Guard against Nyquist edge
  const nyquist = sampleRate / 2;
  const clampedFreq = Math.min(Math.max(params.frequency, 1.0), nyquist - NYQUIST_HEADROOM_HZ);

  const omega = (2 * Math.PI * clampedFreq) / sampleRate;
  const cosOmega = Math.cos(omega);
  const sinOmega = Math.sin(omega);

  const q = BWtoQ(params.bandwidth);
  const alpha = sinOmega / (2 * Math.max(q, 0.0001));
  const A = 10 ** (params.gain / 40); // sqrt(10^(gain/20))

  let b0 = 1;
  let b1 = 0;
  let b2 = 0;
  let a0 = 1;
  let a1 = 0;
  let a2 = 0;

  switch (params.type) {
    case FilterType.PARAMETRIC: {
      b0 = 1 + alpha * A;
      b1 = -2 * cosOmega;
      b2 = 1 - alpha * A;
      a0 = 1 + alpha / A;
      a1 = -2 * cosOmega;
      a2 = 1 - alpha / A;
      break;
    }

    case FilterType.BAND_STOP: {
      b0 = 1;
      b1 = -2 * cosOmega;
      b2 = 1;
      a0 = 1 + alpha;
      a1 = -2 * cosOmega;
      a2 = 1 - alpha;
      break;
    }

    case FilterType.RESONANT_LOW_SHELF: {
      const sqrtA = Math.sqrt(A);
      const beta = 2 * sqrtA * alpha;

      b0 = A * (A + 1 - (A - 1) * cosOmega + beta);
      b1 = 2 * A * (A - 1 - (A + 1) * cosOmega);
      b2 = A * (A + 1 - (A - 1) * cosOmega - beta);
      a0 = A + 1 + (A - 1) * cosOmega + beta;
      a1 = -2 * (A - 1 + (A + 1) * cosOmega);
      a2 = A + 1 + (A - 1) * cosOmega - beta;
      break;
    }

    case FilterType.RESONANT_HIGH_SHELF: {
      const sqrtA = Math.sqrt(A);
      const beta = 2 * sqrtA * alpha;

      b0 = A * (A + 1 + (A - 1) * cosOmega + beta);
      b1 = -2 * A * (A - 1 + (A + 1) * cosOmega);
      b2 = A * (A + 1 + (A - 1) * cosOmega - beta);
      a0 = A + 1 - (A - 1) * cosOmega + beta;
      a1 = 2 * (A - 1 - (A + 1) * cosOmega);
      a2 = A + 1 - (A - 1) * cosOmega - beta;
      break;
    }
  }

  // Normalize by a0
  const invA0 = 1 / (a0 !== 0 ? a0 : 1.0);
  return Object.freeze({
    b0: b0 * invA0,
    b1: b1 * invA0,
    b2: b2 * invA0,
    a1: a1 * invA0,
    a2: a2 * invA0,
  });
}

/**
 * Calculates Solo Band isolation biquad coefficients (Audio EQ Cookbook).
 * Isolates only the frequency region of the target band:
 * - Parametric / Band-Stop -> Constant 0 dB peak Band-Pass filter centered at Fc with Q
 * - Resonant Low Shelf -> Low-Pass filter at Fc with Q
 * - Resonant High Shelf -> High-Pass filter at Fc with Q
 */
export function calculateSoloIsolationCoefficients(
  params: BiquadParams,
  sampleRate: number
): Readonly<BiquadCoefficients> {
  const nyquist = sampleRate / 2;
  const clampedFreq = Math.min(Math.max(params.frequency, 1.0), nyquist - NYQUIST_HEADROOM_HZ);

  const omega = (2 * Math.PI * clampedFreq) / sampleRate;
  const cosOmega = Math.cos(omega);
  const sinOmega = Math.sin(omega);

  const q = BWtoQ(params.bandwidth);
  const alpha = sinOmega / (2 * Math.max(q, 0.0001));

  let b0 = 1;
  let b1 = 0;
  let b2 = 0;
  const a0 = 1 + alpha;
  const a1 = -2 * cosOmega;
  const a2 = 1 - alpha;

  switch (params.type) {
    case FilterType.RESONANT_LOW_SHELF: {
      b0 = (1 - cosOmega) / 2;
      b1 = 1 - cosOmega;
      b2 = (1 - cosOmega) / 2;
      break;
    }
    case FilterType.RESONANT_HIGH_SHELF: {
      b0 = (1 + cosOmega) / 2;
      b1 = -(1 + cosOmega);
      b2 = (1 + cosOmega) / 2;
      break;
    }
    case FilterType.PARAMETRIC:
    case FilterType.BAND_STOP:
    default: {
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
      break;
    }
  }

  const invA0 = 1 / (a0 !== 0 ? a0 : 1.0);
  return Object.freeze({
    b0: b0 * invA0,
    b1: b1 * invA0,
    b2: b2 * invA0,
    a1: a1 * invA0,
    a2: a2 * invA0,
  });
}

/**
 * Calculates the complex frequency response magnitude |H(e^(jw))| at frequency f.
 */
export function frequencyResponseMagnitude(
  coeffs: BiquadCoefficients,
  frequency: number,
  sampleRate: number
): number {
  const omega = (2 * Math.PI * frequency) / sampleRate;
  const cos1 = Math.cos(omega);
  const sin1 = Math.sin(omega);
  const cos2 = Math.cos(2 * omega);
  const sin2 = Math.sin(2 * omega);

  // Numerator: b0 + b1*e^(-jw) + b2*e^(-2jw)
  const numReal = coeffs.b0 + coeffs.b1 * cos1 + coeffs.b2 * cos2;
  const numImag = -(coeffs.b1 * sin1 + coeffs.b2 * sin2);

  // Denominator: 1 + a1*e^(-jw) + a2*e^(-2jw)
  const denReal = 1.0 + coeffs.a1 * cos1 + coeffs.a2 * cos2;
  const denImag = -(coeffs.a1 * sin1 + coeffs.a2 * sin2);

  const numMag2 = numReal * numReal + numImag * numImag;
  const denMag2 = denReal * denReal + denImag * denImag;

  if (denMag2 <= 0) {
    return 1.0;
  }
  return Math.sqrt(numMag2 / denMag2);
}
