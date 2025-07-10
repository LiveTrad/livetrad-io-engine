import { spawn } from 'child_process';
import { dialog } from 'electron';
import { getPlatform } from './platform';

/**
 * Vérifie si une commande est disponible dans le PATH système
 */
const isCommandAvailable = async (command: string): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
        const checkCommand = getPlatform() === 'windows' ? 'where' : 'which';
        const check = spawn(checkCommand, [command], { shell: true });
        
        check.on('close', (code: number) => {
            resolve(code === 0);
        });
        
        check.on('error', () => {
            resolve(false);
        });
    });
};

export const checkFFmpegDependencies = async (): Promise<{
    ffmpeg: boolean;
    ffplay: boolean;
    allDependenciesMet: boolean;
}> => {
    const [ffmpeg, ffplay] = await Promise.all([
        isCommandAvailable('ffmpeg'),
        isCommandAvailable('ffplay')
    ]);

    return {
        ffmpeg,
        ffplay,
        allDependenciesMet: ffmpeg && ffplay
    };
};

export const showMissingDependenciesDialog = (missingDeps: string[]): void => {
    let message = 'Les dépendances suivantes sont manquantes ou non accessibles :\n\n';
    
    missingDeps.forEach(dep => {
        message += `• ${dep}\n`;
    });
    
    message += '\nVeuillez installer les dépendances manquantes et ajouter leur répertoire d\'installation à votre variable d\'environnement PATH.';
    
    dialog.showErrorBox('Dépendances manquantes', message);
};
