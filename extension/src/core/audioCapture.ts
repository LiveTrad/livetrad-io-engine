import { config } from './config';

export class AudioCapture {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;

  constructor() {
    if (config.app.debug) {
      console.log('AudioCapture initialized with config:', config);
    }
  }

  async initialize(): Promise<boolean> {
    try {
      // Vérifier si nous sommes sur une plateforme supportée
      if (!this.isSupported()) {
        throw new Error('Platform not supported');
      }

      // Créer le contexte audio
      this.audioContext = new AudioContext({
        sampleRate: config.audio.sampleRate,
        latencyHint: 'interactive'
      });

      // Capturer l'audio de l'onglet
      this.mediaStream = await this.captureTabAudio();
      
      if (config.app.debug) {
        console.log('Audio stream captured:', this.mediaStream);
      }

      // Configurer le processing
      await this.setupAudioProcessing();

      return true;
    } catch (error) {
      console.error('Failed to initialize audio capture:', error);
      return false;
    }
  }

  private isSupported(): boolean {
    const currentUrl = window.location.hostname;
    return config.platforms.supported.some(platform => 
      currentUrl.includes(platform)
    );
  }

  private async captureTabAudio(): Promise<MediaStream> {
    const constraints = {
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          channelCount: config.audio.channels
        }
      },
      video: false
    };

    try {
      // Essayer d'abord la capture d'onglet
      return await navigator.mediaDevices.getUserMedia(constraints as any);
    } catch (error) {
      console.warn('Tab capture failed, trying fallback:', error);
      
      // Fallback : capture audio standard
      return await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: false 
      });
    }
  }

  private async setupAudioProcessing(): Promise<void> {
    if (!this.audioContext || !this.mediaStream) {
      throw new Error('AudioContext or MediaStream not initialized');
    }

    // Créer la source audio
    this.source = this.audioContext.createMediaStreamSource(this.mediaStream);
    
    // Créer le processeur
    this.processor = this.audioContext.createScriptProcessor(1024, 1, 1);

    // Connecter le processeur
    this.source.connect(this.processor);
    this.processor.connect(this.audioContext.destination);

    // Traitement audio
    this.processor.onaudioprocess = (e: AudioProcessingEvent) => {
      const inputData = e.inputBuffer.getChannelData(0);
      
      if (config.app.debug) {
        // Log des données audio pour debug
        console.log('Audio data:', {
          sampleRate: e.inputBuffer.sampleRate,
          length: inputData.length,
          peek: inputData[0]
        });
      }

      // TODO: Envoyer les données au serveur
    };
  }

  public async stop(): Promise<void> {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
    }
    if (this.processor) {
      this.processor.disconnect();
    }
    if (this.source) {
      this.source.disconnect();
    }
    if (this.audioContext) {
      await this.audioContext.close();
    }
  }
}
