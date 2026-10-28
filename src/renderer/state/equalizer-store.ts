/**
 * Immutable Equalizer Application State Store.
 * Centralized, reactive state for active presets, custom presets, and CritEQ mastering UI configuration.
 */

import { createPreset, ExpertEqualizerPreset } from '../../models/preset.js';
import { ExpertEqualizerPresetBand, createPresetBand } from '../../models/preset-band.js';
import { FilterType } from '../../models/filter-type.js';
import { AudioChannel } from '../../models/audio-channel.js';
import { DEFAULT_PRESETS } from '../../repository/default-presets.js';
import { clamp } from '../../common/math.js';

export type AudioSourceType = 'desktop' | 'input-device' | 'file' | 'tone';
export type BandsStyle = 'mixer' | 'flat';
export type ControlsStyle = 'both' | 'graph' | 'sliders';
export type BandwidthDisplayUnit = 'Q' | 'OCTAVES';
export type SpectrumDisplayType = 'bar' | 'line';
export type ChannelBucket = 'all' | 'left' | 'right';

export interface EqualizerState {
  readonly activePreset: Readonly<ExpertEqualizerPreset>;
  readonly presets: readonly Readonly<ExpertEqualizerPreset>[];
  readonly selectedBandId: string | null;
  readonly soloBandId: string | null;
  readonly highlightedBandId: string | null;
  readonly dehighlightedBuckets: readonly ChannelBucket[];
  readonly isBypassed: boolean;
  readonly autoAdjustGlobalGain: boolean;
  readonly bandsStyle: BandsStyle;
  readonly controlsStyle: ControlsStyle;
  readonly bandwidthUnit: BandwidthDisplayUnit;
  readonly spectrumType: SpectrumDisplayType;
  readonly spectrumDiff: boolean;
  readonly graphToBandsFlexRatio: number;
  readonly masterVolume: number;
  readonly audioSourceType: AudioSourceType;
  readonly selectedDesktopSourceId: string | null;
  readonly selectedInputDeviceId: string | null;
  readonly eqScale: number;
  readonly slotA: Readonly<ExpertEqualizerPreset> | null;
  readonly slotB: Readonly<ExpertEqualizerPreset> | null;
  readonly activeSlot: 'A' | 'B';
}

export type StoreListener = (state: Readonly<EqualizerState>) => void;

const SESSION_STORAGE_KEY = 'eqmac_expert_eq_session_v1';

export class EqualizerStore {
  private state: Readonly<EqualizerState>;
  private readonly listeners: Set<StoreListener> = new Set();
  private persistToStorage = false;

  constructor(initialPresets: readonly Readonly<ExpertEqualizerPreset>[] = DEFAULT_PRESETS) {
    const flatPreset = initialPresets[0] ?? DEFAULT_PRESETS[0]!;
    this.state = Object.freeze({
      activePreset: flatPreset,
      presets: Object.freeze([...initialPresets]),
      selectedBandId: flatPreset.bands[0]?.id ?? null,
      soloBandId: null,
      highlightedBandId: null,
      dehighlightedBuckets: Object.freeze([]),
      isBypassed: false,
      autoAdjustGlobalGain: false,
      bandsStyle: 'mixer',
      controlsStyle: 'both',
      bandwidthUnit: 'Q',
      spectrumType: 'bar',
      spectrumDiff: true,
      graphToBandsFlexRatio: 45,
      masterVolume: 0.85,
      audioSourceType: 'desktop',
      selectedDesktopSourceId: null,
      selectedInputDeviceId: null,
      eqScale: 1.0,
      slotA: flatPreset,
      slotB: null,
      activeSlot: 'A',
    });
  }

  public getState(): Readonly<EqualizerState> {
    return this.state;
  }

