/**
 * Acoustic Test Calibration Signal Generator.
 * Generates synthetic tones (1kHz sine, 20Hz-20kHz log sweep, pink noise, white noise).
 */

export type TestSignalType = 'sine-1khz' | 'log-sweep' | 'pink-noise' | 'white-noise';

export class TestSignalGenerator {
  private readonly ctx: AudioContext;
  private readonly gainNode: GainNode;
  private activeSource: AudioNode | null = null;
  private isGenerating = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.gainNode = ctx.createGain();
    this.gainNode.gain.value = 0.2; // -14 dB default safe level
  }

  public get output(): AudioNode {
    return this.gainNode;
  }

  public get active(): boolean {
    return this.isGenerating;
  }

  public start(type: TestSignalType): void {
    this.stop();
    this.isGenerating = true;

    switch (type) {
      case 'sine-1khz':
        this.startSine(1000);
        break;
      case 'log-sweep':
        this.startLogSweep(20, 20000, 10);
        break;
      case 'pink-noise':
        this.startPinkNoise();
        break;
      case 'white-noise':
        this.startWhiteNoise();
        break;
    }
  }

  public stop(): void {
    if (this.activeSource) {
      try {
        if ('stop' in this.activeSource && typeof (this.activeSource as AudioScheduledSourceNode).stop === 'function') {
          (this.activeSource as AudioScheduledSourceNode).stop();
        }
        this.activeSource.disconnect();
      } catch {
        // Safe disconnect
      }
      this.activeSource = null;
    }
    this.isGenerating = false;
  }

  public setVolume(linear: number): void {
    this.gainNode.gain.setTargetAtTime(Math.max(0, Math.min(1.0, linear)), this.ctx.currentTime, 0.015);
  }

  private startSine(freqHz: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freqHz;
    osc.connect(this.gainNode);
    osc.start();
    this.activeSource = osc;
  }

  private startLogSweep(startHz: number, endHz: number, durationSeconds: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(startHz, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(endHz, this.ctx.currentTime + durationSeconds);
    osc.connect(this.gainNode);
    osc.start();
    osc.stop(this.ctx.currentTime + durationSeconds);
    osc.onended = () => {
      if (this.isGenerating) this.startLogSweep(startHz, endHz, durationSeconds);
    };
    this.activeSource = osc;
  }

  private startWhiteNoise(): void {
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(this.gainNode);
    source.start();
    this.activeSource = source;
  }

  private startPinkNoise(): void {
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    // Paul Kellet's filter algorithm for pink noise (-3dB/octave)
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(this.gainNode);
    source.start();
    this.activeSource = source;
  }
}
