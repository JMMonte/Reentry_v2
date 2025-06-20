# Astronomy Engine (JavaScript / TypeScript)

[![npm](https://img.shields.io/npm/v/astronomy-engine.svg)](https://www.npmjs.com/package/astronomy-engine)

This is the complete programming reference for the JavaScript version of Astronomy Engine. It supports client side programming in the browser, and backend use of [Node.js](https://nodejs.org/).

[Astronomy Engine is available as an npm package](https://www.npmjs.com/package/astronomy-engine).

Both the browser and backend versions of the JavaScript code are generated from [TypeScript](https://www.typescriptlang.org/) code in `astronomy.ts`, which is also provided here for those who want to use it directly.

Other programming languages are supported also. See the [home page](https://github.com/cosinekitty/astronomy) for more info.

---

## [](https://www.npmjs.com/package/astronomy-engine#quick-start)Quick Start

To use Astronomy Engine in your own project, you can use the TypeScript file `astronomy.ts` from this directory.

For convenience, this directory also contains human-readable JavaScript files `astronomy.js` and minified versions for the browser (`astronomy.browser.min.js`) and Node.js (`astronomy.min.js`). These JavaScript sources are all compiled from the TypeScript source `astronomy.ts`.

To get started quickly, here are some [browser scripting examples](https://github.com/cosinekitty/astronomy/demo/browser/) and some [Node.js examples](https://github.com/cosinekitty/astronomy/demo/nodejs/).

---

## [](https://www.npmjs.com/package/astronomy-engine#topic-index)Topic Index

### [](https://www.npmjs.com/package/astronomy-engine#position-of-sun-moon-and-planets)Position of Sun, Moon, and planets

| Function                                                                              | Description                                                                                          |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| [HelioVector](https://www.npmjs.com/package/astronomy-engine#HelioVector)             | Calculates body position vector with respect to the center of the Sun.                               |
| [GeoVector](https://www.npmjs.com/package/astronomy-engine#GeoVector)                 | Calculates body position vector with respect to the center of the Earth.                             |
| [Equator](https://www.npmjs.com/package/astronomy-engine#Equator)                     | Calculates right ascension and declination.                                                          |
| [Ecliptic](https://www.npmjs.com/package/astronomy-engine#Ecliptic)                   | Converts J2000 mean equator (EQJ) coordinates to true ecliptic of date (ECT) coordinates.            |
| [EclipticLongitude](https://www.npmjs.com/package/astronomy-engine#EclipticLongitude) | Calculates true ecliptic of date (ECT) longitude for a body.                                         |
| [Horizon](https://www.npmjs.com/package/astronomy-engine#Horizon)                     | Calculates horizontal coordinates (azimuth, altitude) for a given observer on the Earth.             |
| [PairLongitude](https://www.npmjs.com/package/astronomy-engine#PairLongitude)         | Calculates the difference in apparent ecliptic longitude between two bodies, as seen from the Earth. |
| [BaryState](https://www.npmjs.com/package/astronomy-engine#BaryState)                 | Calculates the barycentric position and velocity vectors of the Sun or a planet.                     |

### [](https://www.npmjs.com/package/astronomy-engine#geographic-helper-functions)Geographic helper functions

| Function                                                                        | Description                                                                             |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [ObserverVector](https://www.npmjs.com/package/astronomy-engine#ObserverVector) | Calculates a vector from the center of the Earth to an observer on the Earth's surface. |
| [VectorObserver](https://www.npmjs.com/package/astronomy-engine#VectorObserver) | Calculates the geographic coordinates for a geocentric equatorial vector.               |

### [](https://www.npmjs.com/package/astronomy-engine#rise-set-and-culmination-times)Rise, set, and culmination times

| Function                                                                          | Description                                                                                                                               |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| [SearchRiseSet](https://www.npmjs.com/package/astronomy-engine#SearchRiseSet)     | Finds time of rise or set for a body as seen by an observer on the Earth.                                                                 |
| [SearchAltitude](https://www.npmjs.com/package/astronomy-engine#SearchAltitude)   | Finds time when a body reaches a given altitude above or below the horizon. Useful for finding civil, nautical, or astronomical twilight. |
| [SearchHourAngle](https://www.npmjs.com/package/astronomy-engine#SearchHourAngle) | Finds when body reaches a given hour angle for an observer on the Earth. Hour angle = 0 finds culmination, the highest point in the sky.  |

### [](https://www.npmjs.com/package/astronomy-engine#moon-phases)Moon phases

| Function                                                                              | Description                                                                |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [MoonPhase](https://www.npmjs.com/package/astronomy-engine#MoonPhase)                 | Determines the Moon's phase expressed as an ecliptic longitude.            |
| [SearchMoonQuarter](https://www.npmjs.com/package/astronomy-engine#SearchMoonQuarter) | Find the first quarter moon phase after a given date and time.             |
| [NextMoonQuarter](https://www.npmjs.com/package/astronomy-engine#NextMoonQuarter)     | Find the next quarter moon phase after a previous one that has been found. |

### [](https://www.npmjs.com/package/astronomy-engine#eclipses-and-transits)Eclipses and Transits

| Function                                                                                            | Description                                                                                                  |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [SearchLunarEclipse](https://www.npmjs.com/package/astronomy-engine#SearchLunarEclipse)             | Search for the first lunar eclipse after a given date.                                                       |
| [NextLunarEclipse](https://www.npmjs.com/package/astronomy-engine#NextLunarEclipse)                 | Continue searching for more lunar eclipses.                                                                  |
| [SearchGlobalSolarEclipse](https://www.npmjs.com/package/astronomy-engine#SearchGlobalSolarEclipse) | Search for the first solar eclipse after a given date that is visible anywhere on the Earth.                 |
| [NextGlobalSolarEclipse](https://www.npmjs.com/package/astronomy-engine#NextGlobalSolarEclipse)     | Continue searching for solar eclipses visible anywhere on the Earth.                                         |
| [SearchLocalSolarEclipse](https://www.npmjs.com/package/astronomy-engine#SearchLocalSolarEclipse)   | Search for the first solar eclipse after a given date that is visible at a particular location on the Earth. |
| [NextLocalSolarEclipse](https://www.npmjs.com/package/astronomy-engine#NextLocalSolarEclipse)       | Continue searching for solar eclipses visible at a particular location on the Earth.                         |
| [SearchTransit](https://www.npmjs.com/package/astronomy-engine#SearchTransit)                       | Search for the next transit of Mercury or Venus.                                                             |
| [NextTransit](https://www.npmjs.com/package/astronomy-engine#NextTransit)                           | Continue searching for transits of Mercury or Venus.                                                         |

### [](https://www.npmjs.com/package/astronomy-engine#lunar-perigee-and-apogee)Lunar perigee and apogee

| Function                                                                            | Description                                                                |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [SearchLunarApsis](https://www.npmjs.com/package/astronomy-engine#SearchLunarApsis) | Finds the next perigee or apogee of the Moon after a specified date.       |
| [NextLunarApsis](https://www.npmjs.com/package/astronomy-engine#NextLunarApsis)     | Given an already-found apsis, find the next perigee or apogee of the Moon. |

### [](https://www.npmjs.com/package/astronomy-engine#planet-perihelion-and-aphelion)Planet perihelion and aphelion

| Function                                                                              | Description                                                                     |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [SearchPlanetApsis](https://www.npmjs.com/package/astronomy-engine#SearchPlanetApsis) | Finds the next perihelion or aphelion of a planet after a specified date.       |
| [NextPlanetApsis](https://www.npmjs.com/package/astronomy-engine#NextPlanetApsis)     | Given an already-found apsis, find the next perihelion or aphelion of a planet. |

### [](https://www.npmjs.com/package/astronomy-engine#visual-magnitude-and-elongation)Visual magnitude and elongation

| Function                                                                                  | Description                                                                                           |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [Illumination](https://www.npmjs.com/package/astronomy-engine#Illumination)               | Calculates visual magnitude and phase angle of bodies as seen from the Earth.                         |
| [SearchPeakMagnitude](https://www.npmjs.com/package/astronomy-engine#SearchPeakMagnitude) | Searches for the date and time Venus will next appear brightest as seen from the Earth.               |
| [AngleFromSun](https://www.npmjs.com/package/astronomy-engine#AngleFromSun)               | Returns full angle seen from Earth between body and Sun.                                              |
| [Elongation](https://www.npmjs.com/package/astronomy-engine#Elongation)                   | Calculates ecliptic longitude angle between a body and the Sun, as seen from the Earth.               |
| [SearchMaxElongation](https://www.npmjs.com/package/astronomy-engine#SearchMaxElongation) | Searches for the next maximum elongation event for Mercury or Venus that occurs after the given date. |

### [](https://www.npmjs.com/package/astronomy-engine#oppositions-and-conjunctions)Oppositions and conjunctions

| Function                                                                                          | Description                                   |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| [SearchRelativeLongitude](https://www.npmjs.com/package/astronomy-engine#SearchRelativeLongitude) | Find oppositions and conjunctions of planets. |

### [](https://www.npmjs.com/package/astronomy-engine#equinoxes-and-solstices)Equinoxes and solstices

| Function                                                                  | Description                                                                                   |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [Seasons](https://www.npmjs.com/package/astronomy-engine#Seasons)         | Finds the equinoxes and solstices for a given calendar year.                                  |
| [SunPosition](https://www.npmjs.com/package/astronomy-engine#SunPosition) | Calculates the Sun's apparent true ecliptic of date (ECT) coordinates as seen from the Earth. |

### [](https://www.npmjs.com/package/astronomy-engine#coordinate-transforms)Coordinate transforms

The following orientation systems are supported. Astronomy Engine can convert a vector from any of these orientations to any of the others. It also allows converting from a vector to spherical (angular) coordinates and back, within a given orientation. Note the 3-letter codes for each of the orientation systems; these are used in function and type names.

- **EQJ = J2000 Mean Equator**: Uses the Earth's mean equator (corrected for precession but ignoring nutation) on January 1, 2000, at noon UTC. This moment in time is called J2000.
- **EQD = True Equator of Date**: Uses the Earth's equator on a given date and time, adjusted for precession and nutation.
- **ECL = J2000 Mean Ecliptic**: Uses the plane of the Earth's orbit around the Sun at J2000. The x-axis is referenced against the J2000 mean equinox.
- **ECT = True Ecliptic of Date**: Uses the true (corrected for precession and nutation) orbital plane of the Earth on the given date. The x-axis is referenced against the true equinox for that date.
- **HOR = Horizontal**: Uses the viewpoint of an observer at a specific location on the Earth at a given date and time.
- **GAL = Galactic**: Based on the IAU 1958 definition of galactic coordinates.

| Function                                                                              | Description                                                                                          |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| [RotateVector](https://www.npmjs.com/package/astronomy-engine#RotateVector)           | Applies a rotation matrix to a vector, yielding a vector in another orientation system.              |
| [InverseRotation](https://www.npmjs.com/package/astronomy-engine#InverseRotation)     | Given a rotation matrix, finds the inverse rotation matrix that does the opposite transformation.    |
| [CombineRotation](https://www.npmjs.com/package/astronomy-engine#CombineRotation)     | Given two rotation matrices, returns a rotation matrix that combines them into a net transformation. |
| [IdentityMatrix](https://www.npmjs.com/package/astronomy-engine#IdentityMatrix)       | Returns a 3x3 identity matrix, which can be used to form other rotation matrices.                    |
| [Pivot](https://www.npmjs.com/package/astronomy-engine#Pivot)                         | Transforms a rotation matrix by pivoting it around a given axis by a given angle.                    |
| [VectorFromSphere](https://www.npmjs.com/package/astronomy-engine#VectorFromSphere)   | Converts spherical coordinates to Cartesian coordinates.                                             |
| [SphereFromVector](https://www.npmjs.com/package/astronomy-engine#SphereFromVector)   | Converts Cartesian coordinates to spherical coordinates.                                             |
| [EquatorFromVector](https://www.npmjs.com/package/astronomy-engine#EquatorFromVector) | Given an equatorial vector, calculates equatorial angular coordinates.                               |
| [VectorFromHorizon](https://www.npmjs.com/package/astronomy-engine#VectorFromHorizon) | Given apparent angular horizontal coordinates, calculates horizontal vector.                         |
| [HorizonFromVector](https://www.npmjs.com/package/astronomy-engine#HorizonFromVector) | Given a vector in horizontal orientation, calculates horizontal angular coordinates.                 |
| [Rotation_EQD_EQJ](https://www.npmjs.com/package/astronomy-engine#Rotation_EQD_EQJ)   | Calculates a rotation matrix from true equator of date (EQD) to J2000 mean equator (EQJ).            |
| [Rotation_EQD_ECT](https://www.npmjs.com/package/astronomy-engine#Rotation_EQD_ECT)   | Calculates a rotation matrix from true equator of date (EQD) to true ecliptic of date (ECT).         |
| [Rotation_EQD_ECL](https://www.npmjs.com/package/astronomy-engine#Rotation_EQD_ECL)   | Calculates a rotation matrix from true equator of date (EQD) to J2000 mean ecliptic (ECL).           |
| [Rotation_EQD_HOR](https://www.npmjs.com/package/astronomy-engine#Rotation_EQD_HOR)   | Calculates a rotation matrix from true equator of date (EQD) to horizontal (HOR).                    |
| [Rotation_EQJ_EQD](https://www.npmjs.com/package/astronomy-engine#Rotation_EQJ_EQD)   | Calculates a rotation matrix from J2000 mean equator (EQJ) to true equator of date (EQD).            |
| [Rotation_EQJ_ECT](https://www.npmjs.com/package/astronomy-engine#Rotation_EQJ_ECT)   | Calculates a rotation matrix from J2000 mean equator (EQJ) to true ecliptic of date (ECT).           |
| [Rotation_EQJ_ECL](https://www.npmjs.com/package/astronomy-engine#Rotation_EQJ_ECL)   | Calculates a rotation matrix from J2000 mean equator (EQJ) to J2000 mean ecliptic (ECL).             |
| [Rotation_EQJ_HOR](https://www.npmjs.com/package/astronomy-engine#Rotation_EQJ_HOR)   | Calculates a rotation matrix from J2000 mean equator (EQJ) to horizontal (HOR).                      |
| [Rotation_ECT_EQD](https://www.npmjs.com/package/astronomy-engine#Rotation_ECT_EQD)   | Calculates a rotation matrix from true ecliptic of date (ECT) to true equator of date (EQD).         |
| [Rotation_ECT_EQJ](https://www.npmjs.com/package/astronomy-engine#Rotation_ECT_EQJ)   | Calculates a rotation matrix from true ecliptic of date (ECT) J2000 mean equator (EQJ).              |
| [Rotation_ECL_EQD](https://www.npmjs.com/package/astronomy-engine#Rotation_ECL_EQD)   | Calculates a rotation matrix from J2000 mean ecliptic (ECL) to true equator of date (EQD).           |
| [Rotation_ECL_EQJ](https://www.npmjs.com/package/astronomy-engine#Rotation_ECL_EQJ)   | Calculates a rotation matrix from J2000 mean ecliptic (ECL) to J2000 mean equator (EQJ).             |
| [Rotation_ECL_HOR](https://www.npmjs.com/package/astronomy-engine#Rotation_ECL_HOR)   | Calculates a rotation matrix from J2000 mean ecliptic (ECL) to horizontal (HOR).                     |
| [Rotation_HOR_EQD](https://www.npmjs.com/package/astronomy-engine#Rotation_HOR_EQD)   | Calculates a rotation matrix from horizontal (HOR) to true equator of date (EQD).                    |
| [Rotation_HOR_EQJ](https://www.npmjs.com/package/astronomy-engine#Rotation_HOR_EQJ)   | Calculates a rotation matrix from horizontal (HOR) to J2000 mean equator (EQJ).                      |
| [Rotation_HOR_ECL](https://www.npmjs.com/package/astronomy-engine#Rotation_HOR_ECL)   | Calculates a rotation matrix from horizontal (HOR) to J2000 mean ecliptic (ECL).                     |
| [Rotation_EQJ_GAL](https://www.npmjs.com/package/astronomy-engine#Rotation_EQJ_GAL)   | Calculates a rotation matrix from J2000 mean equator (EQJ) to galactic (GAL).                        |
| [Rotation_GAL_EQJ](https://www.npmjs.com/package/astronomy-engine#Rotation_GAL_EQJ)   | Calculates a rotation matrix from galactic (GAL) to J2000 mean equator (EQJ).                        |

### [](https://www.npmjs.com/package/astronomy-engine#gravitational-simulation-of-small-bodies)Gravitational simulation of small bodies

Astronomy Engine provides a [GravitySimulator](https://www.npmjs.com/package/astronomy-engine#GravitySimulator) class that allows you to model the trajectories of one or more small bodies like asteroids, comets, or coasting spacecraft. If you know an initial position vector and velocity vector for a small body, the gravity simulator can incrementally simulate the pull of gravity on it from the Sun and planets, to calculate its movement through the Solar System.

---

## [](https://www.npmjs.com/package/astronomy-engine#api-reference)API Reference

## [](https://www.npmjs.com/package/astronomy-engine#astrotime)AstroTime

**Kind**: global class  
**Brief**: The date and time of an astronomical observation.

Objects of type `AstroTime` are used throughout the internals of the Astronomy library, and are included in certain return objects. Use the constructor or the [MakeTime](https://www.npmjs.com/package/astronomy-engine#MakeTime) function to create an `AstroTime` object.  
**Properties**

| Name | Type     | Description                                                                                                                                                                                                                                                                                                                              |
| ---- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| date | `Date`   | The JavaScript Date object for the given date and time. This Date corresponds to the numeric day value stored in the `ut` property.                                                                                                                                                                                                      |
| ut   | `number` | Universal Time (UT1/UTC) in fractional days since the J2000 epoch. Universal Time represents time measured with respect to the Earth's rotation, tracking mean solar days. The Astronomy library approximates UT1 and UTC as being the same thing. This gives sufficient accuracy for the precision requirements of this project.        |
| tt   | `number` | Terrestrial Time in fractional days since the J2000 epoch. TT represents a continuously flowing ephemeris timescale independent of any variations of the Earth's rotation, and is adjusted from UT using a best-fit piecewise polynomial model devised by [Espenak and Meeus](https://eclipse.gsfc.nasa.gov/SEhelp/deltatpoly2004.html). |

---

### [](https://www.npmjs.com/package/astronomy-engine#new-astrotimedate)new AstroTime(date)

| Param | Type                                                                                  | Description                                                                                         |
| ----- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| date  | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | A JavaScript Date object, a numeric UTC value expressed in J2000 days, or another AstroTime object. |

---

### [](https://www.npmjs.com/package/astronomy-engine#astrotimetostring--string)astroTime.toString() ⇒ `string`

Formats an `AstroTime` object as an [ISO 8601](https://en.wikipedia.org/wiki/ISO_8601) date/time string in UTC, to millisecond resolution. Example: `2018-08-17T17:22:04.050Z`

**Kind**: instance method of [`AstroTime`](https://www.npmjs.com/package/astronomy-engine#AstroTime)

---

### [](https://www.npmjs.com/package/astronomy-engine#astrotimeadddaysdays--astrotime)astroTime.AddDays(days) ⇒ [`AstroTime`](https://www.npmjs.com/package/astronomy-engine#AstroTime)

Returns a new `AstroTime` object adjusted by the floating point number of days. Does NOT modify the original `AstroTime` object.

**Kind**: instance method of [`AstroTime`](https://www.npmjs.com/package/astronomy-engine#AstroTime)

| Param | Type     | Description                                                                                                                                                                           |
| ----- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| days  | `number` | The floating point number of days by which to adjust the given date and time. Positive values adjust the date toward the future, and negative values adjust the date toward the past. |

---

### [](https://www.npmjs.com/package/astronomy-engine#astrotimefromterrestrialtimett--astrotime)AstroTime.FromTerrestrialTime(tt) ⇒ [`AstroTime`](https://www.npmjs.com/package/astronomy-engine#AstroTime)

**Kind**: static method of [`AstroTime`](https://www.npmjs.com/package/astronomy-engine#AstroTime)  
**Returns**: [`AstroTime`](https://www.npmjs.com/package/astronomy-engine#AstroTime) - An `AstroTime` object for the specified terrestrial time.  
**Brief**: Creates an `AstroTime` value from a Terrestrial Time (TT) day value.

This function can be used in rare cases where a time must be based on Terrestrial Time (TT) rather than Universal Time (UT). Most developers will want to invoke `new AstroTime(ut)` with a universal time instead of this function, because usually time is based on civil time adjusted by leap seconds to match the Earth's rotation, rather than the uniformly flowing TT used to calculate solar system dynamics. In rare cases where the caller already knows TT, this function is provided to create an `AstroTime` value that can be passed to Astronomy Engine functions.

| Param | Type     | Description                                                                |
| ----- | -------- | -------------------------------------------------------------------------- |
| tt    | `number` | The number of days since the J2000 epoch as expressed in Terrestrial Time. |

---

## [](https://www.npmjs.com/package/astronomy-engine#librationinfo)LibrationInfo

**Kind**: global class  
**Brief**: Lunar libration angles, returned by [Libration](https://www.npmjs.com/package/astronomy-engine#Libration).  
**Properties**

| Name     | Type     | Description                                                                                  |
| -------- | -------- | -------------------------------------------------------------------------------------------- |
| elat     | `number` | Sub-Earth libration ecliptic latitude angle, in degrees.                                     |
| elon     | `number` | Sub-Earth libration ecliptic longitude angle, in degrees.                                    |
| mlat     | `number` | Moon's geocentric ecliptic latitude, in degrees.                                             |
| mlon     | `number` | Moon's geocentric ecliptic longitude, in degrees.                                            |
| dist_km  | `number` | Distance between the centers of the Earth and Moon in kilometers.                            |
| diam_deg | `number` | The apparent angular diameter of the Moon, in degrees, as seen from the center of the Earth. |

---

## [](https://www.npmjs.com/package/astronomy-engine#vector)Vector

**Kind**: global class  
**Brief**: A 3D Cartesian vector with a time attached to it.

Holds the Cartesian coordinates of a vector in 3D space, along with the time at which the vector is valid.  
**Properties**

| Name | Type                                                                    | Description                                            |
| ---- | ----------------------------------------------------------------------- | ------------------------------------------------------ |
| x    | `number`                                                                | The x-coordinate expressed in astronomical units (AU). |
| y    | `number`                                                                | The y-coordinate expressed in astronomical units (AU). |
| z    | `number`                                                                | The z-coordinate expressed in astronomical units (AU). |
| t    | [`AstroTime`](https://www.npmjs.com/package/astronomy-engine#AstroTime) | The time at which the vector is valid.                 |

---

### [](https://www.npmjs.com/package/astronomy-engine#vectorlength--number)vector.Length() ⇒ `number`

Returns the length of the vector in astronomical units (AU).

**Kind**: instance method of [`Vector`](https://www.npmjs.com/package/astronomy-engine#Vector)

---

## [](https://www.npmjs.com/package/astronomy-engine#statevector)StateVector

**Kind**: global class  
**Brief**: A combination of a position vector, a velocity vector, and a time.

Holds the state vector of a body at a given time, including its position, velocity, and the time they are valid.  
**Properties**

| Name | Type                                                                    | Description                                                     |
| ---- | ----------------------------------------------------------------------- | --------------------------------------------------------------- |
| x    | `number`                                                                | The position x-coordinate expressed in astronomical units (AU). |
| y    | `number`                                                                | The position y-coordinate expressed in astronomical units (AU). |
| z    | `number`                                                                | The position z-coordinate expressed in astronomical units (AU). |
| vx   | `number`                                                                | The velocity x-coordinate expressed in AU/day.                  |
| vy   | `number`                                                                | The velocity y-coordinate expressed in AU/day.                  |
| vz   | `number`                                                                | The velocity z-coordinate expressed in AU/day.                  |
| t    | [`AstroTime`](https://www.npmjs.com/package/astronomy-engine#AstroTime) | The time at which the vector is valid.                          |

---

## [](https://www.npmjs.com/package/astronomy-engine#spherical)Spherical

**Kind**: global class  
**Brief**: Holds spherical coordinates: latitude, longitude, distance.

Spherical coordinates represent the location of a point using two angles and a distance.  
**Properties**

| Name | Type     | Description                           |
| ---- | -------- | ------------------------------------- |
| lat  | `number` | The latitude angle: -90..+90 degrees. |
| lon  | `number` | The longitude angle: 0..360 degrees.  |
| dist | `number` | Distance in AU.                       |

---

## [](https://www.npmjs.com/package/astronomy-engine#equatorialcoordinates)EquatorialCoordinates

**Kind**: global class  
**Brief**: Holds right ascension, declination, and distance of a celestial object.  
**Properties**

| Name | Type                                                              | Description                                                                                                                                               |
| ---- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ra   | `number`                                                          | Right ascension in sidereal hours: \[0, 24).                                                                                                              |
| dec  | `number`                                                          | Declination in degrees: \[-90, +90\].                                                                                                                     |
| dist | `number`                                                          | Distance to the celestial object expressed in [astronomical units](https://en.wikipedia.org/wiki/Astronomical_unit) (AU).                                 |
| vec  | [`Vector`](https://www.npmjs.com/package/astronomy-engine#Vector) | The equatorial coordinates in cartesian form, using AU distance units. x = direction of the March equinox, y = direction of the June solstice, z = north. |

---

## [](https://www.npmjs.com/package/astronomy-engine#rotationmatrix)RotationMatrix

**Kind**: global class  
**Brief**: Contains a rotation matrix that can be used to transform one coordinate system to another.  
**Properties**

| Name | Type                     | Description                                                                                                               |
| ---- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| rot  | `Array.<Array.<number>>` | A normalized 3x3 rotation matrix. For example, the identity matrix is represented as `[[1, 0, 0], [0, 1, 0], [0, 0, 1]]`. |

---

## [](https://www.npmjs.com/package/astronomy-engine#horizontalcoordinates)HorizontalCoordinates

**Kind**: global class  
**Brief**: Represents the location of an object seen by an observer on the Earth.

Holds azimuth (compass direction) and altitude (angle above/below the horizon) of a celestial object as seen by an observer at a particular location on the Earth's surface. Also holds right ascension and declination of the same object. All of these coordinates are optionally adjusted for atmospheric refraction; therefore the right ascension and declination values may not exactly match those found inside a corresponding [EquatorialCoordinates](https://www.npmjs.com/package/astronomy-engine#EquatorialCoordinates) object.  
**Properties**

| Name     | Type     | Description                                                                                                                                                                                               |
| -------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| azimuth  | `number` | A horizontal compass direction angle in degrees measured starting at north and increasing positively toward the east. The value is in the range \[0, 360). North = 0, east = 90, south = 180, west = 270. |
| altitude | `number` | A vertical angle in degrees above (positive) or below (negative) the horizon. The value is in the range \[-90, +90\]. The altitude angle is optionally adjusted upward due to atmospheric refraction.     |
| ra       | `number` | The right ascension of the celestial body in sidereal hours. The value is in the reange \[0, 24). If `altitude` was adjusted for atmospheric reaction, `ra` is likewise adjusted.                         |
| dec      | `number` | The declination of of the celestial body in degrees. The value in the range \[-90, +90\]. If `altitude` was adjusted for atmospheric reaction, `dec` is likewise adjusted.                                |

---

## [](https://www.npmjs.com/package/astronomy-engine#eclipticcoordinates)EclipticCoordinates

**Kind**: global class  
**Brief**: Ecliptic coordinates of a celestial body.

The origin and date of the coordinate system may vary depending on the caller's usage. In general, ecliptic coordinates are measured with respect to the mean plane of the Earth's orbit around the Sun. Includes Cartesian coordinates `(ex, ey, ez)` measured in [astronomical units](https://en.wikipedia.org/wiki/Astronomical_unit) (AU) and spherical coordinates `(elon, elat)` measured in degrees.  
**Properties**

| Name | Type                                                              | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| vec  | [`Vector`](https://www.npmjs.com/package/astronomy-engine#Vector) | Ecliptic cartesian vector with components measured in astronomical units (AU). The x-axis is within the ecliptic plane and is oriented in the direction of the [equinox](<https://en.wikipedia.org/wiki/Equinox_(celestial_coordinates)>). The y-axis is within the ecliptic plane and is oriented 90 degrees counterclockwise from the equinox, as seen from above the Sun's north pole. The z-axis is oriented perpendicular to the ecliptic plane, along the direction of the Sun's north pole. |
| elat | `number`                                                          | The ecliptic latitude of the body in degrees. This is the angle north or south of the ecliptic plane. The value is in the range \[-90, +90\]. Positive values are north and negative values are south.                                                                                                                                                                                                                                                                                             |
| elon | `number`                                                          | The ecliptic longitude of the body in degrees. This is the angle measured counterclockwise around the ecliptic plane, as seen from above the Sun's north pole. This is the same direction that the Earth orbits around the Sun. The angle is measured starting at 0 from the equinox and increases up to 360 degrees.                                                                                                                                                                              |

---

## [](https://www.npmjs.com/package/astronomy-engine#observer)Observer

**Kind**: global class  
**Brief**: Represents the geographic location of an observer on the surface of the Earth.  
**Properties**

| Name      | Type     | Description                                                                                                                                                                                                                                                         |
| --------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| latitude  | `number` | The observer's geographic latitude in degrees north of the Earth's equator. The value is negative for observers south of the equator. Must be in the range -90 to +90.                                                                                              |
| longitude | `number` | The observer's geographic longitude in degrees east of the prime meridian passing through Greenwich, England. The value is negative for observers west of the prime meridian. The value should be kept in the range -180 to +180 to minimize floating point errors. |
| height    | `number` | The observer's elevation above mean sea level, expressed in meters.                                                                                                                                                                                                 |

---

## [](https://www.npmjs.com/package/astronomy-engine#jupitermoonsinfo)JupiterMoonsInfo

**Kind**: global class  
**Brief**: Holds the positions and velocities of Jupiter's major 4 moons.

The [JupiterMoons](https://www.npmjs.com/package/astronomy-engine#JupiterMoons) function returns an object of this type to report position and velocity vectors for Jupiter's largest 4 moons Io, Europa, Ganymede, and Callisto. Each position vector is relative to the center of Jupiter. Both position and velocity are oriented in the EQJ system (that is, using Earth's equator at the J2000 epoch). The positions are expressed in astronomical units (AU), and the velocities in AU/day.  
**Properties**

| Name     | Type                                                                        | Description                                           |
| -------- | --------------------------------------------------------------------------- | ----------------------------------------------------- |
| io       | [`StateVector`](https://www.npmjs.com/package/astronomy-engine#StateVector) | The position and velocity of Jupiter's moon Io.       |
| europa   | [`StateVector`](https://www.npmjs.com/package/astronomy-engine#StateVector) | The position and velocity of Jupiter's moon Europa.   |
| ganymede | [`StateVector`](https://www.npmjs.com/package/astronomy-engine#StateVector) | The position and velocity of Jupiter's moon Ganymede. |
| callisto | [`StateVector`](https://www.npmjs.com/package/astronomy-engine#StateVector) | The position and velocity of Jupiter's moon Callisto. |

---

## [](https://www.npmjs.com/package/astronomy-engine#illuminationinfo)IlluminationInfo

**Kind**: global class  
**Brief**: Information about the apparent brightness and sunlit phase of a celestial object.  
**Properties**

| Name           | Type                                                                    | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| time           | [`AstroTime`](https://www.npmjs.com/package/astronomy-engine#AstroTime) | The date and time pertaining to the other calculated values in this object.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| mag            | `number`                                                                | The [apparent visual magnitude](https://en.wikipedia.org/wiki/Apparent_magnitude) of the celestial body.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| phase_angle    | `number`                                                                | The angle in degrees as seen from the center of the celestial body between the Sun and the Earth. The value is always in the range 0 to 180. The phase angle provides a measure of what fraction of the body's face appears illuminated by the Sun as seen from the Earth. When the observed body is the Sun, the `phase` property is set to 0, although this has no physical meaning because the Sun emits, rather than reflects, light. When the phase is near 0 degrees, the body appears "full". When it is 90 degrees, the body appears "half full". And when it is 180 degrees, the body appears "new" and is very difficult to see because it is both dim and lost in the Sun's glare as seen from the Earth. |
| phase_fraction | `number`                                                                | The fraction of the body's face that is illuminated by the Sun, as seen from the Earth. Calculated from `phase_angle` for convenience. This value ranges from 0 to 1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| helio_dist     | `number`                                                                | The distance between the center of the Sun and the center of the body in [astronomical units](https://en.wikipedia.org/wiki/Astronomical_unit) (AU).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| geo_dist       | `number`                                                                | The distance between the center of the Earth and the center of the body in AU.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| gc             | [`Vector`](https://www.npmjs.com/package/astronomy-engine#Vector)       | Geocentric coordinates: the 3D vector from the center of the Earth to the center of the body. The components are in expressed in AU and are oriented with respect to the J2000 equatorial plane.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| hc             | [`Vector`](https://www.npmjs.com/package/astronomy-engine#Vector)       | Heliocentric coordinates: The 3D vector from the center of the Sun to the center of the body. Like `gc`, `hc` is expressed in AU and oriented with respect to the J2000 equatorial plane.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ring_tilt      | `number`                                                                | `undefined`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | For Saturn, this is the angular tilt of the planet's rings in degrees away from the line of sight from the Earth. When the value is near 0, the rings appear edge-on from the Earth and are therefore difficult to see. When `ring_tilt` approaches its maximum value (about 27 degrees), the rings appear widest and brightest from the Earth. Unlike the [JPL Horizons](https://ssd.jpl.nasa.gov/horizons.cgi) online tool, this library includes the effect of the ring tilt angle in the calculated value for Saturn's visual magnitude. For all bodies other than Saturn, the value of `ring_tilt` is `undefined`. |

---

## [](https://www.npmjs.com/package/astronomy-engine#moonquarter)MoonQuarter

**Kind**: global class  
**Brief**: A quarter lunar phase, along with when it occurs.  
**Properties**

| Name    | Type                                                                    | Description                                                                               |
| ------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| quarter | `number`                                                                | An integer as follows: 0 = new moon, 1 = first quarter, 2 = full moon, 3 = third quarter. |
| time    | [`AstroTime`](https://www.npmjs.com/package/astronomy-engine#AstroTime) | The date and time of the quarter lunar phase.                                             |

---

## [](https://www.npmjs.com/package/astronomy-engine#atmosphereinfo)AtmosphereInfo

**Kind**: global class  
**Brief**: Information about idealized atmospheric variables at a given elevation.  
**Properties**

| Name        | Type     | Description                                |
| ----------- | -------- | ------------------------------------------ |
| pressure    | `number` | Atmospheric pressure in pascals.           |
| temperature | `number` | Atmospheric temperature in kelvins.        |
| density     | `number` | Atmospheric density relative to sea level. |

---

## [](https://www.npmjs.com/package/astronomy-engine#hourangleevent)HourAngleEvent

**Kind**: global class  
**Brief**: Horizontal position of a body upon reaching an hour angle.

Returns information about an occurrence of a celestial body reaching a given hour angle as seen by an observer at a given location on the surface of the Earth.  
**Properties**

| Name | Type                                                                                            | Description                                                                                   |
| ---- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| time | [`AstroTime`](https://www.npmjs.com/package/astronomy-engine#AstroTime)                         | The date and time of the celestial body reaching the hour angle.                              |
| hor  | [`HorizontalCoordinates`](https://www.npmjs.com/package/astronomy-engine#HorizontalCoordinates) | Topocentric horizontal coordinates for the body at the time indicated by the `time` property. |

---

## [](https://www.npmjs.com/package/astronomy-engine#seasoninfo)SeasonInfo

**Kind**: global class  
**Brief**: When the seasons change for a given calendar year.

Represents the dates and times of the two solstices and the two equinoxes in a given calendar year. These four events define the changing of the seasons on the Earth.  
**Properties**

| Name         | Type                                                                    | Description                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------ | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| mar_equinox  | [`AstroTime`](https://www.npmjs.com/package/astronomy-engine#AstroTime) | The date and time of the March equinox in the given calendar year. This is the moment in March that the plane of the Earth's equator passes through the center of the Sun; thus the Sun's declination changes from a negative number to a positive number. The March equinox defines the beginning of spring in the northern hemisphere and the beginning of autumn in the southern hemisphere.             |
| jun_solstice | [`AstroTime`](https://www.npmjs.com/package/astronomy-engine#AstroTime) | The date and time of the June solstice in the given calendar year. This is the moment in June that the Sun reaches its most positive declination value. At this moment the Earth's north pole is most tilted most toward the Sun. The June solstice defines the beginning of summer in the northern hemisphere and the beginning of winter in the southern hemisphere.                                      |
| sep_equinox  | [`AstroTime`](https://www.npmjs.com/package/astronomy-engine#AstroTime) | The date and time of the September equinox in the given calendar year. This is the moment in September that the plane of the Earth's equator passes through the center of the Sun; thus the Sun's declination changes from a positive number to a negative number. The September equinox defines the beginning of autumn in the northern hemisphere and the beginning of spring in the southern hemisphere. |
| dec_solstice | [`AstroTime`](https://www.npmjs.com/package/astronomy-engine#AstroTime) | The date and time of the December solstice in the given calendar year. This is the moment in December that the Sun reaches its most negative declination value. At this moment the Earth's south pole is tilted most toward the Sun. The December solstice defines the beginning of winter in the northern hemisphere and the beginning of summer in the southern hemisphere.                               |

---

## [](https://www.npmjs.com/package/astronomy-engine#elongationevent)ElongationEvent

**Kind**: global class  
**Brief**: The viewing conditions of a body relative to the Sun.

Represents the angular separation of a body from the Sun as seen from the Earth and the relative ecliptic longitudes between that body and the Earth as seen from the Sun.  
**See**: [Elongation](https://www.npmjs.com/package/astronomy-engine#Elongation)  
**Properties**

| Name                | Type                                                                    | Description                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| time                | [`AstroTime`](https://www.npmjs.com/package/astronomy-engine#AstroTime) | The date and time of the observation.                                                                                                                                                                                                                                                                                                                                                         |
| visibility          | `string`                                                                | Either `"morning"` or `"evening"`, indicating when the body is most easily seen.                                                                                                                                                                                                                                                                                                              |
| elongation          | `number`                                                                | The angle in degrees, as seen from the center of the Earth, of the apparent separation between the body and the Sun. This angle is measured in 3D space and is not projected onto the ecliptic plane. When `elongation` is less than a few degrees, the body is very difficult to see from the Earth because it is lost in the Sun's glare. The elongation is always in the range \[0, 180\]. |
| ecliptic_separation | `number`                                                                | The absolute value of the difference between the body's ecliptic longitude and the Sun's ecliptic longitude, both as seen from the center of the Earth. This angle measures around the plane of the Earth's orbit (the ecliptic), and ignores how far above or below that plane the body is. The ecliptic separation is measured in degrees and is always in the range \[0, 180\].            |

---

## [](https://www.npmjs.com/package/astronomy-engine#apsis)Apsis

**Kind**: global class  
**Brief**: A closest or farthest point in a body's orbit around its primary.

For a planet orbiting the Sun, apsis is a perihelion or aphelion, respectively. For the Moon orbiting the Earth, apsis is a perigee or apogee, respectively.  
**See**

- [SearchLunarApsis](https://www.npmjs.com/package/astronomy-engine#SearchLunarApsis)
- [NextLunarApsis](https://www.npmjs.com/package/astronomy-engine#NextLunarApsis)
- [SearchPlanetApsis](https://www.npmjs.com/package/astronomy-engine#SearchPlanetApsis)
- [NextPlanetApsis](https://www.npmjs.com/package/astronomy-engine#NextPlanetApsis)

Properties:

| Name    | Type                                                                    | Description                                                                                                                                                            |
| ------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| time    | [`AstroTime`](https://www.npmjs.com/package/astronomy-engine#AstroTime) | The date and time of the apsis.                                                                                                                                        |
| kind    | [`ApsisKind`](https://www.npmjs.com/package/astronomy-engine#ApsisKind) | For a closest approach (perigee or perihelion), `kind` is `ApsisKind.Pericenter`. For a farthest distance event (apogee or aphelion), `kind` is `ApsisKind.Apocenter`. |
| dist_au | `number`                                                                | The distance between the centers of the two bodies in astronomical units (AU).                                                                                         |
| dist_km | `number`                                                                | The distance between the centers of the two bodies in kilometers.                                                                                                      |

---

## [](https://www.npmjs.com/package/astronomy-engine#constellationinfo)ConstellationInfo

**Kind**: global class  
**Brief**: Reports the constellation that a given celestial point lies within.  
**Properties**

| Name    | Type     | Description                                                    |
| ------- | -------- | -------------------------------------------------------------- |
| symbol  | `string` | 3-character mnemonic symbol for the constellation, e.g. "Ori". |
| name    | `string` | Full name of constellation, e.g. "Orion".                      |
| ra1875  | `number` | Right ascension expressed in B1875 coordinates.                |
| dec1875 | `number` | Declination expressed in B1875 coordinates.                    |

---

## [](https://www.npmjs.com/package/astronomy-engine#lunareclipseinfo)LunarEclipseInfo

**Kind**: global class  
**Brief**: Returns information about a lunar eclipse.

Returned by [SearchLunarEclipse](https://www.npmjs.com/package/astronomy-engine#SearchLunarEclipse) or [NextLunarEclipse](https://www.npmjs.com/package/astronomy-engine#NextLunarEclipse) to report information about a lunar eclipse event. When a lunar eclipse is found, it is classified as penumbral, partial, or total. Penumbral eclipses are difficult to observe, because the Moon is only slightly dimmed by the Earth's penumbra; no part of the Moon touches the Earth's umbra. Partial eclipses occur when part, but not all, of the Moon touches the Earth's umbra. Total eclipses occur when the entire Moon passes into the Earth's umbra.

The `kind` field thus holds one of the enum values `EclipseKind.Penumbral`, `EclipseKind.Partial`, or `EclipseKind.Total`, depending on the kind of lunar eclipse found.

The `obscuration` field holds a value in the range \[0, 1\] that indicates what fraction of the Moon's apparent disc area is covered by the Earth's umbra at the eclipse's peak. This indicates how dark the peak eclipse appears. For penumbral eclipses, the obscuration is 0, because the Moon does not pass through the Earth's umbra. For partial eclipses, the obscuration is somewhere between 0 and 1. For total lunar eclipses, the obscuration is 1.

Field `peak` holds the date and time of the peak of the eclipse, when it is at its peak.

Fields `sd_penum`, `sd_partial`, and `sd_total` hold the semi-duration of each phase of the eclipse, which is half of the amount of time the eclipse spends in each phase (expressed in minutes), or 0 if the eclipse never reaches that phase. By converting from minutes to days, and subtracting/adding with `peak`, the caller may determine the date and time of the beginning/end of each eclipse phase.  
**Properties**

| Name        | Type                                                                        | Description                                                                         |
| ----------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| kind        | [`EclipseKind`](https://www.npmjs.com/package/astronomy-engine#EclipseKind) | The type of lunar eclipse found.                                                    |
| obscuration | `number`                                                                    | The peak fraction of the Moon's apparent disc that is covered by the Earth's umbra. |
| peak        | [`AstroTime`](https://www.npmjs.com/package/astronomy-engine#AstroTime)     | The time of the eclipse at its peak.                                                |
| sd_penum    | `number`                                                                    | The semi-duration of the penumbral phase in minutes.                                |
| sd_partial  | `number`                                                                    | The semi-duration of the penumbral phase in minutes, or 0.0 if none.                |
| sd_total    | `number`                                                                    | The semi-duration of the penumbral phase in minutes, or 0.0 if none.                |

---

## [](https://www.npmjs.com/package/astronomy-engine#globalsolareclipseinfo)GlobalSolarEclipseInfo

**Kind**: global class  
**Brief**: Reports the time and geographic location of the peak of a solar eclipse.

Returned by [SearchGlobalSolarEclipse](https://www.npmjs.com/package/astronomy-engine#SearchGlobalSolarEclipse) or [NextGlobalSolarEclipse](https://www.npmjs.com/package/astronomy-engine#NextGlobalSolarEclipse) to report information about a solar eclipse event.

The eclipse is classified as partial, annular, or total, depending on the maximum amount of the Sun's disc obscured, as seen at the peak location on the surface of the Earth.

The `kind` field thus holds one of the values `EclipseKind.Partial`, `EclipseKind.Annular`, or `EclipseKind.Total`. A total eclipse is when the peak observer sees the Sun completely blocked by the Moon. An annular eclipse is like a total eclipse, but the Moon is too far from the Earth's surface to completely block the Sun; instead, the Sun takes on a ring-shaped appearance. A partial eclipse is when the Moon blocks part of the Sun's disc, but nobody on the Earth observes either a total or annular eclipse.

If `kind` is `EclipseKind.Total` or `EclipseKind.Annular`, the `latitude` and `longitude` fields give the geographic coordinates of the center of the Moon's shadow projected onto the daytime side of the Earth at the instant of the eclipse's peak. If `kind` has any other value, `latitude` and `longitude` are undefined and should not be used.

For total or annular eclipses, the `obscuration` field holds the fraction (0, 1\] of the Sun's apparent disc area that is blocked from view by the Moon's silhouette, as seen by an observer located at the geographic coordinates `latitude`, `longitude` at the darkest time `peak`. The value will always be 1 for total eclipses, and less than 1 for annular eclipses. For partial eclipses, `obscuration` is undefined and should not be used. This is because there is little practical use for an obscuration value of a partial eclipse without supplying a particular observation location. Developers who wish to find an obscuration value for partial solar eclipses should therefore use [SearchLocalSolarEclipse](https://www.npmjs.com/package/astronomy-engine#SearchLocalSolarEclipse) and provide the geographic coordinates of an observer.  
**Properties**

| Name        | Type                                                                        | Description                                                                                                                                            |
| ----------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| kind        | [`EclipseKind`](https://www.npmjs.com/package/astronomy-engine#EclipseKind) | One of the following enumeration values: `EclipseKind.Partial`, `EclipseKind.Annular`, `EclipseKind.Total`.                                            |
| obscuration | `number`                                                                    | `undefined`                                                                                                                                            | The peak fraction of the Sun's apparent disc area obscured by the Moon (total and annular eclipses only)                                                                                                     |
| peak        | [`AstroTime`](https://www.npmjs.com/package/astronomy-engine#AstroTime)     | The date and time when the solar eclipse is darkest. This is the instant when the axis of the Moon's shadow cone passes closest to the Earth's center. |
| distance    | `number`                                                                    | The distance in kilometers between the axis of the Moon's shadow cone and the center of the Earth at the time indicated by `peak`.                     |
| latitude    | `number`                                                                    | `undefined`                                                                                                                                            | If `kind` holds `EclipseKind.Total`, the geographic latitude in degrees where the center of the Moon's shadow falls on the Earth at the time indicated by `peak`; otherwise, `latitude` holds `undefined`.   |
| longitude   | `number`                                                                    | `undefined`                                                                                                                                            | If `kind` holds `EclipseKind.Total`, the geographic longitude in degrees where the center of the Moon's shadow falls on the Earth at the time indicated by `peak`; otherwise, `longitude` holds `undefined`. |

---

## [](https://www.npmjs.com/package/astronomy-engine#eclipseevent)EclipseEvent

**Kind**: global class  
**Brief**: Holds a time and the observed altitude of the Sun at that time.

When reporting a solar eclipse observed at a specific location on the Earth (a "local" solar eclipse), a series of events occur. In addition to the time of each event, it is important to know the altitude of the Sun, because each event may be invisible to the observer if the Sun is below the horizon.

If `altitude` is negative, the event is theoretical only; it would be visible if the Earth were transparent, but the observer cannot actually see it. If `altitude` is positive but less than a few degrees, visibility will be impaired by atmospheric interference (sunrise or sunset conditions).  
**Properties**

| Name     | Type                                                                    | Description                                                                                                                                      |
| -------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| time     | [`AstroTime`](https://www.npmjs.com/package/astronomy-engine#AstroTime) | The date and time of the event.                                                                                                                  |
| altitude | `number`                                                                | The angular altitude of the center of the Sun above/below the horizon, at `time`, corrected for atmospheric refraction and expressed in degrees. |

---

## [](https://www.npmjs.com/package/astronomy-engine#localsolareclipseinfo)LocalSolarEclipseInfo

**Kind**: global class  
**Brief**: Information about a solar eclipse as seen by an observer at a given time and geographic location.

Returned by [SearchLocalSolarEclipse](https://www.npmjs.com/package/astronomy-engine#SearchLocalSolarEclipse) or [NextLocalSolarEclipse](https://www.npmjs.com/package/astronomy-engine#NextLocalSolarEclipse) to report information about a solar eclipse as seen at a given geographic location.

When a solar eclipse is found, it is classified by setting `kind` to `EclipseKind.Partial`, `EclipseKind.Annular`, or `EclipseKind.Total`. A partial solar eclipse is when the Moon does not line up directly enough with the Sun to completely block the Sun's light from reaching the observer. An annular eclipse occurs when the Moon's disc is completely visible against the Sun but the Moon is too far away to completely block the Sun's light; this leaves the Sun with a ring-like appearance. A total eclipse occurs when the Moon is close enough to the Earth and aligned with the Sun just right to completely block all sunlight from reaching the observer.

The `obscuration` field reports what fraction of the Sun's disc appears blocked by the Moon when viewed by the observer at the peak eclipse time. This is a value that ranges from 0 (no blockage) to 1 (total eclipse). The obscuration value will be between 0 and 1 for partial eclipses and annular eclipses. The value will be exactly 1 for total eclipses. Obscuration gives an indication of how dark the eclipse appears.

There are 5 "event" fields, each of which contains a time and a solar altitude. Field `peak` holds the date and time of the center of the eclipse, when it is at its peak. The fields `partial_begin` and `partial_end` are always set, and indicate when the eclipse begins/ends. If the eclipse reaches totality or becomes annular, `total_begin` and `total_end` indicate when the total/annular phase begins/ends. When an event field is valid, the caller must also check its `altitude` field to see whether the Sun is above the horizon at the time indicated by the `time` field. See [EclipseEvent](https://www.npmjs.com/package/astronomy-engine#EclipseEvent) for more information.  
**Properties**

| Name          | Type                                                                          | Description                                                                                            |
| ------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| kind          | [`EclipseKind`](https://www.npmjs.com/package/astronomy-engine#EclipseKind)   | The type of solar eclipse found: `EclipseKind.Partial`, `EclipseKind.Annular`, or `EclipseKind.Total`. |
| obscuration   | `number`                                                                      | The fraction of the Sun's apparent disc area obscured by the Moon at the eclipse peak.                 |
| partial_begin | [`EclipseEvent`](https://www.npmjs.com/package/astronomy-engine#EclipseEvent) | The time and Sun altitude at the beginning of the eclipse.                                             |
| total_begin   | [`EclipseEvent`](https://www.npmjs.com/package/astronomy-engine#EclipseEvent) | `undefined`                                                                                            | If this is an annular or a total eclipse, the time and Sun altitude when annular/total phase begins; otherwise undefined. |
| peak          | [`EclipseEvent`](https://www.npmjs.com/package/astronomy-engine#EclipseEvent) | The time and Sun altitude when the eclipse reaches its peak.                                           |
| total_end     | [`EclipseEvent`](https://www.npmjs.com/package/astronomy-engine#EclipseEvent) | `undefined`                                                                                            | If this is an annular or a total eclipse, the time and Sun altitude when annular/total phase ends; otherwise undefined.   |
| partial_end   | [`EclipseEvent`](https://www.npmjs.com/package/astronomy-engine#EclipseEvent) | The time and Sun altitude at the end of the eclipse.                                                   |

---

## [](https://www.npmjs.com/package/astronomy-engine#transitinfo)TransitInfo

**Kind**: global class  
**Brief**: Information about a transit of Mercury or Venus, as seen from the Earth.

Returned by [SearchTransit](https://www.npmjs.com/package/astronomy-engine#SearchTransit) or [NextTransit](https://www.npmjs.com/package/astronomy-engine#NextTransit) to report information about a transit of Mercury or Venus. A transit is when Mercury or Venus passes between the Sun and Earth so that the other planet is seen in silhouette against the Sun.

The calculations are performed from the point of view of a geocentric observer.  
**Properties**

| Name       | Type                                                                    | Description                                                                                                                                     |
| ---------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| start      | [`AstroTime`](https://www.npmjs.com/package/astronomy-engine#AstroTime) | The date and time at the beginning of the transit. This is the moment the planet first becomes visible against the Sun in its background.       |
| peak       | [`AstroTime`](https://www.npmjs.com/package/astronomy-engine#AstroTime) | When the planet is most aligned with the Sun, as seen from the Earth.                                                                           |
| finish     | [`AstroTime`](https://www.npmjs.com/package/astronomy-engine#AstroTime) | The date and time at the end of the transit. This is the moment the planet is last seen against the Sun in its background.                      |
| separation | `number`                                                                | The minimum angular separation, in arcminutes, between the centers of the Sun and the planet. This angle pertains to the time stored in `peak`. |

---

## [](https://www.npmjs.com/package/astronomy-engine#nodeeventinfo)NodeEventInfo

**Kind**: global class  
**Brief**: Information about an ascending or descending node of a body.

This object is returned by [SearchMoonNode](https://www.npmjs.com/package/astronomy-engine#SearchMoonNode) and [NextMoonNode](https://www.npmjs.com/package/astronomy-engine#NextMoonNode) to report information about the center of the Moon passing through the ecliptic plane.  
**Properties**

| Name | Type                                                                            | Description                                                                    |
| ---- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| kind | [`NodeEventKind`](https://www.npmjs.com/package/astronomy-engine#NodeEventKind) | Whether the node is ascending (south to north) or descending (north to south). |
| time | [`AstroTime`](https://www.npmjs.com/package/astronomy-engine#AstroTime)         | The time when the body passes through the ecliptic plane.                      |

---

## [](https://www.npmjs.com/package/astronomy-engine#axisinfo)AxisInfo

**Kind**: global class  
**Brief**: Information about a body's rotation axis at a given time.

This structure is returned by [RotationAxis](https://www.npmjs.com/package/astronomy-engine#RotationAxis) to report the orientation of a body's rotation axis at a given moment in time. The axis is specified by the direction in space that the body's north pole points, using angular equatorial coordinates in the J2000 system (EQJ).

Thus `ra` is the right ascension, and `dec` is the declination, of the body's north pole vector at the given moment in time. The north pole of a body is defined as the pole that lies on the north side of the [Solar System's invariable plane](https://en.wikipedia.org/wiki/Invariable_plane), regardless of the body's direction of rotation.

The `spin` field indicates the angular position of a prime meridian arbitrarily recommended for the body by the International Astronomical Union (IAU).

The fields `ra`, `dec`, and `spin` correspond to the variables α0, δ0, and W, respectively, from [Report of the IAU Working Group on Cartographic Coordinates and Rotational Elements: 2015](https://astropedia.astrogeology.usgs.gov/download/Docs/WGCCRE/WGCCRE2015reprint.pdf). The field `north` is a unit vector pointing in the direction of the body's north pole. It is expressed in the J2000 mean equator system (EQJ).  
**Properties**

| Name  | Type                                                              | Description                                                                           |
| ----- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| ra    | `number`                                                          | The J2000 right ascension of the body's north pole direction, in sidereal hours.      |
| dec   | `number`                                                          | The J2000 declination of the body's north pole direction, in degrees.                 |
| spin  | `number`                                                          | Rotation angle of the body's prime meridian, in degrees.                              |
| north | [`Vector`](https://www.npmjs.com/package/astronomy-engine#Vector) | A J2000 dimensionless unit vector pointing in the direction of the body's north pole. |

---

## [](https://www.npmjs.com/package/astronomy-engine#gravitysimulator)GravitySimulator

**Kind**: global class  
**Brief**: A simulation of zero or more small bodies moving through the Solar System.

This class calculates the movement of arbitrary small bodies, such as asteroids or comets, that move through the Solar System. It does so by calculating the gravitational forces on the small bodies from the Sun and planets. The user of this class supplies a list of initial positions and velocities for the small bodies. Then the class can update the positions and velocities over small time steps.

---

### [](https://www.npmjs.com/package/astronomy-engine#new-gravitysimulatororiginbody-date-bodystates)new GravitySimulator(originBody, date, bodyStates)

| Param      | Type                                                                                  | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| originBody | [`Body`](https://www.npmjs.com/package/astronomy-engine#Body)                         | Specifies the origin of the reference frame. All position vectors and velocity vectors will use `originBody` as the origin of the coordinate system. This origin applies to all the input vectors provided in the `bodyStates` parameter of this function, along with all output vectors returned by [Update](https://www.npmjs.com/package/astronomy-engine#GravitySimulator+Update). Most callers will want to provide one of the following: `Body.Sun` for heliocentric coordinates, `Body.SSB` for solar system barycentric coordinates, or `Body.Earth` for geocentric coordinates. Note that the gravity simulator does not correct for light travel time; all state vectors are tied to a Newtonian "instantaneous" time. |
| date       | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The initial time at which to start the simulation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| bodyStates | [`Array.<StateVector>`](https://www.npmjs.com/package/astronomy-engine#StateVector)   | An array of zero or more initial state vectors (positions and velocities) of the small bodies to be simulated. The caller must know the positions and velocities of the small bodies at an initial moment in time. Their positions and velocities are expressed with respect to `originBody`, using equatorial J2000 orientation (EQJ). Positions are expressed in astronomical units (AU). Velocities are expressed in AU/day. All the times embedded within the state vectors must exactly match `date`, or this constructor will throw an exception.                                                                                                                                                                          |

---

### [](https://www.npmjs.com/package/astronomy-engine#gravitysimulatororiginbody)gravitySimulator.OriginBody

**Kind**: instance property of [`GravitySimulator`](https://www.npmjs.com/package/astronomy-engine#GravitySimulator)  
**Brief**: The body that was selected as the coordinate origin when this simulator was created.

---

### [](https://www.npmjs.com/package/astronomy-engine#gravitysimulatortime)gravitySimulator.Time

**Kind**: instance property of [`GravitySimulator`](https://www.npmjs.com/package/astronomy-engine#GravitySimulator)  
**Brief**: The time represented by the current step of the gravity simulation.

---

### [](https://www.npmjs.com/package/astronomy-engine#gravitysimulatorupdatedate--arraystatevector)gravitySimulator.Update(date) ⇒ [`Array.<StateVector>`](https://www.npmjs.com/package/astronomy-engine#StateVector)

Advances the gravity simulation by a small time step.

Updates the simulation of the user-supplied small bodies to the time indicated by the `date` parameter. Returns an array of state vectors for the simulated bodies. The array is in the same order as the original array that was used to construct this simulator object. The positions and velocities in the returned array are referenced to the `originBody` that was used to construct this simulator.

**Kind**: instance method of [`GravitySimulator`](https://www.npmjs.com/package/astronomy-engine#GravitySimulator)  
**Returns**: [`Array.<StateVector>`](https://www.npmjs.com/package/astronomy-engine#StateVector) - An array of state vectors, one for each simulated small body.

| Param | Type                                                                                  | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| date  | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | A time that is a small increment away from the current simulation time. It is up to the developer to figure out an appropriate time increment. Depending on the trajectories, a smaller or larger increment may be needed for the desired accuracy. Some experimentation may be needed. Generally, bodies that stay in the outer Solar System and move slowly can use larger time steps. Bodies that pass into the inner Solar System and move faster will need a smaller time step to maintain accuracy. The `date` value may be after or before the current simulation time to move forward or backward in time. |

---

### [](https://www.npmjs.com/package/astronomy-engine#gravitysimulatorswap)gravitySimulator.Swap()

Exchange the current time step with the previous time step.

Sometimes it is helpful to "explore" various times near a given simulation time step, while repeatedly returning to the original time step. For example, when backdating a position for light travel time, the caller may wish to repeatedly try different amounts of backdating. When the backdating solver has converged, the caller wants to leave the simulation in its original state.

This function allows a single "undo" of a simulation, and does so very efficiently.

Usually this function will be called immediately after a matching call to [Update](https://www.npmjs.com/package/astronomy-engine#GravitySimulator+Update). It has the effect of rolling back the most recent update. If called twice in a row, it reverts the swap and thus has no net effect.

The constructor initializes the current state and previous state to be identical. Both states represent the `time` parameter that was passed into the constructor. Therefore, `Swap` will have no effect from the caller's point of view when passed a simulator that has not yet been updated by a call to [Update](https://www.npmjs.com/package/astronomy-engine#GravitySimulator+Update).

**Kind**: instance method of [`GravitySimulator`](https://www.npmjs.com/package/astronomy-engine#GravitySimulator)

---

### [](https://www.npmjs.com/package/astronomy-engine#gravitysimulatorsolarsystembodystatebody)gravitySimulator.SolarSystemBodyState(body)

Get the position and velocity of a Solar System body included in the simulation.

In order to simulate the movement of small bodies through the Solar System, the simulator needs to calculate the state vectors for the Sun and planets.

If an application wants to know the positions of one or more of the planets in addition to the small bodies, this function provides a way to obtain their state vectors. This is provided for the sake of efficiency, to avoid redundant calculations.

The state vector is returned relative to the position and velocity of the `originBody` parameter that was passed to this object's constructor.

**Kind**: instance method of [`GravitySimulator`](https://www.npmjs.com/package/astronomy-engine#GravitySimulator)

| Param | Type                                                          | Description                                                                |
| ----- | ------------------------------------------------------------- | -------------------------------------------------------------------------- |
| body  | [`Body`](https://www.npmjs.com/package/astronomy-engine#Body) | The Sun, Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, or Neptune. |

---

## [](https://www.npmjs.com/package/astronomy-engine#c_auday)C_AUDAY

**Kind**: global variable  
**Brief**: The speed of light in AU/day.

---

## [](https://www.npmjs.com/package/astronomy-engine#km_per_au)KM_PER_AU

**Kind**: global variable  
**Brief**: The number of kilometers per astronomical unit.

---

## [](https://www.npmjs.com/package/astronomy-engine#au_per_ly)AU_PER_LY

**Kind**: global variable  
**Brief**: The number of astronomical units per light-year.

---

## [](https://www.npmjs.com/package/astronomy-engine#deg2rad)DEG2RAD

**Kind**: global variable  
**Brief**: The factor to convert degrees to radians = pi/180.

---

## [](https://www.npmjs.com/package/astronomy-engine#hour2rad)HOUR2RAD

**Kind**: global variable  
**Brief**: The factor to convert sidereal hours to radians = pi/12.

---

## [](https://www.npmjs.com/package/astronomy-engine#rad2deg)RAD2DEG

**Kind**: global variable  
**Brief**: The factor to convert radians to degrees = 180/pi.

---

## [](https://www.npmjs.com/package/astronomy-engine#rad2hour)RAD2HOUR

**Kind**: global variable  
**Brief**: The factor to convert radians to sidereal hours = 12/pi.

---

## [](https://www.npmjs.com/package/astronomy-engine#jupiter_equatorial_radius_km)JUPITER_EQUATORIAL_RADIUS_KM

**Kind**: global variable  
**Brief**: The equatorial radius of Jupiter, expressed in kilometers.

---

## [](https://www.npmjs.com/package/astronomy-engine#jupiter_polar_radius_km)JUPITER_POLAR_RADIUS_KM

**Kind**: global variable  
**Brief**: The polar radius of Jupiter, expressed in kilometers.

---

## [](https://www.npmjs.com/package/astronomy-engine#jupiter_mean_radius_km)JUPITER_MEAN_RADIUS_KM

**Kind**: global variable  
**Brief**: The volumetric mean radius of Jupiter, expressed in kilometers.

---

## [](https://www.npmjs.com/package/astronomy-engine#io_radius_km)IO_RADIUS_KM

**Kind**: global variable  
**Brief**: The mean radius of Jupiter's moon Io, expressed in kilometers.

---

## [](https://www.npmjs.com/package/astronomy-engine#europa_radius_km)EUROPA_RADIUS_KM

**Kind**: global variable  
**Brief**: The mean radius of Jupiter's moon Europa, expressed in kilometers.

---

## [](https://www.npmjs.com/package/astronomy-engine#ganymede_radius_km)GANYMEDE_RADIUS_KM

**Kind**: global variable  
**Brief**: The mean radius of Jupiter's moon Ganymede, expressed in kilometers.

---

## [](https://www.npmjs.com/package/astronomy-engine#callisto_radius_km)CALLISTO_RADIUS_KM

**Kind**: global variable  
**Brief**: The mean radius of Jupiter's moon Callisto, expressed in kilometers.

---

## [](https://www.npmjs.com/package/astronomy-engine#body--enum)Body : `enum`

**Kind**: global enum  
**Brief**: String constants that represent the solar system bodies supported by Astronomy Engine.

The following strings represent solar system bodies supported by various Astronomy Engine functions. Not every body is supported by every function; consult the documentation for each function to find which bodies it supports.

"Sun", "Moon", "Mercury", "Venus", "Earth", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto", "SSB" (Solar System Barycenter), "EMB" (Earth/Moon Barycenter)

You can also use enumeration syntax for the bodies, like `Astronomy.Body.Moon`, `Astronomy.Body.Jupiter`, etc.

---

## [](https://www.npmjs.com/package/astronomy-engine#apsiskind--enum)ApsisKind : `enum`

**Kind**: global enum  
**Brief**: The two kinds of apsis: pericenter (closest) and apocenter (farthest).

`Pericenter`: The body is at its closest distance to the object it orbits. `Apocenter`: The body is at its farthest distance from the object it orbits.

---

## [](https://www.npmjs.com/package/astronomy-engine#eclipsekind--enum)EclipseKind : `enum`

**Kind**: global enum  
**Brief**: The different kinds of lunar/solar eclipses..

`Penumbral`: A lunar eclipse in which only the Earth's penumbra falls on the Moon. (Never used for a solar eclipse.) `Partial`: A partial lunar/solar eclipse. `Annular`: A solar eclipse in which the entire Moon is visible against the Sun, but the Sun appears as a ring around the Moon. (Never used for a lunar eclipse.) `Total`: A total lunar/solar eclipse.

---

## [](https://www.npmjs.com/package/astronomy-engine#nodeeventkind--enum)NodeEventKind : `enum`

**Kind**: global enum  
**Brief**: Indicates whether a crossing through the ecliptic plane is ascending or descending.

`Invalid` is a placeholder for an unknown or missing node. `Ascending` indicates a body passing through the ecliptic plane from south to north. `Descending` indicates a body passing through the ecliptic plane from north to south.

---

## [](https://www.npmjs.com/package/astronomy-engine#anglebetweena-b--number)AngleBetween(a, b) ⇒ `number`

**Kind**: global function  
**Returns**: `number` - The angle between the two vectors expressed in degrees. The value is in the range \[0, 180\].  
**Brief**: Calculates the angle in degrees between two vectors.

Given a pair of vectors, this function returns the angle in degrees between the two vectors in 3D space. The angle is measured in the plane that contains both vectors.

| Param | Type                                                              | Description                                                        |
| ----- | ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| a     | [`Vector`](https://www.npmjs.com/package/astronomy-engine#Vector) | The first of a pair of vectors between which to measure an angle.  |
| b     | [`Vector`](https://www.npmjs.com/package/astronomy-engine#Vector) | The second of a pair of vectors between which to measure an angle. |

---

## [](https://www.npmjs.com/package/astronomy-engine#anglefromsunbody-date--number)AngleFromSun(body, date) ⇒ `number`

**Kind**: global function  
**Returns**: `number` - An angle in degrees in the range \[0, 180\].  
**Brief**: Calculates the angular separation between the Sun and the given body.

Returns the full angle seen from the Earth, between the given body and the Sun. Unlike [PairLongitude](https://www.npmjs.com/package/astronomy-engine#PairLongitude), this function does not project the body's "shadow" onto the ecliptic; the angle is measured in 3D space around the plane that contains the centers of the Earth, the Sun, and `body`.

| Param | Type                                                                                  | Description                                                  |
| ----- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| body  | [`Body`](https://www.npmjs.com/package/astronomy-engine#Body)                         | The name of a supported celestial body other than the Earth. |
| date  | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The time at which the angle from the Sun is to be found.     |

---

## [](https://www.npmjs.com/package/astronomy-engine#atmosphereelevationmeters--atmosphereinfo)Atmosphere(elevationMeters) ⇒ [`AtmosphereInfo`](https://www.npmjs.com/package/astronomy-engine#AtmosphereInfo)

**Kind**: global function  
**Brief**: Calculates U.S. Standard Atmosphere (1976) variables as a function of elevation.

This function calculates idealized values of pressure, temperature, and density using the U.S. Standard Atmosphere (1976) model.

1. COESA, U.S. Standard Atmosphere, 1976, U.S. Government Printing Office, Washington, DC, 1976.
2. Jursa, A. S., Ed., Handbook of Geophysics and the Space Environment, Air Force Geophysics Laboratory, 1985. See: [https://hbcp.chemnetbase.com/faces/documents/14_12/14_12_0001.xhtml](https://hbcp.chemnetbase.com/faces/documents/14_12/14_12_0001.xhtml) [https://ntrs.nasa.gov/api/citations/19770009539/downloads/19770009539.pdf](https://ntrs.nasa.gov/api/citations/19770009539/downloads/19770009539.pdf) [https://www.ngdc.noaa.gov/stp/space-weather/online-publications/miscellaneous/us-standard-atmosphere-1976/us-standard-atmosphere_st76-1562_noaa.pdf](https://www.ngdc.noaa.gov/stp/space-weather/online-publications/miscellaneous/us-standard-atmosphere-1976/us-standard-atmosphere_st76-1562_noaa.pdf)

| Param           | Type     | Description                                                                                                                                  |
| --------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| elevationMeters | `number` | The elevation above sea level at which to calculate atmospheric variables. Must be in the range -500 to +100000, or an exception will occur. |

---

## [](https://www.npmjs.com/package/astronomy-engine#backdatepositiondate-observerbody-targetbody-aberration--vector)BackdatePosition(date, observerBody, targetBody, aberration) ⇒ [`Vector`](https://www.npmjs.com/package/astronomy-engine#Vector)

**Kind**: global function  
**Returns**: [`Vector`](https://www.npmjs.com/package/astronomy-engine#Vector) - The position vector at the solved backdated time. The `t` field holds the time that light left the observed body to arrive at the observer at the observation time.  
**Brief**: Solve for light travel time correction of apparent position.

When observing a distant object, for example Jupiter as seen from Earth, the amount of time it takes for light to travel from the object to the observer can significantly affect the object's apparent position.

This function solves the light travel time correction for the apparent relative position vector of a target body as seen by an observer body at a given observation time.

For geocentric calculations, [GeoVector](https://www.npmjs.com/package/astronomy-engine#GeoVector) also includes light travel time correction, but the time `t` embedded in its returned vector refers to the observation time, not the backdated time that light left the observed body. Thus `BackdatePosition` provides direct access to the light departure time for callers that need it.

For a more generalized light travel correction solver, see [CorrectLightTravel](https://www.npmjs.com/package/astronomy-engine#CorrectLightTravel).

| Param        | Type                                                                                  | Description                                                        |
| ------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| date         | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The time of observation.                                           |
| observerBody | [`Body`](https://www.npmjs.com/package/astronomy-engine#Body)                         | The body to be used as the observation location.                   |
| targetBody   | [`Body`](https://www.npmjs.com/package/astronomy-engine#Body)                         | The body to be observed.                                           |
| aberration   | `boolean`                                                                             | `true` to correct for aberration, or `false` to leave uncorrected. |

---

## [](https://www.npmjs.com/package/astronomy-engine#barystatebody-date--statevector)BaryState(body, date) ⇒ [`StateVector`](https://www.npmjs.com/package/astronomy-engine#StateVector)

**Kind**: global function  
**Returns**: [`StateVector`](https://www.npmjs.com/package/astronomy-engine#StateVector) - An object that contains barycentric position and velocity vectors.  
**Brief**: Calculates barycentric position and velocity vectors for the given body.

Given a body and a time, calculates the barycentric position and velocity vectors for the center of that body at that time. The vectors are expressed in J2000 mean equator coordinates (EQJ).

| Param | Type                                                                                  | Description                                                                                                                                                                                                                                                                                        |
| ----- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| body  | [`Body`](https://www.npmjs.com/package/astronomy-engine#Body)                         | The celestial body whose barycentric state vector is to be calculated. Supported values are `Body.Sun`, `Body.Moon`, `Body.EMB`, `Body.SSB`, and all planets: `Body.Mercury`, `Body.Venus`, `Body.Earth`, `Body.Mars`, `Body.Jupiter`, `Body.Saturn`, `Body.Uranus`, `Body.Neptune`, `Body.Pluto`. |
| date  | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The date and time for which to calculate position and velocity.                                                                                                                                                                                                                                    |

---

## [](https://www.npmjs.com/package/astronomy-engine#combinerotationa-b--rotationmatrix)CombineRotation(a, b) ⇒ [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix)

**Kind**: global function  
**Returns**: [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix) - The combined rotation matrix.  
**Brief**: Creates a rotation based on applying one rotation followed by another.

Given two rotation matrices, returns a combined rotation matrix that is equivalent to rotating based on the first matrix, followed by the second.

| Param | Type                                                                              | Description                   |
| ----- | --------------------------------------------------------------------------------- | ----------------------------- |
| a     | [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix) | The first rotation to apply.  |
| b     | [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix) | The second rotation to apply. |

---

## [](https://www.npmjs.com/package/astronomy-engine#constellationra-dec--constellationinfo)Constellation(ra, dec) ⇒ [`ConstellationInfo`](https://www.npmjs.com/package/astronomy-engine#ConstellationInfo)

**Kind**: global function  
**Returns**: [`ConstellationInfo`](https://www.npmjs.com/package/astronomy-engine#ConstellationInfo) - An object that contains the 3-letter abbreviation and full name of the constellation that contains the given (ra,dec), along with the converted B1875 (ra,dec) for that point.  
**Brief**: Determines the constellation that contains the given point in the sky.

Given J2000 equatorial (EQJ) coordinates of a point in the sky, determines the constellation that contains that point.

| Param | Type     | Description                                                                        |
| ----- | -------- | ---------------------------------------------------------------------------------- |
| ra    | `number` | The right ascension (RA) of a point in the sky, using the J2000 equatorial system. |
| dec   | `number` | The declination (DEC) of a point in the sky, using the J2000 equatorial system.    |

---

## [](https://www.npmjs.com/package/astronomy-engine#correctlighttravelfunc-time--astrovector)CorrectLightTravel(func, time) ⇒ `AstroVector`

Solve for light travel time of a vector function.

When observing a distant object, for example Jupiter as seen from Earth, the amount of time it takes for light to travel from the object to the observer can significantly affect the object's apparent position. This function is a generic solver that figures out how long in the past light must have left the observed object to reach the observer at the specified observation time. It requires passing in `func` to express an arbitrary position vector as a function of time.

`CorrectLightTravel` repeatedly calls `func`, passing a series of time estimates in the past. Then `func` must return a relative position vector between the observer and the target. `CorrectLightTravel` keeps calling `func` with more and more refined estimates of the time light must have left the target to arrive at the observer.

For common use cases, it is simpler to use [BackdatePosition](https://www.npmjs.com/package/astronomy-engine#BackdatePosition) for calculating the light travel time correction of one body observing another body.

For geocentric calculations, [GeoVector](https://www.npmjs.com/package/astronomy-engine#GeoVector) also backdates the returned position vector for light travel time, only it returns the observation time in the returned vector's `t` field rather than the backdated time.

**Kind**: global function  
**Returns**: `AstroVector` - The position vector at the solved backdated time. The `t` field holds the time that light left the observed body to arrive at the observer at the observation time.

| Param | Type                                                                    | Description                                                                                                                                                                                             |
| ----- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| func  | `function`                                                              | An arbitrary position vector as a function of time: function([AstroTime](https://www.npmjs.com/package/astronomy-engine#AstroTime)) => [Vector](https://www.npmjs.com/package/astronomy-engine#Vector). |
| time  | [`AstroTime`](https://www.npmjs.com/package/astronomy-engine#AstroTime) | The observation time for which to solve for light travel delay.                                                                                                                                         |

---

## [](https://www.npmjs.com/package/astronomy-engine#definestarbody-ra-dec-distancelightyears)DefineStar(body, ra, dec, distanceLightYears)

**Kind**: global function  
**Brief**: Assign equatorial coordinates to a user-defined star.

Some Astronomy Engine functions allow their `body` parameter to be a user-defined fixed point in the sky, loosely called a "star". This function assigns a right ascension, declination, and distance to one of the eight user-defined stars `Star1`..`Star8`.

Stars are not valid until defined. Once defined, they retain their definition until re-defined by another call to `DefineStar`.

| Param              | Type                                                          | Description                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| body               | [`Body`](https://www.npmjs.com/package/astronomy-engine#Body) | One of the eight user-defined star identifiers: `Star1`, `Star2`, `Star3`, `Star4`, `Star5`, `Star6`, `Star7`, or `Star8`.                                                                                                                                                                                                                                                   |
| ra                 | `number`                                                      | The right ascension to be assigned to the star, expressed in J2000 equatorial coordinates (EQJ). The value is in units of sidereal hours, and must be within the half-open range \[0, 24).                                                                                                                                                                                   |
| dec                | `number`                                                      | The declination to be assigned to the star, expressed in J2000 equatorial coordinates (EQJ). The value is in units of degrees north (positive) or south (negative) of the J2000 equator, and must be within the closed range \[-90, +90\].                                                                                                                                   |
| distanceLightYears | `number`                                                      | The distance between the star and the Sun, expressed in light-years. This value is used to calculate the tiny parallax shift as seen by an observer on Earth. If you don't know the distance to the star, using a large value like 1000 will generally work well. The minimum allowed distance is 1 light-year, which is required to provide certain internal optimizations. |

---

## [](https://www.npmjs.com/package/astronomy-engine#eclipticeqj--eclipticcoordinates)Ecliptic(eqj) ⇒ [`EclipticCoordinates`](https://www.npmjs.com/package/astronomy-engine#EclipticCoordinates)

**Kind**: global function  
**Brief**: Converts a J2000 mean equator (EQJ) vector to a true ecliptic of date (ETC) vector and angles.

Given coordinates relative to the Earth's equator at J2000 (the instant of noon UTC on 1 January 2000), this function converts those coordinates to true ecliptic coordinates that are relative to the plane of the Earth's orbit around the Sun on that date.

| Param | Type                                                              | Description                                                                                                                                                                         |
| ----- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| eqj   | [`Vector`](https://www.npmjs.com/package/astronomy-engine#Vector) | Equatorial coordinates in the EQJ frame of reference. You can call [GeoVector](https://www.npmjs.com/package/astronomy-engine#GeoVector) to obtain suitable equatorial coordinates. |

---

## [](https://www.npmjs.com/package/astronomy-engine#eclipticgeomoondate--spherical)EclipticGeoMoon(date) ⇒ [`Spherical`](https://www.npmjs.com/package/astronomy-engine#Spherical)

**Kind**: global function  
**Brief**: Calculates spherical ecliptic geocentric position of the Moon.

Given a time of observation, calculates the Moon's geocentric position in ecliptic spherical coordinates. Provides the ecliptic latitude and longitude in degrees, and the geocentric distance in astronomical units (AU).

The ecliptic angles are measured in "ECT": relative to the true ecliptic plane and equatorial plane at the specified time. This means the Earth's equator is corrected for precession and nutation, and the plane of the Earth's orbit is corrected for gradual obliquity drift.

This algorithm is based on the Nautical Almanac Office's _Improved Lunar Ephemeris_ of 1954, which in turn derives from E. W. Brown's lunar theories from the early twentieth century. It is adapted from Turbo Pascal code from the book [Astronomy on the Personal Computer](https://www.springer.com/us/book/9783540672210) by Montenbruck and Pfleger.

To calculate a J2000 mean equator vector instead, use [GeoMoon](https://www.npmjs.com/package/astronomy-engine#GeoMoon).

| Param | Type                                                                                  | Description                                                   |
| ----- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| date  | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The date and time for which to calculate the Moon's position. |

---

## [](https://www.npmjs.com/package/astronomy-engine#eclipticlongitudebody-date--number)EclipticLongitude(body, date) ⇒ `number`

**Kind**: global function  
**Brief**: Calculates heliocentric ecliptic longitude of a body.

This function calculates the angle around the plane of the Earth's orbit of a celestial body, as seen from the center of the Sun. The angle is measured prograde (in the direction of the Earth's orbit around the Sun) in degrees from the true equinox of date. The ecliptic longitude is always in the range \[0, 360).

| Param | Type                                                                                  | Description                                                      |
| ----- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| body  | [`Body`](https://www.npmjs.com/package/astronomy-engine#Body)                         | A body other than the Sun.                                       |
| date  | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The date and time for which to calculate the ecliptic longitude. |

---

## [](https://www.npmjs.com/package/astronomy-engine#elongationbody-date--elongationevent)Elongation(body, date) ⇒ [`ElongationEvent`](https://www.npmjs.com/package/astronomy-engine#ElongationEvent)

**Kind**: global function  
**Brief**: Calculates the viewing conditions of a body relative to the Sun.

Calculates angular separation of a body from the Sun as seen from the Earth and the relative ecliptic longitudes between that body and the Earth as seen from the Sun. See the return type [ElongationEvent](https://www.npmjs.com/package/astronomy-engine#ElongationEvent) for details.

This function is helpful for determining how easy it is to view a planet away from the Sun's glare on a given date. It also determines whether the object is visible in the morning or evening; this is more important the smaller the elongation is. It is also used to determine how far a planet is from opposition, conjunction, or quadrature.

| Param | Type                                                                                  | Description                                                    |
| ----- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| body  | [`Body`](https://www.npmjs.com/package/astronomy-engine#Body)                         | The name of the observed body. Not allowed to be `Body.Earth`. |
| date  | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The date and time of the observation.                          |

---

## [](https://www.npmjs.com/package/astronomy-engine#equatorbody-date-observer-ofdate-aberration--equatorialcoordinates)Equator(body, date, observer, ofdate, aberration) ⇒ [`EquatorialCoordinates`](https://www.npmjs.com/package/astronomy-engine#EquatorialCoordinates)

**Kind**: global function  
**Returns**: [`EquatorialCoordinates`](https://www.npmjs.com/package/astronomy-engine#EquatorialCoordinates) - The topocentric coordinates of the body as adjusted for the given observer.  
**Brief**: Calculates equatorial coordinates of a Solar System body at a given time.

Returns topocentric equatorial coordinates (right ascension and declination) in one of two different systems: J2000 or true-equator-of-date. Allows optional correction for aberration. Always corrects for light travel time (represents the object as seen by the observer with light traveling to the Earth at finite speed, not where the object is right now). _Topocentric_ refers to a position as seen by an observer on the surface of the Earth. This function corrects for [parallax](https://en.wikipedia.org/wiki/Parallax) of the object between a geocentric observer and a topocentric observer. This is most significant for the Moon, because it is so close to the Earth. However, it can have a small effect on the apparent positions of other bodies.

| Param      | Type                                                                                  | Description                                                                                                                                                                                                                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| body       | [`Body`](https://www.npmjs.com/package/astronomy-engine#Body)                         | The body for which to find equatorial coordinates. Not allowed to be `Body.Earth`.                                                                                                                                                                                                                                           |
| date       | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | Specifies the date and time at which the body is to be observed.                                                                                                                                                                                                                                                             |
| observer   | [`Observer`](https://www.npmjs.com/package/astronomy-engine#Observer)                 | The location on the Earth of the observer.                                                                                                                                                                                                                                                                                   |
| ofdate     | `bool`                                                                                | Pass `true` to return equatorial coordinates of date, i.e. corrected for precession and nutation at the given date. This is needed to get correct horizontal coordinates when you call [Horizon](https://www.npmjs.com/package/astronomy-engine#Horizon). Pass `false` to return equatorial coordinates in the J2000 system. |
| aberration | `bool`                                                                                | Pass `true` to correct for [aberration](https://en.wikipedia.org/wiki/Aberration_of_light), or `false` to leave uncorrected.                                                                                                                                                                                                 |

---

## [](https://www.npmjs.com/package/astronomy-engine#equatorfromvectorvec--equatorialcoordinates)EquatorFromVector(vec) ⇒ [`EquatorialCoordinates`](https://www.npmjs.com/package/astronomy-engine#EquatorialCoordinates)

**Kind**: global function  
**Returns**: [`EquatorialCoordinates`](https://www.npmjs.com/package/astronomy-engine#EquatorialCoordinates) - Angular coordinates expressed in the same equatorial system as `vec`.  
**Brief**: Given an equatorial vector, calculates equatorial angular coordinates.

| Param | Type                                                              | Description                                  |
| ----- | ----------------------------------------------------------------- | -------------------------------------------- |
| vec   | [`Vector`](https://www.npmjs.com/package/astronomy-engine#Vector) | A vector in an equatorial coordinate system. |

---

## [](https://www.npmjs.com/package/astronomy-engine#geoembstatedate--statevector)GeoEmbState(date) ⇒ [`StateVector`](https://www.npmjs.com/package/astronomy-engine#StateVector)

**Kind**: global function  
**Brief**: Calculates the geocentric position and velocity of the Earth/Moon barycenter.

Given a time of observation, calculates the geocentric position and velocity vectors of the Earth/Moon barycenter (EMB). The position (x, y, z) components are expressed in AU (astronomical units). The velocity (vx, vy, vz) components are expressed in AU/day.

| Param | Type                                                                                  | Description                                                          |
| ----- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| date  | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The date and time for which to calculate the EMB's geocentric state. |

---

## [](https://www.npmjs.com/package/astronomy-engine#geomoondate--vector)GeoMoon(date) ⇒ [`Vector`](https://www.npmjs.com/package/astronomy-engine#Vector)

**Kind**: global function  
**Brief**: Calculates equatorial geocentric Cartesian coordinates for the Moon.

Given a time of observation, calculates the Moon's position as a vector. The vector gives the location of the Moon's center relative to the Earth's center with x-, y-, and z-components measured in astronomical units. The coordinates are oriented with respect to the Earth's equator at the J2000 epoch. In Astronomy Engine, this orientation is called EQJ. Based on the Nautical Almanac Office's _Improved Lunar Ephemeris_ of 1954, which in turn derives from E. W. Brown's lunar theories. Adapted from Turbo Pascal code from the book [Astronomy on the Personal Computer](https://www.springer.com/us/book/9783540672210) by Montenbruck and Pfleger.

| Param | Type                                                                                  | Description                                                              |
| ----- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| date  | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The date and time for which to calculate the Moon's geocentric position. |

---

## [](https://www.npmjs.com/package/astronomy-engine#geomoonstatedate--statevector)GeoMoonState(date) ⇒ [`StateVector`](https://www.npmjs.com/package/astronomy-engine#StateVector)

**Kind**: global function  
**Brief**: Calculates equatorial geocentric position and velocity of the Moon at a given time.

Given a time of observation, calculates the Moon's position and velocity vectors. The position and velocity are of the Moon's center relative to the Earth's center. The position (x, y, z) components are expressed in AU (astronomical units). The velocity (vx, vy, vz) components are expressed in AU/day. The coordinates are oriented with respect to the Earth's equator at the J2000 epoch. In Astronomy Engine, this orientation is called EQJ. If you need the Moon's position only, and not its velocity, it is much more efficient to use [GeoMoon](https://www.npmjs.com/package/astronomy-engine#GeoMoon) instead.

| Param | Type                                                                                  | Description                                                           |
| ----- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| date  | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The date and time for which to calculate the Moon's geocentric state. |

---

## [](https://www.npmjs.com/package/astronomy-engine#geovectorbody-date-aberration--vector)GeoVector(body, date, aberration) ⇒ [`Vector`](https://www.npmjs.com/package/astronomy-engine#Vector)

**Kind**: global function  
**Brief**: Calculates a vector from the center of the Earth to the given body at the given time.

Calculates geocentric (i.e., with respect to the center of the Earth) Cartesian coordinates in the J2000 equatorial system of a celestial body at a specified time. The position is always corrected for light travel time: this means the position of the body is "back-dated" based on how long it takes light to travel from the body to an observer on the Earth. Also, the position can optionally be corrected for aberration, an effect causing the apparent direction of the body to be shifted based on transverse movement of the Earth with respect to the rays of light coming from that body.

| Param      | Type                                                                                  | Description                                                                                                                                                                                                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| body       | [`Body`](https://www.npmjs.com/package/astronomy-engine#Body)                         | One of the following values: `Body.Sun`, `Body.Moon`, `Body.Mercury`, `Body.Venus`, `Body.Earth`, `Body.Mars`, `Body.Jupiter`, `Body.Saturn`, `Body.Uranus`, `Body.Neptune`, or `Body.Pluto`. Also allowed to be a user-defined star created with [DefineStar](https://www.npmjs.com/package/astronomy-engine#DefineStar). |
| date       | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The date and time for which the body's position is to be calculated.                                                                                                                                                                                                                                                       |
| aberration | `boolean`                                                                             | Pass `true` to correct for [aberration](https://en.wikipedia.org/wiki/Aberration_of_light), or `false` to leave uncorrected.                                                                                                                                                                                               |

---

## [](https://www.npmjs.com/package/astronomy-engine#heliodistancebody-date--number)HelioDistance(body, date) ⇒ `number`

**Kind**: global function  
**Returns**: `number` - The heliocentric distance in AU.  
**Brief**: Calculates the distance between a body and the Sun at a given time.

Given a date and time, this function calculates the distance between the center of `body` and the center of the Sun. For the planets Mercury through Neptune, this function is significantly more efficient than calling [HelioVector](https://www.npmjs.com/package/astronomy-engine#HelioVector) followed by taking the length of the resulting vector.

| Param | Type                                                                                  | Description                                                                                                       |
| ----- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| body  | [`Body`](https://www.npmjs.com/package/astronomy-engine#Body)                         | A body for which to calculate a heliocentric distance: the Sun, Moon, any of the planets, or a user-defined star. |
| date  | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The date and time for which to calculate the heliocentric distance.                                               |

---

## [](https://www.npmjs.com/package/astronomy-engine#heliostatebody-date--statevector)HelioState(body, date) ⇒ [`StateVector`](https://www.npmjs.com/package/astronomy-engine#StateVector)

**Kind**: global function  
**Returns**: [`StateVector`](https://www.npmjs.com/package/astronomy-engine#StateVector) - An object that contains heliocentric position and velocity vectors.  
**Brief**: Calculates heliocentric position and velocity vectors for the given body.

Given a body and a time, calculates the position and velocity vectors for the center of that body at that time, relative to the center of the Sun. The vectors are expressed in J2000 mean equator coordinates (EQJ). If you need the position vector only, it is more efficient to call [HelioVector](https://www.npmjs.com/package/astronomy-engine#HelioVector). The Sun's center is a non-inertial frame of reference. In other words, the Sun experiences acceleration due to gravitational forces, mostly from the larger planets (Jupiter, Saturn, Uranus, and Neptune). If you want to calculate momentum, kinetic energy, or other quantities that require a non-accelerating frame of reference, consider using [BaryState](https://www.npmjs.com/package/astronomy-engine#BaryState) instead.

| Param | Type                                                                                  | Description                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| body  | [`Body`](https://www.npmjs.com/package/astronomy-engine#Body)                         | The celestial body whose heliocentric state vector is to be calculated. Supported values are `Body.Sun`, `Body.Moon`, `Body.EMB`, `Body.SSB`, and all planets: `Body.Mercury`, `Body.Venus`, `Body.Earth`, `Body.Mars`, `Body.Jupiter`, `Body.Saturn`, `Body.Uranus`, `Body.Neptune`, `Body.Pluto`. Also allowed to be a user-defined star created by [DefineStar](https://www.npmjs.com/package/astronomy-engine#DefineStar). |
| date  | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The date and time for which to calculate position and velocity.                                                                                                                                                                                                                                                                                                                                                                |

---

## [](https://www.npmjs.com/package/astronomy-engine#heliovectorbody-date--vector)HelioVector(body, date) ⇒ [`Vector`](https://www.npmjs.com/package/astronomy-engine#Vector)

**Kind**: global function  
**Brief**: Calculates a vector from the center of the Sun to the given body at the given time.

Calculates heliocentric (i.e., with respect to the center of the Sun) Cartesian coordinates in the J2000 equatorial system of a celestial body at a specified time. The position is not corrected for light travel time or aberration.

| Param | Type                                                                                  | Description                                                                                                                                                                                                                                                                                                                                      |
| ----- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| body  | [`Body`](https://www.npmjs.com/package/astronomy-engine#Body)                         | One of the following values: `Body.Sun`, `Body.Moon`, `Body.Mercury`, `Body.Venus`, `Body.Earth`, `Body.Mars`, `Body.Jupiter`, `Body.Saturn`, `Body.Uranus`, `Body.Neptune`, `Body.Pluto`, `Body.SSB`, or `Body.EMB`. Also allowed to be a user-defined star created by [DefineStar](https://www.npmjs.com/package/astronomy-engine#DefineStar). |
| date  | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The date and time for which the body's position is to be calculated.                                                                                                                                                                                                                                                                             |

---

## [](https://www.npmjs.com/package/astronomy-engine#horizondate-observer-ra-dec-refraction--horizontalcoordinates)Horizon(date, observer, ra, dec, refraction) ⇒ [`HorizontalCoordinates`](https://www.npmjs.com/package/astronomy-engine#HorizontalCoordinates)

**Kind**: global function  
**Brief**: Converts equatorial coordinates to horizontal coordinates.

Given a date and time, a geographic location of an observer on the Earth, and equatorial coordinates (right ascension and declination) of a celestial body, returns horizontal coordinates (azimuth and altitude angles) for that body as seen by that observer. Allows optional correction for atmospheric refraction.

| Param      | Type                                                                                  | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| date       | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The date and time for which to find horizontal coordinates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| observer   | [`Observer`](https://www.npmjs.com/package/astronomy-engine#Observer)                 | The location of the observer for which to find horizontal coordinates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ra         | `number`                                                                              | Right ascension in sidereal hours of the celestial object, referred to the mean equinox of date for the J2000 epoch.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| dec        | `number`                                                                              | Declination in degrees of the celestial object, referred to the mean equator of date for the J2000 epoch. Positive values are north of the celestial equator and negative values are south.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| refraction | `string`                                                                              | If omitted or has a false-like value (false, null, undefined, etc.) the calculations are performed without any correction for atmospheric refraction. If the value is the string `"normal"`, uses the recommended refraction correction based on Meeus "Astronomical Algorithms" with a linear taper more than 1 degree below the horizon. The linear taper causes the refraction to linearly approach 0 as the altitude of the body approaches the nadir (-90 degrees). If the value is the string `"jplhor"`, uses a JPL Horizons compatible formula. This is the same algorithm as `"normal"`, only without linear tapering; this can result in physically impossible altitudes of less than -90 degrees, which may cause problems for some applications. (The `"jplhor"` option was created for unit testing against data generated by JPL Horizons, and is otherwise not recommended for use.) |

---

## [](https://www.npmjs.com/package/astronomy-engine#horizonfromvectorvector-refraction--spherical)HorizonFromVector(vector, refraction) ⇒ [`Spherical`](https://www.npmjs.com/package/astronomy-engine#Spherical)

**Kind**: global function  
**Brief**: Converts Cartesian coordinates to horizontal coordinates.

Given a horizontal Cartesian vector, returns horizontal azimuth and altitude.

_IMPORTANT:_ This function differs from [SphereFromVector](https://www.npmjs.com/package/astronomy-engine#SphereFromVector) in two ways:

- `SphereFromVector` returns a `lon` value that represents azimuth defined counterclockwise from north (e.g., west = +90), but this function represents a clockwise rotation (e.g., east = +90). The difference is because `SphereFromVector` is intended to preserve the vector "right-hand rule", while this function defines azimuth in a more traditional way as used in navigation and cartography.
- This function optionally corrects for atmospheric refraction, while `SphereFromVector` does not.

The returned object contains the azimuth in `lon`. It is measured in degrees clockwise from north: east = +90 degrees, west = +270 degrees.

The altitude is stored in `lat`.

The distance to the observed object is stored in `dist`, and is expressed in astronomical units (AU).

| Param      | Type                                                              | Description                                                                                                                                                                                                                |
| ---------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| vector     | [`Vector`](https://www.npmjs.com/package/astronomy-engine#Vector) | Cartesian vector to be converted to horizontal coordinates.                                                                                                                                                                |
| refraction | `string`                                                          | `"normal"`: correct altitude for atmospheric refraction (recommended). `"jplhor"`: for JPL Horizons compatibility testing only; not recommended for normal use. `null`: no atmospheric refraction correction is performed. |

---

## [](https://www.npmjs.com/package/astronomy-engine#houranglebody-date-observer--number)HourAngle(body, date, observer) ⇒ `number`

**Kind**: global function  
**Brief**: Finds the hour angle of a body for a given observer and time.

The _hour angle_ of a celestial body indicates its position in the sky with respect to the Earth's rotation. The hour angle depends on the location of the observer on the Earth. The hour angle is 0 when the body's center reaches its highest angle above the horizon in a given day. The hour angle increases by 1 unit for every sidereal hour that passes after that point, up to 24 sidereal hours when it reaches the highest point again. So the hour angle indicates the number of hours that have passed since the most recent time that the body has culminated, or reached its highest point.

This function returns the hour angle of the body as seen at the given time and geogrpahic location. The hour angle is a number in the half-open range \[0, 24).

| Param    | Type                                                                                  | Description                                                |
| -------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| body     | [`Body`](https://www.npmjs.com/package/astronomy-engine#Body)                         | The body whose observed hour angle is to be found.         |
| date     | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The date and time of the observation.                      |
| observer | [`Observer`](https://www.npmjs.com/package/astronomy-engine#Observer)                 | The geographic location where the observation takes place. |

---

## [](https://www.npmjs.com/package/astronomy-engine#identitymatrix--rotationmatrix)IdentityMatrix() ⇒ [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix)

**Kind**: global function  
**Returns**: [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix) - The identity matrix.  
**Brief**: Creates an identity rotation matrix.

Returns a rotation matrix that has no effect on orientation. This matrix can be the starting point for other operations, such as using a series of calls to [Pivot](https://www.npmjs.com/package/astronomy-engine#Pivot) to create a custom rotation matrix.

---

## [](https://www.npmjs.com/package/astronomy-engine#illuminationbody-date--illuminationinfo)Illumination(body, date) ⇒ [`IlluminationInfo`](https://www.npmjs.com/package/astronomy-engine#IlluminationInfo)

**Kind**: global function  
**Brief**: Calculates visual magnitude and related information about a body.

Calculates the phase angle, visual magnitude, and other values relating to the body's illumination at the given date and time, as seen from the Earth.

| Param | Type                                                                                  | Description                                                                        |
| ----- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| body  | [`Body`](https://www.npmjs.com/package/astronomy-engine#Body)                         | The name of the celestial body being observed. Not allowed to be `Body.Earth`.     |
| date  | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The date and time for which to calculate the illumination data for the given body. |

---

## [](https://www.npmjs.com/package/astronomy-engine#inverserefractionrefraction-bent_altitude--number)InverseRefraction(refraction, bent_altitude) ⇒ `number`

**Kind**: global function  
**Returns**: `number` - The angular adjustment in degrees to be added to the altitude angle to correct for atmospheric lensing. This will be less than or equal to zero.  
**Brief**: Calculates the inverse of an atmospheric refraction angle.

Given an observed altitude angle that includes atmospheric refraction, calculates the negative angular correction to obtain the unrefracted altitude. This is useful for cases where observed horizontal coordinates are to be converted to another orientation system, but refraction first must be removed from the observed position.

| Param         | Type     | Description                                                                                                                                                                                                                |
| ------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| refraction    | `string` | `"normal"`: correct altitude for atmospheric refraction (recommended). `"jplhor"`: for JPL Horizons compatibility testing only; not recommended for normal use. `null`: no atmospheric refraction correction is performed. |
| bent_altitude | `number` | The apparent altitude that includes atmospheric refraction.                                                                                                                                                                |

---

## [](https://www.npmjs.com/package/astronomy-engine#inverserotationrotation--rotationmatrix)InverseRotation(rotation) ⇒ [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix)

**Kind**: global function  
**Returns**: [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix) - The inverse rotation matrix.  
**Brief**: Calculates the inverse of a rotation matrix.

Given a rotation matrix that performs some coordinate transform, this function returns the matrix that reverses that transform.

| Param    | Type                                                                              | Description                         |
| -------- | --------------------------------------------------------------------------------- | ----------------------------------- |
| rotation | [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix) | The rotation matrix to be inverted. |

---

## [](https://www.npmjs.com/package/astronomy-engine#jupitermoonsdate--jupitermoonsinfo)JupiterMoons(date) ⇒ [`JupiterMoonsInfo`](https://www.npmjs.com/package/astronomy-engine#JupiterMoonsInfo)

**Kind**: global function  
**Returns**: [`JupiterMoonsInfo`](https://www.npmjs.com/package/astronomy-engine#JupiterMoonsInfo) - Position and velocity vectors of Jupiter's largest 4 moons.  
**Brief**: Calculates jovicentric positions and velocities of Jupiter's largest 4 moons.

Calculates position and velocity vectors for Jupiter's moons Io, Europa, Ganymede, and Callisto, at the given date and time. The vectors are jovicentric (relative to the center of Jupiter). Their orientation is the Earth's equatorial system at the J2000 epoch (EQJ). The position components are expressed in astronomical units (AU), and the velocity components are in AU/day.

To convert to heliocentric vectors, call [HelioVector](https://www.npmjs.com/package/astronomy-engine#HelioVector) with `Astronomy.Body.Jupiter` to get Jupiter's heliocentric position, then add the jovicentric vectors. Likewise, you can call [GeoVector](https://www.npmjs.com/package/astronomy-engine#GeoVector) to convert to geocentric vectors.

| Param | Type                                                                                  | Description                                               |
| ----- | ------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| date  | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The date and time for which to calculate Jupiter's moons. |

---

## [](https://www.npmjs.com/package/astronomy-engine#lagrangepointpoint-date-major_body-minor_body--statevector)LagrangePoint(point, date, major_body, minor_body) ⇒ [`StateVector`](https://www.npmjs.com/package/astronomy-engine#StateVector)

**Kind**: global function  
**Returns**: [`StateVector`](https://www.npmjs.com/package/astronomy-engine#StateVector) - The position and velocity of the selected Lagrange point with respect to the major body's center.  
**Brief**: Calculates one of the 5 Lagrange points for a pair of co-orbiting bodies.

Given a more massive "major" body and a much less massive "minor" body, calculates one of the five Lagrange points in relation to the minor body's orbit around the major body. The parameter `point` is an integer that selects the Lagrange point as follows:

1 = the Lagrange point between the major body and minor body. 2 = the Lagrange point on the far side of the minor body. 3 = the Lagrange point on the far side of the major body. 4 = the Lagrange point 60 degrees ahead of the minor body's orbital position. 5 = the Lagrange point 60 degrees behind the minor body's orbital position.

The function returns the state vector for the selected Lagrange point in J2000 mean equator coordinates (EQJ), with respect to the center of the major body.

To calculate Sun/Earth Lagrange points, pass in `Body.Sun` for `major_body` and `Body.EMB` (Earth/Moon barycenter) for `minor_body`. For Lagrange points of the Sun and any other planet, pass in that planet (e.g. `Body.Jupiter`) for `minor_body`. To calculate Earth/Moon Lagrange points, pass in `Body.Earth` and `Body.Moon` for the major and minor bodies respectively.

In some cases, it may be more efficient to call [LagrangePointFast](https://www.npmjs.com/package/astronomy-engine#LagrangePointFast), especially when the state vectors have already been calculated, or are needed for some other purpose.

| Param      | Type                                                                                  | Description                                                             |
| ---------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| point      | `number`                                                                              | An integer 1..5 that selects which of the Lagrange points to calculate. |
| date       | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The time at which the Lagrange point is to be calculated.               |
| major_body | [`Body`](https://www.npmjs.com/package/astronomy-engine#Body)                         | The more massive of the co-orbiting bodies: `Body.Sun` or `Body.Earth`. |
| minor_body | [`Body`](https://www.npmjs.com/package/astronomy-engine#Body)                         | The less massive of the co-orbiting bodies. See main remarks.           |

---

## [](https://www.npmjs.com/package/astronomy-engine#lagrangepointfastpoint-major_state-major_mass-minor_state-minor_mass--statevector)LagrangePointFast(point, major_state, major_mass, minor_state, minor_mass) ⇒ [`StateVector`](https://www.npmjs.com/package/astronomy-engine#StateVector)

**Kind**: global function  
**Returns**: [`StateVector`](https://www.npmjs.com/package/astronomy-engine#StateVector) - The position and velocity of the selected Lagrange point with respect to the major body's center.  
**Brief**: Calculates one of the 5 Lagrange points from body masses and state vectors.

Given a more massive "major" body and a much less massive "minor" body, calculates one of the five Lagrange points in relation to the minor body's orbit around the major body. The parameter `point` is an integer that selects the Lagrange point as follows:

1 = the Lagrange point between the major body and minor body. 2 = the Lagrange point on the far side of the minor body. 3 = the Lagrange point on the far side of the major body. 4 = the Lagrange point 60 degrees ahead of the minor body's orbital position. 5 = the Lagrange point 60 degrees behind the minor body's orbital position.

The caller passes in the state vector and mass for both bodies. The state vectors can be in any orientation and frame of reference. The body masses are expressed as GM products, where G = the universal gravitation constant and M = the body's mass. Thus the units for `major_mass` and `minor_mass` must be au^3/day^2. Use [MassProduct](https://www.npmjs.com/package/astronomy-engine#MassProduct) to obtain GM values for various solar system bodies.

The function returns the state vector for the selected Lagrange point using the same orientation as the state vector parameters `major_state` and `minor_state`, and the position and velocity components are with respect to the major body's center.

Consider calling [LagrangePoint](https://www.npmjs.com/package/astronomy-engine#LagrangePoint), instead of this function, for simpler usage in most cases.

| Param       | Type                                                                        | Description                                                          |
| ----------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| point       | `number`                                                                    | A value 1..5 that selects which of the Lagrange points to calculate. |
| major_state | [`StateVector`](https://www.npmjs.com/package/astronomy-engine#StateVector) | The state vector of the major (more massive) of the pair of bodies.  |
| major_mass  | `number`                                                                    | The mass product GM of the major body.                               |
| minor_state | [`StateVector`](https://www.npmjs.com/package/astronomy-engine#StateVector) | The state vector of the minor (less massive) of the pair of bodies.  |
| minor_mass  | `number`                                                                    | The mass product GM of the minor body.                               |

---

## [](https://www.npmjs.com/package/astronomy-engine#librationdate--librationinfo)Libration(date) ⇒ [`LibrationInfo`](https://www.npmjs.com/package/astronomy-engine#LibrationInfo)

**Kind**: global function  
**Brief**: Calculates the Moon's libration angles at a given moment in time.

Libration is an observed back-and-forth wobble of the portion of the Moon visible from the Earth. It is caused by the imperfect tidal locking of the Moon's fixed rotation rate, compared to its variable angular speed of orbit around the Earth.

This function calculates a pair of perpendicular libration angles, one representing rotation of the Moon in ecliptic longitude `elon`, the other in ecliptic latitude `elat`, both relative to the Moon's mean Earth-facing position.

This function also returns the geocentric position of the Moon expressed in ecliptic longitude `mlon`, ecliptic latitude `mlat`, the distance `dist_km` between the centers of the Earth and Moon expressed in kilometers, and the apparent angular diameter of the Moon `diam_deg`.

| Param | Type                                                                                  | Description                                                                                                  |
| ----- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| date  | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | A Date object, a number of UTC days since the J2000 epoch (noon on January 1, 2000), or an AstroTime object. |

---

## [](https://www.npmjs.com/package/astronomy-engine#makerotationrot--rotationmatrix)MakeRotation(rot) ⇒ [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix)

**Kind**: global function  
**Brief**: Creates a rotation matrix that can be used to transform one coordinate system to another.

This function verifies that the `rot` parameter is of the correct format: a number\[3\]\[3\] array. It throws an exception if `rot` is not of that shape. Otherwise it creates a new [RotationMatrix](https://www.npmjs.com/package/astronomy-engine#RotationMatrix) object based on `rot`.

| Param | Type                     | Description                                                                                                                              |
| ----- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| rot   | `Array.<Array.<number>>` | An array \[3\]\[3\] of numbers. Defines a rotation matrix used to premultiply a 3D vector to reorient it into another coordinate system. |

---

## [](https://www.npmjs.com/package/astronomy-engine#maketimedate--astrotime)MakeTime(date) ⇒ [`AstroTime`](https://www.npmjs.com/package/astronomy-engine#AstroTime)

**Kind**: global function  
**Brief**: Converts multiple date/time formats to `AstroTime` format.

Given a Date object or a number days since noon (12:00) on January 1, 2000 (UTC), this function creates an [AstroTime](https://www.npmjs.com/package/astronomy-engine#AstroTime) object.

Given an [AstroTime](https://www.npmjs.com/package/astronomy-engine#AstroTime) object, returns the same object unmodified. Use of this function is not required for any of the other exposed functions in this library, because they all guarantee converting date/time parameters to `AstroTime` as needed. However, it may be convenient for callers who need to understand the difference between UTC and TT (Terrestrial Time). In some use cases, converting once to `AstroTime` format and passing the result into multiple function calls may be more efficient than passing in native JavaScript Date objects.

| Param | Type                                                                                  | Description                                                                                                                     |
| ----- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| date  | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | A Date object, a number of UTC days since the J2000 epoch (noon on January 1, 2000), or an AstroTime object. See remarks above. |

---

## [](https://www.npmjs.com/package/astronomy-engine#massproductbody--number)MassProduct(body) ⇒ `number`

**Kind**: global function  
**Returns**: `number` - The mass product of the given body in au^3/day^2.  
**Brief**: Returns the product of mass and universal gravitational constant of a Solar System body.

For problems involving the gravitational interactions of Solar System bodies, it is helpful to know the product GM, where G = the universal gravitational constant and M = the mass of the body. In practice, GM is known to a higher precision than either G or M alone, and thus using the product results in the most accurate results. This function returns the product GM in the units au^3/day^2. The values come from page 10 of a [JPL memorandum regarding the DE405/LE405 ephemeris](https://web.archive.org/web/20120220062549/http://iau-comm4.jpl.nasa.gov/de405iom/de405iom.pdf).

| Param | Type                                                          | Description                                                                                                                                                               |
| ----- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| body  | [`Body`](https://www.npmjs.com/package/astronomy-engine#Body) | The body for which to find the GM product. Allowed to be the Sun, Moon, EMB (Earth/Moon Barycenter), or any planet. Any other value will cause an exception to be thrown. |

---

## [](https://www.npmjs.com/package/astronomy-engine#moonphasedate--number)MoonPhase(date) ⇒ `number`

**Kind**: global function  
**Returns**: `number` - A value in the range \[0, 360) indicating the difference in ecliptic longitude between the center of the Sun and the center of the Moon, as seen from the center of the Earth. Certain longitude values have conventional meanings:

- 0 = new moon
- 90 = first quarter
- 180 = full moon
- 270 = third quarter  
   **Brief**: Determines the moon's phase expressed as an ecliptic longitude.

| Param | Type                                                                                  | Description                                                |
| ----- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| date  | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The date and time for which to calculate the moon's phase. |

---

## [](https://www.npmjs.com/package/astronomy-engine#nextglobalsolareclipsepreveclipsetime--globalsolareclipseinfo)NextGlobalSolarEclipse(prevEclipseTime) ⇒ [`GlobalSolarEclipseInfo`](https://www.npmjs.com/package/astronomy-engine#GlobalSolarEclipseInfo)

**Kind**: global function  
**Brief**: Searches for the next global solar eclipse in a series.

After using [SearchGlobalSolarEclipse](https://www.npmjs.com/package/astronomy-engine#SearchGlobalSolarEclipse) to find the first solar eclipse in a series, you can call this function to find the next consecutive solar eclipse. Pass in the `peak` value from the [GlobalSolarEclipseInfo](https://www.npmjs.com/package/astronomy-engine#GlobalSolarEclipseInfo) returned by the previous call to `SearchGlobalSolarEclipse` or `NextGlobalSolarEclipse` to find the next solar eclipse.

| Param           | Type                                                                                  | Description                                                                            |
| --------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| prevEclipseTime | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | A date and time near a new moon. Solar eclipse search will start at the next new moon. |

---

## [](https://www.npmjs.com/package/astronomy-engine#nextlocalsolareclipsepreveclipsetime-observer--localsolareclipseinfo)NextLocalSolarEclipse(prevEclipseTime, observer) ⇒ [`LocalSolarEclipseInfo`](https://www.npmjs.com/package/astronomy-engine#LocalSolarEclipseInfo)

**Kind**: global function  
**Brief**: Searches for the next local solar eclipse in a series.

After using [SearchLocalSolarEclipse](https://www.npmjs.com/package/astronomy-engine#SearchLocalSolarEclipse) to find the first solar eclipse in a series, you can call this function to find the next consecutive solar eclipse. Pass in the `peak` value from the [LocalSolarEclipseInfo](https://www.npmjs.com/package/astronomy-engine#LocalSolarEclipseInfo) returned by the previous call to `SearchLocalSolarEclipse` or `NextLocalSolarEclipse` to find the next solar eclipse. This function finds the first solar eclipse that occurs after `startTime`. A solar eclipse may be partial, annular, or total. See [LocalSolarEclipseInfo](https://www.npmjs.com/package/astronomy-engine#LocalSolarEclipseInfo) for more information.

| Param           | Type                                                                                  | Description                                                    |
| --------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| prevEclipseTime | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The date and time for starting the search for a solar eclipse. |
| observer        | [`Observer`](https://www.npmjs.com/package/astronomy-engine#Observer)                 | The geographic location of the observer.                       |

---

## [](https://www.npmjs.com/package/astronomy-engine#nextlunarapsisapsis--apsis)NextLunarApsis(apsis) ⇒ [`Apsis`](https://www.npmjs.com/package/astronomy-engine#Apsis)

**Kind**: global function  
**Returns**: [`Apsis`](https://www.npmjs.com/package/astronomy-engine#Apsis) - The successor apogee for the given perigee, or the successor perigee for the given apogee.  
**Brief**: Finds the next lunar apsis (perigee or apogee) in a series.

Given a lunar apsis returned by an initial call to [SearchLunarApsis](https://www.npmjs.com/package/astronomy-engine#SearchLunarApsis), or a previous call to `NextLunarApsis`, finds the next lunar apsis. If the given apsis is a perigee, this function finds the next apogee, and vice versa.

| Param | Type                                                            | Description                      |
| ----- | --------------------------------------------------------------- | -------------------------------- |
| apsis | [`Apsis`](https://www.npmjs.com/package/astronomy-engine#Apsis) | A lunar perigee or apogee event. |

---

## [](https://www.npmjs.com/package/astronomy-engine#nextlunareclipsepreveclipsetime--lunareclipseinfo)NextLunarEclipse(prevEclipseTime) ⇒ [`LunarEclipseInfo`](https://www.npmjs.com/package/astronomy-engine#LunarEclipseInfo)

**Kind**: global function  
**Brief**: Searches for the next lunar eclipse in a series.

After using [SearchLunarEclipse](https://www.npmjs.com/package/astronomy-engine#SearchLunarEclipse) to find the first lunar eclipse in a series, you can call this function to find the next consecutive lunar eclipse. Pass in the `peak` value from the [LunarEclipseInfo](https://www.npmjs.com/package/astronomy-engine#LunarEclipseInfo) returned by the previous call to `SearchLunarEclipse` or `NextLunarEclipse` to find the next lunar eclipse.

| Param           | Type                                                                                  | Description                                                                              |
| --------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| prevEclipseTime | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | A date and time near a full moon. Lunar eclipse search will start at the next full moon. |

---

## [](https://www.npmjs.com/package/astronomy-engine#nextmoonnodeprevnode--nodeeventinfo)NextMoonNode(prevNode) ⇒ [`NodeEventInfo`](https://www.npmjs.com/package/astronomy-engine#NodeEventInfo)

**Kind**: global function  
**Brief**: Searches for the next time when the Moon's center crosses through the ecliptic plane.

Call [SearchMoonNode](https://www.npmjs.com/package/astronomy-engine#SearchMoonNode) to find the first of a series of nodes. Then call `NextMoonNode` to find as many more consecutive nodes as desired.

| Param    | Type                                                                            | Description                                                                                                                             |
| -------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| prevNode | [`NodeEventInfo`](https://www.npmjs.com/package/astronomy-engine#NodeEventInfo) | The previous node found from calling [SearchMoonNode](https://www.npmjs.com/package/astronomy-engine#SearchMoonNode) or `NextMoonNode`. |

---

## [](https://www.npmjs.com/package/astronomy-engine#nextmoonquartermq--moonquarter)NextMoonQuarter(mq) ⇒ [`MoonQuarter`](https://www.npmjs.com/package/astronomy-engine#MoonQuarter)

**Kind**: global function  
**Brief**: Finds the next quarter lunar phase in a series.

Given a [MoonQuarter](https://www.npmjs.com/package/astronomy-engine#MoonQuarter) object, finds the next consecutive quarter lunar phase. See remarks in [SearchMoonQuarter](https://www.npmjs.com/package/astronomy-engine#SearchMoonQuarter) for explanation of usage.

| Param | Type                                                                        | Description                                                                                                                         |
| ----- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| mq    | [`MoonQuarter`](https://www.npmjs.com/package/astronomy-engine#MoonQuarter) | The return value of a prior call to [MoonQuarter](https://www.npmjs.com/package/astronomy-engine#MoonQuarter) or `NextMoonQuarter`. |

---

## [](https://www.npmjs.com/package/astronomy-engine#nextplanetapsisbody-apsis--apsis)NextPlanetApsis(body, apsis) ⇒ [`Apsis`](https://www.npmjs.com/package/astronomy-engine#Apsis)

**Kind**: global function  
**Returns**: [`Apsis`](https://www.npmjs.com/package/astronomy-engine#Apsis) - Same as the return value for [SearchPlanetApsis](https://www.npmjs.com/package/astronomy-engine#SearchPlanetApsis).  
**Brief**: Finds the next planetary perihelion or aphelion event in a series.

This function requires an [Apsis](https://www.npmjs.com/package/astronomy-engine#Apsis) value obtained from a call to [SearchPlanetApsis](https://www.npmjs.com/package/astronomy-engine#SearchPlanetApsis) or `NextPlanetApsis`. Given an aphelion event, this function finds the next perihelion event, and vice versa. See [SearchPlanetApsis](https://www.npmjs.com/package/astronomy-engine#SearchPlanetApsis) for more details.

| Param | Type                                                            | Description                                                                                                                                                                                 |
| ----- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| body  | [`Body`](https://www.npmjs.com/package/astronomy-engine#Body)   | The planet for which to find the next perihelion/aphelion event. Not allowed to be `Body.Sun` or `Body.Moon`. Must match the body passed into the call that produced the `apsis` parameter. |
| apsis | [`Apsis`](https://www.npmjs.com/package/astronomy-engine#Apsis) | An apsis event obtained from a call to [SearchPlanetApsis](https://www.npmjs.com/package/astronomy-engine#SearchPlanetApsis) or `NextPlanetApsis`.                                          |

---

## [](https://www.npmjs.com/package/astronomy-engine#nexttransitbody-prevtransittime--transitinfo)NextTransit(body, prevTransitTime) ⇒ [`TransitInfo`](https://www.npmjs.com/package/astronomy-engine#TransitInfo)

**Kind**: global function  
**Brief**: Searches for the next transit of Mercury or Venus in a series.

After calling [SearchTransit](https://www.npmjs.com/package/astronomy-engine#SearchTransit) to find a transit of Mercury or Venus, this function finds the next transit after that. Keep calling this function as many times as you want to keep finding more transits.

| Param           | Type                                                                                  | Description                                                                      |
| --------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| body            | [`Body`](https://www.npmjs.com/package/astronomy-engine#Body)                         | The planet whose transit is to be found. Must be `Body.Mercury` or `Body.Venus`. |
| prevTransitTime | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | A date and time near the previous transit.                                       |

---

## [](https://www.npmjs.com/package/astronomy-engine#observergravitylatitude-height--number)ObserverGravity(latitude, height) ⇒ `number`

**Kind**: global function  
**Returns**: `number` - The effective gravitational acceleration expressed in meters per second squared \[m/s^2\].  
**Brief**: Calculates the gravitational acceleration experienced by an observer on the Earth.

This function implements the WGS 84 Ellipsoidal Gravity Formula. The result is a combination of inward gravitational acceleration with outward centrifugal acceleration, as experienced by an observer in the Earth's rotating frame of reference. The resulting value increases toward the Earth's poles and decreases toward the equator, consistent with changes of the weight measured by a spring scale of a fixed mass moved to different latitudes and heights on the Earth.

| Param    | Type     | Description                                                                                                                                                                             |
| -------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| latitude | `number` | The latitude of the observer in degrees north or south of the equator. By formula symmetry, positive latitudes give the same answer as negative latitudes, so the sign does not matter. |
| height   | `number` | The height above the sea level geoid in meters. No range checking is done; however, accuracy is only valid in the range 0 to 100000 meters.                                             |

---

## [](https://www.npmjs.com/package/astronomy-engine#observerstatedate-observer-ofdate--statevector)ObserverState(date, observer, ofdate) ⇒ [`StateVector`](https://www.npmjs.com/package/astronomy-engine#StateVector)

**Kind**: global function  
**Brief**: Calculates geocentric equatorial position and velocity of an observer on the surface of the Earth.

This function calculates position and velocity vectors of an observer on or near the surface of the Earth, expressed in equatorial coordinates. It takes into account the rotation of the Earth at the given time, along with the given latitude, longitude, and elevation of the observer.

The caller may pass `ofdate` as `true` to return coordinates relative to the Earth's equator at the specified time, or `false` to use the J2000 equator.

The returned position vector has components expressed in astronomical units (AU). To convert to kilometers, multiply the `x`, `y`, and `z` values by the constant value [KM_PER_AU](https://www.npmjs.com/package/astronomy-engine#KM_PER_AU). The returned velocity vector has components expressed in AU/day.

| Param    | Type                                                                                  | Description                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| date     | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The date and time for which to calculate the observer's position and velocity vectors.                                                                                                                                                                                                                                                                                                                                            |
| observer | [`Observer`](https://www.npmjs.com/package/astronomy-engine#Observer)                 | The geographic location of a point on or near the surface of the Earth.                                                                                                                                                                                                                                                                                                                                                           |
| ofdate   | `boolean`                                                                             | Selects the date of the Earth's equator in which to express the equatorial coordinates. The caller may pass `false` to use the orientation of the Earth's equator at noon UTC on January 1, 2000, in which case this function corrects for precession and nutation of the Earth as it was at the moment specified by the `time` parameter. Or the caller may pass `true` to use the Earth's equator at `time` as the orientation. |

---

## [](https://www.npmjs.com/package/astronomy-engine#observervectordate-observer-ofdate--vector)ObserverVector(date, observer, ofdate) ⇒ [`Vector`](https://www.npmjs.com/package/astronomy-engine#Vector)

**Kind**: global function  
**Returns**: [`Vector`](https://www.npmjs.com/package/astronomy-engine#Vector) - An equatorial vector from the center of the Earth to the specified location on (or near) the Earth's surface.  
**Brief**: Calculates geocentric equatorial coordinates of an observer on the surface of the Earth.

This function calculates a vector from the center of the Earth to a point on or near the surface of the Earth, expressed in equatorial coordinates. It takes into account the rotation of the Earth at the given time, along with the given latitude, longitude, and elevation of the observer.

The caller may pass `ofdate` as `true` to return coordinates relative to the Earth's equator at the specified time, or `false` to use the J2000 equator.

The returned vector has components expressed in astronomical units (AU). To convert to kilometers, multiply the `x`, `y`, and `z` values by the constant value [KM_PER_AU](https://www.npmjs.com/package/astronomy-engine#KM_PER_AU).

The inverse of this function is also available: [VectorObserver](https://www.npmjs.com/package/astronomy-engine#VectorObserver).

| Param    | Type                                                                                  | Description                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| date     | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The date and time for which to calculate the observer's position vector.                                                                                                                                                                                                                                                                                                                                                          |
| observer | [`Observer`](https://www.npmjs.com/package/astronomy-engine#Observer)                 | The geographic location of a point on or near the surface of the Earth.                                                                                                                                                                                                                                                                                                                                                           |
| ofdate   | `boolean`                                                                             | Selects the date of the Earth's equator in which to express the equatorial coordinates. The caller may pass `false` to use the orientation of the Earth's equator at noon UTC on January 1, 2000, in which case this function corrects for precession and nutation of the Earth as it was at the moment specified by the `time` parameter. Or the caller may pass `true` to use the Earth's equator at `time` as the orientation. |

---

## [](https://www.npmjs.com/package/astronomy-engine#pairlongitudebody1-body2-date--number)PairLongitude(body1, body2, date) ⇒ `number`

**Kind**: global function  
**Returns**: `number` - An angle in the range \[0, 360), expressed in degrees.  
**Brief**: Returns one body's ecliptic longitude with respect to another, as seen from the Earth.

This function determines where one body appears around the ecliptic plane (the plane of the Earth's orbit around the Sun) as seen from the Earth, relative to the another body's apparent position. The function returns an angle in the half-open range \[0, 360) degrees. The value is the ecliptic longitude of `body1` relative to the ecliptic longitude of `body2`.

The angle is 0 when the two bodies are at the same ecliptic longitude as seen from the Earth. The angle increases in the prograde direction (the direction that the planets orbit the Sun and the Moon orbits the Earth).

When the angle is 180 degrees, it means the two bodies appear on opposite sides of the sky for an Earthly observer.

Neither `body1` nor `body2` is allowed to be `Body.Earth`. If this happens, the function throws an exception.

| Param | Type                                                                                  | Description                                                                        |
| ----- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| body1 | [`Body`](https://www.npmjs.com/package/astronomy-engine#Body)                         | The first body, whose longitude is to be found relative to the second body.        |
| body2 | [`Body`](https://www.npmjs.com/package/astronomy-engine#Body)                         | The second body, relative to which the longitude of the first body is to be found. |
| date  | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The date and time of the observation.                                              |

---

## [](https://www.npmjs.com/package/astronomy-engine#pivotrotation-axis-angle--rotationmatrix)Pivot(rotation, axis, angle) ⇒ [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix)

**Kind**: global function  
**Returns**: [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix) - A pivoted matrix object.  
**Brief**: Re-orients a rotation matrix by pivoting it by an angle around one of its axes.

Given a rotation matrix, a selected coordinate axis, and an angle in degrees, this function pivots the rotation matrix by that angle around that coordinate axis.

For example, if you have rotation matrix that converts ecliptic coordinates (ECL) to horizontal coordinates (HOR), but you really want to convert ECL to the orientation of a telescope camera pointed at a given body, you can use `Astronomy_Pivot` twice: (1) pivot around the zenith axis by the body's azimuth, then (2) pivot around the western axis by the body's altitude angle. The resulting rotation matrix will then reorient ECL coordinates to the orientation of your telescope camera.

| Param    | Type                                                                              | Description                                                                                                                                                                                                                                                                                                                                                                    |
| -------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| rotation | [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix) | The input rotation matrix.                                                                                                                                                                                                                                                                                                                                                     |
| axis     | `number`                                                                          | An integer that selects which coordinate axis to rotate around: 0 = x, 1 = y, 2 = z. Any other value will cause an exception.                                                                                                                                                                                                                                                  |
| angle    | `number`                                                                          | An angle in degrees indicating the amount of rotation around the specified axis. Positive angles indicate rotation counterclockwise as seen from the positive direction along that axis, looking towards the origin point of the orientation system. Any finite number of degrees is allowed, but best precision will result from keeping `angle` in the range \[-360, +360\]. |

---

## [](https://www.npmjs.com/package/astronomy-engine#planetorbitalperiodbody--number)PlanetOrbitalPeriod(body) ⇒ `number`

**Kind**: global function  
**Returns**: `number` - The approximate average time it takes for the planet to travel once around the Sun. The value is expressed in days.  
**Brief**: Returns the mean orbital period of a planet in days.

| Param | Type                                                          | Description                                                                      |
| ----- | ------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| body  | [`Body`](https://www.npmjs.com/package/astronomy-engine#Body) | One of: Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune, or Pluto. |

---

## [](https://www.npmjs.com/package/astronomy-engine#refractionrefraction-altitude--number)Refraction(refraction, altitude) ⇒ `number`

**Kind**: global function  
**Returns**: `number` - The angular adjustment in degrees to be added to the altitude angle to correct for atmospheric lensing.  
**Brief**: Calculates the amount of "lift" to an altitude angle caused by atmospheric refraction.

Given an altitude angle and a refraction option, calculates the amount of "lift" caused by atmospheric refraction. This is the number of degrees higher in the sky an object appears due to the lensing of the Earth's atmosphere. This function works best near sea level. To correct for higher elevations, call [Atmosphere](https://www.npmjs.com/package/astronomy-engine#Atmosphere) for that elevation and multiply the refraction angle by the resulting relative density.

| Param      | Type     | Description                                                                                                                                                                                                                |
| ---------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| refraction | `string` | `"normal"`: correct altitude for atmospheric refraction (recommended). `"jplhor"`: for JPL Horizons compatibility testing only; not recommended for normal use. `null`: no atmospheric refraction correction is performed. |
| altitude   | `number` | An altitude angle in a horizontal coordinate system. Must be a value between -90 and +90.                                                                                                                                  |

---

## [](https://www.npmjs.com/package/astronomy-engine#rotatestaterotation-state--statevector)RotateState(rotation, state) ⇒ [`StateVector`](https://www.npmjs.com/package/astronomy-engine#StateVector)

**Kind**: global function  
**Returns**: [`StateVector`](https://www.npmjs.com/package/astronomy-engine#StateVector) - A state vector in the orientation specified by `rotation`.  
**Brief**: Applies a rotation to a state vector, yielding a rotated vector.

This function transforms a state vector in one orientation to a vector in another orientation.

| Param    | Type                                                                              | Description                                                                                                     |
| -------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| rotation | [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix) | A rotation matrix that specifies how the orientation of the state vector is to be changed.                      |
| state    | [`StateVector`](https://www.npmjs.com/package/astronomy-engine#StateVector)       | The state vector whose orientation is to be changed. Both the position and velocity components are transformed. |

---

## [](https://www.npmjs.com/package/astronomy-engine#rotatevectorrotation-vector--vector)RotateVector(rotation, vector) ⇒ [`Vector`](https://www.npmjs.com/package/astronomy-engine#Vector)

**Kind**: global function  
**Returns**: [`Vector`](https://www.npmjs.com/package/astronomy-engine#Vector) - A vector in the orientation specified by `rotation`.  
**Brief**: Applies a rotation to a vector, yielding a rotated vector.

This function transforms a vector in one orientation to a vector in another orientation.

| Param    | Type                                                                              | Description                                                                          |
| -------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| rotation | [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix) | A rotation matrix that specifies how the orientation of the vector is to be changed. |
| vector   | [`Vector`](https://www.npmjs.com/package/astronomy-engine#Vector)                 | The vector whose orientation is to be changed.                                       |

---

## [](https://www.npmjs.com/package/astronomy-engine#rotationaxisbody-date--axisinfo)RotationAxis(body, date) ⇒ [`AxisInfo`](https://www.npmjs.com/package/astronomy-engine#AxisInfo)

**Kind**: global function  
**Brief**: Calculates information about a body's rotation axis at a given time. Calculates the orientation of a body's rotation axis, along with the rotation angle of its prime meridian, at a given moment in time.

This function uses formulas standardized by the IAU Working Group on Cartographics and Rotational Elements 2015 report, as described in the following document:

[https://astropedia.astrogeology.usgs.gov/download/Docs/WGCCRE/WGCCRE2015reprint.pdf](https://astropedia.astrogeology.usgs.gov/download/Docs/WGCCRE/WGCCRE2015reprint.pdf)

See [AxisInfo](https://www.npmjs.com/package/astronomy-engine#AxisInfo) for more detailed information.

| Param | Type                                                                                  | Description                                                                                                                                                                                |
| ----- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| body  | [`Body`](https://www.npmjs.com/package/astronomy-engine#Body)                         | One of the following values: `Body.Sun`, `Body.Moon`, `Body.Mercury`, `Body.Venus`, `Body.Earth`, `Body.Mars`, `Body.Jupiter`, `Body.Saturn`, `Body.Uranus`, `Body.Neptune`, `Body.Pluto`. |
| date  | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The time at which to calculate the body's rotation axis.                                                                                                                                   |

---

## [](https://www.npmjs.com/package/astronomy-engine#rotation_ecl_eqdtime--rotationmatrix)Rotation_ECL_EQD(time) ⇒ [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix)

**Kind**: global function  
**Returns**: [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix) - A rotation matrix that converts ECL to EQD.  
**Brief**: Calculates a rotation matrix from J2000 mean ecliptic (ECL) to equatorial of-date (EQD).

This is one of the family of functions that returns a rotation matrix for converting from one orientation to another. Source: ECL = ecliptic system, using equator at J2000 epoch. Target: EQD = equatorial system, using equator of date.

| Param | Type                                                                                  | Description                               |
| ----- | ------------------------------------------------------------------------------------- | ----------------------------------------- |
| time  | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The date and time of the desired equator. |

---

## [](https://www.npmjs.com/package/astronomy-engine#rotation_ecl_eqj--rotationmatrix)Rotation_ECL_EQJ() ⇒ [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix)

**Kind**: global function  
**Returns**: [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix) - A rotation matrix that converts ECL to EQJ.  
**Brief**: Calculates a rotation matrix from J2000 mean ecliptic (ECL) to J2000 mean equator (EQJ).

This is one of the family of functions that returns a rotation matrix for converting from one orientation to another. Source: ECL = ecliptic system, using equator at J2000 epoch. Target: EQJ = equatorial system, using equator at J2000 epoch.

---

## [](https://www.npmjs.com/package/astronomy-engine#rotation_ecl_hortime-observer--rotationmatrix)Rotation_ECL_HOR(time, observer) ⇒ [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix)

**Kind**: global function  
**Returns**: [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix) - A rotation matrix that converts ECL to HOR at `time` and for `observer`. The components of the horizontal vector are: x = north, y = west, z = zenith (straight up from the observer). These components are chosen so that the "right-hand rule" works for the vector and so that north represents the direction where azimuth = 0.  
**Brief**: Calculates a rotation matrix from J2000 mean ecliptic (ECL) to horizontal (HOR).

This is one of the family of functions that returns a rotation matrix for converting from one orientation to another. Source: ECL = ecliptic system, using equator at J2000 epoch. Target: HOR = horizontal system.

Use [HorizonFromVector](https://www.npmjs.com/package/astronomy-engine#HorizonFromVector) to convert the return value to a traditional altitude/azimuth pair.

| Param    | Type                                                                                  | Description                                                                     |
| -------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| time     | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The date and time of the desired horizontal orientation.                        |
| observer | [`Observer`](https://www.npmjs.com/package/astronomy-engine#Observer)                 | A location near the Earth's mean sea level that defines the observer's horizon. |

---

## [](https://www.npmjs.com/package/astronomy-engine#rotation_ect_eqdtime--rotationmatrix)Rotation_ECT_EQD(time) ⇒ [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix)

**Kind**: global function  
**Returns**: [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix) - A rotation matrix that converts ECT to EQD.  
**Brief**: Calculates a rotation matrix from true ecliptic of date (ECT) to equator of date (EQD).

This is one of the family of functions that returns a rotation matrix for converting from one orientation to another. Source: ECT = true ecliptic of date Target: EQD = equator of date

| Param | Type                                                                                  | Description                                           |
| ----- | ------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| time  | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The date and time of the ecliptic/equator conversion. |

---

## [](https://www.npmjs.com/package/astronomy-engine#rotation_ect_eqjtime--rotationmatrix)Rotation_ECT_EQJ(time) ⇒ [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix)

**Kind**: global function  
**Returns**: [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix) - A rotation matrix that converts ECT to EQJ at `time`.  
**Brief**: Calculates a rotation matrix from true ecliptic of date (ECT) to J2000 mean equator (EQJ).

This is one of the family of functions that returns a rotation matrix for converting from one orientation to another. Source: ECT = ecliptic system, using true equinox of the specified date/time. Target: EQJ = equatorial system, using equator at J2000 epoch.

| Param | Type                                                                                  | Description                                                                    |
| ----- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| time  | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The date and time at which the Earth's equator defines the target orientation. |

---

## [](https://www.npmjs.com/package/astronomy-engine#rotation_eqd_ecltime--rotationmatrix)Rotation_EQD_ECL(time) ⇒ [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix)

**Kind**: global function  
**Returns**: [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix) - A rotation matrix that converts EQD to ECL.  
**Brief**: Calculates a rotation matrix from equatorial of-date (EQD) to J2000 mean ecliptic (ECL).

This is one of the family of functions that returns a rotation matrix for converting from one orientation to another. Source: EQD = equatorial system, using equator of date. Target: ECL = ecliptic system, using equator at J2000 epoch.

| Param | Type                                                                                  | Description                              |
| ----- | ------------------------------------------------------------------------------------- | ---------------------------------------- |
| time  | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The date and time of the source equator. |

---

## [](https://www.npmjs.com/package/astronomy-engine#rotation_eqd_ecttime--rotationmatrix)Rotation_EQD_ECT(time) ⇒ [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix)

**Kind**: global function  
**Returns**: [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix) - A rotation matrix that converts EQD to ECT.  
**Brief**: Calculates a rotation matrix from equator of date (EQD) to true ecliptic of date (ECT).

This is one of the family of functions that returns a rotation matrix for converting from one orientation to another. Source: EQD = equator of date Target: ECT = true ecliptic of date

| Param | Type                                                                                  | Description                                           |
| ----- | ------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| time  | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The date and time of the equator/ecliptic conversion. |

---

## [](https://www.npmjs.com/package/astronomy-engine#rotation_eqd_eqjtime--rotationmatrix)Rotation_EQD_EQJ(time) ⇒ [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix)

**Kind**: global function  
**Returns**: [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix) - A rotation matrix that converts EQD at `time` to EQJ.  
**Brief**: Calculates a rotation matrix from equatorial of-date (EQD) to J2000 mean equator (EQJ).

This is one of the family of functions that returns a rotation matrix for converting from one orientation to another. Source: EQD = equatorial system, using equator of the specified date/time. Target: EQJ = equatorial system, using equator at J2000 epoch.

| Param | Type                                                                                  | Description                                                                    |
| ----- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| time  | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The date and time at which the Earth's equator defines the source orientation. |

---

## [](https://www.npmjs.com/package/astronomy-engine#rotation_eqd_hortime-observer--rotationmatrix)Rotation_EQD_HOR(time, observer) ⇒ [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix)

**Kind**: global function  
**Returns**: [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix) - A rotation matrix that converts EQD to HOR at `time` and for `observer`. The components of the horizontal vector are: x = north, y = west, z = zenith (straight up from the observer). These components are chosen so that the "right-hand rule" works for the vector and so that north represents the direction where azimuth = 0.  
**Brief**: Calculates a rotation matrix from equatorial of-date (EQD) to horizontal (HOR).

This is one of the family of functions that returns a rotation matrix for converting from one orientation to another. Source: EQD = equatorial system, using equator of the specified date/time. Target: HOR = horizontal system.

Use `HorizonFromVector` to convert the return value to a traditional altitude/azimuth pair.

| Param    | Type                                                                                  | Description                                                                     |
| -------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| time     | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The date and time at which the Earth's equator applies.                         |
| observer | [`Observer`](https://www.npmjs.com/package/astronomy-engine#Observer)                 | A location near the Earth's mean sea level that defines the observer's horizon. |

---

## [](https://www.npmjs.com/package/astronomy-engine#rotation_eqj_ecl--rotationmatrix)Rotation_EQJ_ECL() ⇒ [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix)

**Kind**: global function  
**Returns**: [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix) - A rotation matrix that converts EQJ to ECL.  
**Brief**: Calculates a rotation matrix from J2000 mean equator (EQJ) to J2000 mean ecliptic (ECL).

This is one of the family of functions that returns a rotation matrix for converting from one orientation to another. Source: EQJ = equatorial system, using equator at J2000 epoch. Target: ECL = ecliptic system, using equator at J2000 epoch.

---

## [](https://www.npmjs.com/package/astronomy-engine#rotation_eqj_ecttime--rotationmatrix)Rotation_EQJ_ECT(time) ⇒ [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix)

**Kind**: global function  
**Returns**: [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix) - A rotation matrix that converts EQJ to ECT at `time`.  
**Brief**: Calculates a rotation matrix from J2000 mean equator (EQJ) to true ecliptic of date (ECT).

This is one of the family of functions that returns a rotation matrix for converting from one orientation to another. Source: EQJ = equatorial system, using equator at J2000 epoch. Target: ECT = ecliptic system, using true equinox of the specified date/time.

| Param | Type                                                                                  | Description                                                                    |
| ----- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| time  | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The date and time at which the Earth's equator defines the target orientation. |

---

## [](https://www.npmjs.com/package/astronomy-engine#rotation_eqj_eqdtime--rotationmatrix)Rotation_EQJ_EQD(time) ⇒ [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix)

**Kind**: global function  
**Returns**: [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix) - A rotation matrix that converts EQJ to EQD at `time`.  
**Brief**: Calculates a rotation matrix from J2000 mean equator (EQJ) to equatorial of-date (EQD).

This is one of the family of functions that returns a rotation matrix for converting from one orientation to another. Source: EQJ = equatorial system, using equator at J2000 epoch. Target: EQD = equatorial system, using equator of the specified date/time.

| Param | Type                                                                                  | Description                                                                    |
| ----- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| time  | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The date and time at which the Earth's equator defines the target orientation. |

---

## [](https://www.npmjs.com/package/astronomy-engine#rotation_eqj_gal--rotationmatrix)Rotation_EQJ_GAL() ⇒ [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix)

**Kind**: global function  
**Returns**: [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix) - A rotation matrix that converts EQJ to GAL.  
**Brief**: Calculates a rotation matrix from J2000 mean equator (EQJ) to galactic (GAL).

This is one of the family of functions that returns a rotation matrix for converting from one orientation to another. Source: EQJ = equatorial system, using the equator at the J2000 epoch. Target: GAL = galactic system (IAU 1958 definition).

---

## [](https://www.npmjs.com/package/astronomy-engine#rotation_eqj_hortime-observer--rotationmatrix)Rotation_EQJ_HOR(time, observer) ⇒ [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix)

**Kind**: global function  
**Returns**: [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix) - A rotation matrix that converts EQJ to HOR at `time` and for `observer`. The components of the horizontal vector are: x = north, y = west, z = zenith (straight up from the observer). These components are chosen so that the "right-hand rule" works for the vector and so that north represents the direction where azimuth = 0.  
**Brief**: Calculates a rotation matrix from J2000 mean equator (EQJ) to horizontal (HOR).

This is one of the family of functions that returns a rotation matrix for converting from one orientation to another. Source: EQJ = equatorial system, using the equator at the J2000 epoch. Target: HOR = horizontal system.

Use [HorizonFromVector](https://www.npmjs.com/package/astronomy-engine#HorizonFromVector) to convert the return value to a traditional altitude/azimuth pair.

| Param    | Type                                                                                  | Description                                                                     |
| -------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| time     | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The date and time of the desired horizontal orientation.                        |
| observer | [`Observer`](https://www.npmjs.com/package/astronomy-engine#Observer)                 | A location near the Earth's mean sea level that defines the observer's horizon. |

---

## [](https://www.npmjs.com/package/astronomy-engine#rotation_gal_eqj--rotationmatrix)Rotation_GAL_EQJ() ⇒ [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix)

**Kind**: global function  
**Returns**: [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix) - A rotation matrix that converts GAL to EQJ.  
**Brief**: Calculates a rotation matrix from galactic (GAL) to J2000 mean equator (EQJ).

This is one of the family of functions that returns a rotation matrix for converting from one orientation to another. Source: GAL = galactic system (IAU 1958 definition). Target: EQJ = equatorial system, using the equator at the J2000 epoch.

---

## [](https://www.npmjs.com/package/astronomy-engine#rotation_hor_ecltime-observer--rotationmatrix)Rotation_HOR_ECL(time, observer) ⇒ [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix)

**Kind**: global function  
**Returns**: [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix) - A rotation matrix that converts HOR to ECL.  
**Brief**: Calculates a rotation matrix from horizontal (HOR) to J2000 mean ecliptic (ECL).

This is one of the family of functions that returns a rotation matrix for converting from one orientation to another. Source: HOR = horizontal system. Target: ECL = ecliptic system, using equator at J2000 epoch.

| Param    | Type                                                                                  | Description                                      |
| -------- | ------------------------------------------------------------------------------------- | ------------------------------------------------ |
| time     | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The date and time of the horizontal observation. |
| observer | [`Observer`](https://www.npmjs.com/package/astronomy-engine#Observer)                 | The location of the horizontal observer.         |

---

## [](https://www.npmjs.com/package/astronomy-engine#rotation_hor_eqdtime-observer--rotationmatrix)Rotation_HOR_EQD(time, observer) ⇒ [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix)

**Kind**: global function  
**Returns**: [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix) - A rotation matrix that converts HOR to EQD at `time` and for `observer`.  
**Brief**: Calculates a rotation matrix from horizontal (HOR) to equatorial of-date (EQD).

This is one of the family of functions that returns a rotation matrix for converting from one orientation to another. Source: HOR = horizontal system (x=North, y=West, z=Zenith). Target: EQD = equatorial system, using equator of the specified date/time.

| Param    | Type                                                                                  | Description                                                                     |
| -------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| time     | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The date and time at which the Earth's equator applies.                         |
| observer | [`Observer`](https://www.npmjs.com/package/astronomy-engine#Observer)                 | A location near the Earth's mean sea level that defines the observer's horizon. |

---

## [](https://www.npmjs.com/package/astronomy-engine#rotation_hor_eqjtime-observer--rotationmatrix)Rotation_HOR_EQJ(time, observer) ⇒ [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix)

**Kind**: global function  
**Returns**: [`RotationMatrix`](https://www.npmjs.com/package/astronomy-engine#RotationMatrix) - A rotation matrix that converts HOR to EQJ at `time` and for `observer`.  
**Brief**: Calculates a rotation matrix from horizontal (HOR) to J2000 equatorial (EQJ).

This is one of the family of functions that returns a rotation matrix for converting from one orientation to another. Source: HOR = horizontal system (x=North, y=West, z=Zenith). Target: EQJ = equatorial system, using equator at the J2000 epoch.

| Param    | Type                                                                                  | Description                                                                     |
| -------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| time     | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The date and time of the observation.                                           |
| observer | [`Observer`](https://www.npmjs.com/package/astronomy-engine#Observer)                 | A location near the Earth's mean sea level that defines the observer's horizon. |

---

## [](https://www.npmjs.com/package/astronomy-engine#searchfunc-t1-t2-options--astrotime--null)Search(func, t1, t2, options) ⇒ [`AstroTime`](https://www.npmjs.com/package/astronomy-engine#AstroTime) | `null`

**Kind**: global function  
**Returns**: [`AstroTime`](https://www.npmjs.com/package/astronomy-engine#AstroTime) | `null` - If the search is successful, returns the date and time of the solution. If the search fails, returns `null`.  
**Brief**: Finds the time when a function ascends through zero.

Search for next time _t_ (such that _t_ is between `t1` and `t2`) that `func(t)` crosses from a negative value to a non-negative value. The given function must have "smooth" behavior over the entire inclusive range \[`t1`, `t2`\], meaning that it behaves like a continuous differentiable function. It is not required that `t1` < `t2`; `t1` > `t2` allows searching backward in time. Note: `t1` and `t2` must be chosen such that there is no possibility of more than one zero-crossing (ascending or descending), or it is possible that the "wrong" event will be found (i.e. not the first event after t1) or even that the function will return `null`, indicating that no event was found.

| Param   | Type                                                                            | Description                                                                                                                                                                                                                                                                                            |
| ------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| func    | `function`                                                                      | The function to find an ascending zero crossing for. The function must accept a single parameter of type [AstroTime](https://www.npmjs.com/package/astronomy-engine#AstroTime) and return a numeric value: function([AstroTime](https://www.npmjs.com/package/astronomy-engine#AstroTime)) => `number` |
| t1      | [`AstroTime`](https://www.npmjs.com/package/astronomy-engine#AstroTime)         | The lower time bound of a search window.                                                                                                                                                                                                                                                               |
| t2      | [`AstroTime`](https://www.npmjs.com/package/astronomy-engine#AstroTime)         | The upper time bound of a search window.                                                                                                                                                                                                                                                               |
| options | [`SearchOptions`](https://www.npmjs.com/package/astronomy-engine#SearchOptions) | `undefined`                                                                                                                                                                                                                                                                                            | Options that can tune the behavior of the search. Most callers can omit this argument. |

---

## [](https://www.npmjs.com/package/astronomy-engine#searchaltitudebody-observer-direction-datestart-limitdays-altitude--astrotime--null)SearchAltitude(body, observer, direction, dateStart, limitDays, altitude) ⇒ [`AstroTime`](https://www.npmjs.com/package/astronomy-engine#AstroTime) | `null`

**Kind**: global function  
**Returns**: [`AstroTime`](https://www.npmjs.com/package/astronomy-engine#AstroTime) | `null` - The date and time of the altitude event, or null if no such event occurs within the specified time window.  
**Brief**: Finds the next time the center of a body passes through a given altitude.

Finds when the center of the given body ascends or descends through a given altitude angle, as seen by an observer at the specified location on the Earth. By using the appropriate combination of `direction` and `altitude` parameters, this function can be used to find when civil, nautical, or astronomical twilight begins (dawn) or ends (dusk).

Civil dawn begins before sunrise when the Sun ascends through 6 degrees below the horizon. To find civil dawn, pass +1 for `direction` and -6 for `altitude`.

Civil dusk ends after sunset when the Sun descends through 6 degrees below the horizon. To find civil dusk, pass -1 for `direction` and -6 for `altitude`.

Nautical twilight is similar to civil twilight, only the `altitude` value should be -12 degrees.

Astronomical twilight uses -18 degrees as the `altitude` value.

By convention for twilight time calculations, the altitude is not corrected for atmospheric refraction. This is because the target altitudes are below the horizon, and refraction is not directly observable.

`SearchAltitude` is not intended to find rise/set times of a body for two reasons: (1) Rise/set times of the Sun or Moon are defined by their topmost visible portion, not their centers. (2) Rise/set times are affected significantly by atmospheric refraction. Therefore, it is better to use [SearchRiseSet](https://www.npmjs.com/package/astronomy-engine#SearchRiseSet) to find rise/set times, which corrects for both of these considerations.

`SearchAltitude` will not work reliably for altitudes at or near the body's maximum or minimum altitudes. To find the time a body reaches minimum or maximum altitude angles, use [SearchHourAngle](https://www.npmjs.com/package/astronomy-engine#SearchHourAngle).

| Param     | Type                                                                                  | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| body      | [`Body`](https://www.npmjs.com/package/astronomy-engine#Body)                         | The Sun, Moon, any planet other than the Earth, or a user-defined star that was created by a call to [DefineStar](https://www.npmjs.com/package/astronomy-engine#DefineStar).                                                                                                                                                                                                                                                                                                                                                                |
| observer  | [`Observer`](https://www.npmjs.com/package/astronomy-engine#Observer)                 | Specifies the geographic coordinates and elevation above sea level of the observer.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| direction | `number`                                                                              | Either +1 to find when the body ascends through the altitude, or -1 for when the body descends through the altitude. Any other value will cause an exception to be thrown.                                                                                                                                                                                                                                                                                                                                                                   |
| dateStart | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The date and time after which the specified altitude event is to be found.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| limitDays | `number`                                                                              | Limits how many days to search for the body reaching the altitude angle, and defines the direction in time to search. When `limitDays` is positive, the search is performed into the future, after `dateStart`. When negative, the search is performed into the past, before `dateStart`. To limit the search to the same day, you can use a value of 1 day. In cases where you want to find the altitude event no matter how far in the future (for example, for an observer near the south pole), you can pass in a larger value like 365. |
| altitude  | `number`                                                                              | The desired altitude angle of the body's center above (positive) or below (negative) the observer's local horizon, expressed in degrees. Must be in the range \[-90, +90\].                                                                                                                                                                                                                                                                                                                                                                  |

---

## [](https://www.npmjs.com/package/astronomy-engine#searchglobalsolareclipsestarttime--globalsolareclipseinfo)SearchGlobalSolarEclipse(startTime) ⇒ [`GlobalSolarEclipseInfo`](https://www.npmjs.com/package/astronomy-engine#GlobalSolarEclipseInfo)

**Kind**: global function  
**Brief**: Searches for a solar eclipse visible anywhere on the Earth's surface.

This function finds the first solar eclipse that occurs after `startTime`. A solar eclipse may be partial, annular, or total. See [GlobalSolarEclipseInfo](https://www.npmjs.com/package/astronomy-engine#GlobalSolarEclipseInfo) for more information. To find a series of solar eclipses, call this function once, then keep calling [NextGlobalSolarEclipse](https://www.npmjs.com/package/astronomy-engine#NextGlobalSolarEclipse) as many times as desired, passing in the `peak` value returned from the previous call.

| Param     | Type                                                                                  | Description                                                    |
| --------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| startTime | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The date and time for starting the search for a solar eclipse. |

---

## [](https://www.npmjs.com/package/astronomy-engine#searchhouranglebody-observer-hourangle-datestart-direction--hourangleevent)SearchHourAngle(body, observer, hourAngle, dateStart, direction) ⇒ [`HourAngleEvent`](https://www.npmjs.com/package/astronomy-engine#HourAngleEvent)

**Kind**: global function  
**Brief**: Searches for the time when the center of a body reaches a specified hour angle as seen by an observer on the Earth.

The _hour angle_ of a celestial body indicates its position in the sky with respect to the Earth's rotation. The hour angle depends on the location of the observer on the Earth. The hour angle is 0 when the body's center reaches its highest angle above the horizon in a given day. The hour angle increases by 1 unit for every sidereal hour that passes after that point, up to 24 sidereal hours when it reaches the highest point again. So the hour angle indicates the number of hours that have passed since the most recent time that the body has culminated, or reached its highest point.

This function searches for the next or previous time a celestial body reaches the given hour angle relative to the date and time specified by `dateStart`. To find when a body culminates, pass 0 for `hourAngle`. To find when a body reaches its lowest point in the sky, pass 12 for `hourAngle`.

Note that, especially close to the Earth's poles, a body as seen on a given day may always be above the horizon or always below the horizon, so the caller cannot assume that a culminating object is visible nor that an object is below the horizon at its minimum altitude.

The function returns the date and time, along with the horizontal coordinates of the body at that time, as seen by the given observer.

| Param     | Type                                                                                  | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| body      | [`Body`](https://www.npmjs.com/package/astronomy-engine#Body)                         | The Sun, Moon, any planet other than the Earth, or a user-defined star that was created by a call to [DefineStar](https://www.npmjs.com/package/astronomy-engine#DefineStar).                                                                                                                                                                                                                                                                                                                                                      |
| observer  | [`Observer`](https://www.npmjs.com/package/astronomy-engine#Observer)                 | Specifies the geographic coordinates and elevation above sea level of the observer.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| hourAngle | `number`                                                                              | The hour angle expressed in [sidereal](https://en.wikipedia.org/wiki/Sidereal_time) hours for which the caller seeks to find the body attain. The value must be in the range \[0, 24). The hour angle represents the number of sidereal hours that have elapsed since the most recent time the body crossed the observer's local [meridian](<https://en.wikipedia.org/wiki/Meridian_(astronomy)>). This specifying `hourAngle` = 0 finds the moment in time the body reaches the highest angular altitude in a given sidereal day. |
| dateStart | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The date and time after which the desired hour angle crossing event is to be found.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| direction | `number`                                                                              | The direction in time to perform the search: a positive value searches forward in time, a negative value searches backward in time. The function throws an exception if `direction` is zero.                                                                                                                                                                                                                                                                                                                                       |

---

## [](https://www.npmjs.com/package/astronomy-engine#searchlocalsolareclipsestarttime-observer--localsolareclipseinfo)SearchLocalSolarEclipse(startTime, observer) ⇒ [`LocalSolarEclipseInfo`](https://www.npmjs.com/package/astronomy-engine#LocalSolarEclipseInfo)

**Kind**: global function  
**Brief**: Searches for a solar eclipse visible at a specific location on the Earth's surface.

This function finds the first solar eclipse that occurs after `startTime`. A solar eclipse may be partial, annular, or total. See [LocalSolarEclipseInfo](https://www.npmjs.com/package/astronomy-engine#LocalSolarEclipseInfo) for more information.

To find a series of solar eclipses, call this function once, then keep calling [NextLocalSolarEclipse](https://www.npmjs.com/package/astronomy-engine#NextLocalSolarEclipse) as many times as desired, passing in the `peak` value returned from the previous call.

IMPORTANT: An eclipse reported by this function might be partly or completely invisible to the observer due to the time of day. See [LocalSolarEclipseInfo](https://www.npmjs.com/package/astronomy-engine#LocalSolarEclipseInfo) for more information about this topic.

| Param     | Type                                                                                  | Description                                                    |
| --------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| startTime | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The date and time for starting the search for a solar eclipse. |
| observer  | [`Observer`](https://www.npmjs.com/package/astronomy-engine#Observer)                 | The geographic location of the observer.                       |

---

## [](https://www.npmjs.com/package/astronomy-engine#searchlunarapsisstartdate--apsis)SearchLunarApsis(startDate) ⇒ [`Apsis`](https://www.npmjs.com/package/astronomy-engine#Apsis)

**Kind**: global function  
**Brief**: Finds the next perigee or apogee of the Moon.

Finds the next perigee (closest approach) or apogee (farthest remove) of the Moon that occurs after the specified date and time.

| Param     | Type                                                                                  | Description                                                       |
| --------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| startDate | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The date and time after which to find the next perigee or apogee. |

---

## [](https://www.npmjs.com/package/astronomy-engine#searchlunareclipsedate--lunareclipseinfo)SearchLunarEclipse(date) ⇒ [`LunarEclipseInfo`](https://www.npmjs.com/package/astronomy-engine#LunarEclipseInfo)

**Kind**: global function  
**Brief**: Searches for a lunar eclipse.

This function finds the first lunar eclipse that occurs after `startTime`. A lunar eclipse may be penumbral, partial, or total. See [LunarEclipseInfo](https://www.npmjs.com/package/astronomy-engine#LunarEclipseInfo) for more information. To find a series of lunar eclipses, call this function once, then keep calling [NextLunarEclipse](https://www.npmjs.com/package/astronomy-engine#NextLunarEclipse) as many times as desired, passing in the `peak` value returned from the previous call.

| Param | Type                                                                                  | Description                                                    |
| ----- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| date  | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The date and time for starting the search for a lunar eclipse. |

---

## [](https://www.npmjs.com/package/astronomy-engine#searchmaxelongationbody-startdate--elongationevent)SearchMaxElongation(body, startDate) ⇒ [`ElongationEvent`](https://www.npmjs.com/package/astronomy-engine#ElongationEvent)

**Kind**: global function  
**Brief**: Finds the next time Mercury or Venus reaches maximum elongation.

Searches for the next maximum elongation event for Mercury or Venus that occurs after the given start date. Calling with other values of `body` will result in an exception. Maximum elongation occurs when the body has the greatest angular separation from the Sun, as seen from the Earth. Returns an `ElongationEvent` object containing the date and time of the next maximum elongation, the elongation in degrees, and whether the body is visible in the morning or evening.

| Param     | Type                                                                                  | Description                                                                    |
| --------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| body      | [`Body`](https://www.npmjs.com/package/astronomy-engine#Body)                         | Either `Body.Mercury` or `Body.Venus`.                                         |
| startDate | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The date and time after which to search for the next maximum elongation event. |

---

## [](https://www.npmjs.com/package/astronomy-engine#searchmoonnodestarttime--nodeeventinfo)SearchMoonNode(startTime) ⇒ [`NodeEventInfo`](https://www.npmjs.com/package/astronomy-engine#NodeEventInfo)

**Kind**: global function  
**Brief**: Searches for a time when the Moon's center crosses through the ecliptic plane.

Searches for the first ascending or descending node of the Moon after `startTime`. An ascending node is when the Moon's center passes through the ecliptic plane (the plane of the Earth's orbit around the Sun) from south to north. A descending node is when the Moon's center passes through the ecliptic plane from north to south. Nodes indicate possible times of solar or lunar eclipses, if the Moon also happens to be in the correct phase (new or full, respectively). Call `SearchMoonNode` to find the first of a series of nodes. Then call [NextMoonNode](https://www.npmjs.com/package/astronomy-engine#NextMoonNode) to find as many more consecutive nodes as desired.

| Param     | Type                                                                                  | Description                                                                                |
| --------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| startTime | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The date and time for starting the search for an ascending or descending node of the Moon. |

---

## [](https://www.npmjs.com/package/astronomy-engine#searchmoonphasetargetlon-datestart-limitdays--astrotime--null)SearchMoonPhase(targetLon, dateStart, limitDays) ⇒ [`AstroTime`](https://www.npmjs.com/package/astronomy-engine#AstroTime) | `null`

**Kind**: global function  
**Returns**: [`AstroTime`](https://www.npmjs.com/package/astronomy-engine#AstroTime) | `null` - If successful, returns the date and time the moon reaches the phase specified by `targetlon`. This function will return `null` if the phase does not occur within `limitDays` of `startTime`; that is, if the search window is too small.  
**Brief**: Searches for the date and time that the Moon reaches a specified phase.

Lunar phases are defined in terms of geocentric ecliptic longitudes with respect to the Sun. When the Moon and the Sun have the same ecliptic longitude, that is defined as a new moon. When the two ecliptic longitudes are 180 degrees apart, that is defined as a full moon. To enumerate quarter lunar phases, it is simpler to call [SearchMoonQuarter](https://www.npmjs.com/package/astronomy-engine#SearchMoonQuarter) once, followed by repeatedly calling [NextMoonQuarter](https://www.npmjs.com/package/astronomy-engine#NextMoonQuarter). `SearchMoonPhase` is only necessary for finding other lunar phases than the usual quarter phases.

| Param     | Type                                                                                  | Description                                                                                                                                                                                                                                                                 |
| --------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| targetLon | `number`                                                                              | The difference in geocentric ecliptic longitude between the Sun and Moon that specifies the lunar phase being sought. This can be any value in the range \[0, 360). Here are some helpful examples: 0 = new moon, 90 = first quarter, 180 = full moon, 270 = third quarter. |
| dateStart | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The beginning of the window of time in which to search.                                                                                                                                                                                                                     |
| limitDays | `number`                                                                              | The floating point number of days away from `dateStart` that limits the window of time in which to search. If the value is negative, the search is performed into the past from `startTime`. Otherwise, the search is performed into the future from `startTime`.           |

---

## [](https://www.npmjs.com/package/astronomy-engine#searchmoonquarterdatestart--moonquarter)SearchMoonQuarter(dateStart) ⇒ [`MoonQuarter`](https://www.npmjs.com/package/astronomy-engine#MoonQuarter)

**Kind**: global function  
**Brief**: Finds the first quarter lunar phase after the specified date and time.

The quarter lunar phases are: new moon, first quarter, full moon, and third quarter. To enumerate quarter lunar phases, call `SearchMoonQuarter` once, then pass its return value to [NextMoonQuarter](https://www.npmjs.com/package/astronomy-engine#NextMoonQuarter) to find the next `MoonQuarter`. Keep calling `NextMoonQuarter` in a loop, passing the previous return value as the argument to the next call.

| Param     | Type                                                                                  | Description                                                          |
| --------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| dateStart | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The date and time after which to find the first quarter lunar phase. |

---

## [](https://www.npmjs.com/package/astronomy-engine#searchpeakmagnitudebody-startdate--illuminationinfo)SearchPeakMagnitude(body, startDate) ⇒ [`IlluminationInfo`](https://www.npmjs.com/package/astronomy-engine#IlluminationInfo)

**Kind**: global function  
**Brief**: Searches for the date and time Venus will next appear brightest as seen from the Earth.

| Param     | Type                                                                                  | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| body      | [`Body`](https://www.npmjs.com/package/astronomy-engine#Body)                         | Currently only `Body.Venus` is supported. Mercury's peak magnitude occurs at superior conjunction, when it is impossible to see from Earth, so peak magnitude events have little practical value for that planet. The Moon reaches peak magnitude very close to full moon, which can be found using [SearchMoonQuarter](https://www.npmjs.com/package/astronomy-engine#SearchMoonQuarter) or [SearchMoonPhase](https://www.npmjs.com/package/astronomy-engine#SearchMoonPhase). The other planets reach peak magnitude very close to opposition, which can be found using [SearchRelativeLongitude](https://www.npmjs.com/package/astronomy-engine#SearchRelativeLongitude). |
| startDate | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The date and time after which to find the next peak magnitude event.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

---

## [](https://www.npmjs.com/package/astronomy-engine#searchplanetapsisbody-starttime--apsis)SearchPlanetApsis(body, startTime) ⇒ [`Apsis`](https://www.npmjs.com/package/astronomy-engine#Apsis)

**Kind**: global function  
**Returns**: [`Apsis`](https://www.npmjs.com/package/astronomy-engine#Apsis) - The next perihelion or aphelion that occurs after `startTime`.  
**Brief**: Finds the next perihelion or aphelion of a planet.

Finds the date and time of a planet's perihelion (closest approach to the Sun) or aphelion (farthest distance from the Sun) after a given time.

Given a date and time to start the search in `startTime`, this function finds the next date and time that the center of the specified planet reaches the closest or farthest point in its orbit with respect to the center of the Sun, whichever comes first after `startTime`.

The closest point is called _perihelion_ and the farthest point is called _aphelion_. The word _apsis_ refers to either event.

To iterate through consecutive alternating perihelion and aphelion events, call `SearchPlanetApsis` once, then use the return value to call [NextPlanetApsis](https://www.npmjs.com/package/astronomy-engine#NextPlanetApsis). After that, keep feeding the previous return value from `NextPlanetApsis` into another call of `NextPlanetApsis` as many times as desired.

| Param     | Type                                                                                  | Description                                                                                                   |
| --------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| body      | [`Body`](https://www.npmjs.com/package/astronomy-engine#Body)                         | The planet for which to find the next perihelion/aphelion event. Not allowed to be `Body.Sun` or `Body.Moon`. |
| startTime | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The date and time at which to start searching for the next perihelion or aphelion.                            |

---

## [](https://www.npmjs.com/package/astronomy-engine#searchrelativelongitudebody-targetrellon-startdate--astrotime)SearchRelativeLongitude(body, targetRelLon, startDate) ⇒ [`AstroTime`](https://www.npmjs.com/package/astronomy-engine#AstroTime)

**Kind**: global function  
**Returns**: [`AstroTime`](https://www.npmjs.com/package/astronomy-engine#AstroTime) - The time when the Earth and the body next reach the specified relative longitudes.  
**Brief**: Searches for when the Earth and a given body reach a relative ecliptic longitude separation.

Searches for the date and time the relative ecliptic longitudes of the specified body and the Earth, as seen from the Sun, reach a certain difference. This function is useful for finding conjunctions and oppositions of the planets. For the opposition of a superior planet (Mars, Jupiter, ..., Pluto), or the inferior conjunction of an inferior planet (Mercury, Venus), call with `targetRelLon` = 0. The 0 value indicates that both planets are on the same ecliptic longitude line, ignoring the other planet's distance above or below the plane of the Earth's orbit. For superior conjunctions, call with `targetRelLon` = 180. This means the Earth and the other planet are on opposite sides of the Sun.

| Param        | Type                                                                                  | Description                                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| body         | [`Body`](https://www.npmjs.com/package/astronomy-engine#Body)                         | Any planet other than the Earth.                                                                                                       |
| targetRelLon | `number`                                                                              | The desired angular difference in degrees between the ecliptic longitudes of `body` and the Earth. Must be in the range (-180, +180\]. |
| startDate    | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The date and time after which to find the next occurrence of the body and the Earth reaching the desired relative longitude.           |

---

## [](https://www.npmjs.com/package/astronomy-engine#searchrisesetbody-observer-direction-datestart-limitdays-metersaboveground--astrotime--null)SearchRiseSet(body, observer, direction, dateStart, limitDays, metersAboveGround) ⇒ [`AstroTime`](https://www.npmjs.com/package/astronomy-engine#AstroTime) | `null`

**Kind**: global function  
**Returns**: [`AstroTime`](https://www.npmjs.com/package/astronomy-engine#AstroTime) | `null` - The date and time of the rise or set event, or null if no such event occurs within the specified time window.  
**Brief**: Searches for the next time a celestial body rises or sets as seen by an observer on the Earth.

This function finds the next rise or set time of the Sun, Moon, or planet other than the Earth. Rise time is when the body first starts to be visible above the horizon. For example, sunrise is the moment that the top of the Sun first appears to peek above the horizon. Set time is the moment when the body appears to vanish below the horizon. Therefore, this function adjusts for the apparent angular radius of the observed body (significant only for the Sun and Moon).

This function corrects for a typical value of atmospheric refraction, which causes celestial bodies to appear higher above the horizon than they would if the Earth had no atmosphere. Astronomy Engine uses a correction of 34 arcminutes. Real-world refraction varies based on air temperature, pressure, and humidity; such weather-based conditions are outside the scope of Astronomy Engine.

Note that rise or set may not occur in every 24 hour period. For example, near the Earth's poles, there are long periods of time where the Sun stays below the horizon, never rising. Also, it is possible for the Moon to rise just before midnight but not set during the subsequent 24-hour day. This is because the Moon sets nearly an hour later each day due to orbiting the Earth a significant amount during each rotation of the Earth. Therefore callers must not assume that the function will always succeed.

| Param             | Type                                                                                  | Default | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| body              | [`Body`](https://www.npmjs.com/package/astronomy-engine#Body)                         |         | The Sun, Moon, any planet other than the Earth, or a user-defined star that was created by a call to [DefineStar](https://www.npmjs.com/package/astronomy-engine#DefineStar).                                                                                                                                                                                                                                                                                                                                                             |
| observer          | [`Observer`](https://www.npmjs.com/package/astronomy-engine#Observer)                 |         | Specifies the geographic coordinates and elevation above sea level of the observer.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| direction         | `number`                                                                              |         | Either +1 to find rise time or -1 to find set time. Any other value will cause an exception to be thrown.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| dateStart         | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) |         | The date and time after which the specified rise or set time is to be found.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| limitDays         | `number`                                                                              |         | Limits how many days to search for a rise or set time, and defines the direction in time to search. When `limitDays` is positive, the search is performed into the future, after `dateStart`. When negative, the search is performed into the past, before `dateStart`. To limit a rise or set time to the same day, you can use a value of 1 day. In cases where you want to find the next rise or set time no matter how far in the future (for example, for an observer near the south pole), you can pass in a larger value like 365. |
| metersAboveGround | `number`                                                                              | `0`     | Defaults to 0.0 if omitted. Usually the observer is located at ground level. Then this parameter should be zero. But if the observer is significantly higher than ground level, for example in an airplane, this parameter should be a positive number indicating how far above the ground the observer is. An exception occurs if `metersAboveGround` is negative.                                                                                                                                                                       |

---

## [](https://www.npmjs.com/package/astronomy-engine#searchsunlongitudetargetlon-datestart-limitdays--astrotime--null)SearchSunLongitude(targetLon, dateStart, limitDays) ⇒ [`AstroTime`](https://www.npmjs.com/package/astronomy-engine#AstroTime) | `null`

**Kind**: global function  
**Returns**: [`AstroTime`](https://www.npmjs.com/package/astronomy-engine#AstroTime) | `null` - The date and time when the Sun reaches the apparent ecliptic longitude `targetLon` within the range of times specified by `dateStart` and `limitDays`. If the Sun does not reach the target longitude within the specified time range, or the time range is excessively wide, the return value is `null`. To avoid a `null` return value, the caller must pick a time window around the event that is within a few days but not so small that the event might fall outside the window.  
**Brief**: Searches for when the Sun reaches a given ecliptic longitude.

Searches for the moment in time when the center of the Sun reaches a given apparent ecliptic longitude, as seen from the center of the Earth, within a given range of dates. This function can be used to determine equinoxes and solstices. However, it is usually more convenient and efficient to call [Seasons](https://www.npmjs.com/package/astronomy-engine#Seasons) to calculate equinoxes and solstices for a given calendar year. `SearchSunLongitude` is more general in that it allows searching for arbitrary longitude values.

| Param     | Type                                                                                  | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| targetLon | `number`                                                                              | The desired ecliptic longitude of date in degrees. This may be any value in the range \[0, 360), although certain values have conventional meanings: When `targetLon` is 0, finds the March equinox, which is the moment spring begins in the northern hemisphere and the beginning of autumn in the southern hemisphere. When `targetLon` is 180, finds the September equinox, which is the moment autumn begins in the northern hemisphere and spring begins in the southern hemisphere. When `targetLon` is 90, finds the northern solstice, which is the moment summer begins in the northern hemisphere and winter begins in the southern hemisphere. When `targetLon` is 270, finds the southern solstice, which is the moment winter begins in the northern hemisphere and summer begins in the southern hemisphere. |
| dateStart | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | A date and time known to be earlier than the desired longitude event.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| limitDays | `number`                                                                              | A floating point number of days, which when added to `dateStart`, yields a date and time known to be after the desired longitude event.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

---

## [](https://www.npmjs.com/package/astronomy-engine#searchtransitbody-starttime--transitinfo)SearchTransit(body, startTime) ⇒ [`TransitInfo`](https://www.npmjs.com/package/astronomy-engine#TransitInfo)

**Kind**: global function  
**Brief**: Searches for the first transit of Mercury or Venus after a given date.

Finds the first transit of Mercury or Venus after a specified date. A transit is when an inferior planet passes between the Sun and the Earth so that the silhouette of the planet is visible against the Sun in the background. To continue the search, pass the `finish` time in the returned structure to [NextTransit](https://www.npmjs.com/package/astronomy-engine#NextTransit).

| Param     | Type                                                                                  | Description                                                                      |
| --------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| body      | [`Body`](https://www.npmjs.com/package/astronomy-engine#Body)                         | The planet whose transit is to be found. Must be `Body.Mercury` or `Body.Venus`. |
| startTime | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The date and time for starting the search for a transit.                         |

---

## [](https://www.npmjs.com/package/astronomy-engine#seasonsyear--seasoninfo)Seasons(year) ⇒ [`SeasonInfo`](https://www.npmjs.com/package/astronomy-engine#SeasonInfo)

**Kind**: global function  
**Brief**: Finds the equinoxes and solstices for a given calendar year.

| Param | Type     | Description                                                             |
| ----- | -------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| year  | `number` | [`AstroTime`](https://www.npmjs.com/package/astronomy-engine#AstroTime) | The integer value or `AstroTime` object that specifies the UTC calendar year for which to find equinoxes and solstices. |

---

## [](https://www.npmjs.com/package/astronomy-engine#siderealtimedate--number)SiderealTime(date) ⇒ `number`

**Kind**: global function  
**Brief**: Calculates Greenwich Apparent Sidereal Time (GAST).

Given a date and time, this function calculates the rotation of the Earth, represented by the equatorial angle of the Greenwich prime meridian with respect to distant stars (not the Sun, which moves relative to background stars by almost one degree per day). This angle is called Greenwich Apparent Sidereal Time (GAST). GAST is measured in sidereal hours in the half-open range \[0, 24). When GAST = 0, it means the prime meridian is aligned with the of-date equinox, corrected at that time for precession and nutation of the Earth's axis. In this context, the "equinox" is the direction in space where the Earth's orbital plane (the ecliptic) intersects with the plane of the Earth's equator, at the location on the Earth's orbit of the (seasonal) March equinox. As the Earth rotates, GAST increases from 0 up to 24 sidereal hours, then starts over at 0. To convert to degrees, multiply the return value by 15.

| Param | Type                                                                                  | Description                               |
| ----- | ------------------------------------------------------------------------------------- | ----------------------------------------- |
| date  | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The date and time for which to find GAST. |

---

## [](https://www.npmjs.com/package/astronomy-engine#spherefromvectorvector--spherical)SphereFromVector(vector) ⇒ [`Spherical`](https://www.npmjs.com/package/astronomy-engine#Spherical)

**Kind**: global function  
**Returns**: [`Spherical`](https://www.npmjs.com/package/astronomy-engine#Spherical) - Spherical coordinates that are equivalent to the given vector.  
**Brief**: Converts Cartesian coordinates to spherical coordinates.

Given a Cartesian vector, returns latitude, longitude, and distance.

| Param  | Type                                                              | Description                                                |
| ------ | ----------------------------------------------------------------- | ---------------------------------------------------------- |
| vector | [`Vector`](https://www.npmjs.com/package/astronomy-engine#Vector) | Cartesian vector to be converted to spherical coordinates. |

---

## [](https://www.npmjs.com/package/astronomy-engine#sunpositiondate--eclipticcoordinates)SunPosition(date) ⇒ [`EclipticCoordinates`](https://www.npmjs.com/package/astronomy-engine#EclipticCoordinates)

**Kind**: global function  
**Brief**: Returns apparent geocentric true ecliptic coordinates of date for the Sun.

This function is used for calculating the times of equinoxes and solstices.

_Geocentric_ means coordinates as the Sun would appear to a hypothetical observer at the center of the Earth. _Ecliptic coordinates of date_ are measured along the plane of the Earth's mean orbit around the Sun, using the [equinox](<https://en.wikipedia.org/wiki/Equinox_(celestial_coordinates)>) of the Earth as adjusted for precession and nutation of the Earth's axis of rotation on the given date.

| Param | Type                                                                                  | Description                                                                                               |
| ----- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| date  | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The date and time at which to calculate the Sun's apparent location as seen from the center of the Earth. |

---

## [](https://www.npmjs.com/package/astronomy-engine#vectorfromhorizonsphere-time-refraction--vector)VectorFromHorizon(sphere, time, refraction) ⇒ [`Vector`](https://www.npmjs.com/package/astronomy-engine#Vector)

**Kind**: global function  
**Returns**: [`Vector`](https://www.npmjs.com/package/astronomy-engine#Vector) - A vector in the horizontal system: `x` = north, `y` = west, and `z` = zenith (up).  
**Brief**: Given apparent angular horizontal coordinates in `sphere`, calculate horizontal vector.

| Param      | Type                                                                                  | Description                                                                                                                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| sphere     | [`Spherical`](https://www.npmjs.com/package/astronomy-engine#Spherical)               | A structure that contains apparent horizontal coordinates: `lat` holds the refracted altitude angle, `lon` holds the azimuth in degrees clockwise from north, and `dist` holds the distance from the observer to the object in AU. |
| time       | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The date and time of the observation. This is needed because the returned vector object requires a valid time value when passed to certain other functions.                                                                        |
| refraction | `string`                                                                              | `"normal"`: correct altitude for atmospheric refraction (recommended). `"jplhor"`: for JPL Horizons compatibility testing only; not recommended for normal use. `null`: no atmospheric refraction correction is performed.         |

---

## [](https://www.npmjs.com/package/astronomy-engine#vectorfromspheresphere-time--vector)VectorFromSphere(sphere, time) ⇒ [`Vector`](https://www.npmjs.com/package/astronomy-engine#Vector)

**Kind**: global function  
**Returns**: [`Vector`](https://www.npmjs.com/package/astronomy-engine#Vector) - The vector form of the supplied spherical coordinates.  
**Brief**: Converts spherical coordinates to Cartesian coordinates.

Given spherical coordinates and a time at which they are valid, returns a vector of Cartesian coordinates. The returned value includes the time, as required by `AstroTime`.

| Param  | Type                                                                                  | Description                                              |
| ------ | ------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| sphere | [`Spherical`](https://www.npmjs.com/package/astronomy-engine#Spherical)               | Spherical coordinates to be converted.                   |
| time   | [`FlexibleDateTime`](https://www.npmjs.com/package/astronomy-engine#FlexibleDateTime) | The time that should be included in the returned vector. |

---

## [](https://www.npmjs.com/package/astronomy-engine#vectorobservervector-ofdate--observer)VectorObserver(vector, ofdate) ⇒ [`Observer`](https://www.npmjs.com/package/astronomy-engine#Observer)

**Kind**: global function  
**Returns**: [`Observer`](https://www.npmjs.com/package/astronomy-engine#Observer) - The geographic latitude, longitude, and elevation above sea level that corresponds to the given equatorial vector.  
**Brief**: Calculates the geographic location corresponding to an equatorial vector.

This is the inverse function of [ObserverVector](https://www.npmjs.com/package/astronomy-engine#ObserverVector). Given a geocentric equatorial vector, it returns the geographic latitude, longitude, and elevation for that vector.

| Param  | Type                                                              | Description                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------ | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| vector | [`Vector`](https://www.npmjs.com/package/astronomy-engine#Vector) | The geocentric equatorial position vector for which to find geographic coordinates. The components are expressed in Astronomical Units (AU). You can calculate AU by dividing kilometers by the constant [KM_PER_AU](https://www.npmjs.com/package/astronomy-engine#KM_PER_AU). The time `vector.t` determines the Earth's rotation.                                                                            |
| ofdate | `boolean`                                                         | Selects the date of the Earth's equator in which `vector` is expressed. The caller may select `false` to use the orientation of the Earth's equator at noon UTC on January 1, 2000, in which case this function corrects for precession and nutation of the Earth as it was at the moment specified by `vector.t`. Or the caller may select `true` to use the Earth's equator at `vector.t` as the orientation. |

---

## [](https://www.npmjs.com/package/astronomy-engine#flexibledatetime--date--number--astrotime)FlexibleDateTime : `Date` | `number` | [`AstroTime`](https://www.npmjs.com/package/astronomy-engine#AstroTime)

**Kind**: global typedef  
**Brief**: A `Date`, `number`, or `AstroTime` value that specifies the date and time of an astronomical event.

`FlexibleDateTime` is a placeholder type that represents three different types that may be passed to many Astronomy Engine functions: a JavaScript `Date` object, a number representing the real-valued number of UT days since the J2000 epoch, or an [AstroTime](https://www.npmjs.com/package/astronomy-engine#AstroTime) object.

This flexibility is for convenience of outside callers. Internally, Astronomy Engine always converts a `FlexibleDateTime` parameter to an `AstroTime` object by calling [MakeTime](https://www.npmjs.com/package/astronomy-engine#MakeTime).

---

## [](https://www.npmjs.com/package/astronomy-engine#searchoptions--object)SearchOptions : `object`

**Kind**: global typedef  
**Brief**: Options for the [Search](https://www.npmjs.com/package/astronomy-engine#Search) function.  
**Properties**

| Name                 | Type     | Description |
| -------------------- | -------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| dt_tolerance_seconds | `number` | `undefined` | The number of seconds for a time window smaller than which the search is considered successful. Using too large a tolerance can result in an inaccurate time estimate. Using too small a tolerance can cause excessive computation, or can even cause the search to fail because of limited floating-point resolution. Defaults to 1 second. |
| init_f1              | `number` | `undefined` | As an optimization, if the caller of [Search](https://www.npmjs.com/package/astronomy-engine#Search) has already calculated the value of the function being searched (the parameter `func`) at the time coordinate `t1`, it can pass in that value as `init_f1`. For very expensive calculations, this can measurably improve performance.   |
| init_f2              | `number` | `undefined` | The same as `init_f1`, except this is the optional initial value of `func(t2)` instead of `func(t1)`.                                                                                                                                                                                                                                        |
| iter_limit           | `number` | `undefined` |                                                                                                                                                                                                                                                                                                                                              |

---
