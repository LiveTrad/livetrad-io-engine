import { WebSocketServer, WebSocket, RawData } from 'ws';
import { EventEmitter } from 'events';
import { config } from '../config/env';

export class WebSocketService extends EventEmitter {
    private wss: WebSocketServer | null = null;
    private connections: Map<WebSocket, string> = new Map();

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

        this.wss.on('connection', this.handleConnection.bind(this));
        this.wss.on('error', (error) => {
            console.error('WebSocket server error:', error);
            this.emit('connection-change', { status: false });
        });
        this.wss.on('listening', () => {
            console.log('WebSocket server is listening for connections');
        });
    }

    private handleConnection(ws: WebSocket): void {
        const clientId = Math.random().toString(36).substr(2, 9);
        console.log(`New client connected (ID: ${clientId})`);
        this.connections.set(ws, clientId);
        this.emit('connection-change', { 
            status: true,
            details: {
                clientId: clientId
            }
        });

        ws.send(JSON.stringify({
            type: 'connection_status',
            status: 'connected',
            clientId: clientId
        }));

        ws.on('message', (data) => {
            console.log(`Received message from client ${clientId}`);
            this.handleMessage(ws, data);
        });
        
        ws.on('close', (code, reason) => {
            console.log(`Client ${clientId} disconnected. Code: ${code}, Reason: ${reason}`);
            this.connections.delete(ws);
            this.emit('connection-change', { 
                status: this.connections.size > 0,
                details: this.connections.size > 0 ? {
                    clientId: Array.from(this.connections.values())[0]
                } : null
            });
        });

        ws.on('error', (error) => {
            console.error(`Error with client ${clientId}:`, error);
        });
    }

    private audioContext: AudioContext | null = null;
    private audioQueue: Float32Array[] = [];
    private isProcessing: boolean = false;
    private bufferSize: number = 4096;

    private handleMessage(ws: WebSocket, data: RawData): void {
        try {
            const message = JSON.parse(data.toString());
            switch (message.type) {
                case 'audio_chunk':
                    // Convert base64 back to audio data
                    const binaryStr = atob(message.data);
                    const bytes = new Uint8Array(binaryStr.length);
                    for (let i = 0; i < binaryStr.length; i++) {
                        bytes[i] = binaryStr.charCodeAt(i);
                    }
                    const audioData = new Float32Array(bytes.buffer);
                    
                    // Process the audio data
                    this.processAudioChunk(audioData, message.sampleRate, message.timestamp);
                    break;
                case 'ping':
                    ws.send(JSON.stringify({ type: 'pong' }));
                    break;
                default:
                    console.log('Unknown message type:', message.type);
            }
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    }

    private processAudioChunk(audioData: Float32Array, sampleRate: number, timestamp: number): void {
        // Here you can implement audio processing logic
        // For example: saving to file, real-time playback, or analysis
        console.log(`Processing audio chunk: ${audioData.length} samples, ${sampleRate}Hz, timestamp: ${timestamp}`);
        
        // Example: Calculate audio level
        let sum = 0;
        for (let i = 0; i < audioData.length; i++) {
            sum += Math.abs(audioData[i]);
        }
        const averageLevel = sum / audioData.length;
        console.log(`Average audio level: ${averageLevel}`);
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

    private handleAudioChunk(data: ArrayBuffer): void {
        // Convert ArrayBuffer to Float32Array
        const audioData = new Float32Array(data);
        this.audioQueue.push(audioData);

        if (!this.isProcessing) {
            this.processAudioQueue();
        }
    }

    private async processAudioQueue(): Promise<void> {
        if (!this.audioContext) {
            this.audioContext = new AudioContext();
        }

        this.isProcessing = true;

        while (this.audioQueue.length > 0) {
            const audioData = this.audioQueue.shift();
            if (!audioData || !this.audioContext) continue;

            // Create buffer and fill it with the audio data
            const audioBuffer = this.audioContext.createBuffer(1, this.bufferSize, this.audioContext.sampleRate);
            audioBuffer.getChannelData(0).set(audioData);

            // Create source and play the buffer
            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.audioContext.destination);
            source.start();

            // Wait for the buffer to finish playing
            const playbackDuration = (this.bufferSize / this.audioContext.sampleRate) * 1000;
            await new Promise(resolve => setTimeout(resolve, playbackDuration));
        }

        this.isProcessing = false;
    }

    public close(): void {
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }

        if (this.wss) {
            for (const ws of this.connections.keys()) {
                ws.close();
            }
            this.connections.clear();
            this.wss.close();
            this.wss = null;
            this.emit('connection-change', { status: false });
        }
    }
}
