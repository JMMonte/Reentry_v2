import React, { useState } from 'react';
import { Button } from '../button';
import { Label } from '../label';
import { Input } from '../input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../select';
import { Slider } from '../slider';

const SatelliteCreator = ({ onCreateSatellite }) => {
    const [mode, setMode] = useState('latlon');
    const [formData, setFormData] = useState({
        name: '',
        mass: 100,
        size: 1,
        latitude: 0,
        longitude: 0,
        altitude: 400,
        heading: 0,
        speed: 7.8,
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
            await onCreateSatellite({ ...formData, mode });
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
                        {renderField("heading", "Head", "number", 0, 360, 0.1, "deg")}
                        {renderField("speed", "Speed", "number", null, null, 0.1, "km/s")}
                        {renderField("angleOfAttack", "AoA", "number", -90, 90, 0.1, "deg")}
                    </>
                )}

                {/* Orbital Elements Fields */}
                {mode === 'orbital' && (
                    <>
                        {renderField("semiMajorAxis", "SMA", "number", null, null, 0.1, "km")}
                        {renderField("eccentricity", "Ecc", "number", 0, 1, 0.01)}
                        {renderField("inclination", "Inc", "number", 0, 180, 0.1, "deg")}
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
                        {renderField("heading", "Azimuth", "number", 0, 360, 0.1, "deg")}
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
