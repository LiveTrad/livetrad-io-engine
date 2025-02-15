import { BrowserWindow } from 'electron';
import path from 'path';
import { config } from '../config/env';

export class MainWindow {
    private window: BrowserWindow | null = null;

    constructor() {}

    public create(): void {
        this.window = new BrowserWindow({
            width: config.window.width,
            height: config.window.height,
            title: config.window.title,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: true,
                preload: path.join(__dirname, '../preload.js')
            }
        });

        this.window.loadFile(path.join(__dirname, '../../public/index.html'));
        
        if (config.isDevelopment) {
            this.window.webContents.openDevTools();
        }
    }

    public getWindow(): BrowserWindow | null {
        return this.window;
    }
}
