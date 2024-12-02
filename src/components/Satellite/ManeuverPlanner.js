import { Constants } from '../../utils/Constants.js';
import { PhysicsUtils } from '../../utils/PhysicsUtils.js';
import { Maneuver } from '../utils/Maneuver.js';

export class ManeuverPlanner {
    constructor(satellite) {
        this.satellite = satellite;
    }

    plan(params) {
        switch (params.type) {
            case 'hohmann':
                return this.planHohmannTransfer(params.targetAltitude);
            case 'circularize':
                return this.planCircularization();
            // Add more maneuver types as needed
            default:
                throw new Error('Unknown maneuver type');
        }
    }

    planHohmannTransfer(targetAltitude) {
        const currentState = this.satellite.getState();
        const currentAltitude = currentState.getAltitude(this.satellite.earth.getPosition());
        const currentVelocity = currentState.velocity.length();

        const r1 = Constants.earthRadius + currentAltitude;
        const r2 = Constants.earthRadius + targetAltitude;

        const v1 = Math.sqrt(Constants.G * Constants.earthMass / r1);
        const v2 = Math.sqrt(Constants.G * Constants.earthMass / r2);

        const deltaV1 = Math.sqrt(Constants.G * Constants.earthMass * (2 / r1 - 2 / (r1 + r2))) - v1;
        const deltaV2 = Math.sqrt(Constants.G * Constants.earthMass * (2 / r2 - 2 / (r1 + r2))) - v2;

        const transferTime = Math.PI * Math.sqrt(Math.pow(r1 + r2, 3) / (8 * Constants.G * Constants.earthMass));

        const maneuver1 = new Maneuver(Date.now(), deltaV1, currentState.velocity.normalize());
        const maneuver2 = new Maneuver(Date.now() + transferTime * 1000, deltaV2, currentState.velocity.normalize());

        return [maneuver1, maneuver2];
    }

    planCircularization() {
        const currentState = this.satellite.getState();
        const currentPosition = currentState.position;
        const currentVelocity = currentState.velocity;

        const r = currentPosition.length();
        const vCircular = Math.sqrt(Constants.G * Constants.earthMass / r);

        const vCurrent = currentVelocity.length();
        const deltaV = vCircular - vCurrent;

        return new Maneuver(Date.now(), deltaV, currentVelocity.normalize());
    }
}