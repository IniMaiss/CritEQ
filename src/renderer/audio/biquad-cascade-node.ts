/**
 * Multi-band, Multi-channel Web Audio Biquad Filter Cascade.
 * Maps ExpertEqualizerPresetBand specifications directly to Web Audio biquad chains.
 * Smoothly updates parameters in-place during dragging without rebuilding the audio graph.
 */

import { ExpertEqualizerPresetBand } from '../../models/preset-band.js';
import { FilterType } from '../../models/filter-type.js';
import { AudioChannel } from '../../models/audio-channel.js';
import { BWtoQ } from '../../models/bandwidth-unit.js';

export interface BiquadStage {
  readonly bandId: string;
  readonly filterType: FilterType;
  readonly isSoloStage?: boolean;
  readonly leftFilter: BiquadFilterNode | null;
  readonly rightFilter: BiquadFilterNode | null;
}

export class BiquadCascadeNode {
  private readonly ctx: AudioContext;
  private readonly splitter: ChannelSplitterNode;
  private readonly merger: ChannelMergerNode;
  private stages: BiquadStage[] = [];
  private currentSoloBandId: string | null = null;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.splitter = ctx.createChannelSplitter(2);
    this.merger = ctx.createChannelMerger(2);
    // Initially connect splitter directly to merger (transparent passthrough)
    this.connectDirect();
  }

  public get input(): AudioNode {
    return this.splitter;
  }

  public get output(): AudioNode {
    return this.merger;
  }

  public get activeStages(): readonly BiquadStage[] {
    return this.stages;
  }

  public updateBands(
    bands: readonly Readonly<ExpertEqualizerPresetBand>[],
    soloBandId: string | null = null
  ): void {
    const soloTarget = soloBandId ? bands.find((b) => b.id === soloBandId) ?? null : null;
    const isSoloMode = soloTarget !== null;
    const activeBands = isSoloMode ? [soloTarget] : bands.filter((b) => !b.bypass);

    // If topology (IDs, filter types, channels, solo mode) is unchanged, update in-place smoothly
    if (this.currentSoloBandId === (soloTarget?.id ?? null) && !this.needsRebuild(activeBands, isSoloMode)) {
      for (const band of activeBands) {
        this.updateBandLive(band);
      }
      return;
    }

    // Topology changed: reconnect graph
    this.clearStages();
    this.currentSoloBandId = soloTarget?.id ?? null;

    if (activeBands.length === 0) {
      this.connectDirect();
      return;
    }

    let currentLeft: AudioNode = this.splitter;
    let currentRight: AudioNode = this.splitter;
    let leftIndex = 0;
    let rightIndex = 1;

    const newStages: BiquadStage[] = [];

    for (const band of activeBands) {
      const targetsLeft = !band.channels || band.channels.length === 0 || band.channels.includes(AudioChannel.LEFT);
      const targetsRight = !band.channels || band.channels.length === 0 || band.channels.includes(AudioChannel.RIGHT);

      let leftNode: BiquadFilterNode | null = null;
      let rightNode: BiquadFilterNode | null = null;

      if (targetsLeft) {
        leftNode = isSoloMode ? this.createSoloFilterNode(band) : this.createFilterNode(band);
        currentLeft.connect(leftNode, leftIndex, 0);
        currentLeft = leftNode;
        leftIndex = 0;
      }

      if (targetsRight) {
        rightNode = isSoloMode ? this.createSoloFilterNode(band) : this.createFilterNode(band);
        currentRight.connect(rightNode, rightIndex, 0);
        currentRight = rightNode;
        rightIndex = 0;
      }

      newStages.push({
        bandId: band.id,
        filterType: band.type,
        isSoloStage: isSoloMode,
        leftFilter: leftNode,
        rightFilter: rightNode,
      });
    }

    currentLeft.connect(this.merger, leftIndex, 0);
    currentRight.connect(this.merger, rightIndex, 1);

    this.stages = newStages;
  }

  public updateBandLive(band: Readonly<ExpertEqualizerPresetBand>): void {
    const stage = this.stages.find((s) => s.bandId === band.id);
    if (!stage) return;

    const now = this.ctx.currentTime;
    const timeConstant = 0.015; // 15ms smoothing for zero clicks/pops
    const qValue = BWtoQ(band.bandwidth);

    for (const filter of [stage.leftFilter, stage.rightFilter]) {
      if (!filter) continue;
      filter.frequency.setTargetAtTime(band.frequency, now, timeConstant);
      if (filter.type === 'peaking' || filter.type === 'lowshelf' || filter.type === 'highshelf') {
        filter.gain.setTargetAtTime(band.gain, now, timeConstant);
      }
      if (
        filter.type === 'peaking' ||
        filter.type === 'notch' ||
        filter.type === 'bandpass' ||
        filter.type === 'lowpass' ||
        filter.type === 'highpass'
      ) {
        filter.Q.setTargetAtTime(qValue, now, timeConstant);
      }
    }
  }

  private needsRebuild(
    activeBands: readonly Readonly<ExpertEqualizerPresetBand>[],
    isSoloMode = false
  ): boolean {
    if (activeBands.length !== this.stages.length) return true;

    for (let i = 0; i < activeBands.length; i++) {
      const b = activeBands[i]!;
      const s = this.stages[i];
      if (!s || s.bandId !== b.id || s.filterType !== b.type || Boolean(s.isSoloStage) !== isSoloMode) {
        return true;
      }

      const targetLeft = !b.channels || b.channels.length === 0 || b.channels.includes(AudioChannel.LEFT);
      const targetRight = !b.channels || b.channels.length === 0 || b.channels.includes(AudioChannel.RIGHT);

      if ((s.leftFilter !== null) !== targetLeft || (s.rightFilter !== null) !== targetRight) {
        return true;
      }
    }
    return false;
  }

  private connectDirect(): void {
    this.splitter.connect(this.merger, 0, 0);
    this.splitter.connect(this.merger, 1, 1);
  }

  private createSoloFilterNode(band: Readonly<ExpertEqualizerPresetBand>): BiquadFilterNode {
    const filter = this.ctx.createBiquadFilter();
    const qValue = BWtoQ(band.bandwidth);
    filter.frequency.value = band.frequency;
    filter.Q.value = qValue;

    switch (band.type) {
      case FilterType.RESONANT_LOW_SHELF:
        filter.type = 'lowpass';
        break;
      case FilterType.RESONANT_HIGH_SHELF:
        filter.type = 'highpass';
        break;
      case FilterType.PARAMETRIC:
      case FilterType.BAND_STOP:
      default:
        filter.type = 'bandpass';
        break;
    }
    return filter;
  }

  private createFilterNode(band: Readonly<ExpertEqualizerPresetBand>): BiquadFilterNode {
    const filter = this.ctx.createBiquadFilter();
    const qValue = BWtoQ(band.bandwidth);
    filter.frequency.value = band.frequency;

    switch (band.type) {
      case FilterType.PARAMETRIC:
        filter.type = 'peaking';
        filter.gain.value = band.gain;
        filter.Q.value = qValue;
        break;
      case FilterType.BAND_STOP:
        filter.type = 'notch';
        filter.Q.value = qValue;
        break;
      case FilterType.RESONANT_LOW_SHELF:
        filter.type = 'lowshelf';
        filter.gain.value = band.gain;
        break;
      case FilterType.RESONANT_HIGH_SHELF:
        filter.type = 'highshelf';
        filter.gain.value = band.gain;
        break;
    }
    return filter;
  }

  private clearStages(): void {
    try {
      this.splitter.disconnect();
    } catch {
      // Ignore if not connected
    }
    for (const stage of this.stages) {
      stage.leftFilter?.disconnect();
      stage.rightFilter?.disconnect();
    }
    this.stages = [];
  }
}
