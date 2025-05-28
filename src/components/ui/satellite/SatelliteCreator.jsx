import React, { useState, forwardRef, useImperativeHandle, useEffect, useRef } from 'react';
import { Button } from '../button';
import { Label } from '../label';
import { Input } from '../input';
import { Slider } from '../slider';
import { Tabs, TabsList, TabsTrigger } from '../tabs';
import PropTypes from 'prop-types';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../dropdown-menu';
import { PhysicsUtils } from '../../../utils/PhysicsUtils';
import { Popover, PopoverTrigger, PopoverContent } from '../popover';

const SatelliteCreator = forwardRef(({ onCreateSatellite, availableBodies = [{ name: 'Earth', naifId: 399 }], selectedBody: initialSelectedBody }, ref) => {
    const [mode, setMode] = useState('latlon');
    const [formData, setFormData] = useState({
        name: '',
        mass: 100,
        size: 1,
        ballisticCoefficient: 100,
        latitude: 0,
        longitude: 0,
        altitude: 400,
        azimuth: 90, // Default to eastward for orbital motion
        velocity: 7.8,
        semiMajorAxis: 6778,
        eccentricity: 0,
        inclination: 51.6,
        raan: 0,
        argumentOfPeriapsis: 0,
        trueAnomaly: 0,
        angleOfAttack: 0,
        referenceFrame: 'equatorial',
        circular: false
    });
    const [selectedBody, setSelectedBody] = useState(initialSelectedBody || availableBodies[0]);
    // Search state for central body dropdown
    const [searchTerm, setSearchTerm] = useState("");
    const [popoverOpen, setPopoverOpen] = useState(false);
    const searchInputRef = useRef(null);

    // Calculate circular orbital velocity for display and auto-fill
    const [circularVelocity, setCircularVelocity] = useState(0);
    
    useEffect(() => {
        if (mode === 'latlon' && selectedBody) {
            // Use selected body's radius (km) and mass (kg) 
            const radiusKm = Number(selectedBody.radius);
            const massKg = Number(selectedBody.mass);
            const altitudeKm = Number(formData.altitude);
            if (
                !isNaN(radiusKm) && isFinite(radiusKm) &&
                !isNaN(massKg) && isFinite(massKg) &&
                !isNaN(altitudeKm) && isFinite(altitudeKm)
            ) {
                // Calculate circular orbital velocity for this altitude
                const rKm = (radiusKm + altitudeKm);
                const vCirc = PhysicsUtils.calculateOrbitalVelocity(massKg, rKm);
                if (!isNaN(vCirc) && isFinite(vCirc)) {
                    setCircularVelocity(vCirc);
                    
                    // Auto-fill velocity field when circular toggle is enabled
                    if (formData.circular) {
                        setFormData(prev => ({ ...prev, velocity: vCirc }));
                    }
                }
            }
        }
    }, [mode, formData.altitude, selectedBody, formData.circular]);

    useEffect(() => {
        if (popoverOpen && searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, [popoverOpen]);

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
        const { name: field, value, type, checked } = e.target;
        setFormData(prev => {
            if (type === 'checkbox') {
                return { ...prev, [field]: checked };
            }
            if (type === 'number') {
                const parsed = parseFloat(value);
                const newData = {
                    ...prev,
                    // If parsed is NaN, keep previous; otherwise use parsed
                    [field]: isNaN(parsed) ? prev[field] : parsed
                };
                
                // Auto-check circular toggle if velocity matches calculated circular velocity
                if (field === 'velocity' && !isNaN(parsed) && Math.abs(parsed - circularVelocity) < 0.01) {
                    newData.circular = true;
                }
                // Auto-uncheck circular toggle if velocity is manually changed away from circular
                else if (field === 'velocity' && !isNaN(parsed) && prev.circular && Math.abs(parsed - circularVelocity) > 0.01) {
                    newData.circular = false;
                }
                
                return newData;
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
                const outParams = {
                    mode,
                    latitude: params.latitude,
                    longitude: params.longitude,
                    altitude: params.altitude,
                    azimuth: params.azimuth,
                    velocity: params.velocity,
                    angleOfAttack: params.angleOfAttack,
                    circular: params.circular,
                    mass: params.mass,
                    size: params.size,
                    ballisticCoefficient: params.ballisticCoefficient,
                    name: params.name || undefined,
                    planetNaifId: selectedBody?.naifId
                };
                console.log('[SatelliteCreator] Submitting latlon satellite with:', outParams);
                await onCreateSatellite(outParams);
            } else if (mode === 'orbital') {
                const outParams = {
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
                    name: params.name || undefined,
                    planetNaifId: selectedBody?.naifId
                };
                console.log('[SatelliteCreator] Submitting orbital satellite with:', outParams);
                await onCreateSatellite(outParams);
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
                        disabled={name === 'velocity' && formData.circular}
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

    // Label for central body dropdown
    const centralBodyLabel = selectedBody ? selectedBody.name : 'Select Body';

    // Filter out barycenters from availableBodies
    const filteredBodies = availableBodies.filter(b =>
        b.type !== 'barycenter' &&
        !(typeof b.name === 'string' && (
            b.name.endsWith('_barycenter') ||
            b.name === 'ss_barycenter' ||
            b.name === 'emb'
        )) &&
        (searchTerm.trim() === '' || b.name.toLowerCase().includes(searchTerm.trim().toLowerCase()))
    );

    return (
        <div className="text-xs p-4">
            {/* Central body selector */}
            <div className="flex items-center gap-2 mb-2">
                <Label htmlFor="central-body" className="text-xs text-muted-foreground text-right pr-1">Central Body:</Label>
                <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                    <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm" className="justify-start">
                            {centralBodyLabel}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="max-h-80 min-w-[10rem] p-0 w-48 overflow-y-auto" style={{ zIndex: 11000 }}>
                        <div className="sticky top-0 z-10 bg-popover p-1 border-b flex items-center">
                            <input
                                type="text"
                                ref={searchInputRef}
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                placeholder="Search..."
                                className="w-full px-2 py-1 text-xs rounded bg-background border focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                        </div>
                        {filteredBodies.length === 0 ? (
                            <div className="text-xs text-muted-foreground px-3 py-2">No results</div>
                        ) : (
                            filteredBodies.map(b => (
                                <button
                                    key={b.naifId || b.name}
                                    type="button"
                                    className="w-full text-left px-3 py-2 text-xs hover:bg-accent focus:bg-accent focus:outline-none"
                                    onClick={() => {
                                        setSelectedBody(b);
                                        setPopoverOpen(false);
                                    }}
                                >
                                    {b.name}
                                </button>
                            ))
                        )}
                    </PopoverContent>
                </Popover>
            </div>
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
                        <TabsTrigger value="latlon" className="w-1/2 text-xs transition-colors hover:bg-primary/10">Lat/Lon</TabsTrigger>
                        <TabsTrigger value="orbital" className="w-1/2 text-xs transition-colors hover:bg-primary/10">Orbital</TabsTrigger>
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
                            <div className="grid grid-cols-12 items-center gap-x-2 gap-y-0.5">
                                <Label htmlFor="circular" className="col-span-3 text-xs text-muted-foreground text-right pr-1">
                                    Circular:
                                </Label>
                                <div className="col-span-9 flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        id="circular"
                                        name="circular"
                                        checked={formData.circular}
                                        onChange={handleInputChange}
                                        className="h-4 w-4"
                                    />
                                    <span className="text-xs text-muted-foreground">
                                        ({circularVelocity.toFixed(3)} km/s)
                                    </span>
                                    {!formData.circular && (
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            className="h-6 px-2 text-xs"
                                            onClick={() => {
                                                setFormData(prev => ({ 
                                                    ...prev, 
                                                    velocity: circularVelocity, 
                                                    circular: true 
                                                }));
                                            }}
                                        >
                                            Use
                                        </Button>
                                    )}
                                </div>
                            </div>
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
    onCreateSatellite: PropTypes.func.isRequired,
    availableBodies: PropTypes.arrayOf(PropTypes.shape({
        name: PropTypes.string.isRequired,
        naifId: PropTypes.number.isRequired
    })),
    selectedBody: PropTypes.shape({
        name: PropTypes.string.isRequired,
        naifId: PropTypes.number.isRequired
    })
};

export default SatelliteCreator;
