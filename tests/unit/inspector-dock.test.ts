import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PresetBar } from '../../src/renderer/components/presets/preset-bar.js';
import { BandTable } from '../../src/renderer/components/bands/band-table.js';
import { EqualizerStore } from '../../src/renderer/state/equalizer-store.js';
import { BWtoQ } from '../../src/models/bandwidth-unit.js';

interface FakeElement {
  tagName: string;
  id: string;
  className: string;
  innerHTML: string;
  textContent: string;
  value: string;
  checked: boolean;
  dataset: Record<string, string>;
  style: Record<string, string>;
  children: FakeElement[];
  attributes: Record<string, string>;
  classList: {
    contains: (cls: string) => boolean;
    add: (cls: string) => void;
    remove: (cls: string) => void;
    toggle: (cls: string, force?: boolean) => void;
  };
  setAttribute: (k: string, v: string) => void;
  getAttribute: (k: string) => string | null;
  appendChild: (child: FakeElement) => FakeElement;
  addEventListener: (evt: string, cb: (...args: any[]) => void) => void;
  trigger: (evt: string, eventObj?: any) => void;
  querySelector: (sel: string) => FakeElement | null;
  querySelectorAll: (sel: string) => FakeElement[];
  focus: () => void;
  select: () => void;
  contains: (node: unknown) => boolean;
  getBoundingClientRect: () => { left: number; top: number; right: number; bottom: number; width: number; height: number };
  clientHeight: number;
  clientWidth: number;
}

function createFakeElement(tagName = 'div'): FakeElement {
  const listeners: Record<string, ((...args: any[]) => void)[]> = {};
  const childMap = new Map<string, FakeElement>();

  const el: FakeElement = {
    tagName: tagName.toUpperCase(),
    id: '',
    className: '',
    innerHTML: '',
    textContent: '',
    value: '',
    checked: false,
    dataset: {},
    style: {},
    children: [],
    attributes: {},
    classList: {
      contains: (cls: string) => el.className.split(/\s+/).includes(cls),
      add: (cls: string) => {
        if (!el.classList.contains(cls)) {
          el.className = `${el.className} ${cls}`.trim();
        }
      },
      remove: (cls: string) => {
        el.className = el.className
          .split(/\s+/)
          .filter((c) => c !== cls)
          .join(' ');
      },
      toggle: (cls: string, force?: boolean) => {
        const shouldHave = force !== undefined ? force : !el.classList.contains(cls);
        if (shouldHave) el.classList.add(cls);
        else el.classList.remove(cls);
      },
    },
    setAttribute: (k: string, v: string) => {
      el.attributes[k] = v;
    },
    getAttribute: (k: string) => el.attributes[k] ?? null,
    appendChild: (child: FakeElement) => {
      el.children.push(child);
      return child;
    },
    addEventListener: (evt: string, cb: (...args: any[]) => void) => {
      listeners[evt] = listeners[evt] ?? [];
      listeners[evt]!.push(cb);
    },
    trigger: (evt: string, eventObj: any = {}) => {
      const cbs = listeners[evt] ?? [];
      for (const cb of cbs) {
        cb({
          preventDefault: () => {},
          stopPropagation: () => {},
          button: 0,
          ...eventObj,
        });
      }
    },
    querySelector: (sel: string) => {
      // Check if markup contains the selector id or class
      if (sel.startsWith('#')) {
        const id = sel.slice(1);
        for (const c of el.children) {
          if (c.id === id) return c;
          const nested = c.querySelector(sel);
          if (nested) return nested;
        }
        if (!el.innerHTML.includes(`id="${id}"`)) {
          return null;
        }
      }
      if (!childMap.has(sel)) {
        const created = createFakeElement('div');
        if (sel.startsWith('#')) created.id = sel.slice(1);
        childMap.set(sel, created);
      }
      return childMap.get(sel)!;
    },
    querySelectorAll: () => [],
    focus: () => {},
    select: () => {},
    contains: () => false,
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 }),
    clientHeight: 150,
    clientWidth: 900,
  };

  return el;
}

