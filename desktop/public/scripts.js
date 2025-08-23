// Initialize Lucide icons
document.addEventListener('DOMContentLoaded', function() {
    lucide.createIcons();
});

class LiveTradApp {
    constructor() {
        this.isTranscribing = false;
        this.isTTSEnabled = false;
        this.sessionStartTime = null;
        this.stats = {
            chunksReceived: 0,
            transcriptCount: 0
        };
        this.transcriptions = [];
        this.currentSourceLang = 'auto';
        this.currentTargetLang = 'fr';
        this.voiceVariants = this.getVoiceVariants();
        this.isRealTimeTTS = true;
    }
    
    init() {
        this.setupEventListeners();
        this.updateStats();
        this.startSessionTimer();
        this.updateProfileVoiceVariants();
        this.simulatePeriodicTranscription();
    }
    
    setupEventListeners() {
        const recordBtn = document.getElementById('recordBtn');
        if (recordBtn) recordBtn.addEventListener('click', () => this.toggleRecording());
        
        const toggleTranscription = document.getElementById('toggleTranscription');
        if (toggleTranscription) toggleTranscription.addEventListener('change', (e) => this.toggleTranscription(e.target.checked));
        
        const autoTranslate = document.getElementById('autoTranslate');
        if (autoTranslate) autoTranslate.addEventListener('change', (e) => this.toggleAutoTranslate(e.target.checked));
        
        const exportBtn = document.getElementById('exportBtn');
        if (exportBtn) exportBtn.addEventListener('click', () => this.exportTranscriptions());
        
        const clearBtn = document.getElementById('clearBtn');
        if (clearBtn) clearBtn.addEventListener('click', () => this.clearTranscriptions());
        
        document.querySelectorAll('.lang-option[data-lang]').forEach(btn => {
            if (btn) btn.addEventListener('click', (e) => this.selectSourceLanguage(e.target.dataset.lang));
        });
        
        document.querySelectorAll('.lang-option[data-target]').forEach(btn => {
            if (btn) btn.addEventListener('click', (e) => this.selectTargetLanguage(e.target.dataset.target));
        });
        
        const userProfile = document.getElementById('userProfile');
        if (userProfile) userProfile.addEventListener('click', () => {
            const profilePanel = document.getElementById('profileSettingsPanel');
            const settingsPanel = document.getElementById('settingsPanel');
            if (settingsPanel) settingsPanel.classList.remove('active');
            if (profilePanel) profilePanel.classList.toggle('active');
        });
        
        const profileVoiceType = document.getElementById('profileVoiceType');
        if (profileVoiceType) profileVoiceType.addEventListener('change', (e) => this.updateProfileVoiceType(e.target.value));
        
        const genericVoiceProfile = document.getElementById('genericVoiceProfile');
        if (genericVoiceProfile) genericVoiceProfile.addEventListener('change', (e) => this.updateProfileGenericVoice(e.target.value));
        
        const saveProfileBtn = document.getElementById('saveProfileBtn');
        if (saveProfileBtn) saveProfileBtn.addEventListener('click', () => this.saveProfileSettings());
        
        const cancelProfileBtn = document.getElementById('cancelProfileBtn');
        if (cancelProfileBtn) cancelProfileBtn.addEventListener('click', () => {
            const profilePanel = document.getElementById('profileSettingsPanel');
            if (profilePanel) profilePanel.classList.remove('active');
        });
        
        const ttsService = document.getElementById('ttsService');
        if (ttsService) ttsService.addEventListener('change', (e) => this.updateTTSService(e.target.value));
        
        const resetBtn = document.getElementById('resetBtn');
        if (resetBtn) resetBtn.addEventListener('click', () => this.resetSettings());
        
        const saveSettingsBtn = document.getElementById('saveSettingsBtn');
        if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', () => this.saveSettings());
        
        const connectionStatus = document.getElementById('connectionStatus');
        if (connectionStatus) connectionStatus.addEventListener('click', () => this.toggleConnection());
        
        const themeSelect = document.getElementById('themeSelect');
        if (themeSelect) themeSelect.addEventListener('change', (e) => this.changeTheme(e.target.value));
        
        const fontSelect = document.getElementById('fontSelect');
        if (fontSelect) fontSelect.addEventListener('change', (e) => this.changeFont(e.target.value));
        
        // Add settings trigger button functionality - remove the creation since it's now in HTML
        const settingsTrigger = document.getElementById('settingsTrigger');
        
        if (settingsTrigger) {
            settingsTrigger.addEventListener('click', () => {
                const settingsPanel = document.getElementById('settingsPanel');
                const profilePanel = document.getElementById('profileSettingsPanel');
                if (profilePanel) profilePanel.classList.remove('active');
                if (settingsPanel) settingsPanel.classList.toggle('active');
            });
        }
        
        document.addEventListener('click', (e) => {
            const profilePanel = document.getElementById('profileSettingsPanel');
            const settingsPanel = document.getElementById('settingsPanel');
            const userProfile = document.getElementById('userProfile');
            const settingsTrigger = document.getElementById('settingsTrigger');
            
            if (profilePanel && userProfile && !userProfile.contains(e.target) && !profilePanel.contains(e.target)) {
                profilePanel.classList.remove('active');
            }
            if (settingsPanel && settingsTrigger && !settingsTrigger.contains(e.target) && !settingsPanel.contains(e.target)) {
                settingsPanel.classList.remove('active');
            }
        });
        
        // Reinitialize icons after DOM changes
        setTimeout(() => lucide.createIcons(), 100);
    }
    
