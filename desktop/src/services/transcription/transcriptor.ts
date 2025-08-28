import { EventEmitter } from 'events';
import { TranscriptionProvider, TranscriptionData, TranscriptionConnectionStatus } from './provider';
import { TranslationService, TranslationData, StreamingTranslationSegment } from '../translation';

export interface TranscriptionWithTranslation {
    transcription: TranscriptionData;
    translation?: TranslationData;
}

export class LiveTradTranscriptor extends EventEmitter {
    private provider: TranscriptionProvider;
    private translationService: TranslationService;
    private enabled: boolean = false;
    private autoTranslate: boolean = false;

    constructor(provider: TranscriptionProvider, translationService?: TranslationService) {
        super();
        this.provider = provider;
        this.translationService = translationService || new TranslationService();

        // Re-emit provider events to consumers
        this.provider.on('transcript', async (data: TranscriptionData) => {
            if (this.autoTranslate && this.translationService.isTranslationEnabled()) {
                try {
                    // Utiliser le streaming translation comme Vapi
                    const streamingSegment: StreamingTranslationSegment = {
                        text: data.transcript,
                        isFinal: data.isFinal,
                        confidence: data.confidence,
                        language: data.language
                    };

                    const translation = await this.translationService.translateStreamingSegment(streamingSegment);
                    
                    const transcriptionWithTranslation: TranscriptionWithTranslation = {
                        transcription: data,
                        translation: translation || undefined
                    };
                    
                    this.emit('transcription', transcriptionWithTranslation);
                } catch (error) {
                    console.error('[Transcriptor] Translation error:', error);
                    // Emit original transcription if translation fails
                    this.emit('transcription', { transcription: data });
                }
            } else {
                // Emit original transcription without translation
                this.emit('transcription', { transcription: data });
            }
        });
        
        this.provider.on('connected', () => this.emit('connected'));
        this.provider.on('disconnected', () => this.emit('disconnected'));
        this.provider.on('error', (err: any) => this.emit('error', err));
    }

    public start(): void {
        if (this.enabled) return;
        this.provider.startTranscription();
        this.enabled = true;
    }

    public stop(): void {
        if (!this.enabled) return;
        this.provider.stopTranscription();
        this.enabled = false;
    }

    public toggle(): void {
        this.enabled ? this.stop() : this.start();
    }

    public isActive(): boolean {
        return this.enabled && this.provider.isTranscriptionActive();
    }

    public sendAudioData(audioBuffer: Buffer): void {
        if (!this.enabled) return;
        this.provider.sendAudioData(audioBuffer);
    }

    public getStatus(): { active: boolean, connected: boolean, hasApiKey: boolean } {
        const status: TranscriptionConnectionStatus = this.provider.getConnectionStatus();
        return {
            active: this.enabled,
            connected: status.connected,
            hasApiKey: status.hasApiKey
        };
    }

    public setLanguage(options: { language?: string, detectLanguage?: boolean }): void {
        if (this.provider.setLanguage) {
            this.provider.setLanguage(options);
        }
    }

    // Translation methods
    public setAutoTranslate(enabled: boolean): void {
        this.autoTranslate = enabled;
        if (enabled) {
            this.translationService.enable();
        } else {
            this.translationService.disable();
        }
        console.log('[Transcriptor] Auto-translate set to:', enabled);
    }

    public isAutoTranslateEnabled(): boolean {
        return this.autoTranslate;
    }

    public setTargetLanguage(language: string): void {
        this.translationService.setTargetLanguage(language);
    }

    public getTargetLanguage(): string {
        return this.translationService.getTargetLanguage();
    }

    public async translateText(text: string, sourceLanguage?: string): Promise<TranslationData | null> {
        return this.translationService.translateText(text, sourceLanguage);
    }
}


