// textureRegistry.js
// Central registry for all texture assets and their keys
import earthTexture from '../assets/texture/earth_surface.jpg';
import earthRoughnessTexture from '../assets/texture/earth_roughness.png';
import earthNormalTexture from '../assets/texture/earth_normal.jpg';
import earthNightTexture from '../assets/texture/earth_night.jpg';
import cloudTexture from '../assets/texture/earth_clouds.png';
import moonTexture from '../assets/texture/moon_surface.jpg';
import moonNormalTexture from '../assets/texture/moon_normal.png';
import mercuryTexture from '../assets/texture/mercury_surface.jpg';
import mercuryNormalTexture from '../assets/texture/mercury_normal.png';
import venusTexture from '../assets/texture/venus_surface.jpg';
import venusCloudTexture from '../assets/texture/venus_clouds.jpg';
import marsTexture from '../assets/texture/mars_surface.jpg';
import marsNormalTexture from '../assets/texture/mars_normal.png';
import jupiterTexture from '../assets/texture/jupiter_surface.jpg';
import saturnTexture from '../assets/texture/saturn_surface.jpg';
import saturnRingTexture from '../assets/texture/saturn_rings.png';
import uranusTexture from '../assets/texture/uranus_surface.jpg';
import neptuneTexture from '../assets/texture/neptune_surface.jpg';
import ioTexture from '../assets/texture/io_surface.png';
import europaTexture from '../assets/texture/europa_surface.png';
import ganymedeTexture from '../assets/texture/ganymede_surface.jpg';
import callistoTexture from '../assets/texture/callisto_surface.png';
import uranusRingTexture from '../assets/texture/uranus_rings.png';
import neptuneRingTexture from '../assets/texture/neptune_rings.png';
import plutoTexture from '../assets/texture/pluto_surface.png';
import plutoNormalTexture from '../assets/texture/pluto_normal.png';
import charonTexture from '../assets/texture/charon_surface.png';
// Saturn moons
import mimasTexture from '../assets/texture/placeholder.jpg';
import enceladusTexture from '../assets/texture/placeholder.jpg';
import tethysTexture from '../assets/texture/placeholder.jpg';
import dioneTexture from '../assets/texture/placeholder.jpg';
import rheaTexture from '../assets/texture/placeholder.jpg';
import titanTexture from '../assets/texture/titan_surface.jpg';
import titanCloudTexture from '../assets/texture/titan_clouds.jpg';
import iapetusTexture from '../assets/texture/placeholder.jpg';
// Uranus moons
import arielTexture from '../assets/texture/placeholder.jpg';
import umbrielTexture from '../assets/texture/placeholder.jpg';
import titaniaTexture from '../assets/texture/placeholder.jpg';
import oberonTexture from '../assets/texture/placeholder.jpg';
import mirandaTexture from '../assets/texture/placeholder.jpg';
// Neptune moons
import tritonTexture from '../assets/texture/placeholder.jpg';
import proteusTexture from '../assets/texture/placeholder.jpg';
import nereidTexture from '../assets/texture/placeholder.jpg';
// Pluto moons
import nixTexture from '../assets/texture/placeholder.jpg';
import hydraTexture from '../assets/texture/placeholder.jpg';
import kerberosTexture from '../assets/texture/placeholder.jpg';
import styxTexture from '../assets/texture/placeholder.jpg';
// Dwarf planets
import ceresTexture from '../assets/texture/4k_ceres_fictional.jpg';
import erisTexture from '../assets/texture/4k_eris_fictional.jpg';
import makemakeTexture from '../assets/texture/4k_makemake_fictional.jpg';
import haumeaTexture from '../assets/texture/4k_haumea_fictional.jpg';
import sunTexture from '../assets/texture/sun_surface_texture.png';

