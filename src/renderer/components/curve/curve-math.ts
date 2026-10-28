/**
 * Frequency Response Curve Mathematics.
 * Logarithmic coordinate transformations and biquad transfer function evaluation.
 */

import { ExpertEqualizerPresetBand } from '../../../models/preset-band.js';
import {
  calculateBiquadCoefficients,
  calculateSoloIsolationCoefficients,
} from '../../../dsp/biquad-coefficients.js';
import { linearToDb } from '../../../common/math.js';
import { getBandChannelBuckets } from './eqmac-colors.js';

export const MIN_FREQ_HZ = 20;
export const MAX_FREQ_HZ = 20000;
export const GRAPH_MIN_FREQ_HZ = 10;
export const GRAPH_MAX_FREQ_HZ = 24000;
export const MIN_DB = -24;
export const MAX_DB = 24;

export function freqToX(freq: number, width: number, minHz = MIN_FREQ_HZ, maxHz = MAX_FREQ_HZ): number {
  const boundedFreq = Math.max(minHz, Math.min(maxHz, freq));
  const logMin = Math.log10(minHz);
  const logMax = Math.log10(maxHz);
  return ((Math.log10(boundedFreq) - logMin) / (logMax - logMin)) * width;
}

export function xToFreq(x: number, width: number, minHz = MIN_FREQ_HZ, maxHz = MAX_FREQ_HZ): number {
  const clampedX = Math.max(0, Math.min(width, x));
  const logMin = Math.log10(minHz);
  const logMax = Math.log10(maxHz);
  const frac = clampedX / width;
  return Math.pow(10, logMin + frac * (logMax - logMin));
}

export function dbToY(db: number, height: number, minDb = MIN_DB, maxDb = MAX_DB): number {
  const clampedDb = Math.max(minDb, Math.min(maxDb, db));
  // In screen coordinates: Top is 0 (maxDb), Bottom is height (minDb)
  return height - ((clampedDb - minDb) / (maxDb - minDb)) * height;
}

export function yToDb(y: number, height: number, minDb = MIN_DB, maxDb = MAX_DB): number {
  const clampedY = Math.max(0, Math.min(height, y));
  const frac = (height - clampedY) / height;
  return minDb + frac * (maxDb - minDb);
}

/**
 * Evaluates the magnitude response in dB using precalculated biquad coefficients at frequency f.
 */
export function evaluateCoeffsDbAtFreq(
  coeffs: Readonly<{ b0: number; b1: number; b2: number; a1: number; a2: number }>,
  freqHz: number,
  sampleRate: number
): number {
  const omega = (2 * Math.PI * freqHz) / sampleRate;
  const cos1 = Math.cos(omega);
  const sin1 = Math.sin(omega);
  const cos2 = Math.cos(2 * omega);
  const sin2 = Math.sin(2 * omega);

  // Numerator: b0 + b1*e^(-jw) + b2*e^(-2jw)
  const numRe = coeffs.b0 + coeffs.b1 * cos1 + coeffs.b2 * cos2;
  const numIm = -coeffs.b1 * sin1 - coeffs.b2 * sin2;

  // Denominator: 1 + a1*e^(-jw) + a2*e^(-2jw)
  const denRe = 1.0 + coeffs.a1 * cos1 + coeffs.a2 * cos2;
  const denIm = -coeffs.a1 * sin1 - coeffs.a2 * sin2;

  const numMagSq = numRe * numRe + numIm * numIm;
  const denMagSq = denRe * denRe + denIm * denIm;

  if (denMagSq < 1e-12) return 0.0;
  const magLinear = Math.sqrt(numMagSq / denMagSq);
  return linearToDb(magLinear);
}

/**
 * Evaluates the magnitude response in dB of a single filter band at frequency f.
 */
export function evaluateBandDbAtFreq(
  band: Readonly<ExpertEqualizerPresetBand>,
  freqHz: number,
  sampleRate: number
): number {
  if (band.bypass) return 0.0;
  const coeffs = calculateBiquadCoefficients(band, sampleRate);
  return evaluateCoeffsDbAtFreq(coeffs, freqHz, sampleRate);
}

/**
 * Calculates the individual response curve for a single band across [minHz, maxHz].
 */
export function calculateSingleBandCurvePoints(
  band: Readonly<ExpertEqualizerPresetBand>,
  numPoints: number,
  sampleRate: number,
  minHz = GRAPH_MIN_FREQ_HZ,
  maxHz = GRAPH_MAX_FREQ_HZ
): Float32Array {
  const result = new Float32Array(numPoints);
  const logMin = Math.log10(minHz);
  const logMax = Math.log10(maxHz);
  const coeffs = calculateBiquadCoefficients(band, sampleRate);

  for (let i = 0; i < numPoints; i++) {
    const frac = i / (numPoints - 1);
    const f = Math.pow(10, logMin + frac * (logMax - logMin));
    result[i] = evaluateCoeffsDbAtFreq(coeffs, f, sampleRate);
  }
  return result;
}

/**
 * Calculates the isolated passband response curve for a soloed band across [minHz, maxHz].
 */
