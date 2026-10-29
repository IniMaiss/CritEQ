/**
 * CritEQ Preset Bar & Preamp Header Component.
 * Manages preset selection, brand-folder categorization, save/delete,
 * Preamp flat-slider with boost/cut center fill, clickable Preamp dB screen,
 * Peak-Hold & Pre-EQ spectrum toggle, PEQ import/export, and visual Folder Browser.
 */

import { EqualizerStore } from '../../state/equalizer-store.js';
import { parsePEQ } from '../../../peq/peq-parser.js';
import { serializePEQ } from '../../../peq/peq-serializer.js';
import { EQMAC_COLORS, formatEqMacGain } from '../curve/eqmac-colors.js';
import {
  extractBrandFromPreset,
  getSortedBrandList,
  groupPresetsByBrand,
  FOLDER_ALL,
} from './brand-extractor.js';
import { ExpertEqualizerPreset } from '../../../models/preset.js';

export class PresetBar {
  private readonly container: HTMLElement;
  private readonly store: EqualizerStore;
  private unsubscribeStore: (() => void) | null = null;
  private brandSelectElement!: HTMLSelectElement;
  private selectElement!: HTMLSelectElement;
  private browseButton!: HTMLButtonElement;
  private presetNameInput!: HTMLInputElement;
  private saveButton!: HTMLButtonElement;
  private preampInput!: HTMLInputElement;
  private preampFillBar!: HTMLElement;
  private preampValueDisplay!: HTMLElement;
  private preampEditInput!: HTMLInputElement;
  private spectrumDiffBtn!: HTMLButtonElement;
  private cachedPresetIds: string[] = [];
  private cachedBrand: string = FOLDER_ALL;
  private selectedBrand: string = FOLDER_ALL;
  private isNamingPreset = false;
  private isEditingPreamp = false;
  private modalOverlay: HTMLElement | null = null;
  private modalSelectedFolder: string = FOLDER_ALL;
  private modalSearchQuery: string = '';

