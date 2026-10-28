# eqMac ExpertEqualizer Desktop App - Task Checklist

## Phase 1: Electron Infrastructure & Security Shell
- [ ] Task 1: Project Setup, Build Pipeline & Dependencies
  - [ ] Add `electron`, `vite`, and build configurations to `package.json`
  - [ ] Configure `vite.config.ts` for renderer bundling
  - [ ] Update `tsconfig.json` for Node + DOM dual targets
  - [ ] Verify `npm run typecheck` and `npm run build` succeed
- [ ] Task 2: IPC Validation Layer with Zod
  - [ ] Create `src/main/ipc-schemas.ts` defining all IPC channel payload schemas
  - [ ] Write unit tests in `tests/unit/ipc-schemas.test.ts`
  - [ ] Verify tests pass: `npx vitest run tests/unit/ipc-schemas.test.ts`
- [ ] Task 3: Main Process & Window Management
  - [ ] Create `src/main/main.ts` with application lifecycle and security hardening
  - [ ] Create `src/main/window-manager.ts` configuring macOS frameless window (min 960x650)
  - [ ] Create `src/main/ipc-handlers.ts` handling `desktopCapturer` and file dialogs
  - [ ] Create `src/main/preset-storage.ts` for local filesystem JSON persistence
- [ ] Task 4: Secure Preload Script & ContextBridge
  - [ ] Create `src/preload/preload-types.ts` with complete type definitions
  - [ ] Create `src/preload/preload.ts` using `contextBridge.exposeInMainWorld`
  - [ ] Verify typecheck passes cleanly

## Checkpoint 1: Electron Shell Verification
- [ ] Electron app launches in development mode
- [ ] Preload API is safely accessible in renderer context
- [ ] IPC tests pass

---

## Phase 2: Audio Engine, System Capture & DSP Pipeline
- [ ] Task 5: Web Audio Context & Graph Infrastructure
  - [ ] Create `src/renderer/audio/audio-context-manager.ts` with auto-resume logic
  - [ ] Create `src/renderer/audio/audio-graph.ts` for master gain and channel splitting
  - [ ] Write unit tests in `tests/unit/audio-context-manager.test.ts`
- [ ] Task 6: Audio Source Capture Manager
  - [ ] Create `src/renderer/audio/audio-source-manager.ts` supporting desktop audio & input devices
  - [ ] Handle macOS audio permissions and fallback logic
  - [ ] Write unit tests in `tests/unit/audio-source-manager.test.ts`
- [ ] Task 7: Local Audio File Player & Calibration Signal Generator
  - [ ] Create `src/renderer/audio/audio-file-player.ts` with drag & drop, seek, play/pause
  - [ ] Create `src/renderer/audio/test-signal-generator.ts` with sweeps, pink noise, and 1kHz tone
  - [ ] Write unit tests for audio playback transport
- [ ] Task 8: Web Audio Biquad Filter Cascade Integration
  - [ ] Create `src/renderer/audio/biquad-cascade-node.ts` implementing multi-band biquad cascade
  - [ ] Implement parameter smoothing (`setTargetAtTime`) to eliminate clicks/pops
  - [ ] Write unit tests in `tests/unit/biquad-cascade.test.ts`
- [ ] Task 9: Real-Time Spectrum Analyzer Service
  - [ ] Create `src/renderer/audio/spectrum-analyzer-service.ts` for dual pre/post AnalyserNodes
  - [ ] Implement logarithmic frequency bin mapping and RMS calculation
  - [ ] Write unit tests in `tests/unit/spectrum-analyzer.test.ts`

## Checkpoint 2: Audio DSP & Capture Verification
- [ ] Audio stream enters Web Audio graph from desktop capture, device, file, or tone generator
- [ ] Filter cascade processes audio in real-time matching preset parameters
- [ ] Spectrum analyser extracts valid FFT data

---

## Phase 3: Interactive eqMac ExpertEqualizer UI
- [ ] Task 10: eqMac Obsidian Dark Theme & App Shell
  - [ ] Create `src/renderer/styles/theme.css` with eqMac color palette and variables
  - [ ] Create `src/renderer/styles/layout.css` and `controls.css`
  - [ ] Create `src/renderer/components/app-shell.ts` and `src/renderer/index.html`
  - [ ] Verify responsive layout across window resizing
- [ ] Task 11: Real-Time FFT Spectrum Visualizer Canvas
  - [ ] Create `src/renderer/components/curve/spectrum-visualizer.ts`
  - [ ] Implement 60fps canvas animation loop with gradient fills aligned with log scale
- [ ] Task 12: Interactive Frequency Response Curve & Draggable Nodes
  - [ ] Create `src/renderer/components/curve/curve-math.ts` for log-frequency and dB coordinate mapping
  - [ ] Create `src/renderer/components/curve/curve-interaction.ts` for mouse drag, hover, and wheel
  - [ ] Create `src/renderer/components/curve/frequency-curve-canvas.ts` rendering curve and nodes
  - [ ] Write unit tests in `tests/unit/curve-math.test.ts`
- [ ] Task 13: Preset Bar & APO PEQ Import/Export UI
  - [ ] Create `src/renderer/components/presets/preset-bar.ts` with dropdown, preamp slider, bypass
  - [ ] Create `src/renderer/components/presets/peq-file-handler.ts` connecting native file dialogs with `parsePEQ` and `serializePEQ`
  - [ ] Verify preset switching updates audio graph and canvas in real time
- [ ] Task 14: Band List Editor Table
  - [ ] Create `src/renderer/components/bands/band-table.ts`
  - [ ] Create `src/renderer/components/bands/band-row.ts` with inputs for Freq, Gain, Q, Type, Bypass, Channel
  - [ ] Create `src/renderer/components/bands/band-type-selector.ts`
  - [ ] Implement bi-directional synchronization between canvas nodes and table rows
- [ ] Task 15: Source Control Bar & Audio Meters
  - [ ] Create `src/renderer/components/audio-source/source-control-bar.ts`
  - [ ] Create `src/renderer/components/audio-source/file-player-ui.ts`
  - [ ] Create `src/renderer/components/audio-source/level-meter.ts` with stereo peak & RMS display

## Checkpoint 3: Interactive UI Verification
- [ ] Draggable canvas nodes alter frequency curve and audio parameters in real time
- [ ] Presets load, save, and switch cleanly
- [ ] PEQ files import and export accurately
- [ ] Real-time spectrum visualizer renders beneath the curve

---

## Phase 4: State Management, Persistence & Automated Test Suite
- [ ] Task 16: Immutable Application State Store
  - [ ] Create `src/renderer/state/equalizer-store.ts` and `equalizer-store-types.ts`
  - [ ] Ensure strict immutability (frozen state objects) on every action
  - [ ] Write unit tests in `tests/unit/equalizer-store.test.ts`
- [ ] Task 17: User Preset Persistence via Electron IPC
  - [ ] Create `src/renderer/state/persistence-sync.ts` syncing with OS `userData`
  - [ ] Write integration test in `tests/integration/persistence-sync.test.ts`
- [ ] Task 18: End-to-End & Integration Test Suite
  - [ ] Create `tests/integration/audio-graph-integration.test.ts`
  - [ ] Create Playwright E2E tests in `tests/e2e/app-launch.spec.ts`
  - [ ] Run test suite with coverage: `npm run test:coverage` (enforce 80%+ coverage)

## Checkpoint 4: Final Production Readiness
- [ ] All unit, integration, and E2E tests pass
- [ ] Test coverage exceeds 80%
- [ ] Desktop app builds and packages without errors
- [ ] Zero `console.log` statements; all code follows style rules
