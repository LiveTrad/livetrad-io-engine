import { app, ipcMain, session } from 'electron';
import { MainWindow } from './window/main-window';
import { WebSocketService } from './services/websocket';
import { WebRTCService } from './services/webrtc';
import path from 'path';
import dotenv from 'dotenv';

// Charger les variables d'environnement
dotenv.config();

// Configuration d'authentification
const AUTH_CONFIG = {
    username: process.env.AUTH_USERNAME || 'admin',
    password: process.env.AUTH_PASSWORD || 'admin123'
};

// État d'authentification en mémoire
let isAuthenticated = false;

class LiveTradApp {
    private mainWindow: MainWindow;
    private wsService: WebSocketService;
    private webrtcService: WebRTCService;
    private useWebRTC: boolean = true; // WebRTC activé par défaut // Toggle for WebRTC vs WebSocket

    private isInitialized = false;

    constructor() {
        this.mainWindow = new MainWindow();
        // Ne pas initialiser les services ici
        this.wsService = null as any;
        this.webrtcService = null as any;
        this.initApp();
        this.setupIPC();
    }

    private async initializeServices() {
        if (this.isInitialized) return;
        
        console.log('Initializing services...');
        
        // Initialiser les services seulement maintenant
        this.wsService = new WebSocketService();
        this.webrtcService = new WebRTCService();
        
        // Configurer les écouteurs d'événements
        this.setupWebRTCEventListeners();
        
        // Configurer les écouteurs de connexion
        this.wsService.onConnectionChange((data) => {
            this.mainWindow.getWindow()!.webContents.send('connection-change', data);
        });
        
        this.wsService.on('audio-stats', (stats) => {
            this.mainWindow.getWindow()!.webContents.send('audio-stats', stats);
        });

        // Écouter les changements de connexion WebRTC
        this.webrtcService.on('connection-change', (data) => {
            this.mainWindow.getWindow()!.webContents.send('webrtc-connection-change', data);
        });

        // Deepgram event handlers
        this.wsService.onTranscription((transcriptionData) => {
            this.mainWindow.getWindow()!.webContents.send('transcription', transcriptionData);
        });

        // Deepgram connection events
        this.wsService.onDeepgramConnected(() => {
            this.mainWindow.getWindow()!.webContents.send('deepgram-connected');
        });

        this.wsService.onDeepgramDisconnected(() => {
            this.mainWindow.getWindow()!.webContents.send('deepgram-disconnected');
        });

        this.wsService.onDeepgramError((error: any) => {
            this.mainWindow.getWindow()!.webContents.send('deepgram-error', error);
        });

        // Initialiser WebRTC
        this.webrtcService.init();
        
        this.isInitialized = true;
        console.log('Services initialized successfully');
    }

    private setupWebRTCEventListeners(): void {
        if (!this.webrtcService) {
            console.error('[Main] WebRTC service not initialized in setupWebRTCEventListeners');
            return;
        }

        try {
            this.webrtcService.on('connection-state-change', (state) => {
                if (!state) {
                    console.error('[Main] Received null or undefined WebRTC state');
                    return;
                }
                
                console.log('[Main] WebRTC connection state changed:', state);
                const mainWindow = this.mainWindow?.getWindow();
                
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('connection-change', {
                        status: state.status || 'disconnected',
                        details: {
                            clientId: state.clientId,
                            desktopUrl: state.desktopUrl,
                            streamInfo: state.streamInfo,
                            timestamp: state.timestamp || new Date().toISOString(),
                            iceState: state.iceConnectionState || 'disconnected',
                            connectionState: state.connectionState,
                            signalingState: state.signalingState
                        }
                    });
                }
            });
        } catch (error) {
            console.error('[Main] Error in WebRTC event listener:', error);
        }

        this.webrtcService.on('transcription', (transcriptionData) => {
            const mainWindow = this.mainWindow.getWindow();
            if (mainWindow) {
                mainWindow.webContents.send('transcription', transcriptionData);
            }
        });

        this.webrtcService.on('deepgram-connected', () => {
            const mainWindow = this.mainWindow.getWindow();
            if (mainWindow) {
                mainWindow.webContents.send('deepgram-connected');
            }
        });

        this.webrtcService.on('deepgram-disconnected', () => {
            const mainWindow = this.mainWindow.getWindow();
            if (mainWindow) {
                mainWindow.webContents.send('deepgram-disconnected');
            }
        });

