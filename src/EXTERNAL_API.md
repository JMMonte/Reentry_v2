# External API for Function Calling

This document describes the public API exposed to the frontend and AI assistant via `window.api`. This API allows external tools and the assistant to interact with the simulation, primarily for satellite creation and related operations.

---

## Initialization

The API is attached to `window.api` after the 3D scene is initialized. It is set up by `setupExternalApi(app3d)` in `src/simulation/externalApi.js` and is available after the scene is ready.

---

## Exposed Functions

### `createSatellite(params)`

Creates a satellite. The function auto-detects the parameter type for backward compatibility.

- **Parameters:**
  - If `latitude`, `longitude`, `altitude` (and optionally `velocity`) are present: creates from lat/lon (optionally with velocity).
  - If `semiMajorAxis`, `eccentricity` are present: creates from orbital elements.
  - Otherwise, uses generic satellite creation.
- **Returns:** `{ id, name }` of the created satellite.

---

### `createSatelliteFromLatLon(params)`

Creates a satellite from latitude/longitude parameters.

- **Parameters:**
  - `latitude` (number, required)
  - `longitude` (number, required)
  - `altitude` (number, required)
  - `velocity` (number, required)
  - `azimuth` (number, required)
- **Returns:** `{ id, name }`

---

### `createSatelliteFromOrbitalElements(params)`

Creates a satellite from orbital elements.

- **Parameters:**
  - `semiMajorAxis` (number, required)
  - `eccentricity` (number, required)
  - `inclination` (number, required)
  - `raan` (number, required)
  - `argumentOfPeriapsis` (number, required)
  - `trueAnomaly` (number, required)
- **Returns:** `{ id, name }`

---

### `createSatelliteFromLatLonCircular(params)`

Creates a satellite from latitude/longitude for a circular orbit.

- **Parameters:**
  - `latitude` (number, required)
  - `longitude` (number, required)
  - `altitude` (number, required)
  - `azimuth` (number, required)
- **Returns:** `{ id, name }`

---

### `getVisibleLocationsFromOrbitalElements(params)`

Computes visible ground locations over time based on orbital elements by sampling the orbit and testing horizon visibility for each location.

- **Parameters:**
  - `semiMajorAxis` (number, required)
  - `eccentricity` (number, required)
  - `inclination` (number, required)
  - `raan` (number, required)
  - `argumentOfPeriapsis` (number, required)
  - `trueAnomaly` (number, required)
  - `referenceFrame` (string, 'inertial' or 'equatorial', required)
  - `locations` (Array<{lat: number, lon: number}>, required)
  - `numPoints` (number, optional, default 180)
  - `numPeriods` (number, optional, default 1)
- **Returns:** Array of `{ lat, lon, time }` timestamps where each location is visible.

---

## Tool Call Mapping (for AI/Socket Integration)

When a tool call is received, the following mapping is used (see `src/components/ui/chat/useChatSocket.js`):

- `createSatelliteFromLatLon`

  - Requires: `latitude`, `longitude`, `altitude`, `speed` (or `velocity`), `heading` (or `azimuth`)
  - Calls: `window.api.createSatellite({ ...mappedArgs, mode: 'latlon' })`

- `createSatelliteFromOrbitalElements`

  - Requires: `semiMajorAxis`, `eccentricity`, `inclination`, `raan`, `argumentOfPeriapsis`, `trueAnomaly`
  - Calls: `window.api.createSatellite({ ...parsedArgs, mode: 'orbital' })`

- `createSatelliteFromLatLonCircular`

  - Requires: `latitude`, `longitude`, `altitude`, `azimuth`
  - Calls: `window.api.createSatellite({ ...parsedArgs, mode: 'circular' })`

- `getVisibleLocationsFromOrbitalElements`

  - Requires: `semiMajorAxis`, `eccentricity`, `inclination`, `raan`, `argumentOfPeriapsis`, `trueAnomaly`, `referenceFrame`, `locations`, `numPoints`, `numPeriods`
  - Calls: `window.api.getVisibleLocationsFromOrbitalElements(params)`

---

## Example Usage

```js
// Create a satellite from lat/lon/alt/velocity/azimuth
window.api.createSatelliteFromLatLon({
  latitude: 10,
  longitude: 20,
  altitude: 400,
  velocity: 7.8,
  azimuth: 90,
});

// Create a satellite from orbital elements
window.api.createSatelliteFromOrbitalElements({
  semiMajorAxis: 7000,
  eccentricity: 0.01,
  inclination: 98,
  raan: 120,
  argumentOfPeriapsis: 45,
  trueAnomaly: 0,
});
```

---

## Notes

- All functions return a minimal satellite object: `{ id, name }`.
- The API is stable and intended for use by AI and external tools.
- The API is available after the 3D scene is ready.
