# Earth and Sun Simulation

![Screenshot](src/texture/Screenshot%202024-05-03%20at%2001.51.53.png)

This project is an accurate simulation of the Earth, Sun, and an orbiting satellite using Three.js for rendering and Cannon-es.js for physics. The simulation features realistic ephemerides and orientations, dynamic controls via dat.gui, and sophisticated physics interactions.

## Features

- **Three.js Rendering**: Utilizes Three.js for WebGL rendering, ensuring high-quality, real-time visualization of the Earth, Sun, and satellites.
- **Cannon-es Physics**: Implements physics with Cannon-es to simulate orbital dynamics and gravitational interactions.
- **Real-Time Ephemerides**: Calculates positions and orientations based on real astronomical data to ensure the Sun and Earth are accurately positioned.
- **Dynamic Time Warping**: Allows manipulation of time progression to observe different scenarios and effects at various speeds.
- **GUI Controls**: Offers interactive controls for adjusting simulation parameters such as time warp, simulated time, and visual elements like grid display.

## Setup and Build

### Prerequisites

Ensure you have Node.js installed on your system to manage the dependencies and run the server. You can download it from [nodejs.org](https://nodejs.org/).

### Installation

Clone the repository and install the necessary dependencies:

```bash
git clone [repository-url]
cd [repository-directory]
npm install
```

### Running the Simulation

To start the simulation, use the following command:

```bash
npm start
```

This command uses Parcel to bundle the application and serve it on `http://localhost:1234` by default. Open your web browser and navigate to this address to view the simulation.

### Building for Production

When you're ready to build the application for production, run:

```bash
npm run build
npm run postbuild
```

This ensures that all your static assets are included in the final distribution.

## Usage

- **OrbitControls**: Use the mouse to pan, zoom, and rotate the camera around the scene.
- **GUI**: Adjust the `Time Warp`, `Simulated Time`, and toggle the `Show Grid` option to control simulation parameters.
- **Resize Handling**: The simulation automatically adjusts to browser window resizing to maintain aspect ratio and visibility.

## Contributing

Contributions are welcome. Please feel free to fork the repository, make your changes, and submit a pull request.

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE) file for details.

## Acknowledgements

- **Three.js Community**: For the comprehensive 3D graphics library.
- **Cannon-es Contributors**: For the robust physics engine tailored for JavaScript.

Enjoy exploring the dynamic interactions of Earth, the Sun, and satellites through this simulation!
