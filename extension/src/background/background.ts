import { AudioCaptureState, MessageType, ResponseType, TabInfo } from '../types';
import { WebSocketService } from '../services/websocket';

class AudioCaptureManager {
  private state: AudioCaptureState = {
    isStreaming: false,
    activeTabId: null,
    stream: null
  };

  private wsService: WebSocketService;

  constructor() {
    this.wsService = new WebSocketService();
    this.initializeListeners();
  }

  private initializeListeners(): void {
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
              break;
            case 'STOP_STREAMING':
              response = await this.stopStreaming(message.tabId);
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
      if (this.state.isStreaming) {
        throw new Error('Already streaming audio');
      }

      // Get the tab info
      const tab = await chrome.tabs.get(tabId);
      if (!tab) {
        throw new Error('Tab not found');
      }

      // Request tab audio capture
      const stream = await new Promise<MediaStream>((resolve, reject) => {
        chrome.tabCapture.capture({
          audio: true,
          video: false
        }, (stream) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else if (!stream) {
            reject(new Error('Failed to capture tab audio'));
          } else {
            resolve(stream);
          }
        });
      });

      if (!stream || stream.getTracks().length === 0) {
        throw new Error('Failed to capture tab audio');
      }

      // Setup audio processing
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      // Process audio data
      processor.onaudioprocess = (e) => {
        const audioData = e.inputBuffer.getChannelData(0);
        const audioArray = new Float32Array(audioData);
        const audioBuffer = audioArray.buffer;
        this.wsService.sendAudioChunk(audioBuffer);
      };

      // Connect the audio nodes
      source.connect(processor);
      processor.connect(audioContext.destination);

      // Update state with the new stream
      this.state = {
        isStreaming: true,
        activeTabId: tabId,
        stream
      };

      return { success: true, stream };
    } catch (error) {
      console.error('Error starting streaming:', error);
      return { success: false, error: String(error) };
    }
  }

  private async stopStreaming(tabId: number): Promise<ResponseType> {
    try {
      if (!this.state.isStreaming || this.state.activeTabId !== tabId) {
        throw new Error('No active streaming for this tab');
      }

      if (this.state.stream) {
        this.state.stream.getTracks().forEach(track => track.stop());
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
    return tabs.map(tab => ({
      id: tab.id!,
      title: tab.title || 'Unnamed Tab',
      url: tab.url || '',
    }));
  }
}

// Initialize the manager
new AudioCaptureManager();
