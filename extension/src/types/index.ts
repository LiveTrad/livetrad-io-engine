export interface AudioCaptureState {
  isStreaming: boolean;
  activeTabId: number | null;
  stream: MediaStream | null;
}

export interface TabInfo {
  id: number;
  title: string;
  url: string;
  favIconUrl?: string;
}

export interface ConnectionState {
  status: 'connected' | 'disconnected' | 'connecting';
  desktopUrl: string;
}

export type MessageType = {
  type: 'START_STREAMING';
  tabId: number;
} | {
  type: 'STOP_STREAMING';
  tabId: number;
} | {
  type: 'GET_STREAMING_STATE';
} | {
  type: 'GET_TABS';
} | {
  type: 'CONNECT_DESKTOP';
} | {
  type: 'DISCONNECT_DESKTOP';
};

export type ResponseType = {
  success: true;
  stream?: MediaStream;
  state?: AudioCaptureState;
  tabs?: TabInfo[];
  connection?: ConnectionState;
} | {
  success: false;
  error: string;
};
