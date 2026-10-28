# Implementation Plan: eqMac ExpertEqualizer Desktop Application

## Overview

Transform the existing TypeScript headless audio library (`@eqmac-expert-equalizer`) into a standalone, production-grade Desktop Application using Electron. The application delivers the iconic eqMac ExpertEqualizer experience: an interactive frequency response canvas with draggable biquad filter nodes, dynamic FFT spectrum visualizer, native system audio loopback capture (via Electron `desktopCapturer` / ScreenCaptureKit and audio device loopback), local audio file playback and test signal generation, preset management with Equalizer APO PEQ import/export, and complete band parameter editing.

All components adhere strictly to the project rules: strict immutability, small cohesive files (<400 lines), functions under 50 lines, comprehensive Zod input validation, robust error handling with user-friendly messages, zero `console.log`, and 80%+ test coverage across unit, integration, and E2E suites.

---

## Architectural Decisions & Technology Stack

1. **Application Shell: Electron + Context Isolation**
   - **Main Process:** Manages application lifecycle, window state, desktop audio source discovery via `desktopCapturer.getSources({ types: ['screen', 'window'] })`, native file open/save dialogs for APO PEQ files, and JSON preset persistence in `app.getPath('userData')`.
   - **Preload Script:** Employs `contextBridge` to expose a strictly typed, secure IPC bridge (`window.electronAPI`). Direct Node.js access is prohibited in the renderer (`contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`).
   - **IPC Contract:** Every message and response is validated with Zod schemas (`src/main/ipc-schemas.ts`).

2. **Audio Capture & DSP Engine:**
   - **System Audio Capture:** Renderer queries available screen/window sources via IPC, then calls `navigator.mediaDevices.getUserMedia` with `chromeMediaSource: 'desktop'` to stream system audio output into the Web Audio API graph.
   - **Device & Loopback Support:** Enumerates audio input devices (e.g., BlackHole, Soundflower, external interfaces) via `navigator.mediaDevices.enumerateDevices()`.
   - **Local File & Generator:** Built-in audio file player (WAV, MP3, FLAC) with drag-and-drop support, alongside a calibration signal generator (sine sweep 20Hz-20kHz, pink/white noise, 1kHz tone).
   - **DSP Pipeline:** Real-time Web Audio cascade utilizing our existing Biquad math (`src/dsp/biquad-coefficients.ts` and `src/dsp/audio-processor.ts`). Operates with zero perceptual latency and ramps filter parameters smoothly to prevent clicks/pops.
   - **Real-Time Spectrum Visualizer:** Dual `AnalyserNode` instances (pre-EQ and post-EQ) with 2048-point FFT providing real-time frequency distribution rendered under the EQ curve.

3. **User Interface: eqMac Obsidian Dark Theme**
   - Pure modern TypeScript/HTML5 Canvas and reactive DOM components with no heavy framework overhead.
   - Dark glassmorphism palette (`#121316` background, `#1b1d22` panels, `#2a2d36` borders, vibrant eqMac cyan/blue accents).
   - Interactive Canvas: logarithmic 20Hz - 20kHz X-axis, -24dB to +24dB Y-axis. Draggable nodes (X=Freq, Y=Gain, Wheel=Q/Octaves), real-time composite transfer function curve calculation, node hover tooltips, and background FFT spectrum analyzer.
   - Full bi-directional binding with the Band Table editor.

4. **Integration with Existing Core Library:**
   - Directly reuses `ExpertEqualizerController`, `PresetRepository`, `parsePEQ`, `serializePEQ`, `FilterType`, `BandwidthUnit`, and math utilities.
   - State management is strictly immutable: all actions return fresh state objects.

---

## Component Dependency Graph

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron Main Process                    │
│  - main.ts: App lifecycle & BrowserWindow                  │
│  - window-manager.ts: Window configuration & macOS flags   │
│  - ipc-handlers.ts: desktopCapturer, File Dialogs, Storage │
│  - ipc-schemas.ts: Zod validation contracts                │
└──────────────────────────────┬──────────────────────────────┘
                               │ IPC (contextBridge)
