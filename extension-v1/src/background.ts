console.log('LiveTrad Background: Script starting');

interface CaptureResponse {
  success: boolean;
  error?: string;
  trackInfo?: Array<{
    id: string;
    label: string;
    enabled: boolean;
  }>;
}

async function hasOffscreenDocument(): Promise<boolean> {
  const windows = chrome.extension.getViews({ type: 'offscreen' });
  return windows.length > 0;
}

async function createOffscreenDocument() {
  if (await hasOffscreenDocument()) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['AUDIO_PLAYBACK'] as chrome.offscreen.Reason[],
    justification: 'Handle tab audio capture'
  });
}

chrome.runtime.onConnect.addListener((port) => {
  console.log('LiveTrad Background: Port connected:', {
    name: port.name,
    id: port.sender?.id,
    url: port.sender?.url,
    timestamp: new Date().toISOString()
  });
  
  port.onMessage.addListener(async (message) => {
    console.log('LiveTrad Background: Port received message:', {
      type: message.type,
      port: port.name,
      timestamp: new Date().toISOString()
    });

    if (message.type === 'GET_PROCESSOR_URL') {
      console.log('LiveTrad Background: Getting processor URL');
      const processorUrl = chrome.runtime.getURL('generated/audioProcessor.js');
      console.log('LiveTrad Background: Processor URL:', processorUrl);
      port.postMessage({ type: 'PROCESSOR_URL_RESPONSE', processorUrl });
    }

    if (message.type === 'START_TAB_CAPTURE') {
      console.log('LiveTrad Background: Starting tab capture');
      try {
        // Ensure offscreen document exists
        await createOffscreenDocument();

        // Send capture request to offscreen document
        const response = await chrome.runtime.sendMessage({ type: 'START_CAPTURE' });
        console.log('LiveTrad Background: Offscreen response:', response);

        if (!response.success) {
          throw new Error(response.error || 'Failed to start capture');
        }

        port.postMessage({
          type: 'TAB_CAPTURE_RESPONSE',
          success: true
        });

      } catch (error) {
        console.error('LiveTrad Background: Tab capture failed:', error);
        port.postMessage({
          type: 'TAB_CAPTURE_RESPONSE',
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    if (message.type === 'STOP_TAB_CAPTURE') {
      console.log('LiveTrad Background: Stopping tab capture');
      try {
        await chrome.runtime.sendMessage({ type: 'STOP_CAPTURE' });
      } catch (error) {
        console.error('LiveTrad Background: Error stopping capture:', error);
      }
      port.postMessage({ type: 'TAB_CAPTURE_STOPPED' });
    }
  });

  port.onDisconnect.addListener(() => {
    console.log('LiveTrad Background: Port disconnected:', {
      name: port.name,
      error: chrome.runtime.lastError,
      timestamp: new Date().toISOString()
    });
  });
});

console.log('LiveTrad Background: Script loaded');
