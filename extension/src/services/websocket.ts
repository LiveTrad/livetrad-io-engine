import { ConnectionState } from '../types';

export class WebSocketService {
    private ws: WebSocket | null = null;
    private readonly DESKTOP_URL = 'ws://localhost:8080';
    private reconnectAttempts = 0;
    private readonly MAX_RECONNECT_ATTEMPTS = 5;
    private reconnectTimeout: NodeJS.Timeout | null = null;

    constructor() {}

    public connect(): Promise<ConnectionState> {
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.DESKTOP_URL);

                this.ws.onopen = () => {
                    console.log('Connected to desktop app');
                    this.reconnectAttempts = 0;
                    resolve(this.getConnectionState());
                };

                this.ws.onclose = () => {
                    console.log('Disconnected from desktop app');
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
            this.ws.close();
            this.ws = null;
        }
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
    }

    public sendAudioChunk(chunk: ArrayBuffer): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'audio_chunk',
                data: chunk
            }));
        }
    }

    public getConnectionState(): ConnectionState {
        return {
            status: this.ws?.readyState === WebSocket.OPEN ? 'connected' : 
                   this.ws?.readyState === WebSocket.CONNECTING ? 'connecting' : 
                   'disconnected',
            desktopUrl: this.DESKTOP_URL
        };
    }

    private handleDisconnect(): void {
        if (this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
            this.reconnectAttempts++;
            const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);
            
            this.reconnectTimeout = setTimeout(() => {
                console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS})`);
                this.connect();
            }, delay);
        }
    }
}
