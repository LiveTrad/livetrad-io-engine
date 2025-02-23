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

// Liste des domaines qui sont potentiellement des sources audio
export const audioSourceDomains = [
    'meet.google.com',
    'zoom.us',
    'teams.microsoft.com',
    'youtube.com',
    'youtu.be',
    'vimeo.com',
    'dailymotion.com',
    'twitch.tv',
    'spotify.com',
    'deezer.com',
    'soundcloud.com',
    'discord.com',
    'slack.com',
    'webex.com',
    'gotomeeting.com'
];

export const defaultConfig = {
    ...defaultAudioConfig,
    showAllTabs: false // Option pour afficher tous les onglets ou seulement les sources potentielles
};