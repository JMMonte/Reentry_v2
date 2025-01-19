interface MoonPosition {
    x: number;
    y: number;
    z: number;
}

export class Constants {
    // Simulation scale factors
    static readonly scale: number = 0.1; // Scale factor for the simulation
    static readonly massScale: number = 1e-3; // Scale factor for mass
    static readonly threeJsCannon: number = 1e3; // Each unit in Three.js is km, each unit in Cannon.js is meters

    // Unit conversion factors
    static readonly metersToKm: number = 1e-3; // Conversion factor from meters to kilometers
    static readonly kmToMeters: number = 1e3; // Conversion factor from kilometers to meters

    // Physical constants
    static readonly G: number = 6.67430e-11; // Updated gravitational constant in m^3 kg^-1 s^-2

    // Time constants
    static readonly milisecondsInDay: number = 86400000; // Milliseconds in a day
    static readonly secondsInDay: number = 86400; // Seconds in a day
    static readonly secondsInYear: number = 31556952; // Seconds in a year
    static readonly secondsInHour: number = 3600; // Seconds in an hour
    static readonly secondsInMinute: number = 60; // Seconds in a minute
    static readonly daysInYear: number = 365; // Days in a year
    static readonly siderialDay: number = 86164; // Siderial day in seconds
    static readonly siderialYear: number = 31558149; // Siderial year in seconds

    // Earth constants
    static readonly earthRadius: number = 6378137.0; // Earth equatorial radius in meters
    static readonly earthPolarRadius: number = 6356752.314245; // Earth polar radius in meters
    static readonly earthMass: number = 5.972e24; // Earth mass in kg
    static readonly earthInclination: number = 23.5; // Earth's axial tilt in degrees
    static readonly earthGravitationalParameter: number = Constants.G * Constants.earthMass; // Earth gravitational parameter in m^3/s^2

    // Satellite constants
    static readonly satelliteRadius: number = 2; // Satellite radius in meters

    // Solar system constants
    static readonly sunRadius: number = 695700000; // Sun radius in meters
    static readonly AU: number = 1.495978707e11; // Astronomical unit in meters

    // Moon constants
    static readonly moonRadius: number = 1737400; // Moon radius in meters
    static readonly moonMass: number = 7.342e22; // Moon mass in kg
    static readonly moonOrbitRadius: number = 384400000; // Moon orbit radius in meters
    static readonly moonOrbitSpeed: number = 2.6617e-6; // radians per second
    static readonly moonRotationSpeed: number = 0.0001; // radians per frame
    static readonly moonInitialPosition: MoonPosition = {
        x: 384400000, // in meters
        y: 0,
        z: 0
    };

    // Earth atmosphere constants
    static readonly atmosphereScaleHeight: number = 8500; // Atmosphere scale height in meters
    static readonly atmosphereSeaLevelDensity: number = 1.225; // Sea level air density in kg/m^3
    static readonly atmosphereRadius: number = Constants.earthRadius + 0.1; // Atmosphere radius in meters

    // Earth's spheres of influence
    static readonly earthSOI: number = 0.929e9; // Earth's sphere of influence in meters (roughly 929,000 km)
    static readonly earthHillSphere: number = 1.5e9; // Earth's Hill sphere in meters (roughly 1.5 million km)

    // Orbital elements for the Moon
    static readonly semiMajorAxis: number = 384400000; // Semi-major axis in km
    static readonly eccentricity: number = 0.0549; // Orbital eccentricity
    static readonly inclination: number = 5.145 * (Math.PI / 180); // Inclination in radians
    static readonly ascendingNode: number = -11.26064 * (Math.PI / 180); // Longitude of ascending node in radians
    static readonly argumentOfPeriapsis: number = 318.15 * (Math.PI / 180); // Argument of periapsis in radians
} 