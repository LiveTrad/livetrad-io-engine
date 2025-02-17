import { EventEmitter } from 'events';

export interface AudioSource {
    id: string;
    title: string;
    tabId?: number;
}

export class AudioService extends EventEmitter {
    private sources: AudioSource[] = [];
    private selectedSource: AudioSource | null = null;
    private checkInterval: NodeJS.Timeout | null = null;

    constructor() {
        super();
        this.init();
    }

    private async init() {
        // Commencer à vérifier les sources audio
        this.startSourceChecking();
    }

    private async updateSources() {
        try {
            const tabs = await chrome.tabs.query({});
            const audioSources: AudioSource[] = [];

            for (const tab of tabs) {
                if (tab.audible) {
                    audioSources.push({
                        id: `tab-${tab.id}`,
                        title: tab.title || 'Unnamed Tab',
                        tabId: tab.id
                    });
                }
            }

            // Émettre seulement si les sources ont changé
            if (JSON.stringify(this.sources) !== JSON.stringify(audioSources)) {
                this.sources = audioSources;
                this.emit('sources-changed', this.sources);
            }
        } catch (error) {
            console.error('Error updating audio sources:', error);
        }
    }

    private startSourceChecking() {
        // Vérifier toutes les 1 secondes
        this.checkInterval = setInterval(() => this.updateSources(), 1000);
    }

    public getSources(): AudioSource[] {
        return this.sources;
    }

    public selectSource(sourceId: string) {
        const source = this.sources.find(s => s.id === sourceId);
        if (source) {
            this.selectedSource = source;
            this.emit('source-selected', source);
        }
    }

    public getSelectedSource(): AudioSource | null {
        return this.selectedSource;
    }

    public dispose() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
    }
}
