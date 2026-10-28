import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestSignalGenerator } from '../../src/renderer/audio/test-signal-generator.js';

describe('TestSignalGenerator', () => {
  let mockContext: unknown;
  let generator: TestSignalGenerator;

  beforeEach(() => {
    mockContext = {
      sampleRate: 44100,
      currentTime: 0,
      createGain: vi.fn(() => ({
        gain: { value: 1.0, setTargetAtTime: vi.fn() },
        connect: vi.fn(),
        disconnect: vi.fn(),
      })),
      createOscillator: vi.fn(() => ({
        frequency: {
          value: 0,
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      })),
      createBuffer: vi.fn(() => ({
        getChannelData: vi.fn(() => new Float32Array(100)),
      })),
      createBufferSource: vi.fn(() => ({
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      })),
    };

    generator = new TestSignalGenerator(mockContext as AudioContext);
  });

  it('starts and stops 1kHz sine tone', () => {
    generator.start('sine-1khz');
    expect(generator.active).toBe(true);

    generator.stop();
    expect(generator.active).toBe(false);
  });

  it('generates pink noise and white noise', () => {
    generator.start('pink-noise');
    expect(generator.active).toBe(true);

    generator.start('white-noise');
    expect(generator.active).toBe(true);

    generator.stop();
    expect(generator.active).toBe(false);
  });

  it('starts logarithmic sweep', () => {
    generator.start('log-sweep');
    expect(generator.active).toBe(true);
    generator.stop();
  });
});
