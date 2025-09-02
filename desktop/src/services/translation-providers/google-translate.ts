export interface TranslationProvider {
    translate(text: string, sourceLang: string, targetLang: string): Promise<string>;
    name: string;
}

export class GoogleTranslateProvider implements TranslationProvider {
    public readonly name = 'google';
    private apiKey?: string;

    constructor(apiKey?: string) {
        this.apiKey = apiKey;
    }

    async translate(text: string, sourceLang: string, targetLang: string): Promise<string> {
        if (!this.apiKey) {
            console.warn('[Google Translate] No API key provided, using fallback');
            return this.fallbackTranslate(text, sourceLang, targetLang);
        }

        try {
            // Utiliser l'API Google Translate
            const response = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${this.apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    q: text,
                    source: sourceLang,
                    target: targetLang,
                    format: 'text'
                })
            });

            if (!response.ok) {
                throw new Error(`Google Translate API error: ${response.status}`);
            }

            const data = await response.json();
            return data.data.translations[0].translatedText;
        } catch (error) {
            console.error('[Google Translate] Error:', error);
            return this.fallbackTranslate(text, sourceLang, targetLang);
        }
    }

    private fallbackTranslate(text: string, sourceLang: string, targetLang: string): string {
        // Fallback simple comme avant
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
