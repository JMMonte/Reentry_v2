//TimeUtils.js
import * as THREE from 'three';
import { Constants } from './Constants.js';

export class TimeUtils {
    constructor(settings) {
        this.simulatedTime = new Date(settings.simulatedTime);
        this._targetSimulatedTime = new Date(settings.simulatedTime); // Initialize target time
        this.timeWarp = 1;
        // this._lastTimeUpdate = performance.now(); // No longer needed for current interpolation
    }

    setLocalTimeWarp(newWarp) {
        this.timeWarp = newWarp;
        // Optionally, dispatch timeUpdate here as well if UI needs to react immediately
        // without waiting for backend confirmation, though current structure might handle it.
        document.dispatchEvent(new CustomEvent('timeUpdate', {
            detail: {
                simulatedTime: this.simulatedTime.toISOString(), // Keep current time
                timeWarp: this.timeWarp,
            }
        }));
    }

    setSimTimeFromServer(date, timeWarp) {
        this._targetSimulatedTime = new Date(date);
        this.timeWarp = timeWarp;
        // Dispatch event with the TARGET time and current warp, so UI reflects backend state
        document.dispatchEvent(new CustomEvent('timeUpdate', {
            detail: {
                simulatedTime: this._targetSimulatedTime.toISOString(),
                timeWarp: this.timeWarp,
            }
        }));
    }

    // Method to be called every frame from the simulation loop
    update() {
        // const now = performance.now();
        // const deltaMs = now - this._lastTimeUpdate;
        // this._lastTimeUpdate = now;

        if (this.timeWarp === 0) {
            return; // Time is paused, no interpolation needed
        }

        const currentTime = this.simulatedTime.getTime();
        const targetTime = this._targetSimulatedTime.getTime();

        if (currentTime === targetTime) {
            return; // Already at target
        }

        // Simple interpolation: move a fraction of the difference each frame.
        // Adjust interpolation factor as needed. A smaller factor means slower, smoother interpolation.
        const interpolationFactor = 0.1; // Adjust this for desired smoothness
        let newTime = currentTime + (targetTime - currentTime) * interpolationFactor;

        // Ensure we don't overshoot if close
        if (Math.abs(targetTime - currentTime) < 50) { // If less than 50ms difference, just snap
            newTime = targetTime;
        }
        
        this.simulatedTime = new Date(newTime);

        // We do NOT dispatch 'timeUpdate' here for the interpolated time frequently,
        // as that event is for UI sync to backend's target time.
        // The visual simulation directly uses this.simulatedTime via getTimeSimulated().
    }

    getSimulatedTime() { return this.simulatedTime; }
    getTimeWarp() { return this.timeWarp; }

    static getDayOfYear(date) {
        const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 0));
        const diff = date - start;
        const oneDay = 1000 * 60 * 60 * 24;
        return Math.floor(diff / oneDay);
    }

    static getFractionOfDay(date) {
        const startOfDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
        const millisecondsInDay = 86400000;
        const elapsedToday = date - startOfDay;
        return elapsedToday / millisecondsInDay;
    }

    static getSunPosition(simulatedTime) {
        // Use total days including fraction to move sun smoothly within each day
        const dayOfYear = TimeUtils.getDayOfYear(simulatedTime);
        const fractionOfDay = TimeUtils.getFractionOfDay(simulatedTime);
        const days = dayOfYear + fractionOfDay;
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
        const distance = Constants.AU * Constants.metersToKm;
        // compute using true longitude directly to point sun correctly
        const rad = trueLongitude * Math.PI / 180;
        const x = distance * Math.cos(rad);
        const y = distance * Math.sin(rad);
        const z =  distance * eccentricity * Math.sin(rad);
        return new THREE.Vector3(x, y, z);
    }

    static calculateEarthVelocity(simulatedTime) {
        const dayOfYear = TimeUtils.getDayOfYear(simulatedTime);
        return new THREE.Vector3(-Math.sin(2 * Math.PI * dayOfYear / 365.25), 0, Math.cos(2 * Math.PI * dayOfYear / 365.25));
    }

    static getEarthTilt() {
        return new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(23.5)));
    }

    static getJulianDate(simulatedTime) {
        const now = simulatedTime;
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

    static getGreenwichSiderealTime(simulatedTime) {
        const jd = TimeUtils.getJulianDate(simulatedTime);
        const t = (jd - 2451545.0) / 36525;
        const theta = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * t * t - t * t * t / 38710000;
        return theta % 360;
    }

    getFractionOfMoonRotation(simulatedTime) {
        const startOfCycle = new Date(Date.UTC(2000, 0, 6));
        const millisecondsInCycle = 29.53058867 * 24 * 60 * 60 * 1000;
        const elapsedCycle = simulatedTime - startOfCycle;
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