varying vec3 vNormal;
varying vec3 vViewPosition;

void main() {
    vNormal = normalize(normalMatrix * normal);  // Convert normal to camera space
    vViewPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;  // Convert position to camera space
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
