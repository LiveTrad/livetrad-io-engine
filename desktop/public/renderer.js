// Audio monitoring state
let audioChunksCount = 0;
let lastAudioLevel = 0;
let isPlaying = true; // Par défaut à true pour le démarrage automatique
let isMuted = false;
let volume = 0.8; // Volume par défaut à 80%

// Audio context et visualisation
let audioContext;
let audioVisualizer;
let audioStream;

// Transcription state
let isTranscriptionActive = false;
let transcriptionHistory = [];
const MAX_TRANSCRIPTION_HISTORY = 50;
let currentInterimText = '';
let detectedLanguage = 'Auto';

// Update connection status
function updateStatus(isConnected, details = {}) {
    const statusElement = document.getElementById('status');
    const statsElement = document.getElementById('stats');

    if (isConnected) {
        statusElement.className = 'status connected';
        statusElement.textContent = 'Connected to extension';
        
        // Update stats
        statsElement.innerHTML = `
            <h3>Connection Details</h3>
            <div class="stat-item">
                <strong>Client ID:</strong> ${details.clientId || 'Unknown'}
            </div>
            <div class="stat-item">
                <strong>Connected Since:</strong> ${new Date().toLocaleTimeString()}
            </div>
            <div class="stat-item">
                <strong>Status:</strong> Active
            </div>
        `;
        statsElement.style.display = 'block';
    } else {
        statusElement.className = 'status disconnected';
        statusElement.textContent = 'Waiting for connection...';
        statsElement.style.display = 'none';
        resetAudioMonitor();
    }
}

// Initialize audio context and visualizer
async function initAudioVisualization() {
    try {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }
        
        const dest = audioContext.createMediaStreamDestination();
        audioStream = dest.stream;
        
        if (!audioVisualizer) {
            audioVisualizer = new AudioVisualizer('spectrogram', audioContext);
            const source = audioContext.createMediaStreamSource(audioStream);
            audioVisualizer.connect(source);
            audioVisualizer.start();
        }
        
        console.log('Audio visualization initialized');
        return true;
    } catch (error) {
        console.error('Error initializing audio visualization:', error);
        return false;
    }
}

// Update audio level visualization
function updateAudioLevel(audioData) {
    const levelBar = document.getElementById('audioLevelBar');
    const chunksElement = document.getElementById('audioChunksReceived');
    const averageElement = document.getElementById('averageLevel');
    
    // Mettre à jour le spectrogramme si disponible
    if (audioVisualizer && audioData) {
        // Convertir les données audio en Float32Array pour le traitement
        const float32Array = new Float32Array(audioData.buffer);
        const audioBuffer = audioContext.createBuffer(1, float32Array.length, 44100);
        audioBuffer.getChannelData(0).set(float32Array);
        
        // Créer une source de buffer et la connecter au visualiseur
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        
        // Si le contexte est suspendu (à cause de la politique de lecture automatique), le reprendre
        if (audioContext.state === 'suspended') {
            audioContext.resume().then(() => {
                console.log('AudioContext resumed successfully');
            });
        }
    }
    const statusElement = document.getElementById('streamingStatus');

    // Calculate audio level
    let sum = 0;
    for (let i = 0; i < audioData.length; i++) {
        sum += Math.abs(audioData[i]);
    }
    const averageLevel = sum / audioData.length;
    const normalizedLevel = Math.min(Math.max(averageLevel * 100, 0), 100);

    // Update UI
    levelBar.style.width = `${normalizedLevel}%`;
    audioChunksCount++;
    chunksElement.textContent = `Chunks received: ${audioChunksCount}`;
    averageElement.textContent = `Average level: ${normalizedLevel.toFixed(2)} dB`;
    statusElement.textContent = 'Streaming active';

    lastAudioLevel = normalizedLevel;
}

// Reset audio monitor
function resetAudioMonitor() {
    const levelBar = document.getElementById('audioLevelBar');
    const chunksElement = document.getElementById('audioChunksReceived');
    const averageElement = document.getElementById('averageLevel');
    const statusElement = document.getElementById('streamingStatus');

    levelBar.style.width = '0%';
    audioChunksCount = 0;
    chunksElement.textContent = 'Chunks received: 0';
    averageElement.textContent = 'Average level: 0 dB';
    statusElement.textContent = 'No audio streaming';
}

// Listen for connection changes
window.api.onConnectionChange((status, details) => {
    console.log('Connection status changed:', status, 'details:', details);
    updateStatus(status, details);
});

// Listen for audio data
window.api.onAudioStats((audioData) => {
    console.log('Received audio chunk:', audioData.length, 'samples');
    updateAudioLevel(audioData);
});

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const { status, details } = await window.api.getConnectionStatus();
        updateStatus(status, details);
    } catch (error) {
        console.error('Error getting connection status:', error);
        updateStatus(false);
    }
});

// Check for audio inactivity
setInterval(() => {
    const statusElement = document.getElementById('streamingStatus');
    if (audioChunksCount > 0 && Date.now() - lastAudioUpdate > 5000) {
        statusElement.textContent = 'No audio data received for 5 seconds';
    }
}, 1000);

