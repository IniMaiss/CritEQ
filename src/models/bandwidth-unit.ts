/**
 * BandwidthUnit representation and exact bidirectional Q <-> Octave bandwidth conversion.
 * Formula source: Audio EQ Cookbook (Robert Bristow-Johnson).
 */

import { BANDWIDTH_OCTAVES_MAX } from '../common/constants.js';

export const BandwidthUnit = Object.freeze({
  Q: 'Q',
  OCTAVES: 'OCTAVES',
} as const);

export type BandwidthUnit = (typeof BandwidthUnit)[keyof typeof BandwidthUnit];

/**
 * Converts octave bandwidth (N in octaves) to Quality factor (Q).
 * Q = sqrt(2^N) / (2^N - 1)
 */
export function BWtoQ(bw: number): number {
  if (bw <= 0) {
    return 100.0;
  }
  const pow2 = 2 ** bw;
  const denominator = pow2 - 1;
  if (denominator === 0) {
    return 100.0;
  }
  return Math.sqrt(pow2) / denominator;
}

/**
 * Converts Quality factor (Q) to octave bandwidth (BW in octaves).
 * Uses numerically stable closed-form inverse hyperbolic sine:
 * BW = 2 * asinh(1 / (2 * Q)) / ln(2)
 */
export function QtoBW(q: number): number {
  if (q <= 0) {
    return BANDWIDTH_OCTAVES_MAX;
  }
  return (2 * Math.asinh(1 / (2 * q))) / Math.LN2;
}
