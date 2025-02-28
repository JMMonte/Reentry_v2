import express from 'express';
import { createServer } from 'http';
import { Socket } from 'socket.io';
import { OpenAI } from 'openai';

// Import from our modular structure
import config from './config/env.js';
import { setupCors } from './middleware/cors.js';
import { setupSocketIO } from './middleware/socket.js';
import { createAssistantService } from './services/assistant/index.js';
import { createLogger } from './utils/logger.js';
import { setupGlobalErrorHandlers, handleSocketError } from './utils/errors.js';

// Setup logger
const logger = createLogger('Server');

// Setup global error handlers
setupGlobalErrorHandlers();

// Initialize Express app
const app = express();
const server = createServer(app);

// Configure middlewares
setupCors(app);

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: config.openaiApiKey
});

// Initialize Socket.IO
const io = setupSocketIO(server);

// Initialize AssistantService
const assistant = createAssistantService(openai);

// Initialize the assistant when the server starts
assistant.initialize().catch(error => {
    logger.error('Failed to initialize assistant', error);
    process.exit(1);
});

// Setup socket event handlers
io.on('connection', (socket: Socket) => {
    logger.info('Client connected');

    socket.on('chat message', async (message: string, threadId: string | null) => {
        try {
            if (typeof message !== 'string') {
                throw new Error('Message must be a string');
            }

            // Get assistant response
            await assistant.sendMessage(socket, message, threadId);

        } catch (error: any) {
            logger.error('Error handling message', error);
            handleSocketError(socket, error);
        }
    });

    socket.on('disconnect', () => {
        logger.info('Client disconnected');
    });
});

// Start the server
server.listen(config.port, () => {
    logger.info(`Server running on port ${config.port}`);
}); 