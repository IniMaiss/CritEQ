/**
 * Pure numerical helpers for DSP and parameter manipulation.
 */

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

export function roundToDecimals(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function dbToLinear(db: number): number {
  return 10 ** (db / 20);
}

export function linearToDb(linear: number): number {
  if (linear <= 0) {
    return -128.0;
  }
  return 20 * Math.log10(linear);
}

export function isClose(a: number, b: number, epsilon = 1e-4): boolean {
  return Math.abs(a - b) <= epsilon;
}
