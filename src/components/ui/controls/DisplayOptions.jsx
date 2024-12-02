import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '../button';
import { Switch } from '../switch';
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
  Link
} from 'lucide-react';
import { DraggableModal } from '../modal/DraggableModal';

// Default settings with display options metadata
export const defaultSettings = {
  showGrid: { value: true, name: 'Grid', icon: Grid },
  showVectors: { value: false, name: 'Vectors', icon: Move },
  showSatVectors: { value: false, name: 'Sat Vectors', icon: Circle },
  showSurfaceLines: { value: true, name: 'Surface Lines', icon: Mountain },
  showOrbits: { value: true, name: 'Sat Orbits', icon: Circle },
  showTraces: { value: true, name: 'Sat Traces', icon: LineChart },
  showGroundTraces: { value: true, name: 'Ground Traces', icon: MapPin },
  showCities: { value: false, name: 'Cities', icon: Building2 },
  showAirports: { value: false, name: 'Airports', icon: Plane },
  showSpaceports: { value: false, name: 'Spaceports', icon: Rocket },
  showObservatories: { value: false, name: 'Observatories', icon: Telescope },
  showGroundStations: { value: false, name: 'Ground Stations', icon: Radio },
  showCountryBorders: { value: false, name: 'Country Borders', icon: Map },
  showStates: { value: false, name: 'States', icon: Map },
  showMoonOrbit: { value: true, name: 'Moon Orbit', icon: Moon },
  showMoonTraces: { value: true, name: 'Moon Traces', icon: LineChart },
  showMoonSurfaceLines: { value: true, name: 'Moon Surface Lines', icon: Mountain },
  showSatConnections: { value: false, name: 'Sat Connections', icon: Link },
  ambientLight: { value: 0.1, name: 'Ambient Light', icon: Settings2, type: 'range', min: 0, max: 1, step: 0.05 }
};

export function DisplayOptions({ settings, onSettingChange, isOpen, onOpenChange }) {
  const [position, setPosition] = useState({ x: window.innerWidth - 320, y: 80 });

  return (
    <>
      <DraggableModal
        title="Display Options"
        isOpen={isOpen}
        onClose={() => onOpenChange(false)}
        className="w-[300px]"
        position={position}
        onPositionChange={setPosition}
      >
        <div className="space-y-0.5">
          {Object.entries(defaultSettings).map(([key, setting]) => (
            <div key={key} className="grid grid-cols-4 gap-0">
              <div className="col-span-2 flex items-center gap-0.5">
                {React.createElement(setting.icon, { className: "h-3 w-3" })}
                <span className="text-[10px] text-muted-foreground">{setting.name}</span>
              </div>
              <div className="col-span-2 flex justify-end">
                {setting.type === 'range' ? (
                  <input 
                    type="range" 
                    className="h-1 w-20"
                    min={setting.min} 
                    max={setting.max} 
                    step={setting.step} 
                    value={settings[key]} 
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
          ))}
        </div>
      </DraggableModal>
    </>
  );
}
