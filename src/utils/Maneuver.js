export class Maneuver {
    constructor(timestamp, deltaV, direction) {
        this.timestamp = timestamp;
        this.deltaV = deltaV;
        this.direction = direction.normalize();
        this.isComplete = false;
    }

    execute() {
        // Mark the maneuver as complete after execution
        this.isComplete = true;
        return {
            deltaV: this.deltaV,
            direction: this.direction
        };
    }

    update(currentTime) {
        // Check if it's time to execute the maneuver
        if (currentTime >= this.timestamp && !this.isComplete) {
            return this.execute();
        }
        return null;
    }

    getTimeToManeuver(currentTime) {
        return this.timestamp - currentTime;
    }
} 