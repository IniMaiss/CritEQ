/**
 * ExpertEqualizer DataBus Controller.
 * Exposes local RESTful endpoints under /effects/equalizers/expert/* for IPC and databus communications.
 */

import { z } from 'zod';
import { REST_ROUTES } from '../common/constants.js';
import {
  DataBusRequest,
  DataBusResponse,
  ApiResponse,
} from '../common/types.js';
import { PresetRepository, CreatePresetDto } from '../repository/preset-repository.js';
import { DataBusRouter } from './databus-router.js';
import { DataBusEventEmitter, DataBusListener } from './databus-event-emitter.js';
import { parsePEQ } from '../peq/peq-parser.js';
import { serializePEQ } from '../peq/peq-serializer.js';
import { ExpertEqualizerPreset, ExpertEqualizerPresetSchema } from '../models/preset.js';
import { PresetNotFoundError, ValidationError } from '../common/errors.js';

const SavePresetRequestSchema = ExpertEqualizerPresetSchema.partial().extend({
  select: z.boolean().optional(),
});

const SelectPresetRequestSchema = z.object({
  id: z.string().min(1, "Missing required 'id' parameter"),
});

const DeletePresetRequestSchema = z.object({
  id: z.string().min(1, "Missing required 'id' parameter"),
});

const ImportPEQRequestSchema = z.object({
  peq: z.string().min(1, "Missing 'peq' string in request body"),
  select: z.boolean().optional(),
});

const ShowDefaultPresetsRequestSchema = z.object({
  show: z.boolean().optional(),
});

export class ExpertEqualizerController {
  private readonly repository: PresetRepository;
  private readonly router: DataBusRouter;
  private readonly eventEmitter: DataBusEventEmitter;
  private showDefaultPresets: boolean = true;

  constructor(repository: PresetRepository) {
    this.repository = repository;
    this.router = new DataBusRouter();
    this.eventEmitter = new DataBusEventEmitter();
    this.registerRoutes();
  }

  public on<T>(channel: string, listener: DataBusListener<T>): void {
    this.eventEmitter.on(channel, listener);
  }

  public off<T>(channel: string, listener: DataBusListener<T>): void {
    this.eventEmitter.off(channel, listener);
  }

  public async handleRequest(req: DataBusRequest): Promise<DataBusResponse> {
    return this.router.dispatch(req);
  }

  private registerRoutes(): void {
    this.router.get(REST_ROUTES.PRESETS, () => this.handleGetPresets());
    this.router.get(REST_ROUTES.SELECTED_PRESET, () => this.handleGetSelectedPreset());
    this.router.post(REST_ROUTES.PRESETS, (req) => this.handleSavePreset(req));
    this.router.post(REST_ROUTES.SELECT_PRESET, (req) => this.handleSelectPreset(req));
    this.router.delete(REST_ROUTES.PRESETS, (req) => this.handleDeletePreset(req));
    this.router.post(REST_ROUTES.IMPORT_PRESETS, (req) => this.handleImportPresets(req));
    this.router.get(REST_ROUTES.EXPORT_PRESETS, () => this.handleExportPresets());
    this.router.get(REST_ROUTES.SHOW_DEFAULT_PRESETS, () => this.handleGetShowDefaultPresets());
    this.router.post(REST_ROUTES.SHOW_DEFAULT_PRESETS, (req) => this.handlePostShowDefaultPresets(req));
  }

  private async handleGetPresets(): Promise<DataBusResponse> {
    const all = await this.repository.findAll();
    const filtered = this.showDefaultPresets ? all : all.filter((p) => !p.isDefault);
    const body: ApiResponse<readonly ExpertEqualizerPreset[]> = {
      success: true,
      data: filtered,
      meta: { total: filtered.length, page: 1, limit: filtered.length },
    };
    return { status: 200, body };
  }

  private async handleGetSelectedPreset(): Promise<DataBusResponse> {
    const selectedId = this.repository.getSelectedId();
    const preset = await this.repository.findById(selectedId);
    if (!preset) {
      return {
        status: 404,
        body: { success: false, error: 'No active preset selected' },
      };
    }
    return { status: 200, body: { success: true, data: preset } };
  }

