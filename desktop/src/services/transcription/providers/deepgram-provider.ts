import { TranscriptionProvider, TranscriptionData, TranscriptionConnectionStatus } from '../provider';
import { DeepgramService } from '../../deepgram';

export class DeepgramProvider extends TranscriptionProvider {
    public readonly name = 'deepgram';
    private service: DeepgramService;

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
        this.service.startTranscription();
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
}


