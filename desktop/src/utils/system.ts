import { dialog } from 'electron';

export const isWindows = (): boolean => {
    return process.platform === 'win32';
};

export const checkFFmpegInstalled = async (): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
        const checkCommand = isWindows() ? 'where' : 'which';
        const ffmpegCheck = require('child_process').spawn(checkCommand, ['ffmpeg'], { shell: true });
        
        ffmpegCheck.on('close', (code: number) => {
            resolve(code === 0);
        });
        
        ffmpegCheck.on('error', () => {
            resolve(false);
        });
    });
};

export const checkFFplayInstalled = async (): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
        const checkCommand = isWindows() ? 'where' : 'which';
        const ffplayCheck = require('child_process').spawn(checkCommand, ['ffplay'], { shell: true });
        
        ffplayCheck.on('close', (code: number) => {
            resolve(code === 0);
        });
        
        ffplayCheck.on('error', () => {
            resolve(false);
        });
    });
};

export const showErrorDialog = (title: string, message: string): void => {
    dialog.showErrorBox(title, message);
};

export const checkDependencies = async (): Promise<{ffmpeg: boolean, ffplay: boolean}> => {
    const [hasFFmpeg, hasFFplay] = await Promise.all([
        checkFFmpegInstalled(),
        checkFFplayInstalled()
    ]);
    
    return { ffmpeg: hasFFmpeg, ffplay: hasFFplay };
};
