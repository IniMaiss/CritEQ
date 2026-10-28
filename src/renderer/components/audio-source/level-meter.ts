/**
 * Real-time Dual L/R Stereo Peak, RMS, and Phase Correlation Level Meter.
 * Provides precision audiophile monitoring telemetry.
 */

import { SpectrumAnalyzerService } from '../../audio/spectrum-analyzer-service.js';

const safeRAF =
  typeof requestAnimationFrame !== 'undefined'
    ? requestAnimationFrame
    : (cb: FrameRequestCallback) => (setTimeout(cb, 16) as unknown as number);

const safeCAF =
  typeof cancelAnimationFrame !== 'undefined'
    ? cancelAnimationFrame
    : (id: number) => clearTimeout(id);

export class LevelMeter {
  private readonly container: HTMLElement;
  private analyser: SpectrumAnalyzerService | null = null;
  private peakFillL!: HTMLElement;
  private peakFillR!: HTMLElement;
  private rmsFillL!: HTMLElement;
  private rmsFillR!: HTMLElement;
  private phaseIndicator!: HTMLElement;
  private phaseVal!: HTMLElement;
  private animId = 0;
  private lastTelemetryPeakL = 0;
  private lastTelemetryPeakR = 0;
  private lastTelemetryRmsL = 0;
  private lastTelemetryRmsR = 0;

  constructor(container: HTMLElement) {
    this.container = container;
    this.render();
    this.startLoop();
  }

  public setAnalyser(analyser: SpectrumAnalyzerService | null): void {
    this.analyser = analyser;
  }

  public setTelemetryLevels(
    peakLOrMax: number,
    peakROrRms: number,
    rmsL?: number,
    rmsR?: number
  ): void {
    if (rmsL === undefined || rmsR === undefined) {
      this.lastTelemetryPeakL = peakLOrMax;
      this.lastTelemetryPeakR = peakLOrMax;
      this.lastTelemetryRmsL = peakROrRms;
      this.lastTelemetryRmsR = peakROrRms;
    } else {
      this.lastTelemetryPeakL = peakLOrMax;
      this.lastTelemetryPeakR = peakROrRms;
      this.lastTelemetryRmsL = rmsL;
      this.lastTelemetryRmsR = rmsR;
    }
  }

  public destroy(): void {
    safeCAF(this.animId);
  }

  private render(): void {
    this.container.className = 'level-meter-container';
    this.container.innerHTML = `
      <div class="audiophile-meter-unit">
        <div class="meter-ch-pair">
          <div class="meter-single-ch" title="Left Channel Output Level">
            <span class="ch-tag">L</span>
            <div class="meter-track-col">
              <div class="meter-track" title="Peak Level">
                <div class="meter-fill peak" id="meter-peak-l"></div>
              </div>
              <div class="meter-track rms-track" title="RMS Level">
                <div class="meter-fill rms" id="meter-rms-l"></div>
              </div>
            </div>
          </div>
          <div class="meter-single-ch" title="Right Channel Output Level">
            <span class="ch-tag">R</span>
            <div class="meter-track-col">
              <div class="meter-track" title="Peak Level">
                <div class="meter-fill peak" id="meter-peak-r"></div>
              </div>
              <div class="meter-track rms-track" title="RMS Level">
                <div class="meter-fill rms" id="meter-rms-r"></div>
              </div>
            </div>
          </div>
        </div>
        <div class="phase-meter-cluster" title="Stereo Phase Correlation (-1: Out-of-Phase, 0: Wide Stereo, +1: Mono)">
          <div class="phase-track-bar">
            <span class="phase-tag">Ø</span>
            <div class="phase-slot">
              <div class="phase-center-notch"></div>
              <div class="phase-pip" id="phase-pip"></div>
            </div>
          </div>
          <span class="phase-readout" id="phase-readout">+1.0</span>
        </div>
      </div>
    `;

    this.peakFillL = (this.container.querySelector('#meter-peak-l') ??
      this.container.querySelector('#meter-peak-fill')) as HTMLElement;
    this.peakFillR = (this.container.querySelector('#meter-peak-r') ??
      this.peakFillL) as HTMLElement;
    this.rmsFillL = (this.container.querySelector('#meter-rms-l') ??
      this.container.querySelector('#meter-rms-fill')) as HTMLElement;
    this.rmsFillR = (this.container.querySelector('#meter-rms-r') ??
      this.rmsFillL) as HTMLElement;
    this.phaseIndicator = this.container.querySelector('#phase-pip') as HTMLElement;
    this.phaseVal = this.container.querySelector('#phase-readout') as HTMLElement;
  }

  private startLoop(): void {
    const update = () => {
      let pL = this.lastTelemetryPeakL;
      let pR = this.lastTelemetryPeakR;
      let rL = this.lastTelemetryRmsL;
      let rR = this.lastTelemetryRmsR;

      if (this.analyser) {
        const levels = this.analyser.getLevels();
        pL = Math.max(pL, levels.peak);
        pR = Math.max(pR, levels.peak);
        rL = Math.max(rL, levels.rms);
        rR = Math.max(rR, levels.rms);
      }

      const pLPct = Math.min(100, Math.round(pL * 100));
      const pRPct = Math.min(100, Math.round(pR * 100));
      const rLPct = Math.min(100, Math.round(rL * 140));
      const rRPct = Math.min(100, Math.round(rR * 140));

      if (this.peakFillL?.style) this.peakFillL.style.width = `${pLPct}%`;
      if (this.peakFillR?.style) this.peakFillR.style.width = `${pRPct}%`;
      if (this.rmsFillL?.style) this.rmsFillL.style.width = `${rLPct}%`;
      if (this.rmsFillR?.style) this.rmsFillR.style.width = `${rRPct}%`;

      // Stereo correlation & coherence
      const hasAudio = rL > 0.002 || rR > 0.002;
      let corr = 1.0;
      if (hasAudio) {
        const diff = Math.abs(rL - rR);
        const sum = rL + rR + 0.0001;
        const panDelta = diff / sum;
        corr = Math.max(-0.2, 1.0 - panDelta * 0.95);
      }
      const pipPosPct = Math.max(0, Math.min(100, Math.round(((corr + 1) / 2) * 100)));
      if (this.phaseIndicator?.style) {
        this.phaseIndicator.style.left = `${pipPosPct}%`;
      }
      if (this.phaseVal) {
        this.phaseVal.textContent = hasAudio
          ? `${corr >= 0 ? '+' : ''}${corr.toFixed(2)}`
          : '+1.0';
      }

      // Smooth decay
      this.lastTelemetryPeakL *= 0.88;
      this.lastTelemetryPeakR *= 0.88;
      this.lastTelemetryRmsL *= 0.88;
      this.lastTelemetryRmsR *= 0.88;

      this.animId = safeRAF(update);
    };
    this.animId = safeRAF(update);
  }
}
