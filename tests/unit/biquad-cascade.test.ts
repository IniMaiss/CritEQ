import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BiquadCascadeNode } from '../../src/renderer/audio/biquad-cascade-node.js';
import { createPresetBand } from '../../src/models/preset-band.js';
import { FilterType } from '../../src/models/filter-type.js';
import { AudioChannel } from '../../src/models/audio-channel.js';

describe('BiquadCascadeNode Web Audio Integration', () => {
  let mockContext: unknown;
  let cascade: BiquadCascadeNode;

  beforeEach(() => {
    mockContext = {
      currentTime: 0,
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
    };

    cascade = new BiquadCascadeNode(mockContext as AudioContext);
  });

  it('initializes with direct passthrough connection', () => {
    expect(cascade.input).toBeDefined();
    expect(cascade.output).toBeDefined();
    expect(cascade.activeStages).toHaveLength(0);
  });

  it('creates filter stages for active bands and skips bypassed bands (including notch)', () => {
    const activeBand = createPresetBand({
      frequency: 1000,
      gain: 4.0,
      bandwidth: 1.0,
      type: FilterType.PARAMETRIC,
      bypass: false,
    });

    const bypassedNotch = createPresetBand({
      frequency: 3000,
      gain: -128,
      bandwidth: 0.5,
      type: FilterType.BAND_STOP,
      bypass: true,
    });

    cascade.updateBands([activeBand, bypassedNotch]);

    // Only the active band should be in the active cascade stages!
    expect(cascade.activeStages).toHaveLength(1);
    expect(cascade.activeStages[0]?.bandId).toBe(activeBand.id);
  });

  it('updates parameters in-place without rebuilding when topology is identical', () => {
    const band1 = createPresetBand({
      id: 'band-1',
      frequency: 500,
      gain: 2.0,
      bandwidth: 1.0,
      type: FilterType.PARAMETRIC,
    });

    cascade.updateBands([band1]);
    const initialStage = cascade.activeStages[0];

    // Modify gain and freq on same band ID and type
    const modifiedBand1 = createPresetBand({
      id: 'band-1',
      frequency: 600,
      gain: 5.0,
      bandwidth: 1.2,
      type: FilterType.PARAMETRIC,
    });

    cascade.updateBands([modifiedBand1]);

    // Active stages must be the exact same node reference (no rebuild!)
    expect(cascade.activeStages[0]).toBe(initialStage);
    expect(initialStage?.leftFilter?.frequency.setTargetAtTime).toHaveBeenCalledWith(600, 0, 0.015);
    expect(initialStage?.leftFilter?.gain.setTargetAtTime).toHaveBeenCalledWith(5.0, 0, 0.015);
  });

  it('handles per-channel bands correctly', () => {
    const leftOnlyBand = createPresetBand({
      frequency: 1000,
      gain: 3.0,
      bandwidth: 1.0,
      type: FilterType.PARAMETRIC,
      channels: [AudioChannel.LEFT],
    });

    cascade.updateBands([leftOnlyBand]);

    expect(cascade.activeStages).toHaveLength(1);
    expect(cascade.activeStages[0]?.leftFilter).not.toBeNull();
    expect(cascade.activeStages[0]?.rightFilter).toBeNull();
  });

  it('instantiates all filter types (notch, low shelf, high shelf) and right-only channel', () => {
    const notchBand = createPresetBand({
      frequency: 2000,
      gain: -128,
      bandwidth: 0.5,
      type: FilterType.BAND_STOP,
    });
    const lowShelf = createPresetBand({
      frequency: 100,
      gain: 4.0,
      bandwidth: 1.0,
      type: FilterType.RESONANT_LOW_SHELF,
    });
    const highShelf = createPresetBand({
      frequency: 12000,
      gain: 3.0,
      bandwidth: 1.0,
      type: FilterType.RESONANT_HIGH_SHELF,
      channels: [AudioChannel.RIGHT],
    });

    cascade.updateBands([notchBand, lowShelf, highShelf]);
    expect(cascade.activeStages).toHaveLength(3);
    expect(cascade.activeStages[2]?.leftFilter).toBeNull();
    expect(cascade.activeStages[2]?.rightFilter).not.toBeNull();

    // Clear bands to direct passthrough
    cascade.updateBands([]);
    expect(cascade.activeStages).toHaveLength(0);
  });

  it('isolates a soloed band using bandpass, lowpass, or highpass filter stages', () => {
    const band1 = createPresetBand({
      id: 'b-peak',
      frequency: 1000,
      gain: 6.0,
      bandwidth: 1.0,
      type: FilterType.PARAMETRIC,
    });
    const band2 = createPresetBand({
      id: 'b-low',
      frequency: 120,
      gain: 4.0,
      bandwidth: 1.0,
      type: FilterType.RESONANT_LOW_SHELF,
    });
    const band3 = createPresetBand({
      id: 'b-high',
      frequency: 8000,
      gain: -3.0,
      bandwidth: 1.0,
      type: FilterType.RESONANT_HIGH_SHELF,
    });

    cascade.updateBands([band1, band2, band3], 'b-peak');
    expect(cascade.activeStages).toHaveLength(1);
    expect(cascade.activeStages[0]?.bandId).toBe('b-peak');
    expect(cascade.activeStages[0]?.leftFilter?.type).toBe('bandpass');

    // Live update while soloed updates frequency and Q smoothly
    cascade.updateBands([{ ...band1, frequency: 1500, bandwidth: 0.7 }, band2, band3], 'b-peak');
    expect(cascade.activeStages[0]?.leftFilter?.frequency.setTargetAtTime).toHaveBeenCalledWith(1500, 0, 0.015);

    // Low shelf solo uses lowpass
    cascade.updateBands([band1, band2, band3], 'b-low');
    expect(cascade.activeStages).toHaveLength(1);
    expect(cascade.activeStages[0]?.leftFilter?.type).toBe('lowpass');

    // High shelf solo uses highpass
    cascade.updateBands([band1, band2, band3], 'b-high');
    expect(cascade.activeStages).toHaveLength(1);
    expect(cascade.activeStages[0]?.leftFilter?.type).toBe('highpass');
  });
});
