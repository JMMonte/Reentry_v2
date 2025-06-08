# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Darksun is a web-based 3D space simulation application for orbital mechanics, interplanetary travel, and reentry vehicles. It uses React 18 with Vite, Three.js for 3D rendering, and a custom physics engine running in Web Workers.

## Common Development Commands

```bash
# Start development server (port 4000)
pnpm dev

# Build for production
pnpm build

# Run tests (using Vitest)
pnpm test

# Run specific test file
pnpm test -- tests/SpecificTest.test.js

# Lint code
pnpm lint

# Fix linting issues
pnpm lint:fix

# Preview production build
pnpm preview

# Clean build artifacts
pnpm clean

# Generate favicons
pnpm generate:favicons

# Analyze bundle size
pnpm analyze

# Codebase audit scripts
pnpm audit              # General codebase audit
pnpm audit:memory       # Memory usage analysis
pnpm audit:architecture # Architecture analysis
pnpm audit:orphaned     # Find orphaned code
pnpm audit:deps         # Dependency graph analysis
pnpm audit:complexity   # Code complexity analysis
pnpm audit:ai           # AI-powered audit with full analysis
pnpm audit:ai:md        # AI audit with markdown output
pnpm audit:ai:fast      # Fast AI audit (no source/examples)

# Single file audit (analyze specific file dependencies and data flow)
pnpm audit:file <filepath>  # Comprehensive single file analysis with architecture compliance
```

## Architecture Overview

### Core Systems

1. **Physics Engine** (`src/physics/`)

   - `PhysicsEngine.js` - Main physics simulation using RK4 integration with hierarchical barycenter system
   - `PhysicsAPI.js` - Unified domain-organized interface (Orbital, Bodies, Atmosphere, Coordinates, Utils)
   - Runs computationally intensive operations in Web Workers for performance
   - Handles N-body gravitation, atmospheric drag, and solar radiation pressure
   - `SatelliteEngine.js` - Dedicated satellite physics management

2. **3D Rendering** (`src/App3D.js`, `src/components/`)

   - Three.js-based scene management with Z-up coordinate system (not Y-up default)
   - Custom GLSL shaders for atmospheres and SOI visualization
   - Optimized rendering with LOD and frustum culling
   - NaN boundingSphere protection for geometry stability

3. **State Management & Simulation Loop**

   - `SimulationLoop.js` - Main animation and update loop coordination
   - `PhysicsStateContext` - Centralized physics state
   - `SimulationContext` - Simulation controls and timing
   - WebSocket integration for real-time collaboration features

4. **Manager Architecture** (`src/managers/`)

   - `SatelliteManager.js` - UI satellite lifecycle, delegates physics to PhysicsEngine
   - `SceneManager.js` - Three.js scene object management
   - `WorkerPoolManager.js` - Web Worker coordination for heavy computations
   - `OrbitCacheManager.js` - Orbit path caching and optimization

5. **UI Components** (`src/components/ui/`)
   - Tailwind CSS with Radix UI primitives
   - Modular component structure with proper separation of concerns
   - Theme-aware with dark mode support

### Key Architectural Patterns

- **Position Units**: All positions internally use kilometers (km) from Solar System Barycenter
- **Velocity Units**: km/s for consistency with position units
- **Time**: Julian Date (JD) for astronomical calculations
- **Coordinate System**: J2000 ecliptic reference frame
- **State Vectors**: [x, y, z, vx, vy, vz] format throughout

### Physics Integration Architecture

The project uses a **dual-layer approach** for satellite management:

1. **Physics Layer** - `PhysicsEngine.satellites` stores the authoritative state
2. **UI Layer** - `SatelliteManager._satellites` handles Three.js visualization

**Key Integration Points:**

- Physics engine uses `stepPhysicsExternal()` for coordinated simulation steps
- UI satellites update visuals via `updateVisualsFromState()` from physics state
- Manager classes delegate core operations to `PhysicsEngine` then create UI representations
- Web Workers handle orbit propagation and heavy calculations independently

### Important Files

- `src/physics/PhysicsEngine.js` - Core physics simulation and satellite state management
- `src/physics/PhysicsAPI.js` - Main interface for physics calculations (domain-organized)
- `src/physics/core/PhysicsConstants.js` - Physics constants (NOT `src/utils/Constants.js`)
- `src/App3D.js` - Main 3D scene setup with Z-up coordinate system
- `src/simulation/SimulationLoop.js` - Animation loop and update coordination
- `src/managers/SatelliteManager.js` - UI satellite lifecycle (delegates to PhysicsEngine)
- `src/physics/utils/CoordinateTransforms.js` - Multi-planet coordinate transformations

