export interface AudioConfig {
  sampleRate: number;
  channels: number;
  bufferSize: number;
}

export const defaultAudioConfig: AudioConfig = {
  sampleRate: 16000,
  channels: 1,
  bufferSize: 4096
};