import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

class AssistantService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    this.threadsBySocketId = new Map();
    this.assistant = null;
  }

  async initialize() {
    try {
      // Get the assistant, or create one if it doesn't exist
      const assistants = await this.openai.beta.assistants.list();
      this.assistant = assistants.data.find(a => a.name === "Reentry Assistant");
      
      if (!this.assistant) {
        this.assistant = await this.openai.beta.assistants.create({
          name: "Reentry Assistant",
          instructions: "You are an expert in orbital mechanics and space simulation, helping users understand and work with the Reentry space simulation software.",
          model: "gpt-4-turbo-preview",
          tools: [{ type: "code_interpreter" }]
        });
      }
      
      console.log('Assistant initialized with ID:', this.assistant.id);
    } catch (error) {
      console.error('Error initializing assistant:', error);
      throw error;
    }
  }

  async getOrCreateThread(socketId) {
    if (!this.threadsBySocketId.has(socketId)) {
      const thread = await this.openai.beta.threads.create();
      this.threadsBySocketId.set(socketId, thread);
      return thread;
    }
    return this.threadsBySocketId.get(socketId);
  }

  async sendMessage(socketId, message) {
    try {
      const thread = await this.getOrCreateThread(socketId);
      
      // Add the user's message to the thread
      await this.openai.beta.threads.messages.create(thread.id, {
        role: "user",
        content: message
      });

      // Run the assistant
      const run = await this.openai.beta.threads.runs.create(thread.id, {
        assistant_id: this.assistant.id
      });

      // Wait for the run to complete
      let runStatus = await this.openai.beta.threads.runs.retrieve(thread.id, run.id);
      
      while (runStatus.status !== 'completed') {
        if (runStatus.status === 'failed') {
          throw new Error('Assistant run failed: ' + runStatus.last_error?.message);
        }
        
        // Wait for 1 second before checking again
        await new Promise(resolve => setTimeout(resolve, 1000));
        runStatus = await this.openai.beta.threads.runs.retrieve(thread.id, run.id);
      }

      // Get the messages (including the new response)
      const messages = await this.openai.beta.threads.messages.list(thread.id);
      const lastMessage = messages.data[0]; // Most recent message first

      return lastMessage.content[0].text.value;
    } catch (error) {
      console.error('Error in sendMessage:', error);
      throw error;
    }
  }

  async cleanupThread(socketId) {
    if (this.threadsBySocketId.has(socketId)) {
      // Optionally delete the thread from OpenAI
      const thread = this.threadsBySocketId.get(socketId);
      try {
        await this.openai.beta.threads.del(thread.id);
      } catch (error) {
        console.error('Error deleting thread:', error);
      }
      this.threadsBySocketId.delete(socketId);
    }
  }
}

export const assistantService = new AssistantService();
