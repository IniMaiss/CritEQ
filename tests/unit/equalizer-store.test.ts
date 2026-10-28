import { describe, it, expect } from 'vitest';
import { EqualizerStore } from '../../src/renderer/state/equalizer-store.js';
import { createPresetBand } from '../../src/models/preset-band.js';
import { FilterType } from '../../src/models/filter-type.js';

describe('EqualizerStore', () => {
  it('initializes with only the single flat 0 dB workspace and enables subscription', () => {
    const store = new EqualizerStore();
    const state = store.getState();

    expect(state.activePreset).toBeDefined();
    expect(state.activePreset.name).toBe('Flat');
    expect(state.presets).toHaveLength(1);
    expect(state.isBypassed).toBe(false);

    let observedPresetName = '';
    const unsub = store.subscribe((s) => {
      observedPresetName = s.activePreset.name;
    });

    expect(observedPresetName).toBe('Flat');
    unsub();
  });

  it('selects custom presets and switches active bands', () => {
    const store = new EqualizerStore();
    const custom = store.savePreset('Custom User Profile');
    store.selectPreset('preset-default-flat');
    expect(store.getState().activePreset.id).toBe('preset-default-flat');

    store.selectPreset(custom.id);
    expect(store.getState().activePreset.id).toBe(custom.id);
    expect(store.getState().activePreset.name).toBe('Custom User Profile');
  });

  it('updates preamp gain with boundary clamping', () => {
    const store = new EqualizerStore();
    store.setPreamp(6.5);
    expect(store.getState().activePreset.global).toBe(6.5);

    store.setPreamp(99); // Clamps to +24 dB
    expect(store.getState().activePreset.global).toBe(24);
  });

  it('adds, updates, toggles bypass, and removes filter bands', () => {
    const store = new EqualizerStore();
    const initialBandCount = store.getState().activePreset.bands.length;

    store.addBand();
    expect(store.getState().activePreset.bands.length).toBe(initialBandCount + 1);

    const targetBand = store.getState().activePreset.bands[0]!;
    store.toggleBandBypass(targetBand.id);
    expect(store.getState().activePreset.bands[0]?.bypass).toBe(!targetBand.bypass);

    const modified = createPresetBand({
      ...targetBand,
      gain: 4.5,
    });
    store.updateBand(modified);
    expect(store.getState().activePreset.bands[0]?.gain).toBe(4.5);
    // Preamp (global) must NEVER drop when turning up a band
    expect(store.getState().activePreset.global).toBe(0);

    store.removeBand(targetBand.id);
    expect(store.getState().activePreset.bands.length).toBe(initialBandCount);
    expect(store.getState().activePreset.global).toBe(0);
  });

  it('saves new custom presets and deletes them without affecting default presets', () => {
    const store = new EqualizerStore();
    const custom = store.savePreset('My Acoustic Mix');

    expect(custom.id).toBeDefined();
    expect(custom.isDefault).toBe(false);
    expect(store.getState().activePreset.name).toBe('My Acoustic Mix');

    // Deleting default preset does nothing
    store.deletePreset('preset-default-flat');
    expect(store.getState().presets.some((p) => p.id === 'preset-default-flat')).toBe(true);

    // Deleting custom preset works
    store.deletePreset(custom.id);
    expect(store.getState().presets.some((p) => p.id === custom.id)).toBe(false);
  });

  it('navigates to adjacent preset (up or down) when deleting the active preset', () => {
    const store = new EqualizerStore();

    // Setup: Create 3 custom presets: P1 (index 1), P2 (index 2), P3 (index 3)
    const p1 = store.savePreset('Preset 1');
    const p2 = store.savePreset('Preset 2');
    const p3 = store.savePreset('Preset 3');

    // 1. Deleting middle active preset (P2, index 2) -> should move UP to P1 (index 1)
    store.selectPreset(p2.id);
    expect(store.getState().activePreset.id).toBe(p2.id);
    store.deletePreset(p2.id);
    expect(store.getState().activePreset.id).toBe(p1.id);
    expect(store.getState().activePreset.name).toBe('Preset 1');

    // List is now: Flat (0), P1 (1), P3 (2)
    // 2. Deleting last active preset (P3, index 2) -> should move UP to P1 (index 1)
    store.selectPreset(p3.id);
    expect(store.getState().activePreset.id).toBe(p3.id);
    store.deletePreset(p3.id);
    expect(store.getState().activePreset.id).toBe(p1.id);
    expect(store.getState().activePreset.name).toBe('Preset 1');

    // Add another preset P4 so list is: Flat (0), P1 (1), P4 (2)
    const p4 = store.savePreset('Preset 4');
    // 3. Deleting first custom preset (P1, index 1) when preset below exists -> should move DOWN to P4, NOT Flat
    store.selectPreset(p1.id);
    expect(store.getState().activePreset.id).toBe(p1.id);
    store.deletePreset(p1.id);
    expect(store.getState().activePreset.id).toBe(p4.id);
    expect(store.getState().activePreset.name).toBe('Preset 4');

    // List is now: Flat (0), P4 (1)
    // 4. Deleting the sole custom preset (P4, index 1) -> must fall back to Flat
    expect(store.getState().activePreset.id).toBe(p4.id);
    store.deletePreset(p4.id);
    expect(store.getState().activePreset.id).toBe('preset-default-flat');
    expect(store.getState().activePreset.name).toBe('Flat');

    // 5. Deleting an inactive preset does not alter the active preset
    const extra = store.savePreset('Extra Preset');
    store.selectPreset('preset-default-flat');
    expect(store.getState().activePreset.name).toBe('Flat');
    store.deletePreset(extra.id);
    expect(store.getState().activePreset.name).toBe('Flat');
  });

  it('handles global bypass, volume, audio source, and preset imports', () => {
    const store = new EqualizerStore();

    store.toggleGlobalBypass();
    expect(store.getState().isBypassed).toBe(true);
    store.toggleGlobalBypass();
    expect(store.getState().isBypassed).toBe(false);

    store.setMasterVolume(1.2);
    expect(store.getState().masterVolume).toBe(1.2);

    store.setAudioSource('file');
    expect(store.getState().audioSourceType).toBe('file');

    store.setAudioSource('desktop', 'screen:1:0');
    expect(store.getState().selectedDesktopSourceId).toBe('screen:1:0');

    store.setAudioSource('input-device', 'mic-1');
    expect(store.getState().selectedInputDeviceId).toBe('mic-1');

    store.selectBand('non-existent');
    expect(store.getState().selectedBandId).toBe('non-existent');

    const imported = [
      store.savePreset('Imported Profile 1'),
      store.savePreset('Imported Profile 2'),
    ];
    store.importPresets(imported, true);
    expect(store.getState().activePreset.name).toBe('Imported Profile 1');
    expect(store.getState().presets.length).toBeGreaterThanOrEqual(3);

    // Empty import does nothing
    store.importPresets([]);
    expect(store.getState().activePreset.name).toBe('Imported Profile 1');
  });

  it('supports eqMac Expert Equalizer options (auto global gain, styles, units, spectrum, highlights, flex ratio)', () => {
    const store = new EqualizerStore();
    store.addBandAt({ frequency: 1000, gain: 8.5, type: FilterType.PARAMETRIC });

    // Enabling autoAdjustGlobalGain sets preamp to -8.5 dB
    store.setAutoAdjustGlobalGain(true);
    expect(store.getState().autoAdjustGlobalGain).toBe(true);
    expect(store.getState().activePreset.global).toBe(-8.5);

    // Manually setting preamp disables autoAdjustGlobalGain
    store.setPreamp(2.0);
    expect(store.getState().autoAdjustGlobalGain).toBe(false);
    expect(store.getState().activePreset.global).toBe(2.0);

    store.setBandsStyle('flat');
    expect(store.getState().bandsStyle).toBe('flat');

    store.setControlsStyle('graph');
    expect(store.getState().controlsStyle).toBe('graph');

    store.setBandwidthUnit('OCTAVES');
    expect(store.getState().bandwidthUnit).toBe('OCTAVES');

    store.setSpectrumType('line');
    expect(store.getState().spectrumType).toBe('line');

    store.setSpectrumDiff(false);
    expect(store.getState().spectrumDiff).toBe(false);

    store.setHighlightedBand('band-1', ['left']);
    expect(store.getState().highlightedBandId).toBe('band-1');
    expect(store.getState().dehighlightedBuckets).toEqual(['left']);

    // Calling with same args is a no-op
    store.setHighlightedBand('band-1', ['left']);
    expect(store.getState().highlightedBandId).toBe('band-1');

    store.setGraphToBandsFlexRatio(65);
    expect(store.getState().graphToBandsFlexRatio).toBe(65);

    // Resetting active preset restores factory default
    store.resetActivePreset();
    expect(store.getState().activePreset.global).toBe(0);

    // Restoring disk session preserves activePreset and custom presets
    const customPreset = store.savePreset('Persisted Custom');
    store.setPreamp(-3.5);
    const modifiedCustom = store.getState().activePreset;

    const freshStore = new EqualizerStore();
    freshStore.restoreDiskSession([customPreset], modifiedCustom);
    expect(freshStore.getState().activePreset.name).toBe('Persisted Custom');
    expect(freshStore.getState().activePreset.global).toBe(-3.5);
    freshStore.resetActivePreset();
    expect(freshStore.getState().activePreset.global).toBe(0);

    // restoreDiskSession without activePreset and with orphan activePreset
    freshStore.restoreDiskSession([customPreset]);
    const orphanPreset = { ...customPreset, id: 'orphan-id', name: 'Orphan Preset' };
    freshStore.restoreDiskSession([customPreset], orphanPreset);
    expect(freshStore.getState().activePreset.id).toBe('orphan-id');

    // LocalStorage session persistence round-trip
    const storageMap = new Map<string, string>();
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: {
        getItem: (k: string) => storageMap.get(k) ?? null,
        setItem: (k: string, v: string) => storageMap.set(k, v),
      },
    };

    const s1 = new EqualizerStore();
    s1.enableSessionPersistence();
    s1.setPreamp(5.0);
    s1.setBandsStyle('flat');
    s1.setBandwidthUnit('OCTAVES');
    s1.setSpectrumType('line');

    const s2 = new EqualizerStore();
    s2.enableSessionPersistence();
    expect(s2.getState().activePreset.global).toBe(5.0);
    expect(s2.getState().bandsStyle).toBe('flat');
    expect(s2.getState().bandwidthUnit).toBe('OCTAVES');
    expect(s2.getState().spectrumType).toBe('line');

    // Stale removed default preset in disk session or localStorage falls back to Flat
    const staleDefault = {
      id: 'preset-default-removed',
      name: 'Removed Default',
      global: -3.0,
      isDefault: true,
      bands: [],
    };
    s2.restoreDiskSession([staleDefault], staleDefault);
    expect(s2.getState().activePreset.id).toBe('preset-default-flat');
    expect(s2.getState().presets.some((p) => p.id === 'preset-default-removed')).toBe(false);

    storageMap.set(
      'eqmac_expert_eq_session_v1',
      JSON.stringify({
        presets: [staleDefault],
        activePreset: staleDefault,
      })
    );
    const s3 = new EqualizerStore();
    s3.enableSessionPersistence();
    expect(s3.getState().activePreset.id).toBe('preset-default-flat');
    expect(s3.getState().presets.some((p) => p.id === 'preset-default-removed')).toBe(false);
  });

  it('toggles, sets, and clears soloBandId when bands or presets change', () => {
    const store = new EqualizerStore();
    const firstBand = store.getState().activePreset.bands[0]!;
    const secondBand = store.getState().activePreset.bands[1]!;

    expect(store.getState().soloBandId).toBeNull();

    store.toggleSoloBand(firstBand.id);
    expect(store.getState().soloBandId).toBe(firstBand.id);

    // Toggling another band switches solo to that band
    store.toggleSoloBand(secondBand.id);
    expect(store.getState().soloBandId).toBe(secondBand.id);

    // Toggling the same band unsolos it
    store.toggleSoloBand(secondBand.id);
    expect(store.getState().soloBandId).toBeNull();

    // Direct setSoloBand and invalid ID handling
    store.setSoloBand(firstBand.id);
    expect(store.getState().soloBandId).toBe(firstBand.id);
    store.setSoloBand('non-existent-band');
    expect(store.getState().soloBandId).toBeNull();

    // Removing the soloed band clears soloBandId
    store.setSoloBand(firstBand.id);
    store.removeBand(firstBand.id);
    expect(store.getState().soloBandId).toBeNull();

    // Switching presets clears soloBandId
    const remainingBand = store.getState().activePreset.bands[0]!;
    store.setSoloBand(remainingBand.id);
    const saved = store.savePreset('Custom For Solo Test');
    expect(store.getState().soloBandId).toBeNull();

    store.setSoloBand(saved.bands[0]!.id);
    store.selectPreset('preset-default-flat');
    expect(store.getState().soloBandId).toBeNull();
  });
});
