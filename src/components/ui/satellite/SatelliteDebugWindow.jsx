import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Button } from "../Button";
import { DraggableModal } from "../modal/DraggableModal";
import { ColorPicker } from "./ColorPicker";
import { Focus, Trash2 } from "lucide-react";
import { Constants } from "../../../utils/Constants";
import { Popover, PopoverContent, PopoverTrigger } from "../Popover";
import { updateCameraTarget, formatBodySelection } from '../../../utils/BodySelectionUtils';

export function SatelliteDebugWindow({ satellite, earth }) {
  const [isOpen, setIsOpen] = useState(true);
  const [orbitalElements, setOrbitalElements] = useState(null);
  const lastUpdateTime = useRef(0);
  const updateInterval = 100; // Update every 100ms instead of every frame

  // Store reference to setIsOpen in satellite
  useEffect(() => {
    if (satellite) {
      satellite.debugWindow = {
        setIsOpen,
        onPositionUpdate: () => {
          if (isOpen) {
            setOrbitalElements(satellite.getOrbitalElements(earth));
          }
        }
      };
      return () => {
        satellite.debugWindow = null;
      };
    }
  }, [satellite, earth, isOpen]);

  useEffect(() => {
    const updateOrbitalElements = () => {
      if (!satellite || !earth || !isOpen) return;

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

    if (isOpen) {
      animate();
    }

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [satellite, earth, isOpen]);

  const handleFocus = () => {
    if (window.app3d && satellite) {
      const formattedValue = formatBodySelection(satellite);

      // Dispatch body selected event
      document.dispatchEvent(new CustomEvent('bodySelected', {
        detail: { body: formattedValue }
      }));

      // Update camera target without dispatching another event
      updateCameraTarget(satellite, window.app3d, false);
    }
  };

  const handleDelete = () => {
    if (satellite) {
      satellite.dispose();
      setIsOpen(false);
    }
  };

  const renderVector = (vector, label, isVelocity = false) => {
    if (!vector) return null;

    let x, y, z;
    let unit;

    if (isVelocity) {
      // Get velocity in km/s using the physics helper method
      if (label === "Velocity") {
        // Convert velocity from m/s to km/s
        const velInMS = satellite.physics._getVelocityInMetersPerSecond();
        if (velInMS) {
          x = formatNumber(velInMS.x * Constants.metersToKm);
          y = formatNumber(velInMS.y * Constants.metersToKm);
          z = formatNumber(velInMS.z * Constants.metersToKm);
        } else {
          x = "N/A";
          y = "N/A";
          z = "N/A";
        }
      } else {
        // For other vectors (like acceleration) just unscale
        x = formatNumber(vector.x / Constants.scale);
        y = formatNumber(vector.y / Constants.scale);
        z = formatNumber(vector.z / Constants.scale);
      }
      unit = "km/s";
    } else {
      // Get position in km using the physics helper method
      if (label === "Position") {
        const posInKm = satellite.physics._getPositionInKm();
        if (posInKm) {
          x = formatNumber(posInKm.x);
          y = formatNumber(posInKm.y);
          z = formatNumber(posInKm.z);
        } else {
          x = "N/A";
          y = "N/A";
          z = "N/A";
        }
      } else {
        // For other vectors just unscale
        x = formatNumber(vector.x / Constants.scale);
        y = formatNumber(vector.y / Constants.scale);
        z = formatNumber(vector.z / Constants.scale);
      }
      unit = "km";
    }

    return (
      <div className="grid grid-cols-4 gap-0.5">
        <span className="text-[10px] font-mono text-muted-foreground">{label}:</span>
        <span className="text-[10px] font-mono">{x} {unit}</span>
        <span className="text-[10px] font-mono">{y} {unit}</span>
        <span className="text-[10px] font-mono">{z} {unit}</span>
      </div>
    );
  };

  const formatNumber = (num) => {
    if (num === undefined || num === null) return 'N/A';
    return typeof num === 'number' ? num.toFixed(2) : num;
  };

  if (!satellite || !isOpen) return null;

  return (
    <DraggableModal
      title={satellite.name || `Satellite ${satellite.id}`}
      isOpen={true}
      onClose={() => setIsOpen(false)}
      className="w-[300px]"
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
              <span className="col-span-3 text-[10px] font-mono">
                {formatNumber(satellite.physics.getSpeedKmS())} km/s
              </span>
            </div>

            <div className="space-y-0.5">
              <div className="text-[10px] font-semibold">Current Altitude</div>
              <div className="grid grid-cols-4 gap-0.5">
                <span className="text-[10px] font-mono text-muted-foreground">Radial:</span>
                <span className="col-span-3 text-[10px] font-mono">
                  {formatNumber(satellite.getRadialAltitude() + Constants.earthRadius * Constants.metersToKm)} km
                </span>
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
                  <span className="col-span-3 text-[10px] font-mono">{formatNumber(orbitalElements.h)} m²/s</span>
                </div>
                <div className="grid grid-cols-4 gap-0.5">
                  <span className="text-[10px] font-mono text-muted-foreground">ε:</span>
                  <span className="col-span-3 text-[10px] font-mono">{formatNumber(orbitalElements.specificEnergy)} m²/s²</span>
                </div>
                <div className="text-[10px] font-semibold mt-1">Periapsis</div>
                <div className="grid grid-cols-4 gap-0.5">
                  <span className="text-[10px] font-mono text-muted-foreground">Radial:</span>
                  <span className="col-span-3 text-[10px] font-mono">{formatNumber(orbitalElements.periapsisDistance)} km</span>
                </div>
                <div className="grid grid-cols-4 gap-0.5">
                  <span className="text-[10px] font-mono text-muted-foreground">Altitude:</span>
                  <span className="col-span-3 text-[10px] font-mono">{formatNumber(orbitalElements.periapsisAltitude)} km</span>
                </div>
                <div className="text-[10px] font-semibold mt-1">Apoapsis</div>
                <div className="grid grid-cols-4 gap-0.5">
                  <span className="text-[10px] font-mono text-muted-foreground">Radial:</span>
                  <span className="col-span-3 text-[10px] font-mono">{formatNumber(orbitalElements.apoapsisDistance)} km</span>
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
