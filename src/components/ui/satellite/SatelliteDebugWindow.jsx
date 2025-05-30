import React, { useState, useEffect } from 'react';
import { Button } from "../button";
import { DraggableModal } from "../modal/DraggableModal";
import { ColorPicker } from "./ColorPicker";
import { Focus, Trash2, Plus } from "lucide-react";
import PropTypes from 'prop-types';
import { formatBodySelection } from '../../../utils/BodySelectionUtils';
import { useCelestialBodies } from '../../../providers/CelestialBodiesContext';

export function SatelliteDebugWindow({ satellite, onBodySelect, onClose, onOpenManeuver, physics }) {
  const { celestialBodies } = useCelestialBodies();
  const [apsisData, setApsisData] = useState(null);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [dragData, setDragData] = useState(null);
  const [perturbationData, setPerturbationData] = useState(null);
  const [simTime, setSimTime] = useState(null);
  const [lat, setLat] = useState(null);
  const [lon, setLon] = useState(null);

  // Only keep useEffect for non-physics debug data
  useEffect(() => {
    if (satellite) {
      satellite.debugWindow = {
        onPositionUpdate: () => {
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
    // Position is in km
    // Velocity is in km/s
    const unit = isVelocity ? 'km/s' : 'km';
    return (
      <div className="grid grid-cols-4 gap-0.5">
        <span className="text-[10px] font-mono text-muted-foreground">{label}:</span>
        <span className="text-[10px] font-mono">{formatNumber(vector.x)} {unit}</span>
        <span className="text-[10px] font-mono">{formatNumber(vector.y)} {unit}</span>
        <span className="text-[10px] font-mono">{formatNumber(vector.z)} {unit}</span>
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
          <span className="col-span-3 text-[10px] font-mono">{formatNumber(dragData.altitude)} km</span>
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

  // Helper to convert [x, y, z] arrays to {x, y, z}
  const toVector3 = (arr) =>
    arr && arr.length === 3
      ? { x: arr[0], y: arr[1], z: arr[2] }
      : { x: 0, y: 0, z: 0 };

  // Helper to compute vector length from array
  const vectorLength = (arr) =>
    arr && arr.length === 3
      ? Math.sqrt(arr[0] ** 2 + arr[1] ** 2 + arr[2] ** 2)
      : 0;

  // Helper to get body name from NAIF ID using celestial bodies data
  const getBodyName = (naifId) => {
    const body = celestialBodies.find(b => 
      b.naif_id === parseInt(naifId) || b.naifId === parseInt(naifId)
    );
    return body?.name || `Body ${naifId}`;
  };

  if (!satellite) return null;

  // Warn if no physics data is available
  if (!physics) {
    return (
      <DraggableModal
        title={satellite.name || `Satellite ${satellite.id}`}
        isOpen={true}
        onClose={onClose}
        defaultPosition={{ x: window.innerWidth - 320, y: 80 }}
        resizable={true}
        defaultWidth={300}
        defaultHeight={200}
        minWidth={200}
        minHeight={100}
      >
        <div className="text-xs text-red-500 p-4">
          No physics data found for satellite id: {String(satellite.id)}
        </div>
      </DraggableModal>
    );
  }

  return (
    <>
    <DraggableModal
      title={satellite.name || `Satellite ${satellite.id}`}
      isOpen={true}
      onClose={onClose}
      defaultPosition={{ x: window.innerWidth - 350, y: 80 }}
      resizable={true}
      defaultWidth={320}
      defaultHeight={500}
      minWidth={280}
      minHeight={300}
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
            {/* Satellite Characteristics Section */}
            <div className="space-y-1">
              <div className="text-[10px] font-semibold">Satellite Properties</div>
              <div className='grid grid-cols-2 gap-0.5'>
                <span className='text-[10px] font-mono text-muted-foreground'>ID:</span>
                <span className='text-[10px] font-mono'>{satellite.id}</span>
              </div>
              <div className='grid grid-cols-2 gap-0.5'>
                <span className='text-[10px] font-mono text-muted-foreground'>Mass:</span>
                <span className='text-[10px] font-mono'>{formatNumber(physics?.mass || satellite.mass)} kg</span>
              </div>
              <div className='grid grid-cols-2 gap-0.5'>
                <span className='text-[10px] font-mono text-muted-foreground'>Size:</span>
                <span className='text-[10px] font-mono'>{formatNumber(physics?.size)} m</span>
              </div>
              <div className='grid grid-cols-2 gap-0.5'>
                <span className='text-[10px] font-mono text-muted-foreground'>Cross Section:</span>
                <span className='text-[10px] font-mono'>{formatNumber(physics?.crossSectionalArea)} m²</span>
              </div>
              <div className='grid grid-cols-2 gap-0.5'>
                <span className='text-[10px] font-mono text-muted-foreground'>Drag Coeff:</span>
                <span className='text-[10px] font-mono'>{formatNumber(physics?.dragCoefficient)}</span>
              </div>
              {physics?.ballisticCoefficient && (
                <div className='grid grid-cols-2 gap-0.5'>
                  <span className='text-[10px] font-mono text-muted-foreground'>Ballistic Coeff:</span>
                  <span className='text-[10px] font-mono'>{formatNumber(physics.ballisticCoefficient)} kg/m²</span>
                </div>
              )}
              <div className='grid grid-cols-2 gap-0.5'>
                <span className='text-[10px] font-mono text-muted-foreground'>Central Body:</span>
                <span className='text-[10px] font-mono'>{getBodyName(physics?.centralBodyNaifId || satellite.centralBodyNaifId)}</span>
              </div>
            </div>

            {/* Position and Time Section */}
            <div className="space-y-1">
              <div className="text-[10px] font-semibold">Position & Time</div>
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
              {physics?.altitude_surface !== undefined && (
                <div className='grid grid-cols-2 gap-0.5'>
                  <span className='text-[10px] font-mono text-muted-foreground'>Surface Alt:</span>
                  <span className='text-[10px] font-mono'>{formatNumber(physics.altitude_surface)} km</span>
                </div>
              )}
              {physics?.altitude_radial !== undefined && (
                <div className='grid grid-cols-2 gap-0.5'>
                  <span className='text-[10px] font-mono text-muted-foreground'>Radial Alt:</span>
                  <span className='text-[10px] font-mono'>{formatNumber(physics.altitude_radial)} km</span>
                </div>
              )}
            </div>

            {/* State Vectors Section */}
            <div className="space-y-1">
              <div className="text-[10px] font-semibold">State Vectors</div>
              {renderVector(physics && toVector3(physics.position), "Position")}
              {renderVector(physics && toVector3(physics.velocity), "Velocity", true)}
              <div className="grid grid-cols-2 gap-0.5">
                <span className="text-[10px] font-mono text-muted-foreground">Speed:</span>
                <span className="text-[10px] font-mono">{formatNumber(physics?.speed || vectorLength(physics?.velocity))} km/s</span>
              </div>
              {physics?.ground_velocity !== undefined && (
                <div className='grid grid-cols-2 gap-0.5'>
                  <span className='text-[10px] font-mono text-muted-foreground'>Ground Vel:</span>
                  <span className='text-[10px] font-mono'>{formatNumber(physics.ground_velocity)} km/s</span>
                </div>
              )}
              {physics?.orbital_velocity !== undefined && (
                <div className='grid grid-cols-2 gap-0.5'>
                  <span className='text-[10px] font-mono text-muted-foreground'>Orbital Vel:</span>
                  <span className='text-[10px] font-mono'>{formatNumber(physics.orbital_velocity)} km/s</span>
                </div>
              )}
            </div>

            {/* Forces and Accelerations Section */}
            {physics?.a_total && (
              <div className='space-y-1'>
                <div className='text-[10px] font-semibold'>Forces & Accelerations</div>
                
                {/* Total Acceleration */}
                <div className='grid grid-cols-5 gap-0.5 text-[9px]'>
                  <span className='text-muted-foreground'>Total:</span>
                  <span className='font-mono'>{vectorLength(physics.a_total).toExponential(2)}</span>
                  <span className='font-mono'>{physics.a_total[0].toExponential(1)}</span>
                  <span className='font-mono'>{physics.a_total[1].toExponential(1)}</span>
                  <span className='font-mono'>{physics.a_total[2].toExponential(1)}</span>
                </div>

                {/* Gravity Total */}
                {physics.a_gravity_total && (
                  <div className='grid grid-cols-5 gap-0.5 text-[9px]'>
                    <span className='text-muted-foreground'>Gravity:</span>
                    <span className='font-mono'>{vectorLength(physics.a_gravity_total).toExponential(2)}</span>
                    <span className='font-mono'>{physics.a_gravity_total[0].toExponential(1)}</span>
                    <span className='font-mono'>{physics.a_gravity_total[1].toExponential(1)}</span>
                    <span className='font-mono'>{physics.a_gravity_total[2].toExponential(1)}</span>
                  </div>
                )}

                {/* J2 Perturbation */}
                {physics.a_j2 && vectorLength(physics.a_j2) > 1e-10 && (
                  <div className='grid grid-cols-5 gap-0.5 text-[9px]'>
                    <span className='text-muted-foreground'>J2:</span>
                    <span className='font-mono'>{vectorLength(physics.a_j2).toExponential(2)}</span>
                    <span className='font-mono'>{physics.a_j2[0].toExponential(1)}</span>
                    <span className='font-mono'>{physics.a_j2[1].toExponential(1)}</span>
                    <span className='font-mono'>{physics.a_j2[2].toExponential(1)}</span>
                  </div>
                )}

                {/* Drag */}
                {physics.a_drag && vectorLength(physics.a_drag) > 1e-10 && (
                  <div className='grid grid-cols-5 gap-0.5 text-[9px]'>
                    <span className='text-muted-foreground'>Drag:</span>
                    <span className='font-mono'>{vectorLength(physics.a_drag).toExponential(2)}</span>
                    <span className='font-mono'>{physics.a_drag[0].toExponential(1)}</span>
                    <span className='font-mono'>{physics.a_drag[1].toExponential(1)}</span>
                    <span className='font-mono'>{physics.a_drag[2].toExponential(1)}</span>
                  </div>
                )}

                {/* Individual Body Contributions */}
                {physics.a_bodies && Object.keys(physics.a_bodies).length > 0 && (
                  <div className="space-y-1 mt-1">
                    <button
                      onClick={() => setShowBreakdown(!showBreakdown)}
                      className="text-[9px] text-primary hover:underline"
                    >
                      {showBreakdown ? '− Hide' : '+ Show'} Body Forces ({Object.keys(physics.a_bodies).length})
                    </button>
                    {showBreakdown && (
                      <div className="space-y-0.5 pl-2">
                        {Object.entries(physics.a_bodies).map(([bodyId, vec]) => {
                          const magnitude = vectorLength(vec);
                          if (magnitude < 1e-10) return null;
                          const bodyName = getBodyName(bodyId);
                          return (
                            <div className='grid grid-cols-5 gap-0.5 text-[8px]' key={bodyId}>
                              <span className='text-muted-foreground'>{bodyName}:</span>
                              <span className='font-mono'>{magnitude.toExponential(2)}</span>
                              <span className='font-mono'>{vec[0].toExponential(1)}</span>
                              <span className='font-mono'>{vec[1].toExponential(1)}</span>
                              <span className='font-mono'>{vec[2].toExponential(1)}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
                <div className='text-[8px] text-muted-foreground text-right'>Units: km/s²</div>
              </div>
            )}

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
  physics: PropTypes.object,
};
