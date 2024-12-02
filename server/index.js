import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { assistantService } from './assistantService.js';

dotenv.config();

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:1234", // Parcel's default port
    methods: ["GET", "POST"]
  }
});

// Initialize the assistant service
assistantService.initialize();

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected');

  socket.on('chat message', async (message) => {
    console.log('Received message from client:', message);
    
    try {
      // Get response from OpenAI Assistant
      const response = await assistantService.sendMessage(socket.id, message);
      
      // Emit the response back to the client
      socket.emit('response', response);
    } catch (error) {
      console.error('Error processing message:', error);
      socket.emit('error', error.message || 'Failed to process message');
    }
  });

  socket.on('disconnect', async () => {
    console.log('Client disconnected');
    // Clean up the thread when the client disconnects
    await assistantService.cleanupThread(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
