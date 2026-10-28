import { describe, it, expect, vi } from 'vitest';
import { ExpertEqualizerController } from '../../src/databus/expert-equalizer-controller.js';
import { PresetRepository } from '../../src/repository/preset-repository.js';
import { REST_ROUTES } from '../../src/common/constants.js';
import { FilterType } from '../../src/models/filter-type.js';

describe('DataBus Controller Integration (/effects/equalizers/expert/*)', () => {
  it('handles GET /presets returning list of presets in ApiResponse envelope', async () => {
    const repo = new PresetRepository();
    const controller = new ExpertEqualizerController(repo);

    const response = await controller.handleRequest({
      method: 'GET',
      path: REST_ROUTES.PRESETS,
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect((response.body.data as unknown[]).length).toBeGreaterThan(0);
  });

  it('handles GET /presets/selected returning current active preset', async () => {
    const repo = new PresetRepository();
    const controller = new ExpertEqualizerController(repo);

    const response = await controller.handleRequest({
      method: 'GET',
      path: REST_ROUTES.SELECTED_PRESET,
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('name', 'Flat');
  });

  it('handles POST /presets creating a preset and selecting it when select=true', async () => {
    const repo = new PresetRepository();
    const controller = new ExpertEqualizerController(repo);

    const onPresetsChanged = vi.fn();
    const onSelectedChanged = vi.fn();
    controller.on('/presets', onPresetsChanged);
    controller.on('/presets/selected', onSelectedChanged);

    const response = await controller.handleRequest({
      method: 'POST',
      path: REST_ROUTES.PRESETS,
      body: {
        name: 'My Studio EQ',
        global: -1.0,
        bands: [
          {
            frequency: 1000,
            gain: 2.5,
            bandwidth: 1.0,
            type: FilterType.PARAMETRIC,
          },
        ],
        select: true,
      },
    });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('name', 'My Studio EQ');

    // Verify events were emitted
    expect(onPresetsChanged).toHaveBeenCalled();
    expect(onSelectedChanged).toHaveBeenCalled();

    // Verify current selection is now the newly created preset
    const selectedResp = await controller.handleRequest({
      method: 'GET',
      path: REST_ROUTES.SELECTED_PRESET,
    });
    expect(selectedResp.body.data).toHaveProperty('name', 'My Studio EQ');
  });

  it('handles POST /presets/select switching active preset', async () => {
    const repo = new PresetRepository();
    const controller = new ExpertEqualizerController(repo);
    const customPreset = await repo.create({
      name: 'Custom User Preset',
      global: 0,
      bands: [],
    });

    const response = await controller.handleRequest({
      method: 'POST',
      path: REST_ROUTES.SELECT_PRESET,
      body: { id: customPreset.id },
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('name', 'Custom User Preset');
  });

  it('handles DELETE /presets removing a user preset', async () => {
    const repo = new PresetRepository();
    const controller = new ExpertEqualizerController(repo);

    // Create user preset first
    const createResp = await controller.handleRequest({
      method: 'POST',
      path: REST_ROUTES.PRESETS,
      body: {
        name: 'Temporary',
        global: 0,
        bands: [],
      },
    });
    const createdId = (createResp.body.data as { id: string }).id;

    // Delete it
    const deleteResp = await controller.handleRequest({
      method: 'DELETE',
      path: REST_ROUTES.PRESETS,
      body: { id: createdId },
    });

    expect(deleteResp.status).toBe(200);
    expect(deleteResp.body.success).toBe(true);

    const found = await repo.findById(createdId);
    expect(found).toBeNull();
  });

  it('handles POST /presets/import importing Equalizer APO string', async () => {
    const repo = new PresetRepository();
    const controller = new ExpertEqualizerController(repo);

    const peqContent = `
Device: AutoEQ Sony WH-1000XM4
Preamp: -5.2 dB
Filter 1: ON PK Fc 28 Hz Gain 4.2 dB Q 2.0
Filter 2: ON PK Fc 1050 Hz Gain -3.1 dB Q 1.4
    `;

    const response = await controller.handleRequest({
      method: 'POST',
      path: REST_ROUTES.IMPORT_PRESETS,
      body: { peq: peqContent, select: true },
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    const importedList = response.body.data as Array<{ name: string; global: number }>;
    expect(importedList).toHaveLength(1);
    expect(importedList[0]?.name).toBe('AutoEQ Sony WH-1000XM4');
    expect(importedList[0]?.global).toBe(-5.2);
  });

  it('handles GET /presets/export exporting preset to Equalizer APO text', async () => {
    const repo = new PresetRepository();
    const controller = new ExpertEqualizerController(repo);

    const response = await controller.handleRequest({
      method: 'GET',
      path: REST_ROUTES.EXPORT_PRESETS,
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    const exportedText = response.body.data as string;
    expect(exportedText).toContain('Preamp:');
    expect(exportedText).toContain('Filter');
  });

  it('handles GET and POST /settings/show-default-presets', async () => {
    const repo = new PresetRepository();
    const controller = new ExpertEqualizerController(repo);

    const getResp = await controller.handleRequest({
      method: 'GET',
      path: REST_ROUTES.SHOW_DEFAULT_PRESETS,
    });
    expect(getResp.body.data).toEqual({ show: true });

    const postResp = await controller.handleRequest({
      method: 'POST',
      path: REST_ROUTES.SHOW_DEFAULT_PRESETS,
      body: { show: false },
    });
    expect(postResp.body.data).toEqual({ show: false });

    const getAgain = await controller.handleRequest({
      method: 'GET',
      path: REST_ROUTES.SHOW_DEFAULT_PRESETS,
    });
    expect(getAgain.body.data).toEqual({ show: false });
  });

  it('returns standardized 400/404 error envelope on invalid requests', async () => {
    const repo = new PresetRepository();
    const controller = new ExpertEqualizerController(repo);

    // Invalid select ID
    const notFound = await controller.handleRequest({
      method: 'POST',
      path: REST_ROUTES.SELECT_PRESET,
      body: { id: 'non-existent' },
    });
    expect(notFound.status).toBe(404);
    expect(notFound.body.success).toBe(false);
    expect(notFound.body.error).toBeDefined();

    // Unknown route
    const unknownRoute = await controller.handleRequest({
      method: 'GET',
      path: '/effects/equalizers/expert/non-existent-route',
    });
    expect(unknownRoute.status).toBe(404);
    expect(unknownRoute.body.success).toBe(false);
  });
});
