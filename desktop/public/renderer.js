// État de l'application
let audioChunksCount = 0;
let isAuthenticated = false;

// Éléments du DOM
const loginScreen = document.getElementById('login-screen');
const mainApp = document.getElementById('main-app');
const loginBtn = document.getElementById('loginBtn');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const loginError = document.getElementById('loginError');

// Using secure preload bridge via window.api (no direct ipcRenderer access)

// Gestion de la connexion
async function handleLogin() {
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    const loginBtn = document.getElementById('loginBtn');
    
    if (!username || !password) {
        showError('Veuillez remplir tous les champs');
        return;
    }
    
    try {
        // Désactiver le bouton pendant la tentative de connexion
        loginBtn.disabled = true;
        loginBtn.textContent = 'Connexion...';
        
        // Utiliser l'API sécurisée exposée par le preload
        const result = await window.api.authenticate(username, password);
        if (result.success) {
            isAuthenticated = true;
            document.getElementById('login-screen').style.display = 'none';
            document.getElementById('main-app').style.display = 'block';
            
            // Réinitialiser les champs
            usernameInput.value = '';
            passwordInput.value = '';
        } else {
            showError('Identifiants incorrects');
            loginBtn.disabled = false;
            loginBtn.textContent = 'Se connecter';
        }
    } catch (error) {
        console.error('Erreur de connexion:', error);
        showError('Erreur de connexion au serveur');
        loginBtn.disabled = false;
        loginBtn.textContent = 'Se connecter';
    }
}

// Afficher un message d'erreur
function showError(message) {
    loginError.textContent = message;
    setTimeout(() => {
        loginError.textContent = '';
    }, 3000);
}

// Écouteurs d'événements
if (loginBtn) {
    loginBtn.addEventListener('click', handleLogin);
}

// Permettre la soumission avec Entrée
if (passwordInput) {
    passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleLogin();
        }
    });
}

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

