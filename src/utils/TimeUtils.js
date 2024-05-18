import * as THREE from 'three';
import { Constants } from './Constants.js';

export class TimeUtils {
    constructor(settings) {
        this.settings = settings;
        this.lastTime = 0;
        this.deltaTime = 0;
        this.simulatedTime = new Date(settings.simulatedTime); // Ensure this is in UTC
        this.dayOfYear = this.getDayOfYear(this.simulatedTime);
        this.fractionOfDay = this.getFractionOfDay();
        this.AU = Constants.AU * Constants.scale;
    }

    // Update the timestamp and handle the simulation time, correctly applying the time warp
    update(timestamp) {
        const now = timestamp * 0.001;  // Convert timestamp from milliseconds to seconds
        this.deltaTime = (now - this.lastTime) * this.settings.timeWarp;  // Apply time warp to deltaTime
        this.lastTime = now;

        const msToAdd = this.deltaTime * 1000;  // Convert deltaTime back to milliseconds for date manipulation
        this.simulatedTime = new Date(this.simulatedTime.getTime() + msToAdd);
        this.settings.simulatedTime = this.simulatedTime.toISOString();

        this.dayOfYear = this.getDayOfYear(this.simulatedTime);
        this.fractionOfDay = this.getFractionOfDay();
    }

    // Adjust the time warp factor
    setTimeWarp(warpFactor) {
        this.settings.timeWarp = warpFactor;
    }

    // Utility method to calculate the day of the year
    getDayOfYear(date) {
        if (!(date instanceof Date)) {
            date = new Date(date);  // Ensure date is a Date object
        }
        const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 0)); // Use UTC
        const diff = date - start;
        const oneDay = 1000 * 60 * 60 * 24;
        return Math.floor(diff / oneDay);
    }

    // Calculate the Sun's position based on Earth's orbit and day of year
    getSunPosition() {
        const meanAnomaly = (357.5291 + 0.98560028 * this.dayOfYear) % 360;
        const meanLongitude = (280.4665 + 0.98564736 * this.dayOfYear) % 360;
        const eccentricity = 0.0167;

        const equationOfCenter = (1.9148 * Math.sin(meanAnomaly * Math.PI / 180) +
                                  0.0200 * Math.sin(2 * meanAnomaly * Math.PI / 180) +
                                  0.0003 * Math.sin(3 * meanAnomaly * Math.PI / 180));

        const trueLongitude = (meanLongitude + equationOfCenter) % 360;
        const distance = this.AU;  // 1 AU in 10 km
        const x = -distance * Math.cos(trueLongitude * Math.PI / 180);
        const z = distance * Math.sin(trueLongitude * Math.PI / 180);
        const y = distance * eccentricity * Math.sin(trueLongitude * Math.PI / 180);
        return new THREE.Vector3(x, y, z);
    }

    // Helper to calculate Earth's velocity in orbit
    calculateEarthVelocity() {
        return new THREE.Vector3(-Math.sin(2 * Math.PI * this.dayOfYear / 365.25), 0, Math.cos(2 * Math.PI * this.dayOfYear / 365.25));
    }

    // Account for Earth's axial tilt
    getEarthTilt() {
        return new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(23.5)));
    }

    // Return deltaTime adjusted for the current time warp
    getDeltaTime() {
        return this.deltaTime;
    }

    // Return the simulated time as a Date object
    getSimulatedTime() {
        return this.simulatedTime;
    }

    getJulianDate() {
        const now = this.simulatedTime;
        const year = now.getUTCFullYear();
        const month = now.getUTCMonth() + 1;  // Month is zero-indexed
        const day = now.getUTCDate();
        const hour = now.getUTCHours();
        const minute = now.getUTCMinutes();
        const second = now.getUTCSeconds();
        const millisecond = now.getUTCMilliseconds();
        const isGregorian = year > 1582 || (year === 1582 && month > 10) || (year === 1582 && month === 10 && day >= 15);
        let julianDay = 0;

        if (month <= 2) {
            year -= 1;
            month += 12;
        }

        if (isGregorian) {
            const A = Math.floor(year / 100);
            const B = 2 - A + Math.floor(A / 4);
            julianDay = Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + B - 1524.5;
        } else {
            julianDay = Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day - 1524.5;
        }

        const julianDate = julianDay + (hour - 12) / 24 + minute / 1440 + second / 86400 + millisecond / 86400000;
        return julianDate;
    }

    getGreenwichSiderealTime() {
        const jd = this.getJulianDate();
        const t = (jd - 2451545.0) / 36525;
        const theta = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * t * t - t * t * t / 38710000;
        return theta % 360;
    }

    // Calculate the fraction of the day that has elapsed
    getFractionOfDay() {
        const now = this.simulatedTime;
        const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())); // Use UTC
        const millisecondsInDay = 86400000; // 24 * 60 * 60 * 1000
        const elapsedToday = now - startOfDay;
        return elapsedToday / millisecondsInDay;
    }

    getGreenwichPosition() {
        const distance = Constants.earthRadius;
        
        // Initial position of the Greenwich meridian at the equator (0° longitude)
        let position = new THREE.Vector3(distance, 0, 0);
    
        // Apply Earth's axial tilt (23.5 degrees)
        const tiltQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(23.5));
        
        // Earth's daily rotation based on the fraction of the day
        const rotationAngle = this.getFractionOfDay() * 2 * Math.PI + Math.PI * 0.256;  // Add PI to start at the back of the Earth
        const rotationQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationAngle);
        
        // Combine the tilt and rotation quaternions: apply rotation first, then tilt
        const combinedQuaternion = new THREE.Quaternion().multiplyQuaternions(tiltQuaternion, rotationQuaternion);
        
        // Apply the combined quaternion to the position
        position.applyQuaternion(combinedQuaternion);
        
        return position;
    }

}
