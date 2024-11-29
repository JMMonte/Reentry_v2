import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '../button';
import { Switch } from '../switch';
import {
  Grid,
  Move,
  RadioTower,
  Mountain,
  Circle,
  LineChart,
  Map,
  Building2,
  Plane,
  Rocket,
  Telescope,
  Boxes,
  MapPin,
  Moon,
  Link,
  X,
  Settings2
} from 'lucide-react';

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
  showGroundStations: { value: false, name: 'Ground Stations', icon: RadioTower },
  showCountryBorders: { value: false, name: 'Country Borders', icon: Map },
  showStates: { value: false, name: 'States', icon: Map },
  showMoonOrbit: { value: true, name: 'Moon Orbit', icon: Moon },
  showMoonTraces: { value: true, name: 'Moon Traces', icon: LineChart },
  showMoonSurfaceLines: { value: true, name: 'Moon Surface Lines', icon: Mountain },
  showSatConnections: { value: false, name: 'Sat Connections', icon: Link }
};

export function DisplayOptions() {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ x: window.innerWidth - 320, y: 80 });
  const [settings, setSettings] = useState({});
  const popupRef = useRef(null);
  const dragRef = useRef({ isDragging: false, startX: 0, startY: 0 });

  // Load initial settings
  useEffect(() => {
    if (window.app3d) {
      const currentSettings = {};
      Object.keys(defaultSettings).forEach(key => {
        currentSettings[key] = window.app3d.getDisplaySetting(key) ?? defaultSettings[key].value;
      });
      setSettings(currentSettings);
    }
  }, []);

  useEffect(() => {
    const handleEscapeKey = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscapeKey);
    return () => document.removeEventListener('keydown', handleEscapeKey);
  }, []);

  const startDragging = (e) => {
    if (popupRef.current) {
      dragRef.current = {
        isDragging: true,
        startX: e.clientX - position.x,
        startY: e.clientY - position.y
      };
      e.preventDefault();
    }
  };

  const onDrag = useCallback((e) => {
    if (dragRef.current.isDragging && popupRef.current) {
      const newX = e.clientX - dragRef.current.startX;
      const newY = e.clientY - dragRef.current.startY;
      
      const maxX = window.innerWidth - popupRef.current.offsetWidth;
      const maxY = window.innerHeight - popupRef.current.offsetHeight;
      
      setPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY))
      });
    }
  }, []);

  const stopDragging = useCallback(() => {
    dragRef.current.isDragging = false;
  }, []);

  const handleSettingChange = useCallback((key, checked) => {
    if (window.app3d) {
      window.app3d.updateDisplaySetting(key, checked);
      setSettings(prev => ({ ...prev, [key]: checked }));
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      window.addEventListener('mousemove', onDrag);
      window.addEventListener('mouseup', stopDragging);
      return () => {
        window.removeEventListener('mousemove', onDrag);
        window.removeEventListener('mouseup', stopDragging);
      };
    }
  }, [isOpen, onDrag, stopDragging]);

  return (
    <div className="fixed top-4 right-4 z-50">
      <Button 
        variant="outline" 
        size="icon" 
        className="w-10 h-10"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Settings2 className="h-[1.2rem] w-[1.2rem]" />
      </Button>

      {isOpen && (
        <div
          ref={popupRef}
          className="fixed bg-background border rounded-lg shadow-lg overflow-hidden"
          style={{
            left: `${position.x}px`,
            top: `${position.y}px`,
            width: '300px',
          }}
        >
          <div 
            className="flex justify-between items-center p-4 bg-muted/50 cursor-move select-none border-b"
            onMouseDown={startDragging}
          >
            <h2 className="text-sm font-semibold">Display Options</h2>
            <Button 
              variant="ghost" 
              size="icon"
              className="h-6 w-6 hover:bg-muted"
              onClick={() => setIsOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="p-4 space-y-3 max-h-[calc(100vh-200px)] overflow-y-auto">
            {Object.entries(defaultSettings).map(([key, option]) => {
              const Icon = option.icon;
              const isChecked = settings[key] ?? option.value;
              return (
                <div key={key} className="flex items-center space-x-3">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-grow text-sm">{option.name}</div>
                  <Switch
                    checked={isChecked}
                    onCheckedChange={(checked) => handleSettingChange(key, checked)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
