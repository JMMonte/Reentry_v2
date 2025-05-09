//TimeUtils.js
import * as THREE from 'three';
import { Constants } from './Constants.js';

export class TimeUtils {
    constructor(settings) {
        this.settings = settings;
        this.lastTime = 0;
        this.deltaTime = 0;
        this.timeWarp = 1;
        this.simulatedTime = new Date(settings.simulatedTime); // Ensure this is in UTC
        this.validateAndFixSimulatedTime();
        this.updateDerivedTimes();
        this.AU = Constants.AU;
        this.isInitialized = false;
        this._lastDispatch = 0;
        this._dispatchInterval = 100; // ms between timeUpdate events
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
            this.lastTime = timestamp;
            this.isInitialized = true;
            return;
        }

        // Calculate real-time delta in milliseconds
        this.deltaTime = timestamp - this.lastTime;
        this.lastTime = timestamp;

        // Apply timewarp to the simulation time
        const simulatedDelta = this.deltaTime * this.timeWarp;
        this.simulatedTime = new Date(this.simulatedTime.getTime() + simulatedDelta);
        
        // Update derived times
        this.updateDerivedTimes();

        // Dispatch time update events at limited frequency
        const now = timestamp;
        if (now - this._lastDispatch >= this._dispatchInterval) {
            document.dispatchEvent(new CustomEvent('timeUpdate', {
                detail: { 
                    simulatedTime: this.simulatedTime.toISOString(),
                    timeWarp: this.timeWarp,
                    deltaTime: this.deltaTime
                }
            }));
            this._lastDispatch = now;
        }
    }

    setTimeWarp(value) {
        this.timeWarp = Number(value);
        // Dispatch event to notify of timewarp change
        document.dispatchEvent(new CustomEvent('timeWarpChanged', {
            detail: { timeWarp: this.timeWarp }
        }));
    }

    setSimulatedTime(newTime) {
        this.simulatedTime = new Date(newTime);
        this.validateAndFixSimulatedTime();
        this.updateDerivedTimes();
        
        // Dispatch time update event
        document.dispatchEvent(new CustomEvent('timeUpdate', {
            detail: { 
                simulatedTime: this.simulatedTime.toISOString(),
                timeWarp: this.timeWarp,
                deltaTime: this.deltaTime
            }
        }));
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
        // Use total days including fraction to move sun smoothly within each day
        const days = this.dayOfYear + this.fractionOfDay;
        const meanAnomaly = (357.5291 + 0.98560028 * days) % 360;
        const meanLongitude = (280.4665 + 0.98564736 * days) % 360;
        // Sun's orbital eccentricity and equation of center for true longitude
        const eccentricity = 0.0167;
        const equationOfCenter = (
            1.9148 * Math.sin(meanAnomaly * Math.PI / 180) +
            0.0200 * Math.sin(2 * meanAnomaly * Math.PI / 180) +
            0.0003 * Math.sin(3 * meanAnomaly * Math.PI / 180)
        );
        const trueLongitude = (meanLongitude + equationOfCenter) % 360;
        const distance = this.AU * Constants.metersToKm;
        // compute using true longitude directly to point sun correctly
        const rad = trueLongitude * Math.PI / 180;
        const x = distance * Math.cos(rad);
        const y = distance * Math.sin(rad);
        const z =  distance * eccentricity * Math.sin(rad);
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