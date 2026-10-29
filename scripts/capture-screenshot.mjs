/**
 * Automated Screenshot Generator for CritEQ Documentation / README.
 * Captures pixel-perfect Retina UI screenshot using Electron's native capturePage API.
 */

import { app, BrowserWindow, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

app.whenReady().then(async () => {
  // Rich sample preset for demonstration in README
  const demoPreset = {
    id: 'demo-iem-preset',
    name: 'Moondrop Blessing 3 (Harman Target)',
    global: -3.5,
    isDefault: false,
    bands: [
      { id: 'b1', frequency: 28, gain: 5.5, bandwidth: 0.85, type: 0, bypass: false, color: '#FF6B6B' },
      { id: 'b2', frequency: 75, gain: 3.2, bandwidth: 1.10, type: 9, bypass: false, color: '#FFA07A' },
      { id: 'b3', frequency: 180, gain: -2.2, bandwidth: 1.40, type: 0, bypass: false, color: '#FFD93D' },
      { id: 'b4', frequency: 520, gain: 1.2, bandwidth: 1.80, type: 0, bypass: false, color: '#6BCB77' },
      { id: 'b5', frequency: 1250, gain: -1.6, bandwidth: 1.50, type: 0, bypass: false, color: '#4D96FF' },
      { id: 'b6', frequency: 2800, gain: 6.2, bandwidth: 1.25, type: 0, bypass: false, color: '#9B51E0' },
      { id: 'b7', frequency: 5900, gain: -3.8, bandwidth: 2.10, type: 0, bypass: false, color: '#FF7675' },
      { id: 'b8', frequency: 10500, gain: 3.5, bandwidth: 1.00, type: 10, bypass: false, color: '#FD79A8' },
    ],
  };

  ipcMain.handle('audio:get-output-devices', async () => ({
    success: true,
    devices: [
      { id: 1, name: 'MacBook Pro Speakers' },
      { id: 2, name: 'AirPods Pro (2nd Gen)' },
    ],
    activeDeviceId: 1,
  }));
  ipcMain.handle('storage:load-presets', async () => ({
    success: true,
    presets: [demoPreset],
    activePreset: demoPreset,
  }));
  ipcMain.handle('storage:save-presets', async () => ({ success: true }));
  ipcMain.handle('audio:update-bands', async () => ({ success: true }));
  ipcMain.handle('audio:set-bypass', async () => ({ success: true }));
  ipcMain.handle('audio:set-volume', async () => ({ success: true }));
  ipcMain.handle('audio:set-output-device', async () => ({ success: true }));
  ipcMain.handle('desktop-capturer:get-sources', async () => ({ success: true, sources: [] }));

  const win = new BrowserWindow({
    width: 1080,
    height: 680,
    show: true,
    backgroundColor: '#F4EFEA',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(projectRoot, 'dist/preload/preload.js'),
      sandbox: false,
      contextIsolation: true,
    },
  });

  await win.loadFile(path.join(projectRoot, 'dist/renderer/index.html'));

  // Feed simulated RTA spectrum data frames so the curve glow & meter bars are actively dancing
  const interval = setInterval(() => {
    if (win.isDestroyed()) return;
    const fft = new Array(128).fill(0).map((_, i) => {
      const freqFactor = 1 - (i / 128) * 0.7;
      const noise = (Math.sin(i * 0.28) + Math.cos(i * 0.12) + 2) / 4;
      return Math.max(0.02, Math.min(0.85, freqFactor * noise * 0.65));
    });
    win.webContents.send('audio:telemetry', {
      peakL: 0.78,
      peakR: 0.74,
      rmsL: 0.44,
      rmsR: 0.41,
      fft,
    });
  }, 50);

  // Allow layout, typography, SVG icons, and interactive canvas to settle
  await new Promise((resolve) => setTimeout(resolve, 3000));
  clearInterval(interval);

  const image = await win.webContents.capturePage();
  const outDir = path.join(projectRoot, 'docs/screenshots');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'criteq-app-preview.png');
  fs.writeFileSync(outPath, image.toPNG());
  process.stdout.write(`Screenshot captured successfully: ${outPath}\n`);

  app.quit();
});
