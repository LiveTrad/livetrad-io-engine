import { ConnectionState } from '../types';
import { WebSocketConfig, defaultWebSocketConfig } from '../config/websocket.config';
import { AudioConfig, defaultAudioConfig } from '../config/audio.config';

export class WebSocketService {
    private ws: WebSocket | null = null;
    private config: WebSocketConfig;
    private audioConfig: AudioConfig;
    private reconnectAttempts = 0;
    private reconnectTimeout: NodeJS.Timeout | null = null;
    private isVoluntaryDisconnect = false;

    constructor(config: WebSocketConfig = defaultWebSocketConfig, audioConfig: AudioConfig = defaultAudioConfig) {
        this.config = config;
        this.audioConfig = audioConfig;
    }

    public connect(): Promise<ConnectionState> {
        return new Promise((resolve, reject) => {
            try {
                this.isVoluntaryDisconnect = false;
                console.log('Attempting to connect to:', this.config.desktopUrl);
                this.ws = new WebSocket(this.config.desktopUrl);

                this.ws.onopen = () => {
                    console.log('Successfully connected to desktop app');
                    this.reconnectAttempts = 0;
                    resolve(this.getConnectionState());
                };

                this.ws.onclose = (event) => {
                    console.log('Disconnected from desktop app. Code:', event.code, 'Reason:', event.reason);
                    this.handleDisconnect();
                };

                this.ws.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    reject(error);
                };
            } catch (error) {
                console.error('Failed to connect:', error);
                reject(error);
            }
        });
    }

    public disconnect(): void {
        if (this.ws) {
            this.isVoluntaryDisconnect = true;
            this.ws.close();
            this.ws = null;
        }
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
    }

    public getAudioConfig(): AudioConfig {
        return this.audioConfig;
    }

    public sendAudioChunk(chunk: ArrayBuffer): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.error('[WebSocket] Cannot send audio chunk: connection not open');
            throw new Error('WebSocket connection not open');
        }

        console.log(`[WebSocket] Preparing to send audio chunk: ${chunk.byteLength} bytes`);

        try {
            // Convert ArrayBuffer to Base64 string for safe transmission
            const audioArray = new Float32Array(chunk);
            const base64Data = btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(audioArray.buffer))));
            
            console.log(`[WebSocket] Converted audio chunk to base64: ${base64Data.length} characters`);

            // Send audio data with configured parameters
            const message = JSON.stringify({
                type: 'audio_chunk',
                data: base64Data,
                sampleRate: this.audioConfig.sampleRate,
                channels: this.audioConfig.channels,
                bufferSize: this.audioConfig.bufferSize,
                timestamp: Date.now()
            });
            
            this.ws.send(message);
            console.log('[WebSocket] Successfully sent audio chunk');
        } catch (error) {
            console.error('[WebSocket] Failed to send audio chunk:', error);
            throw error;
        }
    }

    public getConnectionState(): ConnectionState {
        return {
            status: this.ws?.readyState === WebSocket.OPEN ? 'connected' : 
                   this.ws?.readyState === WebSocket.CONNECTING ? 'connecting' : 
                   'disconnected',
            desktopUrl: this.config.desktopUrl
        };
    }

    private handleDisconnect(): void {
        if (this.isVoluntaryDisconnect) {
            console.log('Voluntary disconnect - not attempting to reconnect');
            return;
        }

        if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = Math.min(
                this.config.initialReconnectDelay * Math.pow(2, this.reconnectAttempts),
                this.config.maxReconnectDelay
            );
            
            this.reconnectTimeout = setTimeout(() => {
                console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.config.maxReconnectAttempts})`);
                this.connect();
            }, delay);
        }
    }
}
