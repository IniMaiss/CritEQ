/**
 * Electron Window Manager.
 * Creates and maintains the application BrowserWindow with precision mastering dark styling.
 * On macOS, closing the window hides it to preserve the live equalizer session while audio continues in the background.
 */

import { BrowserWindow, shell } from 'electron';
import { join } from 'path';

export class WindowManager {
  private mainWindow: BrowserWindow | null = null;
  private readonly preloadPath: string;
  private isQuitting = false;

  constructor(preloadPath: string) {
    this.preloadPath = preloadPath;
  }

  public setQuitting(quitting: boolean): void {
    this.isQuitting = quitting;
  }

  public getWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  public showWindow(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    if (this.mainWindow.isMinimized()) {
      this.mainWindow.restore();
    }
    this.mainWindow.show();
    this.mainWindow.focus();
  }

  public createWindow(): BrowserWindow {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.showWindow();
      return this.mainWindow;
    }

    const isMac = process.platform === 'darwin';

    const options: Electron.BrowserWindowConstructorOptions = {
      width: 1100,
      height: 750,
      minWidth: 720,
      minHeight: 540,
      title: 'CritEQ',
      backgroundColor: '#F4EFEA',
      titleBarStyle: isMac ? 'hiddenInset' : 'default',
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: false,
      },
    };

    if (isMac) {
      options.trafficLightPosition = { x: 16, y: 16 };
    }

    this.mainWindow = new BrowserWindow(options);

    this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    });

    this.mainWindow.webContents.on('will-navigate', (event, url) => {
      const devServerUrl = process.env['VITE_DEV_SERVER_URL'];
      if (!url.startsWith('file://') && (!devServerUrl || !url.startsWith(devServerUrl))) {
        event.preventDefault();
      }
    });

    // On macOS, clicking the red close button hides the window instead of destroying the EQ session
    this.mainWindow.on('close', (event) => {
      if (isMac && !this.isQuitting && this.mainWindow && !this.mainWindow.isDestroyed()) {
        event.preventDefault();
        this.mainWindow.hide();
      }
    });

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });

    return this.mainWindow;
  }

  public async loadContent(): Promise<void> {
    if (!this.mainWindow) {
      return;
    }

    const devServerUrl = process.env['VITE_DEV_SERVER_URL'];
    if (devServerUrl) {
      await this.mainWindow.loadURL(devServerUrl);
    } else {
      const indexPath = join(__dirname, '../renderer/index.html');
      await this.mainWindow.loadFile(indexPath);
    }
  }
}
