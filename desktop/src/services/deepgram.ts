import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { EventEmitter } from 'events';
import { config } from '../config/env';

export interface TranscriptionData {
    transcript: string;
    confidence: number;
    isFinal: boolean;
    timestamp: Date;
}

export class DeepgramService extends EventEmitter {
    private deepgramClient: any;
    private deepgramConnection: any;
    private keepAliveInterval: NodeJS.Timeout | null = null;
    private isConnected: boolean = false;

    constructor() {
        super();
        this.initDeepgramClient();
    }

    private initDeepgramClient(): void {
        if (!config.deepgram.apiKey) {
            console.error('[Deepgram] API key not found. Please set DEEPGRAM_API_KEY in your .env file');
            return;
        }

        try {
            this.deepgramClient = createClient(config.deepgram.apiKey);
            console.log('[Deepgram] Client initialized');
        } catch (error) {
            console.error('[Deepgram] Error initializing client:', error);
        }
    }

    public startTranscription(): void {
        if (!this.deepgramClient) {
            console.error('[Deepgram] Client not initialized');
            return;
        }

        if (this.isConnected) {
            console.log('[Deepgram] Already connected');
            return;
        }

        try {
            this.deepgramConnection = this.deepgramClient.listen.live({
                language: config.deepgram.language,
                punctuate: true,
                smart_format: true,
                model: config.deepgram.model,
                interim_results: true
            });

            this.setupEventListeners();
            this.startKeepAlive();
            this.isConnected = true;
            console.log('[Deepgram] Transcription started');
        } catch (error) {
            console.error('[Deepgram] Error starting transcription:', error);
        }
    }

    private setupEventListeners(): void {
        if (!this.deepgramConnection) return;

        this.deepgramConnection.addListener(LiveTranscriptionEvents.Open, () => {
            console.log('[Deepgram] Connection opened');
            this.emit('connected');
        });

        this.deepgramConnection.addListener(LiveTranscriptionEvents.Transcript, (data: any) => {
            const transcript = data.channel?.alternatives?.[0]?.transcript || '';
            const confidence = data.channel?.alternatives?.[0]?.confidence || 0;
            const isFinal = data.is_final || false;

            if (transcript.trim()) {
                const transcriptionData: TranscriptionData = {
                    transcript: transcript.trim(),
                    confidence,
                    isFinal,
                    timestamp: new Date()
                };

                console.log('[Deepgram] Transcript:', transcriptionData);
                this.emit('transcript', transcriptionData);
            }
        });

        this.deepgramConnection.addListener(LiveTranscriptionEvents.Close, () => {
            console.log('[Deepgram] Connection closed');
            this.isConnected = false;
            this.stopKeepAlive();
            this.emit('disconnected');
        });

        this.deepgramConnection.addListener(LiveTranscriptionEvents.Error, (error: any) => {
            console.error('[Deepgram] Error:', error);
            this.emit('error', error);
        });

        // Note: Warning event might not be available in all SDK versions
        // this.deepgramConnection.addListener(LiveTranscriptionEvents.Warning, (warning: any) => {
        //     console.warn('[Deepgram] Warning:', warning);
        //     this.emit('warning', warning);
        // });

        this.deepgramConnection.addListener(LiveTranscriptionEvents.Metadata, (data: any) => {
            console.log('[Deepgram] Metadata received:', data);
            this.emit('metadata', data);
        });
    }

    private startKeepAlive(): void {
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
        }

        this.keepAliveInterval = setInterval(() => {
            if (this.deepgramConnection && this.isConnected) {
                console.log('[Deepgram] Sending keepalive');
                this.deepgramConnection.keepAlive();
            }
        }, 10 * 1000); // Every 10 seconds
    }

    private stopKeepAlive(): void {
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }
    }

    public sendAudioData(audioBuffer: Buffer): void {
        if (this.deepgramConnection && this.isConnected) {
            try {
                this.deepgramConnection.send(audioBuffer);
            } catch (error) {
                console.error('[Deepgram] Error sending audio data:', error);
            }
        }
    }

    public stopTranscription(): void {
        if (this.deepgramConnection) {
            this.deepgramConnection.finish();
            this.deepgramConnection.removeAllListeners();
            this.deepgramConnection = null;
        }

        this.stopKeepAlive();
        this.isConnected = false;
        console.log('[Deepgram] Transcription stopped');
    }

    public isTranscriptionActive(): boolean {
        return this.isConnected;
    }

    public getConnectionStatus(): { connected: boolean, hasApiKey: boolean } {
        return {
            connected: this.isConnected,
            hasApiKey: !!config.deepgram.apiKey
        };
    }

    public destroy(): void {
        this.stopTranscription();
        this.removeAllListeners();
    }
} 