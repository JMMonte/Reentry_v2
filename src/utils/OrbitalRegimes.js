// Orbital regimes in meters (from Earth's surface)
export const OrbitalRegimes = {
    // Low Earth Orbit (LEO): 160-2000 km
    LEO: {
        min: 160000,
        max: 2000000,
        label: 'LEO'
    },
    // Medium Earth Orbit (MEO): 2000-35786 km
    MEO: {
        min: 2000000,
        max: 35786000,
        label: 'MEO'
    },
    // Geosynchronous Orbit (GEO): 35,786 km
    GEO: {
        altitude: 35786000,
        label: 'GEO'
    },
    // Highly Elliptical Orbit (HEO): Typically perigee at LEO altitudes and apogee beyond GEO
    HEO: {
        perigee: 1000000,  // Typical perigee around 1000 km
        apogee: 40000000,  // Typical apogee around 40,000 km
        label: 'HEO'
    }
};
