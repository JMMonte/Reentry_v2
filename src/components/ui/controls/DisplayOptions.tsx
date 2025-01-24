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

interface DisplaySetting {
  name: string;
  icon: keyof typeof iconMap;
  type: 'range' | 'toggle';
  value: number | boolean;
  min?: number;
  max?: number;
  step?: number;
}

interface DisplayProperties {
  [category: string]: {
    [key: string]: DisplaySetting;
  };
}

interface DisplayOptionsProps {
  onSettingChange: (key: string, value: number | boolean) => void;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DisplayOptions({ onSettingChange, isOpen, onOpenChange }: DisplayOptionsProps) {
  const [position, setPosition] = useState({ x: window.innerWidth - 320, y: 80 });
  const [displayProperties, setDisplayProperties] = useState<DisplayProperties>({});

  const handleSettingChange = useCallback((key: string, value: number | boolean) => {
    console.log('=== Setting Change Debug ===');
    console.log('1. Setting changed:', { key, value });
    console.log('2. Current displayProperties:', displayProperties);

    // Emit the setting change event
    document.dispatchEvent(new CustomEvent('displaySettingToggled', {
      detail: { key, value }
    }));

    // Update local state immediately
    setDisplayProperties(prev => {
      const [category] = Object.entries(prev).find(([_, props]) => key in props) || [];
      
      if (!category) {
        console.log('ERROR: Category not found for key:', key);
        return prev;
      }
      
      return {
        ...prev,
        [category]: {
          ...prev[category],
          [key]: {
            ...prev[category][key],
            value: value
          }
        }
      };
    });
  }, [displayProperties]);

  useEffect(() => {
    // Get initial display properties
    if (window.app3d?.displayManager) {
      const props = window.app3d.displayManager.collectDisplayProperties();
      console.log('Initial display properties:', props);
      setDisplayProperties(props);
    }

    // Listen for display properties updates
    const handleDisplayPropertiesUpdate = (event: CustomEvent<DisplayProperties>) => {
      console.log('Received display update:', event.detail);
      setDisplayProperties(event.detail);
    };

    document.addEventListener('displayPropertiesUpdate', handleDisplayPropertiesUpdate as EventListener);

    return () => {
      document.removeEventListener('displayPropertiesUpdate', handleDisplayPropertiesUpdate as EventListener);
    };
  }, []);

  // Flatten display properties for rendering
  const flattenedSettings = Object.entries(displayProperties).reduce<Record<string, DisplaySetting>>((acc, [_, props]) => {
    return { ...acc, ...props };
  }, {});

  return (
    <DraggableModal
      title="Display Options"
      isOpen={isOpen}
      onClose={() => onOpenChange(false)}
      className="w-[300px]"
      defaultPosition={position}
      onPositionChange={setPosition}
      rightElement={
        <Button
          variant="ghost"
          size="icon"
          className="w-8 h-8 mr-2"
          onClick={() => {
            const allTrue = Object.entries(flattenedSettings).every(([_, setting]) =>
              setting.type === 'range' ? true : setting.value
            );
            Object.entries(flattenedSettings).forEach(([key, setting]) => {
              if (setting.type !== 'range') {
                handleSettingChange(key, !allTrue);
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
                      value={setting.value as number}
                      onChange={(e) => handleSettingChange(key, parseFloat(e.target.value))}
                    />
                  ) : (
                    <Switch
                      className="scale-[0.6]"
                      checked={setting.value as boolean}
                      onCheckedChange={(checked) => handleSettingChange(key, checked)}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </DraggableModal>
  );
}
