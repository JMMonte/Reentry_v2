# Physics System Architecture

## Overview

The physics system in Reentry v2 consists of two main execution paths:
1. **Real-time satellite motion** (PhysicsEngine)
2. **Orbit visualization** (orbitPropagationWorker)

Both paths use the same centralized physics calculations to ensure consistency.

## Execution Flow Diagram

```mermaid
graph TB
    %% Entry Points
    App3D[App3D Main Loop] --> PhysicsIntegration
    UI[UI Components] --> SatelliteManager
    
    %% Physics Integration Layer
    PhysicsIntegration -->|60Hz fixed timestep| PhysicsEngine
    PhysicsIntegration -->|Updates time| TimeUtils
    
    %% Time Management
    TimeUtils -->|Time sync events| PhysicsIntegration
    
    %% Satellite Management
    SatelliteManager -->|Add/Remove| PhysicsIntegration
    PhysicsIntegration -->|Delegates| PhysicsEngine
    
    %% Core Physics Engine
    PhysicsEngine -->|Body positions| SolarSystemHierarchy
    PhysicsEngine -->|State vectors| StateVectorCalculator
    PhysicsEngine -->|Hierarchical positions| PositionManager
    PhysicsEngine -->|Satellite dynamics| SatelliteAccelerationCalculator
    
    %% Physics Modules
    StateVectorCalculator -->|Orbital mechanics| AstronomyEngine
    PositionManager -->|Uses| StateVectorCalculator
    PositionManager -->|Uses| SolarSystemHierarchy
    
    %% Satellite Physics
    SatelliteAccelerationCalculator -->|N-body gravity| GravityCalculator
    SatelliteAccelerationCalculator -->|J2 perturbations| GravityCalculator
    SatelliteAccelerationCalculator -->|Atmospheric drag| AtmosphericModels
    SatelliteAccelerationCalculator -->|SOI transitions| SOILogic[SOI Transition Logic]
    
    %% Integration
    PhysicsEngine -->|RK4 integration| OrbitalIntegrators
    OrbitalIntegrators -->|Uses| SatelliteAccelerationCalculator
    
    %% Orbit Visualization Path
    SatelliteOrbitManager -->|Manages workers| OrbitPropagationWorker
    OrbitPropagationWorker -->|Same physics| SatelliteAccelerationCalculator
    OrbitPropagationWorker -->|RK4 integration| OrbitalIntegrators
    OrbitPropagationWorker -->|SOI checks| SatelliteAccelerationCalculator
    
    %% Data Flow
    PhysicsEngine -.->|Physics state| SatelliteOrbitManager
    PhysicsEngine -.->|Events| SatelliteManager
    SatelliteManager -.->|Visual updates| Satellite3DObjects[Satellite 3D Objects]
    SatelliteOrbitManager -.->|Orbit paths| Three.js Scene
    
    %% Planetary Data
    PlanetaryDataManager[(Planetary Data)] --> PhysicsEngine
    PlanetaryDataManager --> SolarSystemHierarchy
    PlanetaryDataManager --> StateVectorCalculator
```

## Module Relationships

### 1. Real-time Satellite Motion Path

**Entry Point**: `PhysicsIntegration.updateLoop()`
- Runs at 60Hz fixed timestep
- Manages time accumulator for physics stability
- Drives the entire simulation

**Core Flow**:
```
PhysicsIntegration.updateLoop()
  → PhysicsEngine.setTime() // Updates all body positions
  → PhysicsEngine.step() // Integrates satellite dynamics
    → _integrateSatellites()
      → SatelliteAccelerationCalculator.computeAcceleration()
        → GravityCalculator.computeAcceleration() // N-body forces
        → GravityCalculator.computeJ2Acceleration() // J2 perturbations
        → AtmosphericModels.computeDragAcceleration() // Drag
      → integrateRK4() // Numerical integration
      → SatelliteAccelerationCalculator.checkSOITransition() // SOI checks
```

### 2. Orbit Visualization Path

**Entry Point**: `SatelliteOrbitManager.updateSatelliteOrbit()`
- Triggered by satellite add/update events
- Runs in Web Workers for performance

**Core Flow**:
```
SatelliteOrbitManager.updateSatelliteOrbit()
  → _startPropagationJob()
    → Worker: orbitPropagationWorker
      → createAccelerationFunction() // Uses same calculator
        → SatelliteAccelerationCalculator.computeAcceleration()
      → integrateRK4() // Same integration method
      → checkSOITransition() // Same SOI logic
  → _updateOrbitVisualization() // Updates Three.js lines
```

## Data Flow

### Bodies Data
- **Source**: `PlanetaryDataManager` (singleton)
- **Flow**: PlanetaryDataManager → PhysicsEngine → Workers
- **Format**: `{ naifId: { position, velocity, mass, GM, J2, ... } }`

### Satellite State
- **Source**: PhysicsEngine (single source of truth)
- **Flow**: PhysicsEngine → Events → SatelliteManager → UI
- **Format**: `{ position, velocity, acceleration, centralBodyNaifId, ... }`

### Options/Parameters
- **Display Settings**: App → DisplaySettingsManager → SatelliteOrbitManager
- **Physics Settings**: Fixed timestep (1/60s), RK4 integration
- **Satellite Properties**: mass, dragCoefficient, crossSectionalArea

## Key Integration Points

### 1. Centralized Acceleration Calculation
`SatelliteAccelerationCalculator.computeAcceleration()` is used by:
- PhysicsEngine for real-time motion
- orbitPropagationWorker for visualization
- Ensures identical physics in both paths

### 2. Consistent Integration
Both paths use `integrateRK4()` from `OrbitalIntegrators.js`:
- Same numerical method
- Same timestep handling
- Same acceleration function interface

### 3. Unified SOI Management
`SatelliteAccelerationCalculator.checkSOITransition()` handles:
- SOI boundary detection
- Reference frame transformations
- Parent body switching

## Remaining Issues

### 1. Parameter Consistency
- ✅ Both paths use same physics modules
- ✅ Default values centralized in modules
- ✅ Satellite properties passed to workers

### 2. Data Synchronization
- ✅ Workers receive physics state updates
- ✅ Events synchronize UI with physics
- ⚠️ Minor delay between physics update and orbit visualization

### 3. Performance Considerations
- Real-time path: 60Hz fixed timestep
- Visualization: Async worker processing
- Cache invalidation on state changes

## Best Practices

1. **Always use PhysicsEngine as single source of truth**
   - Don't store satellite state elsewhere
   - Use events for UI synchronization

2. **Maintain consistent units**
   - Positions: km from SSB
   - Velocities: km/s
   - Accelerations: km/s²
   - Time: seconds (or Date objects)

3. **Use centralized physics modules**
   - SatelliteAccelerationCalculator for all accelerations
   - OrbitalIntegrators for all numerical integration
   - GravityCalculator for all gravitational forces

4. **Handle reference frames properly**
   - Planet-centric for satellites
   - SSB-centric for bodies
   - Transform correctly during SOI transitions