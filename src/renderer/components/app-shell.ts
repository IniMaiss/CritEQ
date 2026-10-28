/**
 * CritEQ Application Shell.
 * Dedicated Output-Only Architecture:
 * Equalizes macOS system audio output directly via native CoreAudio tap engine,
 * rendering the real-time FFT spectrum waveform at 60 FPS on the canvas curve
 * and automatically persisting all EQ settings across window closes and app restarts.
 */

import { AudioContextManager } from '../audio/audio-context-manager.js';
import { AudioGraph } from '../audio/audio-graph.js';
import { EqualizerStore } from '../state/equalizer-store.js';
import { PresetBar } from './presets/preset-bar.js';
import { OutputBar } from './output-bar/output-bar.js';
import { FrequencyCurveCanvas } from './curve/frequency-curve-canvas.js';
import { BandTable } from './bands/band-table.js';

export class AppShell {
  private readonly root: HTMLElement;
  private readonly ctxManager: AudioContextManager;
  private readonly graph: AudioGraph;
  private readonly store: EqualizerStore;

  private presetBar!: PresetBar;
  private outputBar!: OutputBar;
  private curveCanvas!: FrequencyCurveCanvas;
  private bandTable!: BandTable;
  private curveEl!: HTMLElement;
  private dividerEl!: HTMLElement;
  private bottomEl!: HTMLElement;
  private unsubscribeTelemetry: (() => void) | null = null;
  private unsubscribeStore: (() => void) | null = null;
  private lastSyncedBandsRef: unknown = null;
  private lastSyncedGlobal: number | null = null;
  private lastSyncedScale: number | null = null;
  private lastSyncedBypass: boolean | null = null;
  private lastSyncedSoloBandId: string | null = null;
  private diskSaveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.ctxManager = new AudioContextManager();
    this.graph = new AudioGraph(this.ctxManager);
    this.store = new EqualizerStore();
    this.store.enableSessionPersistence();