┌──────────────────────────────▼──────────────────────────────┐
│                    Secure Preload Script                    │
│  - preload.ts: window.electronAPI                           │
│  - preload-types.ts: TypeScript interface definitions        │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                  Renderer Application Core                  │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │              Audio Engine & Pipeline                │   │
│   │  - audio-context-manager.ts: AudioContext lifecycle │   │
│   │  - audio-source-manager.ts: Desktop, Device, File   │   │
│   │  - audio-graph.ts: Web Audio routing & L/R splits   │   │
│   │  - biquad-cascade-node.ts: Connects existing DSP    │   │
│   │  - spectrum-analyzer-service.ts: FFT byte data      │   │
│   └──────────────────────────┬──────────────────────────┘   │
│                              │                              │
│   ┌──────────────────────────▼──────────────────────────┐   │
│   │              Immutable State & Controller           │   │
│   │  - equalizer-store.ts: Reactive immutable store     │   │
│   │  - ExpertEqualizerController: REST / DataBus        │   │
│   │  - PresetRepository: Default & custom presets       │   │
│   └──────────────────────────┬──────────────────────────┘   │
│                              │                              │
│   ┌──────────────────────────▼──────────────────────────┐   │
│   │                Interactive UI Layer                 │   │
│   │  - frequency-curve-canvas.ts: Log curve + nodes     │   │
│   │  - spectrum-visualizer.ts: FFT gradient overlay     │   │
│   │  - preset-bar.ts: Presets, Preamp slider, Bypass    │   │
│   │  - band-table.ts: Parametric band list editor       │   │
│   │  - source-control-bar.ts: Source, file player, RMS  │   │
│   └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Phased Execution Plan

### Phase 1: Electron Infrastructure & Security Shell

#### Task 1: Project Setup, Build Pipeline & Dependencies
**Description:** Configure project to build and run Electron with TypeScript and Vite. Install `electron`, `vite`, and development types. Configure build scripts for main, preload, and renderer processes.
**Acceptance Criteria:**
- `package.json` updated with Electron and Vite dependencies and scripts (`dev`, `build:all`, `electron:start`).
- `vite.config.ts` configured for the renderer with path aliases.
- TypeScript config (`tsconfig.json`) supports Node and DOM targets without conflict.
**Verification:**
- `npm run typecheck` passes without errors.
- `npm run build` generates valid bundles.
**Dependencies:** None.
**Files Touched:**
- `package.json`
- `tsconfig.json`
- `vite.config.ts`
**Estimated Scope:** Medium (3 files)

#### Task 2: IPC Validation Layer with Zod
**Description:** Implement strict Zod schemas for all IPC channels (desktop audio source requests, file open/save dialogs, preset persistence, window state).
**Acceptance Criteria:**
- All IPC messages have request and response Zod schemas.
- Payloads are validated before passing across process boundaries.
- Errors produce typed, user-friendly error objects.
**Verification:**
- Unit tests pass: `npx vitest run tests/unit/ipc-schemas.test.ts`.
**Dependencies:** Task 1.
**Files Touched:**
- `src/main/ipc-schemas.ts`
- `tests/unit/ipc-schemas.test.ts`
**Estimated Scope:** Small (2 files)

