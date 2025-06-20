//TimeUtils.js
import * as THREE from 'three';
import { PhysicsConstants } from '../physics/core/PhysicsConstants.js';

/**
 * Convert JavaScript Date to Julian Date
 * @param {Date} date - JavaScript Date object
 * @returns {number} Julian Date
 */
export function dateToJd(date) {
    return (date.getTime() / PhysicsConstants.TIME.MILLISECONDS_IN_DAY) + PhysicsConstants.PHYSICS.J2000_EPOCH;
}

export class TimeUtils {
    constructor(settings) {
        this.simulatedTime = new Date(settings.simulatedTime);
        this.timeWarp = 1;
        this._lastUpdateTime = performance.now();
        
        // Track last dispatched values to prevent redundant events
        this._lastDispatchedTimeMs = 0;
        this._lastDispatchedWarp = 1;
        this._dispatchThreshold = 100; // Only dispatch if time changed by >100ms
        this._dispatchScheduled = false; // Track if a dispatch is already scheduled
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

    /**
     * Set local time warp (for real-time controls)
     */
    setLocalTimeWarp(newWarp) {
        this.timeWarp = newWarp;
        this._dispatchTimeUpdate(true); // Force dispatch to ensure immediate UI sync
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
     * Dispatch time update event - optimized to reduce redundant events
     */
    _dispatchTimeUpdate(forceDispatch = false) {
        const currentTimeMs = this.simulatedTime.getTime();
        const timeDiff = Math.abs(currentTimeMs - this._lastDispatchedTimeMs);
        
        // Only dispatch if time changed significantly or warp changed
        if (timeDiff < this._dispatchThreshold && this.timeWarp === this._lastDispatchedWarp && !forceDispatch) {
            return; // Skip redundant dispatch
        }
        
        this._lastDispatchedTimeMs = currentTimeMs;
        this._lastDispatchedWarp = this.timeWarp;
        
        // Dispatch immediately for responsiveness
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
        // Try to get orbital constants from centralized Sun configuration
        let orbitalConstants = null;
        try {
            // Access the PhysicsAPI to get Sun configuration
            if (window.app3d?.physicsAPI?.isReady()) {
                const sunConfig = window.app3d.physicsAPI.Bodies.getData('sun');
                orbitalConstants = sunConfig?.orbitalConstants;
            }
        } catch {
            // Fallback to hardcoded values if centralized data is not available
            console.warn('[TimeUtils] Could not access centralized Sun orbital constants, using fallback values');
        }

        // Use centralized constants or fallback to original hardcoded values
        const constants = orbitalConstants || {
            meanAnomalyBase: 357.5291,
            meanAnomalyRate: 0.98560028,
            meanLongitudeBase: 280.4665,
            meanLongitudeRate: 0.98564736,
            eccentricity: 0.0167,
            equationOfCenter: {
                c1: 1.9148,
                c2: 0.0200,
                c3: 0.0003
            }
        };

        const dayOfYear = TimeUtils.getDayOfYear(simulatedTime);
        const fractionOfDay = TimeUtils.getFractionOfDay(simulatedTime);
        const days = dayOfYear + fractionOfDay;
        
        const meanAnomaly = (constants.meanAnomalyBase + constants.meanAnomalyRate * days) % 360;
        const meanLongitude = (constants.meanLongitudeBase + constants.meanLongitudeRate * days) % 360;
        const eccentricity = constants.eccentricity;
        
        const equationOfCenter = (
            constants.equationOfCenter.c1 * Math.sin(meanAnomaly * Math.PI / 180) +
            constants.equationOfCenter.c2 * Math.sin(2 * meanAnomaly * Math.PI / 180) +
            constants.equationOfCenter.c3 * Math.sin(3 * meanAnomaly * Math.PI / 180)
        );
        
        const trueLongitude = (meanLongitude + equationOfCenter) % 360;
        const distance = PhysicsConstants.PHYSICS.AU;
        const rad = trueLongitude * Math.PI / 180;
        const x = distance * Math.cos(rad);
        const y = distance * Math.sin(rad);
        const z = distance * eccentricity * Math.sin(rad);
        return new THREE.Vector3(x, y, z);
    }

    static calculateBodyVelocity(simulatedTime, bodyName = 'earth') { // eslint-disable-line no-unused-vars
        // Use default orbital period for Earth to break dependency on Bodies.getData()
        // This maintains the same functionality while avoiding circular dependency
        // NOTE: bodyName parameter kept for API compatibility but currently only supports Earth
        const orbitalPeriod = 365.25; // Earth's orbital period in days
        const dayOfYear = TimeUtils.getDayOfYear(simulatedTime);
        return new THREE.Vector3(-Math.sin(2 * Math.PI * dayOfYear / orbitalPeriod), 0, Math.cos(2 * Math.PI * dayOfYear / orbitalPeriod));
    }

    static getBodyTilt(bodyName = 'earth') { // eslint-disable-line no-unused-vars
        // Use default Earth tilt to break dependency on Bodies.getData()
        // This maintains the same functionality while avoiding circular dependency
        // NOTE: bodyName parameter kept for API compatibility but currently only supports Earth
        const tilt = 23.5; // Earth's axial tilt in degrees
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
        const julianDate = julianDay + (hour - 12) / 24 + minute / 1440 + second / PhysicsConstants.TIME.SECONDS_IN_DAY + millisecond / PhysicsConstants.TIME.MILLISECONDS_IN_DAY;
        return julianDate;
    }

    static getGreenwichSiderealTime(simulatedTime) {
        // Try to get Greenwich constants from centralized Sun configuration
        let greenwichConstants = null;
        try {
            if (window.app3d?.physicsAPI?.isReady()) {
                const sunConfig = window.app3d.physicsAPI.Bodies.getData('sun');
                greenwichConstants = sunConfig?.orbitalConstants?.greenwich;
            }
        } catch {
            // Fallback to hardcoded values if centralized data is not available
        }

        // Use centralized constants or fallback to original hardcoded values
        const constants = greenwichConstants || {
            base: 280.46061837,
            rate: 360.98564736629,
            t2Coefficient: 0.000387933,
            t3Coefficient: 1.0 / 38710000
        };

        const jd = TimeUtils.getJulianDate(simulatedTime);
        const t = (jd - 2451545.0) / 36525;
        const theta = constants.base + constants.rate * (jd - 2451545.0) + 
                      constants.t2Coefficient * t * t - t * t * t * constants.t3Coefficient;
        return theta % 360;
    }

    getFractionOfMoonRotation(simulatedTime) {
        const startOfCycle = new Date(Date.UTC(2000, 0, 6));
        const millisecondsInCycle = 29.53058867 * 24 * 60 * 60 * 1000;
        const elapsedCycle = simulatedTime - startOfCycle;
        return (elapsedCycle % millisecondsInCycle) / millisecondsInCycle;
    }

}