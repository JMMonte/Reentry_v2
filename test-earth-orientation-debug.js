#!/usr/bin/env node

/**
 * Debug Earth orientation calculation to find the source of flips
 */

import * as Astronomy from 'astronomy-engine';

console.log('=== Debugging Earth Orientation Calculation ===\n');

// Test the subsolar point calculation over time
const startTime = new Date();
const results = [];

for (let seconds = 0; seconds <= 10; seconds += 0.1) {
    const testTime = new Date(startTime.getTime() + seconds * 1000);
    const astroTime = Astronomy.MakeTime(testTime);
    
    // Get subsolar point
    const sun = Astronomy.GeoVector(Astronomy.Body.Sun, astroTime, false);
    const observer = Astronomy.VectorObserver(sun, astroTime);
    const subsolarLongitude = observer.longitude;
    const antiSolarLongitude = -subsolarLongitude;
    
    // Calculate spin
    const normalizedSpin = ((360 - antiSolarLongitude) % 360 + 360) % 360;
    
    // Also get the raw axis info
    const axisInfo = Astronomy.RotationAxis(Astronomy.Body.Earth, astroTime);
    
    results.push({
        seconds,
        subsolarLongitude,
        antiSolarLongitude,
        normalizedSpin,
        rawSpin: axisInfo.spin
    });
}

// Analyze for discontinuities
console.log('Time(s) | Subsolar | AntiSolar | CalcSpin | RawSpin | ΔCalc | ΔRaw');
console.log('--------|----------|-----------|----------|---------|-------|-------');

for (let i = 0; i < results.length; i++) {
    const r = results[i];
    let deltaCalc = 0;
    let deltaRaw = 0;
    
    if (i > 0) {
        deltaCalc = r.normalizedSpin - results[i-1].normalizedSpin;
        deltaRaw = r.rawSpin - results[i-1].rawSpin;
        
        // Handle wrap-around
        if (deltaCalc > 180) deltaCalc -= 360;
        if (deltaCalc < -180) deltaCalc += 360;
    }
    
    // Flag large jumps
    const flag = Math.abs(deltaCalc) > 1 ? ' ⚠️' : '';
    
    console.log(
        `${r.seconds.toFixed(1).padStart(7)} | ${r.subsolarLongitude.toFixed(2).padStart(8)}° | ${r.antiSolarLongitude.toFixed(2).padStart(9)}° | ${r.normalizedSpin.toFixed(2).padStart(8)}° | ${r.rawSpin.toFixed(2).padStart(7)}° | ${deltaCalc.toFixed(2).padStart(5)}° | ${deltaRaw.toFixed(3).padStart(6)}°${flag}`
    );
}

console.log('\n=== Analysis ===');
console.log('The subsolar calculation should change smoothly.');
console.log('Raw spin from Astronomy Engine should also change smoothly.');
console.log('Any large jumps indicate a calculation error.\n');

// Test specific problem: quaternion calculation
console.log('=== Testing Quaternion Calculation ===\n');

function calculateQuaternionFromPole(poleVector, spinRad) {
    // Three.js Z-up convention
    const zAxis = new THREE.Vector3(0, 0, 1);
    
    // Calculate rotation from Z-axis to pole
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(zAxis, poleVector.clone().normalize());
    
    // Apply spin rotation around the pole axis
    const spinQuat = new THREE.Quaternion();
    spinQuat.setFromAxisAngle(poleVector.clone().normalize(), spinRad);
    
    // Combine rotations
    quaternion.premultiply(spinQuat);
    
    return quaternion;
}

// Test quaternion continuity with small changes
const testSpins = [0, 1, 2, 3, 4, 5, 10, 20, 30, 45, 90, 180, 270, 359, 360];
const poleVector = new THREE.Vector3(0, 0, 1); // Simple test with north pole

console.log('Spin | Quaternion (x,y,z,w) | Dot with prev');
console.log('-----|----------------------|---------------');

let prevQuat = null;
for (const spin of testSpins) {
    const spinRad = spin * Math.PI / 180;
    const quat = calculateQuaternionFromPole(poleVector, spinRad);
    
    let dot = 1;
    if (prevQuat) {
        dot = prevQuat.dot(quat);
    }
    
    console.log(
        `${spin.toString().padStart(4)}° | (${quat.x.toFixed(3)}, ${quat.y.toFixed(3)}, ${quat.z.toFixed(3)}, ${quat.w.toFixed(3)}) | ${dot.toFixed(6)}`
    );
    
    prevQuat = quat.clone();
}

// Import THREE for quaternion test
import * as THREE from 'three';