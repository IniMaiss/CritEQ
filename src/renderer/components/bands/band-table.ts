/**
 * CritEQ Selected-Band Inspector Dock (Option 2: Neobrutalism Studio Style).
 * Replaces separate Mixer/Flat and Q/Oct modes with a unified studio console:
 * - Top Strip: Compact band selector pills (1: 60Hz, 2: 250Hz, ...) + "+ Add Band" pill
 * - Left Console: Band identity, Enable toggle, Color swatch, Filter Type & Channel routing,
 *   Hold-to-Solo button, and Delete Band button
 * - Center Console: 3 large precision rotary dials (FREQUENCY, GAIN, BANDWIDTH) with
 *   drag, scroll-wheel, double-click reset, keyboard navigation, and inline numeric editing
 * - Right Console: Combined Q | Oct dual readout & editor box displaying both Q and Octaves
 *   simultaneously so either unit can be viewed or edited in one place
 */

import { EqualizerStore } from '../../state/equalizer-store.js';
import { ExpertEqualizerPresetBand, createPresetBand } from '../../../models/preset-band.js';
import { FilterType } from '../../../models/filter-type.js';
import { AudioChannel } from '../../../models/audio-channel.js';
import { BWtoQ, QtoBW } from '../../../models/bandwidth-unit.js';
import { BANDWIDTH_OCTAVES_MIN, BANDWIDTH_OCTAVES_MAX } from '../../../common/constants.js';
import {
  getColorForFrequency,
  desaturateAndDarkenHex,
  formatEqMacFrequency,
  formatEqMacGain,
} from '../curve/eqmac-colors.js';

export class BandTable {
  private readonly container: HTMLElement;
  private readonly store: EqualizerStore;
  private unsubscribeStore: (() => void) | null = null;
  private tabsListEl!: HTMLElement;
  private addBandBtn!: HTMLButtonElement;
  private consoleEl!: HTMLElement;
  private modalOverlayEl!: HTMLElement;
  private renderedConsoleBandId: string | null = null;
  private isDraggingControl = false;
  private resizeObserver: ResizeObserver | null = null;
  private boundResize: (() => void) | null = null;

  constructor(container: HTMLElement, store: EqualizerStore) {
    this.container = container;
    this.store = store;
    this.renderShell();
    this.setupSubscriptions();
  }

  private renderShell(): void {
    this.container.innerHTML = `
      <div class="eqm-inspector-dock">
        <div class="eqm-inspector-tabs-bar" id="eqm-inspector-tabs-bar">
          <div class="eqm-band-tabs-list" id="eqm-band-tabs-list"></div>
          <button type="button" class="eqm-add-band-pill" id="btn-add-band" title="Add Band (up to 32 bands)" aria-label="Add New Equalizer Band">
            + Add Band
          </button>
        </div>
        <div class="eqm-inspector-console" id="eqm-inspector-console"></div>
      </div>
      <div class="eqm-modal-overlay" id="eqm-band-modal" style="display: none;"></div>
    `;

    this.tabsListEl = this.container.querySelector('#eqm-band-tabs-list')!;
    this.addBandBtn = this.container.querySelector('#btn-add-band')!;
    this.consoleEl = this.container.querySelector('#eqm-inspector-console')!;
    this.modalOverlayEl = this.container.querySelector('#eqm-band-modal')!;

    this.addBandBtn.addEventListener('click', () => {
      this.store.addBand();
    });

    this.setupResizeTracking();
  }

