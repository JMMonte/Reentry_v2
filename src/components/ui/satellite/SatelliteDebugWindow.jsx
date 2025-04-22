import React, { useState, useEffect } from 'react';
import { Button } from "../button";
import { DraggableModal } from "../modal/DraggableModal";
import { ColorPicker } from "./ColorPicker";
import { Focus, Trash2, Plus } from "lucide-react";
import PropTypes from 'prop-types';
import { Constants } from '../../../utils/Constants';
import { formatBodySelection } from '../../../utils/BodySelectionUtils';

export function SatelliteDebugWindow({ satellite, onBodySelect, onClose, onOpenManeuver }) {
  const [apsisData, setApsisData] = useState(null);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [dragData, setDragData] = useState(null);
  const [perturbationData, setPerturbationData] = useState(null);

  // Store reference to setIsOpen in satellite (for toggling from list)
  useEffect(() => {
    if (satellite) {
      satellite.debugWindow = {
        onPositionUpdate: () => {
          // Pull precomputed debug data from satellite (sent by physics worker)
          if (satellite.debug) {
            setApsisData(satellite.debug.apsisData);
            setDragData(satellite.debug.dragData);
            setPerturbationData(satellite.debug.perturbation);
          }
        }
      };
      return () => {
        satellite.debugWindow = null;
      };
    }
  }, [satellite]);

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

  // Render atmospheric drag data
  const renderDragData = () => {
    if (!dragData) return null;
    return (
      <div className="space-y-1">
        <div className="text-[10px] font-semibold">Atmospheric Drag</div>
        <div className="grid grid-cols-4 gap-0.5 text-[9px]">
          <span className="text-muted-foreground">Altitude:</span>
          <span className="col-span-3 text-[10px] font-mono">{formatNumber(dragData.altitude * Constants.metersToKm)} km</span>
        </div>
        <div className="grid grid-cols-4 gap-0.5 text-[9px]">
          <span className="text-muted-foreground">Density:</span>
          <span className="col-span-3 text-[10px] font-mono">{dragData.density.toExponential(2)} kg/m³</span>
        </div>
        {renderVector(dragData.relativeVelocity, 'Rel Vel', true)}
        {renderVector(dragData.dragAcceleration, 'Drag Acc', true)}
      </div>
    );
  };

  const formatNumber = (num) => {
    if (num === undefined || num === null) return 'N/A';
    return typeof num === 'number' ? num.toFixed(2) : num;
  };

  // Render gravitational perturbations with breakdown per body
  const renderPerturbation = () => {
    if (!perturbationData) return null;
    const { acc, force } = perturbationData;
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-semibold">Perturbations</span>
          <button
            onClick={() => setShowBreakdown(!showBreakdown)}
            className="text-[8px] text-primary"
            style={{ padding: 0 }}
          >
            {showBreakdown ? '−' : '+'}
          </button>
        </div>
        <div className="grid grid-cols-4 gap-0.5 text-[9px]">
          <span className="text-muted-foreground">Total Acc:</span>
          <span>{formatNumber(acc.total.x)}</span>
          <span>{formatNumber(acc.total.y)}</span>
          <span>{formatNumber(acc.total.z)}</span>
        </div>
        <div className="grid grid-cols-4 gap-0.5 text-[9px]">
          <span className="text-muted-foreground">Total F:</span>
          <span>{formatNumber(force.total.x)}</span>
          <span>{formatNumber(force.total.y)}</span>
          <span>{formatNumber(force.total.z)}</span>
        </div>
        {showBreakdown && (
          <div className="space-y-1 p-1 bg-muted/10 rounded">
            <div className="grid grid-cols-4 gap-0.5 text-[8px]">
              <span className="text-muted-foreground">Earth Acc:</span>
              <span>{formatNumber(acc.earth.x)}</span>
              <span>{formatNumber(acc.earth.y)}</span>
              <span>{formatNumber(acc.earth.z)}</span>
            </div>
            <div className="grid grid-cols-4 gap-0.5 text-[8px]">
              <span className="text-muted-foreground">Moon Acc:</span>
              <span>{formatNumber(acc.moon.x)}</span>
              <span>{formatNumber(acc.moon.y)}</span>
              <span>{formatNumber(acc.moon.z)}</span>
            </div>
            <div className="grid grid-cols-4 gap-0.5 text-[8px]">
              <span className="text-muted-foreground">Sun Acc:</span>
              <span>{formatNumber(acc.sun.x)}</span>
              <span>{formatNumber(acc.sun.y)}</span>
              <span>{formatNumber(acc.sun.z)}</span>
            </div>
            <div className="grid grid-cols-4 gap-0.5 text-[8px]">
              <span className="text-muted-foreground">Earth F:</span>
              <span>{formatNumber(force.earth.x)}</span>
              <span>{formatNumber(force.earth.y)}</span>
              <span>{formatNumber(force.earth.z)}</span>
            </div>
            <div className="grid grid-cols-4 gap-0.5 text-[8px]">
              <span className="text-muted-foreground">Moon F:</span>
              <span>{formatNumber(force.moon.x)}</span>
              <span>{formatNumber(force.moon.y)}</span>
              <span>{formatNumber(force.moon.z)}</span>
            </div>
            <div className="grid grid-cols-4 gap-0.5 text-[8px]">
              <span className="text-muted-foreground">Sun F:</span>
              <span>{formatNumber(force.sun.x)}</span>
              <span>{formatNumber(force.sun.y)}</span>
              <span>{formatNumber(force.sun.z)}</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (!satellite) return null;

  return (
    <>
    <DraggableModal
      title={satellite.name || `Satellite ${satellite.id}`}
      isOpen={true}
      onClose={onClose}
      defaultPosition={{ x: window.innerWidth - 320, y: 80 }}
      resizable={true}
      defaultWidth={300}
      defaultHeight={400}
      minWidth={200}
      minHeight={200}
      leftElement={
        <ColorPicker
          color={satellite.color}
          onChange={(color) => satellite.setColor(color)}
        />
      }
      rightElement={
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => onOpenManeuver(satellite)}>
            <Plus className="h-4 w-4" />
          </Button>
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
            {renderPerturbation()}
            {renderDragData()}

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
                <span className="col-span-3 text-[10px] font-mono">{formatNumber(satellite.getSurfaceAltitude())} km</span>
              </div>
            </div>

            {apsisData && (
              <>
                <div className="space-y-0.5">
                  <div className="text-[10px] font-semibold">Orbit</div>
                  <div className="grid grid-cols-4 gap-0.5">
                    <span className="text-[10px] font-mono text-muted-foreground">SMA:</span>
                    <span className="col-span-3 text-[10px] font-mono">{formatNumber(apsisData.semiMajorAxis)} km</span>
                  </div>
                  <div className="grid grid-cols-4 gap-0.5">
                    <span className="text-[10px] font-mono text-muted-foreground">Ecc:</span>
                    <span className="col-span-3 text-[10px] font-mono">{formatNumber(apsisData.eccentricity)}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-0.5">
                    <span className="text-[10px] font-mono text-muted-foreground">Inc:</span>
                    <span className="col-span-3 text-[10px] font-mono">{formatNumber(apsisData.inclination)}°</span>
                  </div>
                  <div className="grid grid-cols-4 gap-0.5">
                    <span className="text-[10px] font-mono text-muted-foreground">LAN:</span>
                    <span className="col-span-3 text-[10px] font-mono">{formatNumber(apsisData.longitudeOfAscendingNode)}°</span>
                  </div>
                  <div className="grid grid-cols-4 gap-0.5">
                    <span className="text-[10px] font-mono text-muted-foreground">AoP:</span>
                    <span className="col-span-3 text-[10px] font-mono">{formatNumber(apsisData.argumentOfPeriapsis)}°</span>
                  </div>
                  <div className="grid grid-cols-4 gap-0.5">
                    <span className="text-[10px] font-mono text-muted-foreground">TA:</span>
                    <span className="col-span-3 text-[10px] font-mono">{formatNumber(apsisData.trueAnomaly)}°</span>
                  </div>
                  <div className="grid grid-cols-4 gap-0.5">
                    <span className="text-[10px] font-mono text-muted-foreground">Period:</span>
                    <span className="col-span-3 text-[10px] font-mono">{formatNumber(apsisData.period)} s</span>
                  </div>
                  <div className="grid grid-cols-4 gap-0.5">
                    <span className="text-[10px] font-mono text-muted-foreground">h:</span>
                    <span className="col-span-3 text-[10px] font-mono">{formatNumber(apsisData.specificAngularMomentum)} m²/s</span>
                  </div>
                  <div className="grid grid-cols-4 gap-0.5">
                    <span className="text-[10px] font-mono text-muted-foreground">ε:</span>
                    <span className="col-span-3 text-[10px] font-mono">{formatNumber(apsisData.specificOrbitalEnergy)} m²/s²</span>
                  </div>
                </div>
                <div className="text-[10px] font-semibold mt-1">Periapsis</div>
                <div className="grid grid-cols-4 gap-0.5">
                  <span className="text-[10px] font-mono text-muted-foreground">Radial:</span>
                  <span className="col-span-3 text-[10px] font-mono">{formatNumber(apsisData.periapsisRadial)} km</span>
                </div>
                <div className="grid grid-cols-4 gap-0.5">
                  <span className="text-[10px] font-mono text-muted-foreground">Altitude:</span>
                  <span className="col-span-3 text-[10px] font-mono">{formatNumber(apsisData.periapsisAltitude)} km</span>
                </div>
                <div className="text-[10px] font-semibold mt-1">Apoapsis</div>
                <div className="grid grid-cols-4 gap-0.5">
                  <span className="text-[10px] font-mono text-muted-foreground">Radial:</span>
                  <span className="col-span-3 text-[10px] font-mono">{formatNumber(apsisData.apoapsisRadial)} km</span>
                </div>
                <div className="grid grid-cols-4 gap-0.5">
                  <span className="text-[10px] font-mono text-muted-foreground">Altitude:</span>
                  <span className="col-span-3 text-[10px] font-mono">{formatNumber(apsisData.apoapsisAltitude)} km</span>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </DraggableModal>
    </>
  );
}

SatelliteDebugWindow.propTypes = {
  satellite: PropTypes.object,
  onBodySelect: PropTypes.func,
  onClose: PropTypes.func,
  onOpenManeuver: PropTypes.func,
};
