/**
 * Custom error hierarchy for CritEQ domain and PEQ parser.
 */

export type PEQErrorCode =
  | 'invalid-number'
  | 'out-of-range'
  | 'unknown-filter-type'
  | 'invalid-bandwidth'
  | 'bandwidth-out-of-range'
  | 'unknown-channel'
  | 'invalid-filter-syntax'
  | 'invalid-preamp-syntax';

export interface PEQErrorData {
  readonly [key: string]: unknown;
}

export class PEQParseError extends Error {
  public readonly lineNumber: number;
  public readonly col: number | undefined;
  public readonly code: PEQErrorCode;
  public readonly data: PEQErrorData;

  constructor(
    message: string,
    lineNumber: number,
    col?: number,
    code: PEQErrorCode = 'invalid-filter-syntax',
    data: PEQErrorData = {}
  ) {
    const colStr = typeof col === 'number' && col > 0 ? ` | Column: ${col}` : '';
    super(`${message}\nLine: ${lineNumber}${colStr}`);
    this.name = 'PEQParseError';
    this.lineNumber = lineNumber;
    this.col = col;
    this.code = code;
    this.data = Object.freeze({ ...data });
    Object.setPrototypeOf(this, PEQParseError.prototype);
  }
}

export class ValidationError extends Error {
  public readonly issues: readonly string[];

  constructor(message: string, issues: readonly string[] = []) {
    super(message);
    this.name = 'ValidationError';
    this.issues = Object.freeze([...issues]);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class PresetNotFoundError extends Error {
  public readonly presetId: string;

  constructor(presetId: string) {
    super(`Preset with ID "${presetId}" was not found.`);
    this.name = 'PresetNotFoundError';
    this.presetId = presetId;
    Object.setPrototypeOf(this, PresetNotFoundError.prototype);
  }
}

export class AudioDSPError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AudioDSPError';
    Object.setPrototypeOf(this, AudioDSPError.prototype);
  }
}
