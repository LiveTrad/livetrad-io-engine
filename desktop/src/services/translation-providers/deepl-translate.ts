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

    async translate(text: string, sourceLang: string, targetLang: string): Promise<string> {
        if (!text || !sourceLang || !targetLang) {
            throw new Error('Missing required parameters for translation');
        }

        try {
            // Convert language codes for DeepL
            const targetLangCode = this.convertToDeepLLanguageCode(targetLang);
            const sourceLangCode = sourceLang !== 'auto' ? this.convertToDeepLLanguageCode(sourceLang) : null;
            
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
