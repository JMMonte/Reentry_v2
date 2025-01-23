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
  Link,
  CheckSquare,
  Sun
} from 'lucide-react';
import { DraggableModal } from '../modal/DraggableModal';

// Icon mapping for dynamic properties
const iconMap = {
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
  Sun
};

export function DisplayOptions({ settings, onSettingChange, isOpen, onOpenChange }) {
  const [position, setPosition] = useState({ x: window.innerWidth - 320, y: 80 });
  const [displayProperties, setDisplayProperties] = useState({});

  useEffect(() => {
    // Get display properties from DisplayManager
    if (window.app3d?.displayManager) {
      const props = window.app3d.displayManager.collectDisplayProperties();
      setDisplayProperties(props);
    }
  }, [isOpen]); // Refresh when modal opens

  // Flatten display properties for rendering
  const flattenedSettings = Object.entries(displayProperties).reduce((acc, [category, props]) => {
    return { ...acc, ...props };
  }, {});

  return (
    <>
      <DraggableModal
        title="Display Options"
        isOpen={isOpen}
        onClose={() => onOpenChange(false)}
        className="w-[300px]"
        position={position}
        onPositionChange={setPosition}
        rightElement={
          <Button
            variant="ghost"
            size="icon"
            className="w-8 h-8 mr-2"
            onClick={() => {
              const allTrue = Object.entries(flattenedSettings).every(([key, setting]) =>
                setting.type === 'range' ? true : settings[key]
              );
              Object.entries(flattenedSettings).forEach(([key, setting]) => {
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
        <div className="space-y-0.5">
          {Object.entries(displayProperties).map(([category, categoryProps]) => (
            <div key={category}>
              <div className="text-[10px] font-bold text-muted-foreground uppercase mt-2 mb-1">
                {category}
              </div>
              {Object.entries(categoryProps).map(([key, setting]) => (
                <div key={key} className="grid grid-cols-4 gap-0">
                  <div className="col-span-2 flex items-center gap-0.5">
                    {React.createElement(iconMap[setting.icon], { className: "h-3 w-3" })}
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
          ))}
        </div>
      </DraggableModal>
    </>
  );
}
