# Frontend Integration Manual

This document describes how to integrate a JavaScript/React frontend with the Darksun Physics-Service backend.

## Setup

1. Ensure the backend is running at `http://localhost:8000`.
2. In your React app, install dependencies:

   ```bash
   npm install axios uuid
   ```

3. Use WebSocket API built into browsers for streaming.

## 1. Session Management

### Create a Session

```js
import axios from "axios";
import { v4 as uuidv4 } from "uuid";

// Create a session with default epoch:
async function createSession() {
  const resp = await axios.post("http://localhost:8000/session");
  return resp.data.session_id; // string UUID
}

// Create a session with a custom initial datetime (UTC):
async function createSessionWithDate(utcString) {
  // utcString: e.g. '2026-01-01T12:00:00'
  const resp = await axios.post(
    `http://localhost:8000/session?utc=${encodeURIComponent(utcString)}`
  );
  return resp.data.session_id;
}
```

- If you provide the `utc` query parameter, the session will start at that datetime.
- If omitted, the session starts at the default (`2025-05-11T00:00:00`).
- If the date string is invalid, the API will return a 400 error.

Store `sessionId` in React state or context.

## 2. Satellite CRUD

### Create Satellite

```js
async function createSatellite(sessionId, sat) {
  // sat: { sat_id, mass, pos, vel, frame, central_body, bc, size }
  const url = `http://localhost:8000/satellite?session_id=${sessionId}`;
  return await axios.post(url, sat);
}
```

### Get Satellite State

```js
async function getSatelliteState(sessionId, satId) {
  const url = `http://localhost:8000/satellite/${satId}/state?session_id=${sessionId}`;
  const resp = await axios.get(url);
  return resp.data; // contains pos, vel, a_j2, a_drag, etc.
}
```

The response now includes detailed physical and orbital information:

```json
{
  "sat_id": 12345,
  "pos": [7000, 0, 0],
  "vel": [0, 7.5, 0],
  "frame": "J2000",
  "central_body": 399,
  "a_bodies": { "399": [0.0, -0.001, 0.0], "10": [0.0001, 0.0, 0.0] },
  "a_j2": [0.0, 0.0, 0.0],
  "a_drag": [0.0, 0.0, 0.0],
  "a_total": [0.0, -0.001, 0.0],
  "altitude_radial": 7000.0, // Distance from central body center (km)
  "altitude_surface": 621.9, // Altitude above surface (km)
  "ground_velocity": 7.5, // Speed relative to central body (km/s)
  "orbital_velocity": 7.5 // (Same as ground_velocity for now)
}
```

- `altitude_radial`: Distance from satellite to central body center (km)
- `altitude_surface`: Altitude above the central body's surface (km, using equatorial radius)
- `ground_velocity`: Magnitude of velocity relative to the central body (km/s)
- `orbital_velocity`: (Currently same as ground velocity)
- `a_bodies`: Dictionary of gravitational accelerations from all bodies (by NAIF ID)
- `a_j2`: J2 perturbation acceleration vector (km/s²)
- `a_drag`: Drag acceleration vector (km/s²)
- `a_total`: Total acceleration vector (km/s²)

### Delete Satellite

```js
async function deleteSatellite(sessionId, satId) {
  const url = `http://localhost:8000/satellite/${satId}?session_id=${sessionId}`;
  return await axios.delete(url);
}
```

## 3. Timewarp & Date/Time Control

**Important:** All simulation controls (timewarp, simulation date/time, satellite actions, etc.) are **session-specific**. You must always provide the correct `session_id` for your session in every API and WebSocket call. Each session is fully isolated and maintains its own simulation state.

### Set Timewarp (Simulation Speed)

To control the simulation speed ("timewarp") for your session, send a POST request:

```plaintext
POST /session/{session_id}/timewarp?factor={timewarp_factor}
```

- Replace `{session_id}` with your valid session ID.
- Replace `{timewarp_factor}` with the desired speed multiplier (e.g., `1.0` for real-time, `10.0` for 10x speed, `0.0` to pause).

**Example (JavaScript using axios):**

```js
async function setTimewarp(sessionId, factor) {
  const url = `http://localhost:8000/session/${sessionId}/timewarp?factor=${factor}`;
  try {
    const response = await axios.post(url);
    console.log("Timewarp set:", response.data);
    return response.data; // { status: "ok", timewarp_factor: X.X }
  } catch (error) {
    console.error(
      "Failed to set timewarp:",
      error.response ? error.response.data : error.message
    );
    throw error;
  }
}

