# solar_system.py
"""
Centralized solar system configuration for NAIF IDs, parent mapping, and required kernels.
Edit this file to update the solar system model in one place.
"""

# Human-readable list of all relevant NAIF IDs, names, and parents for your simulation
SOLAR_SYSTEM_BODIES = [
    # Barycenters and Sun
    {
        "id": 0,
        "name": "Solar System Barycenter",
        "parent": None,
        "streamed": False,
        # No canonical_orbit:
        # SSB is always at the origin (0,0,0) in the barycentric frame.
    },
    {
        "id": 10,
        "name": "Sun",
        "parent": 0,
        "streamed": True,
        # No canonical_orbit:
        # Sun's fallback is computed as the negative sum of planetary barycenter orbits.
    },
    {
        "id": 1,
        "name": "Mercury Barycenter",
        "parent": 0,
        "streamed": True,
        "canonical_orbit": {
            "a": 57909050.0,
            "e": 0.2056,
            "i": 7.005,
            "Omega": 48.331,
            "omega": 29.124,
            "M0": 174.796,
        },
    },
    {
        "id": 2,
        "name": "Venus Barycenter",
        "parent": 0,
        "streamed": True,
        "canonical_orbit": {
            "a": 108208000.0,
            "e": 0.0067,
            "i": 3.3947,
            "Omega": 76.680,
            "omega": 54.884,
            "M0": 50.416,
        },
    },
    {
        "id": 3,
        "name": "Earth Barycenter",
        "parent": 0,
        "streamed": True,
        "canonical_orbit": {
            "a": 149598023.0,
            "e": 0.0167,
            "i": 0.000,
            "Omega": -11.26064,
            "omega": 114.20783,
            "M0": 358.617,
        },
    },
    {
        "id": 4,
        "name": "Mars Barycenter",
        "parent": 0,
        "streamed": True,
        "canonical_orbit": {
            "a": 227939200.0,
            "e": 0.0935,
            "i": 1.850,
            "Omega": 49.558,
            "omega": 286.502,
            "M0": 19.373,
        },
    },
    {
        "id": 5,
        "name": "Jupiter Barycenter",
        "parent": 0,
        "streamed": True,
        "canonical_orbit": {
            "a": 778570000.0,
            "e": 0.0489,
            "i": 1.303,
            "Omega": 100.464,
            "omega": 273.867,
            "M0": 20.020,
        },
    },
    {
        "id": 6,
        "name": "Saturn Barycenter",
        "parent": 0,
        "streamed": True,
        "canonical_orbit": {
            "a": 1433530000.0,
            "e": 0.0565,
            "i": 2.485,
            "Omega": 113.665,
            "omega": 339.392,
            "M0": 317.020,
        },
    },
    {
        "id": 7,
        "name": "Uranus Barycenter",
        "parent": 0,
        "streamed": True,
        "canonical_orbit": {
            "a": 2875040000.0,
            "e": 0.0463,
            "i": 0.773,
            "Omega": 74.006,
            "omega": 96.998,
            "M0": 142.2386,
        },
    },
    {
        "id": 8,
        "name": "Neptune Barycenter",
        "parent": 0,
        "streamed": True,
        "canonical_orbit": {
            "a": 4504450000.0,
            "e": 0.0097,
            "i": 1.770,
            "Omega": 131.784,
            "omega": 273.187,
            "M0": 256.228,
        },
    },
    {
        "id": 9,
        "name": "Pluto System Barycenter",
        "parent": 0,
        "streamed": True,
        "canonical_orbit": {
            "a": 5906440628.0,
            "e": 0.2488,
            "i": 17.16,
            "Omega": 110.299,
            "omega": 113.834,
            "M0": 14.53,
        },
    },
    # Planets
    {
        "id": 199,
        "name": "Mercury",
        "parent": 1,
        "j2": 6.0e-5,
        "r_eq": 2439.7,
        "streamed": True,
        "GM": 22031.86855,  # km^3/s^2, JPL
        "canonical_orbit": {
            "a": 57909050.0,
            "e": 0.2056,
            "i": 7.005,
            "Omega": 48.331,
            "omega": 29.124,
            "M0": 174.796,
        },
    },
    {
        "id": 299,
        "name": "Venus",
        "parent": 2,
        "j2": 4.458e-6,
        "r_eq": 6051.8,
        "streamed": True,
        "GM": 324858.592,  # km^3/s^2, JPL
        "canonical_orbit": {
            "a": 108208000.0,
            "e": 0.0067,
            "i": 3.3947,
            "Omega": 76.680,
            "omega": 54.884,
            "M0": 50.416,
        },
    },
    {
        "id": 399,
        "name": "Earth",
        "parent": 3,
        "j2": 1.08262668e-3,
        "r_eq": 6378.1366,
        "streamed": True,
        "GM": 398600.435507,  # km^3/s^2, JPL
        "canonical_orbit": {
            "a": 149598023.0,
            "e": 0.0167,
            "i": 0.000,
            "Omega": -11.26064,
            "omega": 114.20783,
            "M0": 358.617,
        },
    },
    {
        "id": 499,
        "name": "Mars",
        "parent": 4,
        "j2": 1.96045e-3,
        "r_eq": 3396.19,
        "streamed": True,
        "GM": 42828.375214,  # km^3/s^2, JPL
        "canonical_orbit": {
            "a": 227939200.0,
            "e": 0.0935,
            "i": 1.850,
            "Omega": 49.558,
            "omega": 286.502,
            "M0": 19.373,
        },
    },
    {
        "id": 599,
        "name": "Jupiter",
        "parent": 5,
        "j2": 0.014696,
        "r_eq": 71492,
        "streamed": True,
        "GM": 126686531.9,  # km^3/s^2, JPL
        "canonical_orbit": {
            "a": 778570000.0,
            "e": 0.0489,
            "i": 1.303,
            "Omega": 100.464,
            "omega": 273.867,
            "M0": 20.020,
        },
    },
    {
        "id": 699,
        "name": "Saturn",
        "parent": 6,
        "j2": 0.016298,
        "r_eq": 60268,
        "streamed": True,
        "GM": 37931207.8,  # km^3/s^2, JPL
        "canonical_orbit": {
            "a": 1433530000.0,
            "e": 0.0565,
            "i": 2.485,
            "Omega": 113.665,
            "omega": 339.392,
            "M0": 317.020,
        },
    },
    {
        "id": 799,
        "name": "Uranus",
        "parent": 7,
        "streamed": True,
        "GM": 5793951.3,  # km^3/s^2, JPL
        "r_eq": 25559.0,  # km, IAU 2015
        "canonical_orbit": {
            "a": 2875040000.0,
            "e": 0.0463,
            "i": 0.773,
            "Omega": 74.006,
            "omega": 96.998,
            "M0": 142.2386,
        },
    },
    {
        "id": 899,
        "name": "Neptune",
        "parent": 8,
        "streamed": True,
        "GM": 6835103.1,  # km^3/s^2, JPL
        "r_eq": 24764.0,  # km, IAU 2015
        "canonical_orbit": {
            "a": 4504450000.0,
            "e": 0.0097,
            "i": 1.770,
            "Omega": 131.784,
            "omega": 273.187,
            "M0": 256.228,
        },
    },
    {
        "id": 999,
        "name": "Pluto",
        "parent": 9,
        "streamed": True,
        "GM": 869.613817,  # km^3/s^2, JPL
        "r_eq": 1188.3,  # km, IAU 2015
        "canonical_orbit": {
            "a": 5906440628.0,
            "e": 0.2488,
            "i": 17.16,
            "Omega": 110.299,
            "omega": 113.834,
            "M0": 14.53,
        },
    },
    # Major moons
    {
        "id": 301,
        "name": "Moon",
        "parent": 3,
        "streamed": True,
        "GM": 4902.800066,  # km^3/s^2, JPL DE440
        "r_eq": 1737.4,  # km, IAU 2015
        "j2": 2.032e-4,  # IAU 2015
        "orientation_quat": [
            0.3186675622944306,
            0.9240892132462319,
            0.19537822808060934,
            -0.0796081572162473,
        ],
        # Rotational parameters (IAU 2015, from pck00011.tpc):
        # pole_ra: right ascension of north pole [deg, deg/century, deg/century^2]
        # pole_dec: declination of north pole [deg, deg/century, deg/century^2]
        # pm: prime meridian angle [deg, deg/day, deg/day^2]
        "pole_ra": [269.9949, 0.0031, 0.0],
        "pole_dec": [66.5392, 0.0130, 0.0],
        "pm": [38.3213, 13.17635815, -1.4e-12],
        "canonical_orbit": {
            "a": 384400.0,
            "e": 0.0549,
            "i": 5.145,
            "Omega": 125.08,  # deg, J2000, IAU 2015
            "omega": 318.15,  # deg, J2000, IAU 2015
            "M0": 115.3654,  # deg, J2000, JPL Horizons
        },
    },
    {
        "id": 401,
        "name": "Phobos",
        "parent": 4,
        "streamed": True,
        "GM": 0.0007112,  # km^3/s^2, JPL
        "r_eq": 11.2667,  # km, JPL
        "j2": 0.0,
        "orientation_quat": [
            0.6308383566747584,
            0.7115274160209963,
            0.3075094984340903,
            0.034779482043131506,
        ],
        # Rotational parameters (from pck00011.tpc):
        "pole_ra": [317.67071657, -0.10844326, 0.0],
        "pole_dec": [52.88627266, -0.06134706, 0.0],
        "pm": [35.18774440, 1128.84475928, 0.0],
        "canonical_orbit": {
            "a": 9376.0,
            "e": 0.0151,
            "i": 1.075,
            "Omega": 49.2,  # deg, J2000, JPL
            "omega": 150.057,  # deg, J2000, JPL
            "M0": 177.4,  # deg, J2000, JPL
        },
    },
    {
        "id": 402,
        "name": "Deimos",
        "parent": 4,
        "streamed": True,
        "GM": 0.0000985,  # km^3/s^2, JPL
        "r_eq": 6.2,  # km, JPL
        "j2": 0.0,
        "orientation_quat": [
            0.8454450655355805,
            0.42626836332308543,
            0.3119031808153065,
            -0.07895776965372207,
        ],
        # Rotational parameters (from pck00011.tpc):
        "pole_ra": [316.65705808, -0.10518014, 0.0],
        "pole_dec": [53.50992033, -0.05979094, 0.0],
        "pm": [79.39932954, 285.16188899, 0.0],
        "canonical_orbit": {
            "a": 23463.2,
            "e": 0.00033,
            "i": 1.788,
            "Omega": 316.65,  # deg, J2000, JPL
            "omega": 260.729,  # deg, J2000, JPL
            "M0": 53.2,  # deg, J2000, JPL
        },
    },
    {
        "id": 501,
        "name": "Io",
        "parent": 5,
        "streamed": True,
        "GM": 595.6,  # km^3/s^2, JPL
        "r_eq": 1821.6,  # km, JPL
        "j2": 0.0,
        "orientation_quat": [
            -0.9627925031965429,
            0.15620667287302778,
            0.043054086617703644,
            0.21627856288589808,
        ],
        # Rotational parameters (from pck00011.tpc):
        "pole_ra": [268.05, -0.009, 0.0],
        "pole_dec": [64.50, 0.003, 0.0],
        "pm": [200.39, 203.4889538, 0.0],
        "canonical_orbit": {
            "a": 421700.0,
            "e": 0.0041,
            "i": 0.036,
            "Omega": 43.977,  # deg, J2000, JPL
            "omega": 84.129,  # deg, J2000, JPL
            "M0": 171.016,  # deg, J2000, JPL
        },
    },
    {
        "id": 502,
        "name": "Europa",
        "parent": 5,
        "streamed": True,
        "GM": 320.0,  # km^3/s^2, JPL
        "r_eq": 1560.8,  # km, JPL
        "j2": 0.0,
        "orientation_quat": [
            0.2862225966304867,
            0.9333206784518087,
            0.20494819207692228,
            -0.07060718742988059,
        ],
        # Rotational parameters (from pck00011.tpc):
        "pole_ra": [268.08, -0.009, 0.0],
        "pole_dec": [64.51, 0.003, 0.0],
        "pm": [36.022, 101.3747235, 0.0],
        "canonical_orbit": {
            "a": 671034.0,
            "e": 0.009,
            "i": 0.465,
            "Omega": 219.106,  # deg, J2000, JPL
            "omega": 88.970,  # deg, J2000, JPL
            "M0": 29.298,  # deg, J2000, JPL
        },
    },
    {
        "id": 503,
        "name": "Ganymede",
        "parent": 5,
        "streamed": True,
        "GM": 988.7,  # km^3/s^2, JPL
        "r_eq": 2634.1,  # km, JPL
        "j2": 0.0,
        "orientation_quat": [
            0.3518206607032618,
            0.9095464313346583,
            0.2041922883141911,
            -0.08516467191108519,
        ],
        # Rotational parameters (from pck00011.tpc):
        "pole_ra": [268.20, -0.009, 0.0],
        "pole_dec": [64.57, 0.003, 0.0],
        "pm": [44.064, 50.3176081, 0.0],
        "canonical_orbit": {
            "a": 1070412.0,
            "e": 0.0013,
            "i": 0.177,
            "Omega": 63.552,  # deg, J2000, JPL
            "omega": 192.417,  # deg, J2000, JPL
            "M0": 192.417,  # deg, J2000, JPL
        },
    },
    {
        "id": 504,
        "name": "Callisto",
        "parent": 5,
        "streamed": True,
        "GM": 717.0,  # km^3/s^2, JPL
        "r_eq": 2410.3,  # km, JPL
        "j2": 0.0,
        "orientation_quat": [
            -0.7572824467695023,
            0.6152217280724471,
            0.14340098285830222,
            0.16571565779255987,
        ],
        # Rotational parameters (from pck00011.tpc):
        "pole_ra": [268.72, -0.009, 0.0],
        "pole_dec": [64.83, 0.003, 0.0],
        "pm": [259.51, 21.5710715, 0.0],
        "canonical_orbit": {
            "a": 1882709.0,
            "e": 0.007,
            "i": 0.192,
            "Omega": 298.848,  # deg, J2000, JPL
            "omega": 52.643,  # deg, J2000, JPL
            "M0": 52.643,  # deg, J2000, JPL
        },
    },
    {
        "id": 601,
        "name": "Mimas",
        "parent": 6,
        "streamed": True,
        "GM": 2.502,  # km^3/s^2, JPL
        "r_eq": 198.2,  # km, JPL
        "j2": 0.0,
        "orientation_quat": [
            0.9230995744431174,
            0.38212717482503544,
            0.019096998939105683,
            0.0387466457218241,
        ],
        # Rotational parameters (from pck00011.tpc):
        "pole_ra": [40.66, -0.036, 0.0],
        "pole_dec": [83.52, -0.004, 0.0],
        "pm": [333.46, 381.9945550, 0.0],
        "canonical_orbit": {
            "a": 185539.0,
            "e": 0.0196,
            "i": 1.574,
            "Omega": 66.2,
            "omega": 160.4,
            "M0": 275.3,
        },
    },
    {
        "id": 602,
        "name": "Enceladus",
        "parent": 6,
        "streamed": True,
        "GM": 7.210,  # km^3/s^2, JPL
        "r_eq": 252.1,  # km, JPL
        "j2": 0.0,
        "orientation_quat": [
            0.9288664636898875,
            0.36607751623426327,
            0.0263856632356688,
            0.049981411700848105,
        ],
        # Rotational parameters (from pck00011.tpc):
        "pole_ra": [40.66, -0.036, 0.0],
        "pole_dec": [83.52, -0.004, 0.0],
        "pm": [6.32, 262.7318996, 0.0],
        "canonical_orbit": {
            "a": 238042.0,
            "e": 0.0047,
            "i": 0.009,
            "Omega": 0.0,
            "omega": 119.5,
            "M0": 57.0,
        },
    },
    {
        "id": 603,
        "name": "Tethys",
        "parent": 6,
        "streamed": True,
        "GM": 41.21,  # km^3/s^2, JPL
        "r_eq": 531.1,  # km, JPL
        "j2": 0.0,
        "orientation_quat": [
            0.9318940517031924,
            0.3575191144733003,
            0.03662851343840426,
            0.04911121246444622,
        ],
        # Rotational parameters (from pck00011.tpc):
        "pole_ra": [40.66, -0.036, 0.0],
        "pole_dec": [83.52, -0.004, 0.0],
        "pm": [8.95, 190.6979085, 0.0],
        "canonical_orbit": {
            "a": 294672.0,
            "e": 0.0001,
            "i": 1.091,
            "Omega": 273.0,
            "omega": 335.3,
            "M0": 0.0,
        },
    },
    {
        "id": 604,
        "name": "Dione",
        "parent": 6,
        "streamed": True,
        "GM": 73.116,  # km^3/s^2, JPL
        "r_eq": 561.4,  # km, JPL
        "j2": 0.0,
        "orientation_quat": [
            0.8983481011005575,
            0.43563326836804733,
            0.022509571322388757,
            0.05184268452615175,
        ],
        # Rotational parameters (from pck00011.tpc):
        "pole_ra": [40.66, -0.036, 0.0],
        "pole_dec": [83.52, -0.004, 0.0],
        "pm": [357.6, 131.5349316, 0.0],
        "canonical_orbit": {
            "a": 377415.0,
            "e": 0.0022,
            "i": 0.028,
            "Omega": 0.0,
            "omega": 116.0,
            "M0": 212.0,
        },
    },
    {
        "id": 605,
        "name": "Rhea",
        "parent": 6,
        "streamed": True,
        "GM": 153.94,  # km^3/s^2, JPL
        "r_eq": 763.8,  # km, JPL
        "j2": 0.0,
        "orientation_quat": [
            0.04819756263171842,
            0.9970816099735007,
            -0.03548242614950518,
            0.04739467737582312,
        ],
        # Rotational parameters (from pck00011.tpc):
        "pole_ra": [40.38, -0.036, 0.0],
        "pole_dec": [83.55, -0.004, 0.0],
        "pm": [235.16, 79.6900478, 0.0],
        "canonical_orbit": {
            "a": 527108.0,
            "e": 0.001,
            "i": 0.345,
            "Omega": 133.7,
            "omega": 44.3,
            "M0": 31.5,
        },
    },
    {
        "id": 606,
        "name": "Titan",
        "parent": 6,
        "streamed": True,
        "GM": 8978.0,  # km^3/s^2, JPL
        "r_eq": 2574.7,  # km, JPL
        "j2": 0.0,
        "orientation_quat": [
            -0.3734396870113086,
            0.9258818003502802,
            -0.05035007964612972,
            0.027396376122554734,
        ],
        # Rotational parameters (from pck00011.tpc):
        "pole_ra": [39.4827, 0.0, 0.0],
        "pole_dec": [83.4279, 0.0, 0.0],
        "pm": [186.5855, 22.5769768, 0.0],
        "canonical_orbit": {
            "a": 1221870.0,
            "e": 0.0288,
            "i": 0.34854,
            "Omega": 78.6,
            "omega": 78.3,
            "M0": 11.7,
        },
    },
    {
        "id": 608,
        "name": "Iapetus",
        "parent": 6,
        "streamed": True,
        "GM": 120.5,  # km^3/s^2, JPL
        "r_eq": 734.5,  # km, JPL
        "j2": 0.0,
        "orientation_quat": [
            0.3662745576368781,
            0.9213433421007585,
            0.11660036388932458,
            0.05808398691026053,
        ],
        # Rotational parameters (from pck00011.tpc):
        "pole_ra": [318.16, -3.949, 0.0],
        "pole_dec": [75.03, -1.143, 0.0],
        "pm": [355.2, 4.5379572, 0.0],
        "canonical_orbit": {
            "a": 3560820.0,
            "e": 0.0283,
            "i": 15.47,
            "Omega": 86.5,
            "omega": 254.5,
            "M0": 74.8,
        },
    },
    {
        "id": 701,
        "name": "Ariel",
        "parent": 7,
        "streamed": True,
        "GM": 86.0,  # km^3/s^2, JPL
        "r_eq": 578.9,  # km, JPL
        "j2": 0.0,
        "orientation_quat": [
            0.5781932973945025,
            0.191729684226664,
            0.07649565212061894,
            -0.7893545808070397,
        ],
        # Rotational parameters (from pck00011.tpc):
        "pole_ra": [257.43, 0.0, 0.0],
        "pole_dec": [-15.10, 0.0, 0.0],
        "pm": [156.22, -142.8356681, 0.0],
        "canonical_orbit": {
            "a": 190900.0,
            "e": 0.001,
            "i": 0.0,
            "Omega": 0.0,  # deg, J2000, JPL
            "omega": 83.3,  # deg, J2000, JPL
            "M0": 119.8,  # deg, J2000, JPL
        },
    },
    {
        "id": 702,
        "name": "Umbriel",
        "parent": 7,
        "streamed": True,
        "GM": 81.5,  # km^3/s^2, JPL
        "r_eq": 584.7,  # km, JPL
        "j2": 0.0,
        "orientation_quat": [
            0.4501417420706476,
            0.4100905667125323,
            0.39181002197012754,
            -0.6896977931114213,
        ],
        # Rotational parameters (from pck00011.tpc):
        "pole_ra": [257.43, 0.0, 0.0],
        "pole_dec": [-15.10, 0.0, 0.0],
        "pm": [108.05, -86.8688923, 0.0],
        "canonical_orbit": {
            "a": 266000.0,
            "e": 0.004,
            "i": 0.1,
            "Omega": 195.5,  # deg, J2000, JPL
            "omega": 157.5,  # deg, J2000, JPL
            "M0": 258.3,  # deg, J2000, JPL
        },
    },
    {
        "id": 703,
        "name": "Titania",
        "parent": 7,
        "streamed": True,
        "GM": 228.2,  # km^3/s^2, JPL
        "r_eq": 788.9,  # km, JPL
        "j2": 0.0,
        "orientation_quat": [
            0.32791612117152835,
            0.5142453564688234,
            0.5585107863781351,
            -0.5622174244234606,
        ],
        # Rotational parameters (from pck00011.tpc):
        "pole_ra": [257.43, 0.0, 0.0],
        "pole_dec": [-15.10, 0.0, 0.0],
        "pm": [77.74, -41.3514316, 0.0],
        "canonical_orbit": {
            "a": 436300.0,
            "e": 0.001,
            "i": 0.1,
            "Omega": 26.4,  # deg, J2000, JPL
            "omega": 202.0,  # deg, J2000, JPL
            "M0": 53.2,  # deg, J2000, JPL
        },
    },
    {
        "id": 704,
        "name": "Oberon",
        "parent": 7,
        "streamed": True,
        "GM": 192.4,  # km^3/s^2, JPL
        "r_eq": 761.4,  # km, JPL
        "j2": 0.0,
        "orientation_quat": [
            -0.03179395978929699,
            0.6070279410001568,
            0.7826245002334988,
            -0.1341831382860504,
        ],
        # Rotational parameters (from pck00011.tpc):
        "pole_ra": [257.43, 0.0, 0.0],
        "pole_dec": [-15.10, 0.0, 0.0],
        "pm": [6.77, -26.7394932, 0.0],
        "canonical_orbit": {
            "a": 583400.0,
            "e": 0.001,
            "i": 0.1,
            "Omega": 30.5,  # deg, J2000, JPL
            "omega": 182.4,  # deg, J2000, JPL
            "M0": 139.7,  # deg, J2000, JPL
        },
    },
    {
        "id": 705,
        "name": "Miranda",
        "parent": 7,
        "streamed": True,
        "GM": 4.4,  # km^3/s^2, JPL
        "r_eq": 235.8,  # km, JPL
        "j2": 0.0,
        "orientation_quat": [
            0.1269439866585823,
            0.5885443922397523,
            0.7482859130952207,
            -0.27851196541193374,
        ],
        # Rotational parameters (from pck00011.tpc):
        "pole_ra": [257.43, 0.0, 0.0],
        "pole_dec": [-15.08, 0.0, 0.0],
        "pm": [30.70, -254.6906892, 0.0],
        "canonical_orbit": {
            "a": 129900.0,
            "e": 0.001,
            "i": 4.4,
            "Omega": 100.7,  # deg, J2000, JPL
            "omega": 155.6,  # deg, J2000, JPL
            "M0": 72.4,  # deg, J2000, JPL
        },
    },
    {
        "id": 801,
        "name": "Triton",
        "parent": 8,
        "streamed": True,
        "GM": 1427.6,  # km^3/s^2, JPL
        "r_eq": 1353.4,  # km, JPL
        "j2": 0.0,
        "orientation_quat": [
            -0.24357406144561938,
            0.78368286204414,
            0.39896516331806564,
            0.4090716890567964,
        ],
        # Rotational parameters (from pck00011.tpc):
        "pole_ra": [299.36, 0.0, 0.0],
        "pole_dec": [41.17, 0.0, 0.0],
        "pm": [296.53, -61.2572637, 0.0],
        "canonical_orbit": {
            "a": 354800.0,
            "e": 0.000,
            "i": 157.3,
            "Omega": 178.1,  # deg, J2000, JPL
            "omega": 0.0,  # deg, J2000, JPL
            "M0": 63.0,  # deg, J2000, JPL
        },
    },
    {
        "id": 802,
        "name": "Proteus",
        "parent": 8,
        "streamed": True,
        "GM": 0.105,  # km^3/s^2, JPL
        "r_eq": 210,  # km, JPL
        "j2": 0.0,
        "orientation_quat": [
            0.8027893751159789,
            0.4391895681536065,
            0.3416179806521816,
            -0.2143336131386546,
        ],
        "canonical_orbit": {
            "a": 117600.0,
            "e": 0.000,
            "i": 0.0,
            "Omega": 0.0,  # deg, J2000, JPL
            "omega": 0.0,  # deg, J2000, JPL
            "M0": 276.8,  # deg, J2000, JPL
        },
    },
    {
        "id": 803,
        "name": "Nereid",
        "parent": 8,
        "streamed": True,
        "GM": 0.021,  # km^3/s^2, JPL
        "r_eq": 170,  # km, JPL
        "j2": 0.0,
        "orientation_quat": [0.0, 0.0, 0.0, 1.0],
        # Rotational parameters (from pck00011.tpc):
        "pole_ra": [299.36, 0.0, 0.0],
        "pole_dec": [43.36, 0.0, 0.0],
        "pm": [254.06, 1222.8441209, 0.0],
        "canonical_orbit": {
            "a": 5513900.0,
            "e": 0.751,
            "i": 5.1,
            "Omega": 319.5,  # deg, J2000, JPL
            "omega": 296.8,  # deg, J2000, JPL
            "M0": 318.5,  # deg, J2000, JPL
        },
    },
    {
        "id": 901,
        "name": "Charon",
        "parent": 9,
        "streamed": True,
        "GM": 101.4,  # km^3/s^2, JPL
        "r_eq": 606.0,  # km, JPL
        "j2": 0.0,
        # Orientation quaternion from SPICE (2025-05-11T00:00:00), [w, x, y, z] order
        "orientation_quat": [0.7071, 0.0, 0.7071, 0.0],
        "canonical_orbit": {
            "a": 19591.4,  # km, mean distance
            "e": 0.000,
            "i": 96.145,  # deg, to Pluto's equator
            "Omega": 223.046,  # deg
            "omega": 0.0,  # deg
            "M0": 0.0,  # deg
        },
    },
    {
        "id": 902,
        "name": "Nix",
        "parent": 9,
        "streamed": True,
        "GM": 0.003,
        "r_eq": 25.0,  # km, JPL
        "j2": 0.0,
        # No SPICE orientation, fallback to identity
        "orientation_quat": [1.0, 0.0, 0.0, 0.0],
        "canonical_orbit": {
            "a": 48694.0,  # km, mean distance (JPL)
            "e": 0.002,
            "i": 96.2,  # deg, estimated
            "Omega": 223.1,  # deg, estimated
            "omega": 0.0,  # deg
            "M0": 0.0,  # deg
        },
    },
    {
        "id": 903,
        "name": "Hydra",
        "parent": 9,
        "streamed": True,
        "GM": 0.005,
        "r_eq": 32.5,  # km, JPL
        "j2": 0.0,
        # No SPICE orientation, fallback to identity
        "orientation_quat": [1.0, 0.0, 0.0, 0.0],
        "canonical_orbit": {
            "a": 64738.0,  # km, mean distance (JPL)
            "e": 0.005,
            "i": 96.4,  # deg, estimated
            "Omega": 223.2,  # deg, estimated
            "omega": 0.0,  # deg
            "M0": 0.0,  # deg
        },
    },
    {
        "id": 904,
        "name": "Kerberos",
        "parent": 9,
        "streamed": True,
        "GM": 0.001,
        "r_eq": 12.0,  # km, JPL
        "j2": 0.0,
        # No SPICE orientation, fallback to identity
        "orientation_quat": [1.0, 0.0, 0.0, 0.0],
        "canonical_orbit": {
            "a": 57783.0,  # km, mean distance (JPL)
            "e": 0.003,
            "i": 96.3,  # deg, estimated
            "Omega": 223.15,  # deg, estimated
            "omega": 0.0,  # deg
            "M0": 0.0,  # deg
        },
    },
    {
        "id": 905,
        "name": "Styx",
        "parent": 9,
        "streamed": True,
        "GM": 0.0005,
        "r_eq": 8.0,  # km, JPL
        "j2": 0.0,
        # No SPICE orientation, fallback to identity
        "orientation_quat": [1.0, 0.0, 0.0, 0.0],
        "canonical_orbit": {
            "a": 42656.0,  # km, mean distance (JPL)
            "e": 0.005,
            "i": 96.1,  # deg, estimated
            "Omega": 223.0,  # deg, estimated
            "omega": 0.0,  # deg
            "M0": 0.0,  # deg
        },
    },
    # Add more as needed
]

