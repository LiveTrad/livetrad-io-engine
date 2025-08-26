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
                contextIsolation: false,
                webSecurity: false,
                // Désactiver les fonctionnalités problématiques
                webgl: false,
                webaudio: false,
                // Optimisations de performance
                backgroundThrottling: false,
                // Désactiver la vérification de l'origine
                allowRunningInsecureContent: true,
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