// Example usage:
// setTimewarp(yourSessionId, 10.0); // For 10x speed
// setTimewarp(yourSessionId, 0.0);  // To pause
```

**Example response (Success):**

```json
{
  "status": "ok",
  "timewarp_factor": 10.0
}
```

\*\*Example response (Error if factor is invalid):

```json
{
  "detail": "Invalid timewarp factor: some_invalid_value (error_details)"
}
```

**Note:** The `session_id` is required in the URL path. The backend will apply `max(0.0, factor)`.

### Change Simulation Date/Time (Epoch)

To set the simulation's current date/time (epoch) for your session:

1. **Send a POST request to the session date endpoint:**

   ```js
   async function setSimulationDate(sessionId, utcString) {
     // utcString must be in ISO format, e.g. '2025-01-01T00:00:00'
     const url = `http://localhost:8000/session/${sessionId}/date?utc=${encodeURIComponent(
       utcString
     )}`;
     await axios.post(url);
   }
   // Example usage:
   await setSimulationDate(sessionId, "2025-01-01T00:00:00");
   ```

**Note:** The `session_id` is required in the URL path. Each session can have its own independent simulation date/time.

**Example request:**

```bash
curl -X POST "http://localhost:8000/session/550e8400-e29b-41d4-a716-446655440000/date?utc=2025-01-01T00:00:00"
```

**Example response:**

```json
{
  "status": "ok",
  "epoch_et": 1234567890.0
}
```

## 4. WebSocket Streaming

All WebSocket and API calls require a valid `session_id`. For endpoints that require a reference frame, always include `frame` (default: `ECLIPJ2000`). All state vectors and quaternions are always returned in the requested frame.

The WebSocket stream now primarily sends data from the backend to the frontend. The following message types are sent by the backend:

- **msgType = 0**: Satellite state vector (details omitted for brevity, see original manual section if needed)
- **msgType = 2**: Simulation epoch time (ECLIPJ2000 ET)
  - `uint8  msgType` (value 2)
  - `float64 et` (seconds past ECLIPJ2000, little-endian)
- **msgType = 10**: Planet state vector (details omitted for brevity, see original manual section if needed)

**Previously defined `msgType 3` (Timewarp update/confirmation) sent by the backend is now REMOVED, as timewarp is controlled via HTTP POST.**

**Example (JavaScript for handling epoch):**

```js
ws.onmessage = (event) => {
  const data = new DataView(event.data);
  const msgType = data.getUint8(0);
  if (msgType === 2) {
    const et = data.getFloat64(1, true); // little-endian
    console.log("Simulation epoch ET:", et);
  } else if (msgType === 0) {
    // Handle satellite state ...
  } else if (msgType === 10) {
    // Handle planet state ...
  }
  // ... handle other msgTypes if any ...
};
```

## 5. Maneuver Management & Trajectory Preview

### Build Maneuver List

```js
// Example: user adds nodes in UI
const maneuvers = [
  { epoch: 1234567890.0, delta_v: [0, 0.1, 0], description: "Burn 1" },
  { epoch: 1234567950.0, delta_v: [0, -0.05, 0], description: "Burn 2" },
];
```

### Preview Trajectory

```js
async function previewTrajectory(
  sessionId,
  satId,
  maneuvers,
  maxPeriods = 1,
  dt = 60
) {
  const url = `http://localhost:8000/satellite/${satId}/trajectory?session_id=${sessionId}&max_periods=${maxPeriods}&dt=${dt}`;
  const resp = await axios.post(url, maneuvers);
  return resp.data.trajectory; // array of { epoch, pos, vel, soi_id }
}
```

## 6. Save & Load Sessions (Snapshots)

### Snapshot (Save)

```js
async function saveSnapshot(sessionId) {
  const url = `http://localhost:8000/session/${sessionId}/snapshot`;
  const resp = await axios.get(url);
  downloadJSON(resp.data, `snapshot-${sessionId}.json`);
}
```

### Load from File

```js
async function loadSnapshot(file) {
  const state = await file.text().then(JSON.parse);
  const resp = await axios.post("http://localhost:8000/session/load", {
    state,
  });
  return resp.data.session_id; // new session
}
```

### Load from URL

1. Encode snapshot JSON in Base64 or gzipped string in URL query.
2. On app load, detect `?snapshot=<data>` in URL.
3. Decode, POST to `/session/load`, get new `session_id`, and proceed.

## 7. Rendering Orbits

- Use Three.js or similar. Feed position arrays (trajectory) to draw lines.
- You can use the `/planet/{naif_id}/trajectory` endpoint to fetch a full ephemeris for any planet or barycenter, with tunable time range and step size.
- On each animation frame, update mesh positions based on WebSocket streaming or preview data.

## Get Planet Trajectory (Ephemeris)

The `/planet/{naif_id}/trajectory` endpoint allows you to request a propagated trajectory (ephemeris) for any planet or barycenter over a specified time interval. This is useful for rendering orbit lines or animating planetary motion in the frontend.

- **Endpoint:** `POST /planet/{naif_id}/trajectory`
- **Parameters (in request body):**
  - `start_epoch` (string, required): Start UTC epoch (e.g., `"2025-01-01T00:00:00"`)
  - `duration` (float, required): Total duration to propagate (seconds)
  - `dt` (float, default 60.0): Timestep (seconds)
  - `frame` (string, default `ECLIPJ2000`): Reference frame (`"J2000"` or `"ECLIPJ2000"`)
  - `relative_to` (int, default 0): NAIF ID of reference body (default: 0 for SSB)
  - `session_id` (string, required): Session ID

**Example (axios):**

```js
async function getPlanetTrajectory(sessionId, naifId, startEpoch, duration, dt = 60, frame = "ECLIPJ2000", relativeTo = 0) {
  const url = `http://localhost:8000/planet/${naifId}/trajectory`;
  const body = {
    start_epoch: startEpoch, // e.g. "2025-01-01T00:00:00"
    duration: duration,     // seconds
    dt: dt,                 // seconds per step
    frame: frame,           // "ECLIPJ2000" or "J2000"
    relative_to: relativeTo,
    session_id: sessionId
  };
  const resp = await axios.post(url, body);
  return resp.data.trajectory; // array of { epoch, pos, vel, quat, source }
}
```

**Example request:**

```json
{
  "start_epoch": "2025-01-01T00:00:00",
  "duration": 3600,
  "dt": 600,
  "frame": "ECLIPJ2000",
  "relative_to": 0,
  "session_id": "..."
}
```

**Example response:**

```json
{
  "naif_id": 399,
  "trajectory": [
    {
      "epoch": 788961669.1839275,
      "pos": ["-2.7589903173651926e+07", "1.4392362125028765e+08", "1.9199204879015684e+04"],
      "vel": ["-2.9776785619808795e+01", "-5.5362326391538339e+00", "-1.9452960755650395e-04"],
      "quat": [0.6263, -0.1289, 0.1569, 0.7526],
      "source": "spice"
    },
    // ... more steps ...
  ]
}
```

- `pos` and `vel` are arrays of strings (scientific notation, 16 decimal places) for maximum precision.
- `epoch` is the ephemeris time (seconds past J2000).
- `quat` is the orientation quaternion [w, x, y, z].
- `source` indicates the data source (e.g., "spice", "kepler_fallback", "canonical").

**Use this endpoint to generate orbit lines or time series for any planet or barycenter.**

## Planet Placement & Reference Frames

_To render each planet in your scene consistently across different reference frames:_

- Always request your planet state using the same `frame` as your simulation and WebSocket stream.
- By default, each body's state is returned **relative to the Solar System Barycenter (NAIF ID 0)**. You can override this by specifying `relative_to` in your request.
- Check the `relative_to` and `frame_of_reference` fields in the response to see which body the coordinates are relative to.
- Fetch planet state via:

  ```js
  // Default: relative to SSB
  const resp = await axios.get(
    `http://localhost:8000/planet/3?session_id=${sessionId}`
  );
  // Custom: relative to Earth barycenter
  const resp2 = await axios.get(
    `http://localhost:8000/planet/399?session_id=${sessionId}&relative_to=3`
  );
  ```

  ```json
  // Example response payload:
  {
    "naif_id": 399,
    "frame": "ECLIPJ2000",
    "relative_to": 0,
    "frame_of_reference": 0,
    "pos": [
      "-9.7388994600000000e+07",
      "-1.1688487000000000e+08",
      "3.2145925500000000e+04"
    ],
    "vel": [
      "2.9780000000000000e+01",
      "-6.0000000000000000e-01",
      "1.0000000000000000e-02"
    ],
    "quat": [0.707, 0.0, 0.707, 0.0],
    "source": "spice",
    "GM": 398600.4418
  }
  ```

- `pos`: kilometers from the reference body's center (default: SSB), as strings in scientific notation with 16 decimal places for maximum precision (e.g., ["1.2345678901234567e+08", ...]).
- `vel`: velocity vector in km/s, also as strings in scientific notation.
- **Note:** The frontend should parse these string values as floats for calculations and rendering.
- `quat`: orientation quaternion [w, x, y, z].
- `GM`: gravitational parameter (km³/s²).

## 8. Tips

- **Always include `session_id` for all API and WebSocket calls, including timewarp and date/time controls.**
- Use timewarp=`0` to pause the simulation.
- Remove satellites by calling DELETE before adding new ones with same ID.
- Always specify `frame` (default: `ECLIPJ2000`) for `/planet/{naif_id}` and WebSocket endpoints for consistent data.
- The API always returns both the state vector and quaternion in the requested frame.
- The `relative_to` field in planet responses indicates the NAIF ID of the parent body (e.g., barycenter for planets, planet barycenter for moons).
- If a moon or minor body is not covered by SPICE, canonical fallback is used and the `source` field in the response will be "canonical".
- Error handling: 404 for missing body, 400 for invalid frame, 422 for malformed requests.

## 9. Example Response Payloads

### Create Session

```json
{ "session_id": "550e8400-e29b-41d4-a716-446655440000" }
```

### Create Satellite

```json
{ "status": "ok" }
```

### Delete Satellite

```json
{ "status": "deleted" }
```

### Get Satellite State

```json
{
  "sat_id": 12345,
  "pos": [7000, 0, 0],
  "vel": [0, 7.5, 0],
  "frame": "J2000",
  "central_body": 399,
  "a_bodies": { "399": [0.0, -0.001, 0.0], "10": [0.0001, 0.0, 0.0] },
  "a_j2": [0.0, 0.0, 0.0],
  "a_drag": [0.0, 0.0, 0.0],
  "a_total": [0.0, -0.001, 0.0],
  "altitude_radial": 7000.0, // Distance from central body center (km)
  "altitude_surface": 621.9, // Altitude above surface (km)
  "ground_velocity": 7.5, // Speed relative to central body (km/s)
  "orbital_velocity": 7.5 // (Same as ground_velocity for now)
}
```

### Get Planet State

The `/planet/{naif_id}` endpoint provides robust state vector queries for any supported body and epoch:

- **Reference Frame:**

  - By default, all positions and velocities are returned **relative to the Solar System Barycenter (SSB, NAIF ID 0)**.
  - You can override this by providing the `relative_to` query parameter with any valid NAIF ID (e.g., a planet barycenter or another body).
  - The response includes a `frame_of_reference` field indicating the NAIF ID used as the reference.

- **Within SPICE coverage:**
  - Returns high-precision state vectors from loaded SPICE kernels.
  - The response includes `"source": "spice"`.
- **Outside SPICE coverage:**
  - Returns a 2-body Keplerian propagated state, using the last available SPICE state as the initial condition.
  - The response includes `"source": "kepler"`.
- **If no SPICE data is available for a body:**
  - Returns canonical fallback orbits as defined in `solar_system.py`.
  - The response includes `"source": "canonical"`.

**Example request (default, SSB):**

```js
const resp = await axios.get(
  `http://localhost:8000/planet/399?session_id=${sessionId}`
);
```

**Example response:**

```json
{
  "naif_id": 399,
  "frame": "ECLIPJ2000",
  "relative_to": 0,
  "frame_of_reference": 0,
  "pos": [
    "-9.7388994600000000e+07",
    "-1.1688487000000000e+08",
    "3.2145925500000000e+04"
  ],
  "vel": [
    "2.9780000000000000e+01",
    "-6.0000000000000000e-01",
    "1.0000000000000000e-02"
  ],
  "quat": [0.707, 0.0, 0.707, 0.0],
  "source": "spice",
  "GM": 398600.4418
}
```

**Example request (custom reference):**

```js
const resp = await axios.get(
  `http://localhost:8000/planet/399?session_id=${sessionId}&relative_to=3`
);
```

**Example response:**

```json
{
  "naif_id": 399,
  "frame": "ECLIPJ2000",
  "relative_to": 3,
  "frame_of_reference": 3,
  "pos": [
    "1.2345678901234567e+08",
    "-2.3456789012345678e+07",
    "5.6789012345678901e+06"
  ],
  "vel": [
    "-1.2345678901234567e+01",
    "2.3456789012345678e+00",
    "-5.6789012345678901e-01"
  ],
  "quat": [0.707, 0.0, 0.707, 0.0],
  "source": "spice",
  "GM": 398600.4418
}
```

- `pos`: kilometers from the specified reference body's center (default: SSB).
- `frame_of_reference`: NAIF ID of the reference body used.
- `GM`: Gravitational parameter of the body (if available).

### Ephemeris Coverage

The `/ephemeris_coverage/{naif_id}` endpoint returns all SPICE ephemeris coverage intervals (in UTC) for the given NAIF ID. If no SPICE coverage is available, but the body exists in the simulation world, a fallback interval is returned with `fallback: true` and `kernel: "canonical_orbit"`.

**Example response (with fallback):**

```json
{
  "naif_id": 9999,
  "intervals": [
    {
      "start_utc": "FALLBACK",
      "end_utc": "FALLBACK",
      "kernel": "canonical_orbit",
      "fallback": true
    }
  ]
}
```

### Preview Trajectory

```json
{
  "sat_id": 12345,
  "trajectory": [
    {
      "epoch": 1234567890.0,
      "pos": [7010, 10, 0],
      "vel": [0, 7.5, 0],
      "soi_id": 399
    }
  ]
}
```

### Save Snapshot

```json
{
  /* full simulation state snapshot JSON */
}
```

### Load Snapshot

```json
{ "session_id": "550e8400-e29b-41d4-a716-446655440001" }
```

---

## Supported Solar System Bodies

The following table lists all planets, barycenters, and major moons supported by the server, with their NAIF IDs and parent mapping:

| Name                    | NAIF ID | Parent NAIF ID |
| ----------------------- | ------- | -------------- |
| Solar System Barycenter | 0       | None           |
| Sun                     | 10      | 0              |
| Mercury Barycenter      | 1       | 0              |
| Venus Barycenter        | 2       | 0              |
| Earth Barycenter        | 3       | 0              |
| Mars Barycenter         | 4       | 0              |
| Jupiter Barycenter      | 5       | 0              |
| Saturn Barycenter       | 6       | 0              |
| Uranus Barycenter       | 7       | 0              |
| Neptune Barycenter      | 8       | 0              |
| Pluto System Barycenter | 9       | 0              |
| Mercury                 | 199     | 1              |
| Venus                   | 299     | 2              |
| Earth                   | 399     | 3              |
| Mars                    | 499     | 4              |
| Jupiter                 | 599     | 5              |
| Saturn                  | 699     | 6              |
| Uranus                  | 799     | 7              |
| Neptune                 | 899     | 8              |
| Pluto                   | 999     | 9              |
| Moon                    | 301     | 3              |
| Phobos                  | 401     | 4              |
| Deimos                  | 402     | 4              |
| Io                      | 501     | 5              |
| Europa                  | 502     | 5              |
| Ganymede                | 503     | 5              |
| Callisto                | 504     | 5              |
| Mimas                   | 601     | 6              |
| Enceladus               | 602     | 6              |
| Tethys                  | 603     | 6              |
| Dione                   | 604     | 6              |
| Rhea                    | 605     | 6              |
| Titan                   | 606     | 6              |
| Iapetus                 | 608     | 6              |
| Ariel                   | 701     | 7              |
| Umbriel                 | 702     | 7              |
| Titania                 | 703     | 7              |
| Oberon                  | 704     | 7              |
| Miranda                 | 705     | 7              |
| Triton                  | 801     | 8              |
| Proteus                 | 802     | 8              |
| Nereid                  | 803     | 8              |
| Charon                  | 901     | 9              |
| Nix                     | 902     | 9              |
| Hydra                   | 903     | 9              |
| Kerberos                | 904     | 9              |
| Styx                    | 905     | 9              |

---

> **Note:**
> If a body is not covered by SPICE, canonical fallback is used and the `source` field in responses will be `"canonical"`. The `/ephemeris_coverage/{naif_id}` endpoint will return a fallback interval for such bodies.

## Frontend Controls: Timewarp and Framerate

You can (and should) provide users with controls for both simulation speed (timewarp) and the update framerate (WebSocket rate) directly in your frontend UI. Both controls are session-specific and must use the correct `session_id`.

### 1. Timewarp (Simulation Speed) Control

Add a slider or input to let users set the simulation speed multiplier. This now uses an HTTP POST request.

```jsx
// Example: Timewarp slider (React)
const [timewarp, setTimewarpUi] = useState(1);
const sessionId = /* your active session ID */;

