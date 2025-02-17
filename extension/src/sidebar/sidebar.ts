import { WebSocketService } from '../services/websocket';
import { AudioService, AudioSource } from '../services/audio';
import { defaultWebSocketConfig } from '../config/websocket.config';
import { ConnectionState } from '../types';

class Sidebar {
    private wsService: WebSocketService;
    private audioService: AudioService;
    private streaming: boolean = false;

    private elements = {
        connectButton: document.getElementById('connectButton') as HTMLButtonElement,
        connectButtonText: document.getElementById('connectButtonText') as HTMLElement,
        statusDot: document.querySelector('.status-dot') as HTMLElement,
        statusText: document.querySelector('.status-text') as HTMLElement,
        sourcesList: document.getElementById('sourcesList') as HTMLElement,
        sourceCount: document.getElementById('sourceCount') as HTMLElement,
        noSourcesMessage: document.getElementById('noSourcesMessage') as HTMLElement,
        startStreamingButton: document.getElementById('startStreamingButton') as HTMLButtonElement,
        streamingStatus: document.getElementById('streamingStatus') as HTMLElement,
        statusMessage: document.getElementById('statusMessage') as HTMLElement
    };

    constructor() {
        // Vérifier que tous les éléments sont trouvés
        for (const [key, element] of Object.entries(this.elements)) {
            if (!element) {
                console.error(`Element not found: ${key}`);
            }
        }

        this.wsService = new WebSocketService(defaultWebSocketConfig);
        this.audioService = new AudioService();
        this.initializeEventListeners();
    }

    private initializeEventListeners() {
        // WebSocket connection events
        this.elements.connectButton.addEventListener('click', this.handleConnectionClick.bind(this));

        // Audio source selection events
        this.audioService.on('sources-changed', (sources: AudioSource[]) => {
            this.updateSourcesList(sources);
        });

        // Streaming control events
        this.elements.startStreamingButton.addEventListener('click', this.toggleStreaming.bind(this));

        // Initial states
        this.updateConnectionStatus(this.wsService.getConnectionState());
    }

    private async handleConnectionClick() {
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
    }

    private updateConnectionStatus(state: ConnectionState) {
        const isConnected = state.status === 'connected';
        
        this.elements.statusDot.className = `status-dot ${state.status}`;
        this.elements.statusText.textContent = state.status;
        this.elements.connectButtonText.textContent = isConnected ? 'Disconnect' : 'Connect';
        
        // Update streaming button state
        this.updateStreamingButtonState();
    }

    private updateSourcesList(sources: AudioSource[]) {
        if (!this.elements.sourceCount || !this.elements.sourcesList) {
            console.error('Required elements not found');
            return;
        }

        this.elements.sourceCount.textContent = `${sources.length} sources`;
        this.elements.sourcesList.innerHTML = '';

        if (sources.length === 0) {
            this.elements.noSourcesMessage.style.display = 'flex';
            this.elements.sourcesList.style.display = 'none';
            this.updateStreamingButtonState();
            return;
        }

        this.elements.noSourcesMessage.style.display = 'none';
        this.elements.sourcesList.style.display = 'block';

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
                this.elements.sourcesList.querySelectorAll('.source-item').forEach(item => {
                    item.classList.remove('selected');
                });
                li.classList.add('selected');
                this.audioService.selectSource(source.id);
                this.updateStreamingButtonState();
            });

            this.elements.sourcesList.appendChild(li);
        });
    }

    private updateStreamingButtonState() {
        const canStream = this.wsService.getConnectionState().status === 'connected' 
            && this.audioService.getSelectedSource() !== null;

        this.elements.startStreamingButton.disabled = !canStream;
        
        if (!canStream) {
            this.elements.startStreamingButton.innerHTML = `
                <span class="button-icon">🎙️</span>
                Start Streaming
            `;
            this.elements.statusMessage.textContent = 'Select a source and connect to start streaming';
            this.elements.streamingStatus.classList.remove('streaming-active');
        }
    }

    private toggleStreaming() {
        if (!this.streaming) {
            // Start streaming
            this.streaming = true;
            this.elements.startStreamingButton.innerHTML = `
                <span class="button-icon">⏹️</span>
                Stop Streaming
            `;
            this.elements.statusMessage.textContent = 'Streaming active';
            this.elements.streamingStatus.classList.add('streaming-active');
        } else {
            // Stop streaming
            this.streaming = false;
            this.elements.startStreamingButton.innerHTML = `
                <span class="button-icon">🎙️</span>
                Start Streaming
            `;
            this.elements.statusMessage.textContent = 'Streaming stopped';
            this.elements.streamingStatus.classList.remove('streaming-active');
        }
    }
}

// Initialize the sidebar
new Sidebar();
