import React, { useState, forwardRef, useImperativeHandle } from 'react';
import { Button } from '../button';
import { Label } from '../label';
import { Input } from '../input';
import { Slider } from '../slider';
import { Tabs, TabsList, TabsTrigger } from '../tabs';
import PropTypes from 'prop-types';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../dropdown-menu';

const SatelliteCreator = forwardRef(({ onCreateSatellite }, ref) => {
    const [mode, setMode] = useState('latlon');
    const [formData, setFormData] = useState({
        name: '',
        mass: 100,
        size: 1,
        ballisticCoefficient: 100,
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
        referenceFrame: 'equatorial',
    });

    const handlePresetBC = (value) => {
        setFormData(prev => ({ ...prev, ballisticCoefficient: value }));
    };

    useImperativeHandle(ref, () => ({
        applyPreset: (preset) => {
            setMode(preset.mode);
            setFormData(prev => {
                // Merge preset values
                const merged = { ...prev, ...preset.values };
                // Derive BC if preset didn't include one
                const mass = merged.mass;
                const size = merged.size;
                const area = Math.PI * size * size;
                const Cd = 2.2;
                const derivedBC = mass / (Cd * area);
                return {
                    ...merged,
                    ballisticCoefficient: merged.ballisticCoefficient ?? derivedBC
                };
            });
        }
    }));

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
                    ballisticCoefficient: params.ballisticCoefficient,
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
                    referenceFrame: params.referenceFrame,
                    mass: params.mass,
                    size: params.size,
                    ballisticCoefficient: params.ballisticCoefficient,
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
                    ballisticCoefficient: params.ballisticCoefficient,
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

    // Label for BC Presets dropdown
    const bcLabel = (() => {
        const bc = formData.ballisticCoefficient;
        if (bc === 30) return 'CubeSat (30)';
        if (bc === 100) return 'Standard (100)';
        if (bc === 500) return 'LargeSat (500)';
        if (bc === 40) return 'Space Capsule (40)';
        return `Custom (${bc})`;
    })();

    // Label for Reference dropdown
    const rfLabel = formData.referenceFrame === 'ecliptic' ? 'Ecliptic' : 'Equatorial';

    return (
        <div className="text-xs p-4">
            {/* General satellite properties */}
            <div className="flex flex-col gap-y-2 mb-4">
                {renderField("name", "Name", "text")}
                {renderField("mass", "Mass", "number", 1, 1000000, 1, "kg")}
                {renderField("size", "Size", "number", 0.1, 10, 0.1, "m")}
                {renderField("ballisticCoefficient", "Ballistic Coeff", "number", 1, 1000, 1, "kg/m²")}
                <div className="grid grid-cols-12 items-center gap-x-2 gap-y-1 mt-2">
                    <Label htmlFor="bc-presets" className="col-span-3 text-xs text-muted-foreground text-right pr-1">
                        BC Presets:
                    </Label>
                    <div className="col-span-6">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="justify-start">
                                    {bcLabel}
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                                <DropdownMenuItem onSelect={() => handlePresetBC(30)}>CubeSat (30)</DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => handlePresetBC(100)}>Standard (100) — typical small-satellite BC</DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => handlePresetBC(500)}>LargeSat (500)</DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => handlePresetBC(40)}>Space Capsule (40)</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                    <div className="col-span-3" />
                </div>
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
                            <div className="grid grid-cols-12 items-center gap-x-2 gap-y-1 mt-2">
                                <Label htmlFor="referenceFrame" className="col-span-3 text-xs text-muted-foreground text-right pr-1">
                                    Reference:
                                </Label>
                                <div className="col-span-6">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="sm" className="justify-start">
                                                {rfLabel}
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent sideOffset={4}>
                                            <DropdownMenuItem onSelect={() => setFormData(prev => ({ ...prev, referenceFrame: 'equatorial' }))}>
                                                Equatorial
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onSelect={() => setFormData(prev => ({ ...prev, referenceFrame: 'ecliptic' }))}>
                                                Ecliptic
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                                <div className="col-span-3" />
                            </div>
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
});

SatelliteCreator.displayName = 'SatelliteCreator';

SatelliteCreator.propTypes = {
    onCreateSatellite: PropTypes.func.isRequired
};

export default SatelliteCreator;
