import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { config } from '../config/env';
import { createWriteStream } from 'fs';
import { spawn } from 'child_process';
import { TranscriptionData } from './deepgram';
import { LiveTradTranscriptor } from './transcription/transcriptor';
import { DeepgramProvider } from './transcription/providers/deepgram-provider';

export class WebSocketService extends EventEmitter {
    private wss: WebSocketServer | null = null;
    private connections: Map<WebSocket, string> = new Map();
    private audioStats: any = null;
    private audioPlaybackProcess: any = null;
    private isPlaying: boolean = false;
    public currentVolume: number = 0.8; // Volume par défaut (80%)
    public isMuted: boolean = false;
    private _isPlaybackActive: boolean = false;
    private transcriptor: LiveTradTranscriptor;
    private transcriptionEnabled: boolean = false;
    
    // Buffer audio pour lisser le flux et éviter les saccades
    private audioBuffer: Buffer[] = [];
    private bufferMaxSize: number = 10; // Nombre maximum de chunks en buffer
    private bufferFlushInterval: NodeJS.Timeout | null = null;
    private lastAudioTime: number = 0;

    constructor() {
        super();
        this.transcriptor = new LiveTradTranscriptor(new DeepgramProvider());
        this.setupTranscriptionListeners();
    }

    public init(): void {
        console.log('Initializing WebSocket server...');
        this.wss = new WebSocketServer({ 
            port: config.websocket.port 
        });

        this.setupEventListeners();
        console.log(`WebSocket server running on ws://${config.websocket.host}:${config.websocket.port}`);
    }

