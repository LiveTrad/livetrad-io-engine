import { TabInfo, AudioCaptureState, ConnectionState } from '../types';
import { WebSocketService } from '../services/websocket';
import { AudioService, AudioSource } from '../services/audio';
import { defaultWebSocketConfig } from '../config/websocket.config';

class AudioCaptureSidebar {
  private selectedTabId: number | null = null;
  private isStreaming: boolean = false;
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private wsService: WebSocketService;
  private audioService: AudioService;

  private elements = {
    tabsList: document.getElementById('tabsList') as HTMLDivElement,
    tabCount: document.getElementById('tabCount') as HTMLSpanElement,
    streamingStatus: document.getElementById('streamingStatus') as HTMLDivElement,
    connectionIndicator: document.getElementById('connectionIndicator') as HTMLDivElement,
    connectionText: document.getElementById('connectionText') as HTMLSpanElement,
    statusMessage: document.getElementById('statusMessage') as HTMLSpanElement,
    connectButton: document.getElementById('connectButton') as HTMLButtonElement,
    connectButtonText: document.getElementById('connectButtonText') as HTMLSpanElement,
    connectionDetails: document.getElementById('connectionDetails') as HTMLElement,
    detailStatus: document.getElementById('detailStatus') as HTMLElement,
    detailUrl: document.getElementById('detailUrl') as HTMLElement,
    detailLastEvent: document.getElementById('detailLastEvent') as HTMLElement,
    sourcesList: document.getElementById('sourcesList') as HTMLElement,
    sourceCount: document.getElementById('sourceCount') as HTMLElement,
  };

  constructor() {
    this.wsService = new WebSocketService(defaultWebSocketConfig);
    this.audioService = new AudioService();
    this.initializeEventListeners();
    this.refreshTabs();
    this.initializeUI();
    this.initAudioSources();
  }

