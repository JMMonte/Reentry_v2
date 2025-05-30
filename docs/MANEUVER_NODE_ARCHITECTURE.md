# Maneuver Node Architecture

## Overview

The maneuver node system has been refactored to follow clean architecture principles with proper separation of concerns. The system now has distinct layers for physics calculations, UI controls, and 3D visualization.

## Architecture Layers

### 1. Physics Layer (`src/physics/`)

**PhysicsEngine** - Central authority for all physics calculations
- Stores maneuver nodes in `maneuverNodes` Map
- Executes maneuvers during satellite integration
- Dispatches events for UI synchronization
- Methods:
  - `addManeuverNode(satelliteId, maneuverNode)`
  - `removeManeuverNode(satelliteId, nodeId)`
  - `getManeuverNodes(satelliteId)`
  - `_checkAndExecuteManeuvers(satellite, currentTime)`

**PhysicsAPI** - Clean interface for physics calculations
- Orbital element calculations
- Periapsis/apoapsis calculations
- Hohmann transfer calculations
- Delta-V coordinate transformations
- Pure functions with no side effects

**ApsisCalculator** - Specialized apsis calculations
- Analytical and numerical methods
- Impact detection
- Time to apsis calculations

### 2. Data Transfer Layer (`src/types/DataTransferObjects.js`)

**DTOs** - Clean data structures for communication
- `ManeuverNodeDTO` - Core maneuver data
- `HohmannTransferRequestDTO` - Transfer planning input
- `HohmannTransferResponseDTO` - Transfer calculation results
- `ManeuverVisualizationDTO` - 3D visualization data

### 3. UI Layer (`src/components/ui/satellite/`)

**useManeuverWindow** - React hook for maneuver planning UI
- Uses PhysicsAPI for all calculations
- Manages form state and user input
- No direct physics calculations

**SatelliteManeuverWindow** - React component
- Displays maneuver planning interface
- Handles user interactions
- Shows loading state when data unavailable

**ManeuverManager** - UI-side maneuver coordination
- Builds node models for display
- Uses PhysicsAPI for calculations
- Manages UI state transitions

### 4. Visualization Layer (`src/components/Satellite/`)

**ManeuverNodeVisualizer** - Pure 3D visualization
- Creates Three.js meshes and arrows
- Updates visual properties (position, scale, color)
- Manages predicted orbit lines
- No physics calculations

**Satellite** - Updated to work with new architecture
- Listens for physics engine events
- Delegates maneuver operations to PhysicsEngine
- Updates visualizer based on events

## Data Flow

### Adding a Maneuver Node

```
User Input (UI) 
    ↓
useManeuverWindow (calculates using PhysicsAPI)
    ↓
Creates ManeuverNodeDTO
    ↓
Satellite.addManeuverNode()
    ↓
PhysicsEngine.addManeuverNode()
    ↓
Dispatches 'maneuverNodeAdded' event
    ↓
Satellite receives event
    ↓
ManeuverNodeVisualizer.updateNodeVisualization()
    ↓
Three.js scene updated
```

### Executing a Maneuver

```
PhysicsEngine._integrateSatellites()
    ↓
PhysicsEngine._checkAndExecuteManeuvers()
    ↓
Applies delta-V to satellite velocity
    ↓
Dispatches 'maneuverExecuted' event
    ↓
Satellite receives event
    ↓
Updates orbit visualization
```

### Calculating Maneuver Parameters

```
UI requests calculation
    ↓
PhysicsAPI method called (pure function)
    ↓
Returns calculated values
    ↓
UI displays results
```

## Event System

The system uses browser events for communication between layers:

- `maneuverNodeAdded` - New node added to physics engine
- `maneuverNodeRemoved` - Node removed from physics engine
- `maneuverExecuted` - Maneuver executed, velocity changed

## Benefits of New Architecture

1. **Separation of Concerns**
   - Physics calculations isolated in PhysicsEngine/PhysicsAPI
   - UI logic separated from physics
   - Visualization purely handles 3D rendering

2. **Testability**
   - PhysicsAPI methods are pure functions
   - Each layer can be tested independently
   - Mock events for integration testing

3. **Maintainability**
   - Clear responsibilities for each module
   - Easy to locate and fix issues
   - Consistent data flow patterns

4. **Performance**
   - Physics runs in main thread with PhysicsEngine
   - UI updates only when needed via events
   - Visualization updates throttled by frame rate

5. **Extensibility**
   - Easy to add new maneuver types
   - Can swap visualization implementations
   - Physics calculations can be enhanced without UI changes

## Migration Notes

### Old Architecture Issues
- ManeuverNode.js mixed physics, visualization, and worker communication
- Direct RK45 integration in UI components
- Multiple sources of truth for orbital state
- UI components directly manipulating 3D objects

### What Changed
- All physics calculations moved to PhysicsEngine/PhysicsAPI
- Clean DTOs for data transfer
- Event-based communication
- Single source of truth (PhysicsEngine)

### Breaking Changes
- ManeuverNode class completely replaced
- ApsisFinder.js moved to physics/core/ApsisCalculator.js
- Redundant apsis methods removed from PhysicsUtils.js
- Satellite.addManeuverNode() now delegates to PhysicsEngine