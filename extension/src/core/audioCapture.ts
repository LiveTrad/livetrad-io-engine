import { config } from './config';

export class AudioCapture {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private audioWorklet: AudioWorkletNode | null = null;
  private port: chrome.runtime.Port | null = null;

  constructor() {
    if (config.app.debug) {
      console.log('LiveTrad AudioCapture: Initialized with config:', config);
    }
    this.port = chrome.runtime.connect({ name: 'livetrad-audio' });
    
    this.port.onMessage.addListener((message) => {
      console.log('LiveTrad AudioCapture: Received message:', message);
      
      if (message.type === 'PROCESSOR_URL_RESPONSE') {
        this.handleProcessorUrlResponse(message.processorUrl);
      }
      
      if (message.type === 'TAB_CAPTURE_RESPONSE') {
        this.handleTabCaptureResponse(message);
      }
    });
  }

  private async handleProcessorUrlResponse(processorUrl: string) {
    try {
      if (!this.audioContext) {
        throw new Error('AudioContext is null');
      }
      console.log('LiveTrad AudioCapture: Loading AudioWorklet module');
      await this.audioContext.audioWorklet.addModule(processorUrl);
      console.log('LiveTrad AudioCapture: AudioWorklet module loaded');
      
      // Demander la capture audio
      console.log('LiveTrad AudioCapture: Requesting tab capture');
      this.port?.postMessage({ type: 'START_TAB_CAPTURE' });
    } catch (error) {
      console.error('LiveTrad AudioCapture: Error loading AudioWorklet:', error);
      throw error;
    }
  }

  private async handleTabCaptureResponse(response: any) {
    try {
      if (!response.success) {
        throw new Error(response.error || 'Tab capture failed');
      }

      if (!this.audioContext) {
        throw new Error('AudioContext is null');
      }

      // Configurer le traitement audio
      console.log('LiveTrad AudioCapture: Creating audio source');
      const source = this.audioContext.createMediaStreamSource(this.mediaStream!);
      
      console.log('LiveTrad AudioCapture: Creating AudioWorkletNode');
      this.audioWorklet = new AudioWorkletNode(this.audioContext, 'audio-processor');
      source.connect(this.audioWorklet);
      this.audioWorklet.connect(this.audioContext.destination);

      console.log('LiveTrad AudioCapture: Audio capture initialized successfully');
    } catch (error) {
      console.error('LiveTrad AudioCapture: Error setting up audio:', error);
      throw error;
    }
  }

  async initialize(): Promise<boolean> {
    try {
      console.log('LiveTrad AudioCapture: Starting initialization...');
      
      // Initialiser AudioContext
      this.audioContext = new AudioContext({
        sampleRate: config.audio.sampleRate,
        latencyHint: 'interactive'
      });
      console.log('LiveTrad AudioCapture: AudioContext created with state:', this.audioContext.state);

      // S'assurer que l'AudioContext est démarré
      if (this.audioContext.state === 'suspended') {
        console.log('LiveTrad AudioCapture: Resuming suspended AudioContext');
        await this.audioContext.resume();
      }

      // Demander l'URL du processeur
      console.log('LiveTrad AudioCapture: Requesting processor URL');
      this.port?.postMessage({ type: 'GET_PROCESSOR_URL' });
      
      return true;
    } catch (error) {
      console.error('LiveTrad AudioCapture: Failed to initialize:', error);
      return false;
    }
  }

  async stop(): Promise<void> {
    try {
      console.log('LiveTrad AudioCapture: Stopping audio capture');
      
      // Informer le background script
      this.port?.postMessage({ type: 'STOP_TAB_CAPTURE' });

      if (this.audioWorklet) {
        console.log('LiveTrad AudioCapture: Disconnecting AudioWorklet');
        this.audioWorklet.disconnect();
        this.audioWorklet = null;
      }

      if (this.mediaStream) {
        console.log('LiveTrad AudioCapture: Stopping media stream tracks');
        this.mediaStream.getTracks().forEach(track => track.stop());
        this.mediaStream = null;
      }

      if (this.audioContext) {
        console.log('LiveTrad AudioCapture: Closing AudioContext');
        await this.audioContext.close();
        this.audioContext = null;
      }

      if (this.port) {
        console.log('LiveTrad AudioCapture: Disconnecting port');
        this.port.disconnect();
        this.port = null;
      }

      console.log('LiveTrad AudioCapture: Audio capture stopped successfully');
    } catch (error) {
      console.error('LiveTrad AudioCapture: Error stopping audio capture:', error);
      throw error;
    }
  }
}
