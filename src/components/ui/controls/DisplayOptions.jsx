import React, { useState } from 'react';
import { Button } from '../button';
import { Switch } from '../switch';
import { Input } from '../input';
import {
  Settings2,
  Grid,
  Move,
  Circle,
  Mountain,
  LineChart,
  MapPin,
  Building2,
  Plane,
  Rocket,
  Telescope,
  Radio,
  Map,
  Moon,
  Link,
  CheckSquare
} from 'lucide-react';
import { DraggableModal } from '../modal/DraggableModal';
import PropTypes from 'prop-types';

// Default settings with display options metadata
export const defaultSettings = {
  showGrid: { value: true, name: 'Grid', icon: Grid },
  showVectors: { value: false, name: 'Vectors', icon: Move },
  showSatVectors: { value: false, name: 'Sat Vectors', icon: Circle },
  showSurfaceLines: { value: true, name: 'Surface Lines', icon: Mountain },
  showOrbits: { value: true, name: 'Sat Orbits', icon: Circle },
  showTraces: { value: true, name: 'Sat Traces', icon: LineChart },
  showGroundTraces: { value: false, name: 'Ground Traces', icon: MapPin },
  showCities: { value: false, name: 'Cities', icon: Building2 },
  showAirports: { value: false, name: 'Airports', icon: Plane },
  showSpaceports: { value: false, name: 'Spaceports', icon: Rocket },
  showObservatories: { value: false, name: 'Observatories', icon: Telescope },
  showGroundStations: { value: false, name: 'Ground Stations', icon: Radio },
  showCountryBorders: { value: false, name: 'Country Borders', icon: Map },
  showStates: { value: false, name: 'States', icon: Map },
  showMoonOrbit: { value: true, name: 'Moon Orbit', icon: Moon },
  showMoonTraces: { value: false, name: 'Moon Traces', icon: LineChart },
  showMoonSurfaceLines: { value: false, name: 'Moon Surface Lines', icon: Mountain },
  showSatConnections: { value: false, name: 'Sat Connections', icon: Link },
  ambientLight: { value: 0.1, name: 'Ambient Light', icon: Settings2, type: 'number', min: 0, max: 1, step: 0.05 },
  groundTrackUpdateInterval: { value: 5, name: 'Ground Track Update Rate', icon: LineChart, type: 'number', min: 1, max: 60, step: 1 },
};

// Group settings by category
const categories = [
  {
    name: 'General',
    keys: ['showGrid', 'showVectors'],
  },
  {
    name: 'Satellites',
    keys: ['showSatVectors', 'showOrbits', 'showTraces', 'groundTrackUpdateInterval'],
  },
  {
    name: 'Ground',
    keys: ['showGroundTraces', 'showCities', 'showAirports', 'showSpaceports', 'showObservatories', 'showGroundStations', 'showCountryBorders', 'showStates', 'showSurfaceLines'],
  },
  {
    name: 'Moon',
    keys: ['showMoonOrbit', 'showMoonTraces', 'showMoonSurfaceLines'],
  },
  {
    name: 'Connections',
    keys: ['showSatConnections'],
  },
  {
    name: 'Lighting',
    keys: ['ambientLight'],
  },
];

function Accordion({ sections, children, openIndexes, setOpenIndexes }) {
  return (
    <div className="space-y-1">
      {sections.map((section, idx) => {
        const isOpen = openIndexes.includes(idx);
        return (
          <div key={section.name} className="border rounded bg-muted/30">
            <button
              className="w-full flex justify-between items-center px-3 py-2 text-xs font-semibold text-left focus:outline-none focus:ring-2 focus:ring-primary rounded"
              aria-expanded={isOpen}
              onClick={() => {
                setOpenIndexes((prev) =>
                  prev.includes(idx)
                    ? prev.filter((i) => i !== idx)
                    : [...prev, idx]
                );
              }}
              type="button"
            >
              <span>{section.name}</span>
              <span className={`transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
            </button>
            <div
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
}

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

export function DisplayOptions({ settings, onSettingChange, isOpen, onOpenChange }) {
  const [position, setPosition] = useState({ x: window.innerWidth - 220, y: 80 });
  const [openIdxs, setOpenIdxs] = useState([0]);

  // Debug: log the ambientLight value
  console.log('DisplayOptions: settings.ambientLight =', settings.ambientLight);

  return (
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
          onClick={() => {
            const allTrue = Object.entries(defaultSettings).every(([key, setting]) =>
              setting.type === 'range' ? true : settings[key]
            );
            Object.entries(defaultSettings).forEach(([key, setting]) => {
              if (setting.type !== 'range') {
                onSettingChange(key, !allTrue);
              }
            });
          }}
        >
          <CheckSquare className="h-4 w-4" />
        </Button>
      }
    >
      <Accordion sections={categories} openIndexes={openIdxs} setOpenIndexes={setOpenIdxs}>
        {(idx) => (
          <div className="space-y-1">
            {categories[idx].keys.map((key) => {
              const setting = defaultSettings[key];
              if (!setting) return null;
              // Debug: log the input value for ambientLight
              if (key === 'ambientLight') {
                const v = settings[key] !== undefined ? settings[key] : setting.value;
                console.log('Input value for ambientLight:', v);
              }
              return (
                <div key={key} className="flex items-center justify-between px-2 py-1 text-xs">
                  <div className="flex items-center gap-1">
                    {React.createElement(setting.icon, { className: "h-3 w-3" })}
                    <span className="text-[11px] text-muted-foreground">{setting.name}</span>
                  </div>
                  <div className="pr-2">
                    {setting.type === 'number' ? (
                      <Input
                        type="number"
                        size="sm"
                        className="text-xs h-5 w-12"
                        min={setting.min}
                        max={setting.max}
                        step={setting.step}
                        value={
                          (() => {
                            const v = settings[key] !== undefined ? settings[key] : setting.value;
                            if (typeof v === 'number' && !Number.isInteger(v)) {
                              return v.toFixed(3);
                            }
                            return v;
                          })()
                        }
                        onChange={(e) => {
                          const val = e.target.value;
                          onSettingChange(key, val === '' ? '' : parseFloat(val));
                        }}
                      />
                    ) : setting.type === 'range' ? (
                      <input
                        type="range"
                        className="h-1 w-20"
                        min={setting.min}
                        max={setting.max}
                        step={setting.step}
                        value={settings[key] !== undefined ? settings[key] : setting.value}
                        onChange={(e) => onSettingChange(key, parseFloat(e.target.value))}
                      />
                    ) : (
                      <Switch
                        className="scale-[0.6]"
                        checked={settings[key] || false}
                        onCheckedChange={(checked) => onSettingChange(key, checked)}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Accordion>
    </DraggableModal>
  );
}

DisplayOptions.propTypes = {
  settings: PropTypes.object.isRequired,
  onSettingChange: PropTypes.func.isRequired,
  isOpen: PropTypes.bool.isRequired,
  onOpenChange: PropTypes.func.isRequired
};
