import { AssistantConfigType } from '../types/index.js';

const ASSISTANT_CONFIG: AssistantConfigType = {
    // Assistant configuration
    assistant: {
        id: 'asst_j7siOL5bZBebr9L2hmYLb3IK',
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
                description: "Creates a satellite at a specific latitude and longitude on the Earth's surface with an initial velocity.",
                parameters: {
                    type: "object",
                    properties: {
                        latitude: {
                            type: "number",
                            description: "Latitude in degrees (-90 to 90)"
                        },
                        longitude: {
                            type: "number",
                            description: "Longitude in degrees (-180 to 180)"
                        },
                        altitude: {
                            type: "number",
                            description: "Altitude in km above the Earth's surface"
                        },
                        velocity: {
                            type: "number",
                            description: "Initial velocity in m/s"
                        },
                        flightPathAngle: {
                            type: "number",
                            description: "Flight path angle in degrees (0 = horizontal, 90 = vertical)"
                        },
                        azimuth: {
                            type: "number",
                            description: "Azimuth angle in degrees (0 = North, 90 = East, 180 = South, 270 = West)"
                        }
                    },
                    required: ["latitude", "longitude", "altitude", "velocity", "flightPathAngle", "azimuth"]
                }
            }
        },
        {
            type: "function",
            function: {
                name: "createOrbit",
                description: "Creates a satellite in orbit with the specified orbital parameters.",
                parameters: {
                    type: "object",
                    properties: {
                        semiMajorAxis: {
                            type: "number",
                            description: "Semi-major axis in km"
                        },
                        eccentricity: {
                            type: "number",
                            description: "Eccentricity (0 = circular, < 1 = elliptical)"
                        },
                        inclination: {
                            type: "number",
                            description: "Inclination in degrees (0-180)"
                        },
                        longitudeAscendingNode: {
                            type: "number",
                            description: "Longitude of ascending node in degrees (0-360)"
                        },
                        argumentOfPeriapsis: {
                            type: "number",
                            description: "Argument of periapsis in degrees (0-360)"
                        },
                        trueAnomaly: {
                            type: "number",
                            description: "True anomaly in degrees (0-360)"
                        }
                    },
                    required: ["semiMajorAxis", "eccentricity", "inclination", "longitudeAscendingNode", "argumentOfPeriapsis", "trueAnomaly"]
                }
            }
        }
    ]
};

export default ASSISTANT_CONFIG; 