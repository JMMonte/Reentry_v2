export class Constants {
    static scale = 0.1; // Scale factor for the simulation
    static earthRadius = 6371 * Constants.scale; // Earth radius in km scaled down
    static earthMass = 5.972e24 * Constants.scale ** 3; // Scaled Earth mass in kg
    static G = 6.67430e-11 * 1e-9 * (1 / Constants.scale) ** 3; // Adjusted gravitational constant in km^3 kg^-1 s^-2
    static sunRadius = 695700 * Constants.scale; // Sun radius in km scaled down
    static satelliteRadius = 100 * Constants.scale; // Satellite radius in km scaled down
    static earthDistance = 149.6e6 * Constants.scale; // Distance from Earth to Sun in km scaled down
}
