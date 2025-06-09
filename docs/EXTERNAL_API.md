# External API for Function Calling

This document describes the comprehensive public API exposed to the frontend and AI assistant via `window.api`. This API allows external tools and the assistant to interact with the space simulation, covering satellite creation, mission planning, communications, ground tracking, and orbital mechanics.

---

## Initialization

The API is attached to `window.api` after the 3D scene is initialized. It is set up by `setupExternalApi(app3d)` in `src/simulation/externalApi.js` and is available after the scene is ready.

---

## Core Functions

## SATELLITE CREATION

### `createSatelliteFromOrbitalElements(params)`

Create satellite from orbital elements (Keplerian).

- **Parameters:**
  - `name` (string, optional) - Satellite name
  - `mass` (number, optional) - Mass in kg (default: 100)
  - `size` (number, optional) - Size in meters (default: 1)
  - `semiMajorAxis` (number, required) - Semi-major axis in km
  - `eccentricity` (number, required) - Eccentricity (0-1)
  - `inclination` (number, required) - Inclination in degrees
  - `raan` (number, required) - Right ascension of ascending node in degrees
  - `argumentOfPeriapsis` (number, required) - Argument of periapsis in degrees
  - `trueAnomaly` (number, required) - True anomaly in degrees
  - `centralBodyNaifId` (number, optional) - Central body NAIF ID (default: 399=Earth)
  - `commsConfig` (object, optional) - Communication configuration
- **Returns:** `{ success: true, satellite: { id, name } }`

### `createSatelliteFromLatLon(params)`

Create satellite from geographical position with custom velocity.

- **Parameters:**
  - `name` (string, optional) - Satellite name
  - `mass` (number, optional) - Mass in kg
  - `size` (number, optional) - Size in meters
  - `latitude` (number, required) - Latitude in degrees
  - `longitude` (number, required) - Longitude in degrees
  - `altitude` (number, required) - Altitude in km above surface
  - `velocity` (number, required) - Velocity in km/s
  - `azimuth` (number, required) - Launch azimuth in degrees
  - `angleOfAttack` (number, optional) - Angle of attack in degrees
  - `commsConfig` (object, optional) - Communication configuration
- **Returns:** `{ success: true, satellite: { id, name } }`

### `createSatelliteFromLatLonCircular(params)`

Create satellite from geographical position with circular orbit.

- **Parameters:**
  - `name` (string, optional) - Satellite name
  - `mass` (number, optional) - Mass in kg
  - `size` (number, optional) - Size in meters
  - `latitude` (number, required) - Latitude in degrees
  - `longitude` (number, required) - Longitude in degrees
  - `altitude` (number, required) - Altitude in km above surface
  - `azimuth` (number, optional) - Launch azimuth in degrees (default: 90=eastward)
  - `commsConfig` (object, optional) - Communication configuration
- **Returns:** `{ success: true, satellite: { id, name } }`

---

## SATELLITE MANAGEMENT

### `getSatellites()`

Get list of all satellites with detailed information.

- **Returns:** `{ success: true, satellites: [satellite_objects] }`
- **Satellite Object:** Contains id, name, position, velocity, orbital elements, physics data, and communication status

### `getSatellite(id)`

Get detailed information about a specific satellite.

- **Parameters:** `id` (string|number) - Satellite ID
- **Returns:** `{ success: true, satellite: satellite_object }`

### `deleteSatellite(id)`

Delete a satellite from the simulation.

- **Parameters:** `id` (string|number) - Satellite ID
- **Returns:** `{ success: true, message: "Satellite deleted" }`

---

## MISSION PLANNING & MANEUVERS

### `addManeuverNode(satelliteId, params)`

Add a maneuver node to a satellite.

- **Parameters:**
  - `satelliteId` (string|number) - Target satellite ID
  - `executionTime` (Date|string|number) - When to execute the maneuver
  - `deltaV` (object) - Delta-V vector {x, y, z} in km/s
