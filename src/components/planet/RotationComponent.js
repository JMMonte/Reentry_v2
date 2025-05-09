import { Planet } from './Planet.js';

export class RotationComponent {
    constructor(planet) {
        this.planet = planet;
    }

    update() {
        const JD = this.planet.timeManager.getJulianDate();
        this.planet.rotationGroup.rotation.y = Planet.getRotationAngleAtTime(
            JD,
            this.planet.rotationPeriod,
            this.planet.rotationOffset
        );
    }

    dispose() {
        // Nothing to dispose for rotation
    }
} 