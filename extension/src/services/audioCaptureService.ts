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

      // Check if we can capture this tab
      if (!stream) {
        console.error('[AudioCapture] No stream provided');
        throw new Error('No stream provided');
      }

      // Ensure WebSocket connection is established before streaming
      if (this.wsService.getConnectionState().status !== 'connected') {
        console.log('[AudioCapture] WebSocket not connected, attempting to connect...');
        try {
          await this.wsService.connect();
        } catch (wsError) {
          console.error('[AudioCapture] Failed to establish WebSocket connection:', wsError);
          throw new Error('Failed to establish WebSocket connection. Please ensure the desktop app is running.');
        }
      }

      // Update state
      this.state = {
        isStreaming: true,
        activeTabId: tabId,
        stream: stream
      };

      console.log('[AudioCapture] Creating audio context...');
      this.audioContext = new AudioContext({
        sampleRate: 16000
      });
      console.log('[AudioCapture] AudioContext created with sample rate:', this.audioContext.sampleRate);

      this.source = this.audioContext.createMediaStreamSource(stream);
      console.log('[AudioCapture] Audio source created');

      // Create a ScriptProcessorNode for audio processing
      const bufferSize = 4096;
      this.processor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);
      console.log('[AudioCapture] ScriptProcessorNode created with bufferSize:', bufferSize);

      // Connect the audio graph
      this.source.connect(this.processor);
      // Connect to destination to keep context running
      this.processor.connect(this.audioContext.destination);

      // Audio processing function
      let chunkCount = 0;
      let lastLogTime = performance.now();

      this.processor.onaudioprocess = (event) => {
        try {
          const inputBuffer = event.inputBuffer;
          const audioData = inputBuffer.getChannelData(0);
          const currentTime = performance.now();

          // Convert Float32Array to Int16Array (PCM 16-bit)
          const pcmData = new Int16Array(audioData.length);
          for (let i = 0; i < audioData.length; i++) {
            const s = Math.max(-1, Math.min(1, audioData[i]));
            pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }

          let maxValue = Number.MIN_VALUE;
          let minValue = Number.MAX_VALUE;
          let sumAmplitude = 0;
          let zeroes = 0;

          for (let i = 0; i < audioData.length; i++) {
            const value = audioData[i];
            maxValue = Math.max(maxValue, value);
            minValue = Math.min(minValue, value);
            sumAmplitude += Math.abs(value);
            if (value === 0) zeroes++;
          }

          const avgAmplitude = sumAmplitude / audioData.length;
          const hasSound = maxValue > 0.01 || avgAmplitude > 0.005;
          chunkCount++;

          if (currentTime - lastLogTime >= 1000) {
            console.log('[AudioCapture] Audio chunk processed:', {
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

          // Send audio data if we have sound and connection is active
          if (hasSound) {
            try {
              const connectionState = this.wsService.getConnectionState();
              if (connectionState.status === 'connected') {
                console.log('[AudioCapture] Sending PCM audio chunk:', {
                  size: pcmData.length,
                  maxAmplitude: maxValue.toFixed(4),
                  avgAmplitude: avgAmplitude.toFixed(4)
                });
                this.wsService.sendAudioChunk(pcmData.buffer);
              } else {
                console.warn('[AudioCapture] Cannot send audio chunk: WebSocket not connected');
              }
            } catch (error) {
              console.error('[AudioCapture] Error sending audio chunk:', error);
            }
          }
        } catch (error) {
          console.error('[AudioCapture] Error in audio processing:', error);
        }
      };

      console.log('[AudioCapture] Audio processing started for tab', tabId);
      return { success: true };
    } catch (error) {
      console.error('[AudioCapture] Failed to start streaming:', error);
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