  public subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private setState(next: Readonly<EqualizerState>): void {
    this.state = Object.freeze(next);
    if (this.persistToStorage) {
      this.saveSessionToLocalStorage();
    }
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  private syncActiveInPresets(
    updatedActive: Readonly<ExpertEqualizerPreset>
  ): readonly Readonly<ExpertEqualizerPreset>[] {
    const exists = this.state.presets.some((p) => p.id === updatedActive.id);
    if (!exists) {
      return Object.freeze([...this.state.presets, updatedActive]);
    }
    return Object.freeze(
      this.state.presets.map((p) => (p.id === updatedActive.id ? updatedActive : p))
    );
  }

  /**
   * Enables automatic session persistence to window.localStorage and restores any saved session immediately.
   */
  public enableSessionPersistence(): void {
    this.persistToStorage = true;
    try {
      const storage = typeof window !== 'undefined' ? window.localStorage : undefined;
      const raw = storage?.getItem(SESSION_STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as Partial<EqualizerState>;
      const restoredPresets = this.mergeWithDefaultPresets(parsed.presets ?? []);
      const candidateActive = createPreset(parsed.activePreset ?? this.state.activePreset);
      const isStaleDefault =
        candidateActive.isDefault && !DEFAULT_PRESETS.some((d) => d.id === candidateActive.id);
      const rawActive = isStaleDefault
        ? (restoredPresets[0] ?? this.state.activePreset)
        : candidateActive;

      // Clear any negative global gain left over from legacy autoAdjustGlobalGain sessions
      const restoredActive =
        parsed.autoAdjustGlobalGain && rawActive.global < 0
          ? createPreset({ ...rawActive, global: 0 })
          : rawActive;

      this.setState({
        ...this.state,
        ...parsed,
        autoAdjustGlobalGain: false,
        presets: Object.freeze(
          restoredPresets.map((p) => (p.id === restoredActive.id ? restoredActive : p))
        ),
        activePreset: restoredActive,
        selectedBandId: restoredActive.bands[0]?.id ?? null,
      });
    } catch {
      // Ignore storage errors
    }
  }

  private saveSessionToLocalStorage(): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const snapshot = {
          activePreset: this.state.activePreset,
          presets: this.state.presets,
          isBypassed: this.state.isBypassed,
          autoAdjustGlobalGain: this.state.autoAdjustGlobalGain,
          bandsStyle: this.state.bandsStyle,
          controlsStyle: this.state.controlsStyle,
          bandwidthUnit: this.state.bandwidthUnit,
          spectrumType: this.state.spectrumType,
          spectrumDiff: this.state.spectrumDiff,
          graphToBandsFlexRatio: this.state.graphToBandsFlexRatio,
          masterVolume: this.state.masterVolume,
        };
        window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(snapshot));
      }
    } catch {
      // Ignore storage quota / access errors
    }
  }

  private mergeWithDefaultPresets(
    saved: readonly ExpertEqualizerPreset[]
  ): Readonly<ExpertEqualizerPreset>[] {
    const savedById = new Map(saved.map((p) => [p.id, createPreset(p)]));
    const merged: Readonly<ExpertEqualizerPreset>[] = [];

    for (const def of DEFAULT_PRESETS) {
      merged.push(savedById.get(def.id) ?? def);
      savedById.delete(def.id);
    }
    for (const custom of savedById.values()) {
      if (!custom.isDefault) {
        merged.push(custom);
      }
    }
    return merged;
  }

  /**
   * Restores presets and optional activePreset loaded from userData/presets.json on disk.
   */
  public restoreDiskSession(
    customPresets: readonly ExpertEqualizerPreset[],
    activePreset?: ExpertEqualizerPreset
  ): void {
    const merged = this.mergeWithDefaultPresets([
      ...this.state.presets,
      ...customPresets,
      ...(activePreset ? [activePreset] : []),
    ]);
    const candidateActive = activePreset ? createPreset(activePreset) : this.state.activePreset;
    const isStaleDefault =
      candidateActive.isDefault && !DEFAULT_PRESETS.some((d) => d.id === candidateActive.id);
    const rawNextActive = isStaleDefault ? (merged[0] ?? this.state.activePreset) : candidateActive;

    // Recover from legacy auto-preamp negative global offset on the default Flat workspace
    let maxPosBandGain = 0;
    for (const b of rawNextActive.bands) {
      if (!b.bypass && b.type !== FilterType.BAND_STOP && b.gain > maxPosBandGain) {
        maxPosBandGain = b.gain;
      }
    }
    const nextActive =
      rawNextActive.isDefault &&
      maxPosBandGain > 0 &&
      Math.abs(rawNextActive.global + maxPosBandGain) < 0.05
        ? createPreset({ ...rawNextActive, global: 0 })
        : rawNextActive;
    const syncedPresets = merged.map((p) => (p.id === nextActive.id ? nextActive : p));

    this.setState({
      ...this.state,
      presets: Object.freeze(syncedPresets),
      activePreset: nextActive,
      selectedBandId: nextActive.bands[0]?.id ?? null,
    });
  }

  /**
   * Resets the currently active preset back to factory defaults (or 0 dB flat for custom presets).
   */
  public resetActivePreset(): void {
    const currentId = this.state.activePreset.id;
    const factoryMatch = DEFAULT_PRESETS.find((p) => p.id === currentId);
    const resetPreset = factoryMatch
      ? createPreset({ ...factoryMatch })
      : createPreset({
          ...this.state.activePreset,
          global: 0,
          bands: this.state.activePreset.bands.map((b) =>
            createPresetBand({ ...b, gain: 0, bypass: false })
          ),
        });

    this.setState({
      ...this.state,
      activePreset: resetPreset,
      presets: this.syncActiveInPresets(resetPreset),
      selectedBandId: resetPreset.bands[0]?.id ?? null,
    });
  }

  /**
   * Computes automatic preamp gain (-highestPositiveGain) when autoAdjustGlobalGain is active.
   */
  private computeAutoGlobalGain(
    bands: readonly Readonly<ExpertEqualizerPresetBand>[],
    currentGlobal: number,
    autoEnabled: boolean
  ): number {
    if (!autoEnabled) return currentGlobal;
    let maxPositiveGain = 0;
    for (const b of bands) {
      if (!b.bypass && b.type !== FilterType.BAND_STOP && b.gain > maxPositiveGain) {
        maxPositiveGain = b.gain;
      }
    }
    return clamp(maxPositiveGain > 0 ? -maxPositiveGain : 0, -24, 24);
  }

  public selectPreset(id: string): void {
    const target = this.state.presets.find((p) => p.id === id);
    if (!target) return;
    this.setState({
      ...this.state,
      activePreset: target,
      selectedBandId: target.bands[0]?.id ?? null,
      soloBandId: null,
    });
  }

  public setPreamp(dB: number): void {
    const clampedDb = clamp(dB, -24, 24);
    const updated = createPreset({
      ...this.state.activePreset,
      global: clampedDb,
    });
    this.setState({
      ...this.state,
      autoAdjustGlobalGain: false,
      activePreset: updated,
      presets: this.syncActiveInPresets(updated),
    });
  }

  public setAutoAdjustGlobalGain(enabled: boolean): void {
    const nextGlobal = this.computeAutoGlobalGain(
      this.state.activePreset.bands,
      this.state.activePreset.global,
      enabled
    );
    const updated = createPreset({
      ...this.state.activePreset,
      global: nextGlobal,
    });
    this.setState({
      ...this.state,
      autoAdjustGlobalGain: enabled,
      activePreset: updated,
      presets: this.syncActiveInPresets(updated),
    });
  }

  public updateBand(band: Readonly<ExpertEqualizerPresetBand>): void {
    const newBands = this.state.activePreset.bands.map((b) =>
      b.id === band.id ? band : b
    );
    const updated = createPreset({
      ...this.state.activePreset,
      bands: newBands,
    });
    this.setState({
      ...this.state,
      activePreset: updated,
      presets: this.syncActiveInPresets(updated),
    });
  }

  public addBand(): void {
    const defaultFreqs = [100, 250, 500, 1000, 2000, 4000, 8000, 12000];
    const existingCount = this.state.activePreset.bands.length;
    const freq = defaultFreqs[existingCount % defaultFreqs.length] ?? 1000;
    this.addBandAt({ frequency: freq, gain: 0, bandwidth: 1.0, type: FilterType.PARAMETRIC });
  }

  public addBandAt(params: {
    frequency?: number;
    gain?: number;
    bandwidth?: number;
    type?: FilterType;
    bypass?: boolean;
    channels?: readonly AudioChannel[] | undefined;
    color?: string | undefined;
  } = {}): Readonly<ExpertEqualizerPresetBand> {
    const newBand = createPresetBand({
      frequency: clamp(Math.round(params.frequency ?? 1000), 10, 24000),
      gain: clamp(params.gain ?? 0, -24, 24),
      bandwidth: clamp(params.bandwidth ?? 1.0, 0.05, 5.0),
      type: params.type ?? FilterType.PARAMETRIC,
      bypass: params.bypass ?? false,
      channels: params.channels,
      color: params.color,
    });

    const newBands = [...this.state.activePreset.bands, newBand].sort(
      (a, b) => a.frequency - b.frequency
    );
    const updated = createPreset({
      ...this.state.activePreset,
      bands: newBands,
    });

    this.setState({
      ...this.state,
      activePreset: updated,
      presets: this.syncActiveInPresets(updated),
      selectedBandId: newBand.id,
      highlightedBandId: newBand.id,
    });
    return newBand;
  }

  public removeBand(bandId: string): void {
    const newBands = this.state.activePreset.bands.filter((b) => b.id !== bandId);
    const updated = createPreset({
      ...this.state.activePreset,
      bands: newBands,
    });
    this.setState({
      ...this.state,
      activePreset: updated,
      presets: this.syncActiveInPresets(updated),
      selectedBandId: newBands[0]?.id ?? null,
      soloBandId: this.state.soloBandId === bandId ? null : this.state.soloBandId,
      highlightedBandId:
        this.state.highlightedBandId === bandId ? null : this.state.highlightedBandId,
    });
  }

  public toggleBandBypass(bandId: string): void {
    const band = this.state.activePreset.bands.find((b) => b.id === bandId);
    if (!band) return;
    this.updateBand({ ...band, bypass: !band.bypass });
  }

  public setSoloBand(bandId: string | null): void {
    if (bandId !== null && !this.state.activePreset.bands.some((b) => b.id === bandId)) {
      this.setState({ ...this.state, soloBandId: null });
      return;
    }
    this.setState({ ...this.state, soloBandId: bandId });
  }

  public toggleSoloBand(bandId: string): void {
    const nextSolo = this.state.soloBandId === bandId ? null : bandId;
    this.setSoloBand(nextSolo);
  }

  public selectBand(bandId: string | null): void {
    this.setState({ ...this.state, selectedBandId: bandId });
  }

  public setHighlightedBand(
    bandId: string | null,
    dehighlightedBuckets: readonly ChannelBucket[] = []
  ): void {
    if (
      this.state.highlightedBandId === bandId &&
      this.state.dehighlightedBuckets.length === dehighlightedBuckets.length
    ) {
      return;
    }
    this.setState({
      ...this.state,
      highlightedBandId: bandId,
      dehighlightedBuckets: Object.freeze([...dehighlightedBuckets]),
    });
  }

  public setBandsStyle(style: BandsStyle): void {
    this.setState({ ...this.state, bandsStyle: style });
  }

  public setControlsStyle(style: ControlsStyle): void {
    this.setState({ ...this.state, controlsStyle: style });
  }

  public setBandwidthUnit(unit: BandwidthDisplayUnit): void {
    this.setState({ ...this.state, bandwidthUnit: unit });
  }

  public setSpectrumType(type: SpectrumDisplayType): void {
    this.setState({ ...this.state, spectrumType: type });
  }

  public setSpectrumDiff(enabled: boolean): void {
    this.setState({ ...this.state, spectrumDiff: enabled });
  }

  public setGraphToBandsFlexRatio(ratio: number): void {
    this.setState({ ...this.state, graphToBandsFlexRatio: clamp(ratio, 20, 80) });
  }

  public toggleGlobalBypass(): void {
    this.setState({ ...this.state, isBypassed: !this.state.isBypassed });
  }

  public setMasterVolume(volume: number): void {
    this.setState({ ...this.state, masterVolume: clamp(volume, 0.0, 1.5) });
  }

  public setEqScale(scale: number): void {
    const clamped = clamp(scale, 0.0, 2.0);
    this.setState({ ...this.state, eqScale: clamped });
  }

  public switchSlot(slot: 'A' | 'B'): void {
    if (slot === this.state.activeSlot) return;
    if (slot === 'A') {
      const targetPreset = this.state.slotA ?? this.state.activePreset;
      this.setState({
        ...this.state,
        activeSlot: 'A',
        slotB: this.state.activePreset,
        activePreset: targetPreset,
        selectedBandId: targetPreset.bands[0]?.id ?? null,
      });
    } else {
      const targetPreset = this.state.slotB ?? this.state.activePreset;
      this.setState({
        ...this.state,
        activeSlot: 'B',
        slotA: this.state.activePreset,
        activePreset: targetPreset,
        selectedBandId: targetPreset.bands[0]?.id ?? null,
      });
    }
  }

  public copySlot(from: 'A' | 'B', to: 'A' | 'B'): void {
    if (from === to) return;
    if (to === 'B') {
      this.setState({ ...this.state, slotB: this.state.activePreset });
    } else {
      this.setState({ ...this.state, slotA: this.state.activePreset });
    }
  }

  public setAudioSource(type: AudioSourceType, id: string | null = null): void {
    this.setState({
      ...this.state,
      audioSourceType: type,
      selectedDesktopSourceId: type === 'desktop' ? id : this.state.selectedDesktopSourceId,
      selectedInputDeviceId: type === 'input-device' ? id : this.state.selectedInputDeviceId,
    });
  }

  public savePreset(name: string): ExpertEqualizerPreset {
    const saved = createPreset({
      name: name.trim() || 'Custom Preset',
      global: this.state.activePreset.global,
      bands: this.state.activePreset.bands,
      isDefault: false,
    });

    const updatedPresets = [...this.state.presets, saved];
    this.setState({
      ...this.state,
      activePreset: saved,
      presets: Object.freeze(updatedPresets),
      selectedBandId: saved.bands[0]?.id ?? null,
      soloBandId: null,
    });
    return saved;
  }

  public deletePreset(id: string): void {
    const deleteIndex = this.state.presets.findIndex((p) => p.id === id);
    if (deleteIndex < 0) return;
    const toDelete = this.state.presets[deleteIndex];
    if (!toDelete || toDelete.isDefault) return; // Prevent deleting factory defaults

    const updatedPresets = this.state.presets.filter((p) => p.id !== id);

    // Determine adjacent preset: prefer moving up to previous preset (non-Flat),
    // or moving down to the preset below, or falling back to Flat if only Flat remains
    let nextPreset: ExpertEqualizerPreset;
    if (deleteIndex - 1 > 0) {
      nextPreset = updatedPresets[deleteIndex - 1]!;
    } else if (deleteIndex < updatedPresets.length) {
      nextPreset = updatedPresets[deleteIndex]!;
    } else if (deleteIndex - 1 >= 0) {
      nextPreset = updatedPresets[deleteIndex - 1]!;
    } else {
      nextPreset = updatedPresets[0] ?? DEFAULT_PRESETS[0]!;
    }

    const isCurrentActive = this.state.activePreset.id === id;
    const nextActive = isCurrentActive ? nextPreset : this.state.activePreset;

    this.setState({
      ...this.state,
      presets: Object.freeze(updatedPresets),
      activePreset: nextActive,
      soloBandId: isCurrentActive ? null : this.state.soloBandId,
      selectedBandId: isCurrentActive
        ? nextActive.bands[0]?.id ?? null
        : this.state.selectedBandId,
    });
  }

  public importPresets(imported: readonly ExpertEqualizerPreset[], autoSelect = true): void {
    if (imported.length === 0) return;
    const existingIds = new Set(this.state.presets.map((p) => p.id));
    const deduplicated = imported.map((p) => {
      if (existingIds.has(p.id)) {
        return createPreset({ ...p, id: crypto.randomUUID() });
      }
      return p;
    });

    const combined = [...this.state.presets, ...deduplicated];
    const nextActive = autoSelect && deduplicated[0] ? deduplicated[0] : this.state.activePreset;

    this.setState({
      ...this.state,
      presets: Object.freeze(combined),
      activePreset: nextActive,
      selectedBandId: nextActive.bands[0]?.id ?? null,
    });
  }
}
