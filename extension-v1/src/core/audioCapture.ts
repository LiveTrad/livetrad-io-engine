import { config } from './config';
import { browserAPI } from './browserAPI';

export class AudioCapture {
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private audioWorklet: AudioWorkletNode | null = null;
  private port: any = null;

  constructor() {
    if (config.app.debug) {
      console.log('LiveTrad AudioCapture: Initialized with config:', config);
    }
    this.setupConnection();
    this.logState('After initialization');
  }

  private logState(context: string) {
    console.log(`LiveTrad AudioCapture State [${context}]:`, {
      mediaStream: {
        exists: !!this.mediaStream,
        tracks: this.mediaStream?.getTracks().map(track => ({
          id: track.id,
          kind: track.kind,
          enabled: track.enabled,
          muted: track.muted,
          readyState: track.readyState
        }))
      },
      audioContext: {
        exists: !!this.audioContext,
        state: this.audioContext?.state,
        sampleRate: this.audioContext?.sampleRate,
        baseLatency: this.audioContext?.baseLatency
      },
      audioWorklet: {
        exists: !!this.audioWorklet,
        numberOfInputs: this.audioWorklet?.numberOfInputs,
        numberOfOutputs: this.audioWorklet?.numberOfOutputs,
        channelCount: this.audioWorklet?.channelCount
      },
      port: {
        exists: !!this.port,
        name: this.port?.name,
        connected: !this.port?.onDisconnect
      }
    });
  }

  private setupConnection() {
    try {
      this.port = browserAPI.runtime.connect({ name: 'livetrad-audio' });
      
      if (!this.port) {
        throw new Error('Failed to create port connection');
      }

      this.port.onMessage.addListener(this.handleMessage.bind(this));
      this.port.onDisconnect.addListener(() => {
        console.log('LiveTrad AudioCapture: Port disconnected, attempting to reconnect...');
        setTimeout(() => this.setupConnection(), 1000);
      });

      console.log('LiveTrad AudioCapture: Port connected successfully');
      this.logState('After port connection');
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
        console.log('LiveTrad AudioCapture: Connected existing stream to new worklet');
      }

      this.logState('After processor setup');
    } catch (error) {
      console.error('LiveTrad AudioCapture: Error loading processor:', error);
    }
  }

  private async requestScreenShare(): Promise<MediaStream> {
    try {
      // First try to get screen share permission
      const stream = await navigator.mediaDevices.getDisplayMedia({ 
        video: true,
        audio: true 
      });
      
      // Stop video track immediately as we only need audio
      stream.getVideoTracks().forEach(track => track.stop());
      
      return stream;
    } catch (error) {
      console.error('LiveTrad AudioCapture: Screen share request failed:', error);
      throw new Error('Please allow screen sharing to capture tab audio');
    }
  }

  async start(): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('LiveTrad AudioCapture: Starting capture');
      this.logState('Before starting capture');
      
      // Get the active tab
      const tabs = await browserAPI.tabs.query({ active: true, currentWindow: true });
      console.log('LiveTrad AudioCapture: Found tabs:', tabs);
      
      if (!tabs || tabs.length === 0 || !tabs[0].id) {
        throw new Error('No active tab found');
      }

      const activeTab = tabs[0];
      console.log('LiveTrad AudioCapture: Active tab:', activeTab);

      // First request screen sharing permission
      await this.requestScreenShare();

      // Then try to capture tab audio
      try {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            mediaSource: 'browser',
            browserTab: activeTab.id
          } as MediaTrackConstraints
        });
      } catch (error) {
        if (error instanceof Error) {
          if (error.name === 'OverconstrainedError') {
            throw new Error('Unable to capture tab audio. Make sure you have selected a tab with audio playing and allowed screen sharing.');
          }
          throw error;
        }
        throw new Error('Unknown error during audio capture');
      }

      console.log('LiveTrad AudioCapture: Got media stream:', {
        tracks: this.mediaStream.getTracks().map(track => ({
          id: track.id,
          kind: track.kind,
          enabled: track.enabled,
          muted: track.muted
        }))
      });

      // Create audio context and connect stream
      this.audioContext = new AudioContext();
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);

      // If we have a worklet, connect to it
      if (this.audioWorklet) {
        source.connect(this.audioWorklet);
        this.audioWorklet.connect(this.audioContext.destination);
        console.log('LiveTrad AudioCapture: Connected to audio worklet');
      } else {
        // Otherwise connect directly to output
        source.connect(this.audioContext.destination);
        console.log('LiveTrad AudioCapture: Connected directly to output');
      }

      // Request processor URL if we don't have a worklet
      if (!this.audioWorklet && this.port) {
        console.log('LiveTrad AudioCapture: Requesting processor URL');
        this.port.postMessage({ type: 'GET_PROCESSOR_URL' });
      }

      this.logState('After starting capture');
      return { success: true };

    } catch (error) {
      console.error('LiveTrad AudioCapture: Capture failed:', error);
      this.logState('After capture failure');
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async stop(): Promise<void> {
    console.log('LiveTrad AudioCapture: Stopping capture');
    this.logState('Before stopping');
    
    if (this.audioWorklet) {
      this.audioWorklet.disconnect();
      this.audioWorklet = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }

    console.log('LiveTrad AudioCapture: Stopped successfully');
    this.logState('After stopping');
  }
}
