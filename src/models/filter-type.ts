/**
 * FilterType enum mirroring Apple CoreAudio AVAudioUnitEQFilterType.
 * parametric = 0, bandStop = 6, resonantLowShelf = 9, resonantHighShelf = 10.
 */

export const FilterType = Object.freeze({
  PARAMETRIC: 0,
  BAND_STOP: 6,
  RESONANT_LOW_SHELF: 9,
  RESONANT_HIGH_SHELF: 10,
} as const);

export type FilterType = (typeof FilterType)[keyof typeof FilterType];

export function filterTypeToPEQToken(type: FilterType): string {
  switch (type) {
    case FilterType.PARAMETRIC:
      return 'PK';
    case FilterType.BAND_STOP:
      return 'NO';
    case FilterType.RESONANT_LOW_SHELF:
      return 'LS';
    case FilterType.RESONANT_HIGH_SHELF:
      return 'HS';
    default:
      return 'PK';
  }
}

export function peqTokenToFilterType(token: string): FilterType | null {
  switch (token.trim().toUpperCase()) {
    case 'PK':
    case 'PEQ':
    case 'MODAL':
      return FilterType.PARAMETRIC;
    case 'NO':
    case 'NOTCH':
    case 'BANDSTOP':
      return FilterType.BAND_STOP;
    case 'LS':
    case 'LSC':
      return FilterType.RESONANT_LOW_SHELF;
    case 'HS':
    case 'HSC':
      return FilterType.RESONANT_HIGH_SHELF;
    default:
      return null;
  }
}
