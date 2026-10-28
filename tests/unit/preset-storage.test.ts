import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { PresetStorage } from '../../src/main/preset-storage.js';
import { createPreset } from '../../src/models/preset.js';

describe('PresetStorage', () => {
  let tempDir: string;
  let storage: PresetStorage;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(join(tmpdir(), 'preset-storage-test-'));
    storage = new PresetStorage(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('returns empty presets array if file does not exist', async () => {
    const res = await storage.loadPresets();
    expect(res.success).toBe(true);
    expect(res.presets).toEqual([]);
  });

  it('saves and loads user presets reliably', async () => {
    const preset = createPreset({
      name: 'Custom HipHop EQ',
      global: -2.0,
      bands: [],
    });

    const saveRes = await storage.savePresets([preset], preset);
    expect(saveRes.success).toBe(true);

    const loadRes = await storage.loadPresets();
    expect(loadRes.success).toBe(true);
    expect(loadRes.presets).toHaveLength(1);
    expect(loadRes.presets[0]?.name).toBe('Custom HipHop EQ');
    expect(loadRes.presets[0]?.global).toBe(-2.0);
    expect(loadRes.activePreset?.name).toBe('Custom HipHop EQ');

    const saveWithoutActive = await storage.savePresets([preset]);
    expect(saveWithoutActive.success).toBe(true);
  });

  it('handles corrupted preset files gracefully', async () => {
    const filePath = join(tempDir, 'presets.json');
    await fs.writeFile(filePath, 'not valid json', 'utf-8');

    const loadRes = await storage.loadPresets();
    expect(loadRes.success).toBe(false);
    expect(loadRes.presets).toEqual([]);
    expect(loadRes.error).toBeDefined();
  });
});
