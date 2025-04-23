# REENTER v2 - Space Simulation Visualizer in Three.js

![Screenshot](public/assets/texture/reenter_v2.png)
![Screenshot](public/assets/texture/reenter_v2_1.png)

This project utilizes WebGL via the Three.js library and the physics engine Cannon.js to create a realistic space simulation environment. This setup includes interactive controls and dynamic visualizations of celestial objects like the Earth-Moon system and the Sun. The simulation is designed to display complex orbital mechanics in a user-friendly 3D interface.

There are no good space simulation environments with high quality visualization that run with modern software. Reenter means to change that by building an opensource simulation tool that can grow with its own community. Try it out and improve on it.

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

This application is deployed using:

- Frontend: [Vercel](https://vercel.com) (using static deployment approach)
- Backend Server: [Railway](https://railway.app)

For detailed instructions on deploying to Vercel, please see [VERCEL_DEPLOYMENT.md](VERCEL_DEPLOYMENT.md).

The server code is maintained in a separate repository.

## Installation

Ensure you have [Node.js](https://nodejs.org/) installed on your machine. Then, follow these steps:

1. Clone the repository:

   ```bash
   git clone https://github.com/yourusername/reenter_v2.git
   cd reenter_v2
   ```

2. Install the required dependencies:

   ```bash
   pnpm install
   ```

3. Set up environment variables:

   ```bash
   cp .env.example .env
   ```

   Edit the `.env` file to configure the socket server URL:

   - For local development, point to your locally running server: `VITE_SOCKET_SERVER_URL=http://localhost:4000` or `http://localhost:1234` (these are the allowed dev origins)
   - For production, point to a Railway server

4. Start the development server:

   ```bash
   pnpm run dev
   ```

This will run the application on `http://localhost:1234`.

## Usage

1. **Navigating the Scene**: Use the mouse or touch gestures for orbiting, zooming, and panning around objects.
2. **Interacting with GUI**: Adjust simulation parameters like time warp, display settings, and physics variables in real time.
3. **Viewing Data**: Monitor real-time charts for satellite metrics such as altitude, velocity, drag, and acceleration.
4. **Create and Manage Spacecraft**: Launch satellites using latitude/longitude, orbital elements, or circular orbits; set up and adjust maneuver nodes to plan burns and preview trajectory changes.
5. **AI Assistant**: Engage the integrated chat-based orbital mechanics AI for guidance on planning maneuvers, understanding orbital dynamics, and optimizing trajectories.
6. **Satellite Networks & Ground Tracks**: Visualize line-of-sight connections, network topologies, and ground tracks with configurable update intervals.
7. **Save & Load**: Export and import simulation states using JSON to replicate or share scenarios.

## Related Repositories

- [Reentry Server](https://github.com/yourusername/reentry-server): Backend server for the AI assistant and orbital mechanics guidance.

## Contributing

Contributions to enhance or expand the simulation capabilities are welcome. Please follow the standard fork, branch, and pull request workflow.

## Licensing

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE) file for details.

## Acknowledgments

- Three.js and Cannon.js communities for continuous support and resources.
- Contributors and maintainers of the `stats.js`, `cannon-es-debugger`, and other utilized libraries.

## Contact

For support or queries, contact [hi@darkmatter.is](mailto:hi@darkmatter.is).
