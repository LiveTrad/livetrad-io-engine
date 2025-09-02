import { TranscriptionProvider, TranscriptionData, TranscriptionConnectionStatus } from '../provider';
import { DeepgramService } from '../../deepgram';

export class DeepgramProvider extends TranscriptionProvider {
    public readonly name = 'deepgram';
    private service: DeepgramService;
    private language?: string;
    private detectLanguage?: boolean;

    constructor() {
        super();
        this.service = new DeepgramService();

        // Bridge DeepgramService events to provider events
        this.service.on('transcript', (data: TranscriptionData) => this.emit('transcript', data));
        this.service.on('connected', () => this.emit('connected'));
        this.service.on('disconnected', () => this.emit('disconnected'));
        this.service.on('error', (err: any) => this.emit('error', err));
    }

    public startTranscription(): void {
        if (this.language || this.detectLanguage !== undefined) {
            this.service.startTranscription({ language: this.language, detectLanguage: this.detectLanguage });
        } else {
            this.service.startTranscription();
        }
    }

    public stopTranscription(): void {
        this.service.stopTranscription();
    }

    public sendAudioData(audioBuffer: Buffer): void {
        this.service.sendAudioData(audioBuffer);
    }

    public isTranscriptionActive(): boolean {
        return this.service.isTranscriptionActive();
    }

    public getConnectionStatus(): TranscriptionConnectionStatus {
        return this.service.getConnectionStatus();
    }

    public setLanguage(opts: { language?: string, detectLanguage?: boolean }): void {
        this.language = opts.language;
        this.detectLanguage = opts.detectLanguage;
    }
}


