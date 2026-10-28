/**
 * Multi-band, Multi-channel Cascade Audio Processor.
 * Coordinates preamp gain, stereo channel routing, and biquad filter banks.
 * Strictly immutable: returns a new state and new output buffer on every call.
 */

import { ExpertEqualizerPreset } from '../models/preset.js';
import { AudioChannel } from '../models/audio-channel.js';
import {
  BiquadCoefficients,
  calculateBiquadCoefficients,
} from './biquad-coefficients.js';
import {
  BiquadState,
  INITIAL_BIQUAD_STATE,
  processBiquadBlock,
} from './biquad-filter.js';
import { splitStereoBuffer, mergeStereoBuffers } from './channel-splitter.js';
import { dbToLinear } from '../common/math.js';

export interface FilterNodeState {
  readonly bandId: string;
  readonly coeffs: Readonly<BiquadCoefficients>;
  readonly bypass: boolean;
  readonly channels?: readonly AudioChannel[] | undefined;
  readonly stateLeft: Readonly<BiquadState>;
  readonly stateRight: Readonly<BiquadState>;
}

export interface AudioProcessorState {
  readonly preset: Readonly<ExpertEqualizerPreset>;
  readonly sampleRate: number;
  readonly preampLinear: number;
  readonly filterNodes: readonly Readonly<FilterNodeState>[];
}

export interface AudioProcessingResult {
  readonly nextState: Readonly<AudioProcessorState>;
  readonly output: Float32Array;
}

export function createAudioProcessorState(
  preset: Readonly<ExpertEqualizerPreset>,
  sampleRate: number
): Readonly<AudioProcessorState> {
  const preampLinear = dbToLinear(preset.global);
  const filterNodes: Readonly<FilterNodeState>[] = preset.bands.map((band) => {
    const coeffs = calculateBiquadCoefficients(band, sampleRate);
    return Object.freeze({
      bandId: band.id,
      coeffs,
      bypass: band.bypass,
      channels: band.channels,
      stateLeft: INITIAL_BIQUAD_STATE,
      stateRight: INITIAL_BIQUAD_STATE,
    });
  });

  return Object.freeze({
    preset,
    sampleRate,
    preampLinear,
    filterNodes: Object.freeze(filterNodes),
  });
}

/**
 * Processes an interleaved stereo Float32Array buffer through the active preset DSP pipeline.
 * Strictly immutable: returns the next processor state and output buffer.
 */
export function processAudioBuffer(
  processorState: Readonly<AudioProcessorState>,
  interleavedInput: Float32Array
): AudioProcessingResult {
  const { left, right } = splitStereoBuffer(interleavedInput);
  const preamp = processorState.preampLinear;

  const amplifiedLeft = new Float32Array(left.length);
  const amplifiedRight = new Float32Array(right.length);

  for (let i = 0; i < left.length; i++) {
    amplifiedLeft[i] = (left[i] ?? 0) * preamp;
    amplifiedRight[i] = (right[i] ?? 0) * preamp;
  }

  let currentLeft: Float32Array = amplifiedLeft;
  let currentRight: Float32Array = amplifiedRight;

  const updatedNodes: Readonly<FilterNodeState>[] = [];

  for (const node of processorState.filterNodes) {
    if (node.bypass) {
      updatedNodes.push(node);
      continue;
    }

    const targetsLeft =
      node.channels === undefined || node.channels.includes(AudioChannel.LEFT);
    const targetsRight =
      node.channels === undefined || node.channels.includes(AudioChannel.RIGHT);

    let nextStateLeft = node.stateLeft;
    let nextStateRight = node.stateRight;

    if (targetsLeft) {
      const result = processBiquadBlock(node.stateLeft, node.coeffs, currentLeft);
      nextStateLeft = result.nextState;
      currentLeft = result.output;
    }

    if (targetsRight) {
      const result = processBiquadBlock(node.stateRight, node.coeffs, currentRight);
      nextStateRight = result.nextState;
      currentRight = result.output;
    }

    updatedNodes.push(
      Object.freeze({
        ...node,
        stateLeft: nextStateLeft,
        stateRight: nextStateRight,
      })
    );
  }

  const nextState: Readonly<AudioProcessorState> = Object.freeze({
    ...processorState,
    filterNodes: Object.freeze(updatedNodes),
  });

  return {
    nextState,
    output: mergeStereoBuffers(currentLeft, currentRight),
  };
}
