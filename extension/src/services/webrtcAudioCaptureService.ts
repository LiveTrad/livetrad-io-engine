import { AudioCaptureState, ResponseType } from '../types';
import { WebRTCService, WebRTCConnectionState } from './webrtc';
import { WebRTCConfig, defaultWebRTCConfig } from '../config/webrtc.config';
import { AudioConfig, defaultAudioConfig } from '../config/audio.config';

export class WebRTCAudioCaptureService {
  private state: AudioCaptureState = {
    isStreaming: false,
    activeTabId: -1,
    stream: null
  };

  private webrtcService: WebRTCService;
  private currentStream: MediaStream | null = null;

  constructor(config: WebRTCConfig = defaultWebRTCConfig, audioConfig: AudioConfig = defaultAudioConfig) {
    this.webrtcService = new WebRTCService(config, audioConfig);
  }

  public async startStreaming(stream: MediaStream, tabId: number): Promise<ResponseType> {
    try {
      console.log(`[WebRTCAudioCapture] Starting streaming for tab ${tabId}`);
      
      if (this.state.isStreaming) {
        console.warn('[WebRTCAudioCapture] Already streaming audio for tab', this.state.activeTabId);
        throw new Error('Already streaming audio');
      }

      if (!stream) {
        console.error('[WebRTCAudioCapture] No stream provided');
        throw new Error('No stream provided');
      }

      // Ensure WebRTC connection is established
      const connectionState = this.webrtcService.getConnectionState();
      if (connectionState.status !== 'connected') {
        console.log('[WebRTCAudioCapture] WebRTC not connected, attempting to connect...');
        try {
          await this.webrtcService.connect();
        } catch (webrtcError) {
          console.error('[WebRTCAudioCapture] Failed to establish WebRTC connection:', webrtcError);
          throw new Error('Failed to establish WebRTC connection. Please ensure the desktop app is running.');
        }
      }

      // Update state
      this.state = {
        isStreaming: true,
        activeTabId: tabId,
        stream: stream
      };

      this.currentStream = stream;

      // Send audio stream via WebRTC
      const success = await this.webrtcService.sendAudioStream(stream);
      if (!success) {
        throw new Error('Failed to send audio stream via WebRTC');
      }

      console.log('[WebRTCAudioCapture] WebRTC audio streaming started for tab', tabId);
      return { success: true };
    } catch (error) {
      console.error('[WebRTCAudioCapture] Failed to start streaming:', error);
      return { success: false, error: String(error) };
    }
  }

  public async stopStreaming(tabId: number): Promise<ResponseType> {
    try {
      console.log(`[WebRTCAudioCapture] Stopping streaming for tab ${tabId}`);
      
      if (!this.state.isStreaming || this.state.activeTabId !== tabId) {
        console.warn('[WebRTCAudioCapture] Not streaming for this tab');
        return { success: false, error: 'Not streaming for this tab' };
      }

      // Stop the stream
      if (this.currentStream) {
        this.currentStream.getTracks().forEach(track => track.stop());
        this.currentStream = null;
      }

      // Update state
      this.state = {
        isStreaming: false,
        activeTabId: -1,
        stream: null
      };

      console.log('[WebRTCAudioCapture] WebRTC audio streaming stopped for tab', tabId);
      return { success: true };
    } catch (error) {
      console.error('[WebRTCAudioCapture] Failed to stop streaming:', error);
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
      console.log('[WebRTCAudioCapture] Connecting to desktop via WebRTC...');
      const connectionState = await this.webrtcService.connect();
      console.log('[WebRTCAudioCapture] WebRTC connection established:', connectionState);
      return { success: true };
    } catch (error) {
      console.error('[WebRTCAudioCapture] Failed to connect to desktop:', error);
      return { success: false, error: String(error) };
    }
  }

  public disconnectFromDesktop(): void {
    console.log('[WebRTCAudioCapture] Disconnecting from desktop...');
    this.webrtcService.disconnect();
  }

  public getConnectionState(): WebRTCConnectionState {
    return this.webrtcService.getConnectionState();
  }

  public sendControlMessage(message: any): boolean {
    return this.webrtcService.sendControlMessage(message);
  }
} 