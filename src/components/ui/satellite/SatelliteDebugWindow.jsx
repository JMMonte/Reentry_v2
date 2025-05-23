import React, { useState, useEffect } from 'react';
import { Button } from "../button";
import { DraggableModal } from "../modal/DraggableModal";
import { ColorPicker } from "./ColorPicker";
import { Focus, Trash2, Plus } from "lucide-react";
import PropTypes from 'prop-types';
import { Constants } from '../../../utils/Constants';
import { formatBodySelection } from '../../../utils/BodySelectionUtils';
import { listenToSatelliteState } from '../../../components/Satellite/createSatellite.js';

export function SatelliteDebugWindow({ satellite, onBodySelect, onClose, onOpenManeuver, sessionId, app3d }) {
  const [apsisData, setApsisData] = useState(null);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [dragData, setDragData] = useState(null);
  const [perturbationData, setPerturbationData] = useState(null);
  const [simTime, setSimTime] = useState(null);
  const [lat, setLat] = useState(null);
  const [lon, setLon] = useState(null);

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

  useEffect(() => {
    function handleSimData(e) {
      const detail = e.detail;
      if (detail.id !== satellite.id) return;
      setSimTime(detail.simulatedTime);
      setLat(detail.lat);
      setLon(detail.lon);
    }
    document.addEventListener('simulationDataUpdate', handleSimData);
    return () => document.removeEventListener('simulationDataUpdate', handleSimData);
  }, [satellite.id]);

  useEffect(() => {
    if (!satellite || !sessionId || !app3d) return;
    // Listen for live satellite state (backend-driven)
    const ws = listenToSatelliteState(app3d, sessionId);
    return () => ws && ws.close();
  }, [satellite, sessionId, app3d]);

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

  const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

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
            {Object.keys(acc).filter(body => body !== 'total').map(body => (
              <div className="grid grid-cols-4 gap-0.5 text-[8px]" key={`acc-${body}`}>
                <span className="text-muted-foreground">{capitalize(body)} Acc:</span>
                <span>{formatNumber(acc[body].x)}</span>
                <span>{formatNumber(acc[body].y)}</span>
                <span>{formatNumber(acc[body].z)}</span>
              </div>
            ))}
            {Object.keys(force).filter(body => body !== 'total').map(body => (
              <div className="grid grid-cols-4 gap-0.5 text-[8px]" key={`force-${body}`}>
                <span className="text-muted-foreground">{capitalize(body)} F:</span>
                <span>{formatNumber(force[body].x)}</span>
                <span>{formatNumber(force[body].y)}</span>
                <span>{formatNumber(force[body].z)}</span>
              </div>
            ))}
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
            {simTime && (
              <div className='grid grid-cols-2 gap-0.5'>
                <span className='text-[10px] font-mono text-muted-foreground'>Sim Time:</span>
                <span className='col-span-1 text-[10px] font-mono'>{simTime}</span>
              </div>
            )}
            {lat != null && (
              <div className='grid grid-cols-4 gap-0.5'>
                <span className='text-[10px] font-mono text-muted-foreground'>Lat:</span>
                <span className='text-[10px] font-mono'>{formatNumber(lat)}°</span>
                <span className='text-[10px] font-mono text-muted-foreground'>Lon:</span>
                <span className='text-[10px] font-mono'>{formatNumber(lon)}°</span>
              </div>
            )}
            {satellite.altitude_surface !== undefined && (
              <div className='grid grid-cols-2 gap-0.5'>
                <span className='text-[10px] font-mono text-muted-foreground'>Surface Altitude:</span>
                <span className='text-[10px] font-mono'>{formatNumber(satellite.altitude_surface)} km</span>
              </div>
            )}
            {satellite.altitude_radial !== undefined && (
              <div className='grid grid-cols-2 gap-0.5'>
                <span className='text-[10px] font-mono text-muted-foreground'>Radial Altitude:</span>
                <span className='text-[10px] font-mono'>{formatNumber(satellite.altitude_radial)} km</span>
              </div>
            )}
            {satellite.ground_velocity !== undefined && (
              <div className='grid grid-cols-2 gap-0.5'>
                <span className='text-[10px] font-mono text-muted-foreground'>Ground Velocity:</span>
                <span className='text-[10px] font-mono'>{formatNumber(satellite.ground_velocity)} km/s</span>
              </div>
            )}
            {satellite.orbital_velocity !== undefined && (
              <div className='grid grid-cols-2 gap-0.5'>
                <span className='text-[10px] font-mono text-muted-foreground'>Orbital Velocity:</span>
                <span className='text-[10px] font-mono'>{formatNumber(satellite.orbital_velocity)} km/s</span>
              </div>
            )}
            {satellite.a_total && (
              <div className='space-y-1'>
                <div className='text-[10px] font-semibold'>Perturbations (km/s²)</div>
                <div className='grid grid-cols-4 gap-0.5'>
                  <span className='text-[10px] font-mono text-muted-foreground'>a_total:</span>
                  <span className='text-[10px] font-mono'>{formatNumber(satellite.a_total[0])}</span>
                  <span className='text-[10px] font-mono'>{formatNumber(satellite.a_total[1])}</span>
                  <span className='text-[10px] font-mono'>{formatNumber(satellite.a_total[2])}</span>
                </div>
                {satellite.a_drag && (
                  <div className='grid grid-cols-4 gap-0.5'>
                    <span className='text-[10px] font-mono text-muted-foreground'>a_drag:</span>
                    <span className='text-[10px] font-mono'>{formatNumber(satellite.a_drag[0])}</span>
                    <span className='text-[10px] font-mono'>{formatNumber(satellite.a_drag[1])}</span>
                    <span className='text-[10px] font-mono'>{formatNumber(satellite.a_drag[2])}</span>
                  </div>
                )}
                {satellite.a_j2 && (
                  <div className='grid grid-cols-4 gap-0.5'>
                    <span className='text-[10px] font-mono text-muted-foreground'>a_j2:</span>
                    <span className='text-[10px] font-mono'>{formatNumber(satellite.a_j2[0])}</span>
                    <span className='text-[10px] font-mono'>{formatNumber(satellite.a_j2[1])}</span>
                    <span className='text-[10px] font-mono'>{formatNumber(satellite.a_j2[2])}</span>
                  </div>
                )}
                {satellite.a_bodies && Object.entries(satellite.a_bodies).map(([bodyId, vec]) => (
                  <div className='grid grid-cols-5 gap-0.5' key={bodyId}>
                    <span className='text-[10px] font-mono text-muted-foreground'>a_body {bodyId}:</span>
                    <span className='text-[10px] font-mono'>{formatNumber(vec[0])}</span>
                    <span className='text-[10px] font-mono'>{formatNumber(vec[1])}</span>
                    <span className='text-[10px] font-mono'>{formatNumber(vec[2])}</span>
                  </div>
                ))}
              </div>
            )}
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
  sessionId: PropTypes.string,
  app3d: PropTypes.object,
};
