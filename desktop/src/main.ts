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

        ipcMain.handle('toggle-playback', () => {
            this.wsService.togglePlayback();
            return { success: true, isPlaying: this.wsService.isPlaybackActive() };
        });

        ipcMain.handle('get-playback-status', () => {
            return { isPlaying: this.wsService.isPlaybackActive() };
        });

        // Deepgram transcription handlers
        ipcMain.handle('toggle-transcription', () => {
            this.wsService.toggleTranscription();
            return { success: true, isActive: this.wsService.isTranscriptionActive() };
        });

        ipcMain.handle('get-transcription-status', () => {
            return this.wsService.getTranscriptionStatus();
        });

        // Listen for WebSocket connection changes
        this.wsService.onConnectionChange((data) => {
            this.mainWindow.getWindow()!.webContents.send('connection-change', data);
        });
        
        this.wsService.on('audio-stats', (stats) => {
            this.mainWindow.getWindow()!.webContents.send('audio-stats', stats);
        });

        // Deepgram event handlers
        this.wsService.onTranscription((transcriptionData) => {
            this.mainWindow.getWindow()!.webContents.send('transcription', transcriptionData);
        });

        this.wsService.onDeepgramConnected(() => {
            this.mainWindow.getWindow()!.webContents.send('deepgram-connected');
        });

        this.wsService.onDeepgramDisconnected(() => {
            this.mainWindow.getWindow()!.webContents.send('deepgram-disconnected');
        });

        this.wsService.onDeepgramError((error) => {
            this.mainWindow.getWindow()!.webContents.send('deepgram-error', error);
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
