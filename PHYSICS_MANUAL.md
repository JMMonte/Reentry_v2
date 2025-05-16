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

To control the simulation speed ("timewarp"), you must:

1. **Connect to the WebSocket endpoint with your session ID:**

   ```plaintext
   ws://localhost:8000/ws?session_id=YOUR_SESSION_ID
   ```

2. **Send a binary message to set the timewarp factor:**

   ```js
   function setTimewarp(factor, ws) {
     // ws: an open WebSocket connected with the correct session_id
     const buf = new ArrayBuffer(5);
     const dv = new DataView(buf);
     dv.setUint8(0, 1); // msgType = 1 (set timewarp)
     dv.setFloat32(1, factor, true); // little-endian float
     ws.send(buf);
   }
   // Example usage:
   setTimewarp(1000.0, ws); // 1000x real time
   ```

**Note:** The WebSocket URL **must** include your `session_id`. If you omit it, the backend will not know which simulation to control.

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

The WebSocket stream provides three types of binary messages:

- **msgType = 2**: Simulation epoch time (ECLIPJ2000 ET)
  - `uint8  msgType` (value 2)
  - `float64 et` (seconds past ECLIPJ2000)

**Example (JavaScript):**

```js
ws.onmessage = (event) => {
  const data = new DataView(event.data);
  const msgType = data.getUint8(0);
  if (msgType === 2) {
    const et = data.getFloat64(1, true);
    console.log("Simulation epoch ET:", et);
  }
  // ... handle other msgTypes ...
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
- On each animation frame, update mesh positions based on WebSocket streaming or preview data.

## Planet Placement & Reference Frames

_To render each planet in your scene consistently across different reference frames:_

- Always request your planet state using the same `frame` as your simulation and WebSocket stream.
- Note: by default, each body's state is returned relative to its natural parent. Main planets use the solar system barycenter (NAIF ID 0); moons (e.g. Jupiter's) use their planet's barycenter.
- Check the `relative_to` field in the response to see which body the coordinates are relative to. To force a common origin for all bodies, explicitly set `relative_to=0` in your request.
- Fetch planet state via:

  ```js
  const resp = await axios.get(
    `http://localhost:8000/planet/3?session_id=${sessionId}&frame=ECLIPJ2000`
  );
  const { pos, quat } = resp.data;
  ```

  ```json
  // Example response payload:
  {
    "naif_id": 3,
    "frame": "ECLIPJ2000",
    "relative_to": 1,
    "pos": [150000000.0, -20000000.0, 5000000.0],
    "vel": [30.0, 20.0, -1.0],
    "quat": [0.707, 0.0, 0.707, 0.0],
    "source": "spice"
  }
  ```

- `pos`: kilometers from the natural-parent's center. Convert to your scene's units (e.g., meters):

  ```js
  const METER_SCALE = 1000; // km -> m
  mesh.position.set(...pos.map((c) => c * METER_SCALE));
  ```

- `quat`: orientation quaternion [w, x, y, z]. Apply to align the mesh:

  ```js
  mesh.setRotationFromQuaternion(
    new THREE.Quaternion(quat[1], quat[2], quat[3], quat[0])
  );
  ```

- Ensure your WebSocket connection uses the same frame:

  ```plaintext
  ws://localhost:8000/ws?session_id=${sessionId}&frame=ECLIPJ2000
  ```

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
  "a_bodies": { "399": [0.0, -0.001, 0.0] },
  "a_j2": [0.0, 0.0, 0.0],
  "a_drag": [0.0, 0.0, 0.0],
  "a_total": [0.0, -0.001, 0.0]
}
```

### Get Planet State

The `/planet/{naif_id}` endpoint provides robust state vector queries for any supported body and epoch:

- **Within SPICE coverage:**
  - Returns high-precision state vectors from loaded SPICE kernels.
  - The response includes `"source": "spice"`.
- **Outside SPICE coverage:**
  - Returns a 2-body Keplerian propagated state, using the last available SPICE state as the initial condition.
  - The response includes `"source": "kepler"`.
- **If no SPICE data is available for a body:**
  - Returns canonical fallback orbits as defined in `solar_system.py`.
  - The response includes `"source": "canonical"`.

**Example response:**

```json
{
  "naif_id": 9999,
  "frame": "J2000",
  "relative_to": 5,
  "pos": [...],
  "vel": [...],
  "quat": [...],
  "source": "canonical"
}
```

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

Add a slider or input to let users set the simulation speed multiplier. For example, in React:

```jsx
// Example: Timewarp slider (React)
const [timewarp, setTimewarp] = useState(1);
const ws = useRef(null); // Your open WebSocket instance

function handleTimewarpChange(e) {
  const value = parseFloat(e.target.value);
  setTimewarp(value);
  if (ws.current && ws.current.readyState === WebSocket.OPEN) {
    const buf = new ArrayBuffer(5);
    const dv = new DataView(buf);
    dv.setUint8(0, 1); // msgType = 1
    dv.setFloat32(1, value, true);
    ws.current.send(buf);
  }
}

// In your JSX:
<input type="range" min={1} max={1000} step={1} value={timewarp} onChange={handleTimewarpChange} />
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
