/**
 * Audio Source Bar Component.
 * Coordinates input source switching, device selection, file transport, and master volume.
 */

import { EqualizerStore } from '../../state/equalizer-store.js';
import { AudioSourceManager } from '../../audio/audio-source-manager.js';
import { AudioFilePlayer } from '../../audio/audio-file-player.js';
import { TestSignalGenerator, TestSignalType } from '../../audio/test-signal-generator.js';
import { LevelMeter } from './level-meter.js';
import { AudioGraph } from '../../audio/audio-graph.js';

export class SourceBar {
  private readonly container: HTMLElement;
  private readonly store: EqualizerStore;
  private readonly graph: AudioGraph;
  private readonly sourceManager: AudioSourceManager;
  private readonly filePlayer: AudioFilePlayer;
  private readonly generator: TestSignalGenerator;
  private levelMeter!: LevelMeter;

  constructor(
    container: HTMLElement,
    store: EqualizerStore,
    graph: AudioGraph,
    sourceManager: AudioSourceManager,
    filePlayer: AudioFilePlayer,
    generator: TestSignalGenerator
  ) {
    this.container = container;
    this.store = store;
    this.graph = graph;
    this.sourceManager = sourceManager;
    this.filePlayer = filePlayer;
    this.generator = generator;

    this.render();
    this.setupListeners();
    this.setupSubscriptions();
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="source-options">
        <span style="color: var(--text-muted); font-size: 11px;">Source:</span>
        <button id="src-desktop-btn" class="source-btn active" title="Capture System Audio Output">System Audio</button>
        <button id="src-device-btn" class="source-btn" title="Capture Microphone or Loopback Device">Device Input</button>
        <button id="src-file-btn" class="source-btn" title="Play Local Audio File">Audio File</button>
        <button id="src-tone-btn" class="source-btn" title="Generate Calibration Test Tones">Tone Generator</button>

        <div id="sub-controls-container" style="display: flex; align-items: center; gap: 8px; margin-left: 10px;">
          <!-- Dynamically populated based on active source -->
        </div>
      </div>

      <div style="display: flex; align-items: center; gap: 14px;">
        <div id="meter-anchor"></div>
        <label style="font-size: 11px; color: var(--text-secondary); display: flex; align-items: center; gap: 6px;">
          Vol:
          <input type="range" id="master-vol-slider" min="0" max="1.5" step="0.05" value="0.85" style="width: 80px;">
        </label>
      </div>
    `;

    const meterAnchor = this.container.querySelector('#meter-anchor') as HTMLElement;
    this.levelMeter = new LevelMeter(meterAnchor);
    this.levelMeter.setAnalyser(this.graph.postAnalyzerService);
  }

  private setupListeners(): void {
    const desktopBtn = this.container.querySelector('#src-desktop-btn')!;
    const deviceBtn = this.container.querySelector('#src-device-btn')!;
    const fileBtn = this.container.querySelector('#src-file-btn')!;
    const toneBtn = this.container.querySelector('#src-tone-btn')!;

    desktopBtn.addEventListener('click', () => this.activateDesktopSource());
    deviceBtn.addEventListener('click', () => this.activateDeviceSource());
    fileBtn.addEventListener('click', () => this.activateFileSource());
    toneBtn.addEventListener('click', () => this.activateToneSource());

    const volSlider = this.container.querySelector('#master-vol-slider') as HTMLInputElement;
    volSlider.addEventListener('input', () => {
      const vol = parseFloat(volSlider.value);
      this.store.setMasterVolume(vol);
      this.graph.setMasterVolume(vol);
    });
  }

  private setupSubscriptions(): void {
    this.store.subscribe((state) => {
      const desktopBtn = this.container.querySelector('#src-desktop-btn')!;
      const deviceBtn = this.container.querySelector('#src-device-btn')!;
      const fileBtn = this.container.querySelector('#src-file-btn')!;
      const toneBtn = this.container.querySelector('#src-tone-btn')!;

      desktopBtn.classList.toggle('active', state.audioSourceType === 'desktop');
      deviceBtn.classList.toggle('active', state.audioSourceType === 'input-device');
      fileBtn.classList.toggle('active', state.audioSourceType === 'file');
      toneBtn.classList.toggle('active', state.audioSourceType === 'tone');
    });
  }

  public async activateDesktopSource(): Promise<void> {
    this.teardownOtherSources();
    this.store.setAudioSource('desktop');

    const subControls = this.container.querySelector('#sub-controls-container')!;
    subControls.innerHTML = '<span style="color: var(--text-muted); font-size: 11px;">Starting Screen & System Audio Loopback...</span>';

    try {
      const node = await this.sourceManager.captureDesktopAudio();
      this.graph.setSource(node);
      subControls.innerHTML = '<span style="color: var(--accent-green); font-size: 11px;">Capturing System Audio</span>';
    } catch {
      subControls.innerHTML = '<span style="color: var(--accent-orange); font-size: 11px;">Capture not permitted / inactive. Select "Device Input" or "Audio File"</span>';
    }
  }

  public async activateDeviceSource(): Promise<void> {
    this.teardownOtherSources();
    this.store.setAudioSource('input-device');

    const subControls = this.container.querySelector('#sub-controls-container')!;
    subControls.innerHTML = '<select id="device-select" style="font-size: 11px; max-width: 190px;"></select>';

    const devices = await this.sourceManager.getAvailableInputDevices();
    const select = subControls.querySelector('#device-select') as HTMLSelectElement;

    if (devices.length === 0) {
      subControls.innerHTML = '<span style="color: var(--accent-orange); font-size: 11px;">No audio input devices detected</span>';
      return;
    }

    for (const d of devices) {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label;
      select.appendChild(opt);
    }

    const switchDevice = async (id: string) => {
      try {
        const node = await this.sourceManager.captureInputDevice(id);
        this.graph.setSource(node);
      } catch {
        // Fallback
      }
    };

    select.addEventListener('change', () => switchDevice(select.value));
    if (devices[0]) await switchDevice(devices[0].deviceId);
  }

  public activateFileSource(): void {
    this.teardownOtherSources();
    this.store.setAudioSource('file');
    this.graph.setSource(this.filePlayer.output);

    const subControls = this.container.querySelector('#sub-controls-container')!;
    subControls.innerHTML = `
      <input type="file" id="audio-file-input" accept="audio/*" style="display: none;">
      <button id="btn-load-file">Open File</button>
      <button id="btn-demo-file" class="primary" title="Load synthetic 120 BPM demo groove">Demo Music</button>
      <button id="btn-play-pause-file">Play</button>
      <span id="file-name-label" style="font-size: 11px; color: var(--text-secondary); max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${this.filePlayer.currentFileName || 'No track loaded'}</span>
    `;

    const fileInput = subControls.querySelector('#audio-file-input') as HTMLInputElement;
    const loadBtn = subControls.querySelector('#btn-load-file') as HTMLButtonElement;
    const demoBtn = subControls.querySelector('#btn-demo-file') as HTMLButtonElement;
    const playBtn = subControls.querySelector('#btn-play-pause-file') as HTMLButtonElement;
    const nameLabel = subControls.querySelector('#file-name-label') as HTMLElement;

    loadBtn.addEventListener('click', () => fileInput.click());
    demoBtn.addEventListener('click', () => {
      this.filePlayer.generateDemoTrack();
      nameLabel.textContent = this.filePlayer.currentFileName;
      this.filePlayer.play();
      playBtn.textContent = 'Pause';
    });

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (file) {
        try {
          await this.filePlayer.loadFile(file);
          nameLabel.textContent = file.name;
          this.filePlayer.play();
          playBtn.textContent = 'Pause';
        } catch {
          window.alert(`Could not decode audio file "${file.name}". Please ensure it is a valid WAV, MP3, or FLAC file.`);
          fileInput.value = '';
          nameLabel.textContent = 'Failed to load file';
        }
      }
    });

    playBtn.addEventListener('click', () => {
      if (this.filePlayer.playing) {
        this.filePlayer.pause();
        playBtn.textContent = 'Play';
      } else {
        if (!this.filePlayer.currentFileName) {
          this.filePlayer.generateDemoTrack();
          nameLabel.textContent = this.filePlayer.currentFileName;
        }
        this.filePlayer.play();
        playBtn.textContent = 'Pause';
      }
    });
  }

  public activateToneSource(): void {
    this.teardownOtherSources();
    this.store.setAudioSource('tone');
    this.graph.setSource(this.generator.output);

    const subControls = this.container.querySelector('#sub-controls-container')!;
    subControls.innerHTML = `
      <select id="tone-type-select">
        <option value="pink-noise">Pink Noise (-3dB/oct)</option>
        <option value="sine-1khz">1 kHz Sine Tone</option>
        <option value="log-sweep">20Hz - 20kHz Sweep</option>
        <option value="white-noise">White Noise</option>
      </select>
      <button id="btn-toggle-tone" class="primary">Start</button>
    `;

    const select = subControls.querySelector('#tone-type-select') as HTMLSelectElement;
    const toggleBtn = subControls.querySelector('#btn-toggle-tone') as HTMLButtonElement;

    toggleBtn.addEventListener('click', () => {
      if (this.generator.active) {
        this.generator.stop();
        toggleBtn.textContent = 'Start';
        toggleBtn.classList.remove('active-toggle');
      } else {
        this.generator.start(select.value as TestSignalType);
        toggleBtn.textContent = 'Stop';
        toggleBtn.classList.add('active-toggle');
      }
    });

    select.addEventListener('change', () => {
      if (this.generator.active) {
        this.generator.start(select.value as TestSignalType);
      }
    });
  }

  private teardownOtherSources(): void {
    this.sourceManager.stopCurrentStream();
    this.filePlayer.stop();
    this.generator.stop();
  }
}
