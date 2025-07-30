import { app, ipcMain } from 'electron';
import { MainWindow } from './window/main-window';
import { WebSocketService } from './services/websocket';
import { WebRTCService } from './services/webrtc';
import path from 'path';

class LiveTradApp {
    private mainWindow: MainWindow;
    private wsService: WebSocketService;
    private webrtcService: WebRTCService;
    private useWebRTC: boolean = false; // Toggle for WebRTC vs WebSocket

    constructor() {
        this.mainWindow = new MainWindow();
        this.wsService = new WebSocketService();
        this.webrtcService = new WebRTCService();
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

        // Gestion du volume
        ipcMain.handle('set-volume', async (_, { volume }) => {
            const success = await this.wsService.setVolume(volume);
            return { success };
        });

        // Gestion du mute
        ipcMain.handle('toggle-mute', async () => {
            const success = await this.wsService.toggleMute();
            return { success, isMuted: this.wsService.isMuted };
        });

        // Obtenir l'état actuel du volume
        ipcMain.handle('get-volume', () => {
            return { 
                volume: this.wsService.currentVolume,
                isMuted: this.wsService.isMuted 
            };
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

        // Listen for WebRTC connection changes
        this.webrtcService.on('connection-change', (data) => {
            this.mainWindow.getWindow()!.webContents.send('webrtc-connection-change', data);
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
            this.webrtcService.init();
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
