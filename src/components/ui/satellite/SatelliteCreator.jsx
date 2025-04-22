import React, { useState } from 'react';
import { Button } from '../button';
import { Label } from '../label';
import { Input } from '../input';
import { Slider } from '../slider';
import { Tabs, TabsList, TabsTrigger } from '../tabs';
import PropTypes from 'prop-types';

const SatelliteCreator = ({ onCreateSatellite }) => {
    const [mode, setMode] = useState('latlon');
    const [formData, setFormData] = useState({
        name: '',
        mass: 100,
        size: 1,
        latitude: 0,
        longitude: 0,
        altitude: 400,
        azimuth: 0,
        velocity: 7.8,
        semiMajorAxis: 6778,
        eccentricity: 0,
        inclination: 51.6,
        raan: 0,
        argumentOfPeriapsis: 0,
        trueAnomaly: 0,
        angleOfAttack: 0,
    });

    const handleInputChange = (e) => {
        const { name: field, value, type } = e.target;
        setFormData(prev => {
            if (type === 'number') {
                const parsed = parseFloat(value);
                return {
                    ...prev,
                    // If parsed is NaN, keep previous; otherwise use parsed
                    [field]: isNaN(parsed) ? prev[field] : parsed
                };
            }
            // For text inputs (e.g. name), keep the raw value
            return { ...prev, [field]: value };
        });
    };

    const handleSliderChange = (name, value) => {
        setFormData(prev => ({
            ...prev,
            [name]: value,
        }));
    };

    const presets = [
        { label: 'ISS', mode: 'orbital', values: { name: 'ISS', mass: 419725, size: 1, semiMajorAxis: 6778, eccentricity: 0.0007, inclination: 51.6, raan: 0, argumentOfPeriapsis: 0, trueAnomaly: 0 } },
        { label: 'Geostationary', mode: 'orbital', values: { name: 'Geostationary', mass: 5000, size: 3, semiMajorAxis: 42164, eccentricity: 0, inclination: 0, raan: 0, argumentOfPeriapsis: 0, trueAnomaly: 0 } },
        { label: 'Molniya', mode: 'orbital', values: { name: 'Molniya', mass: 2200, size: 2, semiMajorAxis: 26600, eccentricity: 0.74, inclination: 63.4, raan: 0, argumentOfPeriapsis: 270, trueAnomaly: 0 } },
        { label: 'Sun-Synchronous', mode: 'orbital', values: { name: 'Sun-Synchronous', mass: 1000, size: 1, semiMajorAxis: 6978, eccentricity: 0.001, inclination: 98, raan: 0, argumentOfPeriapsis: 0, trueAnomaly: 0 } },
        { label: 'GPS IIF', mode: 'orbital', values: { name: 'GPS IIF', mass: 1630, size: 1, semiMajorAxis: 26560, eccentricity: 0.01, inclination: 55, raan: 0, argumentOfPeriapsis: 0, trueAnomaly: 0 } },
        { label: 'Hubble', mode: 'orbital', values: { name: 'Hubble', mass: 11110, size: 1.5, semiMajorAxis: 6918, eccentricity: 0.0005, inclination: 28.5, raan: 0, argumentOfPeriapsis: 0, trueAnomaly: 0 } },
        { label: 'Iridium', mode: 'orbital', values: { name: 'Iridium', mass: 700, size: 0.5, semiMajorAxis: 7151, eccentricity: 0.0002, inclination: 86.4, raan: 0, argumentOfPeriapsis: 0, trueAnomaly: 0 } },
        { label: 'LEO Satellite', mode: 'latlon', values: { name: 'LEO Satellite', mass: 1200, size: 1, latitude: 0, longitude: 0, altitude: 400, velocity: 7.8, azimuth: 0, angleOfAttack: 0 } },
    ];
    const handlePreset = (preset) => {
        setMode(preset.mode);
        setFormData(prev => ({
            ...prev,
            ...preset.values,
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const params = { ...formData };
            
            // Map the parameters based on the mode
            if (mode === 'latlon') {
                await onCreateSatellite({
                    mode,
                    latitude: params.latitude,
                    longitude: params.longitude,
                    altitude: params.altitude,
                    velocity: params.velocity,
                    azimuth: params.azimuth,
                    angleOfAttack: params.angleOfAttack,
                    mass: params.mass,
                    size: params.size,
                    name: params.name || undefined
                });
            } else if (mode === 'orbital') {
                await onCreateSatellite({
                    mode,
                    semiMajorAxis: params.semiMajorAxis,
                    eccentricity: params.eccentricity,
                    inclination: params.inclination,
                    raan: params.raan,
                    argumentOfPeriapsis: params.argumentOfPeriapsis,
                    trueAnomaly: params.trueAnomaly,
                    mass: params.mass,
                    size: params.size,
                    name: params.name || undefined
                });
            } else if (mode === 'circular') {
                await onCreateSatellite({
                    mode,
                    latitude: params.latitude,
                    longitude: params.longitude,
                    altitude: params.altitude,
                    azimuth: params.azimuth,
                    angleOfAttack: params.angleOfAttack,
                    mass: params.mass,
                    size: params.size,
                    name: params.name || undefined
                });
            }
            
            setFormData(prev => ({
                ...prev,
                name: ''  // Reset only the name field after successful creation
            }));
        } catch (error) {
            console.error('Error creating satellite:', error);
        }
    };

    const renderField = (name, label, type = "number", min = null, max = null, step = null, unit = null) => {
        const value = formData[name];
        const isNumeric = type === "number";
        const showSlider = isNumeric && min !== null && max !== null;
        if (name === "name") {
            return (
                <div className="grid grid-cols-12 items-center gap-x-2 gap-y-0.5">
                    <Label htmlFor={name} className="col-span-3 text-xs text-muted-foreground text-right pr-1">
                        {label}{unit ? ` (${unit})` : ''}:
                    </Label>
                    <div className="col-span-9">
                        <Input
                            type="text"
                            id={name}
                            name={name}
                            value={value}
                            onChange={handleInputChange}
                            className="h-6 text-xs py-0 px-1"
                            inputClassName="w-full"
                            required
                            size="sm"
                        />
                    </div>
                </div>
            );
        }
        return (
            <div className="grid grid-cols-12 items-center gap-x-2 gap-y-0.5">
                <Label htmlFor={name} className="col-span-3 text-xs text-muted-foreground text-right pr-1">
                    {label}{unit ? ` (${unit})` : ''}:
                </Label>
                <div className="col-span-3">
                    <Input
                        type={type}
                        id={name}
                        name={name}
                        value={value}
                        onChange={handleInputChange}
                        className="h-6 text-xs py-0 px-1"
                        inputClassName="w-full"
                        min={min}
                        max={max}
                        step="any"
                        size="sm"
                        required
                    />
                </div>
                <div className="col-span-6 flex items-center">
                    {showSlider && (
                        <Slider
                            value={[value]}
                            onValueChange={([newValue]) => handleSliderChange(name, newValue)}
                            min={min}
                            max={max}
                            step={step || (max - min) / 100}
                            className="ml-3 flex-1 h-1"
                        />
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="text-xs p-4">
            {/* General satellite properties */}
            <div className="flex flex-col gap-y-2 mb-4">
                {renderField("name", "Name", "text")}
                {renderField("mass", "Mass", "number", 1, 1000000, 1, "kg")}
                {renderField("size", "Size", "number", 0.1, 10, 0.1, "m")}
            </div>
            <div className="mb-2">
                <Tabs value={mode} onValueChange={setMode}>
                    <TabsList className="flex justify-center gap-0 text-xs mb-2">
                        <TabsTrigger value="latlon" className="w-1/3 text-xs transition-colors hover:bg-primary/10">Lat/Lon</TabsTrigger>
                        <TabsTrigger value="orbital" className="w-1/3 text-xs transition-colors hover:bg-primary/10">Orbital</TabsTrigger>
                        <TabsTrigger value="circular" className="w-1/3 text-xs transition-colors hover:bg-primary/10">Circular</TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>
            <details className="mb-2">
                <summary className="cursor-pointer text-sm font-medium">Templates</summary>
                <div className="mt-2 flex flex-wrap gap-2">
                    {presets.map(preset => (
                        <Button key={preset.label} size="sm" variant="outline" onClick={() => handlePreset(preset)}>
                            {preset.label}
                        </Button>
                    ))}
                </div>
            </details>
            <form onSubmit={handleSubmit} className="space-y-0.5 mb-0">
                <div className="flex flex-col gap-y-2">
                    {mode === 'latlon' && (
                        <>
                            {renderField("latitude", "Lat", "number", -90, 90, 0.1, "deg")}
                            {renderField("longitude", "Lon", "number", -180, 180, 0.1, "deg")}
                            {renderField("altitude", "Alt", "number", null, null, 0.1, "km")}
                            {renderField("azimuth", "Azimuth", "number", 0, 360, 0.1, "deg")}
                            {renderField("velocity", "Velocity", "number", null, null, 0.1, "km/s")}
                            {renderField("angleOfAttack", "AoA", "number", -90, 90, 0.1, "deg")}
                        </>
                    )}
                    {mode === 'orbital' && (
                        <>
                            {renderField("semiMajorAxis", "SMA", "number", null, null, 0.1, "km")}
                            {renderField("eccentricity", "Ecc", "number", 0, 1, 0.01)}
                            {renderField("inclination", "Inc", "number", -180, 180, 0.1, "deg")}
                            {renderField("raan", "RAAN", "number", 0, 360, 0.1, "deg")}
                            {renderField("argumentOfPeriapsis", "AoP", "number", 0, 360, 0.1, "deg")}
                            {renderField("trueAnomaly", "TA", "number", 0, 360, 0.1, "deg")}
                        </>
                    )}
                    {mode === 'circular' && (
                        <>
                            {renderField("latitude", "Lat", "number", -90, 90, 0.1, "deg")}
                            {renderField("longitude", "Lon", "number", -180, 180, 0.1, "deg")}
                            {renderField("altitude", "Alt", "number", null, null, 0.1, "km")}
                            {renderField("azimuth", "Azimuth", "number", 0, 360, 0.1, "deg")}
                            {renderField("angleOfAttack", "AoA", "number", -90, 90, 0.1, "deg")}
                        </>
                    )}
                </div>
                <div className="pt-8">
                    <Button type="submit" className="w-full h-7 text-xs py-0 mb-2" size="sm">
                        Create
                    </Button>
                </div>
            </form>
        </div>
    );
};

SatelliteCreator.propTypes = {
    onCreateSatellite: PropTypes.func.isRequired
};

export default SatelliteCreator;
