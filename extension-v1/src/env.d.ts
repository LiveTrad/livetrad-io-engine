/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME: string
  readonly VITE_APP_VERSION: string
  readonly VITE_DEBUG_MODE: string
  readonly VITE_AUDIO_SAMPLE_RATE: string
  readonly VITE_AUDIO_CHANNELS: string
  readonly VITE_SUPPORTED_PLATFORMS: string
  readonly VITE_WS_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
