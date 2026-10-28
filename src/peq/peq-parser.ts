/**
 * Equalizer APO / REW Parametric EQ (PEQ) Text Parser.
 * Clean-room parser for Equalizer APO and AutoEq formatted configuration files.
 */

import {
  FREQUENCY_HZ_MIN,
  FREQUENCY_HZ_MAX,
  GAIN_DB_MIN,
  GAIN_DB_MAX,
  GAIN_NOTCH_DB,
  BANDWIDTH_OCTAVES_MIN,
  BANDWIDTH_OCTAVES_MAX,
  BANDWIDTH_OCTAVES_DEFAULT,
  PEQ_FILTER_REGEX,
  PREAMP_REGEX,
  CHANNEL_REGEX,
  DEVICE_REGEX,
  NAME_REGEX,
} from '../common/constants.js';
import { PEQParseError } from '../common/errors.js';
import { FilterType, peqTokenToFilterType } from '../models/filter-type.js';
import { AudioChannel } from '../models/audio-channel.js';
import { QtoBW } from '../models/bandwidth-unit.js';
import { ExpertEqualizerPreset, createPreset } from '../models/preset.js';
import { ExpertEqualizerPresetBand, createPresetBand } from '../models/preset-band.js';
import { APO_CHANNEL_MAP } from './peq-constants.js';

interface MutableContext {
  currentName: string;
  globalPreamp: number;
  currentChannel: AudioChannel[] | undefined;
  bands: ExpertEqualizerPresetBand[];
}

function validateNumericField(
  rawStr: string,
  label: string,
  min: number,
  max: number,
  lineNum: number,
  col?: number
): number {
  const val = parseFloat(rawStr);
  if (!Number.isFinite(val)) {
    throw new PEQParseError(`Invalid ${label} value "${rawStr}"`, lineNum, col, 'invalid-number', {
      LABEL: label,
      VALUE: rawStr,
    });
  }
  if (val < min || val > max) {
    throw new PEQParseError(
      `${label} ${val} out of range [${min}, ${max}]`,
      lineNum,
      col,
      'out-of-range',
      { LABEL: label, VALUE: val, MIN: min, MAX: max }
    );
  }
  return val;
}

function parseChannels(channelStr: string, lineNum: number): AudioChannel[] | undefined {
  const tokens = channelStr.trim().toUpperCase().split(/\s+/);
  if (tokens.includes('ALL')) {
    return undefined;
  }
  const result: AudioChannel[] = [];
  for (const token of tokens) {
    if (Object.hasOwn(APO_CHANNEL_MAP, token)) {
      result.push(APO_CHANNEL_MAP[token]!);
    } else {
      throw new PEQParseError(
        `Unknown channel "${token}" — expected L, R, 1, 2, or ALL`,
        lineNum,
        undefined,
        'unknown-channel',
        { CHANNEL: token }
      );
    }
  }
  return result.length > 0 ? result : undefined;
}

function parseBandwidth(
  bwStr: string | undefined,
  unitStr: string | undefined,
  lineNum: number,
  rawLine: string
): number {
  if (bwStr === undefined) {
    return BANDWIDTH_OCTAVES_DEFAULT;
  }
  const bwCol = rawLine.indexOf(bwStr) + 1;
  const bwNum = parseFloat(bwStr);
  if (!Number.isFinite(bwNum) || bwNum <= 0) {
    throw new PEQParseError(
      `Invalid bandwidth value "${bwStr}"`,
      lineNum,
      bwCol,
      'invalid-bandwidth',
      { VALUE: bwStr }
    );
  }

  const isOctaves = unitStr ? /^BW/i.test(unitStr) : false;
  const octaves = isOctaves ? bwNum : QtoBW(bwNum);

  if (octaves < BANDWIDTH_OCTAVES_MIN || octaves > BANDWIDTH_OCTAVES_MAX) {
    throw new PEQParseError(
      `Bandwidth ${octaves.toFixed(3)} oct out of range [${BANDWIDTH_OCTAVES_MIN}, ${BANDWIDTH_OCTAVES_MAX}]`,
      lineNum,
      bwCol,
      'bandwidth-out-of-range',
      {
        VALUE: octaves.toFixed(3),
        MIN: BANDWIDTH_OCTAVES_MIN,
        MAX: BANDWIDTH_OCTAVES_MAX,
      }
    );
  }
  return octaves;
}

