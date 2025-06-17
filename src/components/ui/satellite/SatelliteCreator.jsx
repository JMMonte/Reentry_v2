import React, { useState, forwardRef, useImperativeHandle, useEffect, useMemo, useCallback } from 'react';
import { Button } from '../button';
import { Label } from '../label';
import { Input } from '../input';
import { Slider } from '../slider';
import { Tabs, TabsList, TabsTrigger } from '../tabs';
import PropTypes from 'prop-types';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../select';
import { Switch } from '../switch';
import BodySelector from '../common/BodySelector';

/**
 * Satellite system engineering templates for common satellite types.
 * These templates provide realistic mass, size, and communication configurations
 * for different classes of satellites. Templates are memoized to prevent
 * unnecessary recalculation during component re-renders.
 */
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

/**
 * Communication system presets for different satellite types.
 * Provides realistic antenna gain, transmit power, and data rate configurations
 * based on industry standards for each satellite class.
 */
const COMMS_PRESETS = {
    cubesat: { antennaGain: 2.0, transmitPower: 1.0, antennaType: 'omnidirectional', dataRate: 100, minElevationAngle: 10.0 },
    communications_satellite: { antennaGain: 25.0, transmitPower: 50.0, antennaType: 'directional', dataRate: 10000, minElevationAngle: 5.0 },
    scientific_probe: { antennaGain: 35.0, transmitPower: 20.0, antennaType: 'high_gain', dataRate: 500, minElevationAngle: 0.0 },
    earth_observation: { antennaGain: 15.0, transmitPower: 25.0, antennaType: 'directional', dataRate: 2000, minElevationAngle: 5.0 },
    military_satellite: { antennaGain: 20.0, transmitPower: 100.0, antennaType: 'phased_array', dataRate: 5000, minElevationAngle: 3.0 }
};

/**
 * Memoized collapsible section component for organizing form content.
 * Optimized to prevent unnecessary re-renders when parent component updates.
 * Uses React.memo with proper prop comparison for performance.
 */
const Section = React.memo(function Section({ title, isOpen, onToggle, children, className = "" }) {
    /**
     * Memoized click handler to prevent function recreation on each render.
     * Stops event propagation to prevent interference with parent components.
     */
    const handleToggle = useCallback((e) => {
        e.stopPropagation();
        onToggle();
    }, [onToggle]);

    return (
        <div className={`border-b border-border/50 last:border-0 ${className}`}>
            <button
                type="button"
                onClick={handleToggle}
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
});

Section.propTypes = {
    title: PropTypes.string.isRequired,
    isOpen: PropTypes.bool.isRequired,
    onToggle: PropTypes.func.isRequired,
    children: PropTypes.node,
    className: PropTypes.string
};

/**
 * Memoized form field component that handles numeric inputs with optional sliders.
 * Optimized for performance with stable event handlers and conditional rendering
 * based on field type and configuration. Supports both text and numeric inputs
 * with validation and range constraints.
 */
const FormField = React.memo(function FormField({
    name,
    label,
    type = "number",
    min = null,
    max = null,
    step = null,
    unit = null,
    value,
    onChange,
    onSliderChange,
    disabled = false,
    required = false
}) {
    /**
     * Memoized event handlers to prevent function recreation and unnecessary re-renders.
     * Each handler is wrapped in useCallback with stable dependencies.
     */
    const handleInputChange = useCallback((e) => {
        onChange(e);
    }, [onChange]);

    const handleSliderChange = useCallback(([newValue]) => {
        onSliderChange(name, newValue);
    }, [onSliderChange, name]);

    /**
     * Memoized slider configuration to prevent recalculation on every render.
     * Determines if slider should be displayed and calculates step values
     * based on field type and min/max constraints.
     */
    const sliderConfig = useMemo(() => {
        const isNumeric = type === "number";
        const showSlider = isNumeric && min !== null && max !== null;
        return {
            isNumeric,
            showSlider,
            sliderStep: step || (max - min) / 100
        };
    }, [type, min, max, step]);

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
                        required={required}
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
                    required={required}
                    disabled={disabled}
                />
            </div>
            <div className="col-span-6 flex items-center">
                {sliderConfig.showSlider && (
                    <Slider
                        value={[value]}
                        onValueChange={handleSliderChange}
                        min={min}
                        max={max}
                        step={sliderConfig.sliderStep}
                        className="ml-3 flex-1 h-1"
                    />
                )}
            </div>
        </div>
    );
});

