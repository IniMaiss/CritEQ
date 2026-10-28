/**
 * Stereo Channel Splitting and Merging Utilities for Interleaved Audio Buffers.
 */

export interface StereoChannels {
  readonly left: Float32Array;
  readonly right: Float32Array;
}

/**
 * Splits an interleaved stereo buffer [L0, R0, L1, R1, ...] into discrete Left and Right channels.
 */
export function splitStereoBuffer(interleaved: Float32Array): StereoChannels {
  const frameCount = Math.floor(interleaved.length / 2);
  const left = new Float32Array(frameCount);
  const right = new Float32Array(frameCount);

  for (let i = 0; i < frameCount; i++) {
    const idx = i * 2;
    left[i] = interleaved[idx] ?? 0;
    right[i] = interleaved[idx + 1] ?? 0;
  }

  return { left, right };
}

/**
 * Merges discrete Left and Right channel buffers into an interleaved stereo buffer.
 */
export function mergeStereoBuffers(left: Float32Array, right: Float32Array): Float32Array {
  const frameCount = Math.min(left.length, right.length);
  const interleaved = new Float32Array(frameCount * 2);

  for (let i = 0; i < frameCount; i++) {
    const idx = i * 2;
    interleaved[idx] = left[i] ?? 0;
    interleaved[idx + 1] = right[i] ?? 0;
  }

  return interleaved;
}