    simulatePeriodicTranscription() {
        // Simulate receiving transcription data every few seconds
        setInterval(() => {
            if (this.isTranscribing && Math.random() > 0.3) {
                this.simulateTranscription();
            }
        }, 3000 + Math.random() * 4000); // Random interval between 3-7 seconds
    }
    
    async toggleRecording() {
        const btn = document.getElementById('recordBtn');
        if (!btn) return;
        
        if (!this.isRecording) {
            try {
                await this.startRecording();
                btn.classList.add('active');
                btn.innerHTML = '<i data-lucide="square" class="btn-icon"></i>Stop';
            } catch (error) {
                console.error('Failed to start recording:', error);
                this.showNotification('Failed to access microphone', 'error');
            }
        } else {
            this.stopRecording();
            btn.classList.remove('active');
            btn.innerHTML = '<i data-lucide="mic" class="btn-icon"></i>Record';
        }
        lucide.createIcons();
    }
    
    async startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(stream);
            this.mediaRecorder.start(1000);
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.processAudioChunk(event.data);
                }
            };
            
            this.isRecording = true;
            this.sessionStartTime = Date.now();
        } catch (error) {
            this.showNotification('Microphone access denied', 'error');
        }
    }
    
    stopRecording() {
        if (this.mediaRecorder) {
            this.mediaRecorder.stop();
            this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }
        this.isRecording = false;
    }
    
    processAudioChunk(audioBlob) {
        this.stats.chunksReceived++;
        this.updateStats();
    }
    
    simulateTranscription() {
        const sampleTexts = [
            "Bonjour, j'espère que vous passez une excellente journée.",
            "La technologie de transcription en temps réel est vraiment impressionnante.",
            "Pouvez-vous m'aider à configurer les paramètres de traduction ?",
            "Le système fonctionne parfaitement avec une excellente qualité audio.",
            "Merci beaucoup pour cette démonstration très intéressante.",
            "Les services de synthèse vocale ont fait d'énormes progrès récemment.",
            "J'aimerais tester différentes langues pour voir la précision.",
            "L'interface utilisateur est intuitive et très bien conçue."
        ];
        
        const randomText = sampleTexts[Math.floor(Math.random() * sampleTexts.length)];
        const confidence = Math.floor(Math.random() * 25) + 75; // 75-100%
        
        this.addTranscription(randomText, confidence);
    }
    
    addTranscription(text, confidence = 85) {
        const currentDiv = document.getElementById('currentTranscription');
        const confidenceBadge = document.getElementById('confidenceBadge');
        if (!currentDiv || !confidenceBadge) return;
        
        // Move current to completed if exists
        if (currentDiv.textContent.trim() && currentDiv.textContent !== "En attente de transcription...") {
            this.moveToCompleted(currentDiv.textContent);
        }
        
        // Set new current transcription
        currentDiv.textContent = text;
        confidenceBadge.textContent = confidence + '%';
        confidenceBadge.style.background = confidence > 90 ? '#4CAF50' : 
                                          confidence > 75 ? '#FF9800' : '#F44336';
        
        this.stats.transcriptCount++;
        this.updateStats();
        
        // Simulate auto-translation if enabled
        const autoTranslateToggle = document.getElementById('autoTranslate');
        if (autoTranslateToggle && autoTranslateToggle.checked) {
            setTimeout(() => {
                this.simulateTranslation(text);
            }, 1500);
        }
    }
    
    simulateTranslation(originalText) {
        const translations = {
            "Bonjour, j'espère que vous passez une excellente journée.": "Hello, I hope you're having an excellent day.",
            "La technologie de transcription en temps réel est vraiment impressionnante.": "Real-time transcription technology is really impressive.",
            "Pouvez-vous m'aider à configurer les paramètres de traduction ?": "Can you help me configure the translation settings?",
            "Le système fonctionne parfaitement avec une excellente qualité audio.": "The system works perfectly with excellent audio quality.",
            "Merci beaucoup pour cette démonstration très intéressante.": "Thank you very much for this very interesting demonstration.",
            "Les services de synthèse vocale ont fait d'énormes progrès récemment.": "Text-to-speech services have made huge progress recently.",
            "J'aimerais tester différentes langues pour voir la précision.": "I would like to test different languages to see the accuracy.",
            "L'interface utilisateur est intuitive et très bien conçue.": "The user interface is intuitive and very well designed."
        };
        
        const translated = translations[originalText] || "Translation processing...";
        
        const completedDiv = document.createElement('div');
        completedDiv.className = 'completed-transcript slide-in';
        completedDiv.innerHTML = `
            <div style="margin-bottom: 6px; color: #90caf9; font-size: 11px; font-weight: 500; display: flex; align-items: center; gap: 4px;">
                <i data-lucide="languages" style="width: 12px; height: 12px;"></i>
                TRANSLATED
            </div>
            ${translated}
        `;
        
        const completedTranscriptions = document.getElementById('completedTranscriptions');
        if (completedTranscriptions) {
            completedTranscriptions.prepend(completedDiv);
            lucide.createIcons();
        }
    }
    
    moveToCompleted(text) {
        const completedDiv = document.createElement('div');
        completedDiv.className = 'completed-transcript slide-in';
        completedDiv.textContent = text;
        
        const completedTranscriptions = document.getElementById('completedTranscriptions');
        if (completedTranscriptions) completedTranscriptions.prepend(completedDiv);
    }
    
    getVoiceVariants() {
        return {
            elevenlabs: {
                user: ['Cloned Voice 1', 'Cloned Voice 2'],
                male: ['Adam', 'Antoni', 'Arnold', 'Josh', 'Sam'],
                female: ['Bella', 'Domi', 'Elli', 'Rachel', 'Sarah'],
                auto: ['Auto-select best match']
            },
            openai: {
                user: ['User Voice Clone'],
                male: ['Onyx', 'Echo', 'Fable'],
                female: ['Alloy', 'Nova', 'Shimmer'],
                auto: ['Alloy (Neutral)']
            },
            azure: {
                user: ['Custom Neural Voice'],
                male: ['Guy', 'Davis', 'Jason', 'Tony'],
                female: ['Aria', 'Jenny', 'Michelle', 'Monica'],
                auto: ['Jenny (Neural)']
            },
            google: {
                user: ['Custom Voice'],
                male: ['Male 1', 'Male 2', 'Male 3'],
                female: ['Female 1', 'Female 2', 'Female 3'],
                auto: ['Standard Voice']
            },
            aws: {
                user: ['Custom Voice'],
                male: ['Matthew', 'Brian', 'Russell', 'Kevin'],
                female: ['Joanna', 'Kimberly', 'Amy', 'Emma'],
                auto: ['Joanna (Neural)']
            }
        };
    }
    
    updateTTSService(service) {
        this.updateProfileVoiceVariants();
    }
    
    updateProfileVoiceType(type) {
        const genericSettings = document.getElementById('genericVoiceProfileSettings');
        const variantSettings = document.getElementById('voiceVariantProfileSettings');
        if (genericSettings && variantSettings) {
            if (type === 'user') {
                genericSettings.style.display = 'none';
                variantSettings.style.display = 'block';
            } else {
                genericSettings.style.display = 'block';
                variantSettings.style.display = 'none';
            }
        }
        this.updateProfileVoiceVariants();
    }
    
    updateProfileGenericVoice(voice) {
        this.updateProfileVoiceVariants();
    }
    
    updateProfileVoiceVariants() {
        const ttsService = document.getElementById('ttsService');
        const profileVoiceType = document.getElementById('profileVoiceType');
        const genericVoiceProfile = document.getElementById('genericVoiceProfile');
        const variantSelect = document.getElementById('voiceVariantProfile');
        const variantSettings = document.getElementById('voiceVariantProfileSettings');
        
        if (!ttsService || !profileVoiceType || !genericVoiceProfile || !variantSelect || !variantSettings) return;
        
        const serviceValue = ttsService.value;
        const typeValue = profileVoiceType.value;
        const genericValue = genericVoiceProfile.value;
        
        if (!this.voiceVariants[serviceValue]) return;
        
        let variants = [];
        if (typeValue === 'user') {
            variants = this.voiceVariants[serviceValue].user || [];
        } else {
            variants = this.voiceVariants[serviceValue][genericValue] || [];
        }
        
        variantSelect.innerHTML = '';
        variants.forEach(variant => {
            const option = document.createElement('option');
            option.value = variant.toLowerCase().replace(/\s+/g, '_');
            option.textContent = variant;
            variantSelect.appendChild(option);
        });
        
        if (variants.length > 1) {
            variantSettings.style.display = 'block';
        } else {
            variantSettings.style.display = 'none';
        }
    }
    
    toggleTranscription(enabled) {
        this.isTranscribing = enabled;
        const status = document.getElementById('transcriptionStatus');
        if (status) {
            if (enabled) {
                status.textContent = 'Active';
                status.classList.add('active');
                this.showNotification('Transcription activated', 'success');
            } else {
                status.textContent = 'Inactive';
                status.classList.remove('active');
                this.showNotification('Transcription deactivated', 'info');
            }
        }
    }
    
    toggleAutoTranslate(enabled) {
        if (enabled) {
            this.showNotification('Auto-translation enabled', 'success');
        } else {
            this.showNotification('Auto-translation disabled', 'info');
        }
    }
    
    selectSourceLanguage(lang) {
        const langOptions = document.querySelectorAll('.lang-option[data-lang]');
        if (langOptions) {
            langOptions.forEach(btn => {
                btn.classList.remove('active');
            });
            const selectedBtn = document.querySelector(`[data-lang="${lang}"]`);
            if (selectedBtn) selectedBtn.classList.add('active');
        }
        this.currentSourceLang = lang;
        this.showNotification(`Source language: ${lang}`, 'info');
    }
    
    selectTargetLanguage(lang) {
        const targetOptions = document.querySelectorAll('.lang-option[data-target]');
        if (targetOptions) {
            targetOptions.forEach(btn => {
                btn.classList.remove('active');
            });
            const selectedBtn = document.querySelector(`[data-target="${lang}"]`);
            if (selectedBtn) selectedBtn.classList.add('active');
        }
        this.currentTargetLang = lang;
        this.showNotification(`Target language: ${lang}`, 'info');
    }
    
    exportTranscriptions() {
        const currentTranscription = document.getElementById('currentTranscription');
        const completedTranscripts = document.querySelectorAll('.completed-transcript');
        
        let content = '';
        
        // Add current transcription if exists
        if (currentTranscription && currentTranscription.textContent.trim() && 
            currentTranscription.textContent !== "En attente de transcription...") {
            content += 'CURRENT:\n' + currentTranscription.textContent + '\n\n';
        }
        
        // Add completed transcriptions
        if (completedTranscripts.length > 0) {
            content += 'COMPLETED TRANSCRIPTIONS:\n';
            const transcriptions = Array.from(completedTranscripts)
                .map(el => el.textContent.replace(/TRANSLATED\s*/g, ''))
                .reverse();
            content += transcriptions.join('\n\n');
        }
        
        if (content.trim() === '') {
            this.showNotification('No transcriptions to export', 'error');
            return;
        }
        
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `transcriptions_${new Date().toISOString().slice(0, 10)}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        URL.revokeObjectURL(url);
        this.showNotification('Transcriptions exported successfully', 'success');
    }
    
    clearTranscriptions() {
        const currentTranscription = document.getElementById('currentTranscription');
        const completedTranscriptions = document.getElementById('completedTranscriptions');
        const confidenceBadge = document.getElementById('confidenceBadge');
        if (currentTranscription && completedTranscriptions && confidenceBadge) {
            currentTranscription.textContent = '';
            completedTranscriptions.innerHTML = '';
            confidenceBadge.textContent = '--';
            confidenceBadge.style.background = 'rgba(0, 255, 136, 0.8)';
            this.stats.transcriptCount = 0;
            this.updateStats();
            this.showNotification('All transcriptions cleared', 'info');
        }
    }
    
    updateStats() {
        const chunksReceived = document.getElementById('chunksReceived');
        const transcriptCount = document.getElementById('transcriptCount');
        if (chunksReceived && transcriptCount) {
            chunksReceived.textContent = this.stats.chunksReceived;
            transcriptCount.textContent = this.stats.transcriptCount;
        }
    }
    
    startSessionTimer() {
        this.sessionStartTime = Date.now();
        
        const sessionTime = document.getElementById('sessionTime');
        if (sessionTime) {
            setInterval(() => {
                const elapsed = Date.now() - this.sessionStartTime;
                const minutes = Math.floor(elapsed / 60000);
                const seconds = Math.floor((elapsed % 60000) / 1000);
                sessionTime.textContent = 
                    `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }, 1000);
        }
    }
    
    toggleConnection() {
        const status = document.getElementById('connectionStatus');
        if (status) {
            const isConnected = status.classList.contains('connected');
            
            if (isConnected) {
                status.classList.remove('connected');
                status.classList.add('disconnected');
                status.innerHTML = '<div class="status-dot"></div><span>Disconnected</span>';
                this.showNotification('Connection lost', 'error');
            } else {
                status.classList.remove('disconnected');
                status.classList.add('connected');
                status.innerHTML = '<div class="status-dot"></div><span>Connected</span>';
                this.showNotification('Connection restored', 'success');
            }
        }
    }
    
    resetSettings() {
        const inputs = {
            transcriptionService: 'deepgram',
            translationService: 'google',
            ttsService: 'elevenlabs',
            themeSelect: 'hacker',
            fontSelect: 'Inter',
            audioQuality: '44100',
            chunkSize: '1000'
        };
        
        Object.entries(inputs).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) element.value = value;
        });
        
        this.changeTheme('hacker');
        this.changeFont('Inter');
        
        this.showNotification('Settings reset to defaults', 'info');
    }
    
    saveSettings() {
        const settings = {
            transcriptionService: document.getElementById('transcriptionService')?.value,
            translationService: document.getElementById('translationService')?.value,
            ttsService: document.getElementById('ttsService')?.value,
            theme: document.getElementById('themeSelect')?.value,
            font: document.getElementById('fontSelect')?.value,
            audioQuality: document.getElementById('audioQuality')?.value,
            chunkSize: document.getElementById('chunkSize')?.value
        };
        
        this.changeTheme(settings.theme);
        this.changeFont(settings.font);
        
        console.log('Settings saved:', settings);
        this.showNotification('Settings saved successfully', 'success');
        
        const settingsPanel = document.getElementById('settingsPanel');
        if (settingsPanel) settingsPanel.classList.remove('active');
    }
    
    saveProfileSettings() {
        const userNameInput = document.getElementById('userNameInput');
        const newName = userNameInput?.value;
        
        if (newName) {
            const userNameElement = document.querySelector('.user-name');
            if (userNameElement) userNameElement.textContent = newName;
            
            const userAvatar = document.querySelector('.user-avatar');
            if (userAvatar) {
                const initials = newName.split(' ').map(n => n[0]).join('').toUpperCase();
                userAvatar.textContent = initials;
            }
        }
        
        this.showNotification('Profile settings saved successfully', 'success');
        const profilePanel = document.getElementById('profileSettingsPanel');
        if (profilePanel) profilePanel.classList.remove('active');
    }
    
    changeTheme(theme) {
        const body = document.body;
        body.classList.remove('theme-hacker', 'theme-ocean', 'theme-dark-nebula');
        body.classList.add(`theme-${theme}`);
        
        const colorMap = {
            'hacker': 'rgba(20, 20, 20, 0.95)',
            'ocean': 'rgba(13, 59, 102, 0.95)',
            'dark-nebula': 'rgba(42, 42, 94, 0.95)'
        };
        
        const appContainer = document.querySelector('.app-container');
        if (appContainer) appContainer.style.background = colorMap[theme];
    }
    
    changeFont(font) {
        document.body.style.fontFamily = font === 'Inter' ? 
            "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" : 
            font;
    }
    
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 24px;
            right: 24px;
            padding: 12px 16px;
            background: ${type === 'success' ? 'rgba(76, 175, 80, 0.95)' : 
                        type === 'error' ? 'rgba(244, 67, 54, 0.95)' : 
                        'rgba(33, 150, 243, 0.95)'};
            color: white;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 500;
            z-index: 10000;
            animation: slideIn 0.3s ease;
            backdrop-filter: blur(10px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            max-width: 320px;
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideIn 0.3s ease reverse';
            setTimeout(() => {
                if (notification.parentNode) notification.remove();
            }, 300);
        }, 3000);
    }
}

let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new LiveTradApp();
    app.init();
});