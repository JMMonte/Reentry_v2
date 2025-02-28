import config from '../config/env.js';

// Add colors to console based on log level
const colors = {
    error: '\x1b[31m', // red
    warn: '\x1b[33m',  // yellow
    info: '\x1b[36m',  // cyan
    debug: '\x1b[32m', // green
    reset: '\x1b[0m'   // reset
};

class Logger {
    private namespace: string;
    private isDevelopment: boolean;

    constructor(namespace: string) {
        this.namespace = namespace;
        this.isDevelopment = config.environment === 'development';
    }

    private formatMessage(level: string, message: string): string {
        const timestamp = new Date().toISOString();
        return `[${timestamp}] [${level.toUpperCase()}] [${this.namespace}] ${message}`;
    }

    error(message: string, error?: any): void {
        const formattedMessage = this.formatMessage('error', message);
        console.error(`${colors.error}${formattedMessage}${colors.reset}`);
        if (error) {
            console.error(error);
        }
    }

    warn(message: string): void {
        const formattedMessage = this.formatMessage('warn', message);
        console.warn(`${colors.warn}${formattedMessage}${colors.reset}`);
    }

    info(message: string): void {
        const formattedMessage = this.formatMessage('info', message);
        console.info(`${colors.info}${formattedMessage}${colors.reset}`);
    }

    debug(message: string, data?: any): void {
        if (this.isDevelopment) {
            const formattedMessage = this.formatMessage('debug', message);
            console.debug(`${colors.debug}${formattedMessage}${colors.reset}`);
            if (data) {
                console.debug(data);
            }
        }
    }
}

export const createLogger = (namespace: string): Logger => {
    return new Logger(namespace);
}; 