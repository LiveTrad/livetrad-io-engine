import { AudioService } from '../services/audio';
import { ConnectionState, AudioSource } from '../types';
import { defaultConfig, audioSourceDomains } from '../config/audio.config';

type FilterType = 'all' | 'with-audio' | 'without-audio';

class Sidebar {
    private audioService: AudioService;
    private streaming: boolean = false;
    private currentFilter: FilterType = 'all';
    private currentSources: AudioSource[] = [];
    private showAllTabs: boolean = defaultConfig.showAllTabs;
    private selectedTabId: string | null = null;
    private connectionState: ConnectionState = { status: 'disconnected', desktopUrl: 'ws://localhost:8081' };

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
        filterButtons: document.querySelectorAll('.filter-button') as NodeListOf<HTMLButtonElement>,
        showAllTabsCheckbox: document.getElementById('showAllTabs') as HTMLInputElement
    };

    constructor() {
        // Vérifier que tous les éléments sont trouvés
        for (const [key, element] of Object.entries(this.elements)) {
            if (!element) {
                console.error(`Element not found: ${key}`);
            }
        }

        this.audioService = new AudioService();
        this.initializeEventListeners();
        this.initializeIntersectionObserver();

        this.elements.showAllTabsCheckbox.checked = this.showAllTabs;
        this.elements.showAllTabsCheckbox.addEventListener('change', (e) => {
            this.showAllTabs = (e.target as HTMLInputElement).checked;
            this.updateSourcesList();
        });
    }

    private initializeEventListeners() {
        // WebRTC connection events
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
        this.updateConnectionStatus(this.connectionState);
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

    private showError(message: string, isFatal: boolean = false) {
        // Créer ou mettre à jour le message d'erreur
        let errorElement = document.getElementById('errorMessage');
        if (!errorElement) {
            errorElement = document.createElement('div');
            errorElement.id = 'errorMessage';
            errorElement.className = 'error-message';
            this.elements.streamingSection.insertAdjacentElement('beforebegin', errorElement);
        }
        
        errorElement.innerHTML = `
            <div class="error-content">
                <span class="material-icons-round error-icon">error_outline</span>
                <span class="error-text">${message}</span>
                ${isFatal ? '' : '<button class="dismiss-error">×</button>'}
            </div>
        `;
        
        // Ajouter un gestionnaire d'événements pour le bouton de fermeture
        const dismissButton = errorElement.querySelector('.dismiss-error');
        if (dismissButton) {
            dismissButton.addEventListener('click', () => {
                errorElement?.remove();
            });
        }
        
        // Supprimer automatiquement après 10 secondes pour les erreurs non fatales
        if (!isFatal) {
            setTimeout(() => {
                errorElement?.remove();
            }, 10000);
        }
    }
    
    private clearError() {
        const errorElement = document.getElementById('errorMessage');
        if (errorElement) {
            errorElement.remove();
        }
    }

    private updateConnectionStatus(state: ConnectionState) {
        this.connectionState = state;
        
        // Mettre à jour l'interface utilisateur en fonction de l'état de la connexion
        const { statusDot, statusText, connectButton, connectButtonText } = this.elements;
        
        if (!statusDot || !statusText || !connectButton || !connectButtonText) {
            console.error('One or more required elements are missing');
            return;
        }
        
        switch (state.status) {
            case 'connected':
                statusDot.style.backgroundColor = '#22c55e';
                statusText.textContent = 'Connected';
                connectButtonText.textContent = 'Disconnect';
                connectButton.classList.remove('connecting');
                break;
                
            case 'connecting':
                statusDot.style.backgroundColor = '#f59e0b';
                statusText.textContent = 'Connecting...';
                connectButtonText.textContent = 'Connecting...';
                break;
                
            case 'disconnected':
            default:
                statusDot.style.backgroundColor = '#ef4444';
                statusText.textContent = 'Disconnected';
                connectButtonText.textContent = 'Connect';
                connectButton.classList.remove('connecting');
                break;
        }
        
        // Mettre à jour l'état du bouton de streaming
        this.updateStreamingButtonState();
    }

    private async handleConnectionClick() {
        const button = this.elements.connectButton;
        this.clearError(); // Effacer les erreurs précédentes

        if (!button || !this.elements.connectButtonText) {
            console.error('Required elements for connection handling are missing');
            return;
        }

        if (this.connectionState.status === 'connected') {
            // Déconnexion
            button.classList.add('disconnecting');
            this.elements.connectButtonText.textContent = 'Disconnecting...';
            
            try {
                const response = await chrome.runtime.sendMessage({ type: 'DISCONNECT_DESKTOP' });
                if (response?.success) {
                    this.connectionState = { status: 'disconnected', desktopUrl: 'ws://localhost:8081' };
                    this.updateConnectionStatus(this.connectionState);
                } else {
                    const errorMessage = response?.error || 'Unknown error';
                    this.showError(`Failed to disconnect: ${errorMessage}`, false);
                }
            } catch (error) {
                console.error('Disconnection error:', error);
                this.showError('An error occurred while disconnecting. Please try again.', false);
            } finally {
                button.classList.remove('disconnecting');
            }
        } else {
            // Connexion
            button.classList.add('connecting');
            this.elements.connectButtonText.textContent = 'Connecting...';
            
            try {
                const response = await chrome.runtime.sendMessage({ type: 'CONNECT_DESKTOP' });
                
                if (!response) {
                    throw new Error('No response from background script');
                }
                
                if (response.success) {
                    // Connexion réussie
                    this.connectionState = {
                        status: 'connected',
                        desktopUrl: response.data?.desktopUrl || 'ws://localhost:8081'
                    };
                    this.updateConnectionStatus(this.connectionState);
                } else {
                    // Échec de la connexion avec un message d'erreur
                    const errorMessage = response.error || 'Failed to connect to desktop application';
                    this.showError(`Connection failed: ${errorMessage}`, false);
                }
            } catch (error) {
                console.error('Connection error:', error);
                this.showError('An error occurred while connecting. Please try again.', false);
            } finally {
                if (this.connectionState.status !== 'connected' && this.elements.connectButtonText) {
                    this.elements.connectButtonText.textContent = 'Connect';
                    button.classList.remove('connecting');
                }
            }
        }
    }

    private updateSourcesList() {
        chrome.tabs.query({}, async (tabs) => {
            let filteredTabs = tabs;
            
            // Si la case n'est PAS cochée, on applique le filtre restrictif
            if (!this.showAllTabs) {
                filteredTabs = tabs.filter(tab => {
                    const url = tab.url || '';
                    return audioSourceDomains.some(domain => url.includes(domain)) || tab.audible;
                });
            }
    
            // Mise à jour de l'affichage selon le filtre actuel
            if (this.currentFilter === 'with-audio') {
                filteredTabs = filteredTabs.filter(tab => tab.audible);
            } else if (this.currentFilter === 'without-audio') {
                filteredTabs = filteredTabs.filter(tab => !tab.audible);
            }
    
            const sourcesList = this.elements.sourcesList;
            if (!sourcesList) return;
    
            sourcesList.innerHTML = '';
            filteredTabs.forEach(tab => {
                const sourceItem = document.createElement('div');
                sourceItem.className = 'source-item';
                if (tab.audible) sourceItem.classList.add('has-audio');
                if (tab.id === Number(this.selectedTabId)) sourceItem.classList.add('selected');
                
                // Disable selection if streaming is active and this is not the current streaming source
                if (this.streaming && tab.id !== Number(this.selectedTabId)) {
                    sourceItem.classList.add('disabled');
                }
    
                // Ajouter le radio indicator
                const radioIndicator = document.createElement('span');
                radioIndicator.className = 'radio-indicator';
                sourceItem.appendChild(radioIndicator);
    
                // Favicon ou icône par défaut
                const favicon = document.createElement('img');
                favicon.src = tab.favIconUrl || 'default-icon.png';
                favicon.className = 'source-icon';
                favicon.onerror = () => {
                    favicon.outerHTML = '<span class="source-icon material-icons-round">tab</span>';
                };
                sourceItem.appendChild(favicon);
    
                // Titre de l'onglet
                const titleSpan = document.createElement('span');
                titleSpan.className = 'source-title';
                titleSpan.textContent = tab.title || 'Sans titre';
                sourceItem.appendChild(titleSpan);
    
                // Gestion de la sélection
                sourceItem.addEventListener('click', async () => {
                    if (!tab.id) return;

                    // If streaming is active and trying to select a different source
                    if (this.streaming && tab.id !== Number(this.selectedTabId)) {
                        this.elements.statusMessage.textContent = 'Please stop the current stream before selecting a new source';
                        return;
                    }

                    // Désélectionner l'ancien
                    const oldSelected = sourcesList.querySelector('.selected');
                    if (oldSelected) {
                        oldSelected.classList.remove('selected');
                    }

                    // Sélectionner le nouveau
                    sourceItem.classList.add('selected');
                    this.selectedTabId = String(tab.id);
                    this.audioService.selectSource(String(tab.id));
                    this.updateStreamingButtonState();
                });
    
                sourcesList.appendChild(sourceItem);
            });
    
            // Update source count
            if (this.elements.sourceCount) {
                this.elements.sourceCount.textContent = `${filteredTabs.length} source${filteredTabs.length !== 1 ? 's' : ''}`;
            }
    
            // Mise à jour du message si aucune source
            const noSourcesMessage = this.elements.noSourcesMessage;
            if (noSourcesMessage) {
                noSourcesMessage.style.display = filteredTabs.length === 0 ? 'block' : 'none';
            }
        });
    }

    private async updateStreamingButtonState() {
        const selectedSource = this.audioService.getSelectedSource();
        console.log("Selected Source is: ", selectedSource);
        const canStream = this.connectionState.status === 'connected' && selectedSource !== null;

        // Enable streaming for any selected source when connected
        this.elements.startStreamingButton.disabled = !canStream;

        if (!canStream) {
            this.elements.startStreamingButton.innerHTML = `
                <span class="button-icon">🎙️</span>
                Start Streaming
            `;
            this.elements.statusMessage.textContent = selectedSource
                ? 'Connect to start streaming'
                : 'Select a source and connect to start streaming';
            this.elements.streamingStatus.classList.remove('streaming-active');
        } else if (this.streaming && this.selectedTabId) {
            // Get the current streaming tab's title
            try {
                const streamingTab = await chrome.tabs.get(Number(this.selectedTabId));
                this.elements.startStreamingButton.innerHTML = `
                    <span class="button-icon">⏹️</span>
                    Stop Streaming (${streamingTab.title || 'Unknown'})
                `;
                this.elements.statusMessage.textContent = 'Streaming active';
                this.elements.streamingStatus.classList.add('streaming-active');
            } catch (error) {
                console.error('Error getting streaming tab info:', error);
                this.elements.statusMessage.textContent = 'Error retrieving streaming tab information';
                this.elements.startStreamingButton.innerHTML = `
                    <span class="button-icon">⏹️</span>
                    Stop Streaming
                `;
                this.elements.streamingStatus.classList.add('streaming-active');
            }
        } else {
            this.elements.startStreamingButton.innerHTML = `
                <span class="button-icon">🎙️</span>
                Start Streaming
            `;
            this.elements.statusMessage.textContent = 'Ready to stream';
            this.elements.streamingStatus.classList.remove('streaming-active');
        }
    }

    private async toggleStreaming() {
        if (!this.selectedTabId) return;

        try {
            // Check if we're trying to capture a restricted page
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            const currentTab = tabs[0];
            const restrictedUrls = ['chrome://', 'chrome-extension://', 'edge://', 'about:'];
            
            if (currentTab && currentTab.url && restrictedUrls.some(prefix => currentTab.url?.startsWith(prefix))) {
                throw new Error('This page cannot be captured due to browser security restrictions. Please select a different tab.');
            }

            if (this.streaming) {
                // Stop streaming
                const response = await chrome.runtime.sendMessage({ 
                    type: 'STOP_STREAMING', 
                    tabId: Number(this.selectedTabId) 
                });
                if (!response.success) {
                    throw new Error(response.error);
                }
                this.streaming = false;
                this.elements.startStreamingButton.innerHTML = `
                    <span class="button-icon">🎙️</span>
                    Start Streaming
                `;
                this.elements.statusMessage.textContent = 'Streaming stopped';
                this.elements.streamingStatus.classList.remove('streaming-active');
            } else {
                // Get the selected tab information
                const selectedTab = await chrome.tabs.get(Number(this.selectedTabId));
                
                // Check if the selected tab is loaded
                if (!selectedTab.url || selectedTab.status !== 'complete') {
                    throw new Error('Please wait for the tab to finish loading before capturing audio.');
                }

                // Check if we're trying to capture a restricted URL
                if (restrictedUrls.some(prefix => selectedTab.url?.startsWith(prefix))) {
                    throw new Error('This page cannot be captured due to browser security restrictions. Please select a different tab.');
                }

                // Inform user about tab switching
                const activeTab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
                if (selectedTab.id !== activeTab.id) {
                    this.elements.statusMessage.textContent = 'Switching to the selected tab (required for audio capture)...';
                }

                // Activate the tab and wait for it to be ready
                try {
                    await chrome.tabs.update(Number(this.selectedTabId), { active: true });
                    // Wait for the tab to be fully activated
                    await new Promise(resolve => setTimeout(resolve, 500));
                } catch (error) {
                    console.warn('Failed to activate tab:', error);
                    throw new Error('Failed to activate the selected tab. Please try again.');
                }

                // Start streaming directly via background script
                const startResponse = await chrome.runtime.sendMessage({ 
                    type: 'START_STREAMING', 
                    tabId: Number(this.selectedTabId)
                });
                if (!startResponse.success) {
                    throw new Error(startResponse.error);
                }
                this.streaming = true;
                this.elements.startStreamingButton.innerHTML = `
                    <span class="button-icon">⏹️</span>
                    Stop Streaming
                `;
                this.elements.statusMessage.textContent = 'Streaming active';
                this.elements.streamingStatus.classList.add('streaming-active');
            }
        } catch (error) {
            console.error('Streaming error:', error);
            this.elements.statusMessage.textContent = `Failed to ${this.streaming ? 'stop' : 'start'} streaming: ${(error as Error).message}`;
            // Reset streaming state if we failed to start
            if (!this.streaming) {
                this.elements.startStreamingButton.innerHTML = `
                    <span class="button-icon">🎙️</span>
                    Start Streaming
                `;
                this.elements.streamingStatus.classList.remove('streaming-active');
            }
        }
    }
}

// Initialize the sidebar
new Sidebar();