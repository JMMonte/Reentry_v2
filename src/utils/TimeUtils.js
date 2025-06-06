//TimeUtils.js
import * as THREE from 'three';
import { Constants, Bodies } from '../physics/PhysicsAPI.js';

/**
 * Convert JavaScript Date to Julian Date
 * @param {Date} date - JavaScript Date object
 * @returns {number} Julian Date
 */
export function dateToJd(date) {
    return (date.getTime() / Constants.TIME.MILLISECONDS_IN_DAY) + Constants.PHYSICS.J2000_EPOCH;
}

export class TimeUtils {
    constructor(settings) {
        this.simulatedTime = new Date(settings.simulatedTime);
        this.timeWarp = 1;
        this._lastUpdateTime = performance.now();
    }

    /**
     * Update time based on external physics stepping (called by physics engine)
     * @param {Date} newTime - New simulation time from physics
     */
    updateFromPhysics(newTime) {
        if (this.timeWarp === 0) return; // Don't update when paused
        
        this.simulatedTime = new Date(newTime.getTime());
        this._lastUpdateTime = performance.now();
        
        // Dispatch timeUpdate event for UI synchronization
        this._dispatchTimeUpdate();
    }

    /**
     * Advance time manually (for when physics isn't running)
     */
    manualAdvance(deltaTimeSeconds) {
        if (this.timeWarp === 0) return;
        
        const deltaMs = deltaTimeSeconds * 1000;
        this.simulatedTime = new Date(this.simulatedTime.getTime() + deltaMs);
        this._dispatchTimeUpdate();
    }

    setLocalTimeWarp(newWarp) {
        this.timeWarp = newWarp;
        this._dispatchTimeUpdate();
    }

    setSimTimeFromServer(date, timeWarp) {
        // Validate the date parameter
        if (!date || (typeof date === 'string' && date.trim() === '') || (date instanceof Date && isNaN(date.getTime()))) {
            console.warn('[TimeUtils] Invalid date provided to setSimTimeFromServer, keeping current time');
            return;
        }
        
        try {
            const newTime = new Date(date);
            if (isNaN(newTime.getTime())) {
                console.warn('[TimeUtils] Failed to create valid date from:', date);
                return;
            }
            
            this.simulatedTime = newTime;
            this.timeWarp = timeWarp;
            this._dispatchTimeUpdate();
        } catch (error) {
            console.error('[TimeUtils] Error in setSimTimeFromServer:', error, 'date:', date);
        }
    }

    /**
     * Set simulation time directly (for local operation)
     */
    setSimulatedTime(newTime) {
        this.simulatedTime = new Date(newTime);
        this._dispatchTimeUpdate();
    }

    /**
     * Dispatch time update event
     */
    _dispatchTimeUpdate() {
        document.dispatchEvent(new CustomEvent('timeUpdate', {
            detail: {
                simulatedTime: this.simulatedTime.toISOString(),
                timeWarp: this.timeWarp,
            }
        }));
    }

    getSimulatedTime() { return this.simulatedTime; }
    getTimeWarp() { return this.timeWarp; }

    /**
     * Cleanup method
     */
    dispose() {
        // No intervals to clean up anymore
    }

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
        const dayOfYear = TimeUtils.getDayOfYear(simulatedTime);
        const fractionOfDay = TimeUtils.getFractionOfDay(simulatedTime);
        const days = dayOfYear + fractionOfDay;
        const meanAnomaly = (357.5291 + 0.98560028 * days) % 360;
        const meanLongitude = (280.4665 + 0.98564736 * days) % 360;
        const eccentricity = 0.0167;
        const equationOfCenter = (
            1.9148 * Math.sin(meanAnomaly * Math.PI / 180) +
            0.0200 * Math.sin(2 * meanAnomaly * Math.PI / 180) +
            0.0003 * Math.sin(3 * meanAnomaly * Math.PI / 180)
        );
        const trueLongitude = (meanLongitude + equationOfCenter) % 360;
        const distance = Constants.PHYSICS.AU;
        const rad = trueLongitude * Math.PI / 180;
        const x = distance * Math.cos(rad);
        const y = distance * Math.sin(rad);
        const z =  distance * eccentricity * Math.sin(rad);
        return new THREE.Vector3(x, y, z);
    }

    static calculateBodyVelocity(simulatedTime, bodyName = 'earth') {
        const bodyData = Bodies.getData(bodyName);
        const dayOfYear = TimeUtils.getDayOfYear(simulatedTime);
        const orbitalPeriod = bodyData?.orbitalPeriod || 365.25; // Default to Earth's orbital period
        return new THREE.Vector3(-Math.sin(2 * Math.PI * dayOfYear / orbitalPeriod), 0, Math.cos(2 * Math.PI * dayOfYear / orbitalPeriod));
    }

    static getBodyTilt(bodyName = 'earth') {
        const bodyData = Bodies.getData(bodyName);
        const tilt = bodyData?.tilt || 23.5; // Default to Earth's tilt
        return new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(tilt)));
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
        const julianDate = julianDay + (hour - 12) / 24 + minute / 1440 + second / Constants.TIME.SECONDS_IN_DAY + millisecond / Constants.TIME.MILLISECONDS_IN_DAY;
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

}