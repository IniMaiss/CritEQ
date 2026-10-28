import { describe, it, expect } from 'vitest';
import {
  PresetRepository,
  ExpertEqualizerController,
  createAudioProcessorState,
  processAudioBuffer,
  parsePEQ,
  REST_ROUTES,
  ExpertEqualizerPreset,
} from '../../src/index.js';

describe('ExpertEqualizer End-to-End Workflow', () => {
  const sampleRate = 48000;

  it('executes full end-to-end lifecycle: Import PEQ -> Select -> DSP Process -> Export -> Verify', async () => {
    // 1. Initialize system
    const repository = new PresetRepository();
    const controller = new ExpertEqualizerController(repository);

    // 2. Import an Equalizer APO config
    const peqSource = `
Device: Mastering Studio EQ
Preamp: -3.0 dB
Filter 1: ON LS Fc 80 Hz Gain 4.0 dB Q 0.71
Filter 2: ON NO Fc 1000 Hz Q 10.0
Filter 3: ON PK Fc 3000 Hz Gain 2.5 dB Q 1.41
Filter 4: ON HS Fc 12000 Hz Gain 3.0 dB Q 0.71
    `;

    const importResponse = await controller.handleRequest({
      method: 'POST',
      path: REST_ROUTES.IMPORT_PRESETS,
      body: { peq: peqSource, select: true },
    });

    expect(importResponse.status).toBe(200);
    expect(importResponse.body.success).toBe(true);
    const importedPresets = importResponse.body.data as ExpertEqualizerPreset[];
    expect(importedPresets).toHaveLength(1);
    const preset = importedPresets[0]!;
    expect(preset.name).toBe('Mastering Studio EQ');
    expect(preset.global).toBe(-3.0);
    expect(preset.bands).toHaveLength(4);

    // 3. Verify active selection via DataBus
    const selectedResponse = await controller.handleRequest({
      method: 'GET',
      path: REST_ROUTES.SELECTED_PRESET,
    });
    expect(selectedResponse.status).toBe(200);
    const activePreset = selectedResponse.body.data as ExpertEqualizerPreset;
    expect(activePreset.id).toBe(preset.id);

    // 4. Instantiate DSP Audio Processor with 48 kHz sample rate
    const dspState = createAudioProcessorState(activePreset, sampleRate);
    expect(dspState.filterNodes).toHaveLength(4);
    expect(dspState.sampleRate).toBe(48000);

    // 5. Generate test audio: 1000 Hz sine wave (matches Notch filter) + DC/Preamp test
    const numFrames = 2048;
    const testAudio = new Float32Array(numFrames * 2);
    for (let i = 0; i < numFrames; i++) {
      const sample = Math.sin((2 * Math.PI * 1000 * i) / sampleRate);
      testAudio[i * 2] = sample;
      testAudio[i * 2 + 1] = sample;
    }

    const { output: processed } = processAudioBuffer(dspState, testAudio);
    expect(processed.length).toBe(testAudio.length);

    // Measure steady state output magnitude at 1000 Hz (should be heavily notched)
    let notchPeak = 0;
    for (let i = numFrames; i < numFrames * 2; i++) {
      notchPeak = Math.max(notchPeak, Math.abs(processed[i]!));
    }
    // Deep attenuation from notch filter + -3dB preamp
    expect(notchPeak).toBeLessThan(0.05);

    // 6. Export active preset via DataBus
    const exportResponse = await controller.handleRequest({
      method: 'GET',
      path: REST_ROUTES.EXPORT_PRESETS,
    });
    expect(exportResponse.status).toBe(200);
    const exportedPEQText = exportResponse.body.data as string;
    expect(exportedPEQText).toContain('Preamp: -3.00 dB');
    expect(exportedPEQText).toContain('LS');
    expect(exportedPEQText).toContain('NO');
    expect(exportedPEQText).toContain('PK');
    expect(exportedPEQText).toContain('HS');

    // 7. Verify round-trip parse of exported string
    const reimported = parsePEQ(exportedPEQText);
    expect(reimported).toHaveLength(1);
    expect(reimported[0]?.global).toBe(-3.0);
    expect(reimported[0]?.bands).toHaveLength(4);
  });
});
