/**
 * Constants, RegEx patterns, and Mappings for Equalizer APO and REW PEQ Files.
 */

import { AudioChannel } from '../models/audio-channel.js';

export const APO_CHANNEL_MAP: Readonly<Record<string, AudioChannel>> = Object.freeze({
  L: AudioChannel.LEFT,
  LEFT: AudioChannel.LEFT,
  '1': AudioChannel.LEFT,
  R: AudioChannel.RIGHT,
  RIGHT: AudioChannel.RIGHT,
  '2': AudioChannel.RIGHT,
});
