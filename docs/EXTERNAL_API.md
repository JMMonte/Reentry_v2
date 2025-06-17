# External API for Function Calling

This document describes the public API exposed to the frontend and AI assistant via `window.api`. This API provides a thin event-driven wrapper that delegates to existing services for satellite creation, simulation control, communications, and basic orbital mechanics.

---

## Initialization

The API is attached to `window.api` after the 3D scene is initialized. It is set up by `setupExternalApi(app3d)` in `src/api/externalApi.js` and is available after the scene is ready.

## Event System

The API includes a custom event emitter accessible via `window.api.events` that emits events for various operations. The event emitter has the following methods:

- `on(event, listener)` - Subscribe to an event
- `emit(event, ...args)` - Emit an event (internal use)

### API-Specific Events

These events are emitted directly by API operations:

- `apiReady` - API is initialized and ready
- `satelliteCreationStarted` - Satellite creation begins
- `satelliteCreated` - Satellite successfully created
- `satelliteCreationFailed` - Satellite creation failed
- `satellitesQueried` - Satellite list was retrieved
- `satelliteQueried` - Individual satellite was retrieved
- `satelliteDeletionStarted` - Satellite deletion begins
- `satelliteDeleted` - Satellite successfully removed
- `satelliteDeletionFailed` - Satellite deletion failed
- `timeChangeStarted` - Simulation time change begins
- `timeChanged` - Simulation time updated
- `timeChangeFailed` - Time change failed
- `timeWarpChangeStarted` - Time warp change begins
- `timeWarpChanged` - Time warp factor changed
- `timeWarpChangeFailed` - Time warp change failed
- `cameraFocusStarted` - Camera focus operation begins
- `cameraFocused` - Camera focused on target
- `cameraFocusFailed` - Camera focus failed
- `commsConfigUpdateStarted` - Communication config update begins
- `commsConfigUpdated` - Communication config updated
- `commsConfigUpdateFailed` - Communication config update failed
- `commsPresetsQueried` - Communication presets were retrieved
- `apiTested` - API test completed

### System Events (Forwarded)

These events are forwarded from the simulation system:

- `satelliteAdded` - System satellite addition (forwarded from 'satelliteAdded')
- `satelliteRemoved` - System satellite removal (forwarded from 'satelliteRemoved')
- `timeUpdated` - System time update (forwarded from 'timeUpdate')
- `physicsUpdated` - Physics engine update (forwarded from 'physicsUpdate')

Example usage:

```js
window.api.events.on("satelliteCreated", (data) => {
  console.log("New satellite:", data.satellite);
});

window.api.events.on("apiReady", (data) => {
  console.log("API ready, version:", data.version);
});

window.api.events.on("satelliteAdded", (data) => {
  console.log("System event - satellite added:", data);
});
```

---

## Core Functions

## SATELLITE CREATION

### `createSatelliteFromOrbitalElements(params)`

Create satellite from orbital elements (Keplerian) - delegates to SimulationStateManager.

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
- **Returns:** `{ success: true, satellite: { id, name }, message: "Satellite created from orbital elements" }`
- **Events:** Emits `satelliteCreationStarted`, then `satelliteCreated` or `satelliteCreationFailed`

### `createSatelliteFromLatLon(params)`

Create satellite from geographical position with custom velocity - delegates to SatelliteManager.

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
- **Returns:** `{ success: true, satellite: { id, name }, message: "Satellite created at {lat}°, {lon}°" }`
- **Events:** Emits `satelliteCreationStarted`, then `satelliteCreated` or `satelliteCreationFailed`

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
- **Returns:** `{ success: true, satellite: { id, name }, message: "Satellite created in circular orbit" }`
- **Events:** Emits `satelliteCreationStarted`, then `satelliteCreated` or `satelliteCreationFailed`

---

## SATELLITE MANAGEMENT

### `getSatellites()`

Get list of all satellites - delegates to SatelliteManager.

- **Returns:**
  ```js
  {
    success: true,
    satellites: [{
      id: "satellite_id",
      name: "Satellite Name",
      color: "#ffffff",
      centralBodyNaifId: 399
    }, ...]
  }
  ```
- **Events:** Emits `satellitesQueried`

### `getSatellite(id)`

Get detailed information about a specific satellite.

- **Parameters:** `id` (string|number|object) - Satellite ID (can be string, number, or object with id/satelliteId/name property)
- **Returns:**
  ```js
  {
    success: true,
    satellite: {
      id: "satellite_id",
      name: "Satellite Name",
      color: "#ffffff",
      centralBodyNaifId: 399
    }
  }
  ```
- **Events:** Emits `satelliteQueried`

### `deleteSatellite(id)`

Delete a satellite from the simulation - delegates to SatelliteManager.

- **Parameters:** `id` (string|number|object) - Satellite ID
- **Returns:** `{ success: true, message: "Satellite {id} deleted" }`
- **Events:** Emits `satelliteDeletionStarted`, then `satelliteDeleted` or `satelliteDeletionFailed`