describe('Option 2: Selected-Band Inspector Dock & Simplified Header', () => {
  let store: EqualizerStore;

  beforeEach(() => {
    store = new EqualizerStore();
    (globalThis as any).window = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      electronAPI: {
        saveUserPresets: vi.fn(),
      },
    };
    (globalThis as any).document = {
      activeElement: null,
      createElement: (tag: string) => createFakeElement(tag),
    };
  });

  it('removes Mixer/Flat and Q/Oct toggle buttons from PresetBar header', () => {
    const headerContainer = createFakeElement('header');
    new PresetBar(headerContainer as unknown as HTMLElement, store);

    expect(headerContainer.innerHTML).not.toContain('btn-bands-style');
    expect(headerContainer.innerHTML).not.toContain('btn-bw-unit');
    expect(headerContainer.innerHTML).not.toContain('>PRO<');
    expect(headerContainer.innerHTML).toContain('<div class="app-title">CritEQ</div>');
    expect(headerContainer.innerHTML).toContain('btn-spectrum-diff');
    expect(headerContainer.innerHTML).toContain('btn-import-peq');
    expect(headerContainer.innerHTML).toContain('btn-export-peq');
  });

  it('renders Option 2 Selected-Band Inspector Dock with band tabs, rotary dials, and combined Q | Oct box', () => {
    const bottomContainer = createFakeElement('footer');
    new BandTable(bottomContainer as unknown as HTMLElement, store);

    // Outer shell has tabs bar + inspector console
    expect(bottomContainer.innerHTML).toContain('eqm-inspector-dock');
    expect(bottomContainer.innerHTML).toContain('eqm-inspector-tabs-bar');
    expect(bottomContainer.innerHTML).toContain('eqm-inspector-console');

    const consoleEl = bottomContainer.querySelector('#eqm-inspector-console')!;
    expect(consoleEl.innerHTML).toContain('BAND 1: SELECTED');
    expect(consoleEl.innerHTML).toContain('FREQUENCY');
    expect(consoleEl.innerHTML).toContain('GAIN');
    expect(consoleEl.innerHTML).toContain('BANDWIDTH');

    // Combined Q and Oct values shown simultaneously
    const firstBand = store.getState().activePreset.bands[0]!;
    const expectedQ = BWtoQ(firstBand.bandwidth).toFixed(2);
    const expectedOct = firstBand.bandwidth.toFixed(2);
    expect(consoleEl.innerHTML).toContain(expectedQ);
    expect(consoleEl.innerHTML).toContain(`${expectedOct}`);
    expect(consoleEl.innerHTML).toContain('Oct');

    // Updating band updates Q and Oct readouts in-place
    store.updateBand({ ...firstBand, frequency: 420, gain: 3.5, bandwidth: 2.0 });
    expect(consoleEl.querySelector('#inspector-q-val')?.textContent).toBe(BWtoQ(2.0).toFixed(3));
    expect(consoleEl.querySelector('#inspector-oct-val')?.textContent).toBe('2.00');

    // Clicking + Add Band adds a new band
    const countBefore = store.getState().activePreset.bands.length;
    bottomContainer.querySelector('#btn-add-band')?.trigger('click');
    expect(store.getState().activePreset.bands.length).toBe(countBefore + 1);

    // Removing all bands renders empty state
    for (const b of [...store.getState().activePreset.bands]) {
      store.removeBand(b.id);
    }
    expect(consoleEl.innerHTML).toContain('No Active EQ Bands');
  });

  it('renders rotary dial SVGs with scalable 100% dimensions and responds to window/panel resizing', () => {
    const bottomContainer = createFakeElement('footer');
    const table = new BandTable(bottomContainer as unknown as HTMLElement, store);

    const consoleEl = bottomContainer.querySelector('#eqm-inspector-console')!;
    // SVGs must have scalable 100% width/height for vector responsiveness
    expect(consoleEl.innerHTML).toContain('width="100%"');
    expect(consoleEl.innerHTML).toContain('height="100%"');
    expect(consoleEl.innerHTML).toContain('viewBox="0 0 56 56"');

    // Test responsive dial calculation when container is compact (e.g. small window)
    consoleEl.clientHeight = 110;
    consoleEl.clientWidth = 600;
    table.updateResponsiveDialSize();
    const compactSize = parseInt(consoleEl.style['--dial-size'] ?? '0', 10);
    expect(compactSize).toBeGreaterThanOrEqual(38);
    expect(compactSize).toBeLessThanOrEqual(52);

    // Test responsive dial calculation when container is large (e.g. 1440p / maximized window)
    consoleEl.clientHeight = 300;
    consoleEl.clientWidth = 1400;
    table.updateResponsiveDialSize();
    const expandedSize = parseInt(consoleEl.style['--dial-size'] ?? '0', 10);
    expect(expandedSize).toBeGreaterThanOrEqual(70);
    expect(expandedSize).toBeLessThanOrEqual(115);

    table.destroy();
  });

  it('supports rotary knob keyboard steps, fine Shift modifier, and reset', () => {
    const bottomContainer = createFakeElement('footer');
    const table = new BandTable(bottomContainer as unknown as HTMLElement, store);

    const firstBand = store.getState().activePreset.bands[0]!;
    const initialFreq = firstBand.frequency;

    const consoleEl = bottomContainer.querySelector('#eqm-inspector-console')!;
    const freqDial = consoleEl.querySelector('#inspector-dial-freq');
    expect(freqDial).not.toBeNull();

    // Standard arrow step
    freqDial?.trigger('keydown', { key: 'ArrowUp', shiftKey: false });
    const freqAfterUp = store.getState().activePreset.bands[0]!.frequency;
    expect(freqAfterUp).toBeGreaterThan(initialFreq);

    // Shift arrow fine step
    const freqBeforeFine = freqAfterUp;
    freqDial?.trigger('keydown', { key: 'ArrowUp', shiftKey: true });
    const freqAfterFine = store.getState().activePreset.bands[0]!.frequency;
    expect(freqAfterFine).toBeGreaterThan(freqBeforeFine);
    expect(freqAfterFine - freqBeforeFine).toBeLessThan(freqAfterUp - initialFreq);

    // Home key resets frequency to default (1000 Hz)
    freqDial?.trigger('keydown', { key: 'Home' });
    expect(store.getState().activePreset.bands[0]!.frequency).toBe(1000);

    table.destroy();
  });
});