  constructor(container: HTMLElement, store: EqualizerStore) {
    this.container = container;
    this.store = store;
    this.render();
    this.setupSubscriptions();
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="header-left">
        <div class="app-title">CritEQ</div>
        <select id="preset-brand-selector" class="eqm-select eqm-brand-select" title="Filter Presets by Brand / Folder"></select>
        <select id="preset-selector" class="eqm-select" title="Select Preset"></select>
        <button id="btn-browse-presets" class="eqm-btn" title="Open Folder / Preset Browser">Folders</button>
        <input type="text" id="preset-name-input" placeholder="Preset name..." style="display: none; width: 120px;" />
        <button id="btn-save-preset" class="eqm-btn" title="Save Custom Preset">Save</button>
        <button id="btn-reset-preset" class="eqm-btn" title="Reset Current Preset to Default / 0 dB">Reset</button>
        <button id="btn-delete-preset" class="eqm-btn danger" title="Delete Preset">Delete</button>
      </div>

      <div class="header-center eqm-preamp-bar">
        <div class="eqm-preamp-label">PREAMP</div>
        <div class="eqm-flat-slider-wrap" title="Drag or double-click to reset Preamp (0 dB)">
          <div class="eqm-flat-slider-track">
            <div class="eqm-flat-slider-center-tick"></div>
            <div id="preamp-fill-bar" class="eqm-flat-slider-fill"></div>
          </div>
          <input type="range" id="preamp-slider" class="eqm-flat-slider-input" min="-24" max="24" step="0.1" value="0">
        </div>
        <div id="preamp-val" class="eqm-value-screen eqm-clickable" title="Click to enter exact Preamp dB">+0.0dB</div>
        <input type="number" id="preamp-edit-input" class="eqm-inline-num" min="-24" max="24" step="0.1" style="display: none; width: 64px;" />
      </div>

      <div class="header-right">
        <button id="btn-spectrum-diff" class="eqm-pill-btn active" title="Toggle Peak-Hold & Pre-EQ Trace">Peak</button>
        <button id="btn-import-peq" class="eqm-btn" title="Import Equalizer APO / REW File">Import</button>
        <button id="btn-export-peq" class="eqm-btn" title="Export Equalizer APO File">Export</button>
      </div>
    `;

    this.brandSelectElement = this.container.querySelector('#preset-brand-selector')!;
    this.selectElement = this.container.querySelector('#preset-selector')!;
    this.browseButton = this.container.querySelector('#btn-browse-presets')!;
    this.presetNameInput = this.container.querySelector('#preset-name-input')!;
    this.saveButton = this.container.querySelector('#btn-save-preset')!;
    this.preampInput = this.container.querySelector('#preamp-slider')!;
    this.preampFillBar = this.container.querySelector('#preamp-fill-bar')!;
    this.preampValueDisplay = this.container.querySelector('#preamp-val')!;
    this.preampEditInput = this.container.querySelector('#preamp-edit-input')!;
    this.spectrumDiffBtn = this.container.querySelector('#btn-spectrum-diff')!;

    this.attachEventListeners();
  }

  private attachEventListeners(): void {
    this.brandSelectElement?.addEventListener('change', () => {
      this.selectedBrand = this.brandSelectElement.value;
      this.cachedBrand = this.selectedBrand;
      const state = this.store.getState();
      this.populatePresetSelector(state);

      if (this.selectedBrand !== FOLDER_ALL) {
        const brandPresets = state.presets.filter(
          (p) => extractBrandFromPreset(p) === this.selectedBrand
        );
        if (
          brandPresets.length > 0 &&
          !brandPresets.some((p) => p.id === state.activePreset.id)
        ) {
          this.store.selectPreset(brandPresets[0]!.id);
        }
      }
    });

    this.selectElement.addEventListener('change', () => {
      this.closeInlineSave();
      this.store.selectPreset(this.selectElement.value);
    });

    this.browseButton?.addEventListener('click', () => {
      this.openFolderBrowserModal();
    });

    this.preampInput.addEventListener('input', () => {
      const val = parseFloat(this.preampInput.value);
      this.store.setPreamp(val);
    });

    this.preampInput.addEventListener('dblclick', () => {
      this.store.setPreamp(0);
    });

    this.preampValueDisplay.addEventListener('click', () => {
      this.openPreampInlineEdit();
    });

    this.preampEditInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.commitPreampInlineEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.closePreampInlineEdit();
      }
    });

    this.preampEditInput.addEventListener('blur', () => {
      if (this.isEditingPreamp) {
        this.commitPreampInlineEdit();
      }
    });

    this.spectrumDiffBtn.addEventListener('click', () => {
      this.store.setSpectrumDiff(!this.store.getState().spectrumDiff);
    });

    this.saveButton.addEventListener('click', () => {
      this.handleSavePreset();
    });

    this.presetNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.commitInlineSave();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.closeInlineSave();
      }
    });

    this.container.querySelector('#btn-reset-preset')?.addEventListener('click', () => {
      this.store.resetActivePreset();
    });

    this.container.querySelector('#btn-delete-preset')?.addEventListener('click', () => {
      this.handleDeletePreset();
    });

    this.container.querySelector('#btn-import-peq')?.addEventListener('click', () => {
      this.handleImportPEQ();
    });

    this.container.querySelector('#btn-export-peq')?.addEventListener('click', () => {
      this.handleExportPEQ();
    });
  }

  private setupSubscriptions(): void {
    this.unsubscribeStore = this.store.subscribe((state) => {
      const currentIds = state.presets.map((p) => p.id);
      const activeBrand = extractBrandFromPreset(state.activePreset);

      const presetsChanged =
        currentIds.length !== this.cachedPresetIds.length ||
        currentIds.some((id, idx) => id !== this.cachedPresetIds[idx]);

      if (
        this.selectedBrand !== FOLDER_ALL &&
        extractBrandFromPreset(state.activePreset) !== this.selectedBrand
      ) {
        this.selectedBrand = activeBrand;
      }

      if (presetsChanged || this.cachedBrand !== this.selectedBrand) {
        this.populateBrandSelector(state);
        this.populatePresetSelector(state);
        this.cachedPresetIds = currentIds;
        this.cachedBrand = this.selectedBrand;
      }

      if (this.brandSelectElement) {
        this.brandSelectElement.value = this.selectedBrand;
      }
      this.selectElement.value = state.activePreset.id;

      // Update Preamp flat-slider & value screen
      const currentGlobal = state.activePreset.global;
      if (document.activeElement !== this.preampInput) {
        this.preampInput.value = currentGlobal.toString();
      }
      this.updatePreampFillBar(currentGlobal);
      this.preampValueDisplay.textContent = formatEqMacGain(currentGlobal);

      // Update view toggles
      if (state.spectrumDiff) {
        this.spectrumDiffBtn.classList.add('active');
      } else {
        this.spectrumDiffBtn.classList.remove('active');
      }
    });
  }

  private populateBrandSelector(state: ReturnType<EqualizerStore['getState']>): void {
    if (!this.brandSelectElement) return;

    this.brandSelectElement.innerHTML = '';
    const brandMap = groupPresetsByBrand(state.presets);
    const sortedBrands = getSortedBrandList(state.presets);

    // All Brands option
    const allOpt = document.createElement('option');
    allOpt.value = FOLDER_ALL;
    allOpt.textContent = `All (${state.presets.length})`;
    this.brandSelectElement.appendChild(allOpt);

    for (const b of sortedBrands) {
      const count = brandMap.get(b)?.length ?? 0;
      const opt = document.createElement('option');
      opt.value = b;
      opt.textContent = `${b} (${count})`;
      this.brandSelectElement.appendChild(opt);
    }

    this.brandSelectElement.value = this.selectedBrand;
  }

  private populatePresetSelector(state: ReturnType<EqualizerStore['getState']>): void {
    this.selectElement.innerHTML = '';

    if (this.selectedBrand === FOLDER_ALL) {
      const brandMap = groupPresetsByBrand(state.presets);
      const sortedBrands = getSortedBrandList(state.presets);

      for (const b of sortedBrands) {
        const presets = brandMap.get(b) ?? [];
        if (presets.length === 0) continue;

        const group = document.createElement('optgroup');
        group.label = b;
        for (const preset of presets) {
          const opt = document.createElement('option');
          opt.value = preset.id;
          opt.textContent = preset.name;
          group.appendChild(opt);
        }
        this.selectElement.appendChild(group);
      }
    } else {
      const brandPresets = state.presets.filter(
        (p) => extractBrandFromPreset(p) === this.selectedBrand
      );

      for (const preset of brandPresets) {
        const opt = document.createElement('option');
        opt.value = preset.id;
        opt.textContent = preset.name;
        this.selectElement.appendChild(opt);
      }
    }

    this.selectElement.value = state.activePreset.id;
  }

  private openFolderBrowserModal(): void {
    this.closeFolderBrowserModal();

    const state = this.store.getState();
    this.modalSelectedFolder =
      this.selectedBrand !== FOLDER_ALL
        ? this.selectedBrand
        : extractBrandFromPreset(state.activePreset);
    this.modalSearchQuery = '';

    const overlay = document.createElement('div');
    overlay.className = 'eqm-folder-browser-overlay';
    overlay.innerHTML = `
      <div class="eqm-folder-browser-dialog">
        <div class="eqm-folder-header">
          <div class="eqm-folder-header-title">
            <span>Preset Browser</span>
            <span class="eqm-folder-badge" id="modal-total-badge">${state.presets.length} Presets</span>
          </div>
          <div class="eqm-folder-search-wrap">
            <input type="text" id="modal-search-input" class="eqm-folder-search-input" placeholder="Search brands or models (e.g. Lafitear, Chu, Hexa)..." />
          </div>
          <button id="modal-close-btn" class="eqm-folder-close-btn" title="Close">✕</button>
        </div>
        <div class="eqm-folder-body">
          <div class="eqm-folder-sidebar" id="modal-sidebar"></div>
          <div class="eqm-folder-content" id="modal-content"></div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this.modalOverlay = overlay;

    const closeBtn = overlay.querySelector('#modal-close-btn');
    closeBtn?.addEventListener('click', () => this.closeFolderBrowserModal());

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.closeFolderBrowserModal();
      }
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.closeFolderBrowserModal();
        window.removeEventListener('keydown', onKey);
      }
    };
    window.addEventListener('keydown', onKey);

    const searchInput = overlay.querySelector('#modal-search-input') as HTMLInputElement;
    searchInput?.addEventListener('input', () => {
      this.modalSearchQuery = searchInput.value.trim().toLowerCase();
      this.renderModalPresets();
    });

    this.renderModalSidebar();
    this.renderModalPresets();

    setTimeout(() => searchInput?.focus(), 50);
  }

  private closeFolderBrowserModal(): void {
    if (this.modalOverlay && this.modalOverlay.parentNode) {
      this.modalOverlay.parentNode.removeChild(this.modalOverlay);
    }
    this.modalOverlay = null;
  }

  private renderModalSidebar(): void {
    if (!this.modalOverlay) return;
    const sidebar = this.modalOverlay.querySelector('#modal-sidebar');
    if (!sidebar) return;

    sidebar.innerHTML = '';
    const state = this.store.getState();
    const brandMap = groupPresetsByBrand(state.presets);
    const sortedBrands = getSortedBrandList(state.presets);

    // All option
    const allBtn = document.createElement('button');
    allBtn.className = `eqm-folder-item ${this.modalSelectedFolder === FOLDER_ALL ? 'active' : ''}`;
    allBtn.innerHTML = `<span>All Brands</span><span class="eqm-folder-badge">${state.presets.length}</span>`;
    allBtn.addEventListener('click', () => {
      this.modalSelectedFolder = FOLDER_ALL;
      this.renderModalSidebar();
      this.renderModalPresets();
    });
    sidebar.appendChild(allBtn);

    for (const b of sortedBrands) {
      const count = brandMap.get(b)?.length ?? 0;
      const btn = document.createElement('button');
      btn.className = `eqm-folder-item ${this.modalSelectedFolder === b ? 'active' : ''}`;
      btn.innerHTML = `<span>${b}</span><span class="eqm-folder-badge">${count}</span>`;
      btn.addEventListener('click', () => {
        this.modalSelectedFolder = b;
        this.renderModalSidebar();
        this.renderModalPresets();
      });
      sidebar.appendChild(btn);
    }
  }

  private renderModalPresets(): void {
    if (!this.modalOverlay) return;
    const content = this.modalOverlay.querySelector('#modal-content');
    if (!content) return;

    content.innerHTML = '';
    const state = this.store.getState();
    let presetsToDisplay: readonly ExpertEqualizerPreset[] = state.presets;

    if (this.modalSelectedFolder !== FOLDER_ALL) {
      presetsToDisplay = presetsToDisplay.filter(
        (p) => extractBrandFromPreset(p) === this.modalSelectedFolder
      );
    }

    if (this.modalSearchQuery) {
      presetsToDisplay = presetsToDisplay.filter(
        (p) =>
          p.name.toLowerCase().includes(this.modalSearchQuery) ||
          extractBrandFromPreset(p).toLowerCase().includes(this.modalSearchQuery)
      );
    }

    const titleEl = document.createElement('div');
    titleEl.className = 'eqm-folder-content-title';
    titleEl.textContent = `${this.modalSelectedFolder === FOLDER_ALL ? 'All Brands' : this.modalSelectedFolder} (${presetsToDisplay.length} presets)`;
    content.appendChild(titleEl);

    if (presetsToDisplay.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.style.color = 'var(--text-muted)';
      emptyMsg.style.padding = '20px';
      emptyMsg.style.textAlign = 'center';
      emptyMsg.textContent = 'No matching presets found.';
      content.appendChild(emptyMsg);
      return;
    }

    // Limit rendered items in modal viewport for ultra-smooth scrolling (up to 200 items rendered)
    const renderLimit = presetsToDisplay.length > 200 ? 200 : presetsToDisplay.length;

    for (let i = 0; i < renderLimit; i++) {
      const preset = presetsToDisplay[i]!;
      const isActive = preset.id === state.activePreset.id;

      const card = document.createElement('div');
      card.className = `eqm-preset-card ${isActive ? 'active' : ''}`;
      card.innerHTML = `
        <div class="eqm-preset-card-info">
          <div class="eqm-preset-card-name">${preset.name}</div>
          <div class="eqm-preset-card-meta">Preamp: ${preset.global >= 0 ? '+' : ''}${preset.global.toFixed(1)} dB • ${preset.bands.length} Bands</div>
        </div>
        ${isActive ? '<div class="eqm-preset-card-tag">Active</div>' : ''}
      `;

      card.addEventListener('click', () => {
        this.store.selectPreset(preset.id);
        const brand = extractBrandFromPreset(preset);
        this.selectedBrand = brand;
        this.cachedBrand = brand;
        this.closeFolderBrowserModal();
      });

      content.appendChild(card);
    }

    if (presetsToDisplay.length > 200) {
      const footerMsg = document.createElement('div');
      footerMsg.style.color = 'var(--text-muted)';
      footerMsg.style.fontSize = '11px';
      footerMsg.style.textAlign = 'center';
      footerMsg.style.padding = '10px';
      footerMsg.textContent = `Showing first 200 of ${presetsToDisplay.length} presets. Type in search to narrow down.`;
      content.appendChild(footerMsg);
    }
  }

  private updatePreampFillBar(gainDb: number): void {
    const clamped = Math.max(-24, Math.min(24, gainDb));
    const pct = (Math.abs(clamped) / 24) * 50;
    if (clamped >= 0) {
      this.preampFillBar.style.left = '50%';
      this.preampFillBar.style.width = `${pct}%`;
      this.preampFillBar.style.backgroundColor = EQMAC_COLORS.warning;
    } else {
      this.preampFillBar.style.left = `${50 - pct}%`;
      this.preampFillBar.style.width = `${pct}%`;
      this.preampFillBar.style.backgroundColor = EQMAC_COLORS.accent;
    }
  }

  private openPreampInlineEdit(): void {
    this.isEditingPreamp = true;
    this.preampValueDisplay.style.display = 'none';
    this.preampEditInput.style.display = 'inline-block';
    this.preampEditInput.value = this.store.getState().activePreset.global.toFixed(1);
    this.preampEditInput.focus();
    this.preampEditInput.select();
  }

  private commitPreampInlineEdit(): void {
    const val = parseFloat(this.preampEditInput.value);
    this.closePreampInlineEdit();
    if (Number.isFinite(val)) {
      this.store.setPreamp(val);
    }
  }

  private closePreampInlineEdit(): void {
    this.isEditingPreamp = false;
    this.preampEditInput.style.display = 'none';
    this.preampValueDisplay.style.display = 'inline-flex';
  }

  private handleSavePreset(): void {
    if (this.isNamingPreset) {
      this.commitInlineSave();
      return;
    }

    const currentName = this.store.getState().activePreset.name;
    this.isNamingPreset = true;
    this.presetNameInput.value = `${currentName} Custom`;
    this.presetNameInput.style.display = 'inline-block';
    this.saveButton.textContent = 'Confirm';
    this.saveButton.classList.add('primary');
    this.presetNameInput.focus();
    this.presetNameInput.select();
  }

  private commitInlineSave(): void {
    const name = this.presetNameInput.value.trim();
    this.closeInlineSave();
    if (name) {
      this.savePresetWithName(name);
    }
  }

  private closeInlineSave(): void {
    this.isNamingPreset = false;
    this.presetNameInput.style.display = 'none';
    this.saveButton.textContent = 'Save';
    this.saveButton.classList.remove('primary');
  }

  private savePresetWithName(name: string): void {
    const saved = this.store.savePreset(name);
    if (window.electronAPI) {
      window.electronAPI.saveUserPresets(
        this.store.getState().presets.filter((p) => !p.isDefault)
      );
    }
    this.store.selectPreset(saved.id);
  }

  private handleDeletePreset(): void {
    const active = this.store.getState().activePreset;
    if (active.isDefault) {
      return;
    }
    this.store.deletePreset(active.id);
    if (window.electronAPI) {
      const state = this.store.getState();
      window.electronAPI.saveUserPresets(
        state.presets.filter((p) => !p.isDefault),
        state.activePreset
      );
    }
  }

  private async handleImportPEQ(): Promise<void> {
    if (!window.electronAPI) return;
    const res = await window.electronAPI.openFileDialog({ title: 'Import Equalizer APO / PEQ File' });
    if (!res.canceled && res.content) {
      try {
        const imported = parsePEQ(res.content);
        if (imported.length > 0) {
          this.store.importPresets(imported, true);
          window.electronAPI.saveUserPresets(this.store.getState().presets.filter((p) => !p.isDefault));
        }
      } catch {
        // Ignore invalid PEQ file
      }
    }
  }

  private async handleExportPEQ(): Promise<void> {
    if (!window.electronAPI) return;
    const active = this.store.getState().activePreset;
    const peqContent = serializePEQ(active);
    await window.electronAPI.saveFileDialog({
      title: 'Export Equalizer APO Config',
      defaultPath: `${active.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_APO.txt`,
      content: peqContent,
    });
  }

  public destroy(): void {
    this.closeFolderBrowserModal();
    if (this.unsubscribeStore) {
      this.unsubscribeStore();
      this.unsubscribeStore = null;
    }
  }
}