function updateStatus(status, details = {}) {
    const connectionStatus = document.getElementById('connectionStatus');
    if (!connectionStatus) return;

    // Supprimer toutes les classes d'état
    connectionStatus.classList.remove('connected', 'disconnected', 'connecting');
    
    // Mettre à jour l'état en fonction du statut reçu
    if (status === 'connected') {
        connectionStatus.classList.add('connected');
        const statusText = connectionStatus.querySelector('span');
        if (statusText) statusText.textContent = 'Connected';
    } 
    else if (status === 'connecting') {
        connectionStatus.classList.add('connecting');
        const statusText = connectionStatus.querySelector('span');
        if (statusText) statusText.textContent = 'Connecting';
    }
    else {
        // Pour 'disconnected' ou tout autre état
        connectionStatus.classList.add('disconnected');
        const statusText = connectionStatus.querySelector('span');
        if (statusText) statusText.textContent = 'Disconnected';
    }

    // Mettre à jour les détails de connexion si disponibles
    if (details) {
        console.log('Connection details:', details);
        // Vous pouvez ajouter ici la logique pour afficher plus de détails si nécessaire
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
window.api.onConnectionChange((data) => {
    // const isConnected = status === "connected" || details?.connectedState === 'connected';
    console.log('Connection status changed:', data.status, 'details:', data.details);
    updateStatus(data.status , data.details);
});

// Listen for audio data
window.api.onAudioStats((_fakeBuffer, _stats) => {
    // We only need to count updates for UI feedback
    audioChunksCount++;
    const chunksElement = document.getElementById('audioChunksReceived');
    if (chunksElement) {
        chunksElement.textContent = `Chunks received: ${audioChunksCount}`;
    }
});

// Initialize on DOM content loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('Application initialized');
    const defaultStatus = "disconnected";
    updateStatus(defaultStatus, {});
    
    // Check initial connection status
    window.api.getConnectionStatus()
        .then(({ status, details }) => {
            console.log('Initial connection status:', status, 'details:', details);
            updateStatus(status, details);
        })
        .catch(error => {
            console.error('Error getting connection status:', error);
            updateStatus(defaultStatus, {});
        });

    // Transcription elements
    const toggleTranscriptionCheckbox = document.getElementById('toggleTranscription');
    if (toggleTranscriptionCheckbox) {
        toggleTranscriptionCheckbox.checked = isTranscriptionActive;
        toggleTranscriptionCheckbox.addEventListener('change', async () => {
            try {
                const result = await window.api.toggleTranscription();
                isTranscriptionActive = !!(result && (result.isActive || result.active));
                updateTranscriptionStatus();
            } catch (error) {
                console.error('Error toggling transcription:', error);
            }
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
    const autoTranslateCheckbox = document.getElementById('autoTranslate');
    const isAutoTranslateEnabled = autoTranslateCheckbox ? autoTranslateCheckbox.checked : false;
    
    // Handle both old format (direct transcription) and new format (with translation)
    let transcription = transcriptionData;
    let translation = null;
    
    if (transcriptionData.transcription) {
        // New format with translation
        transcription = transcriptionData.transcription;
        translation = transcriptionData.translation;
    }
    
    if (transcription.isFinal) {
        // Transcription finale - ajouter à l'historique
        const completedItem = document.createElement('div');
        completedItem.className = 'completed-transcript';
        
        // Original transcription text
        const transcriptText = document.createElement('span');
        transcriptText.textContent = transcription.transcript;
        
        const confidenceText = document.createElement('span');
        confidenceText.className = 'transcript-confidence';
        confidenceText.textContent = ` (${(transcription.confidence * 100).toFixed(1)}%)`;
        
        const languageBadge = document.createElement('span');
        languageBadge.className = 'language-indicator';
        languageBadge.textContent = transcription.language || detectedLanguage;
        
        const timestamp = document.createElement('div');
        timestamp.style.fontSize = '0.8em';
        timestamp.style.color = '#999';
        timestamp.style.marginTop = '2px';
        timestamp.textContent = transcription.timestamp.toLocaleTimeString();
        
        completedItem.appendChild(transcriptText);
        completedItem.appendChild(confidenceText);
        completedItem.appendChild(languageBadge);
        completedItem.appendChild(timestamp);
        
        // Add translation if available and auto-translate is enabled
        if (translation && isAutoTranslateEnabled) {
            const translationDiv = document.createElement('div');
            translationDiv.className = 'translation-text';
            translationDiv.style.marginTop = '4px';
            translationDiv.style.padding = '4px 8px';
            translationDiv.style.backgroundColor = 'rgba(0, 255, 136, 0.1)';
            translationDiv.style.borderLeft = '3px solid #00ff88';
            translationDiv.style.borderRadius = '4px';
            translationDiv.style.fontStyle = 'italic';
            translationDiv.style.color = '#00ff88';
            
            const translationLabel = document.createElement('span');
            translationLabel.textContent = 'TRANSLATED: ';
            translationLabel.style.fontWeight = 'bold';
            translationLabel.style.fontSize = '0.8em';
            
            const translationContent = document.createElement('span');
            translationContent.textContent = translation.translatedText;
            
            translationDiv.appendChild(translationLabel);
            translationDiv.appendChild(translationContent);
            completedItem.appendChild(translationDiv);
        }
        
        completedTranscriptions.appendChild(completedItem);
        
        // Vider la transcription courante
        currentTranscription.innerHTML = '<span style="color: #666; font-style: italic;">En attente...</span>';
        currentInterimText = '';
        
        // Scroll to bottom
        completedTranscriptions.scrollTop = completedTranscriptions.scrollHeight;
        
    } else {
        // Transcription intermédiaire - mettre à jour la ligne courante
        currentInterimText = transcription.transcript;
        let displayText = `
            <span>${transcription.transcript}</span>
            <span class="transcript-confidence">(${(transcription.confidence * 100).toFixed(1)}%)</span>
            <span class="language-indicator">${transcription.language || detectedLanguage}</span>
        `;
        
        // Add translation for interim text if available and auto-translate is enabled
        if (translation && isAutoTranslateEnabled) {
            const isInterim = translation.isInterim;
            const translationStyle = isInterim ? 
                'background-color: rgba(255, 193, 7, 0.1); border-left: 3px solid #ffc107; color: #ffc107;' :
                'background-color: rgba(0, 255, 136, 0.1); border-left: 3px solid #00ff88; color: #00ff88;';
            
            const translationLabel = isInterim ? 'TRANSLATING...' : 'TRANSLATED:';
            
            displayText += `
                <div style="margin-top: 4px; padding: 4px 8px; ${translationStyle} border-radius: 4px; font-style: italic;">
                    <span style="font-weight: bold; font-size: 0.8em;">${translationLabel} </span>
                    <span>${translation.translatedText}</span>
                </div>
            `;
        }
        
        currentTranscription.innerHTML = displayText;
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
        const status = await window.api.getTranscriptionStatus();
        isTranscriptionActive = status.isActive || status.active;
        const toggleCheckbox = document.getElementById('toggleTranscription');
        if (toggleCheckbox) {
            toggleCheckbox.checked = isTranscriptionActive;
        }
        updateTranscriptionStatus();
    } catch (error) {
        console.error('Error getting transcription status:', error);
    }
}

// Call on startup
updateTranscriptionCheckboxState();

// Subscribe to transcription events from main process via preload bridge
window.api.onTranscription((transcriptionData) => {
    if (!isTranscriptionActive) return; // ignore when disabled
    try {
        if (!transcriptionData) return;
        addTranscriptionToDisplay(transcriptionData);
    } catch (e) {
        console.error('Error handling transcription event:', e);
    }
});
