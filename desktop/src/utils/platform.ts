/**
 * Utilitaires liés à la détection et à la gestion des plateformes
 */

export type Platform = 'windows' | 'macos' | 'linux' | 'other';

export const getPlatform = (): Platform => {
    switch (process.platform) {
        case 'win32':
            return 'windows';
        case 'darwin':
            return 'macos';
        case 'linux':
            return 'linux';
        default:
            return 'other';
    }
};

export const isWindows = (): boolean => getPlatform() === 'windows';
export const isMacOS = (): boolean => getPlatform() === 'macos';
export const isLinux = (): boolean => getPlatform() === 'linux';

// Ajoutez ici d'autres utilitaires spécifiques à la plateforme si nécessaire
