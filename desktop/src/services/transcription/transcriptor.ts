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
    private lastFinalTranscript: string = '';
    private translationBuffer: string = '';
    private lastTranslation: string = '';

    constructor(provider: TranscriptionProvider, translationService?: TranslationService) {
        super();
        this.provider = provider;
        this.translationService = translationService || new TranslationService();

        // Re-emit provider events to consumers
        this.provider.on('transcript', async (data: TranscriptionData) => {
            // Toujours émettre la transcription originale
            const result: TranscriptionWithTranslation = { transcription: data };
            
            // Si la traduction est activée et que c'est une transcription finale ou partielle
            if (this.autoTranslate && this.translationService.isTranslationEnabled() && data.transcript) {
                try {
                    // Pour les segments finaux, on traduit tout le texte depuis le début
                    // Pour les segments intermédiaires, on traduit seulement le nouveau texte
                    const textToTranslate = data.isFinal 
                        ? data.transcript 
                        : this.lastFinalTranscript + ' ' + data.transcript;
                    
                    if (textToTranslate.trim()) {
                        const streamingSegment: StreamingTranslationSegment = {
                            text: textToTranslate,
                            isFinal: data.isFinal,
                            confidence: data.confidence,
                            language: data.language
                        };

                        const translation = await this.translationService.translateStreamingSegment(streamingSegment);
                        
                        if (translation) {
                            // Mettre à jour le buffer de traduction
                            this.translationBuffer = translation.translatedText;
                            
                            // Si c'est final, on met à jour la dernière traduction complète
                            if (data.isFinal) {
                                this.lastTranslation = this.translationBuffer;
                                this.lastFinalTranscript = data.transcript;
                                this.translationBuffer = '';
                            }
                            
                            result.translation = {
                                ...translation,
                                translatedText: data.isFinal 
                                    ? this.lastTranslation 
                                    : this.translationBuffer
                            };
                        }
                    }
                } catch (error) {
                    console.error('[Transcriptor] Translation error:', error);
                    // En cas d'erreur, on continue avec la transcription seule
                }
            }
            
            // Émettre le résultat (avec ou sans traduction)
            this.emit('transcription', result);
            
            // Mettre à jour le dernier transcript final si nécessaire
            if (data.isFinal) {
                this.lastFinalTranscript = data.transcript;
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


