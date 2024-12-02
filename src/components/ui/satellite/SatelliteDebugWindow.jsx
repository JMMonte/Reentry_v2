import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Button } from '../button';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../popover";
import { Constants } from '../../../utils/Constants'; // Import Constants

const ColorPicker = ({ color, onChange }) => {
  const colors = [
    // Bright primary colors
    '#FF0000', '#FF4D00', '#FF9900', '#FFCC00', '#FFFF00',
    // Bright secondary colors
    '#00FF00', '#00FF99', '#00FFFF', '#00CCFF', '#0099FF',
    // Bright tertiary colors
    '#0000FF', '#4D00FF', '#9900FF', '#FF00FF', '#FF0099',
    // Bright neon colors
    '#FF1493', '#00FF7F', '#FF69B4', '#7FFF00', '#40E0D0',
    // Bright pastel colors
    '#FF99CC', '#99FF99', '#99FFFF', '#9999FF', '#FF99FF'
  ];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon"
          className="h-5 w-5 p-0 border border-border"
          style={{ 
            backgroundColor: color,
            minWidth: '20px',
            minHeight: '20px'
          }}
        />
      </PopoverTrigger>
      <PopoverContent className="w-[160px] p-1" align="end">
        <div className="grid grid-cols-5 gap-1">
          {colors.map((c) => (
            <Button
              key={c}
              variant="ghost"
              size="icon"
              className="h-6 w-6 p-0 border border-border hover:border-ring"
              style={{ 
                backgroundColor: c,
                minWidth: '24px',
                minHeight: '24px'
              }}
              onClick={() => onChange(c)}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export function SatelliteDebugWindow({ satellite, earth }) {
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [position3D, setPosition3D] = useState({ x: 0, y: 0, z: 0 });
  const [velocity, setVelocity] = useState({ x: 0, y: 0, z: 0 });
  const [altitude, setAltitude] = useState(0);
  const [speed, setSpeed] = useState(0);
  const popupRef = useRef(null);

  useEffect(() => {
    const updatePosition = () => {
      if (!satellite || !earth) return;
      
      // Get current position and velocity
      const pos = satellite.mesh.position;
      const vel = satellite.velocity;
      
      // Convert scaled values back to real units
      const realPos = new THREE.Vector3(
        pos.x / Constants.scale,
        pos.y / Constants.scale,
        pos.z / Constants.scale
      );
      
      setPosition3D(realPos);
      setVelocity(vel);

      // Calculate altitude (using unscaled position)
      const distance = Math.sqrt(
        realPos.x * realPos.x + 
        realPos.y * realPos.y + 
        realPos.z * realPos.z
      );
      
      // Convert Earth radius from meters to km
      const earthRadiusKm = Constants.earthRadius * Constants.metersToKm;
      setAltitude(distance - earthRadiusKm);

      // Calculate speed
      setSpeed(Math.sqrt(
        vel.x * vel.x +
        vel.y * vel.y +
        vel.z * vel.z
      ) / Constants.scale);
    };

    // Update every frame
    const animate = () => {
      updatePosition();
      requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(animate);
    };
  }, [satellite, earth]);

  const handleRemove = () => {
    if (window.app3d) {
      window.app3d.removeSatellite(satellite.id);
    }
  };

  const startDragging = (e) => {
    setIsDragging(true);
    const rect = popupRef.current.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;

      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;

      // Get window dimensions
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;

      // Get popup dimensions
      const popupRect = popupRef.current.getBoundingClientRect();
      const popupWidth = popupRect.width;
      const popupHeight = popupRect.height;

      // Calculate bounds
      const maxX = windowWidth - popupWidth;
      const maxY = windowHeight - popupHeight;

      // Constrain position within window bounds
      setPosition({
        x: Math.max(0, Math.min(maxX, newX)),
        y: Math.max(0, Math.min(maxY, newY))
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  const handleColorChange = (color) => {
    if (satellite) {
      satellite.setColor(color);
    }
  };

  return (
    <div
      ref={popupRef}
      className="fixed z-50 bg-background/80 backdrop-blur-sm border rounded-lg shadow-lg overflow-hidden"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: '220px',
      }}
    >
      <div 
        className="flex justify-between items-center p-1 bg-muted/50 cursor-move select-none border-b"
        onMouseDown={startDragging}
      >
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 hover:bg-muted"
            onClick={() => setIsCollapsed(!isCollapsed)}
          >
            {isCollapsed ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronUp className="h-3 w-3" />
            )}
          </Button>
          <div className="flex flex-col">
            <span className="text-[10px] font-semibold">{satellite.name || `Satellite ${satellite.id}`}</span>
            <span className="text-[8px] text-muted-foreground">ID: {satellite.id}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <ColorPicker color={satellite.color} onChange={handleColorChange} />
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 hover:bg-muted text-destructive hover:text-destructive"
            onClick={handleRemove}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
      
      {!isCollapsed && (
        <div className="p-1 space-y-0.5 text-[10px]">
          <div className="grid grid-cols-4 gap-0.5">
            <span className="col-span-1 text-muted-foreground">Alt:</span>
            <span className="col-span-3 font-mono">{altitude.toFixed(1)} km</span>
            <span className="col-span-1 text-muted-foreground">Rad:</span>
            <span className="col-span-3 font-mono">{(altitude + Constants.earthRadius * Constants.metersToKm).toFixed(1)} km</span>
            <span className="col-span-1 text-muted-foreground">Pe:</span>
            <span className="col-span-3 font-mono text-red-500">{satellite.periapsisAltitude ? satellite.periapsisAltitude.toFixed(1) : 'N/A'} km</span>
            <span className="col-span-1 text-muted-foreground">Ap:</span>
            <span className="col-span-3 font-mono text-blue-500">{satellite.apoapsisAltitude ? satellite.apoapsisAltitude.toFixed(1) : 'N/A'} km</span>
          </div>
          
          <div className="grid grid-cols-4 gap-0.5">
            <span className="col-span-1 text-muted-foreground">Pos:</span>
            <span className="col-span-3 font-mono">
              {(position3D.x/1000).toFixed(1)}, {(position3D.y/1000).toFixed(1)}, {(position3D.z/1000).toFixed(1)}
            </span>
          </div>
          
          <div className="grid grid-cols-4 gap-0.5">
            <span className="col-span-1 text-muted-foreground">Vel:</span>
            <span className="col-span-3 font-mono">
              {speed.toFixed(1)} km/s
            </span>
          </div>

          <div className="grid grid-cols-4 gap-0.5">
            <span className="col-span-1 text-muted-foreground">Vec:</span>
            <span className="col-span-3 font-mono">
              {velocity.x.toFixed(1)}, {velocity.y.toFixed(1)}, {velocity.z.toFixed(1)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
