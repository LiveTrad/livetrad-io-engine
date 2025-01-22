export interface AudioCaptureState {
  isCapturing: boolean;
  activeTabId: number | null;
  stream: MediaStream | null;
  mediaRecorder: MediaRecorder | null;
}

export interface TabInfo {
  id: number;
  title: string;
  url: string;
}

export type MessageType = {
  type: 'START_CAPTURE';
  tabId: number;
} | {
  type: 'STOP_CAPTURE';
  tabId: number;
} | {
  type: 'GET_RECORDING_STATE';
} | {
  type: 'GET_TABS';
};

export type ResponseType = {
  success: true;
  stream?: MediaStream;
  state?: AudioCaptureState;
  tabs?: TabInfo[];
} | {
  success: false;
  error: string;
};