export function calculateSoloBandCurvePoints(
  band: Readonly<ExpertEqualizerPresetBand>,
  numPoints: number,
  sampleRate: number,
  minHz = GRAPH_MIN_FREQ_HZ,
  maxHz = GRAPH_MAX_FREQ_HZ
): Float32Array {
  const result = new Float32Array(numPoints);
  const logMin = Math.log10(minHz);
  const logMax = Math.log10(maxHz);
  const coeffs = calculateSoloIsolationCoefficients(band, sampleRate);

  for (let i = 0; i < numPoints; i++) {
    const frac = i / (numPoints - 1);
    const f = Math.pow(10, logMin + frac * (logMax - logMin));
    result[i] = evaluateCoeffsDbAtFreq(coeffs, f, sampleRate);
  }
  return result;
}

/**
 * Calculates composite curve points across a grid of frequencies.
 * Precomputes biquad coefficients once per band before grid iteration for 500x speedup.
 */
export function calculateCompositeCurvePoints(
  bands: readonly Readonly<ExpertEqualizerPresetBand>[],
  preampDb: number,
  numPoints: number,
  sampleRate: number,
  minHz = MIN_FREQ_HZ,
  maxHz = MAX_FREQ_HZ
): Float32Array {
  const result = new Float32Array(numPoints);
  const logMin = Math.log10(minHz);
  const logMax = Math.log10(maxHz);

  // Precompute coefficients ONCE per active band
  const activeCoeffs = bands
    .filter((b) => !b.bypass)
    .map((b) => calculateBiquadCoefficients(b, sampleRate));

  for (let i = 0; i < numPoints; i++) {
    const frac = i / (numPoints - 1);
    const f = Math.pow(10, logMin + frac * (logMax - logMin));
    let totalDb = preampDb;

    for (const coeffs of activeCoeffs) {
      totalDb += evaluateCoeffsDbAtFreq(coeffs, f, sampleRate);
    }
    result[i] = totalDb;
  }

  return result;
}

/**
 * Calculates composite gain-sum curve points per channel bucket ('all' | 'left' | 'right').
 */
export function calculateBucketCompositeCurvePoints(
  bands: readonly Readonly<ExpertEqualizerPresetBand>[],
  preampDb: number,
  numPoints: number,
  sampleRate: number,
  bucket: 'all' | 'left' | 'right',
  minHz = GRAPH_MIN_FREQ_HZ,
  maxHz = GRAPH_MAX_FREQ_HZ
): Float32Array {
  const bucketBands = bands.filter(
    (b) => !b.bypass && getBandChannelBuckets(b.channels).includes(bucket)
  );
  return calculateCompositeCurvePoints(bucketBands, preampDb, numPoints, sampleRate, minHz, maxHz);
}

/**
 * Applies a 3-tap Gaussian spatial smoothing kernel across adjacent FFT spectrum bins
 * so cubic spline rendering produces a fluid, organic contour without jagged spikes.
 */
export function smoothSpectrumBins(raw: Float32Array, out: Float32Array): void {
  const n = Math.min(raw.length, out.length);
  if (n === 0) return;
  for (let i = 0; i < n; i++) {
    const prev = raw[Math.max(0, i - 1)] ?? 0;
    const curr = raw[i] ?? 0;
    const next = raw[Math.min(n - 1, i + 1)] ?? 0;
    out[i] = prev * 0.22 + curr * 0.56 + next * 0.22;
  }
}

/**
 * Updates a studio-style Peak-Hold envelope with hold timer and smooth gravity decay.
 */
export function updatePeakHoldEnvelope(
  current: Float32Array,
  peaks: Float32Array,
  holdTimers: Uint16Array,
  holdFrames = 28,
  decayFactor = 0.975
): void {
  const n = Math.min(current.length, peaks.length, holdTimers.length);
  for (let i = 0; i < n; i++) {
    const val = current[i] ?? 0;
    const peak = peaks[i] ?? 0;
    if (val >= peak) {
      peaks[i] = val;
      holdTimers[i] = holdFrames;
    } else if ((holdTimers[i] ?? 0) > 0) {
      holdTimers[i] = (holdTimers[i] ?? 1) - 1;
    } else {
      peaks[i] = Math.max(val, peak * decayFactor - 0.0015);
    }
  }
}

export interface CubicBezierSegment {
  readonly cp1x: number;
  readonly cp1y: number;
  readonly cp2x: number;
  readonly cp2y: number;
  readonly x: number;
  readonly y: number;
}

/**
 * Converts a sequence of (x, y) coordinates into smooth Catmull-Rom cubic Bezier segments.
 */
export function computeSplineControlPoints(
  xs: readonly number[],
  ys: readonly number[],
  tension = 0.35
): CubicBezierSegment[] {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return [];

  const segments: CubicBezierSegment[] = [];
  for (let i = 0; i < n - 1; i++) {
    const x0 = xs[Math.max(0, i - 1)]!;
    const y0 = ys[Math.max(0, i - 1)]!;
    const x1 = xs[i]!;
    const y1 = ys[i]!;
    const x2 = xs[i + 1]!;
    const y2 = ys[i + 1]!;
    const x3 = xs[Math.min(n - 1, i + 2)]!;
    const y3 = ys[Math.min(n - 1, i + 2)]!;

    const cp1x = x1 + ((x2 - x0) * tension) / 3;
    const cp1y = y1 + ((y2 - y0) * tension) / 3;
    const cp2x = x2 - ((x3 - x1) * tension) / 3;
    const cp2y = y2 - ((y3 - y1) * tension) / 3;

    segments.push({ cp1x, cp1y, cp2x, cp2y, x: x2, y: y2 });
  }
  return segments;
}