export const textureDefinitions = [
    { key: 'earthTexture', src: earthTexture },
    { key: 'earthRoughnessTexture', src: earthRoughnessTexture },
    { key: 'earthNormalTexture', src: earthNormalTexture },
    { key: 'earthNightTexture', src: earthNightTexture },
    { key: 'cloudTexture', src: cloudTexture },
    { key: 'moonTexture', src: moonTexture },
    { key: 'moonNormalTexture', src: moonNormalTexture },
    { key: 'mercuryTexture', src: mercuryTexture },
    { key: 'mercuryNormalTexture', src: mercuryNormalTexture },
    { key: 'venusTexture', src: venusTexture },
    { key: 'venusCloudTexture', src: venusCloudTexture },
    { key: 'marsTexture', src: marsTexture },
    { key: 'marsNormalTexture', src: marsNormalTexture },
    { key: 'jupiterTexture', src: jupiterTexture },
    { key: 'saturnTexture', src: saturnTexture },
    { key: 'saturnRingTexture', src: saturnRingTexture },
    { key: 'uranusRingTexture', src: uranusRingTexture },
    { key: 'neptuneRingTexture', src: neptuneRingTexture },
    { key: 'uranusTexture', src: uranusTexture },
    { key: 'neptuneTexture', src: neptuneTexture },
    { key: 'ioTexture', src: ioTexture },
    { key: 'europaTexture', src: europaTexture },
    { key: 'ganymedeTexture', src: ganymedeTexture },
    { key: 'callistoTexture', src: callistoTexture },
    { key: 'plutoTexture', src: plutoTexture },
    { key: 'plutoNormalTexture', src: plutoNormalTexture },
    { key: 'charonTexture', src: charonTexture },
    { key: 'mimasTexture', src: mimasTexture },
    { key: 'enceladusTexture', src: enceladusTexture },
    { key: 'tethysTexture', src: tethysTexture },
    { key: 'dioneTexture', src: dioneTexture },
    { key: 'rheaTexture', src: rheaTexture },
    { key: 'titanTexture', src: titanTexture },
    { key: 'titanCloudTexture', src: titanCloudTexture },
    { key: 'iapetusTexture', src: iapetusTexture },
    { key: 'arielTexture', src: arielTexture },
    { key: 'umbrielTexture', src: umbrielTexture },
    { key: 'titaniaTexture', src: titaniaTexture },
    { key: 'oberonTexture', src: oberonTexture },
    { key: 'mirandaTexture', src: mirandaTexture },
    { key: 'tritonTexture', src: tritonTexture },
    { key: 'proteusTexture', src: proteusTexture },
    { key: 'nereidTexture', src: nereidTexture },
    { key: 'nixTexture', src: nixTexture },
    { key: 'hydraTexture', src: hydraTexture },
    { key: 'kerberosTexture', src: kerberosTexture },
    { key: 'styxTexture', src: styxTexture },
    { key: 'ceresTexture', src: ceresTexture },
    { key: 'erisTexture', src: erisTexture },
    { key: 'makemakeTexture', src: makemakeTexture },
    { key: 'haumeaTexture', src: haumeaTexture },
    { key: 'saturnRingsTexture', src: saturnRingTexture },
    { key: 'uranusRingsTexture', src: uranusRingTexture },
    { key: 'neptuneRingsTexture', src: neptuneRingTexture },
    { key: 'sunTexture', src: sunTexture },
];

export {
    earthTexture,
    earthRoughnessTexture,
    earthNormalTexture,
    earthNightTexture,
    cloudTexture,
    moonTexture,
    moonNormalTexture,
    mercuryTexture,
    mercuryNormalTexture,
    venusTexture,
    venusCloudTexture,
    marsTexture,
    marsNormalTexture,
    jupiterTexture,
    saturnTexture,
    uranusTexture,
    neptuneTexture,
    ioTexture,
    europaTexture,
    ganymedeTexture,
    callistoTexture,
    plutoTexture,
    plutoNormalTexture,
    charonTexture,
    mimasTexture,
    enceladusTexture,
    tethysTexture,
    dioneTexture,
    rheaTexture,
    titanTexture,
    titanCloudTexture,
    iapetusTexture,
    arielTexture,
    umbrielTexture,
    titaniaTexture,
    oberonTexture,
    mirandaTexture,
    tritonTexture,
    proteusTexture,
    nereidTexture,
    nixTexture,
    hydraTexture,
    kerberosTexture,
    styxTexture,
    ceresTexture,
    erisTexture,
    makemakeTexture,
    haumeaTexture,
    saturnRingTexture,
    uranusRingTexture,
    neptuneRingTexture
}; 