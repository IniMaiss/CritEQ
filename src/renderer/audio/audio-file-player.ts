/**
 * Local Audio File Player.
 * Decodes dropped or opened audio files and provides transport controls.
 */

export class AudioFilePlayer {
  private readonly ctx: AudioContext;
  private audioBuffer: AudioBuffer | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private gainNode: GainNode;
  private startTime = 0;
  private pauseOffset = 0;
  private isPlaying = false;
  private loop = true;
  private fileName = '';

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.gainNode = ctx.createGain();
  }

  public get output(): AudioNode {
    return this.gainNode;
  }

  public get currentFileName(): string {
    return this.fileName;
  }

  public get duration(): number {
    return this.audioBuffer?.duration ?? 0;
  }

  public get playing(): boolean {
    return this.isPlaying;
  }

  public async loadFile(file: File): Promise<void> {
    this.stop();
    const arrayBuffer = await file.arrayBuffer();
    this.audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
    this.fileName = file.name;
    this.pauseOffset = 0;
  }

  public generateDemoTrack(): void {
    this.stop();
    const duration = 4.0;
    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * duration);
    const buffer = this.ctx.createBuffer(2, length, sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const beat = (t * 2) % 1; // 120 BPM beat

      // 1. Sub-bass pulse (55 Hz)
      const kick = Math.sin(2 * Math.PI * 55 * t) * Math.exp(-beat * 6) * 0.45;
      // 2. Warm chord
      const chord =
        (Math.sin(2 * Math.PI * 220 * t) +
          Math.sin(2 * Math.PI * 261.63 * t) +
          Math.sin(2 * Math.PI * 329.63 * t)) *
        0.12;
      // 3. High sizzle
      const hat = (Math.random() * 2 - 1) * Math.exp(-((t * 4) % 1) * 25) * 0.08;

      const sample = kick + chord + hat;
      left[i] = sample;
      right[i] = sample;
    }

    this.audioBuffer = buffer;
    this.fileName = 'CritEQ Demo Groove (120 BPM)';
    this.pauseOffset = 0;
  }

  public play(offset = this.pauseOffset): void {
    if (!this.audioBuffer || this.isPlaying) return;

    this.sourceNode = this.ctx.createBufferSource();
    this.sourceNode.buffer = this.audioBuffer;
    this.sourceNode.loop = this.loop;
    this.sourceNode.connect(this.gainNode);

    const boundedOffset = Math.max(0, Math.min(offset, this.audioBuffer.duration));
    this.sourceNode.start(0, boundedOffset);
    this.startTime = this.ctx.currentTime - boundedOffset;
    this.isPlaying = true;

    this.sourceNode.onended = () => {
      if (!this.loop && this.isPlaying) {
        this.isPlaying = false;
        this.pauseOffset = 0;
      }
    };
  }

  public pause(): void {
    if (!this.isPlaying || !this.sourceNode) return;
    this.pauseOffset = (this.ctx.currentTime - this.startTime) % (this.audioBuffer?.duration || 1);
    this.sourceNode.stop();
    this.sourceNode.disconnect();
    this.sourceNode = null;
    this.isPlaying = false;
  }

  public stop(): void {
    if (this.sourceNode) {
      try {
        this.sourceNode.stop();
        this.sourceNode.disconnect();
      } catch {
        // Safe stop
      }
      this.sourceNode = null;
    }
    this.isPlaying = false;
    this.pauseOffset = 0;
  }

  public seek(timeSeconds: number): void {
    const wasPlaying = this.isPlaying;
    this.pause();
    this.pauseOffset = Math.max(0, Math.min(timeSeconds, this.duration));
    if (wasPlaying) {
      this.play(this.pauseOffset);
    }
  }

  public setLoop(shouldLoop: boolean): void {
    this.loop = shouldLoop;
    if (this.sourceNode) {
      this.sourceNode.loop = shouldLoop;
    }
  }

  public getCurrentTime(): number {
    if (!this.isPlaying) return this.pauseOffset;
    return (this.ctx.currentTime - this.startTime) % (this.duration || 1);
  }
}
