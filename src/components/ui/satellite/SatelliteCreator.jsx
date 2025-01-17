import React, { useState } from 'react';
import { Button } from '../button';
import { Label } from '../label';
import { Input } from '../input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../select';
import { Slider } from '../slider';
import { Alert, AlertDescription } from '../alert/alert';
import { Constants } from '../../../utils/Constants';

const DEFAULT_VALUES = {
    name: '',
    mass: 100,         // kg
    size: 1,          // meters
    latitude: 0,       // degrees
    longitude: 0,      // degrees
    altitude: 400,     // km
    azimuth: 0,       // degrees
    velocity: 7.8,     // km/s
    semiMajorAxis: 6778, // km (LEO default)
    eccentricity: 0,
    inclination: 51.6,   // degrees (ISS-like)
    raan: 0,            // degrees
    argumentOfPeriapsis: 0, // degrees
    trueAnomaly: 0,     // degrees
    angleOfAttack: 0,   // degrees
};

const validateParams = (params, mode) => {
    // Common validations
    if (params.mass <= 0) throw new Error('Mass must be positive');
    if (params.size <= 0) throw new Error('Size must be positive');
    
    // Mode-specific validations
    switch (mode) {
        case 'latlon':
            if (params.latitude < -90 || params.latitude > 90) 
                throw new Error('Latitude must be between -90° and 90°');
            if (params.longitude < -180 || params.longitude > 180) 
                throw new Error('Longitude must be between -180° and 180°');
            if (params.altitude <= 0) 
                throw new Error('Altitude must be positive');
            if (params.velocity <= 0) 
                throw new Error('Velocity must be positive');
            if (params.azimuth < 0 || params.azimuth >= 360) 
                throw new Error('Azimuth must be between 0° and 360°');
            if (params.angleOfAttack < -90 || params.angleOfAttack > 90) 
                throw new Error('Angle of attack must be between -90° and 90°');
            break;
            
        case 'orbital':
            if (params.semiMajorAxis <= Constants.earthRadius / Constants.kmToMeters) 
                throw new Error('Semi-major axis must be greater than Earth\'s radius');
            if (params.eccentricity < 0 || params.eccentricity >= 1) 
                throw new Error('Eccentricity must be between 0 and 1');
            if (params.inclination < -180 || params.inclination > 180) 
                throw new Error('Inclination must be between -180° and 180°');
            if (params.raan < 0 || params.raan >= 360) 
                throw new Error('RAAN must be between 0° and 360°');
            if (params.argumentOfPeriapsis < 0 || params.argumentOfPeriapsis >= 360) 
                throw new Error('Argument of periapsis must be between 0° and 360°');
            if (params.trueAnomaly < 0 || params.trueAnomaly >= 360) 
                throw new Error('True anomaly must be between 0° and 360°');
            break;
            
        case 'circular':
            if (params.latitude < -90 || params.latitude > 90) 
                throw new Error('Latitude must be between -90° and 90°');
            if (params.longitude < -180 || params.longitude > 180) 
                throw new Error('Longitude must be between -180° and 180°');
            if (params.altitude <= 0) 
                throw new Error('Altitude must be positive');
            if (params.azimuth < 0 || params.azimuth >= 360) 
                throw new Error('Azimuth must be between 0° and 360°');
            if (params.angleOfAttack < -90 || params.angleOfAttack > 90) 
                throw new Error('Angle of attack must be between -90° and 90°');
            break;
    }
};

const SatelliteCreator = ({ onCreateSatellite }) => {
    const [mode, setMode] = useState('latlon');
    const [formData, setFormData] = useState(DEFAULT_VALUES);
    const [error, setError] = useState(null);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        const numValue = parseFloat(value);
        if (name !== 'name' && (isNaN(numValue) || !isFinite(numValue))) {
            return; // Invalid numerical input
        }
        setFormData(prev => ({
            ...prev,
            [name]: name === 'name' ? value : numValue,
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
        setError(null); // Clear any previous errors
        
        try {
            const params = { ...formData };
            
            // Validate parameters before submission
            validateParams(params, mode);
            
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
            
            // Reset only the name field after successful creation
            setFormData(prev => ({
                ...prev,
                name: ''
            }));
        } catch (error) {
            console.error('Error creating satellite:', error);
            setError(error.message);
        }
    };

    const renderField = (name, label, type = "number", min = null, max = null, step = null, unit = null) => {
        const value = formData[name];
        const isNumeric = type === "number";
        const showSlider = isNumeric && min !== null && max !== null;

        return (
            <div className="grid grid-cols-4 gap-0.5">
                <Label htmlFor={name} className="text-[10px] text-muted-foreground flex items-center">
                    {label}{unit ? ` (${unit})` : ''}:
                </Label>
                <div className="col-span-3 flex items-center gap-1">
                    <Input
                        type={type}
                        id={name}
                        name={name}
                        value={value}
                        onChange={handleInputChange}
                        className="h-5 text-[10px] py-0 px-1 w-20"
                        min={min}
                        max={max}
                        step={step}
                        required
                    />
                    {showSlider && (
                        <Slider
                            value={[value]}
                            onValueChange={([newValue]) => handleSliderChange(name, newValue)}
                            min={min}
                            max={max}
                            step={step || (max - min) / 100}
                            className="flex-1 h-1"
                        />
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-1 text-[10px]">
            {error && (
                <Alert variant="destructive" className="py-2 mb-2">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}
            <div className="grid grid-cols-4 gap-0.5">
                <Label className="text-muted-foreground">Mode:</Label>
                <Select value={mode} onValueChange={setMode}>
                    <SelectTrigger className="col-span-3 h-5 text-[10px] py-0 px-1">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="latlon">Latitude/Longitude</SelectItem>
                        <SelectItem value="orbital">Orbital Elements</SelectItem>
                        <SelectItem value="circular">Circular Orbit</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <form onSubmit={handleSubmit} className="space-y-1">
                {/* Common Fields */}
                {renderField("name", "Name", "text")}
                {renderField("mass", "Mass", "number", 1, 1000, 1, "kg")}
                {renderField("size", "Size", "number", 0.1, 10, 0.1, "m")}

                {/* Lat/Lon Fields */}
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

                {/* Orbital Elements Fields */}
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

                {/* Circular Orbit Fields */}
                {mode === 'circular' && (
                    <>
                        {renderField("latitude", "Lat", "number", -90, 90, 0.1, "deg")}
                        {renderField("longitude", "Lon", "number", -180, 180, 0.1, "deg")}
                        {renderField("altitude", "Alt", "number", null, null, 0.1, "km")}
                        {renderField("azimuth", "Azimuth", "number", 0, 360, 0.1, "deg")}
                        {renderField("angleOfAttack", "AoA", "number", -90, 90, 0.1, "deg")}
                    </>
                )}

                <Button type="submit" className="w-full h-5 text-[10px] py-0">
                    Create
                </Button>
            </form>
        </div>
    );
};

export default SatelliteCreator;
