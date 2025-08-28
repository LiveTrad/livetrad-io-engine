import { EventEmitter } from 'events';
import { config } from '../config/env';
import { TranslationProvider, GoogleTranslateProvider } from './translation-providers/google-translate';
import { DeepLTranslateProvider } from './translation-providers/deepl-translate';
import { ArgosTranslateProvider } from './translation-providers/argos-translate';

export interface TranslationData {
    originalText: string;
    translatedText: string;
    sourceLanguage: string;
    targetLanguage: string;
    confidence: number;
    timestamp: Date;
    isInterim?: boolean; // Pour les traductions intermédiaires
}

export interface StreamingTranslationSegment {
    text: string;
    isFinal: boolean;
    confidence: number;
    language?: string;
}

export class TranslationService extends EventEmitter {
    private isEnabled: boolean = false;
    private targetLanguage: string = 'fr';
    private translationCache: Map<string, string> = new Map();
    private currentProvider: TranslationProvider;
    
    // Pour le streaming comme Vapi
    private streamingBuffer: string = '';
    private lastTranslatedSegment: string = '';
    private streamingTimeout: NodeJS.Timeout | null = null;
    private readonly STREAMING_DELAY = 500; // 500ms comme Vapi

    constructor(providerType: string = 'google') {
        super();
        this.currentProvider = this.createProvider(providerType);
    }

    private createProvider(type: string): TranslationProvider {
        switch (type.toLowerCase()) {
            case 'deepl':
                return new DeepLTranslateProvider(config.translation?.deeplApiKey);
            case 'argos':
                return new ArgosTranslateProvider(config.translation?.pythonPath || 'python3');
            case 'google':
            default:
                return new GoogleTranslateProvider(config.translation?.googleApiKey);
        }
    }

    public setProvider(type: string): void {
        this.currentProvider = this.createProvider(type);
        console.log(`[Translation] Provider changed to: ${this.currentProvider.name}`);
    }

    public enable(): void {
        this.isEnabled = true;
        console.log('[Translation] Service enabled');
    }

    public disable(): void {
        this.isEnabled = false;
        this.clearStreamingBuffer();
        console.log('[Translation] Service disabled');
    }

    public isTranslationEnabled(): boolean {
        return this.isEnabled;
    }

    public setTargetLanguage(language: string): void {
        this.targetLanguage = language;
        console.log('[Translation] Target language set to:', language);
    }

    public getTargetLanguage(): string {
        return this.targetLanguage;
    }

    // Nouvelle méthode pour le streaming comme Vapi
    public async translateStreamingSegment(segment: StreamingTranslationSegment): Promise<TranslationData | null> {
        if (!this.isEnabled || !segment.text.trim()) {
            return null;
        }

        // Ajouter au buffer streaming
        this.addToStreamingBuffer(segment.text);

        // Si c'est final, traduire immédiatement
        if (segment.isFinal) {
            return this.translateFinalSegment(segment);
        }

        // Sinon, utiliser le délai streaming comme Vapi
        return this.translateInterimSegment(segment);
    }

    private addToStreamingBuffer(text: string): void {
        this.streamingBuffer += ' ' + text;
        this.streamingBuffer = this.streamingBuffer.trim();
    }

    private async translateFinalSegment(segment: StreamingTranslationSegment): Promise<TranslationData | null> {
        const fullText = this.streamingBuffer;
        this.clearStreamingBuffer();
        
        return this.translateText(fullText, segment.language);
    }

    private async translateInterimSegment(segment: StreamingTranslationSegment): Promise<TranslationData | null> {
        // Clear previous timeout
        if (this.streamingTimeout) {
            clearTimeout(this.streamingTimeout);
        }

        return new Promise((resolve) => {
            this.streamingTimeout = setTimeout(async () => {
                const translated = await this.translateText(this.streamingBuffer, segment.language);
                if (translated) {
                    translated.isInterim = true;
                }
                resolve(translated);
            }, this.STREAMING_DELAY);
        });
    }

    private clearStreamingBuffer(): void {
        this.streamingBuffer = '';
        if (this.streamingTimeout) {
            clearTimeout(this.streamingTimeout);
            this.streamingTimeout = null;
        }
    }

    public async translateText(text: string, sourceLanguage?: string): Promise<TranslationData | null> {
        if (!this.isEnabled || !text.trim()) {
            return null;
        }

        // Check cache first
        const cacheKey = `${text}_${this.targetLanguage}`;
        if (this.translationCache.has(cacheKey)) {
            const cachedTranslation = this.translationCache.get(cacheKey)!;
            return {
                originalText: text,
                translatedText: cachedTranslation,
                sourceLanguage: sourceLanguage || 'auto',
                targetLanguage: this.targetLanguage,
                confidence: 1.0,
                timestamp: new Date()
            };
        }

        try {
            // Utiliser le provider actuel
            const translatedText = await this.currentProvider.translate(
                text, 
                sourceLanguage || 'auto', 
                this.targetLanguage
            );
            
            // Cache the result
            this.translationCache.set(cacheKey, translatedText);

            const translationData: TranslationData = {
                originalText: text,
                translatedText,
                sourceLanguage: sourceLanguage || 'auto',
                targetLanguage: this.targetLanguage,
                confidence: 0.9, // Default confidence for translation
                timestamp: new Date()
            };

            console.log(`[Translation] Translated with ${this.currentProvider.name}:`, text, '->', translatedText);
            this.emit('translation', translationData);
            
            return translationData;
        } catch (error) {
            console.error('[Translation] Error translating text:', error);
            return null;
        }
    }

    public clearCache(): void {
        this.translationCache.clear();
        console.log('[Translation] Cache cleared');
    }

    public getCacheSize(): number {
        return this.translationCache.size;
    }

    public getCurrentProvider(): string {
        return this.currentProvider.name;
    }
}
