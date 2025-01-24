//TimeUtils.js
import * as THREE from 'three';
import { Constants } from './Constants';
import type { Earth } from '../components/Earth';

interface TimeSettings {
    simulatedTime?: string;
}

export class TimeUtils {
    private simulatedTime: Date;
    private deltaTime: number;
    private lastTimestamp: number;
    private lastTime: number;
    private settings: TimeSettings;
    private isInitialized: boolean;
    private dayOfYear: number;
    private fractionOfDay: number;
    private AU: number;
    timeWarp: number;

    constructor(config: TimeSettings = {}) {
        this.settings = config;
        this.simulatedTime = config.simulatedTime ? new Date(config.simulatedTime) : new Date();
        this.deltaTime = 0;
        this.lastTimestamp = 0;
        this.lastTime = 0;
        this.timeWarp = 1;
        this.isInitialized = false;
        this.dayOfYear = 0;
        this.fractionOfDay = 0;
        this.AU = Constants.AU;
        this.validateAndFixSimulatedTime();
        this.updateDerivedTimes();
    }

    private validateAndFixSimulatedTime(): void {
        if (isNaN(this.simulatedTime.getTime())) {
            console.warn("Invalid simulated time detected. Current value:", this.simulatedTime);
            console.warn("Settings simulatedTime:", this.settings.simulatedTime);
            this.simulatedTime = new Date();
            this.settings.simulatedTime = this.simulatedTime.toISOString();
        }
    }

    private updateDerivedTimes(): void {
        this.dayOfYear = this.getDayOfYear();
        this.fractionOfDay = this.getFractionOfDay();
    }

    update(timestamp: number): void {
        if (!this.isInitialized) {
            this.lastTime = timestamp;
            this.isInitialized = true;
            return;
        }

        this.deltaTime = timestamp - this.lastTime;
        this.lastTime = timestamp;

        // Update simulated time
        this.simulatedTime = new Date(this.simulatedTime.getTime() + (this.deltaTime * this.timeWarp));
        this.updateDerivedTimes();
    }

    setTimeWarp(value: number): void {
        this.timeWarp = value;
    }

    getSimulatedTime(): Date {
        return this.simulatedTime;
    }

    setSimulatedTime(newTime: string | Date): void {
        this.simulatedTime = typeof newTime === 'string' ? new Date(newTime) : newTime;
        this.validateAndFixSimulatedTime();
        this.updateDerivedTimes();
    }

    getDayOfYear(): number {
        const now = this.simulatedTime;
        const start = new Date(now.getFullYear(), 0, 0);
        const diff = (now.getTime() - start.getTime()) + ((start.getTimezoneOffset() - now.getTimezoneOffset()) * 60 * 1000);
        const oneDay = 1000 * 60 * 60 * 24;
        return Math.floor(diff / oneDay);
    }

    getFractionOfDay(): number {
        const now = this.simulatedTime;
        const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        const millisecondsInDay = 86400000;
        const elapsedToday = now.getTime() - startOfDay.getTime();
        return elapsedToday / millisecondsInDay;
    }

    getSunPosition(): THREE.Vector3 {
        return new THREE.Vector3(
            Math.cos(2 * Math.PI * this.dayOfYear / 365.25) * this.AU,
            0,
            Math.sin(2 * Math.PI * this.dayOfYear / 365.25) * this.AU
        );
    }

    calculateEarthVelocity(): THREE.Vector3 {
        return new THREE.Vector3(
            -Math.sin(2 * Math.PI * this.dayOfYear / 365.25),
            0,
            Math.cos(2 * Math.PI * this.dayOfYear / 365.25)
        );
    }

    getEarthTilt(): THREE.Vector3 {
        return new THREE.Vector3(0, 1, 0).applyQuaternion(
            new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(1, 0, 0),
                THREE.MathUtils.degToRad(23.5)
            )
        );
    }

    getDeltaTime(): number {
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

    getFractionOfMoonRotation() {
        const now = this.simulatedTime.getTime();
        const startOfCycle = new Date(Date.UTC(2000, 0, 6)).getTime();
        const millisecondsInCycle = 29.53058867 * 24 * 60 * 60 * 1000;
        const elapsedCycle = now - startOfCycle;
        return (elapsedCycle % millisecondsInCycle) / millisecondsInCycle;
    }

    getGreenwichPosition(earth: Earth): THREE.Vector3 {
        const distance = Constants.earthRadius;
        let position = new THREE.Vector3(distance, 0, 0);
        const tiltQuaternion = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(1, 0, 0),
            THREE.MathUtils.degToRad(23.5)
        );
        const rotationQuaternion = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 1, 0),
            Number(earth.rotationGroup.rotation.y.toFixed(4))
        );
        const combinedQuaternion = new THREE.Quaternion().multiplyQuaternions(
            tiltQuaternion,
            rotationQuaternion
        );
        // rotate 1.5Pi to match earth surface orientation in ThreeJs
        position.applyQuaternion(
            new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(0, 1, 0),
                Math.PI * 1.5
            )
        );
        position.applyQuaternion(combinedQuaternion);
        return position;
    }
}