async function handleTimewarpChange(e) {
  const newFactor = parseFloat(e.target.value);
  try {
    // Assuming 'axios' is imported and 'sessionId' is available
    const response = await axios.post(`http://localhost:8000/session/${sessionId}/timewarp?factor=${newFactor}`);
    setTimewarpUi(response.data.timewarp_factor); // Update UI with confirmed factor
    console.log("Timewarp successfully set to:", response.data.timewarp_factor);
  } catch (error) {
    console.error("Failed to set timewarp:", error.response ? error.response.data : error.message);
    // Optionally revert UI or show error to user
  }
}

// In your JSX:
<input type="range" min={0} max={1000} step={1} value={timewarp} onChange={handleTimewarpChange} />
<span>{timewarp}x</span>
```

### 2. Framerate (WebSocket Update Rate) Control

Let users choose how often the frontend receives updates from the backend. This is set when you open the WebSocket:

```jsx
// Example: Framerate dropdown (React)
const [rate, setRate] = useState(60); // Hz
const sessionId = ...; // your session id

function openWebSocket() {
  const wsUrl = `ws://localhost:8000/ws?session_id=${sessionId}&rate=${rate}`;
  ws.current = new WebSocket(wsUrl);
  // ... handle onmessage, etc.
}

// In your JSX:
<select value={rate} onChange={e => setRate(Number(e.target.value))}>
  <option value={10}>10 Hz</option>
  <option value={30}>30 Hz</option>
  <option value={60}>60 Hz</option>
  <option value={120}>120 Hz</option>
</select>
<button onClick={openWebSocket}>Connect</button>
```

**Best Practices:**

- Always use the correct `session_id` for all controls and WebSocket/API calls.
- Provide reasonable min/max values for timewarp and framerate (e.g., 1–1000x for timewarp, 10–120 Hz for framerate).
- Show the current values to the user for clarity.
- If the user changes the framerate, you may need to reconnect the WebSocket with the new `rate` value.
