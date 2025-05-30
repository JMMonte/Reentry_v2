import { describe, it, expect } from 'vitest';
import { PhysicsEngine } from '../src/physics/PhysicsEngine.js';

describe('Atmospheric Drag Debug', () => {
  it('should compute non-zero atmospheric drag for low Earth orbit satellite', () => {
    const physicsEngine = new PhysicsEngine();
    
    // Test parameters
    const satellite = {
      position: [6571, 0, 0], // 200 km altitude (Earth radius ~6371 km)
      velocity: [0, 7.8, 0],   // Orbital velocity in km/s
      mass: 1000,              // kg
      crossSectionalArea: 10,  // m²
      dragCoefficient: 2.2
    };
    
    // Earth's position (assuming at origin for simplicity)
    const earthPosition = [0, 0, 0];
    
    // Call the private method directly for testing
    const drag = physicsEngine._computeAtmosphericDrag(
      satellite,
      earthPosition
    );
    
    console.log('Test parameters:');
    console.log('Satellite position:', satellite.position);
    console.log('Satellite velocity:', satellite.velocity);
    console.log('Earth position:', earthPosition);
    console.log('Altitude from Earth center:', 6571, 'km');
    console.log('Altitude above surface:', 6571 - 6371, 'km');
    console.log('');
    console.log('Computed drag acceleration:', drag);
    console.log('Drag magnitude:', Math.sqrt(drag[0]**2 + drag[1]**2 + drag[2]**2));
    
    // The drag should oppose velocity, so Y component should be negative
    expect(drag[1]).toBeLessThan(0);
    expect(Math.abs(drag[1])).toBeGreaterThan(0);
  });
  
  it('should show intermediate calculations in atmospheric drag', () => {
    const physicsEngine = new PhysicsEngine();
    
    // Manually calculate what we expect
    const position = [6571, 0, 0];
    const velocity = [0, 7.8, 0];
    const earthPosition = [0, 0, 0];
    
    // Calculate relative position
    const relativePosition = [
      position[0] - earthPosition[0],
      position[1] - earthPosition[1],
      position[2] - earthPosition[2]
    ];
    console.log('Relative position:', relativePosition);
    
    // Calculate altitude
    const distance = Math.sqrt(
      relativePosition[0]**2 + 
      relativePosition[1]**2 + 
      relativePosition[2]**2
    );
    const altitude = (distance - 6371) * 1000; // Convert to meters
    console.log('Distance from Earth center:', distance, 'km');
    console.log('Altitude above surface:', altitude / 1000, 'km (', altitude, 'm)');
    
    // Calculate atmospheric density at 200 km
    // Using exponential atmosphere model: ρ = ρ₀ * exp(-h/H)
    const scaleHeight = 7500; // meters (typical for 200 km altitude)
    const baseDensity = 1.225; // kg/m³ at sea level
    const density = baseDensity * Math.exp(-altitude / scaleHeight);
    console.log('Expected density at 200 km:', density, 'kg/m³');
    console.log('(Should be around 2.5e-10 kg/m³)');
    
    // Calculate drag force
    const velocityMagnitude = Math.sqrt(velocity[0]**2 + velocity[1]**2 + velocity[2]**2) * 1000; // m/s
    const dragForceMagnitude = 0.5 * density * velocityMagnitude * velocityMagnitude * 10 * 2.2;
    console.log('Velocity magnitude:', velocityMagnitude, 'm/s');
    console.log('Drag force magnitude:', dragForceMagnitude, 'N');
    
    // Calculate drag acceleration
    const dragAccelMagnitude = dragForceMagnitude / 1000; // m/s²
    console.log('Drag acceleration magnitude:', dragAccelMagnitude, 'm/s²');
    console.log('Expected drag acceleration Y component:', -dragAccelMagnitude / 1000, 'km/s²');
  });
});