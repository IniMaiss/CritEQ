import { describe, it, expect } from 'vitest';
import {
  processAudioBuffer,
  createAudioProcessorState,
} from '../../src/dsp/audio-processor.js';
import { splitStereoBuffer, mergeStereoBuffers } from '../../src/dsp/channel-splitter.js';
import { createPreset } from '../../src/models/preset.js';
import { createPresetBand } from '../../src/models/preset-band.js';
import { FilterType } from '../../src/models/filter-type.js';
import { AudioChannel } from '../../src/models/audio-channel.js';

describe('Audio Processor & DSP Pipeline', () => {
  const sampleRate = 44100;

  it('splits and merges stereo audio buffers with exact round-trip identity', () => {
    // Interleaved stereo: [L0, R0, L1, R1, L2, R2]
    const stereoInput = new Float32Array([0.1, -0.1, 0.5, -0.5, 0.9, -0.9]);
    const { left, right } = splitStereoBuffer(stereoInput);

    expect(left[0]).toBeCloseTo(0.1, 5);
    expect(left[1]).toBeCloseTo(0.5, 5);
    expect(left[2]).toBeCloseTo(0.9, 5);

    expect(right[0]).toBeCloseTo(-0.1, 5);
    expect(right[1]).toBeCloseTo(-0.5, 5);
    expect(right[2]).toBeCloseTo(-0.9, 5);

    const merged = mergeStereoBuffers(left, right);
    for (let i = 0; i < stereoInput.length; i++) {
      expect(merged[i]).toBeCloseTo(stereoInput[i]!, 5);
    }
  });

  it('applies global preamp gain to audio stream', () => {
    const preset = createPreset({
      name: 'Preamp Test',
      global: 6.0206, // approx +6 dB (linear factor of ~2.0)
      bands: [],
    });

    const state = createAudioProcessorState(preset, sampleRate);
    // 10 samples of 0.25 on left, 0.5 on right
    const input = new Float32Array([0.25, 0.5, 0.25, 0.5]);
    const { nextState, output } = processAudioBuffer(state, input);

    expect(nextState).toBeDefined();
    // After ~6 dB preamp, 0.25 -> ~0.5, 0.5 -> ~1.0
    expect(output[0]).toBeCloseTo(0.5, 2);
    expect(output[1]).toBeCloseTo(1.0, 2);
  });

  it('filters left and right channels independently when bands target specific channels', () => {
    const leftOnlyBoost = createPresetBand({
      frequency: 1000,
      gain: 6.0,
      bandwidth: 1.0,
      type: FilterType.PARAMETRIC,
      channels: [AudioChannel.LEFT], // Only affects Left channel
    });

    const preset = createPreset({
      name: 'Channel Separation',
      global: 0,
      bands: [leftOnlyBoost],
    });

    const state = createAudioProcessorState(preset, sampleRate);

    // Generate a 1000 Hz sine wave on both channels
    const frameCount = 1024;
    const input = new Float32Array(frameCount * 2);
    for (let i = 0; i < frameCount; i++) {
      const val = Math.sin((2 * Math.PI * 1000 * i) / sampleRate);
      input[i * 2] = val; // Left
      input[i * 2 + 1] = val; // Right
    }

    const { output } = processAudioBuffer(state, input);

    // Measure peak magnitude in second half (steady state)
    let maxLeft = 0;
    let maxRight = 0;
    for (let i = frameCount; i < frameCount * 2; i += 2) {
      maxLeft = Math.max(maxLeft, Math.abs(output[i]!));
      maxRight = Math.max(maxRight, Math.abs(output[i + 1]!));
    }

    // Left channel should be boosted (~2.0), Right channel should be unboosted (~1.0)
    expect(maxLeft).toBeGreaterThan(1.8);
    expect(maxRight).toBeCloseTo(1.0, 1);
  });

  it('bypasses bands when bypass flag is true', () => {
    const bypassedBand = createPresetBand({
      frequency: 1000,
      gain: 12.0,
      bandwidth: 1.0,
      type: FilterType.PARAMETRIC,
      bypass: true,
    });

    const preset = createPreset({
      name: 'Bypass Test',
      global: 0,
      bands: [bypassedBand],
    });

    const state = createAudioProcessorState(preset, sampleRate);
    const input = new Float32Array([0.5, 0.5, 0.5, 0.5]);
    const { output } = processAudioBuffer(state, input);

    expect(output[0]).toBeCloseTo(0.5, 3);
    expect(output[1]).toBeCloseTo(0.5, 3);
  });
});
