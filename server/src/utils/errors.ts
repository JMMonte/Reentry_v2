import { Socket } from 'socket.io';
import { createLogger } from './logger.js';

const logger = createLogger('ErrorHandler');

/**
 * Custom error class for application-specific errors
 */
export class AppError extends Error {
    public statusCode: number;
    public isOperational: boolean;

    constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;

        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Handles socket errors and emits them to the client
 * @param socket Socket connection
 * @param error The error to handle
 */
export const handleSocketError = (socket: Socket, error: any): void => {
    logger.error('Socket error:', error);

    const message = error instanceof Error
        ? error.message
        : 'An unexpected error occurred';

    socket.emit('error', { message });
};

/**
 * Global error handler for uncaught exceptions and unhandled rejections
 */
export const setupGlobalErrorHandlers = (): void => {
    // Handle uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
        logger.error('UNCAUGHT EXCEPTION! Shutting down...', error);
        process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (error: Error) => {
        logger.error('UNHANDLED REJECTION! Shutting down...', error);
        process.exit(1);
    });
}; 