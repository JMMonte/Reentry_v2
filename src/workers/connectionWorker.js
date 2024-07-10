class OctreeNode {
    constructor(center, size, depth = 0) {
        this.center = center;
        this.size = size;
        this.depth = depth;
        this.objects = [];
        this.children = null;
    }

    add(object) {
        if (!this.contains(object.position)) {
            return false;
        }

        if (this.objects.length < 8 && !this.children) {
            this.objects.push(object);
            return true;
        }

        if (!this.children) {
            this.subdivide();
        }

        for (let child of this.children) {
            if (child.add(object)) {
                return true;
            }
        }

        // If we reach here, the object couldn't be added to any child
        // So we add it to this node's objects
        this.objects.push(object);
        return true;
    }

    subdivide() {
        if (this.depth >= 10) {  // Limit subdivision depth
            return;
        }
        const halfSize = this.size / 2;
        this.children = [];
        for (let x = -1; x <= 1; x += 2) {
            for (let y = -1; y <= 1; y += 2) {
                for (let z = -1; z <= 1; z += 2) {
                    const childCenter = {
                        x: this.center.x + x * halfSize / 2,
                        y: this.center.y + y * halfSize / 2,
                        z: this.center.z + z * halfSize / 2
                    };
                    this.children.push(new OctreeNode(childCenter, halfSize, this.depth + 1));
                }
            }
        }

        const objectsToRedistribute = this.objects;
        this.objects = [];
        for (let object of objectsToRedistribute) {
            this.add(object);
        }
    }

    contains(position) {
        return Math.abs(position.x - this.center.x) <= this.size / 2 &&
            Math.abs(position.y - this.center.y) <= this.size / 2 &&
            Math.abs(position.z - this.center.z) <= this.size / 2;
    }

    search(position, radius) {
        if (!this.intersectsSphere(position, radius)) {
            return [];
        }

        let result = this.objects.filter(object =>
            calculateDistance(position, object.position) <= radius
        );

        if (this.children) {
            for (let child of this.children) {
                result = result.concat(child.search(position, radius));
            }
        }

        return result;
    }

    intersectsSphere(center, radius) {
        const dx = Math.abs(center.x - this.center.x);
        const dy = Math.abs(center.y - this.center.y);
        const dz = Math.abs(center.z - this.center.z);

        if (dx > (this.size / 2 + radius)) return false;
        if (dy > (this.size / 2 + radius)) return false;
        if (dz > (this.size / 2 + radius)) return false;

        if (dx <= (this.size / 2)) return true;
        if (dy <= (this.size / 2)) return true;
        if (dz <= (this.size / 2)) return true;

        const cornerDistanceSq =
            Math.pow(dx - this.size / 2, 2) +
            Math.pow(dy - this.size / 2, 2) +
            Math.pow(dz - this.size / 2, 2);

        return cornerDistanceSq <= (radius * radius);
    }
}

self.onmessage = function (event) {
    const { satellitePositions, earthPosition, moonPosition, earthRadius } = event.data;

    // Find the bounding box for all satellites
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let pos of satellitePositions) {
        minX = Math.min(minX, pos.x);
        minY = Math.min(minY, pos.y);
        minZ = Math.min(minZ, pos.z);
        maxX = Math.max(maxX, pos.x);
        maxY = Math.max(maxY, pos.y);
        maxZ = Math.max(maxZ, pos.z);
    }

    const center = {
        x: (minX + maxX) / 2,
        y: (minY + maxY) / 2,
        z: (minZ + maxZ) / 2
    };
    const size = Math.max(maxX - minX, maxY - minY, maxZ - minZ) * 1.1; // Add 10% margin

    const octree = new OctreeNode(center, size);
    satellitePositions.forEach((position, index) => {
        octree.add({ position, index });
    });

    const connections = [];
    const existingConnections = new Set();

    satellitePositions.forEach((position, index) => {
        const nearbyObjects = octree.search(position, 100000); // 100km radius
        nearbyObjects.forEach(nearby => {
            if (nearby.index > index) {
                const connectionId = getConnectionId(index, nearby.index);
                if (!existingConnections.has(connectionId) && isLineOfSight(position, nearby.position, earthPosition, moonPosition, earthRadius)) {
                    connections.push({
                        from: index,
                        to: nearby.index,
                        distance: calculateDistance(position, nearby.position)
                    });
                    existingConnections.add(connectionId);
                }
            }
        });
    });

    self.postMessage(connections);
};

function getConnectionId(id1, id2) {
    return id1 < id2 ? `${id1}-${id2}` : `${id2}-${id1}`;
}

function isLineOfSight(pos1, pos2, earthPos, moonPos, earthRadius) {
    const direction = subtractVectors(pos2, pos1);
    const ray = {
        origin: pos1,
        direction: normalizeVector(direction)
    };

    return !intersectsSphere(ray, earthPos, earthRadius) && !intersectsSphere(ray, moonPos, 1737100); // Moon radius in meters
}

function intersectsSphere(ray, center, radius) {
    const oc = subtractVectors(ray.origin, center);
    const a = dotProduct(ray.direction, ray.direction);
    const b = 2.0 * dotProduct(oc, ray.direction);
    const c = dotProduct(oc, oc) - radius * radius;
    const discriminant = b * b - 4 * a * c;
    return discriminant > 0;
}

function calculateDistance(pos1, pos2) {
    return Math.sqrt(
        Math.pow(pos2.x - pos1.x, 2) +
        Math.pow(pos2.y - pos1.y, 2) +
        Math.pow(pos2.z - pos1.z, 2)
    );
}

function subtractVectors(v1, v2) {
    return { x: v1.x - v2.x, y: v1.y - v2.y, z: v1.z - v2.z };
}

function normalizeVector(v) {
    const length = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    return { x: v.x / length, y: v.y / length, z: v.z / length };
}

function dotProduct(v1, v2) {
    return v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
}