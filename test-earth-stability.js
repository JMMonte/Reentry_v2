#!/usr/bin/env node

/**
 * Test Earth orientation stability with the simplified calculation
 */

import * as Astronomy from 'astronomy-engine';

console.log('=== Testing Earth Orientation Stability ===\n');

// Test the raw axis info over time
const startTime = new Date();
const results = [];

for (let seconds = 0; seconds <= 10; seconds += 0.1) {
    const testTime = new Date(startTime.getTime() + seconds * 1000);
    const astroTime = Astronomy.MakeTime(testTime);
    
    // Get the raw axis info
    const axisInfo = Astronomy.RotationAxis(Astronomy.Body.Earth, astroTime);
    
    // Apply our normalization
    let normalizedSpin = ((axisInfo.spin % 360) + 360) % 360;
    // Apply the -90 degree offset for texture alignment
    let adjustedSpin = ((normalizedSpin - 90) % 360 + 360) % 360;
    
    results.push({
        seconds,
        rawSpin: axisInfo.spin,
        normalizedSpin,
        adjustedSpin,
        ra: axisInfo.ra,
        dec: axisInfo.dec
    });
}

// Analyze for discontinuities
console.log('Time(s) | RawSpin | Normalized | Adjusted | ΔRaw  | ΔAdj');
console.log('--------|---------|------------|----------|-------|------');

for (let i = 0; i < results.length; i++) {
    const r = results[i];
    let deltaRaw = 0;
    let deltaAdj = 0;
    
    if (i > 0) {
        deltaRaw = r.rawSpin - results[i-1].rawSpin;
        deltaAdj = r.adjustedSpin - results[i-1].adjustedSpin;
        
        // Handle wrap-around
        if (deltaAdj > 180) deltaAdj -= 360;
        if (deltaAdj < -180) deltaAdj += 360;
    }
    
    // Flag large jumps
    const flag = Math.abs(deltaAdj) > 0.1 ? ' ⚠️' : '';
    
    console.log(
        `${r.seconds.toFixed(1).padStart(7)} | ${r.rawSpin.toFixed(2).padStart(7)}° | ${r.normalizedSpin.toFixed(2).padStart(10)}° | ${r.adjustedSpin.toFixed(2).padStart(8)}° | ${deltaRaw.toFixed(3).padStart(5)}° | ${deltaAdj.toFixed(3).padStart(5)}°${flag}`
    );
}

console.log('\n=== Analysis ===');
console.log('Raw spin should increase monotonically (Earth rotates continuously).');
console.log('Adjusted spin should change smoothly without jumps.');
console.log('Delta values should be consistent and small.\n');

// Calculate expected rotation rate
const avgDeltaRaw = (results[results.length-1].rawSpin - results[0].rawSpin) / 10;
console.log(`Average rotation rate: ${avgDeltaRaw.toFixed(4)}°/second`);
console.log(`Expected: ~0.0042°/second (360° in 24 hours)`);
console.log(`Ratio: ${(avgDeltaRaw / 0.0042).toFixed(2)}x`);