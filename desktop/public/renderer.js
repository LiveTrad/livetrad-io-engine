// Audio monitoring state
let audioChunksCount = 0;

// Transcription state
let isTranscriptionActive = false;
let transcriptionHistory = [];
const MAX_TRANSCRIPTION_HISTORY = 50;
let currentInterimText = '';
let detectedLanguage = 'Auto';

// Format date for display
function formatDateTime(timestamp) {
    if (!timestamp) return 'N/A';
    try {
        const date = new Date(timestamp);
        return date.toLocaleString();
    } catch (e) {
        console.error('Error formatting date:', e);
        return 'N/A';
    }
}

// Fonction pour activer/désactiver les contrôles de l'application
function enableAppControls(enabled) {
    const controls = document.querySelectorAll('.control');
    controls.forEach(control => {
        if (enabled) {
            control.removeAttribute('disabled');
        } else {
            control.setAttribute('disabled', 'disabled');
        }
    });
}

function updateStatus(isConnected, details = {}) {
    const connectionStatus = document.getElementById('connectionStatus');
    if (!connectionStatus) return;
    
    if (isConnected) {
        connectionStatus.classList.remove('disconnected');
        connectionStatus.classList.add('connected');
        const statusText = connectionStatus.querySelector('span');
        if (statusText) statusText.textContent = 'Connected';
    } else {
        connectionStatus.classList.remove('connected');
        connectionStatus.classList.add('disconnected');
        const statusText = connectionStatus.querySelector('span');
        if (statusText) statusText.textContent = 'Disconnected';
    }
}
// Function to handle audio data (if needed)
function handleAudioData(audioData) {
    // Simple counter for received audio chunks
    audioChunksCount++;
    const chunksElement = document.getElementById('audioChunksReceived');
    if (chunksElement) {
        chunksElement.textContent = `Chunks received: ${audioChunksCount}`;
    }
}

// Listen for connection changes
window.api.onConnectionChange((status, details) => {
    console.log('Connection status changed:', status, 'details:', details);
    updateStatus(status, details);
});

// Listen for audio data
window.api.onAudioStats((audioData) => {
    console.log('Received audio data, length:', audioData.length);
    audioChunksCount++;
    const chunksElement = document.getElementById('audioChunksReceived');
    if (chunksElement) {
        chunksElement.textContent = `Chunks received: ${audioChunksCount}`;
    }
});

// Initialize on DOM content loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('Application initialized');

    updateStatus(false, {});
    
    // Check initial connection status
    window.api.getConnectionStatus()
        .then(({ status, details }) => {
            console.log('Initial connection status:', status, 'details:', details);
            updateStatus(status, details);
        })
        .catch(error => {
            console.error('Error getting connection status:', error);
            updateStatus(false);
        });

    // Transcription elements (simplified)
    const toggleTranscriptionCheckbox = document.getElementById('toggleTranscriptionCheckbox');
    
    // Initialize transcription if elements exist
    if (toggleTranscriptionCheckbox) {
        toggleTranscriptionCheckbox.checked = isTranscriptionActive;
        
        toggleTranscriptionCheckbox.addEventListener('change', () => {
            isTranscriptionActive = toggleTranscriptionCheckbox.checked;
            console.log('Transcription toggled:', isTranscriptionActive);
            // Add any additional transcription handling here
        });
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
