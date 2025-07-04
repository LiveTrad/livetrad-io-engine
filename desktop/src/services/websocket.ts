import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { config } from '../config/env';
import { createWriteStream } from 'fs';
import { spawn } from 'child_process';

export class WebSocketService extends EventEmitter {
    private wss: WebSocketServer | null = null;
    private connections: Map<WebSocket, string> = new Map();
    private audioStats: any = null;
    private audioPlaybackProcess: any = null;
    private isPlaying: boolean = false;

    constructor() {
        super();
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
                        const audioBuffer = Buffer.from(data);
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

                        // Si le playback est actif, envoyer les données audio au processus ffplay
                        if (this.isPlaying && this.audioPlaybackProcess) {
                            try {
                                console.log('[WebSocket] Sending audio chunk to playback process, buffer size:', audioBuffer.length);
                                this.audioPlaybackProcess.stdin.write(audioBuffer);
                                console.log('[WebSocket] Sent audio chunk to playback process');
                            } catch (error) {
                                console.error('[WebSocket] Error sending audio to playback process:', error);
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

    public startPlayback(): void {
        if (this.isPlaying) {
            console.log('[WebSocket] Audio playback already running');
            return;
        }

        // Vérifier si ffplay est disponible
        const ffplayCheck = spawn('which', ['ffplay']);
        ffplayCheck.on('close', (code: number) => {
            if (code !== 0) {
                console.error('[WebSocket] ffplay not found. Please ensure FFmpeg is installed on your system.');
                return;
            }
        });

        // Utiliser ffplay pour lire le flux PCM en direct
        // Format: PCM 16-bit, 16kHz, mono
        this.audioPlaybackProcess = spawn('ffplay', ['-f', 's16le', '-ar', '16000', '-ac', '1', '-i', 'pipe:', '-nodisp', '-autoexit']);
        this.isPlaying = true;
        console.log('[WebSocket] Started audio playback process with PID:', this.audioPlaybackProcess.pid);

        this.audioPlaybackProcess.stdout.on('data', (data: Buffer) => {
            console.log(`[ffplay stdout] ${data.toString()}`);
        });

        this.audioPlaybackProcess.stderr.on('data', (data: Buffer) => {
            console.error(`[ffplay stderr] ${data.toString()}`);
        });

        this.audioPlaybackProcess.on('close', (code: number) => {
            console.log(`[ffplay] Process exited with code ${code}`);
            this.isPlaying = false;
            this.audioPlaybackProcess = null;
        });
    }

    public stopPlayback(): void {
        if (!this.isPlaying || !this.audioPlaybackProcess) {
            console.log('[WebSocket] No audio playback process to stop');
            return;
        }

        this.audioPlaybackProcess.kill();
        this.isPlaying = false;
        this.audioPlaybackProcess = null;
        console.log('[WebSocket] Stopped audio playback process');
    }

    public isPlaybackActive(): boolean {
        return this.isPlaying;
    }

    public togglePlayback(): void {
        if (this.isPlaying) {
            this.stopPlayback();
        } else {
            this.startPlayback();
        }
    }
}
