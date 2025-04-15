import React, { useState, useEffect, useRef } from 'react';
import { Button } from "../button";
import { DraggableModal } from "../modal/DraggableModal";
import { ColorPicker } from "./ColorPicker";
import { Focus, Trash2 } from "lucide-react";
import { Constants } from "../../../utils/Constants";
import { formatBodySelection } from '../../../utils/BodySelectionUtils';

export function SatelliteDebugWindow({ satellite, earth, onBodySelect, onClose }) {
  const [orbitalElements, setOrbitalElements] = useState(null);
  const lastUpdateTime = useRef(0);
  const updateInterval = 100; // Update every 100ms instead of every frame

  // Store reference to setIsOpen in satellite (for toggling from list)
  useEffect(() => {
    if (satellite) {
      satellite.debugWindow = {
        onPositionUpdate: () => {
          setOrbitalElements(satellite.getOrbitalElements(earth));
        }
      };
      return () => {
        satellite.debugWindow = null;
      };
    }
  }, [satellite, earth]);

  useEffect(() => {
    const updateOrbitalElements = () => {
      if (!satellite || !earth) return;
      const currentTime = performance.now();
      if (currentTime - lastUpdateTime.current < updateInterval) return;
      lastUpdateTime.current = currentTime;
      setOrbitalElements(satellite.getOrbitalElements(earth));
    };
    // Update initially
    updateOrbitalElements();
    // Set up animation frame based updates
    let animationFrameId;
    const animate = () => {
      updateOrbitalElements();
      animationFrameId = requestAnimationFrame(animate);
    };
    animate();
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [satellite, earth]);

  const handleFocus = () => {
    if (onBodySelect && satellite) {
      const formattedValue = formatBodySelection(satellite);
      onBodySelect(formattedValue);
    }
  };

  const handleDelete = () => {
    if (satellite) {
      satellite.delete();
      if (onClose) onClose();
    }
  };

  const renderVector = (vector, label, isVelocity = false) => {
    if (!vector) return null;
    // Position is in meters and needs to be converted to km
    // Velocity is in m/s and should be displayed as is
    const scale = isVelocity ? 1 : Constants.metersToKm;
    const unit = isVelocity ? 'm/s' : 'km';
    return (
      <div className="grid grid-cols-4 gap-0.5">
        <span className="text-[10px] font-mono text-muted-foreground">{label}:</span>
        <span className="text-[10px] font-mono">{formatNumber(vector.x * scale)} {unit}</span>
        <span className="text-[10px] font-mono">{formatNumber(vector.y * scale)} {unit}</span>
        <span className="text-[10px] font-mono">{formatNumber(vector.z * scale)} {unit}</span>
      </div>
    );
  };

  const formatNumber = (num) => {
    if (num === undefined || num === null) return 'N/A';
    return typeof num === 'number' ? num.toFixed(2) : num;
  };

  if (!satellite) return null;

  return (
    <DraggableModal
      title={satellite.name || `Satellite ${satellite.id}`}
      isOpen={true}
      onClose={onClose}
      className="w-[300px]"
      key={satellite.id + '-debug-' + (satellite.debugWindow?.isOpen ? 'open' : 'closed')}
      defaultPosition={{ x: window.innerWidth - 320, y: 80 }}
      resizable={true}
      defaultWidth={300}
      leftElement={
        <ColorPicker
          color={satellite.color}
          onChange={(color) => satellite.setColor(color)}
        />
      }
      rightElement={
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="w-8 h-8" onClick={handleFocus}>
            <Focus className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="w-8 h-8" onClick={handleDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      }
    >
      <div className="space-y-2">
        {satellite && (
          <>
            {renderVector(satellite.position, "Position")}
            {renderVector(satellite.velocity, "Velocity", true)}
            {renderVector(satellite.acceleration, "Acceleration", true)}

            <div className="grid grid-cols-4 gap-0.5">
              <span className="text-[10px] font-mono text-muted-foreground">Speed:</span>
              <span className="col-span-3 text-[10px] font-mono">{formatNumber(satellite.velocity.length())} m/s</span>
            </div>

            <div className="space-y-0.5">
              <div className="text-[10px] font-semibold">Current Altitude</div>
              <div className="grid grid-cols-4 gap-0.5">
                <span className="text-[10px] font-mono text-muted-foreground">Radial:</span>
                <span className="col-span-3 text-[10px] font-mono">{formatNumber(satellite.getRadialAltitude())} km</span>
              </div>
              <div className="grid grid-cols-4 gap-0.5">
                <span className="text-[10px] font-mono text-muted-foreground">Surface:</span>
                <span className="col-span-3 text-[10px] font-mono">{formatNumber(satellite.getSurfaceAltitude(earth))} km</span>
              </div>
            </div>

            {orbitalElements && (
              <div className="space-y-0.5">
                <div className="text-[10px] font-semibold">Orbit</div>
                <div className="grid grid-cols-4 gap-0.5">
                  <span className="text-[10px] font-mono text-muted-foreground">SMA:</span>
                  <span className="col-span-3 text-[10px] font-mono">{formatNumber(orbitalElements.semiMajorAxis)} km</span>
                </div>
                <div className="grid grid-cols-4 gap-0.5">
                  <span className="text-[10px] font-mono text-muted-foreground">Ecc:</span>
                  <span className="col-span-3 text-[10px] font-mono">{formatNumber(orbitalElements.eccentricity)}</span>
                </div>
                <div className="grid grid-cols-4 gap-0.5">
                  <span className="text-[10px] font-mono text-muted-foreground">Inc:</span>
                  <span className="col-span-3 text-[10px] font-mono">{formatNumber(orbitalElements.inclination)}°</span>
                </div>
                <div className="grid grid-cols-4 gap-0.5">
                  <span className="text-[10px] font-mono text-muted-foreground">LAN:</span>
                  <span className="col-span-3 text-[10px] font-mono">{formatNumber(orbitalElements.longitudeOfAscendingNode)}°</span>
                </div>
                <div className="grid grid-cols-4 gap-0.5">
                  <span className="text-[10px] font-mono text-muted-foreground">AoP:</span>
                  <span className="col-span-3 text-[10px] font-mono">{formatNumber(orbitalElements.argumentOfPeriapsis)}°</span>
                </div>
                <div className="grid grid-cols-4 gap-0.5">
                  <span className="text-[10px] font-mono text-muted-foreground">TA:</span>
                  <span className="col-span-3 text-[10px] font-mono">{formatNumber(orbitalElements.trueAnomaly)}°</span>
                </div>
                <div className="grid grid-cols-4 gap-0.5">
                  <span className="text-[10px] font-mono text-muted-foreground">Period:</span>
                  <span className="col-span-3 text-[10px] font-mono">{formatNumber(orbitalElements.period)} s</span>
                </div>
                <div className="grid grid-cols-4 gap-0.5">
                  <span className="text-[10px] font-mono text-muted-foreground">h:</span>
                  <span className="col-span-3 text-[10px] font-mono">{formatNumber(orbitalElements.specificAngularMomentum)} m²/s</span>
                </div>
                <div className="grid grid-cols-4 gap-0.5">
                  <span className="text-[10px] font-mono text-muted-foreground">ε:</span>
                  <span className="col-span-3 text-[10px] font-mono">{formatNumber(orbitalElements.specificOrbitalEnergy)} m²/s²</span>
                </div>
                <div className="text-[10px] font-semibold mt-1">Periapsis</div>
                <div className="grid grid-cols-4 gap-0.5">
                  <span className="text-[10px] font-mono text-muted-foreground">Radial:</span>
                  <span className="col-span-3 text-[10px] font-mono">{formatNumber(orbitalElements.periapsisRadial)} km</span>
                </div>
                <div className="grid grid-cols-4 gap-0.5">
                  <span className="text-[10px] font-mono text-muted-foreground">Altitude:</span>
                  <span className="col-span-3 text-[10px] font-mono">{formatNumber(orbitalElements.periapsisAltitude)} km</span>
                </div>
                <div className="text-[10px] font-semibold mt-1">Apoapsis</div>
                <div className="grid grid-cols-4 gap-0.5">
                  <span className="text-[10px] font-mono text-muted-foreground">Radial:</span>
                  <span className="col-span-3 text-[10px] font-mono">{formatNumber(orbitalElements.apoapsisRadial)} km</span>
                </div>
                <div className="grid grid-cols-4 gap-0.5">
                  <span className="text-[10px] font-mono text-muted-foreground">Altitude:</span>
                  <span className="col-span-3 text-[10px] font-mono">{formatNumber(orbitalElements.apoapsisAltitude)} km</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </DraggableModal>
  );
}
