/**
 * Web Audio Master Graph.
 * Assembles Preamp, Biquad Cascade, Master Gain, and Analyzers into a single cohesive pipeline.
 */

import { AudioContextManager } from './audio-context-manager.js';
import { BiquadCascadeNode } from './biquad-cascade-node.js';
import { SpectrumAnalyzerService } from './spectrum-analyzer-service.js';
import { ExpertEqualizerPreset } from '../../models/preset.js';
import { ExpertEqualizerPresetBand } from '../../models/preset-band.js';
import { dbToLinear } from '../../common/math.js';

export class AudioGraph {
  private readonly ctxManager: AudioContextManager;
  private readonly preampNode: GainNode;
  private readonly masterGainNode: GainNode;
  private readonly biquadCascade: BiquadCascadeNode;
  private readonly preAnalyser: SpectrumAnalyzerService;
  private readonly postAnalyser: SpectrumAnalyzerService;
  private isBypassed = false;
  private soloBandId: string | null = null;
  private currentSourceNode: AudioNode | null = null;

  constructor(ctxManager: AudioContextManager) {
    this.ctxManager = ctxManager;
    const ctx = ctxManager.getContext();

    this.preampNode = ctx.createGain();
    this.masterGainNode = ctx.createGain();
    this.biquadCascade = new BiquadCascadeNode(ctx);
    this.preAnalyser = new SpectrumAnalyzerService(ctx);
    this.postAnalyser = new SpectrumAnalyzerService(ctx);

    // Assemble internal graph:
    // [preamp] -> [biquadCascade] -> [masterGain] -> [postAnalyser] -> [destination]
    this.preampNode.connect(this.biquadCascade.input);
    this.biquadCascade.output.connect(this.masterGainNode);
    this.masterGainNode.connect(this.postAnalyser.node);
    this.postAnalyser.node.connect(ctx.destination);
  }

  public get context(): AudioContext {
    return this.ctxManager.getContext();
  }

  public get preAnalyzerService(): SpectrumAnalyzerService {
    return this.preAnalyser;
  }

  public get postAnalyzerService(): SpectrumAnalyzerService {
    return this.postAnalyser;
  }

  public setSource(node: AudioNode): void {
    if (this.currentSourceNode) {
      try {
        this.currentSourceNode.disconnect();
      } catch {
        // Safe disconnect
      }
    }
    this.currentSourceNode = node;
    this.currentSourceNode.connect(this.preAnalyser.node);
    this.currentSourceNode.connect(this.preampNode);
  }

  public applyPreset(
    preset: Readonly<ExpertEqualizerPreset>,
    soloBandId: string | null = this.soloBandId
  ): void {
    this.soloBandId = soloBandId;
    const ctx = this.context;
    const now = ctx.currentTime;
    const isSoloActive =
      !this.isBypassed && soloBandId !== null && preset.bands.some((b) => b.id === soloBandId);
    const preampLinear = this.isBypassed || isSoloActive ? 1.0 : dbToLinear(preset.global);
    this.preampNode.gain.setTargetAtTime(preampLinear, now, 0.015);

    if (this.isBypassed) {
      this.biquadCascade.updateBands([], null);
    } else {
      this.biquadCascade.updateBands(preset.bands, soloBandId);
    }
  }

  public setSoloBand(
    bandId: string | null,
    activePreset?: Readonly<ExpertEqualizerPreset>
  ): void {
    this.soloBandId = bandId;
    if (activePreset) {
      this.applyPreset(activePreset, bandId);
    }
  }

  public get soloBand(): string | null {
    return this.soloBandId;
  }

  public updateBandLive(band: Readonly<ExpertEqualizerPresetBand>): void {
    if (!this.isBypassed) {
      this.biquadCascade.updateBandLive(band);
    }
  }

  public setPreampGain(dB: number): void {
    const linear = this.isBypassed ? 1.0 : dbToLinear(dB);
    this.preampNode.gain.setTargetAtTime(linear, this.context.currentTime, 0.015);
  }

  public setMasterVolume(linearVolume: number): void {
    const clamped = Math.max(0, Math.min(1.5, linearVolume));
    this.masterGainNode.gain.setTargetAtTime(clamped, this.context.currentTime, 0.015);
  }

  public setBypass(bypassed: boolean, activePreset?: Readonly<ExpertEqualizerPreset>): void {
    this.isBypassed = bypassed;
    if (activePreset) {
      this.applyPreset(activePreset);
    } else {
      const preampLinear = this.isBypassed ? 1.0 : 1.0;
      this.preampNode.gain.setTargetAtTime(preampLinear, this.context.currentTime, 0.015);
      if (this.isBypassed) {
        this.biquadCascade.updateBands([]);
      }
    }
  }

  public get bypassed(): boolean {
    return this.isBypassed;
  }
}
