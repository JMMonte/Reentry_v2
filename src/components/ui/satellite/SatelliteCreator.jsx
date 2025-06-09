import React, { useState, forwardRef, useImperativeHandle, useEffect, useRef } from 'react';
import { Button } from '../button';
import { Label } from '../label';
import { Input } from '../input';
import { Slider } from '../slider';
import { Tabs, TabsList, TabsTrigger } from '../tabs';
import PropTypes from 'prop-types';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../dropdown-menu';
import { Popover, PopoverTrigger, PopoverContent } from '../popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../select';
import { Switch } from '../switch';

// Satellite system engineering templates
const SATELLITE_TEMPLATES = {
    cubesat: {
        name: 'CubeSat',
        description: 'Small, standardized satellite (1-6U)',
        mass: 5,
        size: 0.3,
        ballisticCoefficient: 30,
        commsConfig: {
            preset: 'cubesat'
        }
    },
    communications_satellite: {
        name: 'Communications Satellite',
        description: 'Commercial communications platform',
        mass: 3000,
        size: 3,
        ballisticCoefficient: 200,
        commsConfig: {
            preset: 'communications_satellite'
        }
    },
    scientific_probe: {
        name: 'Scientific Probe',
        description: 'Deep space exploration vehicle',
        mass: 500,
        size: 1.5,
        ballisticCoefficient: 150,
        commsConfig: {
            preset: 'scientific_probe'
        }
    },
    earth_observation: {
        name: 'Earth Observation',
        description: 'Remote sensing satellite',
        mass: 800,
        size: 2,
        ballisticCoefficient: 120,
        commsConfig: {
            preset: 'earth_observation'
        }
    },
    military_satellite: {
        name: 'Military Satellite',
        description: 'Defense and reconnaissance platform',
        mass: 2000,
        size: 2.5,
        ballisticCoefficient: 180,
        commsConfig: {
            preset: 'military_satellite'
        }
    }
};

// Section component for collapsible sections
const Section = ({ title, isOpen, onToggle, children, className = "" }) => {
    return (
        <div className={`border-b border-border/50 last:border-0 ${className}`}>
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    onToggle();
                }}
                className="w-full flex items-center justify-between py-2 px-1 hover:bg-accent/5 transition-colors cursor-pointer text-left"
            >
                <span className="text-xs font-semibold text-foreground/90">{title}</span>
                <span className="text-xs text-muted-foreground">{isOpen ? '−' : '+'}</span>
            </button>
            {isOpen && (
                <div className="pb-2 px-1 space-y-1">
                    {children}
                </div>
            )}
        </div>
    );
};

Section.propTypes = {
    title: PropTypes.string.isRequired,
    isOpen: PropTypes.bool.isRequired,
    onToggle: PropTypes.func.isRequired,
    children: PropTypes.node,
    className: PropTypes.string
};

