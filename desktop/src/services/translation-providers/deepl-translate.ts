import { TranslationProvider } from './google-translate';

export class DeepLTranslateProvider implements TranslationProvider {
    public readonly name = 'deepl';
    private apiKey?: string;

    constructor(apiKey?: string) {
        this.apiKey = apiKey;
    }

    async translate(text: string, sourceLang: string, targetLang: string): Promise<string> {
        if (!this.apiKey) {
            console.warn('[DeepL] No API key provided, using fallback');
            return this.fallbackTranslate(text, sourceLang, targetLang);
        }

        try {
            // Convertir les codes de langue pour DeepL
            const sourceLangCode = this.convertLanguageCode(sourceLang);
            const targetLangCode = this.convertLanguageCode(targetLang);

            const response = await fetch('https://api-free.deepl.com/v2/translate', {
                method: 'POST',
                headers: {
                    'Authorization': `DeepL-Auth-Key ${this.apiKey}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    text: text,
                    source_lang: sourceLangCode,
                    target_lang: targetLangCode,
                    preserve_formatting: '1'
                })
            });

            if (!response.ok) {
                throw new Error(`DeepL API error: ${response.status}`);
            }

            const data = await response.json();
            return data.translations[0].text;
        } catch (error) {
            console.error('[DeepL] Error:', error);
            return this.fallbackTranslate(text, sourceLang, targetLang);
        }
    }

    private convertLanguageCode(lang: string): string {
        // DeepL utilise des codes de langue différents
        const langMap: { [key: string]: string } = {
            'en': 'EN',
            'fr': 'FR',
            'es': 'ES',
            'de': 'DE',
            'it': 'IT',
            'pt': 'PT',
            'auto': 'EN' // DeepL ne supporte pas auto, on utilise EN par défaut
        };
        return langMap[lang] || 'EN';
    }

    private fallbackTranslate(text: string, sourceLang: string, targetLang: string): string {
        // Même fallback que Google Translate
        const translations: { [key: string]: { [key: string]: { [key: string]: string } } } = {
            'en': {
                'fr': {
                    'hello': 'bonjour',
                    'goodbye': 'au revoir',
                    'thank you': 'merci',
                    'how are you': 'comment allez-vous',
                    'good morning': 'bonjour',
                    'good evening': 'bonsoir'
                },
                'es': {
                    'hello': 'hola',
                    'goodbye': 'adiós',
                    'thank you': 'gracias',
                    'how are you': '¿cómo estás?',
                    'good morning': 'buenos días',
                    'good evening': 'buenas noches'
                }
            },
            'fr': {
                'en': {
                    'bonjour': 'hello',
                    'au revoir': 'goodbye',
                    'merci': 'thank you',
                    'comment allez-vous': 'how are you',
                    'bonsoir': 'good evening'
                }
            }
        };

        const sourceTranslations = translations[sourceLang];
        if (sourceTranslations && sourceTranslations[targetLang]) {
            const targetTranslations = sourceTranslations[targetLang];
            const lowerText = text.toLowerCase();
            
            if (targetTranslations[lowerText]) {
                return targetTranslations[lowerText];
            }
            
            for (const [key, value] of Object.entries(targetTranslations)) {
                if (lowerText.includes(key)) {
                    return text.replace(new RegExp(key, 'gi'), value);
                }
            }
        }

        return text;
    }
}
