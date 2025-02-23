import { EventEmitter } from 'events';
import { AudioSource } from '../types';
import { audioSourceDomains } from '@/config/audio.config';

export class AudioService extends EventEmitter {
    private selectedSourceId: string | null = null;
    private lockedSourceId: string | null = null;
    private knownSources: Map<string, AudioSource> = new Map();
    private checkInterval: number = 1000;
    private intervalId: number | null = null;

    constructor() {
        super();
        this.startSourceChecking();
    }

    private async startSourceChecking() {
        // Initial check
        await this.checkSources();
        
        // Regular checks
        this.intervalId = window.setInterval(async () => {
            await this.checkSources();
        }, this.checkInterval);
    }

    private async checkSources() {
        try {
            // Get all tabs
            const tabs = await chrome.tabs.query({});
            
            // Create a set of current tab IDs
            const currentTabIds = new Set<string>();
            
            for (const tab of tabs) {
                if (!tab.id) continue;
                
                const tabId = tab.id.toString();
                currentTabIds.add(tabId);
                
                // Check if this is a potential audio source (based on URL)
                const isPotentialSource = this.isPotentialAudioSource(tab.url);
                
                // Get the current source if it exists
                const existingSource = this.knownSources.get(tabId);
                
                if (isPotentialSource) {
                    // Update or create the source
                    const newSource: AudioSource = {
                        id: tabId,
                        title: tab.title || 'Unnamed Tab',
                        url: tab.url || '',
                        favIconUrl: tab.favIconUrl,
                        isAudible: tab.audible || false,
                        isPotentialSource: true,
                        isLocked: tabId === this.lockedSourceId
                    };
                    
                    // Only emit changes if something relevant changed
                    if (!existingSource || 
                        existingSource.isAudible !== newSource.isAudible ||
                        existingSource.title !== newSource.title) {
                        this.knownSources.set(tabId, newSource);
                        this.emitSourcesChanged();
                    }
                } else if (existingSource && !isPotentialSource) {
                    // Remove sources that are no longer potential
                    this.knownSources.delete(tabId);
                    this.emitSourcesChanged();
                }
            }
            
            // Clean up closed tabs
            for (const [tabId] of this.knownSources) {
                if (!currentTabIds.has(tabId)) {
                    this.knownSources.delete(tabId);
                    if (this.selectedSourceId === tabId) {
                        this.selectedSourceId = null;
                    }
                    if (this.lockedSourceId === tabId) {
                        this.lockedSourceId = null;
                    }
                    this.emitSourcesChanged();
                }
            }
            
        } catch (error) {
            console.error('Error checking audio sources:', error);
        }
    }

    private isPotentialAudioSource(url?: string): boolean {
        if (!url) return false;
        
        try {
            const urlObj = new URL(url);
            return audioSourceDomains.some(domain => urlObj.hostname.includes(domain));
        } catch {
            return false;
        }
    }

    private emitSourcesChanged() {
        const sources = Array.from(this.knownSources.values());
        this.emit('sources-changed', sources);
    }

    public selectSource(sourceId: string) {
        if (this.knownSources.has(sourceId)) {
            this.selectedSourceId = sourceId;
            this.emit('source-selected', this.knownSources.get(sourceId));
        }
    }

    public toggleSourceLock(sourceId: string) {
        const source = this.knownSources.get(sourceId);
        if (source) {
            if (this.lockedSourceId === sourceId) {
                // Unlock
                this.lockedSourceId = null;
                source.isLocked = false;
            } else {
                // Lock
                this.lockedSourceId = sourceId;
                source.isLocked = true;
            }
            this.knownSources.set(sourceId, source);
            this.emitSourcesChanged();
        }
    }

    public getSelectedSource(): AudioSource | null {
        if (!this.selectedSourceId) return null;
        return this.knownSources.get(this.selectedSourceId) || null;
    }

    public cleanup() {
        if (this.intervalId !== null) {
            window.clearInterval(this.intervalId);
        }
    }
}
