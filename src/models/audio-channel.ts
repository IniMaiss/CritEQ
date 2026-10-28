/**
 * AudioChannel enum and channel mapping helpers.
 * Left = 0, Right = 1.
 */

export const AudioChannel = Object.freeze({
  LEFT: 0,
  RIGHT: 1,
} as const);

export type AudioChannel = (typeof AudioChannel)[keyof typeof AudioChannel];

export function audioChannelToName(channel: AudioChannel): string {
  switch (channel) {
    case AudioChannel.LEFT:
      return 'L';
    case AudioChannel.RIGHT:
      return 'R';
    default:
      return 'L';
  }
}

export function parseAudioChannel(token: string): AudioChannel | null {
  const normalized = token.trim().toUpperCase();
  if (normalized === 'L' || normalized === 'LEFT' || normalized === '1') {
    return AudioChannel.LEFT;
  }
  if (normalized === 'R' || normalized === 'RIGHT' || normalized === '2') {
    return AudioChannel.RIGHT;
  }
  return null;
}