# Programmatically generate NAIF ID list and parent map
DEFAULT_BODIES = [
    body["id"]
    for body in SOLAR_SYSTEM_BODIES
    # Include all bodies with a parent and the Sun (id 10)
    if body.get("parent") is not None or body.get("id") == 10
]
PARENT_MAP = {
    body["id"]: body["parent"]
    for body in SOLAR_SYSTEM_BODIES
    if body["parent"] is not None
}

# List of required kernels for the above bodies
REQUIRED_KERNELS = [
    "naif0013.tls",  # Leapseconds
    "de440.bsp",  # Planetary ephemeris
    "pck00011_n006.tpc",  # Planetary constants (latest NAIF update)
    # "pck00011.tpc",  # (commented out: replaced by n006 version)
    "gm_de440.tpc",  # GM values
    "jup230.bsp",  # Jupiter system moons
    "plu058.bsp",  # Pluto/Charon
    "MAR097_030101_300101_V0001.BSP",  # Mars moons
    "saturn_majors_1900_2100.bsp",  # Saturn system (custom trimmed)
    # Add more as needed for physical bodies
]

SECONDS_PER_DAY = 86400.0
DEFAULT_EPOCH = "2025-05-11T00:00:00"
DEFAULT_DRAG_CUTOFF = 500e3  # meters

DEFAULT_FRAME = "ECLIPJ2000"
