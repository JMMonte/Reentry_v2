precision highp float;
varying vec4 vWorldPosition;
varying float fov;
const float PI = 3.14159265359;
varying vec3 viewRay; // View space ray direction

void main() {
    vWorldPosition = modelMatrix * vec4(position, 1.0);

    // Compute clip-space position
    vec4 clipSpacePos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

    // Compute normalized device coordinates (NDC)
    vec3 ndc = clipSpacePos.xyz / clipSpacePos.w;

    // Compute the view-space ray direction
    vec4 clipRay = vec4(ndc.x, ndc.y, -1.0, 1.0);
    vec4 tempViewRay = inverse(projectionMatrix) * clipRay;
    viewRay = vec3(tempViewRay.x, tempViewRay.y, -1.0);

    gl_Position = clipSpacePos;
    fov = 2.0 * atan(1.0 / projectionMatrix[1][1]) * (180.0 / PI);
}
