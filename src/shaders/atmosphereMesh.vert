// src/shaders/atmosphereMesh.vert
// EXTREME DEBUG: Output fixed position

varying vec3 vWorldPosition;
varying vec3 vNormal;
 
void main() {
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorldPosition, 1.0);
} 