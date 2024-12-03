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
          speed: {
            type: "number",
            description: "Initial velocity in km/s",
          },
          heading: {
            type: "number",
            description: "Azimuth angle in degrees (0-North, 90-East, 180-South, 270-West)",
          },
          mass: {
            type: "number",
            description: "Mass of the satellite in kg",
          },
          size: {
            type: "number",
            description: "Size of the satellite in meters",
          },
          name: {
            type: "string",
            description: "Name of the satellite",
          }
        },
        required: ["latitude", "longitude", "altitude", "speed", "heading"],
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
          },
          mass: {
            type: "number",
            description: "Mass of the satellite in kg",
          },
          size: {
            type: "number",
            description: "Size of the satellite in meters",
          },
          name: {
            type: "string",
            description: "Name of the satellite",
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
          inclination: {
            type: "number",
            description: "Orbital inclination in degrees",
          },
          raan: {
            type: "number",
            description: "Right Ascension of the Ascending Node (RAAN) in degrees",
          },
          mass: {
            type: "number",
            description: "Mass of the satellite in kg",
          },
          size: {
            type: "number",
            description: "Size of the satellite in meters",
          },
          name: {
            type: "string",
            description: "Name of the satellite",
          }
        },
        required: ["latitude", "longitude", "altitude", "inclination", "raan"],
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
  constructor(openai) {
    if (!openai) {
      throw new Error('OpenAI client is required');
    }
    this.openai = openai;
    this.assistant = null;
  }

  async initialize() {
    try {
      // Create or retrieve the assistant
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

      console.log('Assistant initialized successfully');
      return true;
    } catch (error) {
      console.error('Error initializing assistant:', error);
      return false;
    }
  }

  async sendMessage(socket, messageContent) {
    try {
      if (!this.assistant) {
        throw new Error('Assistant not initialized');
      }

      // Create a new thread with the initial message
      const thread = await this.openai.beta.threads.create({
        messages: [
          { role: "user", content: messageContent }
        ]
      });

      // Run the assistant
      const run = await this.openai.beta.threads.runs.create(
        thread.id,
        {
          assistant_id: this.assistant.id
        }
      );

      // Poll for completion
      let runStatus;
      do {
        await new Promise(resolve => setTimeout(resolve, 1000));
        runStatus = await this.openai.beta.threads.runs.retrieve(
          thread.id,
          run.id
        );
      } while (runStatus.status === 'queued' || runStatus.status === 'in_progress');

      if (runStatus.status === 'completed') {
        // Get all messages from the thread
        const threadMessages = await this.openai.beta.threads.messages.list(
          thread.id
        );

        // Convert and emit each message
        for (const msg of threadMessages.data) {
          socket.emit('message', {
            role: msg.role,
            content: msg.content[0].text.value,
            status: 'completed'
          });
        }
      } else {
        throw new Error(`Run failed with status: ${runStatus.status}`);
      }
    } catch (error) {
      console.error('Error in sendMessage:', error);
      socket.emit('error', error.message);
    }
  }
}

export const assistantService = (openai) => new AssistantService(openai);
