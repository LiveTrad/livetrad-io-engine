import { EventEmitter } from 'events';
import { TranscriptionProvider, TranscriptionData, TranscriptionConnectionStatus } from './provider';

export class LiveTradTranscriptor extends EventEmitter {
    private provider: TranscriptionProvider;
    private enabled: boolean = false;

    constructor(provider: TranscriptionProvider) {
        super();
        this.provider = provider;

        // Re-emit provider events to consumers
        this.provider.on('transcript', (data: TranscriptionData) => this.emit('transcription', data));
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
}