    this.render();
    this.initSubsystems();
    this.initDividerDrag();
    this.initNativeBridge();
    this.loadPersistedPresets();
  }

  private render(): void {
    this.root.className = 'app-container';
    this.root.innerHTML = `
      <header class="app-header" id="app-header"></header>
      <section class="output-bar-container" id="output-bar-container"></section>
      <div class="eqm-workspace" id="eqm-workspace">
        <main class="curve-viewport" id="curve-viewport"></main>
        <div class="eqm-divider" id="eqm-divider" title="Drag to resize Graph and Bands"></div>
        <footer class="bottom-panel" id="bottom-panel"></footer>
      </div>
    `;
  }

  private initSubsystems(): void {
    const headerEl = this.root.querySelector('#app-header') as HTMLElement;
    const outputEl = this.root.querySelector('#output-bar-container') as HTMLElement;
    this.curveEl = this.root.querySelector('#curve-viewport') as HTMLElement;
    this.dividerEl = this.root.querySelector('#eqm-divider') as HTMLElement;
    this.bottomEl = this.root.querySelector('#bottom-panel') as HTMLElement;

    this.presetBar = new PresetBar(headerEl, this.store);
    this.outputBar = new OutputBar(outputEl, this.store);

    this.curveCanvas = new FrequencyCurveCanvas(this.curveEl, {
      onBandChange: (band) => {
        this.store.updateBand(band);
        this.graph.updateBandLive(band);
      },
      onBandSelect: (id) => this.store.selectBand(id),
      onBandToggleBypass: (id) => {
        this.store.toggleBandBypass(id);
      },
      onBandToggleSolo: (id) => {
        this.store.toggleSoloBand(id);
      },
      onBandSetSolo: (id) => {
        this.store.setSoloBand(id);
      },
      onBandHover: (id) => {
        this.store.setHighlightedBand(id);
      },
      onAddBandAt: (freq, gain) => {
        this.store.addBandAt({ frequency: freq, gain });
      },
      onEditBand: (id) => {
        this.bandTable.openBandDialog(id);
      },
      onRemoveBand: (id) => {
        this.store.removeBand(id);
      },
    });

    // Native audio telemetry drives spectrum analysis directly in Output-Only mode
    this.curveCanvas.setAnalyser(null);

    this.bandTable = new BandTable(this.bottomEl, this.store);

    // Sync Store changes to Audio Graph, Native Engine, Disk Persistence, and Canvas
    this.unsubscribeStore = this.store.subscribe((state) => {
      this.graph.applyPreset(state.activePreset, state.soloBandId);
      this.graph.setBypass(state.isBypassed, state.activePreset);
      this.syncNativeBands();

      const ratio = state.graphToBandsFlexRatio;
      this.curveEl.style.flex = `${Math.round(ratio)}`;
      this.bottomEl.style.flex = `${Math.round(100 - ratio)}`;

      this.curveCanvas.updateData(
        state.activePreset.bands,
        state.activePreset.global,
        state.selectedBandId,
        this.graph.context.sampleRate,
        state.isBypassed,
        {
          soloBandId: state.soloBandId,
          highlightedBandId: state.highlightedBandId,
          dehighlightedBuckets: state.dehighlightedBuckets,
          spectrumType: state.spectrumType,
          spectrumDiff: state.spectrumDiff,
          eqScale: state.eqScale,
        }
      );
    });

    // Pre-resume audio context if needed
    this.ctxManager.resume().catch(() => {});
  }

  private initDividerDrag(): void {
    const workspace = this.root.querySelector('#eqm-workspace') as HTMLElement;
    const onMouseMove = (e: MouseEvent) => {
      const rect = workspace.getBoundingClientRect();
      if (rect.height <= 0) return;
      const ratioPct = ((e.clientY - rect.top) / rect.height) * 100;
      this.store.setGraphToBandsFlexRatio(ratioPct);
    };
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    this.dividerEl.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  }

  /**
   * Connect native CoreAudio tap telemetry (FFT & stereo meters) to the Canvas visualizer.
   */
  private initNativeBridge(): void {
    if (window.electronAPI?.onTelemetry) {
      this.unsubscribeTelemetry = window.electronAPI.onTelemetry((telemetry) => {
        if (telemetry.fft && telemetry.fft.length > 0) {
          this.curveCanvas.setTelemetryFft(telemetry.fft);
        }
        this.outputBar.setTelemetryLevels(
          telemetry.peakL,
          telemetry.peakR,
          telemetry.rmsL,
          telemetry.rmsR
        );
      });
    }

    // Initial sync of default/restored preset bands to native engine
    this.syncNativeBands();
  }

  /**
   * Sync active bands, preamp, and global bypass state to the native DSP biquad cascade
   * and schedule automatic disk persistence when DSP parameters change.
   */
  private syncNativeBands(): void {
    const state = this.store.getState();
    const scale = state.eqScale ?? 1.0;
    const bandsChanged =
      state.activePreset.bands !== this.lastSyncedBandsRef ||
      state.activePreset.global !== this.lastSyncedGlobal ||
      scale !== this.lastSyncedScale;
    const soloChanged = state.soloBandId !== this.lastSyncedSoloBandId;
    const bypassChanged = state.isBypassed !== this.lastSyncedBypass;

    if (bandsChanged || soloChanged) {
      this.lastSyncedBandsRef = state.activePreset.bands;
      this.lastSyncedGlobal = state.activePreset.global;
      this.lastSyncedScale = scale;
      this.lastSyncedSoloBandId = state.soloBandId;
      if (window.electronAPI?.updateNativeBands) {
        const scaledBands = state.activePreset.bands.map((b) => ({
          ...b,
          gain: parseFloat((b.gain * scale).toFixed(2)),
        }));
        const scaledPreamp = parseFloat((state.activePreset.global * scale).toFixed(2));
        window.electronAPI.updateNativeBands(
          scaledBands,
          scaledPreamp,
          state.soloBandId
        );
      }
      if (bandsChanged) {
        this.scheduleDiskSave();
      }
    }

    if (bypassChanged) {
      this.lastSyncedBypass = state.isBypassed;
      if (window.electronAPI?.setNativeBypass) {
        window.electronAPI.setNativeBypass(state.isBypassed);
      }
    }
  }

  private scheduleDiskSave(): void {
    if (!window.electronAPI?.saveUserPresets) return;
    if (this.diskSaveTimer) {
      clearTimeout(this.diskSaveTimer);
    }
    this.diskSaveTimer = setTimeout(() => {
      this.diskSaveTimer = null;
      const state = this.store.getState();
      window.electronAPI?.saveUserPresets(
        state.presets.filter((p) => !p.isDefault),
        state.activePreset
      );
    }, 200);
  }

  private async loadPersistedPresets(): Promise<void> {
    if (window.electronAPI) {
      try {
        const res = await window.electronAPI.loadUserPresets();
        if (res.success && (res.presets.length > 0 || res.activePreset)) {
          this.store.restoreDiskSession(res.presets, res.activePreset);
          this.syncNativeBands();
        }
      } catch {
        // Fallback default presets remain active
      }
    }
  }

  public destroy(): void {
    if (this.diskSaveTimer) {
      clearTimeout(this.diskSaveTimer);
      this.diskSaveTimer = null;
    }
    if (this.unsubscribeTelemetry) {
      this.unsubscribeTelemetry();
      this.unsubscribeTelemetry = null;
    }
    if (this.unsubscribeStore) {
      this.unsubscribeStore();
      this.unsubscribeStore = null;
    }
    this.presetBar.destroy();
    this.bandTable.destroy();
    this.curveCanvas.destroy();
    this.outputBar.destroy();
  }
}
