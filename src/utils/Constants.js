export class Constants {
    static scale = 1; // Scale factor for the simulation (1 unit = 1 km)
    static massScale = 1e-3; // Scale factor for mass
    static threeJsCannon = 1e3; // Each unit in Three.js is km, each unit in Cannon.js is meters
    static metersToKm = 1e-3; // Conversion factor from meters to kilometers
    static kmToMeters = 1e3; // Conversion factor from kilometers to meters
    static G = 6.67430e-20; // Gravitational constant in km^3 kg^-1 s^-2 (for orbital mechanics)
    // Time constants
    static milisecondsInDay = 86400000; // Milliseconds in a day
    static secondsInDay = 86400; // Seconds in a day
    static secondsInYear = 31556952; // Seconds in a year
    static secondsInHour = 3600; // Seconds in an hour
    static secondsInMinute = 60; // Seconds in a minute
    static daysInYear = 365; // Days in a year
    static siderialDay = 86164; // Siderial day in seconds
    static siderialYear = 31558149; // Siderial year in seconds
    // Earth constants
    static earthRadius = 6378137.0; // Earth equatorial radius in meters
    static earthPolarRadius = 6356752.314245; // Earth polar radius in meters
    static earthMass = 5.972e24; // Earth mass in kg
    static earthInclination = 23.5; // Earth's axial tilt in degrees
    static earthGravitationalParameter = Constants.G * Constants.earthMass; // km^3/s^2
    // Satellite constants
    static satelliteRadius = 2; // Satellite radius in meters
    // Solar system constants
    static sunRadius = 695700000; // Sun radius in meters
    static AU = 1.495978707e11; // Astronomical unit in meters
    // Sun constants
    static sunMass = 1.9885e30; // Sun mass in kg
    static sunGravitationalParameter = Constants.G * Constants.sunMass; // km^3/s^2
    // Moon constants
    static moonRadius = 1737400; // Moon radius in meters
    static moonMass = 7.342e22; // Moon mass in kg
    static moonOrbitRadius = 384400000; // Moon orbit radius in meters
    static moonOrbitSpeed = 2.6617e-6; // radians per second
    static moonRotationSpeed = 0.0001; // radians per frame
    static moonInitialPosition = {
        x: 384400000, // in meters
        y: 0,
        z: 0
    };
    static moonGravitationalParameter = Constants.G * Constants.moonMass; // km^3/s^2
    // Earth atmosphere constants
    static atmosphereScaleHeight = 8500; // Atmosphere scale height in meters
    static atmosphereSeaLevelDensity = 1.225; // Sea level air density in kg/m^3
    static atmosphereRadius = Constants.earthRadius + 0.1; // Atmosphere radius in meters
    // Default drag parameters (user-tunable)
    static ballisticCoefficient = 100; // Default satellite ballistic coefficient (kg/m^2)
    static atmosphereCutoffAltitude = 120000; // Altitude in meters below which drag is applied

    // Earth's spheres of influence
    static earthSOI = 0.929e9; // Earth's sphere of influence in meters (roughly 929,000 km)
    static earthHillSphere = 1.5e9; // Earth's Hill sphere in meters (roughly 1.5 million km)


    // Orbital elements for the Moon
    static semiMajorAxis = 384400000; // Semi-major axis in meters
    static eccentricity = 0.0549; // Orbital eccentricity
    static inclination = 5.145 * (Math.PI / 180); // Inclination in radians
    static ascendingNode = -11.26064 * (Math.PI / 180); // Longitude of ascending node in radians
    static argumentOfPeriapsis = 318.15 * (Math.PI / 180); // Argument of periapsis in radians

}
