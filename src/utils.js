import * as THREE from 'three';

export function getDayOfYear(simulatedTime) {
    const start = new Date(simulatedTime.getFullYear(), 0, 0);
    const diff = simulatedTime - start;
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.floor(diff / oneDay);
}

export function getSunPosition(date) {
    const dayOfYear = getDayOfYear(date);
    const meanAnomaly = (357.5291 + 0.98560028 * dayOfYear) % 360;
    const meanLongitude = (280.4665 + 0.98564736 * dayOfYear) % 360;
    const eccentricity = 0.0167;

    const equationOfCenter = (1.9148 * Math.sin(meanAnomaly * Math.PI / 180) +
                              0.0200 * Math.sin(2 * meanAnomaly * Math.PI / 180) +
                              0.0003 * Math.sin(3 * meanAnomaly * Math.PI / 180));

    const trueLongitude = (meanLongitude + equationOfCenter) % 360;

    const distance = 1.496e+7;  // 1 AU in 10 km
    const x = -distance * Math.cos(trueLongitude * Math.PI / 180);
    const z = distance * Math.sin(trueLongitude * Math.PI / 180);
    const y = distance * eccentricity * Math.sin(trueLongitude * Math.PI / 180);
    return new THREE.Vector3(x, y, z);
}

export function calculateEarthVelocity(dayOfYear) {
    return new THREE.Vector3(-Math.sin(2 * Math.PI * dayOfYear / 365.25), 0, Math.cos(2 * Math.PI * dayOfYear / 365.25));
}

export function getEarthTilt(dayOfYear) {
    // Earth's axial tilt is approximately 23.5 degrees
    return new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(23.5)));
}
