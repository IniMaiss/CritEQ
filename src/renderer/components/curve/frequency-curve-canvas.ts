/**
 * Interactive CritEQ Mastering Graph & Real-Time Spectrum Analyzer.
 * Modern clean-room parametric equalizer canvas:
 * - 10 Hz .. 24 kHz logarithmic domain with 31 grid lines & axis labels
 * - Individual translucent rainbow-colored bell/shelf/notch curves per band
 * - Per-channel-bucket ('all', 'left', 'right') composite gain-sum curves with L/R labels
 * - Bar & Line Spectrum Analyzer with green/red EQ boost/cut diff shading
 * - Curve-area & node-handle dragging, wheel bandwidth control, double-click to add band,
 *   right-click context menu (Add Band, Enable/Disable, Edit Band, Remove Band), and fullscreen toggle.
 */

import { ExpertEqualizerPresetBand } from '../../../models/preset-band.js';
import { FilterType } from '../../../models/filter-type.js';
import { BWtoQ } from '../../../models/bandwidth-unit.js';
import { SpectrumAnalyzerService } from '../../audio/spectrum-analyzer-service.js';
import {
  freqToX,
  xToFreq,
  dbToY,
  yToDb,
  GRAPH_MIN_FREQ_HZ,
  GRAPH_MAX_FREQ_HZ,
  calculateSingleBandCurvePoints,
  calculateSoloBandCurvePoints,
  calculateBucketCompositeCurvePoints,
  smoothSpectrumBins,
  updatePeakHoldEnvelope,
  computeSplineControlPoints,
} from './curve-math.js';
import {
  EQMAC_COLORS,
  EQMAC_ICONS,
  getColorForFrequency,
  desaturateAndDarkenHex,
  formatEqMacFrequency,
  formatEqMacGain,
  getBandChannelBuckets,
} from './eqmac-colors.js';
import type {
  ChannelBucket,
  SpectrumDisplayType,
} from '../../state/equalizer-store.js';

export interface CurveCanvasCallbacks {
  readonly onBandChange: (band: ExpertEqualizerPresetBand) => void;
  readonly onBandSelect: (bandId: string) => void;
  readonly onBandToggleBypass: (bandId: string) => void;
  readonly onBandToggleSolo?: (bandId: string) => void;
  readonly onBandSetSolo?: (bandId: string | null) => void;
  readonly onBandHover?: (bandId: string | null) => void;
  readonly onAddBandAt?: (frequency: number, gain: number) => void;
  readonly onEditBand?: (bandId: string) => void;
  readonly onRemoveBand?: (bandId: string) => void;
}

const GRID_TICKS_HZ = [
  10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 200, 300, 400, 500, 600, 700, 800,
  1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 15000, 17500,
  20000, 24000,
];
const GRID_LABELS_HZ = [20, 40, 100, 200, 400, 1000, 2000, 4000, 10000, 20000];
const GRID_DBS = [-20, -15, -10, -5, 5, 10, 15, 20];
const VOLUME_TICKS = [20, 0, -20, -40, -60, -80];

export class FrequencyCurveCanvas {
  private readonly container: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly callbacks: CurveCanvasCallbacks;
  private contextMenuEl: HTMLElement | null = null;
  private expandBtnEl: HTMLButtonElement | null = null;
  private analyser: SpectrumAnalyzerService | null = null;

  private bands: readonly Readonly<ExpertEqualizerPresetBand>[] = [];
  private preampDb = 0;
  private sampleRate = 48000;
  private isBypassed = false;
  private selectedBandId: string | null = null;
  private soloBandId: string | null = null;
  private momentarySoloBandId: string | null = null;
  private soloButtonRect: { x: number; y: number; w: number; h: number; bandId: string } | null =
    null;
  private hoveredBandId: string | null = null;
  private externalHighlightedBandId: string | null = null;
  private dehighlightedBuckets: readonly ChannelBucket[] = [];
  private spectrumDiff = true;
  private draggedBandId: string | null = null;
  private eqScale = 1.0;

  private animationFrameId = 0;
  private readonly spectrumData = new Float32Array(128);
  private readonly smoothedSpectrum = new Float32Array(128);
  private readonly peakHoldData = new Float32Array(128);
  private readonly peakHoldTimers = new Uint16Array(128);
  private cachedBandCurves: Map<string, Float32Array> = new Map();
  private cachedBucketCurves: Map<ChannelBucket, Float32Array> = new Map();
  private resizeObserver: ResizeObserver | null = null;
  private readonly boundResize = () => this.handleResize();
  private readonly boundMouseUp = () => this.onMouseUp();
  private readonly boundCloseMenu = () => this.hideContextMenu();

  constructor(container: HTMLElement, callbacks: CurveCanvasCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'eq-curve-canvas';
    this.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;

    this.createOverlayControls();
    this.setupListeners();
    this.handleResize();
    this.startRenderLoop();
  }

