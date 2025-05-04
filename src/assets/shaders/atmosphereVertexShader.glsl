precision highp float;
#include <common>
#undef PI
#define PI 3.14159265359
#include <logdepthbuf_pars_vertex>

// Uniforms
uniform mat3 planetFrame;      // Transforms World Dir -> Local Dir
uniform vec3 planetPosition;   // World position of planet center
// uniform vec3 cameraPosition;   // World position of camera (built-in)

// Varyings
varying vec3 vLocalPos;         // Vertex position in local frame
varying vec3 vRelativeEyeLocal; // Camera position relative to planet, in local frame

varying vec4 vWorldPosition;
varying float fov;
varying vec3 viewRay;

// uniform float worldScale;

void main() {
    // 1. Vertex position in local frame (is just 'position' if mesh origin = planet center)
    vLocalPos = position;

    // 2. Camera position relative to planet center, in world frame
    // Use built-in cameraPosition
    vec3 relativeEyeWorld = cameraPosition - planetPosition;

    // 3. Transform relative world vector into planet's local frame
    vRelativeEyeLocal = planetFrame * relativeEyeWorld;

    // Standard projection
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
    fov = 2.0 * atan(1.0 / projectionMatrix[1][1]) * (180.0 / PI);
}