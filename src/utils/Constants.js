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
    static daysInYear = 365.25; // Days in a year
    static siderialDay = 86164; // Siderial day in seconds
    static siderialYear = 31558149; // Siderial year in seconds
    // Earth constants
    // Satellite constants
    // Solar system constants
    static sunRadius = 695700000; // Sun radius in meters
    static AU = 1.495978707e11; // Astronomical unit in meters
    // Sun constants
    static sunMass = 1.9885e30; // Sun mass in kg
    static sunGravitationalParameter = Constants.G * Constants.sunMass; // km^3/s^2
    // Earth atmosphere constants
    static AU_KM = Constants.AU * Constants.metersToKm; // Astronomical unit in kilometers
}
