import { app } from 'electron';
import { MainWindow } from './window/main-window';
import { WebSocketService } from './services/websocket';

class LiveTradApp {
    private mainWindow: MainWindow;
    private wsService: WebSocketService;

    constructor() {
        this.mainWindow = new MainWindow();
        this.wsService = new WebSocketService();
        this.initApp();
    }

    private initApp(): void {
        app.on('ready', () => {
            this.mainWindow.create();
            this.wsService.init();
        });

        app.on('window-all-closed', () => {
            if (process.platform !== 'darwin') {
                app.quit();
            }
        });

        app.on('activate', () => {
            if (!this.mainWindow.getWindow()) {
                this.mainWindow.create();
            }
        });

        app.on('quit', () => {
            this.wsService.close();
        });
    }
}

// Start the application
new LiveTradApp();