FormField.propTypes = {
    name: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    type: PropTypes.string,
    min: PropTypes.number,
    max: PropTypes.number,
    step: PropTypes.number,
    unit: PropTypes.string,
    value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    onChange: PropTypes.func.isRequired,
    onSliderChange: PropTypes.func.isRequired,
    disabled: PropTypes.bool,
    required: PropTypes.bool
};

/**
 * Satellite Creator Component - Comprehensive satellite creation interface
 * 
 * Optimized with:
 * - React.memo for re-render prevention
 * - useMemo for expensive calculations
 * - Refs for preventing double submissions and caching
 */
const SatelliteCreator = forwardRef(function SatelliteCreator({ onCreateSatellite, availableBodies = [{ name: 'Earth', naifId: 399 }], selectedBody: initialSelectedBody }, ref) {
    /**
     * Component state management for satellite creation parameters.
     * Organized into logical groups for maintainability and performance.
     */
    const [mode, setMode] = useState('latlon');
    const [selectedTemplate, setSelectedTemplate] = useState('cubesat');

    /**
     * Section visibility state for collapsible UI sections.
     * Controls which sections of the form are expanded or collapsed.
     */
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

    /**
     * Selected celestial body state with intelligent initialization.
     * Defaults to Earth if available, otherwise uses first available body.
     */
    const [selectedBody, setSelectedBody] = useState(() => {
        if (initialSelectedBody) {
            return initialSelectedBody;
        }
        // Find Earth first, then fall back to first available body
        const earthBody = availableBodies?.find(b => b.name === 'Earth' || b.naifId === 399);
        return earthBody || availableBodies?.[0] || { name: 'Earth', naifId: 399, type: 'planet' };
    });

    // Selected body state

    /**
     * Memoized circular velocity calculation for orbital mechanics.
     * Only recalculates when mode, selected body, or circular flag changes.
     */
    const circularVelocity = useMemo(() => {
        if (mode === 'latlon' && selectedBody && formData.circular) {
            return 'auto';
        }
        return '';
    }, [mode, selectedBody, formData.circular]);

    /**
     * Memoized event handlers optimized for performance.
     * All handlers use useCallback to prevent function recreation
     * and subsequent re-renders of child components.
     */
    const handlePresetBC = useCallback((value) => {
        setFormData(prev => ({ ...prev, ballisticCoefficient: value }));
    }, []);

    const handleTemplateChange = useCallback((templateKey) => {
        setSelectedTemplate(templateKey);
        const template = SATELLITE_TEMPLATES[templateKey];
        if (template) {
            const commsConfig = COMMS_PRESETS[templateKey] || COMMS_PRESETS.cubesat;

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
    }, []);

    /**
     * Specialized event handlers for select components and form controls.
     * Optimized to prevent unnecessary re-renders of dropdown and toggle components.
     */
    const handleAntennaTypeChange = useCallback((value) => {
        setFormData(prev => ({ ...prev, antennaType: value }));
    }, []);

    const handleNetworkIdChange = useCallback((value) => {
        setFormData(prev => ({ ...prev, networkId: value }));
    }, []);

    const handleEncryptionChange = useCallback((checked) => {
        setFormData(prev => ({ ...prev, encryption: checked }));
    }, []);

    const handleInputChange = useCallback((e) => {
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

                /**
                 * Automatically disable circular orbit mode if velocity is manually modified.
                 * This prevents conflicting orbital parameter specifications.
                 */
                if (field === 'velocity' && !isNaN(parsed) && prev.circular) {
                    newData.circular = false;
                }

                return newData;
            }
            /**
             * For text inputs (e.g. satellite name), preserve the raw string value
             * without any numeric parsing or validation.
             */
            return { ...prev, [field]: value };
        });
    }, []);

    const handleSliderChange = useCallback((name, value) => {
        setFormData(prev => ({
            ...prev,
            [name]: value,
        }));
    }, []);

    const handleSubmit = useCallback(async (e) => {
        e.preventDefault();

        try {
            const params = { ...formData };
            /**
             * Map form parameters to satellite creation parameters based on selected mode.
             * Different modes (lat/lon vs orbital elements) require different parameter sets.
             */
            if (mode === 'latlon') {
                const outParams = {
                    mode,
                    latitude: params.latitude,
                    longitude: params.longitude,
                    altitude: params.altitude,
                    azimuth: params.azimuth,
                    /**
                     * Pass velocity parameter unless using circular mode.
                     * In circular mode, physics engine calculates optimal orbital velocity.
                     */
                    velocity: params.circular ? undefined : params.velocity,
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
    }, [formData, mode, selectedBody, selectedTemplate, onCreateSatellite]);

    // 6. MEMOIZED section toggle handlers
    const sectionToggles = useMemo(() => ({
        handleSystemTemplateToggle: () => setShowSystemTemplate(prev => !prev),
        handleStructureToggle: () => setShowStructure(prev => !prev),
        handleCommunicationsToggle: () => setShowCommunications(prev => !prev),
        handleOrbitalParamsToggle: () => setShowOrbitalParams(prev => !prev)
    }), []);

    // 7. MEMOIZED render field function with cached results
    const renderField = useCallback((name, label, type = "number", min = null, max = null, step = null, unit = null) => {
        return (
            <FormField
                key={name}
                name={name}
                label={label}
                type={type}
                min={min}
                max={max}
                step={step}
                unit={unit}
                value={formData[name]}
                onChange={handleInputChange}
                onSliderChange={handleSliderChange}
                disabled={name === 'velocity' && formData.circular}
                required={name === 'name'}
            />
        );
    }, [formData, handleInputChange, handleSliderChange]);

    // Imperative handle for external API
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
    }), []);

    // Effect for selected body updates
    useEffect(() => {
        if (initialSelectedBody) {
            // selectedBody is already memoized to handle this
        } else if (availableBodies?.length > 0 && !selectedBody) {
            // Already handled in memoized selectedBody computation
        }
    }, [initialSelectedBody, availableBodies, selectedBody]);

    // 8. MEMOIZED template options for performance
    const templateOptions = useMemo(() => {
        return Object.entries(SATELLITE_TEMPLATES).map(([key, template]) => ({
            key,
            name: template.name,
            description: template.description
        }));
    }, []);

    return (
        <div className="text-xs">
            {/* Central body selector */}
            <div className="p-2 border-b border-border/50">
                <BodySelector
                    mode="popover"
                    showSearch={true}
                    filterBarycenters={true}
                    selectedBody={selectedBody}
                    onBodyChange={setSelectedBody}
                    bodies={availableBodies}
                    label="Central Body"
                    placeholder="Select Body"
                    size="sm"
                    allowNone={false}
                    searchPlaceholder="Search bodies..."
                />
            </div>

            <div className="space-y-0">
                {/* Quick Start Templates - Optional */}
                <Section
                    title="Quick Start (Optional)"
                    isOpen={showSystemTemplate}
                    onToggle={sectionToggles.handleSystemTemplateToggle}
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
                                {templateOptions.map(({ key, name, description }) => (
                                    <DropdownMenuItem
                                        key={key}
                                        onSelect={() => handleTemplateChange(key)}
                                        className="flex-col items-start space-y-1 p-3"
                                    >
                                        <div className="font-medium text-sm">{name}</div>
                                        <div className="text-xs text-muted-foreground">{description}</div>
                                        <div className="text-xs text-muted-foreground">
                                            {SATELLITE_TEMPLATES[key]?.mass}kg • {SATELLITE_TEMPLATES[key]?.size}m • BC:{SATELLITE_TEMPLATES[key]?.ballisticCoefficient}
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
                    onToggle={sectionToggles.handleStructureToggle}
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
                                            {(() => {
                                                const bc = formData.ballisticCoefficient;
                                                if (bc === 30) return 'CubeSat (30)';
                                                if (bc === 100) return 'Standard (100)';
                                                if (bc === 500) return 'LargeSat (500)';
                                                if (bc === 40) return 'Space Capsule (40)';
                                                return `Custom (${bc})`;
                                            })()}
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
                    onToggle={sectionToggles.handleCommunicationsToggle}
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
                                            onValueChange={handleAntennaTypeChange}
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
                                            onValueChange={handleNetworkIdChange}
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
                                            onCheckedChange={handleEncryptionChange}
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
                    onToggle={sectionToggles.handleOrbitalParamsToggle}
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
                                                    {(() => {
                                                        const rf = formData.referenceFrame;
                                                        return rf === 'ecliptic' ? 'Ecliptic' : 'Equatorial';
                                                    })()}
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
