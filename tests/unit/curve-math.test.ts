import { describe, it, expect } from 'vitest';
import {
  freqToX,
  xToFreq,
  dbToY,
  yToDb,
  evaluateBandDbAtFreq,
  calculateCompositeCurvePoints,
  calculateSingleBandCurvePoints,
  calculateSoloBandCurvePoints,
  calculateBucketCompositeCurvePoints,
  smoothSpectrumBins,
  updatePeakHoldEnvelope,
  computeSplineControlPoints,
} from '../../src/renderer/components/curve/curve-math.js';
import {
  getColorForFrequency,
  desaturateAndDarkenHex,
  formatEqMacFrequency,
  formatEqMacGain,
  formatEqMacBandwidthScreen,
  getBandChannelBuckets,
} from '../../src/renderer/components/curve/eqmac-colors.js';
import { AudioChannel } from '../../src/models/audio-channel.js';
import { createPresetBand } from '../../src/models/preset-band.js';
import { FilterType } from '../../src/models/filter-type.js';

describe('Curve Math Coordinates & Transfer Functions', () => {
  const width = 1000;
  const height = 400;

  it('performs reversible frequency to X coordinate mappings', () => {
    const f1 = 20;
    const f2 = 1000;
    const f3 = 20000;

    expect(freqToX(f1, width)).toBeCloseTo(0, 1);
    expect(freqToX(f3, width)).toBeCloseTo(width, 1);

    const x2 = freqToX(f2, width);
    const recoveredF2 = xToFreq(x2, width);
    expect(recoveredF2).toBeCloseTo(f2, 1);
  });

  it('performs reversible dB to Y coordinate mappings', () => {
    expect(dbToY(24, height)).toBeCloseTo(0, 1); // +24 dB is top
    expect(dbToY(0, height)).toBeCloseTo(200, 1); // 0 dB is vertical center
    expect(dbToY(-24, height)).toBeCloseTo(height, 1); // -24 dB is bottom

    const y = dbToY(6, height);
    expect(yToDb(y, height)).toBeCloseTo(6, 1);
  });

  it('evaluates peaking band magnitude response correctly at center frequency', () => {
    const band = createPresetBand({
      frequency: 1000,
      gain: 6.0,
      bandwidth: 1.0,
      type: FilterType.PARAMETRIC,
    });

    const gainAtFc = evaluateBandDbAtFreq(band, 1000, 48000);
    // At center frequency, gain should be exactly ~ +6 dB
    expect(gainAtFc).toBeCloseTo(6.0, 1);

    // Far from center frequency (e.g. 50 Hz), gain approaches 0 dB
    const gainAt50Hz = evaluateBandDbAtFreq(band, 50, 48000);
    expect(gainAt50Hz).toBeCloseTo(0, 1);
  });

  it('returns 0 dB for bypassed bands', () => {
    const bypassed = createPresetBand({
      frequency: 1000,
      gain: 12.0,
      bandwidth: 1.0,
      type: FilterType.PARAMETRIC,
      bypass: true,
    });

    expect(evaluateBandDbAtFreq(bypassed, 1000, 48000)).toBe(0.0);
  });

  it('calculates composite curve points with preamp offset', () => {
    const band = createPresetBand({
      frequency: 1000,
      gain: 3.0,
      bandwidth: 1.0,
      type: FilterType.PARAMETRIC,
    });

    const points = calculateCompositeCurvePoints([band], -2.0, 100, 48000);
    expect(points.length).toBe(100);
    // Near 50 Hz, curve should be close to preamp (-2 dB)
    expect(points[10]).toBeCloseTo(-2.0, 1);
  });

  it('calculates single-band and per-bucket composite curves and eqMac color/format helpers', () => {
    const leftBand = createPresetBand({
      frequency: 500,
      gain: 4.0,
      bandwidth: 1.0,
      type: FilterType.PARAMETRIC,
      channels: [AudioChannel.LEFT],
    });

    const singlePts = calculateSingleBandCurvePoints(leftBand, 64, 48000);
    expect(singlePts.length).toBe(64);

    const soloPts = calculateSoloBandCurvePoints(leftBand, 64, 48000);
    expect(soloPts.length).toBe(64);
    expect(Math.max(...soloPts)).toBeCloseTo(0, 0);
    expect(soloPts[0]).toBeLessThan(-10);

    const leftBucketPts = calculateBucketCompositeCurvePoints([leftBand], 0, 64, 48000, 'left');
    const rightBucketPts = calculateBucketCompositeCurvePoints([leftBand], 0, 64, 48000, 'right');
    expect(Math.max(...leftBucketPts)).toBeGreaterThan(2.0);
    expect(Math.max(...rightBucketPts)).toBeCloseTo(0, 3);

    expect(getColorForFrequency(20)).toMatch(/^#[0-9a-f]{6}$/i);
    expect(getColorForFrequency(1000)).toMatch(/^#[0-9a-f]{6}$/i);
    expect(desaturateAndDarkenHex('#ff0000')).toMatch(/^#[0-9a-f]{6}$/i);
    expect(formatEqMacFrequency(250)).toBe('250Hz');
    expect(formatEqMacFrequency(1250)).toBe('1.25kHz');
    expect(formatEqMacFrequency(16000)).toBe('16kHz');
    expect(formatEqMacGain(3.5)).toBe('+3.5dB');
    expect(formatEqMacGain(0, FilterType.BAND_STOP)).toBe('-128dB');
    expect(formatEqMacBandwidthScreen(1.0, 'Q')).toContain('Q:');
    expect(formatEqMacBandwidthScreen(1.0, 'OCTAVES')).toBe('O: 1.000');
    expect(getBandChannelBuckets([AudioChannel.LEFT])).toEqual(['left']);
  });

  it('computes spatial smoothing, peak-hold envelope decay, and cubic spline control points', () => {
    const raw = new Float32Array([0.0, 1.0, 0.0, 0.5]);
    const smoothed = new Float32Array(4);
    smoothSpectrumBins(raw, smoothed);
    expect(smoothed[1]).toBeLessThan(1.0);
    expect(smoothed[1]).toBeGreaterThan(0.5);
    expect(smoothed[0]).toBeGreaterThan(0.0);

    const peaks = new Float32Array(4);
    const timers = new Uint16Array(4);
    updatePeakHoldEnvelope(smoothed, peaks, timers, 2, 0.95);
    expect(peaks[1]).toBeCloseTo(smoothed[1]!, 5);
    expect(timers[1]).toBe(2);

    // Drop input signal to zero: peak holds while timer > 0, then decays
    const zero = new Float32Array(4);
    updatePeakHoldEnvelope(zero, peaks, timers, 2, 0.95);
    expect(timers[1]).toBe(1);
    expect(peaks[1]).toBeCloseTo(smoothed[1]!, 5);

    updatePeakHoldEnvelope(zero, peaks, timers, 2, 0.95);
    expect(timers[1]).toBe(0);

    updatePeakHoldEnvelope(zero, peaks, timers, 2, 0.95);
    expect(peaks[1]).toBeLessThan(smoothed[1]!);

    const segments = computeSplineControlPoints([0, 100, 200, 300], [200, 100, 150, 180]);
    expect(segments).toHaveLength(3);
    expect(segments[0]?.x).toBe(100);
    expect(segments[0]?.y).toBe(100);
    expect(Number.isFinite(segments[0]?.cp1x)).toBe(true);
    expect(Number.isFinite(segments[0]?.cp2y)).toBe(true);
  });
});
