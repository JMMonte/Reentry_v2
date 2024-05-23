// utils/AstronomyUtils.js
import { Constants } from './Constants.js';

export function JulianDay(date) {
    const time = date.getTime() / 86400000.0 + 2440587.5;
    return time - 2451545.0; // Julian centuries since J2000.0
}

export function EclipticToCartesian(lambda, beta, delta) {
    const rad = Math.PI / 180;
    const x = delta * Math.cos(beta * rad) * Math.cos(lambda * rad);
    const y = delta * Math.cos(beta * rad) * Math.sin(lambda * rad);
    const z = delta * Math.sin(beta * rad);
    return { x, y, z };
}

export function RotateAroundX(x, y, z, angle) {
    const cosAngle = Math.cos(angle);
    const sinAngle = Math.sin(angle);
    const rotatedY = y * cosAngle - z * sinAngle;
    const rotatedZ = y * sinAngle + z * cosAngle;
    return { x, y: rotatedY, z: rotatedZ };
}

export function RotateAroundY(x, y, z, angle) {
    const cosAngle = Math.cos(angle);
    const sinAngle = Math.sin(angle);
    const rotatedX = x * cosAngle + z * sinAngle;
    const rotatedZ = -x * sinAngle + z * cosAngle;
    return { x: rotatedX, y, z: rotatedZ };
}

export function RotateAroundZ(x, y, z, angle) {
    const cosAngle = Math.cos(angle);
    const sinAngle = Math.sin(angle);
    const rotatedX = x * cosAngle - y * sinAngle;
    const rotatedY = x * sinAngle + y * cosAngle;
    return { x: rotatedX, y: rotatedY, z };
}
