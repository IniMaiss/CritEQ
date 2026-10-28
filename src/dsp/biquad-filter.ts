/**
 * Direct Form II Transposed Biquad Filter.
 * Pure functional implementation without internal state mutation.
 */

import { BiquadCoefficients } from './biquad-coefficients.js';

export interface BiquadState {
  readonly d1: number;
  readonly d2: number;
}

export const INITIAL_BIQUAD_STATE: Readonly<BiquadState> = Object.freeze({
  d1: 0.0,
  d2: 0.0,
});

/**
 * Processes a single audio sample through a Direct Form II Transposed biquad filter.
 */
export function processBiquadSample(
  state: Readonly<BiquadState>,
  coeffs: Readonly<BiquadCoefficients>,
  x: number
): { readonly nextState: Readonly<BiquadState>; readonly y: number } {
  const y = coeffs.b0 * x + state.d1;
  const d1 = coeffs.b1 * x - coeffs.a1 * y + state.d2;
  const d2 = coeffs.b2 * x - coeffs.a2 * y;

  return {
    nextState: Object.freeze({ d1, d2 }),
    y,
  };
}

/**
 * Processes a block of mono audio samples.
 * Returns the updated filter state and a new Float32Array containing output samples.
 */
export function processBiquadBlock(
  state: Readonly<BiquadState>,
  coeffs: Readonly<BiquadCoefficients>,
  input: Float32Array
): { readonly nextState: Readonly<BiquadState>; readonly output: Float32Array } {
  const length = input.length;
  const output = new Float32Array(length);

  let d1 = state.d1;
  let d2 = state.d2;
  const { b0, b1, b2, a1, a2 } = coeffs;

  for (let i = 0; i < length; i++) {
    const x = input[i] ?? 0;
    const y = b0 * x + d1;
    d1 = b1 * x - a1 * y + d2;
    d2 = b2 * x - a2 * y;
    output[i] = y;
  }

  return {
    nextState: Object.freeze({ d1, d2 }),
    output,
  };
}
