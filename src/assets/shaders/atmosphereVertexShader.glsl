precision highp float;
#include <common>
#undef PI
#define PI 3.14159265359
#include <logdepthbuf_pars_vertex>

varying vec4 vWorldPosition;
varying float fov;
varying vec3 viewRay;

uniform float worldScale;

void main() {
    vWorldPosition = modelMatrix * vec4(position, 1.0);

    vec4 clipSpacePos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

    vec3 ndc = clipSpacePos.xyz / clipSpacePos.w;

    vec4 clipRay = vec4(ndc.x, ndc.y, -1.0, 1.0);
    vec4 tempViewRay = inverse(projectionMatrix) * clipRay;
    viewRay = vec3(tempViewRay.x, tempViewRay.y, -1.0);

    gl_Position = clipSpacePos;
    #include <logdepthbuf_vertex>
    fov = 2.0 * atan(1.0 / projectionMatrix[1][1]) * (180.0 / PI);
}