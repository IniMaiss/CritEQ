import { describe, it, expect } from 'vitest';
import { PresetRepository } from '../../src/repository/preset-repository.js';
import { DEFAULT_PRESETS } from '../../src/repository/default-presets.js';
import { createPresetBand } from '../../src/models/preset-band.js';
import { FilterType } from '../../src/models/filter-type.js';
import { PresetNotFoundError, ValidationError } from '../../src/common/errors.js';

describe('Preset Repository & Default Presets', () => {
  it('initializes with only the single flat 0 dB workspace preset and no other built-in presets', async () => {
    const repo = new PresetRepository();
    const presets = await repo.findAll();

    expect(DEFAULT_PRESETS).toHaveLength(1);
    expect(presets).toHaveLength(1);
    expect(presets[0]?.name).toBe('Flat');
    expect(presets[0]?.isDefault).toBe(true);
    expect(presets[0]?.bands.every((b) => b.gain === 0)).toBe(true);
  });

  it('finds preset by id', async () => {
    const repo = new PresetRepository();
    const all = await repo.findAll();
    const target = all[0]!;

    const found = await repo.findById(target.id);
    expect(found).not.toBeNull();
    expect(found?.name).toBe(target.name);

    const nonExistent = await repo.findById('non-existent-id');
    expect(nonExistent).toBeNull();
  });

  it('creates and stores a new preset immutably', async () => {
    const repo = new PresetRepository();
    const newPreset = await repo.create({
      name: 'User Rock',
      global: -1.5,
      bands: [
        createPresetBand({
          frequency: 100,
          gain: 4.0,
          bandwidth: 1.0,
          type: FilterType.RESONANT_LOW_SHELF,
        }),
      ],
    });

    expect(newPreset.id).toBeDefined();
    expect(newPreset.name).toBe('User Rock');
    expect(newPreset.isDefault).toBe(false);

    const retrieved = await repo.findById(newPreset.id);
    expect(retrieved?.name).toBe('User Rock');
  });

  it('updates an existing user preset', async () => {
    const repo = new PresetRepository();
    const created = await repo.create({
      name: 'Vocal Initial',
      global: 0,
      bands: [],
    });

    const updated = await repo.update(created.id, {
      name: 'Vocal Refined',
      global: 2.0,
    });

    expect(updated.name).toBe('Vocal Refined');
    expect(updated.global).toBe(2.0);

    const fetched = await repo.findById(created.id);
    expect(fetched?.name).toBe('Vocal Refined');
  });

  it('prevents deleting default presets', async () => {
    const repo = new PresetRepository();
    const all = await repo.findAll();
    const defaultPreset = all.find((p) => p.isDefault)!;

    await expect(repo.delete(defaultPreset.id)).rejects.toThrow(ValidationError);
  });

  it('deletes user presets', async () => {
    const repo = new PresetRepository();
    const created = await repo.create({
      name: 'To Delete',
      global: 0,
      bands: [],
    });

    await repo.delete(created.id);
    const found = await repo.findById(created.id);
    expect(found).toBeNull();
  });

  it('selects adjacent preset when active preset is deleted', async () => {
    const repo = new PresetRepository();
    const p1 = await repo.create({ name: 'Preset 1', global: 0, bands: [] });
    const p2 = await repo.create({ name: 'Preset 2', global: 0, bands: [] });
    const p3 = await repo.create({ name: 'Preset 3', global: 0, bands: [] });

    // 1. Delete middle active preset (P2) -> moves up to P1
    repo.setSelectedId(p2.id);
    await repo.delete(p2.id);
    expect(repo.getSelectedId()).toBe(p1.id);

    // List: Flat (0), P1 (1), P3 (2)
    // 2. Delete last active preset (P3) -> moves up to P1
    repo.setSelectedId(p3.id);
    await repo.delete(p3.id);
    expect(repo.getSelectedId()).toBe(p1.id);

    // Add P4: Flat (0), P1 (1), P4 (2)
    const p4 = await repo.create({ name: 'Preset 4', global: 0, bands: [] });
    // 3. Delete first custom preset (P1) when P4 exists below -> moves down to P4, NOT Flat
    repo.setSelectedId(p1.id);
    await repo.delete(p1.id);
    expect(repo.getSelectedId()).toBe(p4.id);

    // 4. Delete sole custom preset (P4) -> falls back to Flat
    await repo.delete(p4.id);
    const all = await repo.findAll();
    const flat = all.find((p) => p.name === 'Flat')!;
    expect(repo.getSelectedId()).toBe(flat.id);
  });

  it('manages active / selected preset ID', async () => {
    const repo = new PresetRepository();
    const all = await repo.findAll();
    const flat = all.find((p) => p.name === 'Flat')!;

    expect(repo.getSelectedId()).toBe(flat.id);

    const custom = await repo.create({
      name: 'My Selection',
      global: 0,
      bands: [],
    });

    repo.setSelectedId(custom.id);
    expect(repo.getSelectedId()).toBe(custom.id);

    expect(() => repo.setSelectedId('invalid-id')).toThrow(PresetNotFoundError);
  });
});
