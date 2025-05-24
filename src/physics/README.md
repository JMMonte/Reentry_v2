# Physics Engine System

This directory contains the high-precision physics engine for the Darksun space simulation. The system integrates Astronomy Engine with N-body dynamics to provide accurate celestial mechanics simulation with barycenter calculations and satellite propagation.

## Recent Simplifications (2025)

**Major code cleanup completed:**

- ✅ **Consolidated orbital mechanics**: Merged `OrbitalMechanics.js` into `OrbitPropagator.js` (eliminated 455 lines of redundancy)
- ✅ **Simplified StateVectorCalculator**: Removed unused fallback methods and dead code (reduced from 407 to 335 lines)
- ✅ **Fixed naming consistency**: Renamed `PhysicsEngineRefactored.js` to `PhysicsEngine.js`
- ✅ **Removed orphaned code**: Deleted unused `physicsWorker.js` (228 lines)
- ✅ **Updated all imports**: Fixed broken references throughout the codebase

**Result**: Cleaner, more maintainable codebase with ~1000+ lines of redundant code removed.

## Architecture Overview

```plaintext
src/physics/
├── PhysicsEngine.js           # Core physics engine with N-body dynamics
├── OrbitPropagator.js         # Orbit propagation + consolidated orbital mechanics
├── PhysicsIntegration.js      # Integration layer with existing codebase
├── StateVectorCalculator.js   # Simplified state vector calculations
├── PositionManager.js         # Hierarchical positioning logic
├── SolarSystemHierarchy.js    # Solar system parent-child relationships
└── bodies/                    # Planetary data and configurations
    ├── PlanetaryDataManager.js
    ├── planets/               # Individual planet configurations
    ├── moons/                 # Moon system configurations
    └── barycenters/           # Barycenter definitions
```

## Key Components

### PhysicsEngine.js

The main physics engine that orchestrates all calculations:

```javascript
import { PhysicsEngine } from "./physics/PhysicsEngine.js";

const engine = new PhysicsEngine();
await engine.initialize(new Date());

// Get current state
const state = engine.getSimulationState();
console.log(state.bodies); // All celestial bodies
console.log(state.satellites); // All satellites
```

### OrbitPropagator.js (Consolidated)

**Now includes all orbital mechanics functionality:**

- Keplerian orbit calculations
- Trajectory generation
- Orbital elements computation
- State vector conversions
- Compatibility functions for legacy code

```javascript
import { OrbitPropagator } from "./physics/OrbitPropagator.js";

const propagator = new OrbitPropagator();

// Generate orbit path
const orbitPath = propagator.generateOrbitPath(moonBody, earthBody, 360);

// Calculate orbital elements
const elements = propagator.calculateOrbitalElements(satellite, earth);
```

### StateVectorCalculator.js (Simplified)

**Streamlined for essential functionality:**

- Astronomy Engine integration
- Earth-Moon system calculations
- Galilean moon states
- Removed unused fallback methods

```javascript
import { StateVectorCalculator } from "./physics/StateVectorCalculator.js";

const calculator = new StateVectorCalculator(hierarchy);
const state = calculator.calculateStateVector(naifId, time);
// Returns: { position: [x, y, z], velocity: [vx, vy, vz] }
```

### PhysicsIntegration.js

Integration layer that connects the physics engine with the existing app:

```javascript
import { PhysicsIntegration } from "./physics/PhysicsIntegration.js";

const integration = new PhysicsIntegration(app);
await integration.initialize();

// Add satellites
integration.addSatellite(satelliteData);

// Generate trajectories
const trajectory = integration.generateSatelliteTrajectory(satelliteId, 3600);
```

## Data Flow

```plaintext
1. PlanetaryDataManager loads body configurations
2. SolarSystemHierarchy builds parent-child relationships
3. StateVectorCalculator computes positions using Astronomy Engine
4. PositionManager handles hierarchical positioning
5. PhysicsEngine orchestrates everything and manages satellites
6. PhysicsIntegration syncs with existing app components
```

## Coordinate Systems

- **ECLIPJ2000**: Primary reference frame (J2000.0 ecliptic)
- **Hierarchical**: Bodies positioned relative to their parents
- **Barycentric**: Major bodies relative to system barycenters

## Time Management

- **Simulation Time**: Physics engine internal time
- **Real Time**: Wall clock time for UI updates
- **Time Warp**: Accelerated simulation for orbital mechanics

## Performance Features

- **Caching**: Orbital elements and trajectories cached for performance
- **Hierarchical Updates**: Parents updated before children
- **Selective Calculation**: Only active bodies are computed
- **Worker Support**: Physics calculations can run in web workers

## Integration Points

### With Existing Codebase

- **App3D.js**: Main application integration
- **OrbitManager.js**: Orbit visualization
- **SatelliteManager.js**: Satellite tracking
- **MoonManager.js**: Moon positioning
- **TimeUtils.js**: Time synchronization

### With UI Components

- **usePhysicsEngine.js**: React hook for physics access
- **Ground track components**: Real-time satellite tracking
- **Orbit visualization**: Dynamic orbit rendering

## Configuration

Bodies are configured in `src/physics/bodies/`:

```javascript
// Example planet configuration
export default {
  name: "Earth",
  naif_id: 399,
  type: "planet",
  mass: 5.972e24, // kg
  radius: 6371, // km
  parent: 3, // Earth-Moon Barycenter
  astronomyEngineName: "Earth",
};
```

## Error Handling

- **Graceful Degradation**: Missing data doesn't crash the system
- **Fallback Methods**: Multiple calculation approaches for robustness
- **Validation**: Input validation for all public methods
- **Logging**: Comprehensive error and warning messages

## Future Improvements

- **GPU Acceleration**: Move calculations to GPU shaders
- **Higher-Order Integrators**: More accurate numerical integration
- **Relativistic Effects**: General relativity corrections
- **Asteroid/Comet Support**: Extended small body catalog

## Dependencies

- **astronomy-engine**: High-precision astronomical calculations
- **three.js**: 3D mathematics and vector operations
- **Constants.js**: Physical and mathematical constants

## Testing

Run the physics engine test:

```bash
node test_refactor.js
```

This validates:

- Engine initialization
- Body state calculations
- Satellite propagation
- Time stepping
- Error handling