---

## SIMULATION CONTROL

### `getSimulationTime()`

Get current simulation time - delegates to TimeUtils.

- **Returns:**
  ```js
  {
    success: true,
    time: "2024-01-01T12:00:00.000Z",  // ISO string
    timestamp: 1704110400000            // Unix timestamp
  }
  ```

### `setSimulationTime(time)`

Set simulation time - delegates to TimeUtils.

- **Parameters:** `time` (Date|string|number) - Target time (Date object, ISO string, or timestamp)
- **Returns:** `{ success: true, time: "2024-01-01T12:00:00.000Z" }`
- **Events:** Emits `timeChangeStarted`, then `timeChanged` or `timeChangeFailed`

### `setTimeWarp(factor)`

Set time warp factor - delegates to SimulationController.

- **Parameters:** `factor` (number) - Time multiplier (must be positive)
- **Returns:** `{ success: true, timeWarp: 10.0 }`
- **Events:** Emits `timeWarpChangeStarted`, then `timeWarpChanged` or `timeWarpChangeFailed`

---

## CELESTIAL BODIES

### `getCelestialBodies()`

Get list of available celestial bodies.

- **Returns:**
  ```js
  {
    success: true,
    bodies: [{
      name: "Earth",
      naifId: 399,
      type: "planet",
      radius: 6371,    // km
      mass: 5.972e24   // kg
    }, ...]
  }
  ```

### `focusCamera(target)`

Focus camera on a celestial body or satellite - delegates to SmartCamera.

- **Parameters:** `target` (string) - Body name or satellite ID
- **Returns:** `{ success: true, target: "Earth" }`
- **Events:** Emits `cameraFocusStarted`, then `cameraFocused` or `cameraFocusFailed`

---

## COMMUNICATION SYSTEMS

### `getSatelliteComms(satelliteId)`

Get communication status for a satellite - delegates to CommunicationsService.

- **Parameters:** `satelliteId` (string|number|object) - Satellite ID
- **Returns:** `{ success: true, comms: comm_status_object }`

### `getCommsPresets()`

Get all available communication presets - delegates to CommunicationsService.

- **Returns:**
  ```js
  {
    success: true,
    presets: {
      "cubesat": {
        antennaGain: 8.0,
        transmitPower: 5.0,
        antennaType: "omnidirectional",
        protocols: ["inter_satellite", "ground_station"],
        dataRate: 100,
        minElevationAngle: 5.0,
        networkId: "cubesat_network",
        enabled: true
      },
      "communications_satellite": {
        antennaGain: 25.0,
        transmitPower: 50.0,
        antennaType: "directional",
        beamSteering: true,
        protocols: ["inter_satellite", "ground_station", "relay"],
        dataRate: 10000,
        minElevationAngle: 5.0,
        relayCapable: true,
        networkId: "commercial_network",
        enabled: true
      },
      // ... other presets
    }
  }
  ```
- **Events:** Emits `commsPresetsQueried`

### `updateCommsConfig(satelliteId, config)`

Update communication configuration for a satellite - delegates to CommunicationsService.

- **Parameters:**
  - `satelliteId` (string|number|object) - Satellite ID
  - `config` (object) - New communication configuration
- **Returns:** `{ success: true, config: updated_config }`
- **Events:** Emits `commsConfigUpdateStarted`, then `commsConfigUpdated` or `commsConfigUpdateFailed`

### `applyCommsPreset(satelliteId, presetName)`

Apply a predefined communication preset - delegates to CommunicationsService.

- **Parameters:**
  - `satelliteId` (string|number|object) - Satellite ID
  - `presetName` (string) - Name of preset to apply
- **Returns:** `{ success: true, config: applied_config }`
- **Available Presets:** Retrieved dynamically from CommunicationsService.getPresets()

---

## SPECIALIZED SERVICES

### `getGroundTrack(id, options)`

Get ground track projection for a satellite - delegates to GroundTrackService.

- **Parameters:**
  - `id` (string|number|object) - Satellite ID
  - `options` (object, optional) - Options passed to GroundTrackService
- **Returns:** Result from GroundTrackService (structure depends on service implementation)

### `getPOIVisibility(options)`

Get Point of Interest visibility analysis - delegates to POIVisibilityService.

- **Parameters:** `options` (object, optional) - Options passed to POIVisibilityService
- **Returns:** Result from POIVisibilityService (structure depends on service implementation)

---

## DIAGNOSTICS

### `testAPI()`

Test API connectivity and return system status.

- **Returns:**
  ```js
  {
    success: true,
    timestamp: "2024-01-01T12:00:00.000Z",
    apiVersion: "4.0-thin",
    services: {
      satellites: true,
      physics: true,
      communications: true,
      timeUtils: true,
      groundTrack: true,
      poiVisibility: true,
      simulation: true
    },
    satelliteCount: 5
  }
  ```
