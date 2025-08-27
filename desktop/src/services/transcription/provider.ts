import { EventEmitter } from 'events';

export interface TranscriptionConnectionStatus {
    connected: boolean;
    hasApiKey: boolean;
}

export interface TranscriptionData {
    transcript: string;
    confidence: number;
    isFinal: boolean;
    timestamp: Date | string | number;
}

export abstract class TranscriptionProvider extends EventEmitter {
    public abstract readonly name: string;

    public abstract startTranscription(): void;
    public abstract stopTranscription(): void;
    public abstract sendAudioData(audioBuffer: Buffer): void;
    public abstract isTranscriptionActive(): boolean;
    public abstract getConnectionStatus(): TranscriptionConnectionStatus;

    // Optional configuration
    public setLanguage?(opts: { language?: string, detectLanguage?: boolean }): void;
}


