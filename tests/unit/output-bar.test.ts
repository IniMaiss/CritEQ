import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OutputBar } from '../../src/renderer/components/output-bar/output-bar.js';
import { LevelMeter } from '../../src/renderer/components/audio-source/level-meter.js';
import { EqualizerStore } from '../../src/renderer/state/equalizer-store.js';

interface MockElement {
  className: string;
  innerHTML: string;
  value: string;
  textContent: string;
  classList: {
    contains: ReturnType<typeof vi.fn>;
    toggle: ReturnType<typeof vi.fn>;
    add: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };
  style: Record<string, string>;
  appendChild: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  dispatchEvent: ReturnType<typeof vi.fn>;
  click: ReturnType<typeof vi.fn>;
  querySelector: ReturnType<typeof vi.fn>;
}

function createMockElement(): MockElement {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  const el: MockElement = {
    className: '',
    innerHTML: '',
    value: '1.0',
    textContent: '',
    classList: {
      contains: vi.fn(() => false),
      toggle: vi.fn(),
      add: vi.fn(),
      remove: vi.fn(),
    },
    style: {},
    appendChild: vi.fn(),
    remove: vi.fn(),
    addEventListener: vi.fn((evt: string, cb: (...args: unknown[]) => void) => {
      listeners[evt] = listeners[evt] || [];
      listeners[evt]!.push(cb);
    }),
    dispatchEvent: vi.fn((evt: { type: string }) => {
      const cbs = listeners[evt.type] || [];
      cbs.forEach((cb) => cb(evt));
      return true;
    }),
    click: vi.fn(() => {
      const cbs = listeners['click'] || [];
      cbs.forEach((cb) => cb({}));
    }),
    querySelector: vi.fn(() => createMockElement()),
  };
  return el;
}

describe('OutputBar Component', () => {
  let mockContainer: MockElement;
  let store: EqualizerStore;

  beforeEach(() => {
    mockContainer = createMockElement();
    store = new EqualizerStore();

    (globalThis as unknown as { window: unknown }).window = {
      electronAPI: {
        getDesktopSources: vi.fn(),
        openFileDialog: vi.fn(),
        saveFileDialog: vi.fn(),
        loadUserPresets: vi.fn(),
        saveUserPresets: vi.fn(),
        updateNativeBands: vi.fn(),
        setNativeBypass: vi.fn(),
        setNativeVolume: vi.fn(),
        getOutputDevices: vi.fn(async () => ({
          success: true,
          devices: [
            { id: 81, name: 'MacBook Pro Speakers' },
            { id: 2, name: 'External Headphones' },
          ],
        })),
        onTelemetry: vi.fn(() => () => {}),
      },
      requestAnimationFrame: vi.fn(() => 1),
      cancelAnimationFrame: vi.fn(),
    };
  });

  it('renders output bar markup without manual output device dropdown and attaches listeners', () => {
    const outputBar = new OutputBar(mockContainer as unknown as HTMLElement, store);
    expect(mockContainer.className).toBe('output-bar');
    expect(mockContainer.innerHTML).toContain('output-target-group');
    expect(mockContainer.innerHTML).not.toContain('output-device-select');
    expect(mockContainer.innerHTML).toContain('btn-eq-bypass');
    outputBar.destroy();
  });

  it('renders audiophile IEM suite controls (A/B slots, EQ scale, phase meter) without redundant volume or target curve', () => {
    const outputBar = new OutputBar(mockContainer as unknown as HTMLElement, store);
    expect(mockContainer.innerHTML).not.toContain('target-curve-select');
    expect(mockContainer.innerHTML).not.toContain('master-vol-slider');
    expect(mockContainer.innerHTML).toContain('btn-slot-a');
    expect(mockContainer.innerHTML).toContain('btn-slot-b');
    expect(mockContainer.innerHTML).toContain('btn-copy-ab');
    expect(mockContainer.innerHTML).toContain('eq-scale-slider');
    expect(mockContainer.innerHTML).toContain('meter-anchor');
    outputBar.destroy();
  });

  it('forwards telemetry levels to level meter safely for both 2-param and 4-param modes', () => {
    const outputBar = new OutputBar(mockContainer as unknown as HTMLElement, store);
    expect(() => {
      outputBar.setTelemetryLevels(0.75, 0.45);
    }).not.toThrow();
    expect(() => {
      outputBar.setTelemetryLevels(0.8, 0.7, 0.5, 0.4);
    }).not.toThrow();
    outputBar.destroy();
  });

  it('renders LevelMeter with dual L/R peak/RMS bars and stereo phase correlation cluster', () => {
    const meterEl = createMockElement();
    const meter = new LevelMeter(meterEl as unknown as HTMLElement);
    expect(meterEl.className).toBe('level-meter-container');
    expect(meterEl.innerHTML).toContain('audiophile-meter-unit');
    expect(meterEl.innerHTML).toContain('phase-meter-cluster');
    expect(meterEl.innerHTML).toContain('phase-pip');
    expect(() => {
      meter.setTelemetryLevels(0.9, 0.85, 0.4, 0.35);
    }).not.toThrow();
    meter.destroy();
  });
});
