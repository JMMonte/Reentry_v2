import React, { useState } from 'react';
import { Button } from '../Button';
import { Switch } from '../Switch';
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
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Globe,
  Satellite
} from 'lucide-react';
import { DraggableModal } from '../modal/DraggableModal';
import { cn } from '../../../lib/Utils';

// Group settings by category
export const displaySettingsConfig = {
  earth: {
    title: 'Earth',
    icon: Globe,
    settings: {
      showGrid: { value: true, name: 'Grid', icon: Grid },
      showSurfaceLines: { value: true, name: 'Surface Lines', icon: Mountain },
      showCountryBorders: { value: false, name: 'Country Borders', icon: Map },
      showStates: { value: false, name: 'States', icon: Map },
    }
  },
  satellites: {
    title: 'Satellites',
    icon: Satellite,
    settings: {
      showOrbits: { value: true, name: 'Orbits', icon: Circle },
      showTraces: { value: true, name: 'Traces', icon: LineChart },
      showGroundTraces: { value: false, name: 'Ground Traces', icon: MapPin },
      showSatVectors: { value: false, name: 'Vectors', icon: Move },
      showSatConnections: { value: false, name: 'Connections', icon: Link },
    }
  },
  moon: {
    title: 'Moon',
    icon: Moon,
    settings: {
      showMoonOrbit: { value: true, name: 'Orbit', icon: Moon },
      showMoonTraces: { value: false, name: 'Traces', icon: LineChart },
      showMoonSurfaceLines: { value: false, name: 'Surface Lines', icon: Mountain },
    }
  },
  infrastructure: {
    title: 'Infrastructure',
    icon: Building2,
    settings: {
      showCities: { value: false, name: 'Cities', icon: Building2 },
      showAirports: { value: false, name: 'Airports', icon: Plane },
      showSpaceports: { value: false, name: 'Spaceports', icon: Rocket },
      showObservatories: { value: false, name: 'Observatories', icon: Telescope },
      showGroundStations: { value: false, name: 'Ground Stations', icon: Radio },
    }
  },
  physics: {
    title: 'Physics',
    icon: Move,
    settings: {
      showVectors: { value: false, name: 'Vectors', icon: Move },
    }
  },
  rendering: {
    title: 'Rendering',
    icon: Settings2,
    settings: {
      ambientLight: { value: 0.1, name: 'Ambient Light', icon: Settings2, type: 'range', min: 0, max: 1, step: 0.05 }
    }
  }
};

// Create a flat map of all settings for backward compatibility
export const defaultSettings = Object.values(displaySettingsConfig).reduce((acc, category) => {
  return { ...acc, ...category.settings };
}, {});

// Component for a single setting item
const SettingItem = ({ settingKey, setting, value, onChange }) => {
  return (
    <div className="grid grid-cols-4 gap-0 py-0.5 hover:bg-muted/20 rounded-sm px-1">
      <div className="col-span-2 flex items-center gap-1.5">
        {React.createElement(setting.icon, { className: "h-3.5 w-3.5" })}
        <span className="text-xs text-muted-foreground">{setting.name}</span>
      </div>
      <div className="col-span-2 flex justify-end items-center">
        {setting.type === 'range' ? (
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-[10px] text-muted-foreground">{value.toFixed(2)}</span>
            <input
              type="range"
              className="h-1.5 w-24"
              min={setting.min}
              max={setting.max}
              step={setting.step}
              value={value}
              onChange={(e) => onChange(settingKey, parseFloat(e.target.value))}
            />
          </div>
        ) : (
          <Switch
            className="scale-[0.7]"
            checked={value || false}
            onCheckedChange={(checked) => onChange(settingKey, checked)}
          />
        )}
      </div>
    </div>
  );
};

// Component for a category of settings
const SettingCategory = ({ category, settings, onSettingChange, expanded, onToggleExpand }) => {
  const { title, icon, settings: categorySettings } = displaySettingsConfig[category];

  return (
    <div className="mb-2">
      <div
        className="flex items-center gap-2 p-1.5 bg-muted/30 rounded-md cursor-pointer"
        onClick={onToggleExpand}
      >
        {expanded ?
          <ChevronDown className="h-3.5 w-3.5" /> :
          <ChevronRight className="h-3.5 w-3.5" />
        }
        {React.createElement(icon, { className: "h-3.5 w-3.5" })}
        <span className="text-xs font-medium">{title}</span>
      </div>

      {expanded && (
        <div className="pl-4 pr-1 mt-1 space-y-0.5">
          {Object.entries(categorySettings).map(([key, setting]) => (
            <SettingItem
              key={key}
              settingKey={key}
              setting={setting}
              value={settings[key]}
              onChange={onSettingChange}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export function DisplayOptions({ settings, onSettingChange, isOpen, onOpenChange }) {
  const [position, setPosition] = useState({ x: window.innerWidth - 320, y: 80 });
  const [expandedCategories, setExpandedCategories] = useState({
    earth: true,
    satellites: true,
    moon: false,
    infrastructure: false,
    physics: false,
    rendering: true
  });

  const toggleCategory = (category) => {
    setExpandedCategories({
      ...expandedCategories,
      [category]: !expandedCategories[category]
    });
  };

  const toggleAllSettings = (value) => {
    Object.entries(defaultSettings).forEach(([key, setting]) => {
      if (setting.type !== 'range') {
        onSettingChange(key, value);
      }
    });
  };

  // Check if all boolean settings are enabled
  const allEnabled = Object.entries(defaultSettings).every(([key, setting]) =>
    setting.type === 'range' ? true : settings[key]
  );

  return (
    <DraggableModal
      title="Display Options"
      isOpen={isOpen}
      onClose={() => onOpenChange(false)}
      className="w-[320px]"
      position={position}
      onPositionChange={setPosition}
      rightElement={
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="w-8 h-8"
            title={allEnabled ? "Disable All" : "Enable All"}
            onClick={() => toggleAllSettings(!allEnabled)}
          >
            <CheckSquare className={cn("h-4 w-4", allEnabled ? "text-primary" : "text-muted-foreground")} />
          </Button>
        </div>
      }
    >
      <div className="space-y-1 max-h-[60vh] overflow-y-auto pr-1">
        {Object.keys(displaySettingsConfig).map((category) => (
          <SettingCategory
            key={category}
            category={category}
            settings={settings}
            onSettingChange={onSettingChange}
            expanded={expandedCategories[category]}
            onToggleExpand={() => toggleCategory(category)}
          />
        ))}
      </div>
    </DraggableModal>
  );
}
