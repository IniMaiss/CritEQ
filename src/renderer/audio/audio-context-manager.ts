/**
 * Web Audio Context Manager.
 * Safely initializes, resumes, and closes the browser AudioContext.
 */

export class AudioContextManager {
  private context: AudioContext | null = null;

  public getContext(): AudioContext {
    if (!this.context) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.context = new AudioCtx({ latencyHint: 'interactive' });
      if (this.context.state === 'suspended') {
        this.context.resume().catch(() => {});
      }
    }
    return this.context;
  }

  public async resume(): Promise<void> {
    const ctx = this.getContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
  }

  public async suspend(): Promise<void> {
    if (this.context && this.context.state === 'running') {
      await this.context.suspend();
    }
  }

  public async close(): Promise<void> {
    if (this.context && this.context.state !== 'closed') {
      await this.context.close();
      this.context = null;
    }
  }

  public get sampleRate(): number {
    return this.getContext().sampleRate;
  }

  public get state(): AudioContextState {
    return this.getContext().state;
  }
}
