import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import { OpenAI } from 'openai';
import { assistantService } from './assistantService.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const server = createServer(app);

// CORS Configuration
const getAllowedOrigins = () => {
    const origins = process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',') : [];
    
    // Add development origins only in non-production
    if (process.env.NODE_ENV !== 'production') {
        origins.push('http://localhost:1234', 'http://localhost:4000');
    }
    
    return origins;
};

const allowedOrigins = getAllowedOrigins();

// Configure CORS for Express
app.use(cors({
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
}));

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Initialize Socket.IO with explicit CORS config
const io = new Server(server, {
    cors: {
        origin: (origin, callback) => {
            // Allow requests with no origin (like mobile apps or curl requests)
            if (!origin) return callback(null, true);
            
            const isAllowed = allowedOrigins.includes(origin);
            console.log('Origin:', origin, 'Allowed:', isAllowed);
            
            if (isAllowed) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        },
        methods: ['GET', 'POST'],
        credentials: true
    }
});

// Initialize AssistantService
const assistant = assistantService(openai);

// Initialize the assistant when the server starts
assistant.initialize().catch(error => {
    console.error('Failed to initialize assistant:', error);
    process.exit(1);
});

io.on('connection', (socket: Socket) => {
    console.log('Client connected');

    socket.on('chat message', async (message: string, threadId: string | null) => {
        try {
            if (typeof message !== 'string') {
                throw new Error('Message must be a string');
            }

            // Get assistant response
            await assistant.sendMessage(socket, message, threadId);

        } catch (error) {
            console.error('Error handling message:', error);
            socket.emit('error', (error as Error).message);
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`Server running on port ${port}`);
}); 