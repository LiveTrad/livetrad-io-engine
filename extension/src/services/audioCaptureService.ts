import { AudioCaptureState, ResponseType } from '../types';
import { WebSocketService } from './websocket';

export class AudioCaptureService {
  private state: AudioCaptureState = {
    isStreaming: false,
    activeTabId: null,
    stream: null
  };

  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private wsService: WebSocketService;

  constructor() {
    this.wsService = new WebSocketService();
  }

  public async startStreaming(stream: MediaStream, tabId: number): Promise<ResponseType> {
    try {
      console.log(`[AudioCapture] Starting streaming for tab ${tabId}`);      
      console.log('[AudioCapture] Checking current streaming state...');
      if (this.state.isStreaming) {
        console.warn('[AudioCapture] Already streaming audio for tab', this.state.activeTabId);
        throw new Error('Already streaming audio');
      }

      console.log('[AudioCapture] Validating audio stream...');
      if (!stream || stream.getTracks().length === 0) {
        console.error('[AudioCapture] Stream or tracks are empty');
        throw new Error('Invalid audio stream');
      }
      
      const tracks = stream.getTracks();
      console.log(`[AudioCapture] Stream validated: ${tracks.length} tracks found`);
      tracks.forEach((track, index) => {
        console.log(`[AudioCapture] Track ${index + 1}:`, {
          kind: track.kind,
          id: track.id,
          enabled: track.enabled,
          muted: track.muted,
          readyState: track.readyState
        });
      });

      // Setup audio processing
      console.log('[AudioCapture] Initializing AudioContext...');
      this.audioContext = new AudioContext();
      console.log('[AudioCapture] AudioContext created:', {
        sampleRate: this.audioContext.sampleRate,
        state: this.audioContext.state,
        baseLatency: this.audioContext.baseLatency
      });

      console.log('[AudioCapture] Creating MediaStreamSource...');
      this.source = this.audioContext.createMediaStreamSource(stream);
      console.log('[AudioCapture] MediaStreamSource created successfully');

      const config = this.wsService.getAudioConfig();
      console.log('[AudioCapture] Creating ScriptProcessor with config:', {
        bufferSize: config.bufferSize,
        inputChannels: config.channels,
        outputChannels: config.channels
      });

      this.processor = this.audioContext.createScriptProcessor(
        config.bufferSize,
        config.channels,
        config.channels
      );
      console.log('[AudioCapture] ScriptProcessor created successfully');

      // Process audio data
      let chunkCount = 0;
      let lastLogTime = Date.now();
      const logInterval = 1000; // Log every second

      this.processor.onaudioprocess = (e) => {
        const audioData = e.inputBuffer.getChannelData(0);
        const currentTime = Date.now();

        // Audio analysis
        let hasSound = false;
        let maxValue = 0;
        let minValue = 0;
        let sum = 0;
        let zeroes = 0;

        for (let i = 0; i < audioData.length; i++) {
          const value = audioData[i];
          if (value !== 0) {
            hasSound = true;
          } else {
            zeroes++;
          }
          maxValue = Math.max(maxValue, value);
          minValue = Math.min(minValue, value);
          sum += Math.abs(value);
        }

        const avgAmplitude = sum / audioData.length;
        
        // Log audio statistics periodically
        if (currentTime - lastLogTime >= logInterval) {
          console.log('[AudioCapture] Audio processing stats:', {
            chunkCount,
            bufferSize: audioData.length,
            hasSound,
            maxValue: maxValue.toFixed(4),
            minValue: minValue.toFixed(4),
            avgAmplitude: avgAmplitude.toFixed(4),
            zeroSamples: zeroes,
            nonZeroSamples: audioData.length - zeroes,
            chunksPerSecond: chunkCount / ((currentTime - lastLogTime) / 1000)
          });
          lastLogTime = currentTime;
          chunkCount = 0;
        }

        // Only send if we actually have sound
        if (hasSound) {
          console.log('[AudioCapture] Sending audio chunk:', {
            size: audioData.length,
            maxAmplitude: maxValue.toFixed(4),
            avgAmplitude: avgAmplitude.toFixed(4)
          });
          const audioArray = new Float32Array(audioData);
          this.wsService.sendAudioChunk(audioArray.buffer);
        }
        chunkCount++;
      };

      // Connect the audio nodes
      console.log('[AudioCapture] Connecting audio nodes...');
      this.source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);
      console.log('[AudioCapture] Audio nodes connected successfully');

      // Update state with the new stream
      this.state = {
        isStreaming: true,
        activeTabId: tabId,
        stream
      };
      console.log('[AudioCapture] Streaming state updated:', this.state);

      return { success: true };
    } catch (error) {
      console.error('[AudioCapture] Error starting streaming:', error);
      return { success: false, error: String(error) };
    }
  }

  public async stopStreaming(tabId: number): Promise<ResponseType> {
    try {
      console.log(`[AudioCapture] Stopping streaming for tab ${tabId}...`);
      console.log('[AudioCapture] Current state:', this.state);

      if (!this.state.isStreaming || this.state.activeTabId !== tabId) {
        console.warn('[AudioCapture] No active streaming found for tab', tabId);
        throw new Error('No active streaming for this tab');
      }

      if (this.state.stream) {
        console.log('[AudioCapture] Stopping audio tracks...');
        const tracks = this.state.stream.getTracks();
        tracks.forEach((track, index) => {
          console.log(`[AudioCapture] Stopping track ${index + 1}:`, {
            kind: track.kind,
            id: track.id,
            readyState: track.readyState
          });
          track.stop();
        });
        
        if (this.processor) {
          console.log('[AudioCapture] Disconnecting ScriptProcessor...');
          this.processor.disconnect();
          this.processor = null;
        }
        
        if (this.source) {
          console.log('[AudioCapture] Disconnecting MediaStreamSource...');
          this.source.disconnect();
          this.source = null;
        }
        
        if (this.audioContext) {
          console.log('[AudioCapture] Closing AudioContext...');
          await this.audioContext.close();
          this.audioContext = null;
        }

        console.log('[AudioCapture] All audio components cleaned up successfully');
      }

      this.state = {
        isStreaming: false,
        activeTabId: null,
        stream: null
      };
      console.log('[AudioCapture] Final state:', this.state);

      return { success: true };
    } catch (error) {
      console.error('[AudioCapture] Error stopping streaming:', error);
      return { success: false, error: String(error) };
    }
  }

  public getState(): AudioCaptureState {
    return this.state;
  }

  public getStream(): MediaStream | null {
    return this.state.stream;
  }

  public async connectToDesktop(): Promise<ResponseType> {
    try {
      const connectionState = await this.wsService.connect();
      return { success: true, connection: connectionState };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  public disconnectFromDesktop(): void {
    this.wsService.disconnect();
  }
}