import React, { useState, useCallback, useMemo } from 'react';
import { Button } from '../button';
import { Switch } from '../switch';
import { Input } from '../input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../select';
import {
  Settings2,
  Grid,
  Move,
  Circle,
  Mountain,
  LineChart,
  Building2,
  Plane,
  Rocket,
  Telescope,
  Radio,
  Map,
  Link,
  CheckSquare,
  Loader2,
  Info
} from 'lucide-react';
import { DraggableModal } from '../modal/DraggableModal';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '../tooltip';
import PropTypes from 'prop-types';

// Default settings with display options metadata
export const defaultSettings = {
  showGrid: { value: true, name: 'Grid', icon: Grid,
    description: 'Show a grid overlay to help with navigation and orientation.'
  },
  showPlanetVectors: { value: false, name: 'Planetary Vectors', icon: Move },
  enableFXAA: { value: true, name: 'Anti-Aliasing (FXAA)', icon: Settings2,
    description: 'Enable fast approximate anti-aliasing for smoother rendering.'
  },
  pixelRatio: { value: Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2.0), name: 'Pixel Ratio', icon: Settings2, type: 'number', min: 0.5, max: 2, step: 0.1,
    description: 'Adjust pixel ratio to control antialias strength (effective resolution).'
  },
  showSurfaceLines: { value: true, name: 'Terrain Lines', icon: Mountain },
  showCities: { value: false, name: 'Cities', icon: Building2 },
  showAirports: { value: false, name: 'Airports', icon: Plane },
  showSpaceports: { value: false, name: 'Spaceports', icon: Rocket },
  showGroundStations: { value: false, name: 'Ground Stations', icon: Radio },
  showObservatories: { value: false, name: 'Observatories', icon: Telescope },
  showMissions: { value: false, name: 'Planetary Missions', icon: Rocket,
    description: 'Show mission landing sites (e.g. lunar landing sites).'
  },
  showCountryBorders: { value: false, name: 'Country Borders', icon: Map },
  showTopographicIsolines: { value: false, name: 'Topographic Isolines', icon: Mountain },
  showSatVectors: { value: false, name: 'Satellite Vectors', icon: Circle },
  showOrbits: { value: true, name: 'Satellite Orbits', icon: Circle },
  showApsis: { value: true, name: 'Apsis Markers', icon: Circle, description: 'Show periapsis and apoapsis markers on satellite orbits.' },
  showSatelliteConnections: { value: false, name: 'Satellite Connections', icon: Link,
    description: 'Show line-of-sight connections between satellites.'
  },
  losUpdateInterval: { value: 500, name: 'LOS Update Interval (ms)', icon: Link, type: 'number', min: 100, max: 5000, step: 100,
    description: 'How often to update line-of-sight calculations (milliseconds). Higher values reduce jittering.'
  },
  losMinElevation: { value: 5, name: 'Min Elevation Angle (°)', icon: Link, type: 'number', min: 0, max: 45, step: 1,
    description: 'Minimum elevation angle for satellite connections (degrees above horizon).'
  },
  losAtmosphericRefraction: { value: true, name: 'Atmospheric Refraction', icon: Link,
    description: 'Include atmospheric refraction effects in line-of-sight calculations.'
  },
  orbitUpdateInterval: { value: 500, name: 'Orbit Update Interval (ms)', icon: Circle, type: 'number', min: 100, max: 5000, step: 100,
    description: 'How often to update satellite orbit calculations (milliseconds). Lower values update more frequently but use more CPU.'
  },
  orbitPredictionInterval: { value: 1, name: 'Prediction Periods', icon: Circle, type: 'number', min: 0.1, max: 100, step: 0.1,
    description: 'Number of orbital periods to display. Works naturally for all orbit types.'
  },
  orbitPointsPerPeriod: { value: 180, name: 'Points per Period', icon: Circle, type: 'number', min: 10, max: 1000, step: 10,
    description: 'Resolution of orbit visualization. More points = smoother curves.'
  },
  physicsTimeStep: { value: 0.05, name: 'Physics Timestep (Hz)', icon: Settings2, type: 'number', min: 0.01, max: 1, step: 0.01,
    description: 'Integration time step in seconds. Smaller values increase accuracy but slow down simulation.'
  },
  perturbationScale: { value: 1.0, name: 'Perturbation Strength', icon: LineChart, type: 'number', min: 0, max: 1, step: 0.05,
    description: 'Scale for Moon/Sun gravitational perturbations (0–1). Minimal impact on performance.'
  },
  sensitivityScale: { value: 1.0, name: 'Sensitivity Scale', icon: LineChart, type: 'number', min: 0, max: 10, step: 0.1,
    description: `Higher values tighten the integrator's error tolerance in high-force areas (e.g. atmosphere), increasing accuracy but slowing propagation; lower values speed up simulation with less accuracy.`
  },
  integrationMethod: { value: 'auto', name: 'Integration Method', icon: Settings2, type: 'select', 
    options: [
      { value: 'auto', label: 'Auto (Recommended)' },
      { value: 'rk45', label: 'RK45 (High Precision)' },
      { value: 'rk4', label: 'RK4 (Performance)' }
    ],
    description: 'Choose the numerical integration method for satellite motion. Auto selects the best method based on time warp. RK45 provides superior precision but uses more CPU. RK4 is faster but less accurate for large timesteps.'
  },
  ambientLight: { value: 0.01, name: 'Ambient Light Intensity', icon: Settings2, type: 'number', min: 0, max: 1, step: 0.05,
    description: 'Controls the overall brightness of the scene.'
  },
  showSOI: { value: false, name: 'SOI Sphere', icon: Circle, description: 'Show the sphere of influence rim glow around planets.' },
  showPlanetOrbits: { value: true, name: 'Planet Orbits', icon: Circle, description: 'Show solar system orbit paths.' },
  realTimePlanetOrbits: { value: true, name: 'Real-time Planet Orbits', icon: Circle, description: 'Update planet orbits every frame for real-time visualization. Disable for better performance.' },
};

