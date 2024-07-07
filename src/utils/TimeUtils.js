//TimeUtils.js
import * as THREE from 'three';
import { Constants } from './Constants.js';

export class TimeUtils {
    constructor(settings) {
        this.settings = settings;
        this.lastTime = 0;
        this.deltaTime = 0;
        this.simulatedTime = new Date(settings.simulatedTime); // Ensure this is in UTC
        this.validateAndFixSimulatedTime();
        this.updateDerivedTimes();
        this.AU = Constants.AU;
        this.isInitialized = false;
    }

    validateAndFixSimulatedTime() {
        if (isNaN(this.simulatedTime.getTime())) {
            console.warn("Invalid simulated time detected. Current value:", this.simulatedTime);
            console.warn("Settings simulatedTime:", this.settings.simulatedTime);
            this.simulatedTime = new Date();
            this.settings.simulatedTime = this.simulatedTime.toISOString();
        }
    }

    updateDerivedTimes() {
        this.dayOfYear = this.getDayOfYear(this.simulatedTime);
        this.fractionOfDay = this.getFractionOfDay();
    }

    update(timestamp) {
        if (!this.isInitialized) {
            this.lastTime = timestamp * 0.001;
            this.isInitialized = true;
            return;
        }

        const now = timestamp * 0.001;
        this.deltaTime = (now - this.lastTime) * this.settings.timeWarp;
        
        if (isNaN(this.deltaTime) || this.deltaTime <= 0) {
            console.warn("Invalid deltaTime:", this.deltaTime);
            this.deltaTime = 0;
        }

        this.lastTime = now;
        const msToAdd = this.deltaTime * 1000;
        
        
        try {
            const newTime = this.simulatedTime.getTime() + msToAdd;
            this.simulatedTime = new Date(newTime);
            
            this.validateAndFixSimulatedTime();
            this.settings.simulatedTime = this.simulatedTime.toISOString();
            this.updateDerivedTimes();
        } catch (error) {
            console.error("Error updating simulated time:", error);
            console.error("Current simulatedTime:", this.simulatedTime);
            console.error("Current settings:", this.settings);
            this.validateAndFixSimulatedTime();
        }
    }

    setTimeWarp(warpFactor) {
        this.settings.timeWarp = warpFactor;
    }
    
    getSimulatedTime() {
        return this.simulatedTime;
    }

    getDayOfYear(date) {
        const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 0));
        const diff = date - start;
        const oneDay = 1000 * 60 * 60 * 24;
        return Math.floor(diff / oneDay);
    }

    getSunPosition() {
        const meanAnomaly = (357.5291 + 0.98560028 * this.dayOfYear) % 360;
        const meanLongitude = (280.4665 + 0.98564736 * this.dayOfYear) % 360;
        const eccentricity = 0.0167;
        const equationOfCenter = (1.9148 * Math.sin(meanAnomaly * Math.PI / 180) +
                                  0.0200 * Math.sin(2 * meanAnomaly * Math.PI / 180) +
                                  0.0003 * Math.sin(3 * meanAnomaly * Math.PI / 180));
        const trueLongitude = (meanLongitude + equationOfCenter) % 360;
        const distance = this.AU * Constants.metersToKm * Constants.scale;
        const x = -distance * Math.cos(trueLongitude * Math.PI / 180);
        const z = distance * Math.sin(trueLongitude * Math.PI / 180);
        const y = distance * eccentricity * Math.sin(trueLongitude * Math.PI / 180);
        return new THREE.Vector3(x, y, z);
    }

    calculateEarthVelocity() {
        return new THREE.Vector3(-Math.sin(2 * Math.PI * this.dayOfYear / 365.25), 0, Math.cos(2 * Math.PI * this.dayOfYear / 365.25));
    }

    getEarthTilt() {
        return new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(23.5)));
    }

    getDeltaTime() {
        return this.deltaTime;
    }

    getJulianDate() {
        const now = this.simulatedTime;
        let year = now.getUTCFullYear();
        let month = now.getUTCMonth() + 1;
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
        const julianDate = julianDay + (hour - 12) / 24 + minute / 1440 + second / Constants.secondsInDay + millisecond / Constants.milisecondsInDay;
        return julianDate;
    }

    getGreenwichSiderealTime() {
        const jd = this.getJulianDate();
        const t = (jd - 2451545.0) / 36525;
        const theta = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * t * t - t * t * t / 38710000;
        return theta % 360;
    }

    getFractionOfDay() {
        const now = this.simulatedTime;
        const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        const millisecondsInDay = 86400000;
        const elapsedToday = now - startOfDay;
        return elapsedToday / millisecondsInDay;
    }

    getFractionOfMoonRotation() {
        const now = this.simulatedTime;
        const startOfCycle = new Date(Date.UTC(2000, 0, 6));
        const millisecondsInCycle = 29.53058867 * 24 * 60 * 60 * 1000;
        const elapsedCycle = now - startOfCycle;
        return (elapsedCycle % millisecondsInCycle) / millisecondsInCycle;
    }

    getGreenwichPosition(earth) {
        const distance = Constants.earthRadius;
        let position = new THREE.Vector3(distance, 0, 0);
        const tiltQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(23.5));
        const rotationQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), earth.rotationGroup.rotation.y.toFixed(4));
        const combinedQuaternion = new THREE.Quaternion().multiplyQuaternions(tiltQuaternion, rotationQuaternion);
        // rotate 1.5Pi to match earth surface orientation in ThreeJs
        position.applyQuaternion(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI * 1.5));
        position.applyQuaternion(combinedQuaternion);
        return position;
    }
}