        this.webrtcService.on('deepgram-error', (error) => {
            const mainWindow = this.mainWindow.getWindow();
            if (mainWindow) {
                mainWindow.webContents.send('deepgram-error', error);
            }
        });
    }

    // Vérifier l'authentification
    private checkAuth(): boolean {
        return isAuthenticated;
    }

    // Définir l'état d'authentification
    private setAuthenticated(authenticated: boolean): void {
        isAuthenticated = authenticated;
    }

    private setupIPC(): void {
        // Gestion de l'authentification
        ipcMain.handle('authenticate', async (_, { username, password }) => {
            const isValid = username === AUTH_CONFIG.username && 
                          password === AUTH_CONFIG.password;
            
            if (isValid) {
                try {
                    await this.initializeServices();
                    this.setAuthenticated(true);
                    return { success: true };
                } catch (error) {
                    console.error('Failed to initialize services:', error);
                    return { 
                        success: false, 
                        error: 'Erreur lors de l\'initialisation des services' 
                    };
                }
            }
            return { success: false, error: 'Identifiants invalides' };
        });

        // Vérifier l'état d'authentification
        ipcMain.handle('check-auth', () => {
            return { authenticated: this.checkAuth() };
        });

        // Déconnexion
        ipcMain.handle('logout', () => {
            this.setAuthenticated(false);
            return { success: true };
        });

        // Vérifier l'authentification pour les autres endpoints
        ipcMain.handle('get-connection-status', async () => {
            if (!(await this.checkAuth()) || !this.wsService) {
                return { status: 'disconnected', isAuthenticated: false };
            }
            return this.wsService.getConnectionStatus();
        });

        ipcMain.handle('toggle-playback', () => {
            if (!this.wsService) return { success: false, error: 'Service non initialisé' };
            this.wsService.togglePlayback();
            return { success: true, isPlaying: this.wsService.isPlaybackActive() };
        });

        ipcMain.handle('get-playback-status', () => {
            if (!this.wsService) return { isPlaying: false };
            return { isPlaying: this.wsService.isPlaybackActive() };
        });

        // Gestion du volume
        ipcMain.handle('set-volume', async (_, { volume }) => {
            if (!this.wsService) return { success: false };
            const success = await this.wsService.setVolume(volume);
            return { success };
        });

        // Gestion du mute
        ipcMain.handle('toggle-mute', async () => {
            if (!this.wsService) return { success: false, isMuted: false };
            const success = await this.wsService.toggleMute();
            return { success, isMuted: this.wsService.isMuted };
        });

        // Obtenir l'état actuel du volume
        ipcMain.handle('get-volume', () => {
            if (!this.wsService) return { volume: 0.8, isMuted: false };
            return { 
                volume: this.wsService.currentVolume,
                isMuted: this.wsService.isMuted 
            };
        });

        // Deepgram transcription handlers (apply to both WS and WebRTC paths)
        ipcMain.handle('toggle-transcription', () => {
            if (!this.wsService && !this.webrtcService) return { success: false, isActive: false };
            if (this.wsService) this.wsService.toggleTranscription();
            if (this.webrtcService) this.webrtcService.startTranscription(); // ensures WebRTC path forwards audio
            const isActive = (this.wsService && this.wsService.isTranscriptionActive()) || false;
            return { success: true, isActive };
        });

        ipcMain.handle('get-transcription-status', () => {
            if (!this.wsService && !this.webrtcService) return { isActive: false };
            if (this.wsService) return this.wsService.getTranscriptionStatus();
            return { active: false, connected: false, hasApiKey: false };
        });

        // Update transcription language/detection
        ipcMain.handle('set-transcription-language', (_evt, { language, detectLanguage }) => {
            if (this.wsService) this.wsService.setTranscriptionLanguage(language, detectLanguage);
            if (this.webrtcService) this.webrtcService.setTranscriptionLanguage(language, detectLanguage);
            return { success: true };
        });

        // Tous les écouteurs d'événements sont maintenant dans initializeServices()
        // pour s'assurer qu'ils ne sont configurés qu'après l'initialisation des services
    }

    private initApp(): void {
        app.on('ready', () => {
            this.mainWindow.create();
            // L'initialisation de WebRTC est maintenant gérée dans initializeServices()
            // après l'authentification réussie
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
