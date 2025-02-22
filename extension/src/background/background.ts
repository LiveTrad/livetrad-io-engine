import { AudioCaptureState, MessageType, ResponseType, TabInfo } from '../types';
import { WebSocketService } from '../services/websocket';

class AudioCaptureManager {
  private state: AudioCaptureState = {
    isStreaming: false,
    activeTabId: null,
    stream: null
  };

  private wsService: WebSocketService;
  private audioContext: AudioContext | null = null;

  constructor() {
    this.wsService = new WebSocketService();
    this.initializeListeners();
  }

  private initializeListeners(): void {
    // Listen for tab removal to update streaming state
    chrome.tabs.onRemoved.addListener((tabId) => {
      if (this.state.activeTabId === tabId) {
        this.stopStreaming(tabId);
      }
      this.updateAvailableTabs();
      this.notifyStreamingStateChanged();
    });

    // Listen for tab audio state changes
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (changeInfo.audible !== undefined) {
        this.updateAvailableTabs();
      }
    });

    chrome.runtime.onMessage.addListener((
      message: MessageType,
      _sender,
      sendResponse: (response: ResponseType) => void
    ) => {
      // Handle async operations
      (async () => {
        try {
          let response: ResponseType;
          
          switch (message.type) {
            case 'START_STREAMING':
              response = await this.startStreaming(message.tabId);
              this.notifyStreamingStateChanged();
              break;
            case 'STOP_STREAMING':
              response = await this.stopStreaming(message.tabId);
              this.notifyStreamingStateChanged();
              break;
            case 'GET_STREAMING_STATE':
              response = { success: true, state: this.state };
              break;
            case 'GET_TABS':
              const tabs = await this.getAvailableTabs();
              response = { success: true, tabs };
              break;
            case 'CONNECT_DESKTOP':
              const connectionState = await this.wsService.connect();
              response = { success: true, connection: connectionState };
              break;
            case 'DISCONNECT_DESKTOP':
              this.wsService.disconnect();
              response = { success: true };
              break;
            default:
              response = { success: false, error: 'Unknown message type' };
          }
          
          sendResponse(response);
        } catch (error) {
          console.error('Error handling message:', error);
          sendResponse({ success: false, error: String(error) });
        }
      })();

      return true; // Keep the message channel open for async response
    });

    chrome.action.onClicked.addListener((tab: chrome.tabs.Tab) => {
      if (tab.windowId !== undefined) {
        chrome.sidePanel.open({ windowId: tab.windowId });
      }
    });
  }

  private async startStreaming(tabId: number): Promise<ResponseType> {
    try {
      console.log(`[AudioCapture] Starting streaming for tab ${tabId}`);
      if (this.state.isStreaming) {
        throw new Error('Already streaming audio');
      }

      // Get the tab info
      const tab = await chrome.tabs.get(tabId);
      if (!tab) {
        throw new Error('Tab not found');
      }
      console.log(`[AudioCapture] Found tab: ${tab.title}`);

      // Request tab audio capture
      console.log('[AudioCapture] Requesting tab audio capture...');
      const stream = await new Promise<MediaStream>((resolve, reject) => {
        chrome.tabCapture.capture({
          audio: true,
          video: false
        }, (stream) => {
          if (chrome.runtime.lastError) {
            console.error('[AudioCapture] Tab capture error:', chrome.runtime.lastError);
            reject(chrome.runtime.lastError);
          } else if (!stream) {
            console.error('[AudioCapture] No stream received from tab capture');
            reject(new Error('Failed to capture tab audio'));
          } else {
            console.log('[AudioCapture] Successfully captured tab audio stream');
            resolve(stream);
          }
        });
      });

      if (!stream || stream.getTracks().length === 0) {
        console.error('[AudioCapture] Stream or tracks are empty');
        throw new Error('Failed to capture tab audio');
      }
      console.log(`[AudioCapture] Stream has ${stream.getTracks().length} tracks`);

      // Setup audio processing with configured values
      console.log('[AudioCapture] Setting up audio processing...');
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(
        this.wsService.getAudioConfig().bufferSize,
        this.wsService.getAudioConfig().channels,
        this.wsService.getAudioConfig().channels
      );
      console.log(`[AudioCapture] Created processor with buffer size: ${this.wsService.getAudioConfig().bufferSize}, channels: ${this.wsService.getAudioConfig().channels}`);

      // Process audio data
      let chunkCount = 0;
      processor.onaudioprocess = (e) => {
        const audioData = e.inputBuffer.getChannelData(0);
        console.log(`[AudioCapture] Raw audio data length: ${audioData.length}`);

        // Check if audio data contains non-zero values
        let hasSound = false;
        let maxValue = 0;
        let minValue = 0;
        let sum = 0;

        for (let i = 0; i < audioData.length; i++) {
          const value = audioData[i];
          if (value !== 0) hasSound = true;
          maxValue = Math.max(maxValue, value);
          minValue = Math.min(minValue, value);
          sum += Math.abs(value);
        }

        const avgLevel = sum / audioData.length;
        console.log(`[AudioCapture] Audio data stats - hasSound: ${hasSound}, min: ${minValue}, max: ${maxValue}, avg: ${avgLevel.toFixed(4)}`);

        // Create Float32Array from audio data
        const audioArray = new Float32Array(audioData);
        const audioBuffer = audioArray.buffer;
        console.log(`[AudioCapture] Created audio buffer, size: ${audioBuffer.byteLength} bytes`);

        // Only send if we actually have sound
        if (hasSound) {
          console.log(`[AudioCapture] Attempting to send audio chunk #${chunkCount} via WebSocket`);
          try {
            this.wsService.sendAudioChunk(audioBuffer);
            console.log(`[AudioCapture] Successfully sent audio chunk #${chunkCount}`);
          } catch (error) {
            console.error(`[AudioCapture] Failed to send audio chunk #${chunkCount}:`, error);
          }
        } else {
          console.log(`[AudioCapture] Skipping silent audio chunk #${chunkCount}`);
        }
        chunkCount++;
      };

      // Connect the audio nodes
      console.log('[AudioCapture] Connecting audio nodes...');
      source.connect(processor);
      processor.connect(audioContext.destination);

      // Update state with the new stream
      this.state = {
        isStreaming: true,
        activeTabId: tabId,
        stream
      };
      console.log('[AudioCapture] Streaming started successfully');

      return { success: true, stream };
    } catch (error) {
      console.error('[AudioCapture] Error starting streaming:', error);
      return { success: false, error: String(error) };
    }
  }

  private async stopStreaming(tabId: number): Promise<ResponseType> {
    try {
      if (!this.state.isStreaming || this.state.activeTabId !== tabId) {
        throw new Error('No active streaming for this tab');
      }

      if (this.state.stream) {
        // Stop all tracks and clean up audio context
        this.state.stream.getTracks().forEach(track => track.stop());
        if (this.audioContext) {
          this.audioContext.close();
          this.audioContext = null;
        }
      }

      this.state = {
        isStreaming: false,
        activeTabId: null,
        stream: null
      };

      return { success: true };
    } catch (error) {
      console.error('Error stopping streaming:', error);
      return { success: false, error: String(error) };
    }
  }

  private async getAvailableTabs(): Promise<TabInfo[]> {
    const tabs = await chrome.tabs.query({ audible: true });
    const tabList = tabs.map(tab => ({
      id: tab.id!,
      title: tab.title || 'Unnamed Tab',
      url: tab.url || '',
    }));
    return tabList;
  }

  private async updateAvailableTabs(): Promise<void> {
    const tabs = await this.getAvailableTabs();
    chrome.runtime.sendMessage({
      type: 'TABS_UPDATED',
      tabs: tabs
    });
  }

  private notifyStreamingStateChanged(): void {
    chrome.runtime.sendMessage({
      type: 'STREAMING_STATE_CHANGED',
      state: this.state
    });
  }
}

// Initialize the manager
new AudioCaptureManager();
