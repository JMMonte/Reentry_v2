# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Darksun is a web-based 3D space simulation application for orbital mechanics, interplanetary travel, and reentry vehicles. It uses React 18 with Vite, Three.js for 3D rendering, and a custom physics engine running in Web Workers.

## Common Development Commands

```bash
# Start development server (port 4000)
npm run dev

# Build for production
npm run build

# Run tests
npm run test

# Preview production build
npm run preview

# Clean build artifacts
npm run clean

# Generate favicons
npm run generate:favicons

# Analyze bundle size
npm run analyze
```

## Architecture Overview

### Core Systems

1. **Physics Engine** (`src/physics/`)
   - `PhysicsEngine.js` - Main physics simulation using RK4 integration
   - Runs in Web Workers for performance
   - Handles N-body gravitation, atmospheric drag, and solar radiation pressure
   - Uses a hierarchical barycenter system for accurate multi-body dynamics

2. **3D Rendering** (`src/App3D.js`, `src/components/`)
   - Three.js-based scene management
   - Custom shaders for atmospheres and SOI visualization
   - Optimized rendering with LOD and frustum culling

3. **State Management**
   - `PhysicsStateContext` - Centralized physics state
   - `SimulationContext` - Simulation controls and timing
   - WebSocket integration for real-time features

4. **UI Components** (`src/components/ui/`)
   - Tailwind CSS with Radix UI primitives
   - Modular component structure
   - Theme-aware with dark mode support

### Key Architectural Patterns

- **Position Units**: All positions internally use kilometers (km) from Solar System Barycenter
- **Velocity Units**: km/s for consistency with position units
- **Time**: Julian Date (JD) for astronomical calculations
- **Coordinate System**: J2000 ecliptic reference frame
- **State Vectors**: [x, y, z, vx, vy, vz] format throughout

### Important Files

- `src/physics/PhysicsEngine.js` - Core physics simulation
- `src/App3D.js` - Main 3D scene setup and rendering
- `src/simulation/SimulationLoop.js` - Game loop and update cycle
- `src/managers/SatelliteManager.js` - Satellite lifecycle management
- `src/utils/Constants.js` - Physical constants and conversions

### Testing Approach

Tests use Vitest and are located in `/tests/`. Run individual tests with:
```bash
npm run test -- tests/SpecificTest.test.js
```

### Deployment

The project uses Vercel for deployment with a static build approach. See `VERCEL_DEPLOYMENT.md` for detailed instructions.

### External Dependencies

- Backend API for AI features (optional)
- Supabase for authentication and data persistence
- Socket.io for real-time collaboration features

## Development Notes

- Always maintain unit consistency (km for distances, km/s for velocities)
- Physics calculations should account for the hierarchical barycenter system
- UI updates should be throttled to maintain 60 FPS
- Use Web Workers for computationally intensive operations
- Ground track calculations use separate worker threads

### Coordinate System Details

- Three.js uses Y-up by default, but this project uses Z-up configuration
- All celestial positions are relative to Solar System Barycenter
- Frame transformations handled in `src/utils/FrameTransforms.js`

### Performance Considerations

- Satellite orbit paths are pre-calculated in workers
- Display settings can be toggled via `DisplaySettingsManager`
- Large satellite counts (>100) may require reduced visual fidelity

### Data Sources

- Planetary ephemeris from astronomy-engine library
- Body physical properties in `src/physics/bodies/`
- Ground stations and spaceports in `src/config/`