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

// Update connection status with detailed information
function updateStatus(isConnected, details = {}) {
    const statusElement = document.getElementById('status');
    const statsElement = document.getElementById('stats');
    const connectionDetailsElement = document.getElementById('connection-details');
    const streamInfoElement = document.getElementById('stream-info');
    const connectionTime = details.timestamp ? new Date(details.timestamp) : new Date();
    
    if (isConnected) {
        statusElement.className = 'status connected';
        statusElement.textContent = 'Connected';
        statusElement.title = `Connected at ${connectionTime.toLocaleString()}`;
        
        // Update connection details
        let detailsHtml = `
            <h3>Connection Details</h3>
            <div class="stat-item">
                <strong>Client ID:</strong> ${details.clientId || 'Unknown'}
            </div>
            <div class="stat-item">
                <strong>Desktop URL:</strong> ${details.desktopUrl || 'N/A'}
            </div>
            <div class="stat-item">
                <strong>Connected Since:</strong> ${formatDateTime(details.timestamp)}
            </div>
            <div class="stat-item">
                <strong>ICE State:</strong> <span class="state-${details.iceState?.toLowerCase() || 'unknown'}">${details.iceState || 'Unknown'}</span>
            </div>
            <div class="stat-item">
                <strong>Connection State:</strong> <span class="state-${details.connectionState?.toLowerCase() || 'unknown'}">${details.connectionState || 'Unknown'}</span>
            </div>
            <div class="stat-item">
                <strong>Signaling State:</strong> ${details.signalingState || 'Unknown'}
            </div>
        `;
        
        // Stream information
        let streamInfoHtml = '';
        if (details.streamInfo) {
            const { hasAudio } = details.streamInfo;
            streamInfoHtml = `
                <h3>Stream Information</h3>
                <div class="stat-item">
                    <strong>Audio:</strong> ${hasAudio ? '✅ Active' : '❌ Not active'}
                </div>
            `;
        }
        
        statsElement.innerHTML = detailsHtml;
        streamInfoElement.innerHTML = streamInfoHtml;
        
        // Show both sections
        statsElement.style.display = 'block';
        streamInfoElement.style.display = 'block';
    } else {
        statusElement.className = 'status disconnected';
        statusElement.textContent = 'Disconnected';
        statusElement.title = 'Waiting for connection...';
        
        // Clear details but keep the containers
        statsElement.innerHTML = '<h3>Connection Details</h3><p>Not connected</p>';
        streamInfoElement.innerHTML = '<h3>Stream Information</h3><p>No active stream</p>';
        
        // Show both sections but with disabled state
        statsElement.style.display = 'block';
        streamInfoElement.style.display = 'block';
        statsElement.classList.add('disabled');
        streamInfoElement.classList.add('disabled');
        
        // Reset any monitoring state if needed
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
    
    // Check initial connection status
    window.api.getConnectionStatus()
        .then(({ status, details }) => {
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
