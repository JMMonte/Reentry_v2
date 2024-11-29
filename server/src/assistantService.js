import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

// Define the available tools for the assistant
const ASSISTANT_TOOLS = [
  {
    type: "function",
    function: {
      name: "createSatelliteFromLatLon",
      description: "Creates a satellite based on latitude and longitude coordinates relative to Earth",
      parameters: {
        type: "object",
        properties: {
          latitude: {
            type: "number",
            description: "Latitude in degrees (-90 to 90)",
          },
          longitude: {
            type: "number",
            description: "Longitude in degrees (-180 to 180)",
          },
          altitude: {
            type: "number",
            description: "Altitude in kilometers above Earth's surface",
          },
          velocity: {
            type: "number",
            description: "Initial velocity in km/s",
          },
          azimuth: {
            type: "number",
            description: "Azimuth angle in degrees (0-North, 90-East, 180-South, 270-West)",
          }
        },
        required: ["latitude", "longitude", "altitude", "velocity", "azimuth"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createSatelliteFromOrbitalElements",
      description: "Creates a satellite using Keplerian orbital elements",
      parameters: {
        type: "object",
        properties: {
          semiMajorAxis: {
            type: "number",
            description: "Semi-major axis in kilometers",
          },
          eccentricity: {
            type: "number",
            description: "Orbital eccentricity (0-1 for elliptical orbits)",
          },
          inclination: {
            type: "number",
            description: "Orbital inclination in degrees",
          },
          raan: {
            type: "number",
            description: "Right Ascension of the Ascending Node (RAAN) in degrees",
          },
          argumentOfPeriapsis: {
            type: "number",
            description: "Argument of periapsis in degrees",
          },
          trueAnomaly: {
            type: "number",
            description: "True anomaly in degrees",
          }
        },
        required: ["semiMajorAxis", "eccentricity", "inclination", "raan", "argumentOfPeriapsis", "trueAnomaly"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createSatelliteFromLatLonCircular",
      description: "Creates a satellite in a circular orbit based on latitude and longitude",
      parameters: {
        type: "object",
        properties: {
          latitude: {
            type: "number",
            description: "Latitude in degrees (-90 to 90)",
          },
          longitude: {
            type: "number",
            description: "Longitude in degrees (-180 to 180)",
          },
          altitude: {
            type: "number",
            description: "Altitude in kilometers above Earth's surface",
          },
          azimuth: {
            type: "number",
            description: "Azimuth angle in degrees (0-North, 90-East, 180-South, 270-West)",
          }
        },
        required: ["latitude", "longitude", "altitude", "azimuth"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getMoonOrbit",
      description: "Get current simulation data for the Moon's orbit",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  }
];

class AssistantService {
  constructor(io) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    this.threadsBySocketId = new Map();
    this.assistant = null;
    this.io = io;
  }

  async initialize() {
    try {
      // Get the assistant, or create one if it doesn't exist
      const assistants = await this.openai.beta.assistants.list();
      this.assistant = assistants.data.find(a => a.id === 'asst_9eVC9DmufoOvrB3nIKcLB1Cy');
      
      if (!this.assistant) {
        this.assistant = await this.openai.beta.assistants.create({
          name: "Astronavigator",
          instructions: `You're a helpful astronavigator assistant that has access to a series of functions that control a space simulator.

About the sim:
**Timewarp**
The simulation can be run in normal speed or in accelerated time warp.

**Physics**
The simulation includes the Earth-Moon system and the referential frame is ECI.
Azimuth coordinates are 0-North, 90-East, etc.
Atmospheric drag around the earth is modelled (be careful with the atmosphere).

When suggesting orbits:
1. Always consider atmospheric drag below 200km altitude
2. Provide explanations for your orbital parameter choices
3. Use proper units (km for distance, degrees for angles)
4. Consider the Earth-Moon system's physics`,
          model: "gpt-4-1106-preview",
          tools: ASSISTANT_TOOLS
        });
      }

      console.log('Assistant initialized:', this.assistant.id);
      return this.assistant;
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

      // Poll for the run completion
      let runStatus = await this.openai.beta.threads.runs.retrieve(thread.id, run.id);
      while (runStatus.status !== 'completed') {
        if (runStatus.status === 'failed') {
          throw new Error('Assistant run failed');
        }
        
        // If the run requires action (function call)
        if (runStatus.status === 'requires_action') {
          const toolCalls = runStatus.required_action.submit_tool_outputs.tool_calls;
          const toolOutputs = [];

          for (const toolCall of toolCalls) {
            const functionName = toolCall.function.name;
            const functionArgs = JSON.parse(toolCall.function.arguments);

            // Emit the function call event to the client
            this.io.to(socketId).emit('function_call', {
              name: functionName,
              arguments: functionArgs
            });

            // For now, we'll just acknowledge the function call
            // The actual function execution will happen on the client side
            toolOutputs.push({
              tool_call_id: toolCall.id,
              output: JSON.stringify({ status: 'executed' })
            });
          }

          // Submit the tool outputs back to the assistant
          await this.openai.beta.threads.runs.submitToolOutputs(
            thread.id,
            run.id,
            { tool_outputs: toolOutputs }
          );
        }
        
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

export const assistantService = (io) => new AssistantService(io);