#### Task 3: Main Process & Window Management
**Description:** Implement the Electron main process with security hardening (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`), custom macOS dark titlebar (`hiddenInset`), and IPC handler registration.
**Acceptance Criteria:**
- Main window launches with dark theme styling and min dimensions 960x650.
- Handlers registered for `desktopCapturer.getSources({ types: ['screen', 'window'] })`.
- Handlers registered for `dialog.showOpenDialog` and `dialog.showSaveDialog` for APO PEQ files (.txt).
- User presets stored safely in `app.getPath('userData')/presets.json`.
**Verification:**
- Unit test for IPC handler logic.
- Electron process starts cleanly.
**Dependencies:** Task 2.
**Files Touched:**
- `src/main/main.ts`
- `src/main/window-manager.ts`
- `src/main/ipc-handlers.ts`
- `src/main/preset-storage.ts`
**Estimated Scope:** Medium (4 files)

#### Task 4: Secure Preload Script & ContextBridge
**Description:** Expose the typed `window.electronAPI` bridge to the renderer, wrapping IPC invocations in validated promises.
**Acceptance Criteria:**
- Exposes `getDesktopAudioSources()`, `openPEQFile()`, `savePEQFile(content, filename)`, `loadStoredPresets()`, `saveStoredPresets(presets)`.
- Global window type declarations in `src/preload/preload-types.ts`.
**Verification:**
- Typecheck verifies full typing of `window.electronAPI`.
**Dependencies:** Task 3.
**Files Touched:**
- `src/preload/preload.ts`
- `src/preload/preload-types.ts`
**Estimated Scope:** Small (2 files)

#### Checkpoint 1: Electron Shell Verification
- [ ] Application starts via Electron.
- [ ] Window displays with custom dark frame.
- [ ] Preload API is accessible in renderer with context isolation active.
- [ ] IPC tests pass.

---

### Phase 2: Audio Engine, System Capture & DSP Pipeline

#### Task 5: Web Audio Context & Graph Infrastructure
**Description:** Create the core AudioContext manager and graph router. Handles context lifecycle (auto-resume on user interaction, sample rate negotiation, suspended state handling).
**Acceptance Criteria:**
- AudioContext initializes cleanly and resumes on first audio trigger.
- Master gain node, preamp gain node, and stereo channel splitter/merger nodes configured.
- Graph handles sample rates 44.1kHz, 48kHz, and 96kHz.
**Verification:**
- Unit tests pass: `npx vitest run tests/unit/audio-context-manager.test.ts`.
**Dependencies:** Task 4.
**Files Touched:**
- `src/renderer/audio/audio-context-manager.ts`
- `src/renderer/audio/audio-graph.ts`
**Estimated Scope:** Small (2 files)

#### Task 6: Audio Source Capture Manager (System Loopback & Input Devices)
**Description:** Implement audio source acquisition supporting system output loopback capture via `desktopCapturer` stream ID, physical input devices via `navigator.mediaDevices.enumerateDevices()`, and error handling for device permissions.
**Acceptance Criteria:**
- System audio loopback captured via `navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId } } })`.
- Device enumeration retrieves available audio inputs.
- Active stream smoothly connects to and disconnects from the audio graph without popping.
**Verification:**
- Unit tests with mock MediaStream pass.
**Dependencies:** Task 5.
**Files Touched:**
- `src/renderer/audio/audio-source-manager.ts`
- `tests/unit/audio-source-manager.test.ts`
**Estimated Scope:** Medium (2 files)

#### Task 7: Local Audio File Player & Calibration Signal Generator
**Description:** Build drag-and-drop file player for WAV/MP3/FLAC playback, and a test tone generator (sine sweeps 20Hz-20kHz, pink noise, white noise, 1kHz calibration tone).
**Acceptance Criteria:**
- Drag-and-drop or file pick decodes audio via `AudioContext.decodeAudioData`.
- Transport controls: play, pause, seek, loop.
- Signal generator creates pure mathematical synthesis buffers for instant testing.
**Verification:**
- Unit tests verify playback state changes and buffer generation.
**Dependencies:** Task 5.
**Files Touched:**
- `src/renderer/audio/audio-file-player.ts`
- `src/renderer/audio/test-signal-generator.ts`
**Estimated Scope:** Medium (2 files)

#### Task 8: Web Audio Biquad Filter Cascade Integration
**Description:** Connect our existing biquad math (`calculateBiquadCoefficients`, `frequencyResponseMagnitude`) into the live Web Audio graph using synchronized Web Audio BiquadFilterNodes / IIRFilterNodes to achieve zero latency and CPU efficiency.
**Acceptance Criteria:**
- Accurately mirrors `ExpertEqualizerPreset` bands (frequency, gain, Q, type, bypass, channel routing L/R/All).
- Parameters transition smoothly without clicks/zipper noise.
- Supports adding, removing, and updating bands dynamically.
**Verification:**
- Unit tests verify filter cascade matches mathematical transfer function.
**Dependencies:** Task 5.
**Files Touched:**
- `src/renderer/audio/biquad-cascade-node.ts`
- `tests/unit/biquad-cascade.test.ts`
**Estimated Scope:** Medium (2 files)

#### Task 9: Real-Time Spectrum Analyzer Service
**Description:** Implement dual AnalyserNode processing (pre-EQ input and post-EQ output) for extracting 2048-point FFT data with temporal smoothing (0.8 time constant) and dB-to-pixel normalization.
**Acceptance Criteria:**
- Computes frequency bins distributed logarithmically between 20Hz and 20kHz.
- Computes RMS and peak levels for stereo meters.
- Throttled animation frame loop prevents UI lag.
**Verification:**
- Unit tests verify FFT bin log-interpolation math.
**Dependencies:** Task 8.
**Files Touched:**
- `src/renderer/audio/spectrum-analyzer-service.ts`
- `tests/unit/spectrum-analyzer.test.ts`
**Estimated Scope:** Small (2 files)

#### Checkpoint 2: Audio DSP & Capture Verification
- [ ] System audio output or microphone stream enters Web Audio graph.
- [ ] File player plays audio smoothly.
- [ ] Biquad cascade filters audio in real-time according to preset bands.
- [ ] Spectrum analyser extracts valid FFT data.

---

### Phase 3: Interactive eqMac ExpertEqualizer UI

#### Task 10: eqMac Obsidian Dark Theme & App Shell
**Description:** Build the application layout container with the signature eqMac obsidian aesthetic, responsive flex/grid structure, CSS variables, and clean modular component mounting.
**Acceptance Criteria:**
- Theme matches eqMac dark design system (`#121316`, `#1b1d22`, `#26282e`, macOS system font).
- Three main layout sections: Top Bar (presets & preamp), Center Stage (Canvas curve & spectrum), Bottom Bar (band table & audio source controls).
**Verification:**
- Visual layout renders without overflow or clipping across window resize.
**Dependencies:** Task 4.
**Files Touched:**
- `src/renderer/styles/theme.css`
- `src/renderer/styles/layout.css`
- `src/renderer/styles/controls.css`
- `src/renderer/components/app-shell.ts`
- `src/renderer/index.html`
**Estimated Scope:** Medium (5 files)