- **Returns:** `{ success: true, nodeId: string }`

### `getManeuverNodes(satelliteId)`

Get all maneuver nodes for a satellite.

- **Parameters:** `satelliteId` (string|number) - Satellite ID
- **Returns:** `{ success: true, nodes: [node_objects] }`

### `deleteManeuverNode(satelliteId, nodeId)`

Delete a specific maneuver node.

- **Parameters:** 
  - `satelliteId` (string|number) - Satellite ID
  - `nodeId` (string) - Node ID
- **Returns:** `{ success: true, message: "Node deleted" }`

### `calculateHohmannTransfer(params)`

Calculate Hohmann transfer parameters.

- **Parameters:**
  - `currentSemiMajorAxis` (number) - Current orbit SMA in km
  - `targetSemiMajorAxis` (number) - Target orbit SMA in km
  - `centralBodyNaifId` (number, optional) - Central body (default: 399=Earth)
- **Returns:** `{ success: true, transfer: transfer_details }`

---

## COMMUNICATION SYSTEMS

### `getSatelliteComms(satelliteId)`

Get communication status for a satellite.

- **Parameters:** `satelliteId` (string|number) - Satellite ID
- **Returns:** `{ success: true, comms: comm_status }`
- **Comm Status:** Includes active connections, link quality, data rates, power consumption

### `getCommunicationLinks()`

Get all active communication links in the simulation.

- **Returns:** `{ success: true, links: [link_objects] }`
- **Link Object:** Contains source, target, quality, data rate, distance

### `updateCommsConfig(satelliteId, config)`

Update communication configuration for a satellite.

- **Parameters:**
  - `satelliteId` (string|number) - Satellite ID
  - `config` (object) - New communication configuration
- **Returns:** `{ success: true, config: updated_config }`

---

## GROUND TRACKING

### `getGroundTrack(satelliteId, options)`

Get ground track projection for a satellite with full orbit propagation.

- **Parameters:**
  - `satelliteId` (string|number) - Satellite ID
  - `options` (object, optional):
    - `duration` (number) - Duration in seconds (default: orbital period)
    - `numPoints` (number) - Number of points to calculate (default: 100)
    - `includeCanvas` (boolean) - Include canvas coordinates (default: false)
    - `canvasWidth` (number) - Canvas width in pixels (default: 1200)
    - `canvasHeight` (number) - Canvas height in pixels (default: 600)
- **Returns:** 
  ```js
  {
    success: true,
    groundTrack: [{
      time: "2024-01-01T12:00:00.000Z",
      latitude: 0.0,
      longitude: -75.2,
      altitude: 400.5,
      x: 300,  // if includeCanvas: true
      y: 200   // if includeCanvas: true
    }, ...],
    centralBody: "Earth",
    centralBodyNaifId: 399,
    duration: 5400,
    numPoints: 100
  }
  ```

### `getMultipleGroundTracks(satelliteIds, options)`

Get ground tracks for multiple satellites simultaneously.

- **Parameters:**
  - `satelliteIds` (Array<string|number>) - Array of satellite IDs
  - `options` (object, optional) - Same options as `getGroundTrack`
- **Returns:**
  ```js
  {
    success: true,
    groundTracks: [{
      satelliteId: "sat1",
      groundTrack: [...],
      centralBody: "Earth",
      // ... other fields
    }, ...],
    failures: [{
      satelliteId: "invalid_sat",
      error: "Satellite not found"
    }]
  }
  ```

### `getGroundTrackCoverage(satelliteId, options)`

Calculate ground track with coverage analysis including footprint radius.

- **Parameters:**
  - `satelliteId` (string|number) - Satellite ID
  - `options` (object, optional):
    - `duration` (number) - Duration in seconds
    - `numPoints` (number) - Number of points
    - `minElevation` (number) - Minimum elevation angle in degrees
