import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { EventEmitter } from 'events';
import { config } from '../config/env';

export interface TranscriptionData {
    transcript: string;
    confidence: number;
    isFinal: boolean;
    timestamp: Date;
    language?: string;
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

        console.log('[Deepgram] Initializing with API key:', config.deepgram.apiKey.substring(0, 10) + '...');
        console.log('[Deepgram] Language:', config.deepgram.language);
        console.log('[Deepgram] Model:', config.deepgram.model);

        try {
            this.deepgramClient = createClient(config.deepgram.apiKey);
            console.log('[Deepgram] Client initialized successfully');
        } catch (error) {
            console.error('[Deepgram] Error initializing client:', error);
        }
    }

    public startTranscription(options?: { language?: string, detectLanguage?: boolean }): void {
        if (!this.deepgramClient) {
            console.error('[Deepgram] Client not initialized');
            return;
        }

        if (this.isConnected) {
            console.log('[Deepgram] Already connected');
            return;
        }

        // Build configuration
        const transcriptionConfig: any = {
            punctuate: true,
            smart_format: true,
            interim_results: true,
            encoding: 'linear16',
            channels: 1,
            // Match common WebRTC sample rate; Deepgram will resample if needed
            sample_rate: 48000,
            endpointing: 300  // 300ms de silence pour finaliser
        };

        if (options?.detectLanguage) {
            transcriptionConfig.detect_language = true;
        } else if (options?.language && options.language !== 'auto') {
            transcriptionConfig.language = options.language;
        } else {
            transcriptionConfig.language = 'en';
        }

        console.log('[Deepgram] Starting transcription with config:', transcriptionConfig);

        try {
            this.deepgramConnection = this.deepgramClient.listen.live(transcriptionConfig);

            this.setupEventListeners();
            this.startKeepAlive();
            this.isConnected = true;
            console.log('[Deepgram] Transcription started successfully');
        } catch (error) {
            console.error('[Deepgram] Error starting transcription:', error);
            
            // Fallback: configuration simple sans auto-détection
            console.log('[Deepgram] Trying fallback configuration...');
            try {
                const fallbackConfig = {
                    language: 'en',
                    punctuate: true,
                    smart_format: true,
                    interim_results: true,
                    encoding: 'linear16',
                    channels: 1,
                    sample_rate: 16000,
                    endpointing: 300
                };
                
                this.deepgramConnection = this.deepgramClient.listen.live(fallbackConfig);
                this.setupEventListeners();
                this.startKeepAlive();
                this.isConnected = true;
                console.log('[Deepgram] Transcription started with fallback config');
            } catch (fallbackError) {
                console.error('[Deepgram] Error with fallback config:', fallbackError);
            }
        }
    }

    private setupEventListeners(): void {
        if (!this.deepgramConnection) return;

        this.deepgramConnection.addListener(LiveTranscriptionEvents.Open, () => {
            console.log('[Deepgram] Connection opened');
            this.emit('connected');
        });

        this.deepgramConnection.addListener(LiveTranscriptionEvents.Transcript, (data: any) => {
            console.log('[Deepgram] Raw transcript data received:', JSON.stringify(data, null, 2));
            
            const transcript = data.channel?.alternatives?.[0]?.transcript || '';
            const confidence = data.channel?.alternatives?.[0]?.confidence || 0;
            const isFinal = data.is_final || false;
            const detectedLanguage = data.metadata?.language || 'Auto';

            console.log('[Deepgram] Parsed transcript:', { transcript, confidence, isFinal, detectedLanguage });

            if (transcript.trim()) {
                const transcriptionData: TranscriptionData = {
                    transcript: transcript.trim(),
                    confidence,
                    isFinal,
                    timestamp: new Date(),
                    language: detectedLanguage
                };

                console.log('[Deepgram] Emitting transcript:', transcriptionData);
                this.emit('transcript', transcriptionData);
            } else {
                console.log('[Deepgram] Empty transcript received');
            }
        });

        this.deepgramConnection.addListener(LiveTranscriptionEvents.Close, (event: any) => {
            console.log('[Deepgram] Connection closed. Event:', event);
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
                console.log('[Deepgram] Sending audio chunk to Deepgram, size:', audioBuffer.length);
                this.deepgramConnection.send(audioBuffer);
            } catch (error) {
                console.error('[Deepgram] Error sending audio data:', error);
            }
        } else {
            console.log('[Deepgram] Cannot send audio - connection not ready. Connected:', this.isConnected);
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