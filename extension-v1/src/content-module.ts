console.log('LiveTrad Content: Script loaded');

let mediaStream: MediaStream | null = null;

interface CaptureResponse {
  success: boolean;
  error?: string;
  trackInfo?: Array<{
    id: string;
    label: string;
    enabled: boolean;
  }>;
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('LiveTrad Content: Received message:', message);

  if (message.type === 'PING') {
    console.log('LiveTrad Content: Responding to ping');
    sendResponse({ success: true });
    return;
  }

  if (message.type === 'START_CAPTURE') {
    console.log('LiveTrad Content: Starting capture');
    startCapture().then(sendResponse);
    return true; // Will respond asynchronously
  }

  if (message.type === 'STOP_CAPTURE') {
    stopCapture();
    sendResponse({ success: true });
  }

  if (message.type === 'getStatus') {
    const status = {
      hasAudioCapture: mediaStream !== null,
      url: window.location.href,
      tabId: chrome.runtime.id,
      timestamp: new Date().toISOString()
    };
    console.log('LiveTrad Content: Sending status:', status);
    sendResponse(status);
  }
});

async function startCapture(): Promise<CaptureResponse> {
  console.log('LiveTrad Content: Starting capture');
  try {
    // We'll get the stream from the background script
    return {
      success: true
    };
  } catch (error) {
    console.error('LiveTrad Content: Capture failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function stopCapture() {
  console.log('LiveTrad Content: Stopping capture');
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => {
      console.log('LiveTrad Content: Stopping track:', track.label);
      track.stop();
    });
    mediaStream = null;
  }
}

// Nettoyer lors de la fermeture de la page
window.addEventListener('unload', async () => {
  console.log('LiveTrad Content: Page unloading, cleaning up');
  stopCapture();
});

console.log('LiveTrad Content: Module initialized');