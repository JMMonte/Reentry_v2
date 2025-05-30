/**
 * WorkerMessageHandler.js
 * 
 * Reusable utility for handling worker message patterns
 * Reduces boilerplate and standardizes error handling
 */

export class WorkerMessageHandler {
    constructor() {
        this.handlers = new Map();
        this.isInitialized = false;
        this.initializationHandler = null;
    }

    /**
     * Register a message type handler
     * @param {string} type - Message type
     * @param {Function} handler - Handler function (data) => Promise<void> | void
     */
    addHandler(type, handler) {
        this.handlers.set(type, handler);
    }

    /**
     * Register initialization handler
     * @param {Function} handler - Initialization handler (data) => void
     */
    onInitialize(handler) {
        this.initializationHandler = handler;
    }

    /**
     * Handle incoming message
     * @param {MessageEvent} event - Worker message event
     */
    async handleMessage(event) {
        const { type, data } = event.data;

        try {
            // Handle initialization
            if (type === 'updatePhysicsState' || type === 'initialize') {
                if (this.initializationHandler) {
                    await this.initializationHandler(data);
                    this.isInitialized = true;
                }
                return;
            }

            // Check if initialized for other operations
            const handler = this.handlers.get(type);
            if (!handler) {
                self.postMessage({
                    type: 'error',
                    error: `Unknown message type: ${type}`
                });
                return;
            }

            if (!this.isInitialized && type !== 'cancel') {
                self.postMessage({
                    type: 'error',
                    error: 'Worker not initialized. Call updatePhysicsState first.'
                });
                return;
            }

            // Execute handler
            await handler(data);

        } catch (error) {
            console.error(`[WorkerMessageHandler] Error handling message type '${type}':`, error);
            self.postMessage({
                type: 'error',
                error: error.message || 'Unknown error occurred'
            });
        }
    }

    /**
     * Send progress update to main thread
     * @param {string} type - Message type (e.g., 'chunk', 'progress')
     * @param {Object} data - Data to send
     */
    sendProgress(type, data) {
        self.postMessage({
            type,
            ...data
        });
    }

    /**
     * Send completion message
     * @param {Object} data - Completion data
     */
    sendComplete(data) {
        self.postMessage({
            type: 'complete',
            ...data
        });
    }

    /**
     * Send error message
     * @param {string|Error} error - Error message or Error object
     * @param {Object} additionalData - Additional error data
     */
    sendError(error, additionalData = {}) {
        const errorMessage = error instanceof Error ? error.message : error;
        self.postMessage({
            type: 'error',
            error: errorMessage,
            ...additionalData
        });
    }

    /**
     * Get initialization status
     */
    getInitializationStatus() {
        return this.isInitialized;
    }
}