    private setupEventListeners(): void {
        if (!this.wss) {
            console.error('WebSocket server not initialized');
            return;
        }

        this.wss.on('connection', (ws: WebSocket) => {
            const clientId = this.generateClientId();
            this.connections.set(ws, clientId);
            console.log(`[WebSocket] New connection from client ${clientId}`);
            
            this.emit('connection-change', {
                status: 'connected',
                clients: this.connections.size
            });

            ws.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
                try {
                    if (Buffer.isBuffer(data) || data instanceof ArrayBuffer) {
                        // Handle binary audio data (PCM)
                        const audioBuffer = Buffer.isBuffer(data) ? data : Buffer.from(new Uint8Array(data));
                        console.log('[WebSocket] Received audio chunk:', {
                            size: audioBuffer.length,
                            timestamp: new Date().toISOString()
                        });

                        // Calculate audio stats
                        // Assuming PCM 16-bit data, we need to convert to float for stats
                        const int16Array = new Int16Array(audioBuffer.buffer, audioBuffer.byteOffset, audioBuffer.length / 2);
                        let sum = 0;
                        let maxValue = Number.MIN_VALUE;
                        let minValue = Number.MAX_VALUE;

                        for (let i = 0; i < int16Array.length; i++) {
                            const value = int16Array[i] / 32768; // Convert to [-1, 1] range
                            sum += Math.abs(value);
                            maxValue = Math.max(maxValue, value);
                            minValue = Math.min(minValue, value);
                        }

                        const avgValue = int16Array.length > 0 ? sum / int16Array.length : 0;

                        this.audioStats = {
                            chunkSize: audioBuffer.length,
                            maxValue: maxValue.toFixed(4),
                            minValue: minValue.toFixed(4),
                            avgValue: avgValue.toFixed(4),
                            timestamp: new Date().toISOString()
                        };

                        // Emit audio stats for UI updates
                        this.emit('audio-stats', this.audioStats);

                        // Log detailed stats to console
                        console.log('[WebSocket] Audio chunk stats:', this.audioStats);
                        
                        // Optionally save PCM data to file (for debugging or further processing)
                        // Uncomment to save PCM data
                        /*
                        const fs = require('fs');
                        const outputPath = 'output_audio.pcm';
                        fs.appendFileSync(outputPath, audioBuffer);
                        console.log(`[WebSocket] Appended audio chunk to ${outputPath}`);
                        */

                        // Si le playback est actif, ajouter au buffer pour un flux lissé
                        if (this.isPlaying && this.audioPlaybackProcess) {
                            try {
                                // Appliquer le volume et le mute côté logiciel
                                let processedBuffer = audioBuffer;
                                
                                if (this.isMuted) {
                                    // Mute : remplacer toutes les valeurs par 0
                                    processedBuffer = Buffer.alloc(audioBuffer.length, 0);
                                } else if (this.currentVolume !== 1.0) {
                                    // Ajuster le volume : multiplier chaque échantillon par le facteur de volume
                                    processedBuffer = Buffer.from(audioBuffer);
                                    const int16Array = new Int16Array(processedBuffer.buffer, processedBuffer.byteOffset, processedBuffer.length / 2);
                                    
                                    for (let i = 0; i < int16Array.length; i++) {
                                        int16Array[i] = Math.round(int16Array[i] * this.currentVolume);
                                    }
                                }
                                
                                // Ajouter au buffer pour un flux lissé
                                this.addToAudioBuffer(processedBuffer);
                                
                                // Log moins fréquent pour éviter le spam
                                if (Math.random() < 0.005) { // 0.5% des chunks
                                    console.log('[WebSocket] Added audio chunk to buffer, buffer size:', this.audioBuffer.length);
                                }
                            } catch (error) {
                                console.error('[WebSocket] Error processing audio chunk:', error);
                            }
                        }

                        // Si la transcription est activée, envoyer les données audio à Deepgram
                        if (this.transcriptionEnabled) {
                            console.log('[WebSocket] Transcription ENABLED - sending audio chunk to transcriptor, size:', audioBuffer.length);
                            this.transcriptor.sendAudioData(audioBuffer);
                        } else {
                            // Log moins fréquent pour éviter le spam
                            if (Math.random() < 0.01) { // 1% des chunks
                                console.log('[WebSocket] Transcription DISABLED - skipping Deepgram');
                            }
                        }
                    } else {
                        // Handle JSON messages
                        const message = JSON.parse(data.toString());
                        console.log('[WebSocket] Received message:', message);

                        switch (message.type) {
                            case 'ping':
                                ws.send(JSON.stringify({ type: 'pong' }));
                                break;
                            default:
                                console.warn('[WebSocket] Unknown message type:', message.type);
                        }
                    }
                } catch (error) {
                    console.error('[WebSocket] Error processing message:', error);
                }
            });

            ws.on('close', () => {
                const clientId = this.connections.get(ws);
                this.connections.delete(ws);
                console.log(`[WebSocket] Client ${clientId} disconnected`);
                
                this.emit('connection-change', {
                    status: this.connections.size > 0 ? 'connected' : 'disconnected',
                    clients: this.connections.size
                });
            });

            ws.on('error', (error: Error) => {
                console.error(`[WebSocket] WebSocket error for client ${clientId}:`, error);
            });
        });

        this.wss.on('listening', () => {
            console.log('[WebSocket] Server is listening');
            this.emit('server-listening', { status: 'listening' });
        });

        this.wss.on('error', (error) => {
            console.error('[WebSocket] Server error:', error);
            this.emit('server-error', { error });
        });
    }

    private generateClientId(): string {
        return Math.random().toString(36).substr(2, 9);
    }

    public getLastAudioStats(): any {
        return this.audioStats;
    }

    public onAudioStats(callback: (stats: any) => void): void {
        this.on('audio-stats', callback);
    }

    public getConnectionStatus(): { status: boolean, details?: any } {
        const hasConnections = this.connections.size > 0;
        return {
            status: hasConnections,
            details: hasConnections ? {
                clientId: Array.from(this.connections.values())[0]
            } : null
        };
    }

    public onConnectionChange(callback: (data: { status: boolean, details?: any }) => void): void {
        this.on('connection-change', callback);
    }

    public close(): void {
        // if (this.audioContext) {
        //     this.audioContext.close();
        //     this.audioContext = null;
        // }

        if (this.wss) {
            for (const ws of this.connections.keys()) {
                ws.close();
            }
            this.connections.clear();
            this.wss.close();
            this.wss = null;
            this.emit('connection-change');
        }
    }

    public async setVolume(volume: number): Promise<boolean> {
        try {
            if (volume < 0 || volume > 1) {
                console.error('[WebSocket] Volume must be between 0 and 1');
                return false;
            }

            this.currentVolume = volume;
            console.log(`[WebSocket] Volume set to ${Math.round(volume * 100)}%`);
            return true;
        } catch (error) {
            console.error('[WebSocket] Error setting volume:', error);
            return false;
        }
    }

    public async toggleMute(): Promise<boolean> {
        try {
            this.isMuted = !this.isMuted;
            console.log(`[WebSocket] Audio ${this.isMuted ? 'muted' : 'unmuted'}`);
            return true;
        } catch (error) {
            console.error('[WebSocket] Error toggling mute:', error);
            return false;
        }
    }

    public isPlaybackActive(): boolean {
        return this._isPlaybackActive;
    }

    public async togglePlayback(): Promise<boolean> {
        try {
            if (this._isPlaybackActive) {
                await this.stopPlayback();
            } else {
                await this.startPlayback();
            }
            return this._isPlaybackActive;
        } catch (error) {
            console.error('[WebSocket] Error toggling playback:', error);
            return false;
        }
    }

    public async stopPlayback(): Promise<void> {
        if (!this._isPlaybackActive) {
            console.log('[WebSocket] Playback not active, nothing to stop');
            return;
        }

        try {
            if (this.audioPlaybackProcess) {
                if (!this.audioPlaybackProcess.killed) {
                    this.audioPlaybackProcess.kill('SIGTERM');
                }
                this.audioPlaybackProcess = null;
            }
            this._isPlaybackActive = false;
            console.log('[WebSocket] Playback stopped');
        } catch (error) {
            console.error('[WebSocket] Error stopping playback:', error);
            throw error;
        }
    }

    public async startPlayback(): Promise<void> {
        if (this._isPlaybackActive) {
            console.log('[WebSocket] Audio playback already running');
            return;
        }

        // Vérifier les dépendances requises avec FFmpeg embarqué
        const { FFmpegManager } = await import('../utils/ffmpeg-manager');
        const ffmpegManager = FFmpegManager.getInstance();
        
        try {
            const { ffmpeg, ffplay, allDependenciesMet } = await ffmpegManager.checkAvailability();
            
            if (!allDependenciesMet) {
                const missingDeps = [];
                if (!ffmpeg) missingDeps.push('FFmpeg');
                if (!ffplay) missingDeps.push('FFplay (inclus avec FFmpeg)');
                
                const { showMissingDependenciesDialog } = await import('../utils/dependencies');
                showMissingDependenciesDialog(missingDeps);
                return;
            }

            // Utiliser ffplay embarqué avec filtres audio professionnels pour une qualité optimale
            // Format: PCM 16-bit, 16kHz, mono avec amélioration de qualité
            const audioFilters = [
                'highpass=f=80',        // Filtre passe-haut pour éliminer les basses fréquences parasites
                'lowpass=f=7500',       // Filtre passe-bas pour éliminer les hautes fréquences parasites
                'dynaudnorm=f=150:g=15:p=0.9:m=10:r=0.5:n=1', // Normalisation dynamique avancée
                'acompressor=threshold=0.089:ratio=9:attack=200:release=1000', // Compresseur audio professionnel
                'equalizer=f=1000:width_type=h:width=200:g=2', // Boost léger des médiums (voix)
                'equalizer=f=3000:width_type=h:width=500:g=1.5', // Clarté des aigus
                'volume=1.2'            // Amplification finale pour compenser les filtres
            ].join(',');
            
            this.audioPlaybackProcess = ffmpegManager.spawnFFplay([
                '-f', 's16le',          // Format PCM 16-bit little-endian
                '-ar', '16000',         // Taux d'échantillonnage 16kHz
                '-ch_layout', 'mono',   // 1 canal (mono) - format moderne
                '-i', 'pipe:0',         // Lire depuis l'entrée standard
                '-af', audioFilters,    // Appliquer les filtres audio professionnels
                '-nodisp',              // Pas de fenêtre d'affichage
                '-autoexit',            // Quitter à la fin de la lecture
                '-probesize', '32',     // Démarrage rapide
                '-analyzeduration', '0', // Pas d'analyse pour réduire la latence
                '-fflags', 'nobuffer',  // Pas de buffering supplémentaire
                '-flags', 'low_delay',  // Mode faible latence
                '-strict', 'experimental', // Optimisations expérimentales
                '-loglevel', 'error'    // Logs minimaux
            ]);
            
            this._isPlaybackActive = true;
            this.isPlaying = true;
            
            // Démarrer le système de buffering pour un flux lissé
            this.startAudioBuffering();
            
            console.log('[WebSocket] Playback started successfully with audio buffering');

            // Configurer la gestion des erreurs
            this.audioPlaybackProcess.stderr.on('data', (data: Buffer) => {
                const output = data.toString().trim();
                if (output) {
                    console.log(`[FFplay stderr] ${output}`);
                }
            });

            // Gérer la fin du processus
            this.audioPlaybackProcess.on('close', (code: number) => {
                console.log(`[FFplay] Process exited with code ${code}`);
                this.audioPlaybackProcess = null;
                this.isPlaying = false;
                this._isPlaybackActive = false;
            });
            
            // Gestion des erreurs
            this.audioPlaybackProcess.on('error', (error: Error) => {
                console.error('[FFplay] Process error:', error);
                this.audioPlaybackProcess = null;
                this.isPlaying = false;
                this._isPlaybackActive = false;
            });
        } catch (error) {
            console.error('[WebSocket] Failed to initialize embedded FFmpeg:', error);
            const { showMissingDependenciesDialog } = await import('../utils/dependencies');
            showMissingDependenciesDialog(['FFmpeg (binaires embarqués non trouvés)']);
            return;
        }
        console.log('[WebSocket] Started audio playback process with PID:', this.audioPlaybackProcess.pid);

        // Configuration des gestionnaires d'événements déjà effectuée plus haut
    }
    
    /**
     * Ajoute un chunk audio au buffer pour un flux lissé
     */
    private addToAudioBuffer(audioChunk: Buffer): void {
        // Ajouter le chunk au buffer
        this.audioBuffer.push(audioChunk);
        
        // Limiter la taille du buffer pour éviter l'accumulation excessive
        if (this.audioBuffer.length > this.bufferMaxSize) {
            // Supprimer les anciens chunks si le buffer est plein
            this.audioBuffer.shift();
        }
        
        this.lastAudioTime = Date.now();
    }
    
    /**
     * Démarre le système de buffering audio
     */
    private startAudioBuffering(): void {
        if (this.bufferFlushInterval) {
            clearInterval(this.bufferFlushInterval);
        }
        
        // Flush le buffer toutes les 10ms pour maintenir un flux régulier
        this.bufferFlushInterval = setInterval(() => {
            this.flushAudioBuffer();
        }, 10);
        
        console.log('[WebSocket] Audio buffering started');
    }
    
    /**
     * Arrête le système de buffering audio
     */
    private stopAudioBuffering(): void {
        if (this.bufferFlushInterval) {
            clearInterval(this.bufferFlushInterval);
            this.bufferFlushInterval = null;
        }
        
        // Vider le buffer
        this.audioBuffer = [];
        
        console.log('[WebSocket] Audio buffering stopped');
    }
    
    /**
     * Envoie les chunks du buffer à FFplay de manière régulière
     */
    private flushAudioBuffer(): void {
        if (!this.audioPlaybackProcess || this.audioBuffer.length === 0) {
            return;
        }
        
        try {
            // Envoyer un chunk à la fois pour maintenir un flux régulier
            const chunk = this.audioBuffer.shift();
            if (chunk) {
                this.audioPlaybackProcess.stdin.write(chunk);
            }
        } catch (error) {
            console.error('[WebSocket] Error flushing audio buffer:', error);
        }
    }

    /**
     * Redémarre le processus FFplay avec les nouveaux paramètres de volume
     */
    private async restartPlaybackWithNewVolume(): Promise<void> {
        if (!this._isPlaybackActive) {
            return;
        }
        
        console.log('[WebSocket] Restarting playback with new volume settings...');
        
        // Arrêter le processus actuel sans changer l'état _isPlaybackActive
        if (this.audioPlaybackProcess && !this.audioPlaybackProcess.killed) {
            this.audioPlaybackProcess.kill('SIGTERM');
            this.audioPlaybackProcess = null;
            this.isPlaying = false;
        }
        
        // Redémarrer avec les nouveaux paramètres
        await this.startPlaybackInternal();
    }
    
    /**
     * Génère le filtre audio pour le volume et le mute
     */
    private getVolumeFilter(): string | null {
        if (this.isMuted) {
            // Mute complet : volume à 0
            return 'volume=0';
        } else if (this.currentVolume !== 1.0) {
            // Volume ajusté : utiliser le niveau spécifié
            return `volume=${this.currentVolume}`;
        }
        
        // Volume normal (1.0) : pas de filtre nécessaire
        return null;
    }
    
    /**
     * Méthode interne pour démarrer le playback sans vérifications d'état
     */
    private async startPlaybackInternal(): Promise<void> {
        // Vérifier les dépendances requises avec FFmpeg embarqué
        const { FFmpegManager } = await import('../utils/ffmpeg-manager');
        const ffmpegManager = FFmpegManager.getInstance();
        
        try {
            const { ffmpeg, ffplay, allDependenciesMet } = await ffmpegManager.checkAvailability();
            
            if (!allDependenciesMet) {
                const missingDeps = [];
                if (!ffmpeg) missingDeps.push('FFmpeg');
                if (!ffplay) missingDeps.push('FFplay (inclus avec FFmpeg)');
                
                const { showMissingDependenciesDialog } = await import('../utils/dependencies');
                showMissingDependenciesDialog(missingDeps);
                return;
            }

            // Calculer le filtre audio pour le volume et le mute
            const volumeFilter = this.getVolumeFilter();
            
            // Utiliser ffplay embarqué pour lire le flux PCM en direct
            // Format: PCM 16-bit, 16kHz, mono
            const ffplayArgs = [
                '-f', 's16le',      // Format PCM 16-bit little-endian
                '-ar', '16000',     // Taux d'échantillonnage 16kHz
                '-ch_layout', 'mono', // 1 canal (mono) - format moderne
                '-i', 'pipe:0',     // Lire depuis l'entrée standard
                '-nodisp',          // Pas de fenêtre d'affichage
                '-autoexit',        // Quitter à la fin de la lecture
                '-loglevel', 'info' // Logs moins verbeux
            ];
            
            // Ajouter le filtre audio si nécessaire
            if (volumeFilter) {
                ffplayArgs.push('-af', volumeFilter);
                console.log(`[WebSocket] Using audio filter: ${volumeFilter}`);
            }
            
            this.audioPlaybackProcess = ffmpegManager.spawnFFplay(ffplayArgs);
            
            this.isPlaying = true;
            console.log('[WebSocket] Playback restarted with new volume settings');

            // Configurer la gestion des erreurs
            this.audioPlaybackProcess.stderr.on('data', (data: Buffer) => {
                const output = data.toString().trim();
                if (output && !output.includes('size=') && !output.includes('time=')) {
                    console.log(`[FFplay stderr] ${output}`);
                }
            });

            // Gérer la fin du processus
            this.audioPlaybackProcess.on('close', (code: number) => {
                console.log(`[FFplay] Process exited with code ${code}`);
                this.audioPlaybackProcess = null;
                this.isPlaying = false;
                this._isPlaybackActive = false;
            });
            
            // Gestion des erreurs
            this.audioPlaybackProcess.on('error', (error: Error) => {
                console.error('[FFplay] Process error:', error);
                this.audioPlaybackProcess = null;
                this.isPlaying = false;
                this._isPlaybackActive = false;
            });
        } catch (error) {
            console.error('[WebSocket] Failed to initialize embedded FFmpeg:', error);
            const { showMissingDependenciesDialog } = await import('../utils/dependencies');
            showMissingDependenciesDialog(['FFmpeg (binaires embarqués non trouvés)']);
            return;
        }
    }

    private setupTranscriptionListeners(): void {
        this.transcriptor.on('transcription', (transcriptionData: TranscriptionData) => {
            console.log('[WebSocket] Received transcription:', transcriptionData);
            this.emit('transcription', transcriptionData);
        });

        this.transcriptor.on('connected', () => {
            console.log('[WebSocket] Transcriptor connected');
            this.emit('deepgram-connected');
        });

        this.transcriptor.on('disconnected', () => {
            console.log('[WebSocket] Transcriptor disconnected');
            this.emit('deepgram-disconnected');
        });

        this.transcriptor.on('error', (error: any) => {
            console.error('[WebSocket] Transcriptor error:', error);
            this.emit('deepgram-error', error);
        });
    }

    public startTranscription(): void {
        if (!this.transcriptionEnabled) {
            console.log('[WebSocket] Starting transcription service...');
            this.transcriptor.start();
            this.transcriptionEnabled = true;
            console.log('[WebSocket] Transcription enabled:', this.transcriptionEnabled);
        } else {
            console.log('[WebSocket] Transcription already enabled');
        }
    }

    public stopTranscription(): void {
        if (this.transcriptionEnabled) {
            this.transcriptor.stop();
            this.transcriptionEnabled = false;
            console.log('[WebSocket] Transcription stopped');
        }
    }

    public toggleTranscription(): void {
        if (this.transcriptionEnabled) {
            this.stopTranscription();
        } else {
            this.startTranscription();
        }
    }

    public isTranscriptionActive(): boolean {
        return this.transcriptionEnabled && this.transcriptor.isActive();
    }

    public getTranscriptionStatus(): { active: boolean, connected: boolean, hasApiKey: boolean } {
        const deepgramStatus = this.transcriptor.getStatus();
        return {
            active: deepgramStatus.active,
            connected: deepgramStatus.connected,
            hasApiKey: deepgramStatus.hasApiKey
        };
    }

    public onTranscription(callback: (transcriptionData: TranscriptionData) => void): void {
        this.on('transcription', callback);
    }

    public onDeepgramConnected(callback: () => void): void {
        this.on('deepgram-connected', callback);
    }

    public onDeepgramDisconnected(callback: () => void): void {
        this.on('deepgram-disconnected', callback);
    }

    public onDeepgramError(callback: (error: any) => void): void {
        this.on('deepgram-error', callback);
    }
}
