export interface WebSocketConfig {
    desktopUrl: string;
    maxReconnectAttempts: number;
    initialReconnectDelay: number;
    maxReconnectDelay: number;
}

export const defaultWebSocketConfig: WebSocketConfig = {
    desktopUrl: 'ws://localhost:8080',
    maxReconnectAttempts: 5,
    initialReconnectDelay: 1000,  // 1 second
    maxReconnectDelay: 10000      // 10 seconds
};