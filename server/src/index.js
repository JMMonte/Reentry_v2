import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { assistantService } from './assistantService.js';

dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:1234', 'http://localhost:3000'],
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Initialize the assistant service with io instance
const assistant = assistantService(io);

// Add Content Security Policy headers
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self' http://localhost:3000 http://localhost:1234; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com; " +
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com; " +
    "img-src 'self' data: blob: https:; " +
    "connect-src 'self' http://localhost:3000 http://localhost:1234 ws://localhost:* wss://localhost:*;"
  );
  next();
});

// CORS middleware
app.use(cors({
  origin: ['http://localhost:1234', 'http://localhost:3000'],
  methods: ['GET', 'POST'],
  credentials: true
}));

// Socket.IO connection handling
io.on('connection', async (socket) => {
  console.log('Client connected:', socket.id);

  try {
    // Initialize the assistant service for this socket
    await assistant.initialize();
    
    // Handle chat messages
    socket.on('chat message', async (message) => {
      try {
        const response = await assistant.sendMessage(socket.id, message);
        socket.emit('response', response);
      } catch (error) {
        console.error('Error processing message:', error);
        socket.emit('error', error.message);
      }
    });

    // Handle function call responses from client
    socket.on('function_result', async (data) => {
      try {
        const { name, result } = data;
        console.log(`Received function result for ${name}:`, result);
        // The result will be used in the next assistant message
      } catch (error) {
        console.error('Error handling function result:', error);
      }
    });

    // Handle disconnection
    socket.on('disconnect', async () => {
      try {
        console.log('Client disconnected:', socket.id);
        await assistant.cleanupThread(socket.id);
      } catch (error) {
        console.error('Error cleaning up thread:', error);
      }
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error('Socket error:', error);
      socket.emit('error', 'An unexpected error occurred');
    });

  } catch (error) {
    console.error('Error initializing assistant:', error);
    socket.emit('error', 'Failed to initialize chat assistant');
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