#### Task 11: Real-Time FFT Spectrum Visualizer Canvas
**Description:** Render the real-time FFT spectrum analyzer on the canvas underneath the EQ curve with smooth glowing gradients.
**Acceptance Criteria:**
- 60fps rendering using `requestAnimationFrame`.
- Aligns perfectly with the logarithmic 20Hz - 20kHz X-axis.
- Gradient fills with smooth falloff and no visual stutter.
**Verification:**
- Visual verification with active audio playback.
**Dependencies:** Task 9, Task 10.
**Files Touched:**
- `src/renderer/components/curve/spectrum-visualizer.ts`
**Estimated Scope:** Small (1 file)

#### Task 12: Interactive Frequency Response Curve & Draggable Nodes
**Description:** Implement high-precision interactive Canvas frequency response curve with draggable filter nodes.
**Acceptance Criteria:**
- Renders composite frequency response magnitude curve ($20\text{ Hz} - 20\text{ kHz}$ log scale, $-24\text{ dB} - +24\text{ dB}$).
- Grid lines for standard audio frequencies (20, 50, 100, 200, 500, 1k, 2k, 5k, 10k, 20k Hz) and dB levels (+24, +18, +12, +6, 0, -6, -12, -18, -24 dB).
- Draggable nodes with color badges:
  - Drag X: modifies frequency.
  - Drag Y: modifies gain.
  - Mouse wheel: modifies Q / Bandwidth (Octaves).
  - Double-click: toggle bypass.
- Hover tooltip shows exact Freq, Gain, Q, and filter type.
**Verification:**
- Coordinate math unit tests pass: `npx vitest run tests/unit/curve-math.test.ts`.
**Dependencies:** Task 10.
**Files Touched:**
- `src/renderer/components/curve/curve-math.ts`
- `src/renderer/components/curve/curve-interaction.ts`
- `src/renderer/components/curve/frequency-curve-canvas.ts`
- `tests/unit/curve-math.test.ts`
**Estimated Scope:** Medium (4 files)

