import { describe, it, expect } from 'vitest';
import { BWtoQ, QtoBW } from '../../src/models/bandwidth-unit.js';
import { isClose } from '../../src/common/math.js';

describe('Bandwidth <-> Q-factor Mathematical Conversion', () => {
  it('converts standard 1.0 octave to Q = 1.4142 (Butterworth/approx sqrt(2))', () => {
    const q = BWtoQ(1.0);
    expect(isClose(q, Math.SQRT2, 1e-3)).toBe(true);
    expect(roundToDecimals(q, 2)).toBe(1.41);
  });

  it('converts Q = 1.4142 back to 1.0 octave', () => {
    const bw = QtoBW(Math.SQRT2);
    expect(isClose(bw, 1.0, 1e-3)).toBe(true);
  });

  it('round-trips BW -> Q -> BW across valid bandwidth range (0.05 to 5.0 octaves)', () => {
    const testOctaves = [0.05, 0.1, 0.33, 0.5, 0.66, 1.0, 1.41, 2.0, 3.0, 4.0, 5.0];
    for (const bw of testOctaves) {
      const q = BWtoQ(bw);
      const roundtripBw = QtoBW(q);
      expect(isClose(bw, roundtripBw, 1e-4)).toBe(true);
    }
  });

  it('round-trips Q -> BW -> Q across valid Q range (0.2 to 25)', () => {
    const testQs = [0.2, 0.5, 0.707, 1.0, 1.414, 2.0, 5.0, 10.0, 20.0];
    for (const q of testQs) {
      const bw = QtoBW(q);
      const roundtripQ = BWtoQ(bw);
      expect(isClose(q, roundtripQ, 1e-4)).toBe(true);
    }
  });

  it('handles small bandwidth gracefully', () => {
    const q = BWtoQ(0.05);
    expect(q).toBeGreaterThan(20);
    expect(Number.isFinite(q)).toBe(true);
  });

  it('handles wide bandwidth gracefully', () => {
    const q = BWtoQ(5.0);
    expect(q).toBeLessThan(0.3);
    expect(Number.isFinite(q)).toBe(true);
  });
});

function roundToDecimals(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