- **Returns:**
  ```js
  {
    success: true,
    groundTrack: [{
      // ... standard ground track fields
      coverageRadius: 15.2,        // degrees
      coverageRadiusKm: 1689.5     // kilometers
    }, ...],
    statistics: {
      averageCoverageRadiusKm: 1700,
      approximateCoverageArea: 9079202,  // km²
      bodyTotalArea: 510072000,          // km²
      instantCoveragePercentage: 1.78,
      satelliteId: "sat1",
      centralBody: "Earth",
      duration: 5400
    }
  }
  ```

### `getGroundStationVisibility(satelliteId, groundStation, options)`

Calculate visibility windows between a satellite and ground station.

- **Parameters:**
  - `satelliteId` (string|number) - Satellite ID
  - `groundStation` (object):
    - `latitude` (number, required) - Latitude in degrees
    - `longitude` (number, required) - Longitude in degrees
    - `elevation` (number, optional) - Elevation in meters
    - `name` (string, optional) - Station name
  - `options` (object, optional):
    - `duration` (number) - Analysis duration in seconds
    - `minElevation` (number) - Minimum elevation angle (default: 5°)
    - `numPoints` (number) - Resolution (default: 200)
- **Returns:**
  ```js
  {
    success: true,
    groundStation: {
      name: "DSN Madrid",
      latitude: 40.4,
      longitude: -4.25,
      elevation: 834
    },
    satelliteId: "sat1",
    centralBody: "Earth",
    visibilityWindows: [{
      startTime: "2024-01-01T12:00:00Z",
      endTime: "2024-01-01T12:08:00Z",
      duration: 480,  // seconds
      maxElevation: 45.2,
      points: [...]   // track points during visibility
    }, ...],
    totalWindows: 3,
    totalVisibilityTime: 1440,  // seconds
    analysisOptions: {
      duration: 7200,
      minElevation: 5,
      numPoints: 200
    }
  }
  ```

### `getCurrentPositions(planetNaifId)` *(deprecated)*

Get current surface positions of all satellites for a planet.

- **Parameters:** `planetNaifId` (number, optional) - Planet NAIF ID (default: 399=Earth)
- **Returns:** `{ success: true, positions: [position_objects] }`
- **Note:** Consider using `getGroundTrack` with `numPoints: 1` for single position

### `calculateCoverage(satelliteId)` *(deprecated)*

Calculate satellite coverage footprint.

- **Parameters:** `satelliteId` (string|number) - Satellite ID
- **Returns:** `{ success: true, coverage: coverage_details }`
- **Note:** Use `getGroundTrackCoverage` for more comprehensive analysis

---

## ORBITAL MECHANICS

### `getOrbitalElements(satelliteId)`

Get orbital elements for a satellite.

- **Parameters:** `satelliteId` (string|number) - Satellite ID
- **Returns:** `{ success: true, elements: orbital_elements }`

### `calculateOrbitalPeriod(semiMajorAxis, centralBodyNaifId)`

Calculate orbital period for given parameters.

- **Parameters:**
  - `semiMajorAxis` (number) - Semi-major axis in km
  - `centralBodyNaifId` (number, optional) - Central body (default: 399=Earth)
- **Returns:** `{ success: true, period: period_in_seconds }`

### `getSphereOfInfluence(naifId)`

Get sphere of influence radius for a celestial body.

- **Parameters:** `naifId` (number) - Body NAIF ID
- **Returns:** `{ success: true, soiRadius: radius_in_km }`

---

## SIMULATION CONTROL

### `getSimulationTime()`

Get current simulation time.

- **Returns:** `{ success: true, time: ISO_string, timestamp: number }`

### `setSimulationTime(time)`

Set simulation time.

- **Parameters:** `time` (Date|string|number) - Target time
- **Returns:** `{ success: true, time: ISO_string }`

### `getTimeWarp()` / `setTimeWarp(factor)`

