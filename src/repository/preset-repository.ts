/**
 * In-Memory Immutable Preset Repository.
 */

import { z } from 'zod';
import {
  ExpertEqualizerPreset,
  ExpertEqualizerPresetSchema,
  createPreset,
  updatePreset,
} from '../models/preset.js';
import { DEFAULT_PRESETS } from './default-presets.js';
import { Repository } from '../common/types.js';
import { PresetNotFoundError, ValidationError } from '../common/errors.js';

export type CreatePresetDto = z.input<typeof ExpertEqualizerPresetSchema>;
export type UpdatePresetDto = {
  [K in keyof CreatePresetDto]?: CreatePresetDto[K] | undefined;
};

export class PresetRepository
  implements Repository<ExpertEqualizerPreset, CreatePresetDto, UpdatePresetDto>
{
  private presets: readonly ExpertEqualizerPreset[];
  private selectedId: string;

  constructor(initialPresets: readonly ExpertEqualizerPreset[] = DEFAULT_PRESETS) {
    this.presets = Object.freeze([...initialPresets]);
    this.selectedId = initialPresets[0]?.id ?? '';
  }

  public async findAll(): Promise<readonly ExpertEqualizerPreset[]> {
    return this.presets;
  }

  public async findById(id: string): Promise<ExpertEqualizerPreset | null> {
    const found = this.presets.find((p) => p.id === id);
    return found ?? null;
  }

  public async create(data: CreatePresetDto): Promise<ExpertEqualizerPreset> {
    const newPreset = createPreset(data);
    this.presets = Object.freeze([...this.presets, newPreset]);
    return newPreset;
  }

  public async update(id: string, data: UpdatePresetDto): Promise<ExpertEqualizerPreset> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new PresetNotFoundError(id);
    }

    const updated = updatePreset(existing, data);
    this.presets = Object.freeze(this.presets.map((p) => (p.id === id ? updated : p)));
    return updated;
  }

  public async delete(id: string): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new PresetNotFoundError(id);
    }

    if (existing.isDefault) {
      throw new ValidationError('Default presets cannot be deleted.');
    }

    const deleteIndex = this.presets.findIndex((p) => p.id === id);
    this.presets = Object.freeze(this.presets.filter((p) => p.id !== id));
    if (this.selectedId === id) {
      if (deleteIndex - 1 > 0) {
        this.selectedId = this.presets[deleteIndex - 1]?.id ?? this.presets[0]?.id ?? '';
      } else if (deleteIndex < this.presets.length) {
        this.selectedId = this.presets[deleteIndex]?.id ?? this.presets[0]?.id ?? '';
      } else if (deleteIndex - 1 >= 0) {
        this.selectedId = this.presets[deleteIndex - 1]?.id ?? this.presets[0]?.id ?? '';
      } else {
        this.selectedId = this.presets[0]?.id ?? '';
      }
    }
  }

  public getSelectedId(): string {
    return this.selectedId;
  }

  public setSelectedId(id: string): void {
    const exists = this.presets.some((p) => p.id === id);
    if (!exists) {
      throw new PresetNotFoundError(id);
    }
    this.selectedId = id;
  }
}
