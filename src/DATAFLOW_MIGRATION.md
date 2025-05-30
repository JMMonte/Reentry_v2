# Data Flow Migration Guide

This guide explains how to migrate from the current mixed architecture to a clean separation of physics, rendering, and UI layers.

## Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  React UI       │────▶│   Physics API    │────▶│ Physics Engine  │
│  (Display Only) │     │   (Interface)    │     │ (Source of Truth)│
└─────────────────┘     └──────────────────┘     └─────────────────┘
         │                       │                         │
         │                       ▼                         │
         │              ┌──────────────────┐              │
         └─────────────▶│ Render Managers  │◀─────────────┘
                        │  (Three.js)      │
                        └──────────────────┘
```

## Key Principles

1. **Single Source of Truth**: Physics engine owns all simulation state
2. **Unidirectional Data Flow**: Physics → API → Rendering/UI
3. **No State Duplication**: Each layer only stores what it needs
4. **Clean Interfaces**: DTOs define data shape between layers

## Migration Steps

### 1. Initialize Physics API in App3D

```javascript
// In App3D.js init()
import { PhysicsAPI } from './physics/PhysicsAPI.js';
import { SatelliteRenderManager } from './managers/SatelliteRenderManager.js';

// After physics integration is initialized
this.physicsAPI = new PhysicsAPI(this.physicsIntegration);

// Replace SatelliteManager with SatelliteRenderManager
this.satelliteRenderManager = new SatelliteRenderManager(this);
this.satelliteRenderManager.initialize();
```

### 2. Update SatelliteCreator Component

Replace direct physics calculations with the hook:

```javascript
import { usePhysicsData } from '../../hooks/usePhysicsData';
import { SatelliteCreationParams } from '../../types/DataTransferObjects';

function SatelliteCreator({ selectedBody }) {
    const { createSatellite, calculateCircularVelocity } = usePhysicsData();
    
    // Remove velocity calculations from component
    // Remove direct App3D access
    
    const handleCreate = async () => {
        const params = new SatelliteCreationParams({
            name,
            color,
            mode: 'latlon',
            latitude,
            longitude,
            altitude,
            velocity: circular ? undefined : velocity,
            azimuth,
            angleOfAttack,
            centralBodyId: selectedBody.naifId
        });
        
        await createSatellite(params);
    };
}
```

### 3. Update SatelliteListWindow

Use the physics data hook instead of context:

```javascript
import { usePhysicsData } from '../../hooks/usePhysicsData';

function SatelliteListWindow() {
    const { satellites, deleteSatellite, updateSatelliteColor } = usePhysicsData();
    
    // Convert Map to array for display
    const satelliteList = Array.from(satellites.values());
    
    // Rest of component remains similar
}
```

### 4. Remove PhysicsStateContext

Replace all uses of `PhysicsStateContext` with `usePhysicsData` hook.

### 5. Clean Up SatelliteManager

The current SatelliteManager can be removed entirely. Its responsibilities are split:
- Physics updates → Handled by PhysicsEngine
- Rendering → Handled by SatelliteRenderManager
- UI updates → Handled by React hooks

### 6. Update Event System

Instead of multiple event types, use a single physics update event:

```javascript
// Physics engine dispatches single event
window.dispatchEvent(new CustomEvent('physicsUpdate', {
    detail: { time: simulationTime }
}));

// Managers subscribe and pull data as needed
physicsAPI.subscribe((renderData) => {
    // Update rendering
});
```

## Benefits

1. **Performance**: Less data copying, more efficient updates
2. **Maintainability**: Clear separation of concerns
3. **Testability**: Each layer can be tested independently
4. **Scalability**: Easy to add new features without touching other layers

## Example: Adding a New Satellite Property

Old way (touches all layers):
1. Add property to PhysicsEngine satellite
2. Add property to Satellite.js
3. Update SatelliteManager to copy property
4. Update React context to expose property
5. Update UI components to display property

New way:
1. Add property to PhysicsEngine satellite
2. Add property to SatelliteUIData DTO if needed for UI
3. UI automatically gets updated via subscription

## Rollback Plan

If issues arise during migration:
1. Keep old managers alongside new ones initially
2. Use feature flags to switch between implementations
3. Migrate one component at a time
4. Keep physics engine changes minimal initially