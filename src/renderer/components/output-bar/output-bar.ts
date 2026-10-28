/**
 * Dedicated System Audio Output Bar Component.
 * Automatically follows macOS System Audio Output (speakers, wired earphones, AirPods,
 * USB DACs, Bluetooth headphones) without requiring manual device selection in the app.
 * Features Audiophile IEM Suite controls: A/B Slot Auditioning, Global EQ Intensity Scaling,
 * and Precision Stereo Phase & Peak/RMS Telemetry.
 */

import { EqualizerStore } from '../../state/equalizer-store.js';
import { LevelMeter } from '../audio-source/level-meter.js';
import type { OutputDeviceInfo } from '../../../preload/preload-types.js';

export class OutputBar {
  private readonly container: HTMLElement;
  private readonly store: EqualizerStore;
  private levelMeter!: LevelMeter;
  private statusTextEl!: HTMLElement;
  private btnSlotA!: HTMLButtonElement;
  private btnSlotB!: HTMLButtonElement;
  private btnCopyAB!: HTMLButtonElement;
  private scaleSlider!: HTMLInputElement;
  private scaleReadout!: HTMLElement;
  private bypassBtn!: HTMLButtonElement;
  private unsubscribeStore: (() => void) | null = null;
  private unsubscribeDevices: (() => void) | null = null;
  private boundDeviceChange: (() => void) | null = null;

  constructor(container: HTMLElement, store: EqualizerStore) {
    this.container = container;
    this.store = store;

    this.render();
    this.setupListeners();
    this.loadOutputDevices();
    this.setupSubscriptions();
  }

  private render(): void {
    this.container.className = 'output-bar';
    this.container.innerHTML = `
      <div class="output-target-group">
        <div class="output-status-badge" title="CoreAudio automatically follows macOS system output">
          <span class="status-dot-active"></span>
          <span id="output-status-text" class="status-text">System Output EQ Active</span>
        </div>

        <div class="ab-compare-group" title="Instant A/B Preset Auditioning">
          <span class="ctrl-sublabel">SLOT</span>
          <div class="ab-btn-pill">
            <button id="btn-slot-a" class="btn-slot active" type="button" title="Switch to Audition Slot A">A</button>
            <button id="btn-slot-b" class="btn-slot" type="button" title="Switch to Audition Slot B">B</button>
          </div>
          <button id="btn-copy-ab" class="btn-copy-slot" type="button" title="Copy active slot settings to other slot">A→B</button>
        </div>
      </div>

      <div class="output-controls-group">
        <label class="eq-scale-container" title="Global EQ gain intensity scale (0% = flat, 100% = normal, 200% = double)">
          <span class="scale-label">Scale:</span>
          <input type="range" id="eq-scale-slider" min="0" max="2.0" step="0.05" value="1.0" class="scale-slider">
          <span id="scale-readout" class="scale-readout">100%</span>
        </label>

        <button id="btn-eq-bypass" class="btn-bypass" title="Toggle EQ Processing / Passthrough">
          BYPASS
        </button>

        <div id="meter-anchor"></div>
      </div>
    `;

    this.statusTextEl = this.container.querySelector('#output-status-text')!;
    this.btnSlotA = this.container.querySelector('#btn-slot-a')!;
    this.btnSlotB = this.container.querySelector('#btn-slot-b')!;
    this.btnCopyAB = this.container.querySelector('#btn-copy-ab')!;
    this.scaleSlider = this.container.querySelector('#eq-scale-slider')!;
    this.scaleReadout = this.container.querySelector('#scale-readout')!;
    this.bypassBtn = this.container.querySelector('#btn-eq-bypass')!;

    const meterAnchor = this.container.querySelector('#meter-anchor') as HTMLElement;
    this.levelMeter = new LevelMeter(meterAnchor);
  }

