import { PhysicsUtils } from '../../utils/PhysicsUtils.js';
import { Constants } from '../../utils/Constants.js';

export class ManeuverCalculator {
    constructor() {
        this.currentOrbitalElements = null;
        this.targetOrbitalElements = null;
    }

    setCurrentOrbit(currentElements) {
        this.currentOrbitalElements = currentElements;
    }

    setTargetOrbit(targetElements) {
        this.targetOrbitalElements = targetElements;
    }

    calculateDeltaVAtAnomaly(targetElements, trueAnomaly) {
        if (!this.currentOrbitalElements || !targetElements) {
            console.error('Current or target orbital elements are not defined.');
            return null;
        }

        const mu = Constants.G * Constants.earthMass;

        return PhysicsUtils.calculateDeltaVAtAnomaly(
            this.currentOrbitalElements,
            targetElements,
            trueAnomaly,
            mu
        );
    }

    calculateDeltaV() {
        if (!this.currentOrbitalElements || !this.targetOrbitalElements) return null;

        const mu = Constants.G * Constants.earthMass;

        // Current orbit velocity
        const currentVelocity = PhysicsUtils.orbitalVelocityAtAnomaly(
            this.currentOrbitalElements,
            this.currentOrbitalElements.trueAnomaly,
            mu
        );

        // Target orbit velocity
        const targetVelocity = PhysicsUtils.orbitalVelocityAtAnomaly(
            this.targetOrbitalElements,
            this.currentOrbitalElements.trueAnomaly,
            mu
        );

        // Delta-V vector
        const deltaV = targetVelocity.clone().sub(currentVelocity);

        return deltaV;
    }

    calculateBestMomentDeltaV(targetElements) {
        if (!this.currentOrbitalElements || !targetElements) {
            console.error('Current or target orbital elements are not defined.');
            return null;
        }

        const points = 100; // Number of points to calculate
        const deltaVResults = [];

        for (let i = 0; i < points; i++) {
            const trueAnomaly = (i / points) * 2 * Math.PI;
            const deltaV = this.calculateDeltaVAtAnomaly(targetElements, trueAnomaly);
            deltaVResults.push({ trueAnomaly, deltaV });
        }

        // Find the minimum Delta-V
        const bestMoment = deltaVResults.reduce((min, p) => p.deltaV < min.deltaV ? p : min, deltaVResults[0]);

        return bestMoment;
    }
}
