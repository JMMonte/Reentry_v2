const ASSISTANT_CONFIG = {
  // Assistant configuration
  assistant: {
    id: 'asst_ZP3FNMmMInX2Ohb1CXdeIwTn',
    model: 'gpt-4o',
    assistantName: 'Astronavigator',
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
4. Consider the Earth-Moon system's physics`
  },

  // Available tools for the assistant
  tools: [
    {
      type: "function",
      function: {
        name: "createSatelliteFromLatLon",
        description: "Creates a satellite based on latitude and longitude coordinates relative to Earth",
        strict: true,
        parameters: {
          type: "object",
          properties: {
            latitude: { type: "number", description: "Latitude in degrees (-90 to 90)" },
            longitude: { type: "number", description: "Longitude in degrees (-180 to 180)" },
            altitude: { type: "number", description: "Altitude in kilometers above Earth's surface" },
            velocity: { type: "number", description: "Initial velocity in km/s" },
            azimuth: { type: "number", description: "Azimuth angle in degrees (0-North, 90-East, 180-South, 270-West)" },
            angleOfAttack: { type: "number", description: "Angle of attack in degrees (optional, defaults to 0). Positive angles point upward relative to the velocity vector." },
            mass: { type: "number", description: "Mass of the satellite in kg (optional, defaults to 100 kg)" },
            size: { type: "number", description: "Size of the satellite in meters (optional, defaults to 1 meter)" },
            name: { type: "string", description: "Name of the satellite (optional, will be auto-generated if not provided)" }
          },
          required: ["latitude", "longitude", "altitude", "velocity", "azimuth"],
          additionalProperties: false
        }
      }
    },
    {
      type: "function",
      function: {
        name: "createSatelliteFromOrbitalElements",
        description: "Creates a satellite using Keplerian orbital elements",
        strict: true,
        parameters: {
          type: "object",
          properties: {
            semiMajorAxis: { type: "number", description: "Semi-major axis in kilometers" },
            eccentricity: { type: "number", description: "Orbital eccentricity (0-1 for elliptical orbits)" },
            inclination: { type: "number", description: "Orbital inclination in degrees" },
            raan: { type: "number", description: "Right Ascension of the Ascending Node (RAAN) in degrees" },
            argumentOfPeriapsis: { type: "number", description: "Argument of periapsis in degrees" },
            trueAnomaly: { type: "number", description: "True anomaly in degrees" },
            mass: { type: "number", description: "Mass of the satellite in kg" },
            size: { type: "number", description: "Size of the satellite in meters" },
            name: { type: "string", description: "Name of the satellite" }
          },
          required: ["semiMajorAxis", "eccentricity", "inclination", "raan", "argumentOfPeriapsis", "trueAnomaly"],
          additionalProperties: false
        }
      }
    },
    {
      type: "function",
      function: {
        name: "createSatelliteFromLatLonCircular",
        description: "Creates a satellite in a circular orbit based on latitude and longitude. The orbital velocity will be automatically calculated to maintain a circular orbit at the specified altitude.",
        strict: true,
        parameters: {
          type: "object",
          properties: {
            latitude: { type: "number", description: "Latitude in degrees (-90 to 90)" },
            longitude: { type: "number", description: "Longitude in degrees (-180 to 180)" },
            altitude: { type: "number", description: "Altitude in kilometers above Earth's surface" },
            azimuth: { type: "number", description: "Initial heading angle in degrees (0-North, 90-East, 180-South, 270-West)" },
            angleOfAttack: { type: "number", description: "Angle of attack in degrees (optional, defaults to 0). Positive angles point upward relative to the velocity vector." },
            mass: { type: "number", description: "Mass of the satellite in kg (optional, defaults to 100 kg)" },
            size: { type: "number", description: "Size of the satellite in meters (optional, defaults to 1 meter)" },
            name: { type: "string", description: "Name of the satellite (optional, will be auto-generated if not provided)" }
          },
          required: ["latitude", "longitude", "altitude", "azimuth"],
          additionalProperties: false
        }
      }
    },
    {
      type: "function",
      function: {
        name: "getMoonOrbit",
        description: "Get current simulation data for the Moon's orbit",
        strict: true,
        parameters: { 
          type: "object", 
          properties: {}, 
          required: [],
          additionalProperties: false 
        }
      }
    }
  ]
};

export default ASSISTANT_CONFIG;