### Testing Framework

Tests use Vitest and are located in `/tests/`. **All new tests MUST be added to the `/tests/` directory.** The codebase includes comprehensive test coverage for physics calculations, orbit propagation, and satellite communications.

### Deployment

The project uses Vercel for deployment with a static build approach. See `VERCEL_DEPLOYMENT.md` for detailed instructions.

### External Dependencies

- Backend API for AI features (optional)
- Supabase for authentication and data persistence
- Socket.io for real-time collaboration features

## Development Guidelines

### Separation of Concerns

**CRITICAL ARCHITECTURE RULE**: Physics, Three.js, and React must be perfectly separated:

1. **Physics Directory (`src/physics/`)** - MUST be self-reliant with zero dependencies on Three.js or React

   - Pure physics calculations and state management only
   - Can only import astronomy-engine and other physics libraries
   - No Three.js Vector3, no React components, no UI concerns

2. **Three.js Layer** - Handles 3D rendering and visualization only

   - Consumes physics state but never modifies it
   - All Three.js objects, materials, geometries live here

3. **React Layer** - UI components and user interactions only
   - Dispatches commands to physics layer
   - Displays data from physics and Three.js layers

### Physics Integration Patterns

- **Always delegate to PhysicsEngine first** - UI managers should create physics objects, then UI representations
- Use `PhysicsAPI.js` for pure calculations (domain-organized: Orbital, Bodies, Atmosphere, etc.)
- Physics directory must remain framework-agnostic and reusable
- UI updates should be throttled to maintain 60 FPS
- Use Web Workers for computationally intensive operations (orbit propagation, ground tracks)

### Coordinate System Requirements

- **Z-up coordinate system** - Three.js uses Y-up by default, but this project uses Z-up globally
- All celestial positions are relative to Solar System Barycenter
- All internal units: kilometers (km) for distances, km/s for velocities
- Frame transformations handled in `src/physics/utils/CoordinateTransforms.js` (NOT `src/utils/FrameTransforms.js`)
- Physics calculations must account for hierarchical barycenter system

### Satellite Management

- Physics Layer (`PhysicsEngine.satellites`) is authoritative for satellite state
- UI Layer (`SatelliteManager._satellites`) handles Three.js visualization only
- Always create physics satellite first, then UI satellite via `createUISatellite()`
- Update UI satellites from physics state using `updateVisualsFromState()`

### Single File Analysis Tool

The `pnpm audit:file <filepath>` command provides comprehensive analysis of individual files:

- **Architecture Compliance** - Detects violations like Three.js imports in physics files
- **Dependency Classification** - Categorizes imports as internal/external, physics/three.js/react
- **Data Flow Patterns** - Identifies state management, caching, validation, async patterns
- **ESLint Integration** - Shows specific linting issues with line numbers
- **Related File Mapping** - Discovers both imports and files that import the target
- **Actionable Recommendations** - Provides specific suggestions for improvement

**Usage Examples:**
```bash
pnpm audit:file src/physics/PhysicsEngine.js     # Check physics layer compliance
pnpm audit:file src/managers/SatelliteManager.js # Analyze manager coordination
pnpm audit:file src/components/ui/button.jsx     # Verify UI component structure
```

### Key Dependencies & Data Sources

- **astronomy-engine** - Planetary ephemeris and coordinate transformations
- **Three.js** - 3D rendering with custom Z-up configuration
- **Vitest** - Testing framework (NOT Jest)
- **Vite** - Build tool with GLSL shader support
- **Web Workers** - `orbitPropagationWorker.js`, `groundtrackWorker.js`, `lineOfSightWorker.js`
- **Body physical properties** in `src/physics/data/planets/` and `src/physics/data/moons/`
- **Ground stations and config data** in `src/config/`

### File Organization Rules

- **All tests** MUST be placed in `/tests/` directory (never co-located with source files)
- **All documentation** MUST be placed in `/docs/` directory
- **Physics code** MUST remain in `src/physics/` and be completely self-reliant
- **Manager classes** (`src/managers/`) handle coordination between layers
- **UI components** live in `src/components/` with proper React patterns

### Build Configuration

- Vite configuration includes GLSL shader support via `vite-plugin-glsl`
- ESLint configuration uses flat config format (not legacy)
- Development server runs on port 4000 (not default 3000)
- Build output configured for Vercel static deployment