const SatelliteCreator = forwardRef(({ onCreateSatellite, availableBodies = [{ name: 'Earth', naifId: 399 }], selectedBody: initialSelectedBody }, ref) => {
    const [mode, setMode] = useState('latlon');
    const [selectedTemplate, setSelectedTemplate] = useState('cubesat');
    
    // Section visibility states
    const [showSystemTemplate, setShowSystemTemplate] = useState(false);
    const [showStructure, setShowStructure] = useState(true);
    const [showCommunications, setShowCommunications] = useState(false);
    const [showOrbitalParams, setShowOrbitalParams] = useState(true);
    
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
        circular: false,
        // Communications parameters
        commsEnabled: true,
        antennaGain: 12.0,
        transmitPower: 10.0,
        antennaType: 'omnidirectional',
        transmitFrequency: 2.4,
        dataRate: 1000,
        minElevationAngle: 5.0,
        networkId: 'default',
        encryption: true
    });
    const [selectedBody, setSelectedBody] = useState(initialSelectedBody || availableBodies[0]);
    // Search state for central body dropdown
    const [searchTerm, setSearchTerm] = useState("");
    const [popoverOpen, setPopoverOpen] = useState(false);
    const searchInputRef = useRef(null);

    // Calculate circular orbital velocity for display and auto-fill
    const [circularVelocity, setCircularVelocity] = useState('');
    
    // Don't calculate velocity in React - let the backend handle it
    // This is just for display purposes
    useEffect(() => {
        if (mode === 'latlon' && selectedBody && formData.circular) {
            // Just show "Circular" when checkbox is checked
            setCircularVelocity('auto');
        } else {
            setCircularVelocity('');
        }
    }, [mode, selectedBody, formData.circular]);

    useEffect(() => {
        if (popoverOpen && searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, [popoverOpen]);

    // Update selected body when the prop changes (e.g., when navbar selection changes)
    useEffect(() => {
        if (initialSelectedBody) {
            setSelectedBody(initialSelectedBody);
        }
    }, [initialSelectedBody]);

    const handlePresetBC = (value) => {
        setFormData(prev => ({ ...prev, ballisticCoefficient: value }));
    };

    const handleTemplateChange = (templateKey) => {
        setSelectedTemplate(templateKey);
        const template = SATELLITE_TEMPLATES[templateKey];
        if (template) {
            // Get the communication preset details
            const commsPresets = {
                cubesat: { antennaGain: 2.0, transmitPower: 1.0, antennaType: 'omnidirectional', dataRate: 100, minElevationAngle: 10.0 },
                communications_satellite: { antennaGain: 25.0, transmitPower: 50.0, antennaType: 'directional', dataRate: 10000, minElevationAngle: 5.0 },
                scientific_probe: { antennaGain: 35.0, transmitPower: 20.0, antennaType: 'high_gain', dataRate: 500, minElevationAngle: 0.0 },
                earth_observation: { antennaGain: 15.0, transmitPower: 25.0, antennaType: 'directional', dataRate: 2000, minElevationAngle: 5.0 },
                military_satellite: { antennaGain: 20.0, transmitPower: 100.0, antennaType: 'phased_array', dataRate: 5000, minElevationAngle: 3.0 }
            };
            
            const commsConfig = commsPresets[templateKey] || commsPresets.cubesat;
            
            setFormData(prev => ({
                ...prev,
                mass: template.mass,
                size: template.size,
                ballisticCoefficient: template.ballisticCoefficient,
                name: prev.name || template.name,
                // Apply communication settings from template
                antennaGain: commsConfig.antennaGain,
                transmitPower: commsConfig.transmitPower,
                antennaType: commsConfig.antennaType,
                dataRate: commsConfig.dataRate,
                minElevationAngle: commsConfig.minElevationAngle
            }));
        }
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
                
                // Auto-uncheck circular toggle if velocity is manually changed
                if (field === 'velocity' && !isNaN(parsed) && prev.circular) {
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
                    velocity: params.circular ? undefined : params.velocity, // Pass undefined to trigger circular velocity calculation
                    angleOfAttack: params.angleOfAttack,
                    mass: params.mass,
                    size: params.size,
                    ballisticCoefficient: params.ballisticCoefficient,
                    name: params.name || undefined,
                    planetNaifId: selectedBody?.naifId,
                    commsConfig: {
                        preset: SATELLITE_TEMPLATES[selectedTemplate]?.commsConfig?.preset || 'cubesat',
                        enabled: params.commsEnabled,
                        antennaType: params.antennaType,
                        antennaGain: params.antennaGain,
                        transmitPower: params.transmitPower,
                        transmitFrequency: params.transmitFrequency,
                        dataRate: params.dataRate,
                        minElevationAngle: params.minElevationAngle,
                        networkId: params.networkId,
                        encryption: params.encryption
                    }
                };
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
                    planetNaifId: selectedBody?.naifId,
                    commsConfig: {
                        preset: SATELLITE_TEMPLATES[selectedTemplate]?.commsConfig?.preset || 'cubesat',
                        enabled: params.commsEnabled,
                        antennaType: params.antennaType,
                        antennaGain: params.antennaGain,
                        transmitPower: params.transmitPower,
                        transmitFrequency: params.transmitFrequency,
                        dataRate: params.dataRate,
                        minElevationAngle: params.minElevationAngle,
                        networkId: params.networkId,
                        encryption: params.encryption
                    }
                };
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
        <div className="text-xs">
            {/* Central body selector */}
            <div className="flex items-center gap-2 p-2 border-b border-border/50">
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

            <div className="space-y-0">
                {/* Quick Start Templates - Optional */}
                <Section
                    title="Quick Start (Optional)"
                    isOpen={showSystemTemplate}
                    onToggle={() => setShowSystemTemplate(!showSystemTemplate)}
                >
                    <div className="space-y-1">
                        <div className="text-xs text-muted-foreground mb-1">Load preset configurations:</div>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="w-full justify-start text-xs">
                                    Load Template...
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="w-64">
                                {Object.entries(SATELLITE_TEMPLATES).map(([key, template]) => (
                                    <DropdownMenuItem
                                        key={key}
                                        onSelect={() => handleTemplateChange(key)}
                                        className="flex-col items-start space-y-1 p-3"
                                    >
                                        <div className="font-medium text-sm">{template.name}</div>
                                        <div className="text-xs text-muted-foreground">{template.description}</div>
                                        <div className="text-xs text-muted-foreground">
                                            {template.mass}kg • {template.size}m • BC:{template.ballisticCoefficient}
                                        </div>
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </Section>

                {/* Structure & Mass Properties Section */}
                <Section
                    title="Structure & Mass Properties"
                    isOpen={showStructure}
                    onToggle={() => setShowStructure(!showStructure)}
                >
                    <div className="space-y-1">
                        {renderField("name", "Name", "text")}
                        {renderField("mass", "Mass", "number", 1, 1000000, 1, "kg")}
                        {renderField("size", "Size", "number", 0.1, 10, 0.1, "m")}
                        {renderField("ballisticCoefficient", "Ballistic Coeff", "number", 1, 1000, 1, "kg/m²")}
                        <div className="grid grid-cols-12 items-center gap-x-2 gap-y-1">
                            <Label htmlFor="bc-presets" className="col-span-3 text-xs text-muted-foreground text-right pr-1">
                                BC Presets:
                            </Label>
                            <div className="col-span-9">
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="sm" className="justify-start text-xs">
                                            {bcLabel}
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent>
                                        <DropdownMenuItem onSelect={() => handlePresetBC(30)}>CubeSat (30)</DropdownMenuItem>
                                        <DropdownMenuItem onSelect={() => handlePresetBC(100)}>Standard (100)</DropdownMenuItem>
                                        <DropdownMenuItem onSelect={() => handlePresetBC(500)}>LargeSat (500)</DropdownMenuItem>
                                        <DropdownMenuItem onSelect={() => handlePresetBC(40)}>Space Capsule (40)</DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </div>
                    </div>
                </Section>

                {/* Communications Subsystem Section */}
                <Section
                    title="Communications Subsystem"
                    isOpen={showCommunications}
                    onToggle={() => setShowCommunications(!showCommunications)}
                >
                    <div className="space-y-1">
                        <div className="grid grid-cols-12 items-center gap-x-2 gap-y-0.5">
                            <Label className="col-span-3 text-xs text-muted-foreground text-right pr-1">
                                Enabled:
                            </Label>
                            <div className="col-span-9 flex items-center">
                                <Switch
                                    checked={formData.commsEnabled}
                                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, commsEnabled: checked }))}
                                />
                            </div>
                        </div>
                        
                        {formData.commsEnabled && (
                            <div className="space-y-1">
                                <div className="grid grid-cols-12 items-center gap-x-2 gap-y-0.5">
                                    <Label className="col-span-3 text-xs text-muted-foreground text-right pr-1">
                                        Antenna Type:
                                    </Label>
                                    <div className="col-span-9">
                                        <Select 
                                            value={formData.antennaType}
                                            onValueChange={(value) => setFormData(prev => ({ ...prev, antennaType: value }))}
                                        >
                                            <SelectTrigger className="h-6 text-xs">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="omnidirectional">Omnidirectional</SelectItem>
                                                <SelectItem value="directional">Directional</SelectItem>
                                                <SelectItem value="high_gain">High Gain</SelectItem>
                                                <SelectItem value="phased_array">Phased Array</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                {renderField("antennaGain", "Antenna Gain", "number", 0, 50, 0.1, "dBi")}
                                {renderField("transmitPower", "Transmit Power", "number", 0.1, 200, 0.1, "W")}
                                {renderField("transmitFrequency", "Frequency", "number", 0.1, 50, 0.1, "GHz")}
                                {renderField("dataRate", "Data Rate", "number", 1, 50000, 1, "kbps")}
                                {renderField("minElevationAngle", "Min Elevation", "number", 0, 45, 0.1, "°")}
                                
                                <div className="grid grid-cols-12 items-center gap-x-2 gap-y-0.5">
                                    <Label className="col-span-3 text-xs text-muted-foreground text-right pr-1">
                                        Network:
                                    </Label>
                                    <div className="col-span-9">
                                        <Select 
                                            value={formData.networkId}
                                            onValueChange={(value) => setFormData(prev => ({ ...prev, networkId: value }))}
                                        >
                                            <SelectTrigger className="h-6 text-xs">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="default">Default Network</SelectItem>
                                                <SelectItem value="cubesat_network">CubeSat Network</SelectItem>
                                                <SelectItem value="commercial_network">Commercial Network</SelectItem>
                                                <SelectItem value="military_network">Military Network</SelectItem>
                                                <SelectItem value="deep_space_network">Deep Space Network</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-12 items-center gap-x-2 gap-y-0.5">
                                    <Label className="col-span-3 text-xs text-muted-foreground text-right pr-1">
                                        Encryption:
                                    </Label>
                                    <div className="col-span-9 flex items-center">
                                        <Switch
                                            checked={formData.encryption}
                                            onCheckedChange={(checked) => setFormData(prev => ({ ...prev, encryption: checked }))}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </Section>

                {/* Orbital Parameters Section */}
                <Section
                    title="Orbital Parameters"
                    isOpen={showOrbitalParams}
                    onToggle={() => setShowOrbitalParams(!showOrbitalParams)}
                >
                    <div className="space-y-1">
                        <div className="mb-1">
                            <Tabs value={mode} onValueChange={setMode}>
                                <TabsList className="flex justify-center gap-0 text-xs mb-1">
                                    <TabsTrigger value="latlon" className="w-1/2 text-xs transition-colors hover:bg-primary/10">Lat/Lon</TabsTrigger>
                                    <TabsTrigger value="orbital" className="w-1/2 text-xs transition-colors hover:bg-primary/10">Orbital</TabsTrigger>
                                </TabsList>
                            </Tabs>
                        </div>
                        
                        {mode === 'latlon' && (
                            <div className="space-y-1">
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
                                            {circularVelocity === 'auto' ? '(auto)' : ''}
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
                                                        velocity: 7.5, // Approximate circular velocity for display 
                                                        circular: true 
                                                    }));
                                                }}
                                            >
                                                Use
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                        
                        {mode === 'orbital' && (
                            <div className="space-y-1">
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
                            </div>
                        )}
                    </div>
                </Section>

            </div>

            <form onSubmit={handleSubmit} className="border-t border-border/50 p-2">
                <Button type="submit" className="w-full h-7 text-xs py-0" size="sm">
                    Create
                </Button>
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
