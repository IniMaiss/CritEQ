/**
 * Equalizer APO PEQ Serializer.
 * Serializes ExpertEqualizerPreset into standard Equalizer APO configuration text.
 */

import { ExpertEqualizerPreset } from '../models/preset.js';
import { ExpertEqualizerPresetBand } from '../models/preset-band.js';
import { FilterType, filterTypeToPEQToken } from '../models/filter-type.js';
import { AudioChannel, audioChannelToName } from '../models/audio-channel.js';
import { BWtoQ, BandwidthUnit } from '../models/bandwidth-unit.js';

export interface PEQSerializeOptions {
  readonly bandwidthUnit?: BandwidthUnit;
  readonly showBandwidth?: boolean;
}

function formatFrequency(frequency: number): string {
  if (Number.isInteger(frequency)) {
    return frequency.toString();
  }
  return frequency.toFixed(2).replace(/\.?0+$/, '');
}

function formatFilterBand(
  band: Readonly<ExpertEqualizerPresetBand>,
  index: number,
  options: PEQSerializeOptions
): string {
  const onOff = band.bypass ? 'OFF' : 'ON';
  const typeStr = filterTypeToPEQToken(band.type);
  const freqStr = `Fc ${formatFrequency(band.frequency)} Hz`;
  const parts = [`Filter ${index + 1}: ${onOff}  ${typeStr}  ${freqStr}`];

  if (band.type !== FilterType.BAND_STOP) {
    parts.push(`Gain ${band.gain.toFixed(2)} dB`);
  }

  const showBw = options.showBandwidth ?? true;
  if (showBw) {
    if (options.bandwidthUnit === BandwidthUnit.OCTAVES) {
      parts.push(`BW Oct ${band.bandwidth.toFixed(3)}`);
    } else {
      const qVal = BWtoQ(band.bandwidth);
      parts.push(`Q ${qVal.toFixed(2)}`);
    }
  }

  return parts.join('  ');
}

export function serializePEQ(
  presetsInput: Readonly<ExpertEqualizerPreset> | readonly Readonly<ExpertEqualizerPreset>[],
  options: PEQSerializeOptions = {}
): string {
  const presets = Array.isArray(presetsInput) ? presetsInput : [presetsInput];
  const outputSections: string[] = [];

  for (const preset of presets) {
    const lines: string[] = [];
    if (preset.name) {
      lines.push(`Name: ${preset.name}`);
    }
    lines.push(`Preamp: ${preset.global.toFixed(2)} dB`);

    // Separate stereo/all-channel bands from channel-specific bands
    const allChannelBands = preset.bands.filter(
      (b: Readonly<ExpertEqualizerPresetBand>) =>
        !b.channels || b.channels.length === 0 || b.channels.length === 2
    );
    const leftOnlyBands = preset.bands.filter(
      (b: Readonly<ExpertEqualizerPresetBand>) =>
        b.channels?.length === 1 && b.channels[0] === AudioChannel.LEFT
    );
    const rightOnlyBands = preset.bands.filter(
      (b: Readonly<ExpertEqualizerPresetBand>) =>
        b.channels?.length === 1 && b.channels[0] === AudioChannel.RIGHT
    );

    // Render all-channel bands
    for (let i = 0; i < allChannelBands.length; i++) {
      lines.push(formatFilterBand(allChannelBands[i]!, i, options));
    }

    // Render left-only bands
    if (leftOnlyBands.length > 0) {
      lines.push('');
      lines.push(`Channel: ${audioChannelToName(AudioChannel.LEFT)}`);
      for (let i = 0; i < leftOnlyBands.length; i++) {
        lines.push(formatFilterBand(leftOnlyBands[i]!, i, options));
      }
    }

    // Render right-only bands
    if (rightOnlyBands.length > 0) {
      lines.push('');
      lines.push(`Channel: ${audioChannelToName(AudioChannel.RIGHT)}`);
      for (let i = 0; i < rightOnlyBands.length; i++) {
        lines.push(formatFilterBand(rightOnlyBands[i]!, i, options));
      }
    }

    outputSections.push(lines.join('\n'));
  }

  return outputSections.join('\n\n');
}
