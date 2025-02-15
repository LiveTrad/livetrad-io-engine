import { WebSocketServer, WebSocket, RawData } from 'ws';
import { config } from '../config/env';

export class WebSocketService {
    private wss: WebSocketServer | null = null;

    constructor() {}

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
    }

    private handleConnection(ws: WebSocket): void {
        console.log('New client connected');

        ws.send(JSON.stringify({
            type: 'connection_status',
            status: 'connected'
        }));

        ws.on('message', (data) => this.handleMessage(ws, data));
        ws.on('close', () => console.log('Client disconnected'));
    }

    private handleMessage(ws: WebSocket, data: RawData): void {
        try {
            const message = JSON.parse(data.toString());
            switch (message.type) {
                case 'audio_stream':
                    // TODO: Handle incoming audio stream
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

    public close(): void {
        if (this.wss) {
            this.wss.close();
            this.wss = null;
        }
    }
}
