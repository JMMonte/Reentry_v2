import * as THREE from 'three';

export class TimeUtils {
    constructor(settings) {
        this.settings = settings;
        this.lastTime = 0;
        this.deltaTime = 0;
        this.simulatedTime = new Date(settings.simulatedTime);
        this.dayOfYear = this.getDayOfYear(this.simulatedTime);
        this.fractionOfDay = this.getFractionOfDay();
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
        const start = new Date(date.getFullYear(), 0, 0);
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
        const distance = 1.496e+7;  // 1 AU in 10 km
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

    // Calculate the fraction of the day that has elapsed
    getFractionOfDay() {
        const now = this.simulatedTime;
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const millisecondsInDay = 86400000; // 24 * 60 * 60 * 1000
        const elapsedToday = now - startOfDay;
        return elapsedToday / millisecondsInDay;
    }
}