  private createOverlayControls(): void {
    if (typeof document === 'undefined') return;

    // Top-left fullscreen expand icon (matches X5A in eqm-expert-eq-graph)
    const expandBtn = document.createElement('button');
    expandBtn.className = 'eqm-graph-fullscreen-btn';
    expandBtn.title = 'Toggle Fullscreen Mode';
    expandBtn.setAttribute('aria-label', 'Toggle Fullscreen Mode');
    expandBtn.innerHTML = EQMAC_ICONS.expand;
    expandBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      } else {
        this.container.requestFullscreen?.().catch(() => {});
      }
    });
    this.container.appendChild(expandBtn);
    this.expandBtnEl = expandBtn;

    // Right-click context menu (matches graphContextMenu in eqm-expert-eq-graph)
    const menu = document.createElement('div');
    menu.className = 'eqm-context-menu';
    menu.style.display = 'none';
    this.container.appendChild(menu);
    this.contextMenuEl = menu;
  }

  public setAnalyser(analyser: SpectrumAnalyzerService | null): void {
    this.analyser = analyser;
  }

  public setTelemetryFft(fft: readonly number[]): void {
    const n = fft.length;
    if (n === 0) return;
    const len = this.spectrumData.length;
    for (let i = 0; i < len; i++) {
      const srcIdx = (i / (len - 1)) * (n - 1);
      const i0 = Math.floor(srcIdx);
      const i1 = Math.min(n - 1, i0 + 1);
      const frac = srcIdx - i0;
      const v0 = fft[i0] ?? 0;
      const v1 = fft[i1] ?? 0;
      const target = v0 + (v1 - v0) * frac;
      const current = this.spectrumData[i] ?? 0;
      this.spectrumData[i] = current * 0.35 + target * 0.65;
    }
  }

  public updateData(
    bands: readonly Readonly<ExpertEqualizerPresetBand>[],
    preampDb: number,
    selectedBandId: string | null,
    sampleRate = 48000,
    isBypassed = false,
    options?: {
      soloBandId?: string | null;
      highlightedBandId?: string | null;
      dehighlightedBuckets?: readonly ChannelBucket[];
      spectrumType?: SpectrumDisplayType;
      spectrumDiff?: boolean;
      eqScale?: number;
    }
  ): void {
    this.bands = bands;
    this.preampDb = preampDb;
    this.selectedBandId = selectedBandId;
    this.sampleRate = sampleRate;
    this.isBypassed = isBypassed;
    if (options) {
      if (options.soloBandId !== undefined) {
        this.soloBandId = options.soloBandId;
      }
      if (options.highlightedBandId !== undefined) {
        this.externalHighlightedBandId = options.highlightedBandId;
      }
      if (options.dehighlightedBuckets !== undefined) {
        this.dehighlightedBuckets = options.dehighlightedBuckets;
      }
      if (options.spectrumDiff !== undefined) {
        this.spectrumDiff = options.spectrumDiff;
      }
      if (options.eqScale !== undefined) {
        this.eqScale = options.eqScale;
      }
    }
    this.recomputeCurvePoints();
  }

  public destroy(): void {
    cancelAnimationFrame(this.animationFrameId);
    window.removeEventListener('resize', this.boundResize);
    window.removeEventListener('mouseup', this.boundMouseUp);
    window.removeEventListener('click', this.boundCloseMenu);
    this.resizeObserver?.disconnect();
    this.expandBtnEl?.remove();
    this.contextMenuEl?.remove();
    this.canvas.remove();
  }

  private handleResize(): void {
    const rect = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(rect.width * dpr);
    this.canvas.height = Math.floor(rect.height * dpr);
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    if (typeof this.ctx.setTransform === 'function') {
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    this.ctx.scale(dpr, dpr);
    this.recomputeCurvePoints();
  }

  private recomputeCurvePoints(): void {
    const rect = this.container.getBoundingClientRect();
    const numPoints = Math.max(128, Math.floor(rect.width / 2));
    this.cachedBandCurves.clear();
    this.cachedBucketCurves.clear();

    const scale = this.eqScale;
    const effectiveBands =
      scale === 1.0
        ? this.bands
        : this.bands.map((b) => ({
            ...b,
            gain: b.gain * scale,
          }));
    const effectivePreamp = this.preampDb * scale;

    for (const band of effectiveBands) {
      this.cachedBandCurves.set(
        band.id,
        this.soloBandId === band.id
          ? calculateSoloBandCurvePoints(
              band,
              numPoints,
              this.sampleRate,
              GRAPH_MIN_FREQ_HZ,
              GRAPH_MAX_FREQ_HZ
            )
          : calculateSingleBandCurvePoints(
              band,
              numPoints,
              this.sampleRate,
              GRAPH_MIN_FREQ_HZ,
              GRAPH_MAX_FREQ_HZ
            )
      );
    }

    if (this.soloBandId) {
      const soloPoints = this.cachedBandCurves.get(this.soloBandId);
      if (soloPoints) {
        this.cachedBucketCurves.set('all', soloPoints);
      }
      return;
    }

    const activeBuckets = new Set<ChannelBucket>();
    activeBuckets.add('all');
    for (const band of effectiveBands) {
      if (!band.bypass) {
        for (const b of getBandChannelBuckets(band.channels)) {
          activeBuckets.add(b);
        }
      }
    }

    for (const bucket of activeBuckets) {
      this.cachedBucketCurves.set(
        bucket,
        calculateBucketCompositeCurvePoints(
          effectiveBands,
          effectivePreamp,
          numPoints,
          this.sampleRate,
          bucket,
          GRAPH_MIN_FREQ_HZ,
          GRAPH_MAX_FREQ_HZ
        )
      );
    }
  }

  private startRenderLoop(): void {
    const render = () => {
      this.draw();
      this.animationFrameId = requestAnimationFrame(render);
    };
    this.animationFrameId = requestAnimationFrame(render);
  }

  private draw(): void {
    const rect = this.container.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (w <= 0 || h <= 0) return;

    this.ctx.clearRect(0, 0, w, h);
    this.drawGridAndAxes(w, h);
    this.drawSpectrumAnalyzer(w, h);
    this.drawIndividualBandCurves(w, h);
    this.drawOverlayZeroLine(w, h);
    this.drawCompositeGainSumCurves(w, h);
    this.drawBandHandles(w, h);
  }

  /**
   * Draws 31-line logarithmic frequency grid, dB horizontal grid,
   * bottom Hz labels, right dB labels, and left Volume spectrum labels.
   */
  private drawGridAndAxes(w: number, h: number): void {
    this.ctx.save();

    // Subtle deep-studio vertical background vignette
    if (typeof this.ctx.createLinearGradient === 'function') {
      const bgGrad = this.ctx.createLinearGradient(0, 0, 0, h);
      bgGrad.addColorStop(0, '#0C0F17');
      bgGrad.addColorStop(0.5, '#080A0F');
      bgGrad.addColorStop(1, '#06080C');
      this.ctx.fillStyle = bgGrad;
      this.ctx.fillRect(0, 0, w, h);
    }

    this.ctx.lineWidth = 1;

    // 31 Vertical logarithmic frequency grid lines (major decades slightly brighter)
    for (const freq of GRID_TICKS_HZ) {
      const x = freqToX(freq, w, GRAPH_MIN_FREQ_HZ, GRAPH_MAX_FREQ_HZ);
      const isMajor = freq === 100 || freq === 1000 || freq === 10000;
      this.ctx.strokeStyle = isMajor
        ? 'rgba(148, 163, 184, 0.14)'
        : 'rgba(148, 163, 184, 0.055)';
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, h);
      this.ctx.stroke();
    }

    // Horizontal dB grid lines (-20 .. +20 dB)
    this.ctx.strokeStyle = 'rgba(148, 163, 184, 0.065)';
    for (const db of GRID_DBS) {
      const y = dbToY(db, h);
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(w, y);
      this.ctx.stroke();
    }

    // Axis text styling (clean tabular studio telemetry)
    this.ctx.fillStyle = 'rgba(168, 177, 194, 0.65)';
    this.ctx.font = '500 9px "JetBrains Mono", -apple-system, BlinkMacSystemFont, sans-serif';

    // Bottom frequency labels: [20, 40, 100, 200, 400, 1K, 2K, 4K, 10K, 20K]
    this.ctx.textAlign = 'center';
    for (const freq of GRID_LABELS_HZ) {
      const x = freqToX(freq, w, GRAPH_MIN_FREQ_HZ, GRAPH_MAX_FREQ_HZ);
      const label = freq < 1000 ? `${freq}` : `${freq / 1000}k`;
      this.ctx.fillText(label, x, h - 6);
    }

    // Right-side EQ dB labels: [-20dB .. +20dB]
    this.ctx.textAlign = 'right';
    for (const db of GRID_DBS) {
      const y = dbToY(db, h);
      const prefix = db > 0 ? '+' : '';
      this.ctx.fillText(`${prefix}${db}`, w - 7, y + 3);
    }

    // Left-side Spectrum Volume labels: [20dB, 0dB, -20dB, -40dB, -60dB, -80dB]
    this.ctx.fillStyle = 'rgba(126, 136, 155, 0.55)';
    this.ctx.textAlign = 'left';
    for (let i = 0; i < VOLUME_TICKS.length; i++) {
      const vDb = VOLUME_TICKS[i]!;
      const y = ((25 - vDb) / 115) * h;
      if (y >= 10 && y <= h - 16) {
        this.ctx.fillText(`${vDb}dB`, 7, y + 3);
      }
    }

    this.ctx.restore();
  }

  /**
   * Draws CritEQ's studio-grade Smooth Cubic Spline + Peak-Hold Trace Analyzer (FabFilter Pro-Q style).
   */
  private drawSpectrumAnalyzer(w: number, h: number): void {
    if (this.analyser) {
      this.analyser.getLogFrequencyData(this.spectrumData);
    }

    smoothSpectrumBins(this.spectrumData, this.smoothedSpectrum);
    updatePeakHoldEnvelope(this.smoothedSpectrum, this.peakHoldData, this.peakHoldTimers);

    const n = this.smoothedSpectrum.length;
    const sumCurve = this.cachedBucketCurves.get('all');
    const curveLen = sumCurve?.length ?? 0;

    // Check if there is any active signal or decaying peak hold
    let maxSignal = 0;
    for (let i = 0; i < n; i++) {
      const p = this.peakHoldData[i] ?? 0;
      if (p > maxSignal) maxSignal = p;
    }
    if (maxSignal <= 0.001) return;

    const xs: number[] = new Array(n);
    const preYs: number[] = new Array(n);
    const postYs: number[] = new Array(n);
    const peakYs: number[] = new Array(n);

    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * w;
      const baseVal = this.smoothedSpectrum[i] ?? 0;
      const peakVal = this.peakHoldData[i] ?? 0;
      const preY = h - baseVal * h * 0.86;

      let eqOffsetPx = 0;
      if (!this.isBypassed && sumCurve && curveLen > 0) {
        const cIdx = Math.min(curveLen - 1, Math.floor((i / (n - 1)) * (curveLen - 1)));
        const eqDb = sumCurve[cIdx] ?? 0;
        eqOffsetPx = (eqDb / 48) * h * 0.55;
      }

      xs[i] = x;
      preYs[i] = Math.max(4, Math.min(h, preY));
      postYs[i] = baseVal > 0.002 ? Math.max(4, Math.min(h, preY - eqOffsetPx)) : h;
      peakYs[i] = peakVal > 0.002 ? Math.max(3, Math.min(h, h - peakVal * h * 0.86 - eqOffsetPx)) : h;
    }

    const postSegments = computeSplineControlPoints(xs, postYs, 0.35);
    if (postSegments.length === 0) return;

    this.ctx.save();

    // 1. Pre-EQ ghost spline trace (subtle reference contour behind the post-EQ fill)
    if (this.spectrumDiff && !this.isBypassed) {
      const preSegments = computeSplineControlPoints(xs, preYs, 0.35);
      this.ctx.beginPath();
      this.ctx.moveTo(xs[0]!, preYs[0]!);
      for (const seg of preSegments) {
        this.ctx.bezierCurveTo(seg.cp1x, seg.cp1y, seg.cp2x, seg.cp2y, seg.x, seg.y);
      }
      this.ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
      this.ctx.lineWidth = 1.15;
      this.ctx.stroke();
    }

    // 2. Post-EQ Smooth Cubic Spline Silhouette Fill
    this.ctx.beginPath();
    this.ctx.moveTo(0, h);
    this.ctx.lineTo(xs[0]!, postYs[0]!);
    for (const seg of postSegments) {
      this.ctx.bezierCurveTo(seg.cp1x, seg.cp1y, seg.cp2x, seg.cp2y, seg.x, seg.y);
    }
    this.ctx.lineTo(w, h);
    this.ctx.closePath();

    const fillGrad = this.ctx.createLinearGradient(0, h * 0.14, 0, h);
    fillGrad.addColorStop(0, 'rgba(245, 166, 35, 0.30)');
    fillGrad.addColorStop(0.55, 'rgba(245, 166, 35, 0.12)');
    fillGrad.addColorStop(1, 'rgba(56, 189, 248, 0.02)');
    this.ctx.fillStyle = fillGrad;
    this.ctx.fill();

    // 3. Post-EQ Mastering Amber Spline Crest Stroke
    this.ctx.beginPath();
    this.ctx.moveTo(xs[0]!, postYs[0]!);
    for (const seg of postSegments) {
      this.ctx.bezierCurveTo(seg.cp1x, seg.cp1y, seg.cp2x, seg.cp2y, seg.x, seg.y);
    }
    this.ctx.strokeStyle = 'rgba(245, 166, 35, 0.85)';
    this.ctx.lineWidth = 1.6;
    this.ctx.stroke();

    // 4. Floating Peak-Hold Envelope Trace
    if (this.spectrumDiff) {
      const peakSegments = computeSplineControlPoints(xs, peakYs, 0.35);
      this.ctx.beginPath();
      this.ctx.moveTo(xs[0]!, peakYs[0]!);
      for (const seg of peakSegments) {
        this.ctx.bezierCurveTo(seg.cp1x, seg.cp1y, seg.cp2x, seg.cp2y, seg.x, seg.y);
      }
      this.ctx.strokeStyle = 'rgba(251, 113, 133, 0.72)';
      this.ctx.lineWidth = 1.15;
      this.ctx.stroke();
    }

    this.ctx.restore();
  }

  /**
   * Draws each band's individual translucent filled response curve (drawBand in eqm-expert-eq-graph).
   */
  private drawIndividualBandCurves(w: number, h: number): void {
    const activeHighlightId =
      this.draggedBandId ?? this.hoveredBandId ?? this.externalHighlightedBandId;
    const zeroY = dbToY(0, h);

    for (let i = 0; i < this.bands.length; i++) {
      const band = this.bands[i]!;
      const isBandSoloed = this.soloBandId === band.id;
      if (!isBandSoloed && band.gain === 0 && band.type !== FilterType.BAND_STOP) continue;

      const points = this.cachedBandCurves.get(band.id);
      if (!points || points.length < 2) continue;

      const isBandHighlighted = activeHighlightId === band.id || isBandSoloed;
      const isOtherBandHighlighted =
        (this.soloBandId !== null && !isBandSoloed) ||
        (activeHighlightId !== null && activeHighlightId !== band.id);
      const bandBuckets = getBandChannelBuckets(band.channels);
      const isChannelDehighlighted =
        this.dehighlightedBuckets.length > 0 &&
        bandBuckets.every((b) => this.dehighlightedBuckets.includes(b));

      let hexColor: string;
      if (this.isBypassed || band.bypass) {
        hexColor = '#777777';
      } else {
        const baseColor = band.color || getColorForFrequency(band.frequency);
        hexColor =
          isOtherBandHighlighted || isChannelDehighlighted
            ? desaturateAndDarkenHex(baseColor)
            : baseColor;
      }

      const numPoints = points.length;
      this.ctx.save();

      // Build closed path from (0, zeroY) along curve to (w, zeroY)
      this.ctx.beginPath();
      this.ctx.moveTo(0, zeroY);
      for (let p = 0; p < numPoints; p++) {
        const x = (p / (numPoints - 1)) * w;
        const y = dbToY(points[p] ?? 0, h);
        this.ctx.lineTo(x, y);
      }
      this.ctx.lineTo(w, zeroY);
      this.ctx.closePath();

      this.ctx.fillStyle = hexColor;
      this.ctx.globalAlpha = isBandHighlighted ? 0.65 : 0.45;
      this.ctx.fill();

      // Stroke top contour of individual band curve
      this.ctx.beginPath();
      for (let p = 0; p < numPoints; p++) {
        const x = (p / (numPoints - 1)) * w;
        const y = dbToY(points[p] ?? 0, h);
        if (p === 0) this.ctx.moveTo(x, y);
        else this.ctx.lineTo(x, y);
      }
      this.ctx.strokeStyle = hexColor;
      this.ctx.globalAlpha = isBandHighlighted ? 0.95 : 0.75;
      this.ctx.lineWidth = isBandHighlighted ? 2 : 1.25;
      this.ctx.stroke();

      this.ctx.restore();
    }
  }

  /**
   * Draws subtle mastering 0 dB reference line.
   */
  private drawOverlayZeroLine(w: number, h: number): void {
    const zeroY = dbToY(0, h);
    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(245, 166, 35, 0.32)';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(0, zeroY);
    this.ctx.lineTo(w, zeroY);
    this.ctx.stroke();
    this.ctx.restore();
  }

  /**
   * Draws composite gain-sum curves per channel bucket ('all', 'left', 'right')
   * with 'L' and 'R' start/end labels when per-channel bands are active.
   */
  private drawCompositeGainSumCurves(w: number, h: number): void {
    if (this.cachedBucketCurves.size === 0) {
      this.recomputeCurvePoints();
    }

    for (const [bucket, points] of this.cachedBucketCurves.entries()) {
      if (!points || points.length < 10) continue;

      // Only draw 'left' or 'right' curves if there are channel-specific bands for that bucket
      if (bucket !== 'all') {
        const hasSpecific = this.bands.some(
          (b) => !b.bypass && getBandChannelBuckets(b.channels).includes(bucket)
        );
        if (!hasSpecific) continue;
      }

      const isDehighlighted = this.dehighlightedBuckets.includes(bucket);
      const color =
        bucket === 'all'
          ? '#F8FAFC'
          : bucket === 'left'
            ? EQMAC_COLORS.leftChannel
            : EQMAC_COLORS.rightChannel;

      const numPoints = points.length;
      this.ctx.save();

      // Subtle warm amber mastering glow behind the main composite curve
      if (bucket === 'all' && !this.isBypassed && !isDehighlighted) {
        this.ctx.beginPath();
        for (let i = 0; i < numPoints; i++) {
          const x = (i / (numPoints - 1)) * w;
          const y = dbToY(points[i] ?? 0, h);
          if (i === 0) this.ctx.moveTo(x, y);
          else this.ctx.lineTo(x, y);
        }
        this.ctx.strokeStyle = 'rgba(245, 166, 35, 0.35)';
        this.ctx.lineWidth = 4.5;
        this.ctx.stroke();
      }

      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = bucket === 'all' ? 2.1 : 1.75;
      this.ctx.globalAlpha = this.isBypassed ? 0.28 : isDehighlighted ? 0.25 : 0.92;

      this.ctx.beginPath();
      for (let i = 0; i < numPoints; i++) {
        const x = (i / (numPoints - 1)) * w;
        const y = dbToY(points[i] ?? 0, h);
        if (i === 0) this.ctx.moveTo(x, y);
        else this.ctx.lineTo(x, y);
      }
      this.ctx.stroke();

      // Draw 'L' or 'R' channel bucket labels at start and end of curve
      if (bucket !== 'all') {
        const label = bucket === 'left' ? 'L' : 'R';
        this.ctx.fillStyle = color;
        this.ctx.font = '600 10px -apple-system, sans-serif';
        const yStart = dbToY(points[0] ?? 0, h) - 6;
        const yEnd = dbToY(points[numPoints - 1] ?? 0, h) - 6;
        this.ctx.textAlign = 'left';
        this.ctx.fillText(label, 28, Math.max(12, Math.min(h - 12, yStart)));
        this.ctx.textAlign = 'right';
        this.ctx.fillText(label, w - 34, Math.max(12, Math.min(h - 12, yEnd)));
      }

      this.ctx.restore();
    }
  }

  /**
   * Draws interactive Pro-Q style node markers at each band's peak (frequency, gain) and floating HUD for hovered/selected band.
   */
  private drawBandHandles(w: number, h: number): void {
    const activeHighlightId =
      this.draggedBandId ?? this.hoveredBandId ?? this.externalHighlightedBandId;
    this.soloButtonRect = null;

    for (let i = 0; i < this.bands.length; i++) {
      const band = this.bands[i]!;
      const x = freqToX(band.frequency, w, GRAPH_MIN_FREQ_HZ, GRAPH_MAX_FREQ_HZ);
      const effectiveGain = band.type === FilterType.BAND_STOP ? -22 : band.gain * this.eqScale;
      const y = dbToY(effectiveGain, h);
      const isSelected = band.id === this.selectedBandId;
      const isSoloed = band.id === this.soloBandId;
      const isHighlighted = band.id === activeHighlightId || isSoloed;
      const color =
        this.isBypassed || band.bypass
          ? '#64748B'
          : band.color || getColorForFrequency(band.frequency);

      this.ctx.save();
      if (this.soloBandId !== null && !isSoloed) {
        this.ctx.globalAlpha = 0.25;
      }

      // Outer precision selection/hover halo ring
      if (isSelected || isHighlighted) {
        this.ctx.beginPath();
        this.ctx.arc(x, y, isSoloed ? 12 : 10, 0, Math.PI * 2);
        this.ctx.fillStyle = isSoloed
          ? 'rgba(245, 166, 35, 0.28)'
          : 'rgba(245, 166, 35, 0.14)';
        this.ctx.fill();
        this.ctx.lineWidth = isSoloed ? 1.75 : 1.25;
        this.ctx.strokeStyle = isSoloed ? '#F5A623' : 'rgba(245, 166, 35, 0.75)';
        this.ctx.stroke();
      }

      // Main node body
      this.ctx.beginPath();
      this.ctx.arc(x, y, isHighlighted || isSelected ? 6 : 5, 0, Math.PI * 2);
      this.ctx.fillStyle = color;
      this.ctx.fill();
      this.ctx.lineWidth = 1.5;
      this.ctx.strokeStyle = '#080A0F';
      this.ctx.stroke();

      // Inner dark studio center dot when selected
      if (isSelected) {
        this.ctx.beginPath();
        this.ctx.arc(x, y, 2, 0, Math.PI * 2);
        this.ctx.fillStyle = '#080A0F';
        this.ctx.fill();
      }

      if (isHighlighted || isSelected) {
        this.drawTooltip(x, y, band, w, isSelected);
      }
      this.ctx.restore();
    }
  }

  private drawTooltip(
    x: number,
    y: number,
    band: ExpertEqualizerPresetBand,
    w: number,
    isSelected = false
  ): void {
    const qVal = BWtoQ(band.bandwidth);
    const isSoloed = band.id === this.soloBandId;
    const soloPrefix = isSoloed ? 'SOLO  ' : '';
    const text = `${soloPrefix}${formatEqMacFrequency(band.frequency)}  ${formatEqMacGain(band.gain, band.type)}  Q ${qVal.toFixed(2)}`;
    const infoW = isSoloed ? 196 : 162;
    const soloBtnW = isSelected ? 24 : 0;
    const gap = isSelected ? 4 : 0;
    const totalW = infoW + gap + soloBtnW;
    const tooltipX = Math.max(10, Math.min(w - totalW - 10, x - totalW / 2));
    const tooltipY = y < 40 ? y + 16 : y - 30;

    // Floating Inspector HUD Pill
    this.ctx.fillStyle = 'rgba(13, 16, 23, 0.94)';
    this.ctx.strokeStyle = isSoloed
      ? '#F5A623'
      : isSelected
        ? 'rgba(245, 166, 35, 0.55)'
        : 'rgba(255, 255, 255, 0.16)';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.roundRect(tooltipX, tooltipY, infoW, 22, 5);
    this.ctx.fill();
    this.ctx.stroke();

    this.ctx.fillStyle = isSoloed ? '#FBBF24' : '#F3F4F6';
    this.ctx.font = '500 10px "JetBrains Mono", ui-monospace, monospace';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(text, tooltipX + infoW / 2, tooltipY + 11);

    if (isSelected) {
      const btnX = tooltipX + infoW + gap;
      const btnY = tooltipY;
      this.soloButtonRect = { x: btnX, y: btnY, w: soloBtnW, h: 22, bandId: band.id };

      this.ctx.fillStyle = isSoloed ? '#F5A623' : 'rgba(13, 16, 23, 0.94)';
      this.ctx.strokeStyle = '#F5A623';
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.roundRect(btnX, btnY, soloBtnW, 22, 5);
      this.ctx.fill();
      this.ctx.stroke();

      this.ctx.fillStyle = isSoloed ? '#080A0F' : '#F5A623';
      this.ctx.font = '700 10px "JetBrains Mono", ui-monospace, monospace';
      this.ctx.fillText('S', btnX + soloBtnW / 2, btnY + 11);
    }
  }

  private setupListeners(): void {
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(this.boundResize);
      this.resizeObserver.observe(this.container);
    }
    window.addEventListener('resize', this.boundResize);
    window.addEventListener('click', this.boundCloseMenu);

    this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.canvas.addEventListener('mouseleave', () => {
      if (!this.draggedBandId && this.hoveredBandId !== null) {
        this.hoveredBandId = null;
        this.callbacks.onBandHover?.(null);
      }
    });
    window.addEventListener('mouseup', this.boundMouseUp);
    this.canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    this.canvas.addEventListener('dblclick', (e) => this.onDoubleClick(e));
    this.canvas.addEventListener('contextmenu', (e) => this.onContextMenu(e));
  }

  private onMouseMove(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (this.draggedBandId) {
      const band = this.bands.find((b) => b.id === this.draggedBandId);
      if (band) {
        const newFreq = Math.round(
          xToFreq(mx, rect.width, GRAPH_MIN_FREQ_HZ, GRAPH_MAX_FREQ_HZ)
        );
        const rawGain = parseFloat(yToDb(my, rect.height).toFixed(1));
        const newGain =
          band.type === FilterType.BAND_STOP
            ? -24
            : this.eqScale > 0.05
              ? parseFloat((rawGain / this.eqScale).toFixed(1))
              : rawGain;
        this.callbacks.onBandChange({
          ...band,
          frequency: Math.max(GRAPH_MIN_FREQ_HZ, Math.min(GRAPH_MAX_FREQ_HZ, newFreq)),
          gain: Math.max(-24, Math.min(24, newGain)),
        });
      }
      return;
    }

    const hovered = this.findBandAt(mx, my, rect.width, rect.height);
    const isOverSoloBtn = this.isPointInSoloButton(mx, my);
    const nextHoverId = isOverSoloBtn
      ? (this.soloButtonRect?.bandId ?? null)
      : hovered
        ? hovered.id
        : null;
    if (this.hoveredBandId !== nextHoverId) {
      this.hoveredBandId = nextHoverId;
      this.callbacks.onBandHover?.(nextHoverId);
    }
    this.canvas.style.cursor = isOverSoloBtn ? 'pointer' : hovered ? 'grab' : 'crosshair';
  }

  private isPointInSoloButton(mx: number, my: number): boolean {
    if (!this.soloButtonRect) return false;
    const { x, y, w, h } = this.soloButtonRect;
    return mx >= x && mx <= x + w && my >= y && my <= y + h;
  }

  private onMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return;
    this.hideContextMenu();
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Pressing and holding the "S" (Solo Band) button on the selected band
    if (this.isPointInSoloButton(mx, my) && this.soloButtonRect) {
      const targetBandId = this.soloButtonRect.bandId;
      this.momentarySoloBandId = targetBandId;
      this.callbacks.onBandSelect(targetBandId);
      this.callbacks.onBandSetSolo?.(targetBandId);
      return;
    }

    const hit = this.findBandAt(mx, my, rect.width, rect.height);
    if (hit) {
      this.draggedBandId = hit.id;
      this.canvas.style.cursor = 'grabbing';
      this.callbacks.onBandSelect(hit.id);
    }
  }

  private onMouseUp(): void {
    if (this.momentarySoloBandId) {
      this.momentarySoloBandId = null;
      this.callbacks.onBandSetSolo?.(null);
    }
    if (this.draggedBandId) {
      this.draggedBandId = null;
      this.canvas.style.cursor = this.hoveredBandId ? 'grab' : 'crosshair';
    }
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const targetId = this.draggedBandId || this.hoveredBandId || this.selectedBandId;
    if (!targetId) return;

    const band = this.bands.find((b) => b.id === targetId);
    if (!band) return;

    const delta = e.deltaY > 0 ? 0.05 : -0.05;
    const newBw = Math.max(0.05, Math.min(5.0, band.bandwidth + delta));
    this.callbacks.onBandChange({
      ...band,
      bandwidth: parseFloat(newBw.toFixed(3)),
    });
  }

  /**
   * Interactive double-click handler:
   * - Double-clicking a band handle toggles its bypass.
   * - Double-clicking empty space adds a new band at that (frequency, gain)!
   */
  private onDoubleClick(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const hitNode = this.findBandHandleAt(mx, my, rect.width, rect.height);
    if (hitNode) {
      this.callbacks.onBandToggleBypass(hitNode.id);
      return;
    }

    const freq = Math.round(
      xToFreq(mx, rect.width, GRAPH_MIN_FREQ_HZ, GRAPH_MAX_FREQ_HZ)
    );
    const gain = parseFloat(yToDb(my, rect.height).toFixed(1));
    this.callbacks.onAddBandAt?.(
      Math.max(GRAPH_MIN_FREQ_HZ, Math.min(GRAPH_MAX_FREQ_HZ, freq)),
      Math.max(-24, Math.min(24, gain))
    );
  }

  /**
   * Context menu actions:
   * - Add Band
   * - Disable / Enable Band
   * - Edit Band
   * - Remove Band
   */
  private onContextMenu(e: MouseEvent): void {
    e.preventDefault();
    if (!this.contextMenuEl) return;

    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const freq = Math.round(
      xToFreq(mx, rect.width, GRAPH_MIN_FREQ_HZ, GRAPH_MAX_FREQ_HZ)
    );
    const gain = parseFloat(yToDb(my, rect.height).toFixed(1));
    const hitBand = this.findBandAt(mx, my, rect.width, rect.height);

    this.contextMenuEl.innerHTML = '';

    const addItem = (label: string, iconSvg: string, action: () => void) => {
      const item = document.createElement('div');
      item.className = 'eqm-context-menu-item';
      item.innerHTML = `<span class="ctx-icon">${iconSvg}</span><span>${label}</span>`;
      item.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.hideContextMenu();
        action();
      });
      this.contextMenuEl!.appendChild(item);
    };

    addItem('Add Band', EQMAC_ICONS.plus, () => {
      this.callbacks.onAddBandAt?.(freq, gain);
    });

    if (hitBand) {
      addItem(
        hitBand.bypass ? 'Enable' : 'Disable',
        EQMAC_ICONS.check,
        () => this.callbacks.onBandToggleBypass(hitBand.id)
      );
      addItem('Edit Band', EQMAC_ICONS.pencil, () => {
        this.callbacks.onEditBand?.(hitBand.id);
      });
      addItem('Remove Band', EQMAC_ICONS.minus, () => {
        this.callbacks.onRemoveBand?.(hitBand.id);
      });
    }

    const menuX = Math.min(rect.width - 150, Math.max(4, mx));
    const menuY = Math.min(rect.height - 120, Math.max(4, my));
    this.contextMenuEl.style.left = `${menuX}px`;
    this.contextMenuEl.style.top = `${menuY}px`;
    this.contextMenuEl.style.display = 'flex';
  }

  private hideContextMenu(): void {
    if (this.contextMenuEl) {
      this.contextMenuEl.style.display = 'none';
    }
  }

  private findBandHandleAt(
    mx: number,
    my: number,
    w: number,
    h: number
  ): ExpertEqualizerPresetBand | null {
    const hitRadius = 14;
    for (const band of this.bands) {
      const bx = freqToX(band.frequency, w, GRAPH_MIN_FREQ_HZ, GRAPH_MAX_FREQ_HZ);
      const effectiveGain = band.type === FilterType.BAND_STOP ? -22 : band.gain * this.eqScale;
      const by = dbToY(effectiveGain, h);
      if (Math.hypot(mx - bx, my - by) <= hitRadius) {
        return band;
      }
    }
    return null;
  }

  /**
   * Finds band nearest to cursor coordinates:
   * First checks node handles, then checks if cursor is inside any band's shaded response curve!
   */
  private findBandAt(
    mx: number,
    my: number,
    w: number,
    h: number
  ): ExpertEqualizerPresetBand | null {
    const handleHit = this.findBandHandleAt(mx, my, w, h);
    if (handleHit) return handleHit;

    const cursorDb = yToDb(my, h);
    const cursorFreq = xToFreq(mx, w, GRAPH_MIN_FREQ_HZ, GRAPH_MAX_FREQ_HZ);
    const candidates: ExpertEqualizerPresetBand[] = [];

    for (const band of this.bands) {
      if (band.bypass) continue;
      const points = this.cachedBandCurves.get(band.id);
      if (!points || points.length < 2) continue;

      const idx = Math.min(
        points.length - 1,
        Math.max(0, Math.round((mx / w) * (points.length - 1)))
      );
      const bandDbAtX = points[idx] ?? 0;

      if (
        (cursorDb > 0.5 && bandDbAtX >= cursorDb) ||
        (cursorDb < -0.5 && bandDbAtX <= cursorDb)
      ) {
        candidates.push(band);
      }
    }

    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0]!;

    return candidates.reduce((best, curr) =>
      Math.abs(curr.frequency - cursorFreq) < Math.abs(best.frequency - cursorFreq)
        ? curr
        : best
    );
  }
}
