/**
 * Real-time Dual L/R Stereo Peak and RMS Level Meter.
 * Provides precision audiophile monitoring telemetry in high-contrast Neobrutalist design.
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
            <div class="meter-track" title="Left Channel Peak & RMS Level">
              <div class="meter-fill peak" id="meter-peak-l"></div>
              <div class="meter-fill rms" id="meter-rms-l"></div>
            </div>
          </div>
          <div class="meter-single-ch" title="Right Channel Output Level">
            <span class="ch-tag">R</span>
            <div class="meter-track" title="Right Channel Peak & RMS Level">
              <div class="meter-fill peak" id="meter-peak-r"></div>
              <div class="meter-fill rms" id="meter-rms-r"></div>
            </div>
          </div>
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
      if (this.rmsFillL?.style) {
        this.rmsFillL.style.width = `${rLPct}%`;
        this.rmsFillL.style.borderRightWidth = rLPct > 0 ? '2px' : '0px';
      }
      if (this.rmsFillR?.style) {
        this.rmsFillR.style.width = `${rRPct}%`;
        this.rmsFillR.style.borderRightWidth = rRPct > 0 ? '2px' : '0px';
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
