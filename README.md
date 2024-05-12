# REENTER v2 - Space Simulation Visualizer in Three.js

![Screenshot](src/texture/Screenshot%202024-05-13%20at%2000.28.32.png)

This project utilizes WebGL via the Three.js library and the physics engine Cannon.js to create a realistic space simulation environment. This setup includes interactive controls and dynamic visualizations of celestial objects like the Earth and the Sun. The simulation is designed to display complex orbital mechanics in a user-friendly 3D interface.

## Features

- Realistic 3D rendering of the Earth and Sun with orbit controls.
- Physics simulation for zero-gravity environments.
- GUI for real-time interaction and visualization adjustments.
- Dynamic data visualization of satellite metrics such as altitude, velocity, and acceleration.
- Customizable time warp features to speed up or slow down the simulation.

## Installation

Ensure you have [Node.js](https://nodejs.org/) installed on your machine. Then, follow these steps:

1. Clone the repository:

   ```bash
   git clone https://your-repository-url
   cd your-repository-directory
   ```

2. Install the required dependencies:

   ```bash
   npm install
   ```

3. Start the development server:

   ```bash
   npm start
   ```

This will run the application on `http://localhost:3000`.

## Usage

1. **Navigating the Scene**: Use the mouse for orbiting around objects, zooming in and out.
2. **Interacting with GUI**: Adjust simulation parameters like time warp, object visibility, and physics variables through the GUI.
3. **Viewing Data**: Real-time data for satellites can be viewed and analyzed via the integrated chart system.

## Contributing

Contributions to enhance or expand the simulation capabilities are welcome. Please follow the standard fork, branch, and pull request workflow.

## Licensing

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE) file for details.

## Acknowledgments

- Three.js and Cannon.js communities for continuous support and resources.
- Contributors and maintainers of the `stats.js`, `cannon-es-debugger`, and other utilized libraries.

## Contact

For support or queries, contact [your-email@example.com](mailto:your-email@example.com).
