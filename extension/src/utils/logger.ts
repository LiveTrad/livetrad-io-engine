/**
 * Logger utilitaire avancé avec timestamps, coloration et support JSON
 * Version navigateur - Ne dépend pas des modules Node.js
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// Niveaux de log par ordre de sévérité
const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

// Configuration par défaut (navigateur uniquement)
const DEFAULT_CONFIG: Required<LoggerConfig> = {
  minLevel: 'debug',
  useColors: true,
  includeTimestamp: true,
  logToConsole: true,
  logToFile: false,
  filePath: 'logs/application.log',
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5
};

// Codes de couleur ANSI (utilisés dans la console)
const COLORS = {
  debug: '\x1b[36m', // Cyan
  info: '\x1b[32m',  // Green
  warn: '\x1b[33m',  // Yellow
  error: '\x1b[31m', // Red
  reset: '\x1b[0m',  // Reset
  gray: '\x1b[90m',  // Gray
  magenta: '\x1b[35m',
  blue: '\x1b[34m'
};

// Type pour les métadonnées de log
type LogMetadata = Record<string, any>;

// Interface pour les options de configuration
export interface LoggerConfig {
  minLevel?: LogLevel;
  useColors?: boolean;
  includeTimestamp?: boolean;
  logToConsole?: boolean;
  logToFile?: boolean;
  filePath?: string;
  maxFileSize?: number;
  maxFiles?: number;
}

class Logger {
  private config: Required<LoggerConfig>;
  private minLevel: number;
  private logQueue: Array<() => void> = [];
  private isProcessingQueue = false;

  constructor(config: LoggerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.minLevel = LOG_LEVELS[this.config.minLevel];
    
    // Initialiser la rotation des fichiers si activée
    if (this.config.logToFile && typeof window === 'undefined') {
      this.ensureLogDirectory();
    }
  }

  // Méthodes de log publiques
  debug(context: string, message: string, meta: LogMetadata = {}): void {
    this.log('debug', context, message, meta);
  }

  info(context: string, message: string, meta: LogMetadata = {}): void {
    this.log('info', context, message, meta);
  }

  warn(context: string, message: string, meta: LogMetadata = {}): void {
    this.log('warn', context, message, meta);
  }

  error(context: string, message: string | Error, meta: LogMetadata = {}): void {
    if (message instanceof Error) {
      this.logError(context, message, meta);
    } else {
      this.log('error', context, message, meta);
    }
  }

  errorWithDetails(context: string, error: unknown, details: Record<string, any> = {}): void {
    const errorMessage = error instanceof Error 
      ? error.message 
      : typeof error === 'string' 
        ? error 
        : 'Unknown error';
    
    const stack = error instanceof Error ? error.stack : undefined;
    
    this.log('error', context, errorMessage, {
      ...details,
      stack,
      error: error
    });
  }

  // Log structuré au format JSON
  json(level: LogLevel, context: string, data: any): void {
    if (this.shouldSkip(level)) return;
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      context,
      ...(typeof data === 'object' ? data : { message: String(data) })
    };

    this.addToQueue(() => {
      if (this.config.logToConsole) {
        console[level === 'error' ? 'error' : 'log'](JSON.stringify(logEntry));
      }
    });
  }

  // Configuration dynamique
  configure(newConfig: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.minLevel = LOG_LEVELS[this.config.minLevel];
  }

  // Méthodes privées
  private log(level: LogLevel, context: string, message: string, meta: LogMetadata): void {
    if (this.shouldSkip(level)) return;

    const timestamp = new Date().toISOString();
    const formattedMessage = this.formatMessage(level, timestamp, context, message, meta);
    
    this.addToQueue(() => {
      if (this.config.logToConsole) {
        const consoleMethod = console[level] || console.log;
        consoleMethod(formattedMessage);
      }
      
      if (this.config.logToFile) {
        this.writeToFile(formattedMessage);
      }
    });
  }

  private logError(context: string, error: Error, meta: LogMetadata): void {
    if (this.shouldSkip('error')) return;

    const timestamp = new Date().toISOString();
    const errorInfo = {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...meta
    };
    
    const formattedError = this.formatMessage('error', timestamp, context, error.message, errorInfo);
    
    this.addToQueue(() => {
      if (this.config.logToConsole) {
        console.error(formattedError);
      }
      
      if (this.config.logToFile) {
        this.writeToFile(formattedError);
      }
    });
  }

  private formatMessage(level: LogLevel, timestamp: string, context: string, message: string, meta: any): string {
    const color = this.config.useColors ? COLORS[level] : '';
    const reset = this.config.useColors ? COLORS.reset : '';
    const gray = this.config.useColors ? COLORS.gray : '';
    
    const timestampPart = this.config.includeTimestamp ? `${gray}[${timestamp}]${reset} ` : '';
    const levelPart = `${color}${level.toUpperCase().padEnd(5)}${reset}`;
    const contextPart = context ? `[${context}]` : '';
    
    let metaPart = '';
    if (meta && Object.keys(meta).length > 0) {
      try {
        metaPart = ' ' + JSON.stringify(meta, (_, value) => {
          if (value instanceof Error) {
            return {
              name: value.name,
              message: value.message,
              stack: value.stack
            };
          }
          return value;
        }, 2);
      } catch (e) {
        metaPart = ' [Unable to stringify meta]';
      }
    }
    
    return `${timestampPart}${levelPart} ${contextPart} ${message}${metaPart}`.trim();
  }

  private shouldSkip(level: LogLevel): boolean {
    return LOG_LEVELS[level] < this.minLevel;
  }

  private addToQueue(logFn: () => void): void {
    this.logQueue.push(logFn);
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.logQueue.length === 0) return;
    
    this.isProcessingQueue = true;
    
    try {
      while (this.logQueue.length > 0) {
        const logFn = this.logQueue.shift();
        if (logFn) {
          try {
            logFn();
          } catch (e) {
            console.error('Error in log function:', e);
          }
        }
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  private ensureLogDirectory(): void {
    // No-op in browser environment
  }

  private writeToFile(_message: string): void {
    // No-op in browser environment
  }

  private rotateLogs(): void {
    // No-op in browser environment
  }
}

// Instance par défaut
export const logger = new Logger();

// Méthodes pratiques pour une utilisation simplifiée
export const log = {
  debug: (context: string, message: string, meta?: LogMetadata) => logger.debug(context, message, meta),
  info: (context: string, message: string, meta?: LogMetadata) => logger.info(context, message, meta),
  warn: (context: string, message: string, meta?: LogMetadata) => logger.warn(context, message, meta),
  error: (context: string, message: string | Error, meta?: LogMetadata) => logger.error(context, message, meta),
  errorWithDetails: (context: string, error: unknown, details?: Record<string, any>) => logger.errorWithDetails(context, error, details),
  json: (level: LogLevel, context: string, data: any) => logger.json(level, context, data),
  configure: (config: Partial<LoggerConfig>) => logger.configure(config)
};

// Méthode utilitaire pour logger les erreurs avec des détails
export function errorWithDetails(context: string, error: unknown, details: Record<string, any> = {}) {
  if (error instanceof Error) {
    logger.error(context, error.message, { 
      stack: error.stack,
      name: error.name,
      ...details 
    });
  } else {
    logger.error(context, String(error), details);
  }
}

// Méthode utilitaire pour formater un message (compatibilité ascendante)
function formatMessage(level: LogLevel, context: string, ...args: any[]): string {
  const timestamp = new Date().toISOString();
  const color = COLORS[level] || '';
  const reset = COLORS.reset;
  const contextStr = context ? `[${context}]` : '';
  
  return `${COLORS.gray}[${timestamp}]${reset} ${color}${level.toUpperCase().padEnd(5)}${reset} ${contextStr} ${args.join(' ')}`;
}

// Ajout de la méthode errorWithDetails à la classe Logger
Logger.prototype.errorWithDetails = function(context: string, error: unknown, details: Record<string, any> = {}) {
  errorWithDetails(context, error, details);
};

// Ajout de la méthode à l'instance exportée par défaut
(logger as any).errorWithDetails = errorWithDetails;

// Export pour une utilisation globale (optionnel)
declare global {
  interface Window {
    __logger: typeof logger;
  }
}

if (typeof window !== 'undefined') {
  window.__logger = logger;
}
