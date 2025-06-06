#!/usr/bin/env node

/**
 * Test Earth orientation calculation for discontinuities
 */

import * as Astronomy from 'astronomy-engine';

console.log('=== Testing Earth Orientation Continuity ===\n');

/**
 * Simulate the Earth orientation calculation from PhysicsEngine
 */
function calculateEarthOrientation(date) {
    const astroTime = Astronomy.MakeTime(date);
    
    // Get subsolar point
    const sun = Astronomy.GeoVector(Astronomy.Body.Sun, astroTime, false);
    const observer = Astronomy.VectorObserver(sun, astroTime);
    const subsolarLongitude = observer.longitude;
    const antiSolarLongitude = -subsolarLongitude;
    
    // Calculate spin
    const normalizedSpin = ((360 - antiSolarLongitude) % 360 + 360) % 360;
    
    return {
        time: date,
        subsolarLongitude,
        antiSolarLongitude,
        normalizedSpin
    };
}

// Test for discontinuities over time
console.log('Testing for discontinuities (1-minute intervals for 1 hour):\n');

const startTime = new Date();
const results = [];

for (let minutes = 0; minutes <= 60; minutes += 1) {
    const testTime = new Date(startTime.getTime() + minutes * 60000);
    const result = calculateEarthOrientation(testTime);
    results.push(result);
}

// Check for jumps
console.log('Time     | Subsolar | AntiSolar | Spin   | ΔSpin');
console.log('---------|----------|-----------|--------|-------');

for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const prevSpin = i > 0 ? results[i-1].normalizedSpin : r.normalizedSpin;
    let deltaSpin = r.normalizedSpin - prevSpin;
    
    // Handle wrap-around
    if (deltaSpin > 180) deltaSpin -= 360;
    if (deltaSpin < -180) deltaSpin += 360;
    
    const timeStr = r.time.toTimeString().substring(0, 5);
    
    // Flag large jumps
    const flag = Math.abs(deltaSpin) > 10 ? ' ⚠️' : '';
    
    console.log(
        `${timeStr} | ${r.subsolarLongitude.toFixed(1).padStart(8)}° | ${r.antiSolarLongitude.toFixed(1).padStart(9)}° | ${r.normalizedSpin.toFixed(1).padStart(6)}° | ${deltaSpin.toFixed(1).padStart(6)}°${flag}`
    );
}

// Test specific problem areas
console.log('\n\nTesting problem areas:\n');

// Test around longitude 0/360 boundary
console.log('Around 0°/360° boundary:');
const testLongitudes = [-5, -2, -1, -0.5, 0, 0.5, 1, 2, 5];

for (const longitude of testLongitudes) {
    const antiSolar = longitude;
    const spin = ((360 - antiSolar) % 360 + 360) % 360;
    console.log(`AntiSolar: ${antiSolar.toFixed(1).padStart(6)}° → Spin: ${spin.toFixed(1)}°`);
}

// Test around 180/-180 boundary
console.log('\nAround ±180° boundary:');
const testLongitudes2 = [175, 178, 179, 179.5, 180, -179.5, -179, -178, -175];

for (const longitude of testLongitudes2) {
    const antiSolar = longitude;
    const spin = ((360 - antiSolar) % 360 + 360) % 360;
    console.log(`AntiSolar: ${antiSolar.toFixed(1).padStart(6)}° → Spin: ${spin.toFixed(1)}°`);
}

// Analyze the calculation
console.log('\n\n=== Analysis ===');
console.log('The calculation: spin = ((360 - antiSolarLongitude) % 360 + 360) % 360');
console.log('Should produce continuous results, but may have issues at boundaries.');
console.log('\nPotential issues:');
console.log('1. Subsolar longitude calculation might have discontinuities');
console.log('2. The modulo operation might cause jumps');
console.log('3. Astronomy.VectorObserver might return discontinuous longitude values');