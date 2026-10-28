/**
 * Electron Main Process Entry Point.
 */

import { app, BrowserWindow } from 'electron';
import { join } from 'path';
import { WindowManager } from './window-manager.js';
import { PresetStorage } from './preset-storage.js';
import { registerIpcHandlers } from './ipc-handlers.js';
import { NativeAudioManager } from './native-audio-manager.js';

// Disable autoplay restrictions so Web Audio starts without gestures
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('enable-features', 'ScreenCaptureKitStreamPicker,MacSysAudioCapture');

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  const preloadPath = join(__dirname, '../preload/preload.js');
  const windowManager = new WindowManager(preloadPath);
  const presetStorage = new PresetStorage(app.getPath('userData'));
  const nativeAudioManager = new NativeAudioManager(() => windowManager.getWindow());

  registerIpcHandlers(() => windowManager.getWindow(), presetStorage, nativeAudioManager);

  app.on('second-instance', () => {
    windowManager.showWindow();
  });

  app.on('before-quit', () => {
    windowManager.setQuitting(true);
  });

  app.whenReady().then(async () => {
    windowManager.createWindow();
    nativeAudioManager.start();
    await windowManager.loadContent();

    app.on('activate', async () => {
      const existing = windowManager.getWindow();
      if (existing && !existing.isDestroyed()) {
        windowManager.showWindow();
      } else if (BrowserWindow.getAllWindows().length === 0) {
        windowManager.createWindow();
        await windowManager.loadContent();
      }
    });
  });

  app.on('will-quit', () => {
    nativeAudioManager.stop();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
