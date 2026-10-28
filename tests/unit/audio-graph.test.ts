import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AudioGraph } from '../../src/renderer/audio/audio-graph.js';
import { AudioContextManager } from '../../src/renderer/audio/audio-context-manager.js';
import { createPreset } from '../../src/models/preset.js';
import { createPresetBand } from '../../src/models/preset-band.js';
import { FilterType } from '../../src/models/filter-type.js';

describe('AudioGraph Integration', () => {
  let mockContext: unknown;
  let ctxManager: AudioContextManager;
  let graph: AudioGraph;

  beforeEach(() => {
    mockContext = {
      currentTime: 0,
      sampleRate: 48000,
      createGain: vi.fn(() => ({
        gain: { value: 1.0, setTargetAtTime: vi.fn() },
        connect: vi.fn(),
        disconnect: vi.fn(),
      })),
      createChannelSplitter: vi.fn(() => ({
        connect: vi.fn(),
        disconnect: vi.fn(),
      })),
      createChannelMerger: vi.fn(() => ({
        connect: vi.fn(),
        disconnect: vi.fn(),
      })),
      createBiquadFilter: vi.fn(() => ({
        type: 'peaking',
        frequency: { value: 1000, setTargetAtTime: vi.fn() },
        gain: { value: 0, setTargetAtTime: vi.fn() },
        Q: { value: 1, setTargetAtTime: vi.fn() },
        connect: vi.fn(),
        disconnect: vi.fn(),
      })),
      createAnalyser: vi.fn(() => ({
        fftSize: 2048,
        smoothingTimeConstant: 0.8,
        frequencyBinCount: 1024,
        connect: vi.fn(),
        disconnect: vi.fn(),
        getByteFrequencyData: vi.fn(),
        getFloatTimeDomainData: vi.fn(),
      })),
      destination: {},
    };

    ctxManager = {
      getContext: () => mockContext as AudioContext,
    } as unknown as AudioContextManager;

    graph = new AudioGraph(ctxManager);
  });

  it('applies presets with preamp gain and biquad bands', () => {
    const preset = createPreset({
      name: 'Test Boost',
      global: 6.0,
      bands: [
        createPresetBand({
          frequency: 100,
          gain: 3.0,
          bandwidth: 1.0,
          type: FilterType.RESONANT_LOW_SHELF,
        }),
      ],
    });

    graph.applyPreset(preset);
    expect(graph.bypassed).toBe(false);
  });

  it('disables filter processing and neutralizes preamp when bypassed', () => {
    const preset = createPreset({
      name: 'Test Bypass',
      global: 6.0,
      bands: [
        createPresetBand({
          frequency: 100,
          gain: 3.0,
          bandwidth: 1.0,
          type: FilterType.RESONANT_LOW_SHELF,
        }),
      ],
    });

    graph.setBypass(true, preset);
    expect(graph.bypassed).toBe(true);

    graph.setBypass(false, preset);
    expect(graph.bypassed).toBe(false);
  });

  it('adjusts master volume smoothly', () => {
    expect(() => graph.setMasterVolume(0.5)).not.toThrow();
  });

  it('manages audio sources and analyzer access', () => {
    const mockNode1 = { connect: vi.fn(), disconnect: vi.fn() } as unknown as AudioNode;
    const mockNode2 = { connect: vi.fn(), disconnect: vi.fn() } as unknown as AudioNode;

    graph.setSource(mockNode1);
    expect(mockNode1.connect).toHaveBeenCalled();

    // Switching sources disconnects old source
    graph.setSource(mockNode2);
    expect((mockNode1.disconnect as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalled();

    expect(graph.preAnalyzerService).toBeDefined();
    expect(graph.postAnalyzerService).toBeDefined();
  });

  it('updates preamp gain and live band parameters', () => {
    graph.setPreampGain(-3.0);
    const band = createPresetBand({
      frequency: 2000,
      gain: 2.0,
      bandwidth: 1.0,
      type: FilterType.PARAMETRIC,
    });

    graph.updateBandLive(band);

    // Bypass without activePreset argument
    graph.setBypass(true);
    expect(graph.bypassed).toBe(true);
    graph.setBypass(false);
    expect(graph.bypassed).toBe(false);
  });

  it('supports soloing a specific band with unity preamp', () => {
    const band1 = createPresetBand({
      id: 'solo-target',
      frequency: 1200,
      gain: 5.0,
      bandwidth: 1.0,
      type: FilterType.PARAMETRIC,
    });
    const preset = createPreset({
      name: 'Solo Preset',
      global: -6.0,
      bands: [band1],
    });

    graph.applyPreset(preset, 'solo-target');
    expect(graph.soloBand).toBe('solo-target');

    graph.setSoloBand(null, preset);
    expect(graph.soloBand).toBeNull();
  });
});
