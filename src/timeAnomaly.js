import * as THREE from 'three';

// Function to calculate the expected angle from Earth to Sun
function calculateExpectedSunAngle(date, sun) {
    const dayOfYear = sun.getDayOfYear(date);
    const meanLongitude = 280.460 + 0.9856474 * dayOfYear;
    const meanAnomaly = 357.528 + 0.9856003 * dayOfYear;
    const eclipticLongitude = meanLongitude + 1.915 * Math.sin(meanAnomaly * Math.PI / 180) +
                              0.020 * Math.sin(2 * meanAnomaly * Math.PI / 180);
    const angle = (eclipticLongitude % 360) * Math.PI / 180; // Convert to radians and ensure within 0-2pi
    return angle; // Return the angle in radians
}

// Function to calculate the actual angle in the simulation
function calculateActualSunAngle(earth, sun) {
    earth.earthMesh.updateMatrixWorld(true);
    const earthWorldPosition = new THREE.Vector3();
    earth.earthMesh.getWorldPosition(earthWorldPosition);
    const sunPosition = sun.sun.position.clone();
    const sunDirection = new THREE.Vector3().subVectors(sunPosition, earthWorldPosition).normalize();
    // Assuming the north direction is along the z-axis
    const northPole = new THREE.Vector3(0, 0, 1);
    const eastPole = new THREE.Vector3(1, 0, 0);  // Correct direction for calculating angle from north
    const projectedSunDirection = new THREE.Vector3(sunDirection.x, 0, sunDirection.z).normalize(); // Project on the XZ plane
    return Math.atan2(projectedSunDirection.dot(eastPole), projectedSunDirection.dot(northPole));
}

// Function to compute the time anomaly
export function computeTimeAnomaly(settings, sun, earth) {
    const simulatedDate = new Date(settings.simulatedTime);
    const expectedAngle = calculateExpectedSunAngle(simulatedDate, sun);
    const actualAngle = calculateActualSunAngle(earth, sun);
    const angleDifference = Math.abs(expectedAngle - actualAngle); // Absolute difference in radians
    const timeAnomaly = angleDifference / earth.rotationSpeed; // Calculate time anomaly in seconds

    // console.log(`Simulated Date: ${simulatedDate}`);
    // console.log(`Expected Angle: ${expectedAngle} radians`);
    // console.log(`Actual Angle: ${actualAngle} radians`);
    // console.log(`Angle Difference: ${angleDifference} radians`);
    // console.log(`Time Anomaly: ${timeAnomaly} seconds`);

    return timeAnomaly;
}