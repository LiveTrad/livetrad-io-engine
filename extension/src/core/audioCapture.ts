import { config } from './config';

export class AudioCapture {
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private audioWorklet: AudioWorkletNode | null = null;
  private port: chrome.runtime.Port | null = null;

  constructor() {
    if (config.app.debug) {
      console.log('LiveTrad AudioCapture: Initialized with config:', config);
    }
    this.setupConnection();
  }

  private setupConnection() {
    try {
      this.port = chrome.runtime.connect({ name: 'livetrad-audio' });
      
      if (!this.port) {
        throw new Error('Failed to create port connection');
      }

      this.port.onMessage.addListener(this.handleMessage.bind(this));
      this.port.onDisconnect.addListener(() => {
        console.log('LiveTrad AudioCapture: Port disconnected, attempting to reconnect...');
        setTimeout(() => this.setupConnection(), 1000);
      });

      console.log('LiveTrad AudioCapture: Port connected successfully');
    } catch (error) {
      console.error('LiveTrad AudioCapture: Error setting up connection:', error);
    }
  }

  private handleMessage = async (message: any) => {
    console.log('LiveTrad AudioCapture: Received message:', message);
    
    if (message.type === 'PROCESSOR_URL_RESPONSE') {
      await this.handleProcessorUrlResponse(message.processorUrl);
    }
  };

  private async handleProcessorUrlResponse(processorUrl: string) {
    try {
      if (!this.audioContext) {
        throw new Error('AudioContext is null');
      }

      console.log('LiveTrad AudioCapture: Loading processor from URL:', processorUrl);
      await this.audioContext.audioWorklet.addModule(processorUrl);
      
      this.audioWorklet = new AudioWorkletNode(this.audioContext, 'audio-processor');
      console.log('LiveTrad AudioCapture: Processor loaded successfully');

      // If we have a media stream, connect it to the worklet
      if (this.mediaStream) {
        const source = this.audioContext.createMediaStreamSource(this.mediaStream);
        source.connect(this.audioWorklet);
        this.audioWorklet.connect(this.audioContext.destination);
      }

    } catch (error) {
      console.error('LiveTrad AudioCapture: Error loading processor:', error);
    }
  }

  async start(): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('LiveTrad AudioCapture: Starting capture');
      
      // Get the active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        throw new Error('No active tab found');
      }

      // Start tab capture
      this.mediaStream = await new Promise<MediaStream>((resolve, reject) => {
        chrome.tabCapture.capture({
          audio: true,
          video: false
        }, (stream) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (!stream) {
            reject(new Error('Failed to get media stream'));
          } else {
            resolve(stream);
          }
        });
      });

      // Create audio context and connect stream
      this.audioContext = new AudioContext();
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);

      // If we have a worklet, connect to it
      if (this.audioWorklet) {
        source.connect(this.audioWorklet);
        this.audioWorklet.connect(this.audioContext.destination);
      } else {
        // Otherwise connect directly to output
        source.connect(this.audioContext.destination);
      }

      // Request processor URL if we don't have a worklet
      if (!this.audioWorklet && this.port) {
        this.port.postMessage({ type: 'GET_PROCESSOR_URL' });
      }

      console.log('LiveTrad AudioCapture: Capture successful');
      return { success: true };

    } catch (error) {
      console.error('LiveTrad AudioCapture: Capture failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  stop(): void {
    console.log('LiveTrad AudioCapture: Stopping capture');
    
    if (this.audioWorklet) {
      this.audioWorklet.disconnect();
      this.audioWorklet = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    console.log('LiveTrad AudioCapture: Stopped successfully');
  }
}
