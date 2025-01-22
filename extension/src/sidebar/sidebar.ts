import './sidebar.css';
import { TabInfo } from '../types';

class AudioCaptureSidebar {
  private selectedTabId: number | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private recordingBlob: Blob | null = null;
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;

  private elements = {
    tabsList: document.getElementById('tabsList') as HTMLDivElement,
    startButton: document.getElementById('startCapture') as HTMLButtonElement,
    stopButton: document.getElementById('stopCapture') as HTMLButtonElement,
    status: document.getElementById('status') as HTMLDivElement,
    recordingIndicator: document.getElementById('recordingIndicator') as HTMLDivElement,
    audioPlayer: document.getElementById('audioPlayer') as HTMLAudioElement,
    downloadButton: document.getElementById('downloadButton') as HTMLButtonElement,
    tabCountBadge: document.getElementById('tabCount') as HTMLSpanElement,
  };

  constructor() {
    this.initializeEventListeners();
    this.refreshTabs();
    setInterval(() => this.refreshTabs(), 5000);
  }

  private initializeEventListeners() {
    this.elements.startButton.addEventListener('click', () => this.startCapture());
    this.elements.stopButton.addEventListener('click', () => this.stopCapture());
    this.elements.downloadButton.addEventListener('click', () => this.downloadRecording());
  }

  private async refreshTabs() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_TABS' });
      if (response.success && response.tabs) {
        this.updateTabsList(response.tabs);
      }
    } catch (error) {
      this.showError(`Failed to get tabs: ${error}`);
    }
  }

  private async updateTabsList(tabs: TabInfo[]) {
    const currentTabs = new Set(tabs.map(tab => tab.id));
    const existingTabs = new Set<number>();
    
    // Remove tabs that are no longer audible
    const tabElements = this.elements.tabsList.getElementsByClassName('tab-item');
    for (let i = tabElements.length - 1; i >= 0; i--) {
      const element = tabElements[i] as HTMLElement;
      const tabId = Number(element.dataset.tabId);
      if (!currentTabs.has(tabId)) {
        this.elements.tabsList.removeChild(element);
        existingTabs.delete(tabId); // Ensure tab is removed from existingTabs
      } else {
        existingTabs.add(tabId);
      }
    }

    // Add new audible tabs
    for (const tab of tabs) {
      if (tab.id && !existingTabs.has(tab.id)) {
        const tabElement = document.createElement('div');
        tabElement.className = 'tab-item';
        if (tab.id === this.selectedTabId) {
          tabElement.classList.add('selected');
        }

        tabElement.innerHTML = `
          <div class="tab-title">${tab.title}</div>
          <div class="tab-url">${tab.url}</div>
        `;

        tabElement.addEventListener('click', () => this.selectTab(tab.id));
        this.elements.tabsList.appendChild(tabElement);
      }
    }

    // Update tab count with animation
    this.updateTabCount(tabs.length);

    // Update start button state
    this.elements.startButton.disabled = tabs.length === 0 || this.selectedTabId === null;
  }

  private selectTab(tabId: number) {
    this.selectedTabId = tabId;
    this.elements.startButton.disabled = false;
    document.querySelectorAll('.tab-item').forEach(element => {
      element.classList.toggle('selected', 
        element.querySelector('.tab-title')?.textContent === String(tabId));
    });
  }

  private updateTabCount(count: number) {
    const badge = this.elements.tabCountBadge;
    badge.style.transform = 'scale(1.2)';
    badge.textContent = `${count} tab${count !== 1 ? 's' : ''}`;
    setTimeout(() => {
      badge.style.transform = 'scale(1)';
    }, 200);
  }

  private async startCapture() {
    if (!this.selectedTabId) return;

    try {
      // First, activate the tab to get permission
      await chrome.tabs.update(this.selectedTabId, { active: true });
      
      // Wait a bit for the tab to become active
      await new Promise(resolve => setTimeout(resolve, 100));

      // Create audio context
      this.audioContext = new AudioContext();

      // Capture tab audio
      this.stream = await new Promise<MediaStream>((resolve, reject) => {
        chrome.tabCapture.capture(
          { 
            audio: true,
            video: false,
            audioConstraints: {
              mandatory: {
                chromeMediaSource: 'tab'
              }
            }
          },
          (stream) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else if (!stream) {
              reject(new Error('Failed to capture tab audio'));
            } else {
              resolve(stream);
            }
          }
        );
      });

      // Set up audio routing
      const source = this.audioContext.createMediaStreamSource(this.stream);
      source.connect(this.audioContext.destination);

      // Set up MediaRecorder
      this.audioChunks = [];
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        this.recordingBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        this.elements.audioPlayer.src = URL.createObjectURL(this.recordingBlob);
        this.elements.downloadButton.disabled = false;
      };

      this.mediaRecorder.start();
      this.updateUIForRecording(true);
    } catch (error) {
      this.showError(`Failed to start capture: ${error}`);
      // Clean up if there was an error
      await this.stopCapture();
    }
  }

  private async stopCapture() {
    try {
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      }
      
      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
      }

      if (this.audioContext) {
        await this.audioContext.close();
      }

      this.stream = null;
      this.audioContext = null;
      this.updateUIForRecording(false);
    } catch (error) {
      this.showError(`Failed to stop capture: ${error}`);
    }
  }

  private updateUIForRecording(isRecording: boolean) {
    this.elements.startButton.disabled = isRecording;
    this.elements.stopButton.disabled = !isRecording;
    this.elements.recordingIndicator.classList.toggle('active', isRecording);
    this.elements.status.textContent = isRecording ? 'Recording...' : 'Ready';
  }

  private downloadRecording() {
    if (!this.recordingBlob) return;

    const url = URL.createObjectURL(this.recordingBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tab-recording-${new Date().toISOString()}.webm`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private showError(error: string) {
    this.elements.status.textContent = error;
    console.error(error);
  }
}

// Initialize the sidebar
new AudioCaptureSidebar();