#### Task 13: Preset Bar & APO PEQ Import/Export UI
**Description:** Implement eqMac Preset Bar with preset selection dropdown (Flat, Bass Booster, Treble Booster, Vocal Booster, user presets), Save New Preset, Delete Preset, Preamp slider ($-24\text{ dB} - +24\text{ dB}$), Global Bypass, and native File Import/Export for Equalizer APO PEQ files.
**Acceptance Criteria:**
- Selecting preset immediately updates controller, store, canvas curve, and audio graph.
- "Save Preset" opens prompt to save custom preset.
- "Import PEQ" reads `.txt` file via native dialog and loads bands using `parsePEQ`.
- "Export PEQ" saves active preset to `.txt` via `serializePEQ`.
- Preamp slider adjusts master gain in real-time.
**Verification:**
- Unit tests verify preset change events and PEQ serialization flow.
**Dependencies:** Task 12.
**Files Touched:**
- `src/renderer/components/presets/preset-bar.ts`
- `src/renderer/components/presets/peq-file-handler.ts`
**Estimated Scope:** Medium (2 files)

#### Task 14: Band List Editor Table
**Description:** Build the comprehensive band list editor displaying each band's parameters with real-time bi-directional synchronization with canvas nodes.
**Acceptance Criteria:**
- Displays Band ID, color indicator, Bypass checkbox, Filter Type dropdown, Frequency slider/input, Gain slider/input, Q/Bandwidth slider/input with unit toggle, Channel selector (All, L, R), and Delete button.
- "Add Band" (+) button creates a new parametric band.
- Changes in table immediately reflect on the canvas curve and audio graph; dragging canvas nodes immediately updates table fields.
**Verification:**
- Unit tests verify bi-directional store updates.
**Dependencies:** Task 12.
**Files Touched:**
- `src/renderer/components/bands/band-table.ts`
- `src/renderer/components/bands/band-row.ts`
- `src/renderer/components/bands/band-type-selector.ts`
**Estimated Scope:** Medium (3 files)

#### Task 15: Source Control Bar & Audio Meters
**Description:** Implement audio source selector bar (System Loopback, Microphone/Input Device, Local File, Test Generator), file transport controls (Play/Pause, Seek, Drop zone), and stereo peak/RMS level meters.
**Acceptance Criteria:**
- Switching source transitions audio graph without audio dropouts.
- File player displays track name, duration, and progress slider.
- Test generator provides controls for frequency and waveform.
- Stereo meters display real-time dB levels with clipping alert (> 0 dBFS).
**Verification:**
- Unit tests for source switching state transitions.
**Dependencies:** Task 6, Task 7.
**Files Touched:**
- `src/renderer/components/audio-source/source-control-bar.ts`
- `src/renderer/components/audio-source/file-player-ui.ts`
- `src/renderer/components/audio-source/level-meter.ts`
**Estimated Scope:** Medium (3 files)

#### Checkpoint 3: Interactive UI Verification
- [ ] Frequency curve matches DSP filters mathematically.
- [ ] Draggable nodes respond smoothly and update band table.
- [ ] Presets switch and persist correctly.
- [ ] PEQ files import and export accurately.
- [ ] Spectrum analyzer animates smoothly beneath the curve.

---

### Phase 4: State Management, Persistence & Automated Test Suite

#### Task 16: Immutable Application State Store
**Description:** Implement a reactive, immutable central store connecting the UI components, audio engine, and existing `ExpertEqualizerController`.
**Acceptance Criteria:**
- Strictly immutable: all state updates return new frozen state instances.
- Subscriptions allow UI components to re-render selectively.
- Dispatches actions: `SET_PRESET`, `UPDATE_BAND`, `ADD_BAND`, `REMOVE_BAND`, `SET_PREAMP`, `SET_BYPASS`, `SET_SOURCE`.
**Verification:**
- Unit tests verify state immutability: `npx vitest run tests/unit/equalizer-store.test.ts`.
**Dependencies:** Task 13, Task 14.
**Files Touched:**
- `src/renderer/state/equalizer-store.ts`
- `src/renderer/state/equalizer-store-types.ts`
- `tests/unit/equalizer-store.test.ts`
**Estimated Scope:** Medium (3 files)