  private setupListeners(): void {
    this.btnSlotA.addEventListener('click', () => {
      this.store.switchSlot('A');
    });

    this.btnSlotB.addEventListener('click', () => {
      this.store.switchSlot('B');
    });

    this.btnCopyAB.addEventListener('click', () => {
      const active = this.store.getState().activeSlot;
      if (active === 'A') {
        this.store.copySlot('A', 'B');
      } else {
        this.store.copySlot('B', 'A');
      }
      this.btnCopyAB.classList.add('copied');
      setTimeout(() => this.btnCopyAB?.classList.remove('copied'), 400);
    });

    this.scaleSlider.addEventListener('input', () => {
      const scale = parseFloat(this.scaleSlider.value);
      this.scaleReadout.textContent = `${Math.round(scale * 100)}%`;
      this.store.setEqScale(scale);
    });

    this.bypassBtn.addEventListener('click', () => {
      this.store.toggleGlobalBypass();
      const isBypassed = this.store.getState().isBypassed;
      if (window.electronAPI?.setNativeBypass) {
        window.electronAPI.setNativeBypass(isBypassed);
      }
    });

    // Subscribe to live CoreAudio hot-plug notifications from NativeAudioManager
    if (window.electronAPI?.onOutputDevicesChanged) {
      this.unsubscribeDevices = window.electronAPI.onOutputDevicesChanged((payload) => {
        this.syncMacOutputStatus(payload.devices, payload.activeDeviceId);
      });
    }

    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.addEventListener) {
      this.boundDeviceChange = () => {
        this.loadOutputDevices();
      };
      navigator.mediaDevices.addEventListener('devicechange', this.boundDeviceChange);
    }
  }

  private async loadOutputDevices(): Promise<void> {
    if (window.electronAPI) {
      try {
        const res = await window.electronAPI.getOutputDevices();
        if (res.success) {
          this.syncMacOutputStatus(res.devices, res.activeDeviceId);
        }
      } catch {
        // Fallback default status remains
      }
    }
  }

  private syncMacOutputStatus(
    devices: readonly OutputDeviceInfo[],
    activeDeviceId?: number
  ): void {
    const activeDev =
      (activeDeviceId !== undefined
        ? devices.find((d) => d.id === activeDeviceId)
        : undefined) ?? devices[0];

    if (this.statusTextEl) {
      this.statusTextEl.textContent = activeDev
        ? `System Output EQ Active · ${activeDev.name}`
        : 'System Output EQ Active';
    }
  }

  private setupSubscriptions(): void {
    this.unsubscribeStore = this.store.subscribe((state) => {
      this.bypassBtn.classList.toggle('active', state.isBypassed);
      this.bypassBtn.textContent = state.isBypassed ? 'BYPASSED' : 'BYPASS';

      const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
      if (this.scaleSlider && activeEl !== this.scaleSlider) {
        this.scaleSlider.value = String(state.eqScale);
      }
      if (this.scaleReadout) {
        this.scaleReadout.textContent = `${Math.round(state.eqScale * 100)}%`;
      }

      if (this.btnSlotA && this.btnSlotB) {
        this.btnSlotA.classList.toggle('active', state.activeSlot === 'A');
        this.btnSlotB.classList.toggle('active', state.activeSlot === 'B');
      }
      if (this.btnCopyAB) {
        this.btnCopyAB.textContent = state.activeSlot === 'A' ? 'A→B' : 'B→A';
        this.btnCopyAB.title =
          state.activeSlot === 'A'
            ? 'Copy Slot A settings to Slot B'
            : 'Copy Slot B settings to Slot A';
      }
    });
  }

  public setTelemetryLevels(
    peakLOrMax: number,
    peakROrRms: number,
    rmsL?: number,
    rmsR?: number
  ): void {
    this.levelMeter.setTelemetryLevels(peakLOrMax, peakROrRms, rmsL, rmsR);
  }

  public destroy(): void {
    if (this.unsubscribeStore) {
      this.unsubscribeStore();
      this.unsubscribeStore = null;
    }
    if (this.unsubscribeDevices) {
      this.unsubscribeDevices();
      this.unsubscribeDevices = null;
    }
    if (
      this.boundDeviceChange &&
      typeof navigator !== 'undefined' &&
      navigator.mediaDevices?.removeEventListener
    ) {
      navigator.mediaDevices.removeEventListener('devicechange', this.boundDeviceChange);
      this.boundDeviceChange = null;
    }
    this.levelMeter.destroy();
  }
}
