import { WebSocketServer, WebSocket, RawData } from 'ws';
import { EventEmitter } from 'events';
import { config } from '../config/env';

export class WebSocketService extends EventEmitter {
    private wss: WebSocketServer | null = null;
    private connections: Set<WebSocket> = new Set();

    constructor() {
        super();
    }

    public init(): void {
        this.wss = new WebSocketServer({ 
            port: config.websocket.port 
        });

        this.setupEventListeners();
        console.log(`WebSocket server running on ws://${config.websocket.host}:${config.websocket.port}`);
    }

    private setupEventListeners(): void {
        if (!this.wss) return;

        this.wss.on('connection', this.handleConnection.bind(this));
        this.wss.on('error', (error) => {
            console.error('WebSocket server error:', error);
            this.emit('connection-change', false);
        });
    }

    private handleConnection(ws: WebSocket): void {
        console.log('New client connected');
        this.connections.add(ws);
        this.emit('connection-change', true);

        ws.send(JSON.stringify({
            type: 'connection_status',
            status: 'connected'
        }));

        ws.on('message', (data) => this.handleMessage(ws, data));
        ws.on('close', () => {
            console.log('Client disconnected');
            this.connections.delete(ws);
            this.emit('connection-change', this.connections.size > 0);
        });
    }

    private handleMessage(ws: WebSocket, data: RawData): void {
        try {
            const message = JSON.parse(data.toString());
            switch (message.type) {
                case 'audio_stream':
                    // TODO: Handle incoming audio stream
                    console.log('Received audio chunk:', message.data.length);
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

    public getConnectionStatus(): boolean {
        return this.connections.size > 0;
    }

    public onConnectionChange(callback: (status: boolean) => void): void {
        this.on('connection-change', callback);
    }

    public close(): void {
        if (this.wss) {
            for (const ws of this.connections) {
                ws.close();
            }
            this.connections.clear();
            this.wss.close();
            this.wss = null;
            this.emit('connection-change', false);
        }
    }
}
