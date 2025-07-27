import { spawn, ChildProcess } from 'child_process';
import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { getPlatform } from './platform';

export class FFmpegManager {
    private static instance: FFmpegManager;
    private ffmpegPath: string;
    private ffplayPath: string;
    private initialized: boolean = false;

    private constructor() {
        this.ffmpegPath = '';
        this.ffplayPath = '';
    }

    static getInstance(): FFmpegManager {
        if (!FFmpegManager.instance) {
            FFmpegManager.instance = new FFmpegManager();
        }
        return FFmpegManager.instance;
    }

    /**
     * Initialise les chemins vers les binaires FFmpeg embarqués
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;

        const platform = getPlatform();
        const arch = process.arch;
        const isPackaged = app.isPackaged;

        // Détermine le répertoire de base pour les binaires
        let binariesDir: string;
        if (isPackaged) {
            // En mode packagé, les binaires sont dans le répertoire de l'application
            binariesDir = path.join(process.resourcesPath, 'binaries');
        } else {
            // En mode développement, les binaires sont dans le répertoire du projet
            binariesDir = path.join(__dirname, '..', '..', 'binaries');
        }

        // Construit les chemins vers les binaires selon la plateforme
        const platformDir = path.join(binariesDir, platform, arch);
        
        if (platform === 'windows') {
            this.ffmpegPath = path.join(platformDir, 'ffmpeg.exe');
            this.ffplayPath = path.join(platformDir, 'ffplay.exe');
        } else {
            this.ffmpegPath = path.join(platformDir, 'ffmpeg');
            this.ffplayPath = path.join(platformDir, 'ffplay');
        }

        // Vérifie que les binaires existent
        const ffmpegExists = fs.existsSync(this.ffmpegPath);
        const ffplayExists = fs.existsSync(this.ffplayPath);

        if (!ffmpegExists || !ffplayExists) {
            throw new Error(`FFmpeg binaries not found at ${platformDir}`);
        }

        // Rend les binaires exécutables sur Linux/Mac
        if (platform !== 'windows') {
            try {
                fs.chmodSync(this.ffmpegPath, '755');
                fs.chmodSync(this.ffplayPath, '755');
            } catch (error) {
                console.warn('Failed to set executable permissions:', error);
            }
        }

        this.initialized = true;
        console.log(`FFmpeg initialized with binaries at: ${platformDir}`);
    }

    /**
     * Vérifie si FFmpeg est disponible et initialisé
     */
    async checkAvailability(): Promise<{
        ffmpeg: boolean;
        ffplay: boolean;
        allDependenciesMet: boolean;
    }> {
        try {
            await this.initialize();
            
            const ffmpegExists = fs.existsSync(this.ffmpegPath);
            const ffplayExists = fs.existsSync(this.ffplayPath);
            
            return {
                ffmpeg: ffmpegExists,
                ffplay: ffplayExists,
                allDependenciesMet: ffmpegExists && ffplayExists
            };
        } catch (error) {
            console.error('FFmpeg availability check failed:', error);
            return {
                ffmpeg: false,
                ffplay: false,
                allDependenciesMet: false
            };
        }
    }

    /**
     * Spawn un processus FFmpeg avec les arguments donnés
     */
    spawnFFmpeg(args: string[]): ChildProcess {
        if (!this.initialized) {
            throw new Error('FFmpeg not initialized. Call initialize() first.');
        }
        
        return spawn(this.ffmpegPath, args, {
            stdio: ['pipe', 'pipe', 'pipe']
        });
    }

    /**
     * Spawn un processus FFplay avec les arguments donnés
     */
    spawnFFplay(args: string[]): ChildProcess {
        if (!this.initialized) {
            throw new Error('FFmpeg not initialized. Call initialize() first.');
        }
        
        return spawn(this.ffplayPath, args, {
            stdio: ['pipe', 'pipe', 'pipe']
        });
    }

    /**
     * Obtient le chemin vers le binaire FFmpeg
     */
    getFFmpegPath(): string {
        return this.ffmpegPath;
    }

    /**
     * Obtient le chemin vers le binaire FFplay
     */
    getFFplayPath(): string {
        return this.ffplayPath;
    }
}
