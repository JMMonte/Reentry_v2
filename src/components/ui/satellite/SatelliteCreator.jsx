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
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: parseFloat(value) || value,
        }));
    };

    const handleSliderChange = (name, value) => {
        setFormData(prev => ({
            ...prev,
            [name]: value,
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
                        step={step}
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
            <div className="mb-2">
                <Tabs value={mode} onValueChange={setMode}>
                    <TabsList className="flex justify-center gap-0 text-xs mb-2">
                        <TabsTrigger value="latlon" className="w-1/3 text-xs transition-colors hover:bg-primary/10">Lat/Lon</TabsTrigger>
                        <TabsTrigger value="orbital" className="w-1/3 text-xs transition-colors hover:bg-primary/10">Orbital</TabsTrigger>
                        <TabsTrigger value="circular" className="w-1/3 text-xs transition-colors hover:bg-primary/10">Circular</TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>
            <form onSubmit={handleSubmit} className="space-y-0.5 mb-0">
                <div className="flex flex-col gap-y-2">
                    {renderField("name", "Name", "text")}
                    {renderField("mass", "Mass", "number", 1, 1000, 1, "kg")}
                    {renderField("size", "Size", "number", 0.1, 10, 0.1, "m")}
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
