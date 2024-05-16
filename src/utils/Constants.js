export class Constants {
    static scale = 0.1; // Scale factor for the simulation
    static massScale = 1e-3; // Scale factor for mass
    static threeJsCannon = 1e3; // Each unit in Three.js is km, each unit in Cannon.js is meters
    static metersToKm = 1e-3; // Conversion factor from meters to kilometers
    static kmToMeters = 1e3; // Conversion factor from kilometers to meters
    static earthRadius = 6371000; // Earth radius in km scaled down
    static earthMass = 5.972e24; // Scaled Earth mass in kg
    static G = 6.6735e-11; // Gravitational constant in m^3 kg^-1 s^-2
    static sunRadius = 695700; // Sun radius in km scaled down
    static satelliteRadius = 2; // Satellite radius in m
    static AU = 149.6e6; // Distance from Earth to Sun in km scaled down
}
