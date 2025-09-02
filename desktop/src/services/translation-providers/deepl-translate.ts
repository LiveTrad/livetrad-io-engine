import { TranslationProvider } from './google-translate';
import * as deepl from 'deepl-node';

export class DeepLTranslateProvider implements TranslationProvider {
    public readonly name = 'deepl';
    private translator: deepl.Translator;
    private apiKey: string;

    constructor(apiKey: string = 'a54f1530-887d-4466-bfec-c32e1621fafe:fx') {
        if (!apiKey) {
            throw new Error('DeepL API key is required');
        }
        this.apiKey = apiKey;
        this.translator = new deepl.Translator(this.apiKey);
        console.log('[DeepL] Translator initialized');
    }

    async translate(text: string, _sourceLang: string, targetLang: string): Promise<string> {
        if (!text) throw new Error('Text to translate is required');
        if (!targetLang) throw new Error('Target language is required');

        try {
            // Convertir le code de langue cible
            const targetLangCode = this.convertToDeepLLanguageCode(targetLang);
            if (!targetLangCode) {
                throw new Error(`Unsupported target language: ${targetLang}`);
            }
            
            console.log(`[DeepL] Translating to ${targetLangCode} (auto-detect source)`);
            
            // Utiliser la détection automatique de la langue source
            const result = await this.translator.translateText(
                text,
                null, // Détection automatique de la langue source
                targetLangCode as deepl.TargetLanguageCode,
                {
                    preserveFormatting: true,
                    formality: 'default',
                    tagHandling: 'html',
                    splitSentences: 'on',
                    context: 'LiveTrad App'
                }
            );

            const sourceLang = result.detectedSourceLang || 'unknown';
            console.log(`[DeepL] Translated from ${sourceLang} to ${targetLangCode}`);
            return result.text;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('[DeepL] Translation error:', errorMessage);
            throw new Error(`Translation failed: ${errorMessage}`);
        }
    }

    private convertToDeepLLanguageCode(lang: string): string {
        // Map standard language codes to DeepL's format
        const langMap: Record<string, deepl.TargetLanguageCode> = {
            // Target languages (can be used as both source and target)
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
        const languageCode = langMap[normalizedLang];
        
        if (!languageCode) {
            console.warn(`[DeepL] Unsupported language code: ${lang}, defaulting to English`);
            return 'en-US';
        }
        
        return languageCode;
    }
}