#### Task 17: User Preset Persistence via Electron IPC
**Description:** Connect `PresetRepository` with Electron file persistence to automatically load user presets on launch and save updates to OS user data.
**Acceptance Criteria:**
- User presets survive application restarts.
- Corrupted preset files fall back safely to factory defaults with logged warning (no app crash).
**Verification:**
- Integration test for persistence load/save cycles.
**Dependencies:** Task 3, Task 16.
**Files Touched:**
- `src/renderer/state/persistence-sync.ts`
- `tests/integration/persistence-sync.test.ts`
**Estimated Scope:** Small (2 files)

#### Task 18: End-to-End & Integration Test Suite
**Description:** Build comprehensive integration tests for the audio graph and Playwright E2E tests verifying the Electron desktop application.
**Acceptance Criteria:**
- Integration tests verify audio graph parameter updates upon preset selection.
- E2E tests launch Electron, verify window rendering, canvas node interaction, preset switching, and PEQ file export.
- Test coverage meets or exceeds 80%.
**Verification:**
- `npm run test:coverage` achieves 80%+ coverage.
- `npm run test:e2e` passes.
**Dependencies:** Task 15, Task 16, Task 17.
**Files Touched:**
- `tests/integration/audio-graph-integration.test.ts`
- `tests/e2e/app-launch.spec.ts`
**Estimated Scope:** Medium (2 files)

#### Checkpoint 4: Final Production Readiness
- [ ] All 60+ existing tests and all new tests pass cleanly.
- [ ] Coverage exceeds 80%.
- [ ] Electron app packages cleanly.
- [ ] Zero console.log statements; all inputs validated via Zod.

---

## Risks and Mitigations

| Risk | Impact | Mitigation Strategy |
|---|---|---|
| macOS Screen Recording / Audio Capture permission denied | High | Detect permission error in `getUserMedia` and display an informative in-app prompt guiding user to macOS System Settings -> Privacy & Security -> Screen & System Audio Recording. Also provide Device Input / BlackHole loopback and local file player as immediate alternatives. |
| Web Audio API sample rate mismatch with system audio | Medium | Explicitly detect system stream sample rate and create AudioContext with matching sample rate, or leverage Web Audio automatic internal resampler. |
| Canvas rendering performance degradation with 60fps spectrum + complex curve | Medium | Render static elements (grid lines, dB markings) to an offscreen background canvas; only redraw spectrum and dynamic curve on `requestAnimationFrame`. |
| Audio pops or clicks during rapid filter parameter adjustment | Medium | Use `AudioParam.setTargetAtTime` or linear ramping across 20-50ms when adjusting frequency, gain, or Q, ensuring smooth transitions. |
| Cross-process IPC serialization overhead | Low | Keep IPC messages compact (JSON preset objects, stream IDs, file paths); audio buffers remain inside renderer Web Audio graph. |

---

## Open Questions & Clarifications

1. **Audio Driver / Loopback on macOS:**
   - Chrome's `desktopCapturer` system audio capture via `getUserMedia` is available on modern macOS (via ScreenCaptureKit in Chromium). Should we also bundle recommendations/instructions for virtual loopback devices like BlackHole 2ch for systems with strict OS permission restrictions? (Mitigated by our multi-source selector).
2. **AudioWorklet vs. Native Web Audio Biquad Cascade:**
   - The native Web Audio `BiquadFilterNode` cascade is hardware-accelerated in Chromium. Our mathematical formulas match RBJ Audio EQ Cookbook, identical to the standard Web Audio Biquad implementation. We recommend using native `BiquadFilterNode`s for real-time streaming with zero latency, alongside our software `AudioProcessor` for offline file rendering or AudioWorklet.