function parseFilterBand(
  trimmed: string,
  rawLine: string,
  lineNum: number,
  currentChannel: AudioChannel[] | undefined
): ExpertEqualizerPresetBand {
  const filterMatch = PEQ_FILTER_REGEX.exec(trimmed);
  if (!filterMatch) {
    throw new PEQParseError('Invalid Filter syntax', lineNum, undefined, 'invalid-filter-syntax');
  }

  const [, onOffStr, typeStr, freqStr, gainStr, unitStr, bwStr] = filterMatch;
  const type = peqTokenToFilterType(typeStr ?? '');
  if (type === null) {
    const col = rawLine.indexOf(typeStr ?? '') + 1;
    throw new PEQParseError(`Unknown filter type "${typeStr}"`, lineNum, col, 'unknown-filter-type', {
      TYPE: typeStr,
    });
  }

  const freqCol = rawLine.indexOf(freqStr ?? '') + 1;
  const frequency = validateNumericField(
    freqStr ?? '',
    'Frequency',
    FREQUENCY_HZ_MIN,
    FREQUENCY_HZ_MAX,
    lineNum,
    freqCol
  );

  let gain = 0.0;
  if (type === FilterType.BAND_STOP) {
    gain = GAIN_NOTCH_DB;
  } else if (gainStr !== undefined) {
    const gainCol = rawLine.indexOf(gainStr) + 1;
    gain = validateNumericField(gainStr, 'Gain', GAIN_DB_MIN, GAIN_DB_MAX, lineNum, gainCol);
  }

  const bandwidth = parseBandwidth(bwStr, unitStr, lineNum, rawLine);
  const bypass = (onOffStr ?? '').toUpperCase() === 'OFF';

  return createPresetBand({
    frequency,
    gain,
    bandwidth,
    type,
    bypass,
    channels: currentChannel ? [...currentChannel] : undefined,
  });
}

function parsePreamp(trimmed: string, rawLine: string, lineNum: number): number {
  const preampMatch = PREAMP_REGEX.exec(trimmed);
  if (!preampMatch) {
    throw new PEQParseError('Invalid Preamp syntax', lineNum, undefined, 'invalid-preamp-syntax');
  }
  const valStr = preampMatch[1] ?? '0';
  const col = rawLine.indexOf(valStr) + 1;
  return validateNumericField(valStr, 'Preamp', GAIN_DB_MIN, GAIN_DB_MAX, lineNum, col);
}

function handleDeviceOrNameHeader(
  trimmed: string,
  context: MutableContext,
  flushPreset: () => void
): MutableContext {
  const devMatch = DEVICE_REGEX.exec(trimmed);
  if (devMatch) {
    flushPreset();
    return {
      currentName: devMatch[1]?.trim() || 'Imported Preset',
      globalPreamp: 0.0,
      currentChannel: undefined,
      bands: [],
    };
  }

  const nameMatch = NAME_REGEX.exec(trimmed);
  if (nameMatch) {
    const name = nameMatch[1]?.trim() || 'Imported Preset';
    if (context.bands.length > 0) {
      flushPreset();
      return {
        currentName: name,
        globalPreamp: 0.0,
        currentChannel: undefined,
        bands: [],
      };
    }
    return { ...context, currentName: name };
  }

  return context;
}

export function parsePEQ(peqText: string): readonly ExpertEqualizerPreset[] {
  const lines = peqText.split(/\r?\n/);
  const presets: ExpertEqualizerPreset[] = [];
  let context: MutableContext = {
    currentName: 'Imported Preset',
    globalPreamp: 0.0,
    currentChannel: undefined,
    bands: [],
  };

  const flushPreset = () => {
    if (context.bands.length > 0 || context.globalPreamp !== 0) {
      presets.push(
        createPreset({
          name: context.currentName,
          global: context.globalPreamp,
          bands: [...context.bands].sort((a, b) => a.frequency - b.frequency),
        })
      );
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i] ?? '';
    const lineNum = i + 1;
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (DEVICE_REGEX.test(trimmed) || NAME_REGEX.test(trimmed)) {
      context = handleDeviceOrNameHeader(trimmed, context, flushPreset);
    } else if (CHANNEL_REGEX.test(trimmed)) {
      const chMatch = CHANNEL_REGEX.exec(trimmed);
      context.currentChannel = parseChannels(chMatch?.[1] ?? '', lineNum);
    } else if (/^Preamp\b/i.test(trimmed)) {
      context.globalPreamp = parsePreamp(trimmed, rawLine, lineNum);
    } else if (/^Filter\b/i.test(trimmed)) {
      context.bands.push(parseFilterBand(trimmed, rawLine, lineNum, context.currentChannel));
    }
  }

  flushPreset();
  return Object.freeze(presets);
}
