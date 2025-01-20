// Background script
console.log('LiveTrad: Background script loaded');

let activeStream: MediaStream | null = null;

chrome.runtime.onConnect.addListener((port) => {
  console.log('LiveTrad: Port connected:', port.name);
  
  port.onMessage.addListener(async (message) => {
    console.log('LiveTrad: Port received message:', message);

    if (message.type === 'GET_PROCESSOR_URL') {
      console.log('LiveTrad: Getting processor URL');
      const processorUrl = chrome.runtime.getURL('generated/audioProcessor.js');
      console.log('LiveTrad: Processor URL:', processorUrl);
      port.postMessage({ type: 'PROCESSOR_URL_RESPONSE', processorUrl });
    }

    if (message.type === 'START_TAB_CAPTURE') {
      console.log('LiveTrad: Starting tab capture');
      try {
        const stream = await new Promise<MediaStream>((resolve, reject) => {
          chrome.tabCapture.capture({
            audio: true,
            video: false
          }, (stream) => {
            if (chrome.runtime.lastError) {
              console.error('LiveTrad: Tab capture error:', chrome.runtime.lastError);
              reject(chrome.runtime.lastError);
              return;
            }
            if (!stream) {
              console.error('LiveTrad: No stream available');
              reject(new Error('No stream available'));
              return;
            }
            resolve(stream);
          });
        });

        activeStream = stream;
        const audioTracks = stream.getAudioTracks();
        console.log('LiveTrad: Tab capture successful, tracks:', audioTracks.length);
        
        port.postMessage({
          type: 'TAB_CAPTURE_RESPONSE',
          success: true,
          trackInfo: audioTracks.map(track => ({
            id: track.id,
            label: track.label,
            enabled: track.enabled
          }))
        });
      } catch (error: unknown) {
        console.error('LiveTrad: Tab capture failed:', error);
        port.postMessage({
          type: 'TAB_CAPTURE_RESPONSE',
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    if (message.type === 'STOP_TAB_CAPTURE') {
      console.log('LiveTrad: Stopping tab capture');
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
        activeStream = null;
      }
      port.postMessage({ type: 'TAB_CAPTURE_STOPPED' });
    }
  });

  port.onDisconnect.addListener(() => {
    console.log('LiveTrad: Port disconnected:', port.name);
    if (activeStream) {
      activeStream.getTracks().forEach(track => track.stop());
      activeStream = null;
    }
  });
});