- **Events:** Emits `apiTested`

---

## Example Usage

```js
// Wait for API to be ready
window.api.events.on("apiReady", (data) => {
  console.log("API ready:", data.version);
});

// Listen for satellite creation events
window.api.events.on("satelliteCreationStarted", (data) => {
  console.log("Creating satellite:", data.type, data.params);
});

window.api.events.on("satelliteCreated", (data) => {
  console.log("Satellite created:", data.satellite);
});

window.api.events.on("satelliteCreationFailed", (data) => {
  console.error("Satellite creation failed:", data.error);
});

// Create a satellite with communication capabilities
const result = await window.api.createSatelliteFromOrbitalElements({
  name: "CommSat-1",
  semiMajorAxis: 7000,
  eccentricity: 0.01,
  inclination: 98,
  raan: 120,
  argumentOfPeriapsis: 45,
  trueAnomaly: 0,
  commsConfig: {
    preset: "cubesat",
  },
});

if (result.success) {
  console.log("Created satellite:", result.satellite);

  // Get available communication presets first
  const presetsResult = window.api.getCommsPresets();
  if (presetsResult.success) {
    console.log("Available presets:", Object.keys(presetsResult.presets));
    console.log("CubeSat preset:", presetsResult.presets.cubesat);
  }

  // Apply communication preset
  const commsResult = await window.api.applyCommsPreset(
    result.satellite.id,
    "communications_satellite"
  );

  // Get satellite details
  const satInfo = window.api.getSatellite(result.satellite.id);
  console.log("Satellite info:", satInfo);
}

// Create from geographical position
const geoSat = await window.api.createSatelliteFromLatLonCircular({
  name: "GeoSat-1",
  latitude: 0,
  longitude: 0,
  altitude: 400,
  azimuth: 90,
});

// Control simulation with event monitoring
window.api.events.on("timeChanged", (data) => {
  console.log("Time changed to:", data.time);
});

window.api.events.on("timeWarpChanged", (data) => {
  console.log("Time warp set to:", data.timeWarp);
});

window.api.setTimeWarp(10);
window.api.setSimulationTime(new Date());

// Get system status
const status = window.api.testAPI();
console.log("System status:", status);

// Monitor system events
window.api.events.on("satelliteAdded", (data) => {
  console.log("System event - satellite added:", data);
});

window.api.events.on("physicsUpdated", (data) => {
  console.log("Physics update:", data);
});
```

---

## Architecture Notes

This API is designed as a **thin event-driven wrapper** that:

- **Delegates** all operations to existing services rather than implementing functionality
- **Emits events** for external monitoring and integration, including both API-specific events and forwarded system events
- **Serializes data** for external consumption (e.g., satellite objects are simplified to `{ id, name }`)
- **Standardizes responses** with consistent success/error format
- **Extracts IDs** from various input formats using `extractSatelliteId()` helper:
  - Strings and numbers are used directly
  - Objects can contain `id`, `satelliteId`, or `name` properties
  - Falls back to string conversion of the input

### Helper Functions

- `extractSatelliteId(input)` - Extracts satellite ID from string, number, or object
- `serializeSatellite(sat)` - Converts satellite object to simple `{ id, name }` format

### Event System Architecture

- **APIEventEmitter** - Simple custom event emitter with `on()` and `emit()` methods
- **API Events** - Events emitted directly by API operations (creation, deletion, etc.)
- **System Events** - Events forwarded from the simulation system via `systemEventMap`
- **Event Timing** - API events are emitted synchronously with operations

The API does **not** implement:

- Heavy orbital calculations (delegated to physics engine)
- Complex maneuver planning (handled by existing maneuver system)
- Advanced ground tracking (delegated to GroundTrackService)
- Detailed communication modeling (delegated to CommunicationsService)

---

## Error Handling

All API functions return objects with a `success` field:

```js
// Success case
{ success: true, data: result, message: "Operation completed" }

// Error case
{ success: false, error: "Error message describing what went wrong" }
```

Common error scenarios:

- Service not available (e.g., "Simulation state manager not available")
- Invalid parameters (e.g., "Time warp must be a positive number")
- Object not found (e.g., "Satellite {id} not found")
- Operation failed (e.g., "Failed to create satellite")

Error events are emitted for failed operations with the same error information.

---

## Service Dependencies

The API requires these services to be available in the App3D instance:

- **Required for satellite operations:** `simulationStateManager`, `satellites`
- **Required for time control:** `timeUtils`, `simulationController`
- **Required for camera:** `cameraControls`
- **Required for communications:** `communicationsService`
- **Required for ground tracking:** `groundTrackService`
- **Required for POI visibility:** `poiVisibilityService`
- **Required for celestial bodies:** `celestialBodies`
- **Required for physics:** `physicsIntegration`

The `testAPI()` function can be used to check which services are available.