  private async handleSavePreset(req: DataBusRequest): Promise<DataBusResponse> {
    try {
      const parsed = SavePresetRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        const errorMsg = parsed.error.issues[0]?.message ?? 'Invalid preset request';
        return { status: 400, body: { success: false, error: errorMsg } };
      }

      const { select: shouldSelect, ...presetData } = parsed.data;
      let preset: ExpertEqualizerPreset;

      if (presetData.id) {
        const existing = await this.repository.findById(presetData.id);
        if (existing) {
          preset = await this.repository.update(presetData.id, presetData);
        } else {
          preset = await this.repository.create(presetData as CreatePresetDto);
        }
      } else {
        preset = await this.repository.create(presetData as CreatePresetDto);
      }

      if (shouldSelect) {
        this.repository.setSelectedId(preset.id);
        this.eventEmitter.emit('/presets/selected', preset);
      }

      this.eventEmitter.emit('/presets', await this.repository.findAll());
      return { status: 201, body: { success: true, data: preset } };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid preset';
      return { status: 400, body: { success: false, error: msg } };
    }
  }

  private async handleSelectPreset(req: DataBusRequest): Promise<DataBusResponse> {
    const parsed = SelectPresetRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const errorMsg = parsed.error.issues[0]?.message ?? "Missing required 'id' parameter";
      return { status: 400, body: { success: false, error: errorMsg } };
    }

    try {
      this.repository.setSelectedId(parsed.data.id);
      const preset = await this.repository.findById(parsed.data.id);
      this.eventEmitter.emit('/presets/selected', preset);
      return { status: 200, body: { success: true, data: preset } };
    } catch (err: unknown) {
      const status = err instanceof PresetNotFoundError ? 404 : 400;
      const msg = err instanceof Error ? err.message : 'Preset selection failed';
      return { status, body: { success: false, error: msg } };
    }
  }

  private async handleDeletePreset(req: DataBusRequest): Promise<DataBusResponse> {
    const parsed = DeletePresetRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const errorMsg = parsed.error.issues[0]?.message ?? "Missing required 'id' parameter";
      return { status: 400, body: { success: false, error: errorMsg } };
    }

    try {
      await this.repository.delete(parsed.data.id);
      this.eventEmitter.emit('/presets', await this.repository.findAll());
      return {
        status: 200,
        body: { success: true, data: { deletedId: parsed.data.id } },
      };
    } catch (err: unknown) {
      const status =
        err instanceof PresetNotFoundError
          ? 404
          : err instanceof ValidationError
            ? 400
            : 500;
      const msg = err instanceof Error ? err.message : 'Deletion failed';
      return { status, body: { success: false, error: msg } };
    }
  }

  private async handleImportPresets(req: DataBusRequest): Promise<DataBusResponse> {
    const parsed = ImportPEQRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const errorMsg = parsed.error.issues[0]?.message ?? "Missing 'peq' string in request body";
      return { status: 400, body: { success: false, error: errorMsg } };
    }

    try {
      const parsedPresets = parsePEQ(parsed.data.peq);
      const savedPresets: ExpertEqualizerPreset[] = [];
      for (const p of parsedPresets) {
        const saved = await this.repository.create({
          name: p.name,
          global: p.global,
          bands: p.bands,
        });
        savedPresets.push(saved);
      }

      if (parsed.data.select && savedPresets[0]) {
        this.repository.setSelectedId(savedPresets[0].id);
        this.eventEmitter.emit('/presets/selected', savedPresets[0]);
      }

      this.eventEmitter.emit('/presets', await this.repository.findAll());
      return { status: 200, body: { success: true, data: savedPresets } };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'PEQ import failed';
      return { status: 400, body: { success: false, error: msg } };
    }
  }

  private async handleExportPresets(): Promise<DataBusResponse> {
    const selectedId = this.repository.getSelectedId();
    const preset = await this.repository.findById(selectedId);
    if (!preset) {
      return {
        status: 404,
        body: { success: false, error: 'No preset available for export' },
      };
    }
    const exportedPEQ = serializePEQ(preset);
    return { status: 200, body: { success: true, data: exportedPEQ } };
  }

  private handleGetShowDefaultPresets(): DataBusResponse {
    return {
      status: 200,
      body: { success: true, data: { show: this.showDefaultPresets } },
    };
  }

  private handlePostShowDefaultPresets(req: DataBusRequest): DataBusResponse {
    const parsed = ShowDefaultPresetsRequestSchema.safeParse(req.body ?? {});
    this.showDefaultPresets = Boolean(parsed.data?.show);
    return {
      status: 200,
      body: { success: true, data: { show: this.showDefaultPresets } },
    };
  }
}
