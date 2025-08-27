import { BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import { config } from '../config/env';

export class MainWindow {
    private window: BrowserWindow | null = null;

    constructor() {}

    public create(): void {
        // Resolve preload path for dev/prod
        const distPreload = path.join(__dirname, '../preload.js');
        const srcPreload = path.join(__dirname, '../../src/preload.js');
        const preloadPath = fs.existsSync(distPreload) ? distPreload : srcPreload;

        this.window = new BrowserWindow({
            width: config.window.width,
            height: config.window.height,
            title: config.window.title,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                webSecurity: true,
                preload: preloadPath,
                // Désactiver les fonctionnalités problématiques
                webgl: false,
                webaudio: false,
                // Optimisations de performance
                backgroundThrottling: false,
                // Désactiver la vérification de l'origine
                allowRunningInsecureContent: false,
                // Configuration réseau
                sandbox: false,
                nodeIntegrationInWorker: false,
                nodeIntegrationInSubFrames: false,
                // Désactiver les fonctionnalités obsolètes
                enableWebSQL: false,
                plugins: false
            }
        });

        // Désactiver le redémarrage automatique du service réseau
        if (this.window.webContents.debugger) {
            this.window.webContents.debugger.attach('1.3');
            this.window.webContents.debugger.sendCommand('Network.setCacheDisabled', { cacheDisabled: true });
        }

        this.window.loadFile(path.join(__dirname, '../../public/index.html'));
        
        if (config.isDevelopment) {
            this.window.webContents.openDevTools();
        }
    }

    public getWindow(): BrowserWindow | null {
        return this.window;
    }
}
