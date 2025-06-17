# Darksun - Advanced Space Simulation in Three.js

<p align="center">
  <a href="https://github.com/joaomontenegro/darksun"><img src="https://img.shields.io/github/stars/joaomontenegro/darksun.svg?style=flat-square" alt="GitHub Stars" /></a>
  <a href="https://github.com/joaomontenegro/darksun/actions"><img src="https://img.shields.io/github/actions/workflow/status/joaomontenegro/darksun/ci.yml?style=flat-square" alt="CI Status" /></a>
  <img src="https://img.shields.io/badge/open_source-100%25-brightgreen.svg?style=flat-square" alt="Open Source" />
  <a href="https://github.com/joaomontenegro/darksun/blob/main/LICENSE"><img src="https://img.shields.io/github/license/joaomontenegro/darksun.svg?style=flat-square" alt="License" /></a>
</p>

<p align="center">
  <img src="public/assets/images/Screenshot%202025-04-25%20at%2002.12.56.png" alt="Maneuver Planning" width="100%" />
</p>
<p align="center">
  <img src="public/assets/images/Screenshot%202025-04-22%20at%2022.44.48.png" alt="Simulation View" width="45%" />
  <img src="public/assets/images/Screenshot%202025-04-22%20at%2001.34.42.png" alt="Orbital Mechanics" width="45%" />
</p>

<p align="center">
  <img src="public/assets/images/Screenshot%202025-04-22%20at%2001.38.40.png" alt="Ground Track" width="45%" />
  <img src="public/assets/images/Screenshot%202025-04-25%20at%2002.16.34.png" alt="Realtime Charts" width="45%" />
  <img src="public/assets/images/Screenshot%202025-04-25%20at%2002.20.23.png" alt="Network Visualization" width="45%" />
  <img src="public/assets/images/Screenshot%202025-04-25%20at%2002.20.37.png" alt="Detailed Elements" width="45%" />
  <img src="public/assets/images/Screenshot%202025-04-25%20at%2002.22.55.png" alt="Moon View" width="100%" />
</p>

This project utilizes WebGL via the Three.js library and a **custom self-sufficient physics engine** (**specially built for simulating spacecraft dynamics on the web**) to create a realistic space simulation environment. This setup includes interactive controls and dynamic visualizations of celestial objects like the Earth-Moon system and the Sun. The simulation is designed to display complex orbital mechanics in a user-friendly 3D interface.

## Physics Architecture

The physics system is organized as a **self-sufficient embedded backend** with domain-specific APIs:

### 🏗️ Modular Physics Engine (`src/physics/`)
- **Domain-Organized API**: `Orbital`, `Bodies`, `Atmosphere`, `Coordinates`, `Utils`
- **Zero Initialization**: Ready to use immediately, no setup required
- **Web Workers**: Orbit propagation and heavy calculations run in dedicated workers
- **Performance Optimized**: Centralized calculations with smart caching

The physics simulation uses:

- Adaptive Integration: Solves the equations of motion using an adaptive time-step integrator:

\[
\frac{d^2 \mathbf{r}}{dt^2} = -\frac{\mu}{r^3}\mathbf{r} + \mathbf{a}_\mathrm{perturbations} + \mathbf{a}_\mathrm{drag}
\]

- Third-Body Perturbations: Includes gravitational effects from the Moon and Sun, scaled by \(\alpha\):

\[
\mathbf{a}_\mathrm{perturbations} = \alpha \left( \mathbf{a}_\mathrm{Moon} + \mathbf{a}\_\mathrm{Sun} \right)
\]

- Atmospheric Drag: Models drag acceleration:

\[
\mathbf{a}_\mathrm{drag} = -\tfrac{1}{2} \rho(h)\,C_d\,\frac{A}{m}\,\|\mathbf{v}_\mathrm{rel}\|\;\mathbf{v}\_\mathrm{rel}
\]

```mermaid
graph TD
  A[Main Thread: Three.js Rendering] --> B[Physics API: Domain-Organized Interface]
  B --> C[Orbital Domain: Hohmann Transfers, Elements]
  B --> D[Bodies Domain: Planetary Data, GM]
  B --> E[Atmosphere Domain: Drag, Density]
  B --> F[Utils Domain: Coordinates, Vectors]
  
  B --> G[Web Workers: SatelliteWorker.js (unified)]
  G --> H[Adaptive Integrator: RK4]
  G --> I[Drag & Perturbations Computation]
  G --> J[PostMessage: Orbit Updates]
  J --> A[Three.js Visualization]
  
  B --> K[PhysicsEngine: Core Simulation]
  K --> L[StateVectorCalculator]
  K --> M[PositionManager]
  K --> N[SolarSystemHierarchy]
```

This decouples rendering and physics, ensuring smooth performance at 60 FPS.

There are no good space simulation environments with high quality visualization that run with modern software. Darksun means to change that by building an open-source simulation tool that can grow with its own community. Try it out and improve on it.

All visuals implemented from scratch. Physics running in cannon-es latest version through a service worker. Some mathematical models are running in javascript for now, would be great to change to higher precision ones later (C#?).

## Features

- Realistic 3D rendering of the Earth-Moon system and the Sun with orbit controls.
- Real-time physics simulation for spacecraft and satellite dynamics.
- Interactive maneuver node planning and execution, allowing you to set burn points and preview trajectory changes.
- AI-powered orbital mechanics assistant with chat-based guidance for planning maneuvers and understanding orbital parameters.
- Advanced satellite creation options: import orbital elements, set latitude/longitude positions (circular or custom orbits).
- Dynamic data visualization: real-time charts of altitude, velocity, drag, acceleration, and other metrics.
- Configurable time warp for speeding up or slowing down the simulation by multiple orders of magnitude.
- Satellite network visualization: live line-of-sight connections and network topology between satellites.
- Ground track mapping with adjustable update intervals to visualize satellite footprints.
- Customizable display settings: toggle axis, grid, vectors, ground tracks, and connections.
- Save and load simulation states via JSON import/export to replicate or share scenarios.
- React-friendly event API for integrating custom UI components.
- High-performance browser rendering, tested on desktops and mobile devices at 60fps.

## To-do

- Timeline based interface for complex missions.
- JSON interface for missions
- API
- Simulation data streaming
- Whole solar system

## Deployment

This application can be deployed using:

- Frontend: [Vercel](https://vercel.com) (using static deployment approach)

> To enable AI assistant features, you must implement and host your own backend server providing AI services and conversation management (e.g., via OpenAI or other LLM APIs).

For detailed instructions on deploying to Vercel, please see [VERCEL_DEPLOYMENT.md](VERCEL_DEPLOYMENT.md).

## Installation

Ensure you have [Node.js](https://nodejs.org/) installed on your machine. Then, follow these steps:

1. Clone the repository:

   ```bash
   git clone https://github.com/yourusername/darksun.git
   cd darksun
   ```

2. Install the required dependencies:

   ```bash
   pnpm install
   ```

3. Set up environment variables:

   ```bash
   cp .env.example .env
   ```