// Éléments DOM
const volumeSlider = document.getElementById('volumeSlider');
const muteButton = document.getElementById('muteButton');
const volumeValue = document.getElementById('volumeValue');

// Activer le playback au démarrage
async function initializePlayback() {
    try {
        // Activer le playback si ce n'est pas déjà fait
        const status = await window.api.invoke('get-playback-status');
        if (!status.isPlaying) {
            const result = await window.api.invoke('toggle-playback');
            if (result.success) {
                isPlaying = true;
                console.log('Playback started automatically');
            }
        } else {
            isPlaying = true;
        }
        updateVolumeDisplay();
    } catch (error) {
        console.error('Error initializing playback:', error);
    }
}

// Gestionnaire d'événements pour le bouton mute
muteButton.addEventListener('click', async () => {
    try {
        isMuted = !isMuted;
        updateVolumeDisplay();
        
        // Mettre à jour le volume dans le processus principal
        const volumeToSet = isMuted ? 0 : volume;
        await window.api.invoke('set-volume', { volume: volumeToSet });
        
        console.log(`Audio ${isMuted ? 'muted' : 'unmuted'}`);
    } catch (error) {
        console.error('Error toggling mute:', error);
    }
});

// Gestionnaire d'événements pour le slider de volume
volumeSlider.addEventListener('input', async () => {
    try {
        volume = parseFloat(volumeSlider.value) / 100;
        
        // Si on règle le volume alors qu'on est en mode muet, on désactive le muet
        if (isMuted && volume > 0) {
            isMuted = false;
        }
        
        // Mettre à jour le volume dans le processus principal
        const volumeToSet = isMuted ? 0 : volume;
        await window.api.invoke('set-volume', { volume: volumeToSet });
        
        updateVolumeDisplay();
        console.log(`Volume set to ${Math.round(volume * 100)}%`);
    } catch (error) {
        console.error('Error setting volume:', error);
    }
});

// Mettre à jour l'affichage du volume
function updateVolumeDisplay() {
    const volumePercent = Math.round(volume * 100);
    volumeValue.textContent = `${volumePercent}%`;
    volumeSlider.value = volumePercent;
    
    // Mettre à jour le bouton mute
    if (isMuted || volume === 0) {
        muteButton.textContent = '🔇 Unmute';
        muteButton.style.backgroundColor = '#ffeb3b';
        volumeValue.textContent = 'Muted';
    } else {
        muteButton.textContent = '🔊 Mute';
        muteButton.style.backgroundColor = '';
    }
}

// Initialiser le playback et la visualisation audio au démarrage
document.addEventListener('DOMContentLoaded', () => {
    initializePlayback();
    
    // Initialiser la visualisation audio
    if (window.AudioContext || window.webkitAudioContext) {
        initAudioVisualization().catch(console.error);
    } else {
        console.warn('Web Audio API not supported in this browser');
    }
    
    // Gestionnaire pour le bouton mute
    const muteButton = document.getElementById('muteButton');
    if (muteButton) {
        muteButton.addEventListener('click', async () => {
            try {
                isMuted = !isMuted;
                await window.api.toggleMute();
                updateMuteButton();
            } catch (error) {
                console.error('Error toggling mute:', error);
            }
        });
    }
    
    // Gestionnaire pour le slider de volume
    const volumeSlider = document.getElementById('volumeSlider');
    if (volumeSlider) {
        volumeSlider.addEventListener('input', async (e) => {
            try {
                const newVolume = parseInt(e.target.value) / 100;
                await window.api.setVolume(newVolume);
                volume = newVolume;
                updateMuteButton();
            } catch (error) {
                console.error('Error setting volume:', error);
            }
        });
    }
    
    // Mettre à jour l'état initial des boutons
    updateMuteButton();
});

// Mettre à jour l'apparence du bouton mute
function updateMuteButton() {
    const muteButton = document.getElementById('muteButton');
    const muteIcon = document.getElementById('muteIcon');
    const volumeSlider = document.getElementById('volumeSlider');
    
    if (!muteButton || !muteIcon || !volumeSlider) return;
    
    if (isMuted || volume === 0) {
        muteIcon.textContent = '🔇';
        volumeSlider.value = 0;
    } else if (volume < 0.3) {
        muteIcon.textContent = '🔈';
        volumeSlider.value = volume * 100;
    } else if (volume < 0.7) {
        muteIcon.textContent = '🔉';
        volumeSlider.value = volume * 100;
    } else {
        muteIcon.textContent = '🔊';
        volumeSlider.value = volume * 100;
    }
}

// Transcription elements
const toggleTranscriptionCheckbox = document.getElementById('toggleTranscriptionCheckbox');
const transcriptionStatus = document.getElementById('transcriptionStatus');
const transcriptionDisplay = document.getElementById('transcriptionDisplay');
const transcriptionError = document.getElementById('transcriptionError');

// Transcription event handlers
window.api.onTranscription((transcriptionData) => {
    console.log('Received transcription:', transcriptionData);
    addTranscriptionToDisplay(transcriptionData);
});

