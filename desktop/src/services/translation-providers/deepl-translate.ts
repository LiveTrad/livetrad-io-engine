import { TranslationProvider } from './google-translate';
import * as deepl from 'deepl-node';

export class DeepLTranslateProvider implements TranslationProvider {
    public readonly name = 'deepl';
    private translator: deepl.Translator | null = null;
    private apiKey?: string;
    
    // Simple fallback translations for common phrases
    private fallbackTranslations: Record<string, Record<string, string>> = {
        'fr': {
            'hello': 'bonjour',
            'goodbye': 'au revoir',
            'thank you': 'merci',
            'how are you': 'comment allez-vous',
            'good evening': 'bonsoir'
        },
        'en': {
            'bonjour': 'hello',
            'au revoir': 'goodbye',
            'merci': 'thank you',
            'comment allez-vous': 'how are you',
            'bonsoir': 'good evening'
        }
    };

    constructor(apiKey?: string) {
        this.apiKey = apiKey;
        if (apiKey) {
            try {
                this.translator = new deepl.Translator(apiKey);
                console.log('[DeepL] Translator initialized');
            } catch (error) {
                console.error('[DeepL] Failed to initialize translator:', error);
            }
        }
    }

    async translate(text: string, sourceLang: string, targetLang: string): Promise<string> {
        if (!this.translator) {
            console.warn('[DeepL] No valid API key provided, using fallback');
            return this.fallbackTranslate(text, sourceLang, targetLang);
        }

        try {
            // Convert language codes for DeepL
            const targetLangCode = this.convertLanguageCode(targetLang);
            const sourceLangCode = sourceLang ? this.convertLanguageCode(sourceLang) : null;
            
            if (!targetLangCode) {
                throw new Error('Invalid target language');
            }
            
            console.log(`[DeepL] Translating from ${sourceLangCode || 'auto'} to ${targetLangCode}`);
            
            const result = await this.translator.translateText(
                text,
                sourceLangCode as deepl.SourceLanguageCode | null,
                targetLangCode as deepl.TargetLanguageCode,
                {
                    preserveFormatting: true,
                    formality: 'default',
                    tagHandling: 'html',
                    splitSentences: 'on',
                    context: 'LiveTrad App'
                }
            );

            console.log(`[DeepL] Translation successful (detected: ${result.detectedSourceLang || 'unknown'})`);
            return result.text;
        } catch (error) {
            console.error('[DeepL] Translation error:', error);
            return this.fallbackTranslate(text, sourceLang, targetLang);
        }
    }

    private convertLanguageCode(lang: string): string {
        // Map standard language codes to DeepL's format
        const langMap: { [key: string]: string } = {
            'en': 'en-US',
            'fr': 'fr',
            'es': 'es',
            'de': 'de',
            'it': 'it',
            'pt': 'pt-PT',
            'pt-br': 'pt-BR',
            'ru': 'ru',
            'ja': 'ja',
            'zh': 'zh',
            'nl': 'nl',
            'pl': 'pl',
            'bg': 'bg',
            'cs': 'cs',
            'da': 'da',
            'el': 'el',
            'et': 'et',
            'fi': 'fi',
            'hu': 'hu',
            'lt': 'lt',
            'lv': 'lv',
            'ro': 'ro',
            'sk': 'sk',
            'sl': 'sl',
            'sv': 'sv',
            'id': 'id',
            'tr': 'tr',
            'uk': 'uk'
        };

        const normalizedLang = lang.toLowerCase();
        if (normalizedLang === 'auto') return ''; // Empty string for auto-detection
        return langMap[normalizedLang] || 'en-US';
    }

    private async fallbackTranslate(text: string, sourceLang: string, targetLang: string): Promise<string> {
        console.warn(`[DeepL] Using fallback translation (${sourceLang} -> ${targetLang})`);
        
        // Try to find a fallback translation
        const sourceLangCode = sourceLang.split('-')[0];
        const targetLangCode = targetLang.split('-')[0];
        
        // Check for direct match in source language
        if (this.fallbackTranslations[sourceLangCode]?.[text.toLowerCase()]) {
            return this.fallbackTranslations[sourceLangCode][text.toLowerCase()];
        }
        
        // If no direct translation found, try to find a reverse translation
        if (this.fallbackTranslations[targetLangCode]) {
            const reverseMap = Object.entries(this.fallbackTranslations[targetLangCode])
                .reduce((acc, [key, value]) => {
                    acc[value] = key;
                    return acc;
                }, {} as Record<string, string>);
                
            if (reverseMap[text.toLowerCase()]) {
                return reverseMap[text.toLowerCase()];
            }
        }
        
        // If no translation found, return the original text
        return text;
    }
}