  private initializeEventListeners() {
    // Existing event listeners...
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'connection_state') {
        this.updateConnectionStatus(message.state);
      }
    });

    // Listen for audio sources changes
    this.audioService.on('sources-changed', (sources: AudioSource[]) => {
      this.updateSourcesList(sources);
    });

    // Setup WebSocket connection button
    this.elements.connectButton.addEventListener('click', async () => {
      try {
        const currentState = this.wsService.getConnectionState();
        if (currentState.status === 'connected') {
          this.wsService.disconnect();
          this.updateConnectionStatus(this.wsService.getConnectionState());
        } else {
          const newState = await this.wsService.connect();
          this.updateConnectionStatus(newState);
        }
      } catch (error) {
        console.error('Connection error:', error);
        this.updateConnectionStatus({
          status: 'disconnected',
          desktopUrl: this.wsService.getConnectionState().desktopUrl
        });
      }
    });

    // Initial connection status
    this.updateConnectionStatus(this.wsService.getConnectionState());
  }

  private async refreshTabs() {
    try {
      const tabs = await chrome.runtime.sendMessage({ type: 'get_tabs' });
      this.updateTabsList(tabs);
    } catch (error) {
      console.error('Failed to get tabs:', error);
    }
  }

  private updateTabsList(tabs: TabInfo[]) {
    const { tabsList, tabCount } = this.elements;
    tabsList.innerHTML = '';
    tabCount.textContent = `${tabs.length} sources`;

    tabs.forEach((tab) => {
      const tabElement = document.createElement('div');
      tabElement.className = 'tab-item';
      tabElement.innerHTML = `
        <div class="tab-content">
          <img src="${tab.favIconUrl || 'default-favicon.png'}" alt="Tab icon" class="tab-icon">
          <span class="tab-title">${tab.title}</span>
        </div>
        <button class="stream-button ${this.selectedTabId === tab.id ? 'streaming' : ''}">
          ${this.selectedTabId === tab.id ? 'Stop' : 'Stream'}
        </button>
      `;

      const streamButton = tabElement.querySelector('.stream-button') as HTMLButtonElement;
      streamButton.addEventListener('click', () => this.handleStreamToggle(tab));

      tabsList.appendChild(tabElement);
    });

    this.animateTabCount();
  }

  private async handleStreamToggle(tab: TabInfo) {
    if (this.selectedTabId === tab.id) {
      // Stop streaming
      await this.stopStreaming(tab.id);
    } else {
      // Start streaming
      await this.startStreaming(tab);
    }
    this.refreshTabs();
  }

  private async startStreaming(tab: TabInfo) {
    try {
      await chrome.runtime.sendMessage({
        type: 'start_streaming',
        tabId: tab.id
      });
      this.selectedTabId = tab.id;
      this.isStreaming = true;
      this.updateStreamingStatus('Streaming audio from: ' + tab.title);
    } catch (error) {
      console.error('Failed to start streaming:', error);
      this.updateStreamingStatus('Failed to start streaming');
    }
  }

  private async stopStreaming(tabId: number) {
    try {
      await chrome.runtime.sendMessage({
        type: 'stop_streaming',
        tabId
      });
      this.selectedTabId = null;
      this.isStreaming = false;
      this.updateStreamingStatus('Streaming stopped');
    } catch (error) {
      console.error('Failed to stop streaming:', error);
    }
  }

  private updateStreamingStatus(message: string) {
    const { statusMessage } = this.elements;
    statusMessage.textContent = message;
  }

  private animateTabCount() {
    const badge = this.elements.tabCount;
    badge.style.transform = 'scale(1.1)';
    setTimeout(() => {
      badge.style.transform = 'scale(1)';
    }, 200);
  }

  private initializeUI(): void {
    this.elements.connectButton.addEventListener('click', async () => {
      if (this.wsService.getConnectionState().status === 'connected') {
        // Disconnect
        this.updateLastEvent('Disconnecting from desktop app...');
        this.elements.connectButton.classList.add('disconnecting');
        this.elements.connectButtonText.textContent = 'Disconnecting...';
        this.wsService.disconnect();
        this.updateConnectionStatus({ status: 'disconnected', desktopUrl: '' });
      } else {
        // Connect
        this.updateLastEvent('Connecting to desktop app...');
        this.elements.connectButton.classList.add('connecting');
        this.elements.connectButtonText.textContent = 'Connecting...';
        
        try {
          const state = await this.wsService.connect();
          this.updateConnectionStatus(state);
          this.updateLastEvent('Connected successfully');
        } catch (err) {
          const error = err as Error;
          this.updateLastEvent(`Connection failed: ${error.message}`);
          this.updateConnectionStatus({ status: 'disconnected', desktopUrl: '' });
        }
      }
    });

    // Initial state update
    this.updateConnectionStatus(this.wsService.getConnectionState());
  }

  private updateConnectionStatus(state: ConnectionState): void {
    const isConnected = state.status === 'connected';
    const { connectButton, connectButtonText, connectionText, connectionDetails, detailStatus, detailUrl } = this.elements;
    const statusDot = document.querySelector('.status-dot') as HTMLElement;

    // Update connection indicator
    connectionText.textContent = state.status;
    statusDot.className = 'status-dot ' + state.status;

    // Update button state
    connectButton.classList.remove('connecting', 'disconnecting');
    connectButtonText.textContent = isConnected ? 'Disconnect' : 'Connect';

    // Update details
    detailStatus.textContent = state.status;
    detailUrl.textContent = state.desktopUrl || '-';
    connectionDetails.style.display = isConnected ? 'block' : 'none';

    this.updateLastEvent(`Connection status changed to: ${state.status}`);
  }

  private updateLastEvent(event: string): void {
    this.elements.detailLastEvent.textContent = event;
    console.log('Event:', event);
  }

  private initAudioSources() {
    // Initial connection status
    this.updateConnectionStatus(this.wsService.getConnectionState());
  }

  private updateSourcesList(sources: AudioSource[]) {
    // Update source count
    this.elements.sourceCount.textContent = `${sources.length} sources`;

    // Clear current list
    this.elements.sourcesList.innerHTML = '';

    if (sources.length === 0) {
      const noSourcesDiv = document.createElement('div');
      noSourcesDiv.className = 'no-sources-message';
      noSourcesDiv.innerHTML = `
        <i class="info-icon">ℹ</i>
        <span>No audio sources detected</span>
      `;
      this.elements.sourcesList.appendChild(noSourcesDiv);
      return;
    }

    // Add each source to the list
    sources.forEach(source => {
      const li = document.createElement('li');
      li.className = 'source-item';
      if (source.id === this.audioService.getSelectedSource()?.id) {
        li.classList.add('selected');
      }

      li.innerHTML = `
        <span class="source-icon">🔊</span>
        <span class="source-title">${source.title}</span>
      `;

      li.addEventListener('click', () => {
        // Remove selected class from all items
        this.elements.sourcesList.querySelectorAll('.source-item').forEach(item => {
          item.classList.remove('selected');
        });
        
        // Add selected class to clicked item
        li.classList.add('selected');
        
        // Select the source
        this.audioService.selectSource(source.id);
      });

      this.elements.sourcesList.appendChild(li);
    });
  }
}

// Initialize the sidebar
new AudioCaptureSidebar();