  private setupResizeTracking(): void {
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.updateResponsiveDialSize();
      });
      try {
        this.resizeObserver.observe(this.container);
        this.resizeObserver.observe(this.consoleEl);
      } catch {}
    }

    if (typeof window !== 'undefined') {
      this.boundResize = () => {
        this.updateResponsiveDialSize();
      };
      window.addEventListener('resize', this.boundResize);
    }
  }

  public updateResponsiveDialSize(): void {
    if (!this.consoleEl) return;
    const h = this.consoleEl.clientHeight ?? 0;
    const w = this.consoleEl.clientWidth ?? 0;
    if (h <= 0 || w <= 0) return;

    // Available height for knob inside dial group:
    // Label (~16px) + Readout (~22px) + gaps (~8px) + padding (~16px) = ~62px
    const availH = h - 62;
    // Available width for each dial in the 3-dial center console (middle column takes ~48% of console width):
    const availW = (w * 0.48) / 3;

    const rawSize = Math.floor(Math.min(availH, availW));
    const dialSize = Math.max(40, Math.min(110, rawSize));
    if (typeof this.consoleEl.style?.setProperty === 'function') {
      this.consoleEl.style.setProperty('--dial-size', `${dialSize}px`);
    } else if (this.consoleEl.style) {
      (this.consoleEl.style as unknown as Record<string, string>)['--dial-size'] = `${dialSize}px`;
    }
  }

  private setupSubscriptions(): void {
    this.unsubscribeStore = this.store.subscribe((state) => {
      const bands = this.isDraggingControl
        ? this.getBandsInCurrentTabOrder(state.activePreset.bands)
        : this.getOrderedBands(state.activePreset.bands);

      this.addBandBtn.style.display = bands.length < 32 ? 'inline-flex' : 'none';

      const activeBand =
        bands.find((b) => b.id === state.selectedBandId) ?? bands[0] ?? null;

      this.syncTabsDom(
        bands,
        activeBand?.id ?? null,
        state.soloBandId,
        state.highlightedBandId,
        state.isBypassed
      );

      this.syncConsoleDom(
        bands,
        activeBand,
        state.soloBandId,
        state.isBypassed
      );
    });
  }

  private getBandsInCurrentTabOrder(
    bands: readonly Readonly<ExpertEqualizerPresetBand>[]
  ): Readonly<ExpertEqualizerPresetBand>[] {
    const children = Array.from(this.tabsListEl.children) as HTMLElement[];
    if (children.length !== bands.length) {
      return this.getOrderedBands(bands);
    }
    const byId = new Map(bands.map((b) => [b.id, b]));
    const ordered: Readonly<ExpertEqualizerPresetBand>[] = [];
    for (const child of children) {
      const id = child.dataset['bandId'];
      const found = id ? byId.get(id) : undefined;
      if (!found) return this.getOrderedBands(bands);
      ordered.push(found);
    }
    return ordered;
  }

  private getOrderedBands(
    bands: readonly Readonly<ExpertEqualizerPresetBand>[]
  ): Readonly<ExpertEqualizerPresetBand>[] {
    const channelPos = (ch?: readonly AudioChannel[]): number => {
      const list = ch && ch.length > 0 ? ch : [AudioChannel.LEFT, AudioChannel.RIGHT];
      let score = 0;
      if (list.includes(AudioChannel.LEFT)) score -= 1;
      if (list.includes(AudioChannel.RIGHT)) score += 1;
      return score;
    };

    return [...bands].sort((a, b) => {
      const posDiff = channelPos(a.channels) - channelPos(b.channels);
      if (posDiff !== 0) return posDiff;
      return a.frequency - b.frequency;
    });
  }

  private getBandColor(band: Readonly<ExpertEqualizerPresetBand>, globalBypass: boolean): string {
    const base = band.color ?? getColorForFrequency(band.frequency);
    if (band.bypass || globalBypass) {
      return desaturateAndDarkenHex(base);
    }
    return base;
  }

  private syncTabsDom(
    bands: readonly Readonly<ExpertEqualizerPresetBand>[],
    selectedBandId: string | null,
    soloBandId: string | null,
    highlightedBandId: string | null,
    globalBypass: boolean
  ): void {
    const children = Array.from(this.tabsListEl.children) as HTMLElement[];
    const sameOrder =
      children.length === bands.length &&
      children.every((el, idx) => el.dataset['bandId'] === bands[idx]?.id);

    if (sameOrder) {
      for (let i = 0; i < bands.length; i++) {
        this.updateTabElement(
          children[i]!,
          bands[i]!,
          i + 1,
          selectedBandId,
          soloBandId,
          highlightedBandId,
          globalBypass
        );
      }
      return;
    }

    this.tabsListEl.innerHTML = '';
    for (let i = 0; i < bands.length; i++) {
      const tab = this.createTabElement(
        bands[i]!,
        i + 1,
        selectedBandId,
        soloBandId,
        highlightedBandId,
        globalBypass
      );
      this.tabsListEl.appendChild(tab);
    }
  }

  private createTabElement(
    band: Readonly<ExpertEqualizerPresetBand>,
    indexNum: number,
    selectedBandId: string | null,
    soloBandId: string | null,
    highlightedBandId: string | null,
    globalBypass: boolean
  ): HTMLElement {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.dataset['bandId'] = band.id;
    tab.innerHTML = `
      <span class="eqm-tab-dot" title="Click dot to Enable / Bypass Band"></span>
      <span class="eqm-tab-index"></span>
      <span class="eqm-tab-freq"></span>
    `;

    this.updateTabElement(
      tab,
      band,
      indexNum,
      selectedBandId,
      soloBandId,
      highlightedBandId,
      globalBypass
    );

    const dotEl = tab.querySelector('.eqm-tab-dot') as HTMLElement | null;
    dotEl?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.store.toggleBandBypass(band.id);
    });

    tab.addEventListener('click', () => {
      this.store.selectBand(band.id);
    });

    tab.addEventListener('dblclick', () => {
      this.store.toggleBandBypass(band.id);
    });

    tab.addEventListener('mouseenter', () => {
      if (!this.isDraggingControl) {
        this.store.setHighlightedBand(band.id);
      }
    });

    tab.addEventListener('mouseleave', () => {
      if (!this.isDraggingControl && this.store.getState().highlightedBandId === band.id) {
        this.store.setHighlightedBand(null);
      }
    });

    return tab;
  }

  private updateTabElement(
    tab: HTMLElement,
    band: Readonly<ExpertEqualizerPresetBand>,
    indexNum: number,
    selectedBandId: string | null,
    soloBandId: string | null,
    highlightedBandId: string | null,
    globalBypass: boolean
  ): void {
    const isSelected = band.id === selectedBandId;
    const isHighlighted = band.id === highlightedBandId;
    const isSoloed = band.id === soloBandId;
    const isSoloMuted = soloBandId !== null && !isSoloed;

    tab.className = `eqm-band-tab ${isSelected ? 'selected' : ''} ${isHighlighted ? 'highlighted' : ''} ${band.bypass ? 'bypassed' : ''} ${isSoloed ? 'soloed' : ''} ${isSoloMuted ? 'solo-muted' : ''}`;

    const color = this.getBandColor(band, globalBypass);
    const dotEl = tab.querySelector('.eqm-tab-dot') as HTMLElement | null;
    if (dotEl) {
      dotEl.style.background = band.bypass ? 'transparent' : color;
      dotEl.style.borderColor = color;
    }

    const idxEl = tab.querySelector('.eqm-tab-index') as HTMLElement | null;
    if (idxEl) {
      idxEl.textContent = `${indexNum}`;
    }

    const freqEl = tab.querySelector('.eqm-tab-freq') as HTMLElement | null;
    if (freqEl) {
      freqEl.textContent = formatEqMacFrequency(band.frequency);
    }
  }

  private syncConsoleDom(
    bands: readonly Readonly<ExpertEqualizerPresetBand>[],
    activeBand: Readonly<ExpertEqualizerPresetBand> | null,
    soloBandId: string | null,
    globalBypass: boolean
  ): void {
    if (!activeBand || bands.length === 0) {
      this.renderedConsoleBandId = null;
      this.consoleEl.innerHTML = `
        <div class="eqm-bands-empty-state">
          <div class="eqm-empty-title">No Active EQ Bands</div>
          <div class="eqm-empty-desc">Click below or double-click anywhere on the graph above to create your first filter band.</div>
          <button type="button" class="eqm-btn primary eqm-empty-add-btn" id="btn-empty-add-band">+ Add First Band</button>
        </div>
      `;
      this.consoleEl.querySelector('#btn-empty-add-band')?.addEventListener('click', () => {
        this.store.addBand();
      });
      return;
    }

    const activeIndex = bands.findIndex((b) => b.id === activeBand.id) + 1;
    if (this.renderedConsoleBandId !== activeBand.id) {
      this.renderedConsoleBandId = activeBand.id;
      this.buildInspectorConsoleMarkup(activeBand, activeIndex, soloBandId, globalBypass);
      return;
    }

    this.updateInspectorConsoleValues(activeBand, activeIndex, soloBandId, globalBypass);
  }

  private buildInspectorConsoleMarkup(
    band: Readonly<ExpertEqualizerPresetBand>,
    activeIndex: number,
    soloBandId: string | null,
    globalBypass: boolean
  ): void {
    const color = this.getBandColor(band, globalBypass);
    const rawColor = band.color ?? getColorForFrequency(band.frequency);
    const isBandStop = band.type === FilterType.BAND_STOP;
    const isSoloed = band.id === soloBandId;
    const chMode = this.getChannelMode(band.channels);
    const { freqNorm, gainNorm, bwNorm, qVal } = this.computeDialNorms(band);

    this.consoleEl.innerHTML = `
      <div class="eqm-inspector-left">
        <div class="eqm-inspector-header">
          <input type="checkbox" class="eqm-chk-enable" id="inspector-chk-enable" ${!band.bypass ? 'checked' : ''} title="Enable / Bypass Band" />
          <input type="color" class="eqm-color-swatch" id="inspector-color-swatch" value="${rawColor}" title="Band Color" />
          <span class="eqm-inspector-title" id="inspector-band-title">BAND ${activeIndex}: SELECTED</span>
        </div>

        <div class="eqm-inspector-selects">
          <select class="eqm-select eqm-inspector-select" id="inspector-type-select" title="Filter Type">
            <option value="${FilterType.PARAMETRIC}" ${band.type === FilterType.PARAMETRIC ? 'selected' : ''}>~ Peaking (PK)</option>
            <option value="${FilterType.RESONANT_LOW_SHELF}" ${band.type === FilterType.RESONANT_LOW_SHELF ? 'selected' : ''}>~ Low Shelf (LS)</option>
            <option value="${FilterType.RESONANT_HIGH_SHELF}" ${band.type === FilterType.RESONANT_HIGH_SHELF ? 'selected' : ''}>~ High Shelf (HS)</option>
            <option value="${FilterType.BAND_STOP}" ${band.type === FilterType.BAND_STOP ? 'selected' : ''}>~ Band Stop (NO)</option>
          </select>

          <select class="eqm-select eqm-inspector-select" id="inspector-channel-select" title="Audio Channel Routing">
            <option value="all" ${chMode === 'all' ? 'selected' : ''}>Stereo (L+R)</option>
            <option value="left" ${chMode === 'left' ? 'selected' : ''}>Left Only (L)</option>
            <option value="right" ${chMode === 'right' ? 'selected' : ''}>Right Only (R)</option>
          </select>
        </div>

        <div class="eqm-inspector-actions">
          <button type="button" class="eqm-inspector-solo-btn eqm-btn-solo ${isSoloed ? 'active' : ''}" id="inspector-btn-solo" title="Hold to Solo Band (Isolate Frequency Range)" aria-pressed="${isSoloed}">
            S &nbsp;Hold to Solo
          </button>
          <button type="button" class="eqm-inspector-delete-btn eqm-btn-delete" id="inspector-btn-delete" title="Delete Selected Band">
            Delete Band
          </button>
        </div>
      </div>

      <div class="eqm-inspector-dials">
        <div class="eqm-dial-group">
          <div class="eqm-dial-label">FREQUENCY</div>
          <div class="eqm-dial-knob" id="inspector-dial-freq" tabindex="0" role="slider" aria-label="Frequency" aria-valuemin="20" aria-valuemax="20000" aria-valuenow="${Math.round(band.frequency)}" title="Drag, scroll, or double-click to adjust Frequency">
            ${this.renderDialSvg(freqNorm, color, false)}
          </div>
          <div class="eqm-dial-readout eqm-freq-screen" id="inspector-readout-freq" title="Click to enter exact Frequency (Hz)">
            ${formatEqMacFrequency(band.frequency)}
          </div>
          <input type="number" class="eqm-inline-num eqm-dial-inline-input" id="inspector-input-freq" min="20" max="20000" step="1" style="display: none;" />
        </div>

        <div class="eqm-dial-group">
          <div class="eqm-dial-label">GAIN</div>
          <div class="eqm-dial-knob ${isBandStop ? 'disabled' : ''}" id="inspector-dial-gain" tabindex="${isBandStop ? -1 : 0}" role="slider" aria-label="Gain" aria-valuemin="-24" aria-valuemax="24" aria-valuenow="${band.gain.toFixed(1)}" title="Drag, scroll, or double-click to reset Gain (0 dB)">
            ${this.renderDialSvg(gainNorm, color, true)}
          </div>
          <div class="eqm-dial-readout eqm-gain-screen ${isBandStop ? 'disabled' : ''}" id="inspector-readout-gain" title="Click to enter exact Gain (dB)">
            ${isBandStop ? '-' : formatEqMacGain(band.gain)}
          </div>
          <input type="number" class="eqm-inline-num eqm-dial-inline-input" id="inspector-input-gain" min="-24" max="24" step="0.1" style="display: none;" />
        </div>

        <div class="eqm-dial-group">
          <div class="eqm-dial-label">BANDWIDTH</div>
          <div class="eqm-dial-knob" id="inspector-dial-bw" tabindex="0" role="slider" aria-label="Bandwidth" aria-valuemin="0.1" aria-valuemax="10" aria-valuenow="${qVal.toFixed(2)}" title="Drag, scroll, or double-click to reset Bandwidth (Q 1.41 / 1.00 Oct)">
            ${this.renderDialSvg(bwNorm, '#38BDF8', false)}
          </div>
          <div class="eqm-dial-readout eqm-bw-screen" id="inspector-readout-bw" title="Click Q or Oct on the right to enter exact value">
            Q: ${qVal.toFixed(2)}
          </div>
        </div>
      </div>

      <div class="eqm-inspector-bw-card">
        <div class="eqm-dual-bw-box">
          <div class="eqm-dual-bw-cell" id="inspector-q-cell" title="Click to enter exact Q factor">
            <span class="eqm-dual-bw-prefix">Q:</span>
            <span class="eqm-dual-bw-val" id="inspector-q-val">${qVal.toFixed(3)}</span>
            <input type="number" class="eqm-inline-num eqm-dual-bw-input" id="inspector-input-q" min="0.1" max="20" step="0.01" style="display: none;" />
          </div>
          <span class="eqm-dual-bw-sep">|</span>
          <div class="eqm-dual-bw-cell" id="inspector-oct-cell" title="Click to enter exact Octave bandwidth">
            <span class="eqm-dual-bw-val" id="inspector-oct-val">${band.bandwidth.toFixed(2)}</span>
            <span class="eqm-dual-bw-suffix">Oct</span>
            <input type="number" class="eqm-inline-num eqm-dual-bw-input" id="inspector-input-oct" min="${BANDWIDTH_OCTAVES_MIN}" max="${BANDWIDTH_OCTAVES_MAX}" step="0.01" style="display: none;" />
          </div>
        </div>
        <div class="eqm-dual-bw-caption">Both Q &amp; Oct shown together</div>
      </div>
    `;

    this.attachInspectorEvents(band.id);
    this.updateResponsiveDialSize();
  }

  private updateInspectorConsoleValues(
    band: Readonly<ExpertEqualizerPresetBand>,
    activeIndex: number,
    soloBandId: string | null,
    globalBypass: boolean
  ): void {
    const color = this.getBandColor(band, globalBypass);
    const rawColor = band.color ?? getColorForFrequency(band.frequency);
    const isBandStop = band.type === FilterType.BAND_STOP;
    const isSoloed = band.id === soloBandId;
    const chMode = this.getChannelMode(band.channels);
    const { freqNorm, gainNorm, bwNorm, qVal } = this.computeDialNorms(band);

    const chk = this.consoleEl.querySelector('#inspector-chk-enable') as HTMLInputElement | null;
    if (chk && chk !== document.activeElement) {
      chk.checked = !band.bypass;
    }

    const swatch = this.consoleEl.querySelector('#inspector-color-swatch') as HTMLInputElement | null;
    if (swatch && swatch !== document.activeElement) {
      swatch.value = rawColor;
    }

    const titleEl = this.consoleEl.querySelector('#inspector-band-title') as HTMLElement | null;
    if (titleEl) {
      titleEl.textContent = `BAND ${activeIndex}: SELECTED`;
    }

    const typeSelect = this.consoleEl.querySelector('#inspector-type-select') as HTMLSelectElement | null;
    if (typeSelect && typeSelect !== document.activeElement) {
      typeSelect.value = String(band.type);
    }

    const chSelect = this.consoleEl.querySelector('#inspector-channel-select') as HTMLSelectElement | null;
    if (chSelect && chSelect !== document.activeElement) {
      chSelect.value = chMode;
    }

    const soloBtn = this.consoleEl.querySelector('#inspector-btn-solo') as HTMLButtonElement | null;
    if (soloBtn) {
      soloBtn.classList.toggle('active', isSoloed);
      soloBtn.setAttribute('aria-pressed', String(isSoloed));
    }

    const freqDial = this.consoleEl.querySelector('#inspector-dial-freq') as HTMLElement | null;
    if (freqDial) {
      freqDial.setAttribute('aria-valuenow', String(Math.round(band.frequency)));
      freqDial.innerHTML = this.renderDialSvg(freqNorm, color, false);
    }

    const freqReadout = this.consoleEl.querySelector('#inspector-readout-freq') as HTMLElement | null;
    if (freqReadout) {
      freqReadout.textContent = formatEqMacFrequency(band.frequency);
    }

    const gainDial = this.consoleEl.querySelector('#inspector-dial-gain') as HTMLElement | null;
    if (gainDial) {
      gainDial.classList.toggle('disabled', isBandStop);
      gainDial.setAttribute('aria-valuenow', band.gain.toFixed(1));
      gainDial.innerHTML = this.renderDialSvg(gainNorm, color, true);
    }

    const gainReadout = this.consoleEl.querySelector('#inspector-readout-gain') as HTMLElement | null;
    if (gainReadout) {
      gainReadout.classList.toggle('disabled', isBandStop);
      gainReadout.textContent = isBandStop ? '-' : formatEqMacGain(band.gain);
    }

    const bwDial = this.consoleEl.querySelector('#inspector-dial-bw') as HTMLElement | null;
    if (bwDial) {
      bwDial.setAttribute('aria-valuenow', qVal.toFixed(2));
      bwDial.innerHTML = this.renderDialSvg(bwNorm, '#38BDF8', false);
    }

    const bwReadout = this.consoleEl.querySelector('#inspector-readout-bw') as HTMLElement | null;
    if (bwReadout) {
      bwReadout.textContent = `Q: ${qVal.toFixed(2)}`;
    }

    const qValEl = this.consoleEl.querySelector('#inspector-q-val') as HTMLElement | null;
    if (qValEl) {
      qValEl.textContent = qVal.toFixed(3);
    }

    const octValEl = this.consoleEl.querySelector('#inspector-oct-val') as HTMLElement | null;
    if (octValEl) {
      octValEl.textContent = band.bandwidth.toFixed(2);
    }

    this.updateResponsiveDialSize();
  }

  private getChannelMode(channels?: readonly AudioChannel[]): 'all' | 'left' | 'right' {
    if (!channels || channels.length === 0 || channels.length >= 2) return 'all';
    return channels[0] === AudioChannel.LEFT ? 'left' : 'right';
  }

  private computeDialNorms(band: Readonly<ExpertEqualizerPresetBand>): {
    freqNorm: number;
    gainNorm: number;
    bwNorm: number;
    qVal: number;
  } {
    const logMin = Math.log10(20);
    const logMax = Math.log10(20000);
    const freqLog = Math.log10(Math.max(20, Math.min(20000, band.frequency)));
    const freqNorm = Math.max(0, Math.min(1, (freqLog - logMin) / (logMax - logMin)));

    const gainNorm = Math.max(0, Math.min(1, (band.gain + 24) / 48));

    const qVal = BWtoQ(band.bandwidth);
    const qLogMin = Math.log10(0.1);
    const qLogMax = Math.log10(10.0);
    const qLog = Math.log10(Math.max(0.1, Math.min(10.0, qVal)));
    const bwNorm = Math.max(0, Math.min(1, (qLog - qLogMin) / (qLogMax - qLogMin)));

    return { freqNorm, gainNorm, bwNorm, qVal };
  }

  private renderDialSvg(norm: number, color: string, isBipolar: boolean): string {
    const clamped = Math.max(0, Math.min(1, norm));
    const angleDeg = -135 + clamped * 270;
    const radius = 21;
    const totalArcLen = (270 / 360) * (2 * Math.PI * radius);
    const fullCircumference = 2 * Math.PI * radius;

    let activeArcMarkup = '';
    if (isBipolar) {
      const deltaNorm = clamped - 0.5;
      const arcLen = Math.abs(deltaNorm) * totalArcLen;
      const rotDeg = deltaNorm >= 0 ? -90 : -90 - Math.abs(deltaNorm) * 270;
      activeArcMarkup = `
        <line x1="28" y1="3.5" x2="28" y2="6.5" stroke="#000000" stroke-width="2" stroke-linecap="round" />
        <circle cx="28" cy="28" r="${radius}" fill="none" stroke="${color}" stroke-width="3.5"
          stroke-dasharray="${arcLen.toFixed(2)} ${fullCircumference.toFixed(2)}"
          transform="rotate(${rotDeg.toFixed(2)}, 28, 28)" stroke-linecap="round" />
      `;
    } else {
      const arcLen = clamped * totalArcLen;
      activeArcMarkup = `
        <circle cx="28" cy="28" r="${radius}" fill="none" stroke="${color}" stroke-width="3.5"
          stroke-dasharray="${arcLen.toFixed(2)} ${fullCircumference.toFixed(2)}"
          transform="rotate(135, 28, 28)" stroke-linecap="round" />
      `;
    }

    return `
      <svg class="eqm-dial-svg" viewBox="0 0 56 56" width="100%" height="100%">
        <circle cx="28" cy="28" r="${radius}" fill="none" stroke="rgba(0,0,0,0.12)" stroke-width="3"
          stroke-dasharray="${totalArcLen.toFixed(2)} ${fullCircumference.toFixed(2)}"
          transform="rotate(135, 28, 28)" stroke-linecap="round" />
        ${activeArcMarkup}
        <circle cx="28" cy="28" r="16" fill="#FFFFFF" stroke="#000000" stroke-width="2" />
        <g transform="rotate(${angleDeg.toFixed(2)}, 28, 28)">
          <line x1="28" y1="24" x2="28" y2="13" stroke="#000000" stroke-width="3" stroke-linecap="round" />
        </g>
      </svg>
    `;
  }

  private attachInspectorEvents(bandId: string): void {
    const chk = this.consoleEl.querySelector('#inspector-chk-enable') as HTMLInputElement | null;
    chk?.addEventListener('change', () => {
      const current = this.findBand(bandId);
      if (current) {
        this.store.updateBand({ ...current, bypass: !chk.checked });
      }
    });

    const swatch = this.consoleEl.querySelector('#inspector-color-swatch') as HTMLInputElement | null;
    swatch?.addEventListener('input', () => {
      const current = this.findBand(bandId);
      if (current) {
        this.store.updateBand({ ...current, color: swatch.value });
      }
    });

    const typeSelect = this.consoleEl.querySelector('#inspector-type-select') as HTMLSelectElement | null;
    typeSelect?.addEventListener('change', () => {
      const current = this.findBand(bandId);
      if (current) {
        this.store.updateBand({ ...current, type: parseInt(typeSelect.value, 10) as FilterType });
      }
    });

    const chSelect = this.consoleEl.querySelector('#inspector-channel-select') as HTMLSelectElement | null;
    chSelect?.addEventListener('change', () => {
      const current = this.findBand(bandId);
      if (!current) return;
      const channels =
        chSelect.value === 'left'
          ? [AudioChannel.LEFT]
          : chSelect.value === 'right'
            ? [AudioChannel.RIGHT]
            : [AudioChannel.LEFT, AudioChannel.RIGHT];
      this.store.updateBand({ ...current, channels });
    });

    const soloBtn = this.consoleEl.querySelector('#inspector-btn-solo') as HTMLButtonElement | null;
    const stopSolo = () => {
      if (this.store.getState().soloBandId === bandId) {
        this.store.setSoloBand(null);
      }
      window.removeEventListener('mouseup', stopSolo);
      window.removeEventListener('keyup', stopSolo);
      window.removeEventListener('blur', stopSolo);
    };
    soloBtn?.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      this.store.setSoloBand(bandId);
      window.addEventListener('mouseup', stopSolo);
      window.addEventListener('blur', stopSolo);
    });
    soloBtn?.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        this.store.setSoloBand(bandId);
        window.addEventListener('keyup', stopSolo);
        window.addEventListener('blur', stopSolo);
      }
    });

    const deleteBtn = this.consoleEl.querySelector('#inspector-btn-delete') as HTMLButtonElement | null;
    deleteBtn?.addEventListener('click', () => {
      this.store.removeBand(bandId);
    });

    this.setupFrequencyDialAndEdit(bandId);
    this.setupGainDialAndEdit(bandId);
    this.setupBandwidthDialAndDualBox(bandId);
  }

  private setupFrequencyDialAndEdit(bandId: string): void {
    const dialEl = this.consoleEl.querySelector('#inspector-dial-freq') as HTMLElement | null;
    const readoutEl = this.consoleEl.querySelector('#inspector-readout-freq') as HTMLElement | null;
    const inputEl = this.consoleEl.querySelector('#inspector-input-freq') as HTMLInputElement | null;
    if (!dialEl || !readoutEl || !inputEl) return;

    this.bindRotaryDrag(
      dialEl,
      () => {
        const b = this.findBand(bandId);
        return b ? Math.log10(Math.max(20, Math.min(20000, b.frequency))) : Math.log10(1000);
      },
      (startLog, deltaNorm) => {
        const b = this.findBand(bandId);
        if (!b) return;
        const logMin = Math.log10(20);
        const logMax = Math.log10(20000);
        const nextLog = Math.max(logMin, Math.min(logMax, startLog + deltaNorm * (logMax - logMin)));
        const nextFreq = Math.round(Math.pow(10, nextLog) * 10) / 10;
        this.store.updateBand({ ...b, frequency: nextFreq });
      },
      () => {
        const b = this.findBand(bandId);
        if (b) this.store.updateBand({ ...b, frequency: 1000 });
      },
      (stepDir) => {
        const b = this.findBand(bandId);
        if (!b) return;
        const factor = 1 + 0.03 * stepDir;
        const nextFreq = Math.max(20, Math.min(20000, Math.round(b.frequency * factor * 10) / 10));
        this.store.updateBand({ ...b, frequency: nextFreq });
      }
    );

    this.bindInlineNumericEdit(
      readoutEl,
      inputEl,
      () => {
        const b = this.findBand(bandId);
        return b ? String(Math.round(b.frequency * 10) / 10) : '1000';
      },
      (val) => {
        const b = this.findBand(bandId);
        if (b) {
          this.store.updateBand({ ...b, frequency: Math.max(20, Math.min(20000, val)) });
        }
      }
    );
  }

  private setupGainDialAndEdit(bandId: string): void {
    const dialEl = this.consoleEl.querySelector('#inspector-dial-gain') as HTMLElement | null;
    const readoutEl = this.consoleEl.querySelector('#inspector-readout-gain') as HTMLElement | null;
    const inputEl = this.consoleEl.querySelector('#inspector-input-gain') as HTMLInputElement | null;
    if (!dialEl || !readoutEl || !inputEl) return;

    this.bindRotaryDrag(
      dialEl,
      () => this.findBand(bandId)?.gain ?? 0,
      (startGain, deltaNorm) => {
        const b = this.findBand(bandId);
        if (!b || b.type === FilterType.BAND_STOP) return;
        const nextGain = Math.max(-24, Math.min(24, Math.round((startGain + deltaNorm * 48) * 10) / 10));
        this.store.updateBand({ ...b, gain: nextGain });
      },
      () => {
        const b = this.findBand(bandId);
        if (b && b.type !== FilterType.BAND_STOP) {
          this.store.updateBand({ ...b, gain: 0 });
        }
      },
      (stepDir) => {
        const b = this.findBand(bandId);
        if (!b || b.type === FilterType.BAND_STOP) return;
        const nextGain = Math.max(-24, Math.min(24, Math.round((b.gain + stepDir * 0.2) * 10) / 10));
        this.store.updateBand({ ...b, gain: nextGain });
      }
    );

    this.bindInlineNumericEdit(
      readoutEl,
      inputEl,
      () => {
        const b = this.findBand(bandId);
        return b ? b.gain.toFixed(1) : '0.0';
      },
      (val) => {
        const b = this.findBand(bandId);
        if (b && b.type !== FilterType.BAND_STOP) {
          this.store.updateBand({ ...b, gain: Math.max(-24, Math.min(24, Math.round(val * 10) / 10)) });
        }
      }
    );
  }

  private setupBandwidthDialAndDualBox(bandId: string): void {
    const dialEl = this.consoleEl.querySelector('#inspector-dial-bw') as HTMLElement | null;
    const qCell = this.consoleEl.querySelector('#inspector-q-cell') as HTMLElement | null;
    const qValEl = this.consoleEl.querySelector('#inspector-q-val') as HTMLElement | null;
    const qInputEl = this.consoleEl.querySelector('#inspector-input-q') as HTMLInputElement | null;
    const octCell = this.consoleEl.querySelector('#inspector-oct-cell') as HTMLElement | null;
    const octValEl = this.consoleEl.querySelector('#inspector-oct-val') as HTMLElement | null;
    const octInputEl = this.consoleEl.querySelector('#inspector-input-oct') as HTMLInputElement | null;

    if (dialEl) {
      this.bindRotaryDrag(
        dialEl,
        () => {
          const b = this.findBand(bandId);
          return b ? Math.log10(Math.max(0.1, Math.min(10.0, BWtoQ(b.bandwidth)))) : Math.log10(1.414);
        },
        (startQLog, deltaNorm) => {
          const b = this.findBand(bandId);
          if (!b) return;
          const qLogMin = Math.log10(0.1);
          const qLogMax = Math.log10(10.0);
          const nextQLog = Math.max(qLogMin, Math.min(qLogMax, startQLog + deltaNorm * (qLogMax - qLogMin)));
          const nextQ = Math.pow(10, nextQLog);
          const nextBw = Math.max(
            BANDWIDTH_OCTAVES_MIN,
            Math.min(BANDWIDTH_OCTAVES_MAX, Math.round(QtoBW(nextQ) * 1000) / 1000)
          );
          this.store.updateBand({ ...b, bandwidth: nextBw });
        },
        () => {
          const b = this.findBand(bandId);
          if (b) this.store.updateBand({ ...b, bandwidth: 1.0 });
        },
        (stepDir) => {
          const b = this.findBand(bandId);
          if (!b) return;
          const nextBw = Math.max(
            BANDWIDTH_OCTAVES_MIN,
            Math.min(BANDWIDTH_OCTAVES_MAX, Math.round((b.bandwidth - stepDir * 0.05) * 100) / 100)
          );
          this.store.updateBand({ ...b, bandwidth: nextBw });
        }
      );
    }

    if (qCell && qValEl && qInputEl) {
      this.bindInlineNumericEdit(
        qCell,
        qInputEl,
        () => {
          const b = this.findBand(bandId);
          return b ? BWtoQ(b.bandwidth).toFixed(3) : '1.414';
        },
        (val) => {
          const b = this.findBand(bandId);
          if (b) {
            const clampedQ = Math.max(0.1, Math.min(20.0, val));
            const nextBw = Math.max(
              BANDWIDTH_OCTAVES_MIN,
              Math.min(BANDWIDTH_OCTAVES_MAX, Math.round(QtoBW(clampedQ) * 1000) / 1000)
            );
            this.store.updateBand({ ...b, bandwidth: nextBw });
          }
        },
        qValEl
      );
    }

    if (octCell && octValEl && octInputEl) {
      this.bindInlineNumericEdit(
        octCell,
        octInputEl,
        () => {
          const b = this.findBand(bandId);
          return b ? b.bandwidth.toFixed(2) : '1.00';
        },
        (val) => {
          const b = this.findBand(bandId);
          if (b) {
            const nextBw = Math.max(
              BANDWIDTH_OCTAVES_MIN,
              Math.min(BANDWIDTH_OCTAVES_MAX, Math.round(val * 1000) / 1000)
            );
            this.store.updateBand({ ...b, bandwidth: nextBw });
          }
        },
        octValEl
      );
    }
  }

  private bindRotaryDrag(
    dialEl: HTMLElement,
    getStartValue: () => number,
    onDelta: (startValue: number, deltaNorm: number) => void,
    onReset: () => void,
    onStep: (stepDir: number) => void
  ): void {
    let lastY = 0;
    let lastX = 0;
    let startValue = 0;
    let accumulatedDelta = 0;
    let activePointerId: number | null = null;

    const onPointerMove = (e: MouseEvent | PointerEvent) => {
      const dy = lastY - e.clientY;
      const dx = e.clientX - lastX;
      lastY = e.clientY;
      lastX = e.clientX;

      let speed = 1.0;
      if (e.shiftKey) {
        speed = 0.2;
      } else if (e.altKey) {
        speed = 2.0;
      }

      accumulatedDelta += ((dy + dx * 0.4) / 140) * speed;
      onDelta(startValue, accumulatedDelta);
    };

    const onPointerUp = () => {
      this.isDraggingControl = false;
      dialEl.classList.remove('dragging');
      if (typeof document !== 'undefined' && document.body) {
        document.body.classList.remove('knob-dragging');
      }

      if (activePointerId !== null && 'releasePointerCapture' in dialEl) {
        try {
          dialEl.releasePointerCapture(activePointerId);
        } catch {}
        activePointerId = null;
      }

      if (typeof window !== 'undefined') {
        window.removeEventListener('pointermove', onPointerMove as EventListener);
        window.removeEventListener('pointerup', onPointerUp as EventListener);
        window.removeEventListener('pointercancel', onPointerUp as EventListener);
        window.removeEventListener('mousemove', onPointerMove as EventListener);
        window.removeEventListener('mouseup', onPointerUp as EventListener);
      }

      const state = this.store.getState();
      const sorted = this.getOrderedBands(state.activePreset.bands);
      const activeBand = sorted.find((b) => b.id === state.selectedBandId) ?? sorted[0] ?? null;
      this.syncTabsDom(
        sorted,
        activeBand?.id ?? null,
        state.soloBandId,
        state.highlightedBandId,
        state.isBypassed
      );
      this.syncConsoleDom(sorted, activeBand, state.soloBandId, state.isBypassed);
    };

    const startDrag = (clientX: number, clientY: number, pointerId?: number) => {
      this.isDraggingControl = true;
      dialEl.classList.add('dragging');
      if (typeof document !== 'undefined' && document.body) {
        document.body.classList.add('knob-dragging');
      }

      lastY = clientY;
      lastX = clientX;
      accumulatedDelta = 0;
      startValue = getStartValue();

      if (typeof pointerId === 'number' && 'setPointerCapture' in dialEl) {
        try {
          dialEl.setPointerCapture(pointerId);
          activePointerId = pointerId;
        } catch {}
      }

      if (typeof window !== 'undefined') {
        window.addEventListener('pointermove', onPointerMove as EventListener);
        window.addEventListener('pointerup', onPointerUp as EventListener);
        window.addEventListener('pointercancel', onPointerUp as EventListener);
        window.addEventListener('mousemove', onPointerMove as EventListener);
        window.addEventListener('mouseup', onPointerUp as EventListener);
      }
    };

    dialEl.addEventListener('pointerdown', (e: PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      startDrag(e.clientX, e.clientY, e.pointerId);
    });

    dialEl.addEventListener('mousedown', (e: MouseEvent) => {
      if (this.isDraggingControl) return;
      if (e.button !== 0) return;
      e.preventDefault();
      startDrag(e.clientX, e.clientY);
    });

    dialEl.addEventListener('dblclick', () => {
      onReset();
    });

    dialEl.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const dir = e.deltaY < 0 ? 1 : -1;
        const step = e.shiftKey ? dir * 0.2 : dir;
        onStep(step);
      },
      { passive: false }
    );

    dialEl.addEventListener('keydown', (e: KeyboardEvent) => {
      const stepSize = e.shiftKey ? 0.2 : 1;
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
        e.preventDefault();
        onStep(stepSize);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
        e.preventDefault();
        onStep(-stepSize);
      } else if (e.key === 'PageUp') {
        e.preventDefault();
        onStep(stepSize * 3);
      } else if (e.key === 'PageDown') {
        e.preventDefault();
        onStep(-stepSize * 3);
      } else if (e.key === 'Home') {
        e.preventDefault();
        onReset();
      }
    });
  }

  private bindInlineNumericEdit(
    triggerEl: HTMLElement,
    inputEl: HTMLInputElement,
    getInitialText: () => string,
    onCommit: (val: number) => void,
    displayTargetEl: HTMLElement = triggerEl
  ): void {
    let editing = false;

    const closeEdit = () => {
      editing = false;
      inputEl.style.display = 'none';
      displayTargetEl.style.display = '';
    };

    const commitEdit = () => {
      if (!editing) return;
      const parsed = parseFloat(inputEl.value);
      closeEdit();
      if (Number.isFinite(parsed)) {
        onCommit(parsed);
      }
    };

    triggerEl.addEventListener('click', (e) => {
      if (e.target === inputEl || triggerEl.classList.contains('disabled')) return;
      editing = true;
      displayTargetEl.style.display = 'none';
      inputEl.style.display = 'inline-block';
      inputEl.value = getInitialText();
      inputEl.focus();
      inputEl.select();
    });

    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeEdit();
      }
    });

    inputEl.addEventListener('blur', () => {
      commitEdit();
    });
  }

  /**
   * Opens the Band Data Modal Dialog when invoked from the graph right-click context menu.
   * Shows synchronized Q and Octave inputs together.
   */
  public openBandDialog(bandId?: string, initialFreq = 1000, initialGain = 0): void {
    const existing = bandId ? this.findBand(bandId) : undefined;
    let draftType = existing ? existing.type : FilterType.PARAMETRIC;
    let draftChannels: readonly AudioChannel[] =
      existing?.channels && existing.channels.length > 0
        ? existing.channels
        : [AudioChannel.LEFT, AudioChannel.RIGHT];
    const draftColor =
      existing?.color ?? getColorForFrequency(existing ? existing.frequency : initialFreq);
    const draftFreq = existing ? existing.frequency : initialFreq;
    const draftGain = existing ? existing.gain : initialGain;
    const draftOct = existing ? existing.bandwidth : 1.0;
    const draftQ = BWtoQ(draftOct);

    this.modalOverlayEl.style.display = 'flex';
    this.modalOverlayEl.innerHTML = `
      <div class="eqm-modal-card">
        <div class="eqm-modal-title">${existing ? 'Edit Band' : 'Add Band'}</div>
        <div class="eqm-modal-row">
          <span>Color:</span>
          <input type="color" id="modal-band-color" class="eqm-color-swatch" value="${draftColor}" />
        </div>
        <div class="eqm-modal-row">
          <span>Channels:</span>
          <select id="modal-band-channels" class="eqm-select">
            <option value="all" ${draftChannels.length === 2 ? 'selected' : ''}>Stereo (L + R)</option>
            <option value="left" ${draftChannels.length === 1 && draftChannels[0] === AudioChannel.LEFT ? 'selected' : ''}>Left Only</option>
            <option value="right" ${draftChannels.length === 1 && draftChannels[0] === AudioChannel.RIGHT ? 'selected' : ''}>Right Only</option>
          </select>
        </div>
        <div class="eqm-modal-row">
          <span>Type:</span>
          <select id="modal-band-type" class="eqm-select">
            <option value="${FilterType.PARAMETRIC}" ${draftType === FilterType.PARAMETRIC ? 'selected' : ''}>Peaking (PK)</option>
            <option value="${FilterType.BAND_STOP}" ${draftType === FilterType.BAND_STOP ? 'selected' : ''}>Band Stop (NO)</option>
            <option value="${FilterType.RESONANT_LOW_SHELF}" ${draftType === FilterType.RESONANT_LOW_SHELF ? 'selected' : ''}>Low Shelf (LS)</option>
            <option value="${FilterType.RESONANT_HIGH_SHELF}" ${draftType === FilterType.RESONANT_HIGH_SHELF ? 'selected' : ''}>High Shelf (HS)</option>
          </select>
        </div>
        <div class="eqm-modal-row">
          <span>Frequency (Hz):</span>
          <input type="number" id="modal-band-freq" class="eqm-inline-num" min="20" max="20000" step="1" value="${Math.round(draftFreq * 10) / 10}" />
        </div>
        <div class="eqm-modal-row" id="modal-gain-row">
          <span>Gain (dB):</span>
          <input type="number" id="modal-band-gain" class="eqm-inline-num" min="-24" max="24" step="0.1" value="${draftGain.toFixed(1)}" />
        </div>
        <div class="eqm-modal-row">
          <span>Bandwidth (Q / Oct):</span>
          <div style="display: flex; align-items: center; gap: 6px;">
            <input type="number" id="modal-band-q" class="eqm-inline-num" min="0.1" max="20" step="0.01" value="${draftQ.toFixed(2)}" title="Q Factor" style="width: 64px;" />
            <span style="color: var(--text-secondary);">|</span>
            <input type="number" id="modal-band-oct" class="eqm-inline-num" min="${BANDWIDTH_OCTAVES_MIN}" max="${BANDWIDTH_OCTAVES_MAX}" step="0.01" value="${draftOct.toFixed(2)}" title="Octaves" style="width: 64px;" />
          </div>
        </div>
        <div class="eqm-modal-actions">
          <button id="modal-btn-cancel" class="eqm-btn">Cancel</button>
          <button id="modal-btn-save" class="eqm-btn primary">Save</button>
        </div>
      </div>
    `;

    const typeSel = this.modalOverlayEl.querySelector('#modal-band-type') as HTMLSelectElement;
    const gainRow = this.modalOverlayEl.querySelector('#modal-gain-row') as HTMLElement;
    const qInput = this.modalOverlayEl.querySelector('#modal-band-q') as HTMLInputElement;
    const octInput = this.modalOverlayEl.querySelector('#modal-band-oct') as HTMLInputElement;

    const syncGainVisibility = () => {
      draftType = parseInt(typeSel.value, 10) as FilterType;
      gainRow.style.display = draftType === FilterType.BAND_STOP ? 'none' : 'flex';
    };
    syncGainVisibility();
    typeSel.addEventListener('change', syncGainVisibility);

    qInput.addEventListener('input', () => {
      const q = parseFloat(qInput.value);
      if (Number.isFinite(q) && q > 0) {
        octInput.value = Math.max(BANDWIDTH_OCTAVES_MIN, Math.min(BANDWIDTH_OCTAVES_MAX, QtoBW(q))).toFixed(2);
      }
    });

    octInput.addEventListener('input', () => {
      const oct = parseFloat(octInput.value);
      if (Number.isFinite(oct) && oct > 0) {
        qInput.value = Math.max(0.1, Math.min(20.0, BWtoQ(oct))).toFixed(2);
      }
    });

    const closeDialog = () => {
      this.modalOverlayEl.style.display = 'none';
      window.removeEventListener('keydown', onKeyDown);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.modalOverlayEl.style.display !== 'none') {
        closeDialog();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    this.modalOverlayEl.querySelector('#modal-btn-cancel')?.addEventListener('click', closeDialog);

    this.modalOverlayEl.querySelector('#modal-btn-save')?.addEventListener('click', () => {
      const colorVal = (this.modalOverlayEl.querySelector('#modal-band-color') as HTMLInputElement).value;
      const chVal = (this.modalOverlayEl.querySelector('#modal-band-channels') as HTMLSelectElement).value;
      const freqVal = parseFloat((this.modalOverlayEl.querySelector('#modal-band-freq') as HTMLInputElement).value);
      const gainVal = parseFloat((this.modalOverlayEl.querySelector('#modal-band-gain') as HTMLInputElement).value);
      const octRaw = parseFloat(octInput.value);

      if (chVal === 'left') draftChannels = [AudioChannel.LEFT];
      else if (chVal === 'right') draftChannels = [AudioChannel.RIGHT];
      else draftChannels = [AudioChannel.LEFT, AudioChannel.RIGHT];

      const finalFreq = Number.isFinite(freqVal) ? Math.max(20, Math.min(20000, freqVal)) : 1000;
      const finalGain = Number.isFinite(gainVal) ? Math.max(-24, Math.min(24, gainVal)) : 0;
      const finalBwOct = Number.isFinite(octRaw)
        ? Math.max(BANDWIDTH_OCTAVES_MIN, Math.min(BANDWIDTH_OCTAVES_MAX, octRaw))
        : 1.0;

      if (existing) {
        this.store.updateBand(
          createPresetBand({
            ...existing,
            type: draftType,
            frequency: finalFreq,
            gain: finalGain,
            bandwidth: finalBwOct,
            channels: draftChannels,
            color: colorVal,
          })
        );
      } else {
        this.store.addBandAt({
          frequency: finalFreq,
          gain: finalGain,
          bandwidth: finalBwOct,
          type: draftType,
          channels: draftChannels,
          color: colorVal,
        });
      }

      closeDialog();
    });
  }

  public destroy(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.boundResize && typeof window !== 'undefined') {
      window.removeEventListener('resize', this.boundResize);
      this.boundResize = null;
    }
    if (this.unsubscribeStore) {
      this.unsubscribeStore();
      this.unsubscribeStore = null;
    }
  }

  private findBand(bandId: string): Readonly<ExpertEqualizerPresetBand> | undefined {
    return this.store.getState().activePreset.bands.find((b) => b.id === bandId);
  }
}
