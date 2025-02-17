import { WebSocketService } from '../services/websocket';
import { AudioService } from '../services/audio';
import { defaultWebSocketConfig } from '../config/websocket.config';
import { ConnectionState, AudioSource } from '../types';

type FilterType = 'all' | 'with-audio' | 'without-audio';

class Sidebar {
    private wsService: WebSocketService;
    private audioService: AudioService;
    private streaming: boolean = false;
    private currentFilter: FilterType = 'all';
    private currentSources: AudioSource[] = [];

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
        statusMessage: document.getElementById('statusMessage') as HTMLElement,
        streamingSection: document.querySelector('.streaming-section') as HTMLElement,
        sourcesContainer: document.querySelector('.sources-container') as HTMLElement,
        filterButtons: document.querySelectorAll('.filter-button') as NodeListOf<HTMLButtonElement>
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
        this.initializeIntersectionObserver();
    }

    private initializeEventListeners() {
        // WebSocket connection events
        this.elements.connectButton.addEventListener('click', this.handleConnectionClick.bind(this));

        // Audio source selection events
        this.audioService.on('sources-changed', (sources: AudioSource[]) => {
            this.currentSources = sources;
            this.updateSourcesList();
        });

        // Streaming control events
        this.elements.startStreamingButton.addEventListener('click', this.toggleStreaming.bind(this));

        // Filter events
        this.elements.filterButtons.forEach(button => {
            button.addEventListener('click', () => {
                const filter = button.dataset.filter as FilterType;
                this.setFilter(filter);
            });
        });

        // Initial states
        this.updateConnectionStatus(this.wsService.getConnectionState());
    }

    private initializeIntersectionObserver() {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (!entry.isIntersecting) {
                        this.elements.streamingSection.classList.add('fixed');
                    } else {
                        this.elements.streamingSection.classList.remove('fixed');
                    }
                });
            },
            {
                root: null,
                threshold: 1.0
            }
        );

        // Observer le bas de la liste des sources
        observer.observe(this.elements.sourcesContainer);
    }

    private setFilter(filter: FilterType) {
        this.currentFilter = filter;
        
        // Update filter buttons
        this.elements.filterButtons.forEach(button => {
            if (button.dataset.filter === filter) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        });

        this.updateSourcesList();
    }

    private filterSources(sources: AudioSource[]): AudioSource[] {
        switch (this.currentFilter) {
            case 'with-audio':
                return sources.filter(source => source.isAudible);
            case 'without-audio':
                return sources.filter(source => !source.isAudible);
            default:
                return sources;
        }
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
        
        this.updateStreamingButtonState();
    }

    private updateSourcesList() {
        if (!this.elements.sourceCount || !this.elements.sourcesList) {
            console.error('Required elements not found');
            return;
        }

        const filteredSources = this.filterSources(this.currentSources);
        this.elements.sourceCount.textContent = `${filteredSources.length} sources`;
        this.elements.sourcesList.innerHTML = '';

        if (filteredSources.length === 0) {
            this.elements.noSourcesMessage.style.display = 'flex';
            this.elements.sourcesList.style.display = 'none';
            this.updateStreamingButtonState();
            return;
        }

        this.elements.noSourcesMessage.style.display = 'none';
        this.elements.sourcesList.style.display = 'block';

        filteredSources.forEach(source => {
            const li = document.createElement('li');
            li.className = 'source-item';
            
            // Add classes based on source state
            if (source.id === this.audioService.getSelectedSource()?.id) {
                li.classList.add('selected');
            }
            if (source.isAudible) {
                li.classList.add('has-audio');
            }
            if (source.isLocked) {
                li.classList.add('locked');
            }

            const favicon = source.favIconUrl ? 
                `<img src="${source.favIconUrl}" alt="" class="source-icon" />` :
                '<span class="source-icon">🔊</span>';

            const isSelected = source.id === this.audioService.getSelectedSource()?.id;

            li.innerHTML = `
                ${favicon}
                <span class="source-title">${source.title}</span>
                <div class="source-actions">
                    <button class="action-button ${source.isLocked ? 'locked' : ''}" 
                            data-action="lock"
                            ${!isSelected ? 'disabled' : ''}>
                        <span class="material-icons-round">${source.isLocked ? 'lock' : 'lock_open'}</span>
                    </button>
                </div>
            `;

            // Source selection
            li.addEventListener('click', (e) => {
                const target = e.target as HTMLElement;
                // Ne pas sélectionner si on clique sur un bouton d'action
                if (target.closest('.source-actions')) return;

                this.elements.sourcesList.querySelectorAll('.source-item').forEach(item => {
                    item.classList.remove('selected');
                });
                li.classList.add('selected');
                this.audioService.selectSource(source.id);
                this.updateSourcesList(); // Mettre à jour pour activer/désactiver les boutons de lock
                this.updateStreamingButtonState();
            });

            // Lock button
            const lockButton = li.querySelector('[data-action="lock"]') as HTMLButtonElement;
            if (lockButton) {
                lockButton.addEventListener('click', (e) => {
                    e.stopPropagation(); // Empêcher la sélection de la source
                    if (isSelected) {
                        this.audioService.toggleSourceLock(source.id);
                    }
                });
            }

            this.elements.sourcesList.appendChild(li);
        });
    }

    private updateStreamingButtonState() {
        const selectedSource = this.audioService.getSelectedSource();
        const canStream = this.wsService.getConnectionState().status === 'connected' 
            && selectedSource !== null;

        this.elements.startStreamingButton.disabled = !canStream;
        
        if (!canStream) {
            this.elements.startStreamingButton.innerHTML = `
                <span class="button-icon">🎙️</span>
                Start Streaming
            `;
            this.elements.statusMessage.textContent = selectedSource ? 
                'Connect to start streaming' : 
                'Select a source and connect to start streaming';
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