Get or set time warp factor.

- **Parameters:** `factor` (number) - Time multiplier (setTimeWarp only)
- **Returns:** `{ success: true, timeWarp: number }`

---

## CELESTIAL BODIES

### `getCelestialBodies()`

Get list of available celestial bodies.

- **Returns:** `{ success: true, bodies: [body_objects] }`

### `focusCamera(target)`

Focus camera on a celestial body or satellite.

- **Parameters:** `target` (string) - Body name or satellite ID
- **Returns:** `{ success: true, target: string }`

---

## Example Usage

```js
// Create a satellite with communication capabilities
const result = window.api.createSatelliteFromLatLon({
  name: "CommSat-1",
  latitude: 0,
  longitude: 0,
  altitude: 400,
  velocity: 7.8,
  azimuth: 90,
  commsConfig: {
    preset: "cubesat",
    antennaGain: 15,
    transmitPower: 5
  }
});

// Create from orbital elements
window.api.createSatelliteFromOrbitalElements({
  name: "Science-1",
  semiMajorAxis: 7000,
  eccentricity: 0.01,
  inclination: 98,
  raan: 120,
  argumentOfPeriapsis: 45,
  trueAnomaly: 0
});

// Get satellite information including comms
const satInfo = window.api.getSatellite("satellite_id");
const commsStatus = window.api.getSatelliteComms("satellite_id");

// Get ground track with canvas coordinates
const groundTrack = await window.api.getGroundTrack("satellite_id", {
  duration: 5400,     // 1.5 hours
  numPoints: 100,
  includeCanvas: true,
  canvasWidth: 1200,
  canvasHeight: 600
});

// Get ground track with coverage analysis
const coverage = await window.api.getGroundTrackCoverage("satellite_id", {
  duration: 86400,    // 24 hours
  numPoints: 200
});
console.log(`Coverage: ${coverage.statistics.instantCoveragePercentage}%`);

// Check ground station visibility
const visibility = await window.api.getGroundStationVisibility("satellite_id", {
  name: "DSN Goldstone",
  latitude: 35.4,
  longitude: -116.9
}, {
  duration: 86400,    // 24 hours
  minElevation: 10    // 10 degrees above horizon
});
console.log(`${visibility.totalWindows} passes, total ${visibility.totalVisibilityTime}s`);

// Get multiple satellite ground tracks
const multiTracks = await window.api.getMultipleGroundTracks(
  ["sat1", "sat2", "sat3"],
  { duration: 3600, numPoints: 50 }
);

// Add maneuver node
window.api.addManeuverNode("satellite_id", {
  executionTime: new Date(Date.now() + 3600000), // 1 hour from now
  deltaV: { x: 0.1, y: 0, z: 0 } // 100 m/s prograde
});
```

---

## Communication Configuration

When creating satellites with communication capabilities, use the `commsConfig` parameter:

```js
commsConfig: {
  preset: "cubesat"|"smallsat"|"commercial"|"military",  // Predefined configs
  antennaGain: 12.0,              // dBi
  antennaType: "omnidirectional", // omnidirectional, directional, high_gain
  transmitPower: 10.0,            // watts
  transmitFrequency: 2.4,         // GHz
  dataRate: 1000,                 // kbps
  protocols: ["inter_satellite", "ground_station"],
  enabled: true                   // Enable/disable communications
}
```

---

## Error Handling

All API functions return objects with a `success` field:

```js
// Success case
{ success: true, data: result }

// Error case
{ success: false, error: "Error message" }
```

---

## Notes

- All functions return standardized response objects with success/error indicators
- Positions are in kilometers from the Solar System Barycenter
- Velocities are in km/s
- Times can be provided as Date objects, ISO strings, or timestamps
- The API is available after the 3D scene initializes
- Communication systems operate automatically once configured
- Ground tracking uses real planetary rotation and coordinate transformations
