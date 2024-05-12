export class UnitConverter {
    static scale = 0.1; // Example scale factor, adjust based on your application needs

    // Converts kilometers to meters for Cannon.js (no additional scaling)
    static toCannon(value) {
        return value * 1000; // Convert km to meters
    }

    // Converts meters back to kilometers for Three.js display (no scaling)
    static fromCannon(value) {
        return value / 1000;
    }

    // Scale values for Three.js visualization if necessary
    static toThreeJs(value) {
        return value * this.scale; // Apply simulation scaling factor
    }

    // Reverse the Three.js scaling when needed for calculations or inputs
    static fromThreeJs(value) {
        return value / this.scale;
    }
}