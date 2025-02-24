import { app, ipcMain } from 'electron';
import { MainWindow } from './window/main-window';
import { WebSocketService } from './services/websocket';
import path from 'path';

class LiveTradApp {
    private mainWindow: MainWindow;
    private wsService: WebSocketService;

    constructor() {
        this.mainWindow = new MainWindow();
        this.wsService = new WebSocketService();
        this.initApp();
        this.setupIPC();
    }

    private setupIPC(): void {
        ipcMain.handle('get-connection-status', () => {
            return this.wsService.getConnectionStatus();
        });

        // Listen for WebSocket connection changes
        // this.wsService.onConnectionChange((status) => {
        //     if (this.mainWindow.getWindow()) {
        //         this.mainWindow.getWindow()!.webContents.send('connection-change', status);
        //     }
        // });


  
  // Make sure to forward WebSocketService events to the renderer
  this.wsService.onConnectionChange((data) => {
    this.mainWindow.getWindow()!.webContents.send('connection-change', data);
  });
  
  this.wsService.onAudioStats((stats) => {
    this.mainWindow.getWindow()!.webContents.send('audio-stats', stats);
  });
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
