import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { OpenAI } from 'openai';
import { assistantService } from './assistantService.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const server = createServer(app);

// Configure CORS
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:1234',
  methods: ['GET', 'POST'],
  credentials: true
}));

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:1234',
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

io.on('connection', (socket) => {
  console.log('Client connected');

  socket.on('chat message', async (message) => {
    try {
      if (typeof message !== 'string') {
        throw new Error('Message must be a string');
      }

      console.log('Received message:', message);
      
      // Emit user message back to client
      socket.emit('message', {
        role: 'user',
        content: message,
        status: 'completed'
      });

      // Get assistant response
      await assistant.sendMessage(socket, message);
      
    } catch (error) {
      console.error('Error handling message:', error);
      socket.emit('error', error.message);
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