// Group settings by category
const categories = [
  {
    name: 'Solar System',
    keys: [
      'showGrid',
      'showPlanetVectors',
      'enableFXAA',
      'pixelRatio',
      'showSOI',
      'showPlanetOrbits',
      'realTimePlanetOrbits'
    ],
  },
  {
    name: 'Surface Features',
    keys: [
      'showSurfaceLines',
      'showCountryBorders',
      'showTopographicIsolines'
    ],
  },
  {
    name: 'Points of Interest',
    keys: [
      'showCities',
      'showAirports',
      'showSpaceports',
      'showGroundStations',
      'showObservatories',
      'showMissions'
    ],
  },
  {
    name: 'Satellites',
    keys: ['showOrbits', 'showApsis', 'showSatVectors', 'showSatelliteConnections', 'losUpdateInterval', 'losMinElevation', 'losAtmosphericRefraction'],
  },
  {
    name: 'Simulation',
    keys: [
      'orbitUpdateInterval',
      'orbitPredictionInterval',
      'orbitPointsPerPeriod',
      'physicsTimeStep',
      'integrationMethod',
      'perturbationScale',
      'sensitivityScale'
    ],
  },
  {
    name: 'Lighting',
    keys: ['ambientLight'],
  }
];

// Memoized row component to prevent unnecessary re-renders
const DisplayOptionRow = React.memo(function DisplayOptionRow({ keyName, setting, value, onChange, loading }) {
  const isNumber = setting.type === 'number';
  const isRange = setting.type === 'range';
  const isSelect = setting.type === 'select';
  const currentValue = value !== undefined ? value : setting.value;
  
  const handleNumberChange = useCallback((e) => {
    onChange(keyName, parseFloat(e.target.value));
  }, [keyName, onChange]);

  const handleRangeChange = useCallback((e) => {
    onChange(keyName, parseFloat(e.target.value));
  }, [keyName, onChange]);

  const handleSelectChange = useCallback((val) => {
    onChange(keyName, val);
  }, [keyName, onChange]);

  const handleSwitchChange = useCallback((checked) => {
    onChange(keyName, checked);
  }, [keyName, onChange]);
  
  return (
    <div key={keyName} className="flex items-center justify-between px-2 py-1 text-xs">
      <div className="flex items-center gap-1">
        {setting.icon && React.createElement(setting.icon, { className: "h-3 w-3" })}
        <span className="text-[11px] text-muted-foreground">{setting.name}</span>
        {setting.description && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3 w-3 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent sideOffset={4} className="z-[9999]">
              {setting.description}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="pr-2">
        {isNumber ? (
          <div className="flex items-center">
            <Input
              type="number"
              size="sm"
              className="text-xs h-5 w-12"
              min={setting.min}
              max={setting.max}
              step={setting.step}
              value={currentValue}
              onChange={handleNumberChange}
            />
            {loading && <Loader2 className="w-3 h-3 animate-spin ml-1" />}
          </div>
        ) : isRange ? (
          <input
            type="range"
            className="h-1 w-20"
            min={setting.min}
            max={setting.max}
            step={setting.step}
            value={currentValue}
            onChange={handleRangeChange}
          />
        ) : isSelect ? (
          <div className="flex items-center">
            <Select value={currentValue} onValueChange={handleSelectChange}>
              <SelectTrigger className="text-xs h-6 w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {setting.options.map(option => (
                  <SelectItem key={option.value} value={option.value} className="text-xs">
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {loading && <Loader2 className="w-3 h-3 animate-spin ml-1" />}
          </div>
        ) : (
          <Switch
            className="scale-[0.6]"
            checked={currentValue}
            onCheckedChange={handleSwitchChange}
            disabled={setting.disabled}
          />
        )}
      </div>
    </div>
  );
});

DisplayOptionRow.propTypes = {
  keyName: PropTypes.string.isRequired,
  setting: PropTypes.object.isRequired,
  value: PropTypes.any,
  onChange: PropTypes.func.isRequired,
  loading: PropTypes.bool
};

// Memoized Accordion component
const Accordion = React.memo(function Accordion({ sections, children, openIndexes, setOpenIndexes }) {
  const toggleSection = useCallback((index) => {
    setOpenIndexes(prev => 
      prev.includes(index) 
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  }, [setOpenIndexes]);

  return (
    <div className="space-y-1">
      {sections.map((section, idx) => {
        const isOpen = openIndexes.includes(idx);
        
        return (
          <div key={section.name} className="border-b border-border last:border-b-0">
            <button
              onClick={() => toggleSection(idx)}
              className="w-full flex items-center justify-between p-2 text-xs hover:bg-accent transition-colors"
              aria-expanded={isOpen}
              aria-controls={`section-${idx}`}
            >
              <span className="text-muted-foreground">{section.name}</span>
              <span className={`transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
            </button>
            <div
              id={`section-${idx}`}
              className={`overflow-hidden transition-all duration-200 ${isOpen ? 'max-h-96 py-1' : 'max-h-0 py-0'}`}
              aria-hidden={!isOpen}
            >
              {children(idx)}
            </div>
          </div>
        );
      })}
    </div>
  );
});

Accordion.propTypes = {
  sections: PropTypes.arrayOf(
    PropTypes.shape({
      name: PropTypes.string.isRequired,
      keys: PropTypes.arrayOf(PropTypes.string).isRequired
    })
  ).isRequired,
  children: PropTypes.func.isRequired,
  openIndexes: PropTypes.arrayOf(PropTypes.number).isRequired,
  setOpenIndexes: PropTypes.func.isRequired
};

export const DisplayOptions = React.memo(function DisplayOptions({ settings, onSettingChange, isOpen, onOpenChange }) {
  const [position, setPosition] = useState({ x: 40, y: 80 });
  const [openIdxs, setOpenIdxs] = useState([0]);
  const [loadingKeys, setLoadingKeys] = useState({});
  
  // Memoize settings values to prevent unnecessary recalculations
  const settingsValues = useMemo(() => {
    const values = {};
    Object.keys(defaultSettings).forEach(key => {
      values[key] = settings[key] !== undefined ? settings[key] : defaultSettings[key].value;
    });
    return values;
  }, [settings]);
  
  // Memoize the toggle all function with optimized dependencies
  const handleToggleAll = useCallback(() => {
    // collect only boolean setting keys
    const booleanKeys = Object.entries(defaultSettings)
      .filter(([, setting]) => (setting.type === undefined || setting.type === 'boolean'))
      .map(([key]) => key);
    // check if all boolean settings are currently enabled
    const allOn = booleanKeys.every(key => settingsValues[key]);
    // toggle each boolean setting
    booleanKeys.forEach(key => onSettingChange(key, !allOn));
  }, [settingsValues, onSettingChange]); // Use memoized values instead of raw settings

  // Memoize the change handler with debounced loading state
  const handleSettingChange = useCallback((k, v) => {
    // Only show loading for expensive operations
    const expensiveOps = new Set([
      'orbitUpdateInterval', 'orbitPredictionInterval', 'orbitPointsPerPeriod',
      'physicsTimeStep', 'integrationMethod', 'perturbationScale', 'sensitivityScale'
    ]);
    
    if (expensiveOps.has(k)) {
      setLoadingKeys(prev => ({ ...prev, [k]: v }));
      // Clear loading state after a reasonable timeout
      setTimeout(() => {
        setLoadingKeys(prev => {
          const next = { ...prev };
          delete next[k];
          return next;
        });
      }, 500); // 500ms should be enough for batched updates
    }
    
    onSettingChange(k, v);
  }, [onSettingChange]);

  return (
    <TooltipProvider>
      <DraggableModal
        title="Display Options"
        isOpen={isOpen}
        onClose={() => onOpenChange(false)}
        defaultPosition={position}
        onPositionChange={setPosition}
        resizable={true}
        defaultWidth="auto"
        defaultHeight={600}
        minWidth={0}
        minHeight={300}
        rightElement={
          <Button
            variant="ghost"
            size="icon"
            className="w-8 h-8 mr-2"
            onClick={handleToggleAll}
          >
            <CheckSquare className="h-4 w-4" />
          </Button>
        }
      >
        <Accordion sections={categories} openIndexes={openIdxs} setOpenIndexes={setOpenIdxs}>
          {idx => (
            <div className="space-y-1">
              {categories[idx].keys.map(key => {
                const setting = defaultSettings[key];
                if (!setting) return null;
                return (
                  <DisplayOptionRow
                    key={key}
                    keyName={key}
                    setting={setting}
                    value={settingsValues[key]}
                    onChange={handleSettingChange}
                    loading={loadingKeys[key] !== undefined}
                  />
                );
              })}
            </div>
          )}
        </Accordion>
      </DraggableModal>
    </TooltipProvider>
  );
});

DisplayOptions.propTypes = {
  settings: PropTypes.object.isRequired,
  onSettingChange: PropTypes.func.isRequired,
  isOpen: PropTypes.bool.isRequired,
  onOpenChange: PropTypes.func.isRequired,
};
