# Physics Module - Self-Sufficient Embedded Backend

🚀 **The complete physics backend for Darksun space simulation application.**

This module provides a self-contained physics engine that works independently from visualization layers, acting as an embedded backend for orbital mechanics calculations.

## 🏗️ Architecture Overview

### Core Philosophy

- **Self-Sufficient**: Works independently without external dependencies
- **Domain-Organized**: Functions grouped by physics domain (Orbital, Atmosphere, etc.)
- **Zero Initialization**: Ready to use immediately, no setup required
- **Pure Functions**: Stateless calculations with predictable outputs
- **Performance Optimized**: Centralized calculations with smart caching

### Directory Structure

```
physics/
├── README.md              # This file
├── index.js              # Main exports and usage examples
├── PhysicsAPI.js         # ✨ PRIMARY API - Domain-organized interface
├── PhysicsEngine.js      # Core physics simulation engine
├── PhysicsManager.js     # High-level physics management
├── StateVectorCalculator.js   # State vector calculations
├── PositionManager.js    # Hierarchical position management
├── SolarSystemHierarchy.js   # Solar system structure
│
├── core/                 # Core physics calculations
│   ├── OrbitPropagator.js
│   ├── OrbitalMechanics.js
│   ├── ApsisCalculator.js
│   ├── GravityCalculator.js
│   ├── AtmosphericModels.js
│   └── SatelliteAccelerationCalculator.js
│
├── utils/                # Physics utilities
│   ├── PhysicsUtils.js
│   └── SatelliteCoordinates.js
│
├── integrators/          # Numerical integration
│   └── OrbitalIntegrators.js
│
├── bodies/               # Celestial body data
│   ├── PlanetaryDataManager.js
│   ├── planets/
│   ├── moons/
│   └── barycenters/
│
└── workers/              # Web workers for performance
    └── orbitPropagationWorker.js
```

## 🎯 Main API Usage

### Recommended: Domain-Specific Imports

```javascript
import { Orbital, Bodies, Atmosphere, Utils } from "./physics";

// Orbital mechanics
const elements = Orbital.calculateElements(position, velocity, centralBody);
const hohmann = Orbital.calculateHohmannTransfer(params);
const nextPeriapsis = Orbital.nextPeriapsis(position, velocity, body, time);

// Body data and properties
const bodyData = Bodies.getData("Earth");
const GM = Bodies.getGM("Mars");
const rotationRate = Bodies.getRotationRate(planet);

// Atmospheric calculations
const density = Atmosphere.getDensity("Earth", 400);
const drag = Atmosphere.calculateDrag(velocity, density, area, Cd);

// Coordinate transformations
const coords = Coordinates.fromLatLonAlt(lat, lon, alt, vel, az, aoa, planet);
const deltaV = Utils.vector.localToWorldDeltaV(localDV, position, velocity);
const executionTime = Utils.time.computeExecutionTime(now, mode, params);
```

### Alternative: Main API Object

```javascript
import Physics from "./physics";

const elements = Physics.Orbital.calculateElements(position, velocity, body);
const bodyData = Physics.Bodies.getData("Mars");
```

### Advanced: Direct Access to Core Components

```javascript
import { Advanced } from "./physics";

const propagator = new Advanced.OrbitPropagator();
const calculator = new Advanced.OrbitalMechanics();
```

## 📊 API Domains

### 🛰️ Orbital

Primary orbital mechanics calculations:

- `calculateElements()` - State vector to orbital elements
- `calculateHohmannTransfer()` - Hohmann transfer calculations
- `nextPeriapsis()` / `nextApoapsis()` - Apsis timing
- `circularVelocity()` - Circular orbital velocity
- `calculatePeriodFromSMA()` - Orbital period from semi-major axis

### 🪐 Bodies

Celestial body data and properties:

- `getData()` - Complete body information
- `getGM()` - Gravitational parameter
- `getRotationRate()` - Body rotation rate

### 🌍 Atmosphere

Atmospheric physics:

- `getDensity()` - Atmospheric density at altitude
- `calculateDrag()` - Drag force calculations
- `getScaleHeight()` - Atmospheric scale height

### 🗺️ Coordinates

Coordinate system transformations:

- `fromLatLonAlt()` - Geographic to Cartesian coordinates
- `toLatLonAlt()` - Cartesian to geographic coordinates
- `transform()` - Between different coordinate systems

### 🔧 Utils

Utility functions and conversions:

- `time.computeExecutionTime()` - Calculate execution timing
- `vector.localToWorldDeltaV()` - Delta-V coordinate transforms
- `convert.*` - Unit conversions
- `physics.*` - Direct access to PhysicsUtils

## 🚀 Migration Status

✅ **MIGRATION COMPLETED & LEGACY REMOVED** - All components use the new API structure:

### Migrated Components:

- ✅ PhysicsEngine.js
- ✅ ManeuverManager.js
- ✅ ManeuverPreviewManager.js
- ✅ SatelliteOrbitManager.js
- ✅ SatelliteDebugWindow.jsx
- ✅ CelestialOrbitCalculator.js
- ✅ ManeuverUtils.js
- ✅ SatelliteCoordinates.js
- ✅ useManeuverWindow.jsx
- ✅ All other physics-related components

### Clean Architecture:

- 🎯 Single unified API with domain organization
- 🚀 Zero legacy code - completely modernized structure
- ✨ All components use the new domain-organized API

## 🔬 Core Features

### Self-Sufficient Operation

- No external initialization required
- Works independently from UI layers
- Can be used as a standalone physics library

### Performance Optimized

- Centralized calculations reduce redundancy
- Smart caching for expensive operations
- Web Workers for heavy computations

### Maintainable Architecture

- Clear separation of concerns
- Domain-specific organization
- Predictable, consistent API patterns

## 📝 Development Guidelines

### For New Features:

1. Add functions to appropriate domain (Orbital, Bodies, etc.)
2. Follow pure function patterns (no side effects)
3. Include comprehensive JSDoc documentation
4. Add unit tests for new functionality

### For Bug Fixes:

1. Update the new API, not the old one
2. Ensure changes maintain backward compatibility
3. Test across all dependent components

### Code Style:

- Use domain-specific imports: `import { Orbital } from './physics'`
- Use the domain-organized API structure consistently
- Follow existing naming conventions and patterns

---

**This physics module represents the completed reorganization of the Darksun physics system into a self-sufficient, embedded backend with a clean, domain-organized API structure.**