window.api.onDeepgramConnected(() => {
    console.log('Deepgram connected');
    transcriptionStatus.textContent = 'Transcription: CONNECTÉ';
    transcriptionStatus.style.color = '#4CAF50';
    hideTranscriptionError();
});

window.api.onDeepgramDisconnected(() => {
    console.log('Deepgram disconnected');
    transcriptionStatus.textContent = 'Transcription: DÉCONNECTÉ';
    transcriptionStatus.style.color = '#F44336';
});

window.api.onDeepgramError((error) => {
    console.error('Deepgram error:', error);
    showTranscriptionError(`Erreur Deepgram: ${error.message || 'Erreur inconnue'}`);
});

// Transcription checkbox handler
toggleTranscriptionCheckbox.addEventListener('change', async () => {
    try {
        const result = await window.api.invoke('toggle-transcription');
        if (result.success) {
            isTranscriptionActive = result.isActive;
            toggleTranscriptionCheckbox.checked = isTranscriptionActive;
            updateTranscriptionStatus();
            console.log(`Transcription ${isTranscriptionActive ? 'started' : 'stopped'}`);
        } else {
            console.error('Failed to toggle transcription:', result.error);
        }
    } catch (error) {
        console.error('Error toggling transcription:', error);
        showTranscriptionError(`Erreur: ${error.message}`);
    }
});

// Update transcription status
function updateTranscriptionStatus() {
    if (isTranscriptionActive) {
        transcriptionStatus.textContent = 'Transcription: ACTIVE';
        transcriptionStatus.style.color = '#4CAF50';
    } else {
        transcriptionStatus.textContent = 'Transcription: DÉSACTIVÉE';
        transcriptionStatus.style.color = '#666';
    }
}

// Add transcription to display (YouTube style)
function addTranscriptionToDisplay(transcriptionData) {
    const currentTranscription = document.getElementById('currentTranscription');
    const completedTranscriptions = document.getElementById('completedTranscriptions');
    
    if (transcriptionData.isFinal) {
        // Transcription finale - ajouter à l'historique
        const completedItem = document.createElement('div');
        completedItem.className = 'completed-transcript';
        
        const transcriptText = document.createElement('span');
        transcriptText.textContent = transcriptionData.transcript;
        
        const confidenceText = document.createElement('span');
        confidenceText.className = 'transcript-confidence';
        confidenceText.textContent = ` (${(transcriptionData.confidence * 100).toFixed(1)}%)`;
        
        const languageBadge = document.createElement('span');
        languageBadge.className = 'language-indicator';
        languageBadge.textContent = detectedLanguage;
        
        const timestamp = document.createElement('div');
        timestamp.style.fontSize = '0.8em';
        timestamp.style.color = '#999';
        timestamp.style.marginTop = '2px';
        timestamp.textContent = transcriptionData.timestamp.toLocaleTimeString();
        
        completedItem.appendChild(transcriptText);
        completedItem.appendChild(confidenceText);
        completedItem.appendChild(languageBadge);
        completedItem.appendChild(timestamp);
        
        completedTranscriptions.appendChild(completedItem);
        
        // Vider la transcription courante
        currentTranscription.innerHTML = '<span style="color: #666; font-style: italic;">En attente...</span>';
        currentInterimText = '';
        
        // Scroll to bottom
        completedTranscriptions.scrollTop = completedTranscriptions.scrollHeight;
        
    } else {
        // Transcription intermédiaire - mettre à jour la ligne courante
        currentInterimText = transcriptionData.transcript;
        currentTranscription.innerHTML = `
            <span>${transcriptionData.transcript}</span>
            <span class="transcript-confidence">(${(transcriptionData.confidence * 100).toFixed(1)}%)</span>
            <span class="language-indicator">${detectedLanguage}</span>
        `;
    }
}

// Update transcription display
function updateTranscriptionDisplay() {
    transcriptionDisplay.innerHTML = '';
    
    if (transcriptionHistory.length === 0) {
        transcriptionDisplay.innerHTML = '<div style="color: #666; font-style: italic;">En attente de transcription...</div>';
        return;
    }
    
    transcriptionHistory.forEach(item => {
        transcriptionDisplay.appendChild(item.cloneNode(true));
    });
    
    // Scroll to bottom
    transcriptionDisplay.scrollTop = transcriptionDisplay.scrollHeight;
}

// Show transcription error
function showTranscriptionError(message) {
    transcriptionError.textContent = message;
    transcriptionError.style.display = 'block';
}

// Hide transcription error
function hideTranscriptionError() {
    transcriptionError.style.display = 'none';
}

// Initialize transcription status
async function updateTranscriptionCheckboxState() {
    try {
        const status = await window.api.invoke('get-transcription-status');
        isTranscriptionActive = status.active;
        toggleTranscriptionCheckbox.checked = isTranscriptionActive;
        updateTranscriptionStatus();
    } catch (error) {
        console.error('Error getting transcription status:', error);
    }
}

// Call on startup
updateTranscriptionCheckboxState();
