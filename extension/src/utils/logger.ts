/**
 * Logger utilitaire avec timestamps et coloration pour une meilleure lisibilité
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const colors = {
  debug: '\x1b[36m', // Cyan
  info: '\x1b[32m',  // Green
  warn: '\x1b[33m',  // Yellow
  error: '\x1b[31m', // Red
  reset: '\x1b[0m',  // Reset
  gray: '\x1b[90m'   // Gray
};

function getTimestamp(): string {
  return new Date().toISOString();
}

function formatMessage(level: LogLevel, context: string, ...args: any[]): string {
  const timestamp = getTimestamp();
  const color = colors[level];
  const reset = colors.reset;
  const contextStr = context ? `[${context}]` : '';
  
  return `${colors.gray}[${timestamp}]${reset} ${color}${level.toUpperCase().padEnd(5)}${reset} ${contextStr} ${args.join(' ')}`;
}

export const logger = {
  debug: (context: string, ...args: any[]) => {
    console.debug(formatMessage('debug', context, ...args));
  },
  
  info: (context: string, ...args: any[]) => {
    console.info(formatMessage('info', context, ...args));
  },
  
  warn: (context: string, ...args: any[]) => {
    console.warn(formatMessage('warn', context, ...args));
  },
  
  error: (context: string, ...args: any[]) => {
    console.error(formatMessage('error', context, ...args));
  },
  
  /**
   * Log une erreur avec des détails supplémentaires
   */
  errorWithDetails: (context: string, error: unknown, details: Record<string, any> = {}) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    
    console.error(formatMessage('error', context, `Error: ${errorMessage}`));
    
    if (Object.keys(details).length > 0) {
      console.error(formatMessage('error', context, 'Details:', JSON.stringify(details, null, 2)));
    }
    
    if (stack) {
      console.error(formatMessage('debug', context, 'Stack trace:\n', stack));
    }
  }
};

// Export pour une utilisation globale (optionnel)
declare global {
  interface Window {
    __logger: typeof logger;
  }
}

if (typeof window !== 'undefined') {
  window.__logger = logger;
}
