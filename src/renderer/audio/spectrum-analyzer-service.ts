/**
 * Real-time Spectrum Analyzer Service.
 * Provides logarithmic frequency distribution and RMS level metering.
 */

export class SpectrumAnalyzerService {
  private readonly analyser: AnalyserNode;
  private readonly sampleRate: number;
  private readonly freqData: Uint8Array<ArrayBuffer>;
  private readonly timeData: Float32Array<ArrayBuffer>;

  constructor(ctx: AudioContext, fftSize = 2048) {
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = fftSize;
    this.analyser.smoothingTimeConstant = 0.82;
    this.sampleRate = ctx.sampleRate;
    this.freqData = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
    this.timeData = new Float32Array(new ArrayBuffer(this.analyser.fftSize * Float32Array.BYTES_PER_ELEMENT));
  }

  public get node(): AnalyserNode {
    return this.analyser;
  }

  /**
   * Resamples FFT bins into a logarithmic frequency grid (20Hz - 20kHz).
   * Values are normalized [0.0, 1.0].
   */
  public getLogFrequencyData(output: Float32Array, minHz = 20, maxHz = 20000): void {
    this.analyser.getByteFrequencyData(this.freqData);
    const binCount = this.analyser.frequencyBinCount;
    const nyquist = this.sampleRate / 2;
    const numPoints = output.length;

    const logMin = Math.log10(minHz);
    const logMax = Math.log10(maxHz);
    const logRange = logMax - logMin;

    for (let i = 0; i < numPoints; i++) {
      const frac = i / (numPoints - 1);
      const targetFreq = Math.pow(10, logMin + frac * logRange);
      const binIndex = Math.min(
        Math.floor((targetFreq / nyquist) * binCount),
        binCount - 1
      );
      output[i] = (this.freqData[binIndex] ?? 0) / 255.0;
    }
  }

  /**
   * Measures Peak and RMS levels from time-domain waveform data.
   */
  public getLevels(): { peak: number; rms: number } {
    this.analyser.getFloatTimeDomainData(this.timeData);
    let sumSq = 0;
    let peak = 0;

    for (let i = 0; i < this.timeData.length; i++) {
      const sample = Math.abs(this.timeData[i] ?? 0);
      if (sample > peak) peak = sample;
      sumSq += sample * sample;
    }

    const rms = Math.sqrt(sumSq / this.timeData.length);
    return { peak, rms };
  }
}
