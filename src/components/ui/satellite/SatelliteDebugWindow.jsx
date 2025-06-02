import React, { useState, useEffect } from 'react';
import { Button } from "../button";
import { Input } from "../input";
import { Label } from "../label";
import { DraggableModal } from "../modal/DraggableModal";
import { ColorPicker } from "./ColorPicker";
import { Focus, Trash2, Plus } from "lucide-react";
import PropTypes from 'prop-types';
import { formatBodySelection } from '../../../utils/BodySelectionUtils';
import { useCelestialBodies } from '../../../providers/CelestialBodiesContext';
import { Bodies, Orbital } from '../../../physics/PhysicsAPI.js';
import * as THREE from 'three';
import { SatelliteCommsSection } from './SatelliteCommsSection.jsx';

// Section component for collapsible sections
const Section = ({ title, isOpen, onToggle, children }) => {
  return (
    <div className="border-b border-border/50 last:border-0">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          console.log(`[Section] Clicked ${title}, isOpen=${isOpen}`);
          onToggle();
        }}
        className="w-full flex items-center justify-between py-2 px-1 hover:bg-accent/5 transition-colors cursor-pointer text-left"
      >
        <span className="text-xs font-semibold text-foreground/90">{title}</span>
        <span className="text-xs text-muted-foreground">{isOpen ? '−' : '+'}</span>
      </button>
      {isOpen && (
        <div className="pb-2 px-1 space-y-1">
          {children}
        </div>
      )}
    </div>
  );
};

Section.propTypes = {
  title: PropTypes.string.isRequired,
  isOpen: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
  children: PropTypes.node
};

export function SatelliteDebugWindow({ satellite, onBodySelect, onClose, onOpenManeuver, physics }) {
  const { celestialBodies } = useCelestialBodies();
  const [apsisData, setApsisData] = useState(null);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [simTime, setSimTime] = useState(null);
  const [lat, setLat] = useState(null);
  const [lon, setLon] = useState(null);
  const [orbitalElements, setOrbitalElements] = useState(null);
  
  // Simulation properties state
  const [orbitPeriods, setOrbitPeriods] = useState(satellite?.orbitSimProperties?.periods || 1);
  const [pointsPerPeriod, setPointsPerPeriod] = useState(satellite?.orbitSimProperties?.pointsPerPeriod || 180);
  const [propagationStatus, setPropagationStatus] = useState(null);
  
  // Section visibility states
  const [showCharacteristics, setShowCharacteristics] = useState(true);
  const [showPosition, setShowPosition] = useState(true);
  const [showStateVectors, setShowStateVectors] = useState(false);
  const [showCommunications, setShowCommunications] = useState(true);
  const [showCommTimeline, setShowCommTimeline] = useState(false);
  const [showForces, setShowForces] = useState(false);
  const [showOrbit, setShowOrbit] = useState(true);
  const [showSimProperties, setShowSimProperties] = useState(false);
  const [showPropagation, setShowPropagation] = useState(false);
  
  // Propagation data state
  const [propagationData, setPropagationData] = useState(null);
  

  // Update state when satellite changes
  useEffect(() => {
    if (satellite?.orbitSimProperties) {
      setOrbitPeriods(satellite.orbitSimProperties.periods || 1);
      setPointsPerPeriod(satellite.orbitSimProperties.pointsPerPeriod || 180);
    }
  }, [satellite?.orbitSimProperties]);

  // Listen for orbit update events to show propagation status
  useEffect(() => {
    const handleOrbitUpdate = (e) => {
      if (e.detail?.satelliteId === satellite?.id) {
        setPropagationStatus('Calculating orbit...');
        
        // Clear status after a delay
        setTimeout(() => {
          setPropagationStatus(null);
        }, 2000);
      }
    };
    
    const handleOrbitComplete = (e) => {
      if (e.detail?.satelliteId === satellite?.id) {
        setPropagationStatus('✓ Orbit updated');
        
        // Clear status after a delay
        setTimeout(() => {
          setPropagationStatus(null);
        }, 1500);
      }
    };
    
    document.addEventListener('orbitCalculationStarted', handleOrbitUpdate);
    document.addEventListener('orbitUpdated', handleOrbitComplete);
    
    return () => {
      document.removeEventListener('orbitCalculationStarted', handleOrbitUpdate);
      document.removeEventListener('orbitUpdated', handleOrbitComplete);
    };
  }, [satellite?.id]);


  // Only keep useEffect for non-physics debug data
  useEffect(() => {
    if (satellite) {
      satellite.debugWindow = {
        onPositionUpdate: () => {
          if (satellite.debug) {
            setApsisData(satellite.debug.apsisData);
            // setDragData(satellite.debug.dragData);
            // setPerturbationData(satellite.debug.perturbation);
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

  // Calculate orbital elements from physics data
  useEffect(() => {
    if (!physics || !physics.position || !physics.velocity || !physics.centralBodyNaifId) return;
    
    try {
      // Convert arrays to THREE.Vector3
      const position = new THREE.Vector3(...physics.position);
      const velocity = new THREE.Vector3(...physics.velocity);
      
      // Get central body from celestialBodies or use fallback
      let centralBody = null;
      let bodyRadius = 0;
      
      if (celestialBodies && celestialBodies.length > 0) {
        centralBody = celestialBodies.find(b => 
          b.naif_id === parseInt(physics.centralBodyNaifId) || b.naifId === parseInt(physics.centralBodyNaifId)
        );
      }
      
      // If not found in celestialBodies, try to get from physics engine or use defaults
      if (!centralBody) {
        // Try to get from app3d physics engine
        const physicsBody = window.app3d?.physicsIntegration?.physicsEngine?.bodies?.[physics.centralBodyNaifId];
        if (physicsBody) {
          centralBody = physicsBody;
          bodyRadius = physicsBody.radius || 0;
        } else {
          // Get body data from PhysicsAPI
          try {
            const bodyData = Bodies.getByNaif(physics.centralBodyNaifId);
            
            if (bodyData) {
              centralBody = {
                name: bodyData.name,
                GM: bodyData.GM || Bodies.getGM(physics.centralBodyNaifId),
                radius: bodyData.radius
              };
              bodyRadius = bodyData.radius;
            } else {
              // Fallback to Bodies.getGM if no body data found
              const GM = Bodies.getGM(physics.centralBodyNaifId);
              
              if (GM) {
                centralBody = {
                  name: `Body ${physics.centralBodyNaifId}`,
                  GM: GM,
                  radius: 1000 // Default radius - should be improved to get from constants
                };
                bodyRadius = 1000;
              } else {
                console.warn(`[SatelliteDebugWindow] Central body ${physics.centralBodyNaifId} not found in physics data, using Earth defaults`);
                centralBody = { name: 'Earth', GM: 398600.4415, radius: 6371.0 };
                bodyRadius = 6371.0;
              }
            }
          } catch (error) {
            console.error(`[SatelliteDebugWindow] Error accessing physics data:`, error);
            console.warn(`[SatelliteDebugWindow] Central body ${physics.centralBodyNaifId} not accessible, using Earth defaults`);
            centralBody = { name: 'Earth', GM: 398600.4415, radius: 6371.0 };
            bodyRadius = 6371.0;
          }
        }
      } else {
        bodyRadius = centralBody.radius || 0;
      }
      
      // Calculate orbital elements using new Physics API
      const elements = Orbital.calculateElements(
        position,
        velocity,
        centralBody
      );
      
      setOrbitalElements(elements);
      setApsisData(elements); // Also set apsis data for backward compatibility
      
    } catch (error) {
      console.error('[SatelliteDebugWindow] Error calculating orbital elements:', error);
    }
  }, [physics, celestialBodies]);

  // Fetch propagation data from orbit manager
  useEffect(() => {
    if (!satellite || !window.app3d?.satelliteOrbitManager) return;
    
    const updatePropagationData = () => {
      const orbitManager = window.app3d.satelliteOrbitManager;
      const orbitData = orbitManager.orbitCache.get(satellite.id);
      
      if (orbitData && orbitData.points && orbitData.points.length > 0) {
        // Calculate propagation duration
        const lastPoint = orbitData.points[orbitData.points.length - 1];
        const propagationDuration = lastPoint.time || 0; // seconds
        
        // Find SOI transitions
        const soiTransitions = [];
        let lastBodyId = null;
        
        for (let i = 0; i < orbitData.points.length; i++) {
          const point = orbitData.points[i];
          if (lastBodyId !== null && point.centralBodyId !== lastBodyId) {
            soiTransitions.push({
              index: i,
              time: point.time,
              fromBody: lastBodyId,
              toBody: point.centralBodyId,
              isEntry: point.isSOIEntry || false,
              isExit: point.isSOIExit || false
            });
          }
          lastBodyId = point.centralBodyId;
        }
        
        setPropagationData({
          duration: propagationDuration,
          pointCount: orbitData.points.length,
          maxPeriods: orbitData.maxPeriods,
          soiTransitions: soiTransitions,
          partial: orbitData.partial || false,
          timestamp: orbitData.timestamp,
          centralBodyId: orbitData.centralBodyNaifId
        });
      } else {
        setPropagationData(null);
      }
    };
    
    // Initial update
    updatePropagationData();
    
    // Listen for orbit updates
    const handleOrbitUpdate = (e) => {
      if (e.detail?.satelliteId === satellite.id) {
        updatePropagationData();
      }
    };
    
    document.addEventListener('orbitUpdated', handleOrbitUpdate);
    
    // Periodic update to catch any changes
    const intervalId = setInterval(updatePropagationData, 1000);
    
    return () => {
      document.removeEventListener('orbitUpdated', handleOrbitUpdate);
      clearInterval(intervalId);
    };
  }, [satellite?.id]);

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

  const handleSimPropertyChange = (property, value) => {
    if (!satellite) return;
    
    // Store previous values to detect significant changes
    const previousPeriods = satellite.orbitSimProperties?.periods;
    const previousPointsPerPeriod = satellite.orbitSimProperties?.pointsPerPeriod;
    
    // Update satellite's simulation properties
    if (!satellite.orbitSimProperties) {
      satellite.orbitSimProperties = {};
    }
    
    satellite.orbitSimProperties[property] = value;
    
    // Determine if this change requires immediate recalculation
    const needsRecalculation = 
      (property === 'periods' && value !== previousPeriods) ||
      (property === 'pointsPerPeriod' && value !== previousPointsPerPeriod);
    
    // Force cache invalidation for significant changes (especially when reducing periods)
    const forceRecalculation = 
      (property === 'periods' && value < previousPeriods) ||
      (property === 'pointsPerPeriod' && Math.abs(value - previousPointsPerPeriod) > 30);
    
    // Emit event for Three.js layer to handle
    console.log(`[SatelliteDebugWindow] Emitting satelliteSimPropertiesChanged event for satellite ${satellite.id}: ${property}=${value}, needsRecalc=${needsRecalculation}, forceRecalc=${forceRecalculation}`);
    
    const event = new CustomEvent('satelliteSimPropertiesChanged', {
      detail: {
        satelliteId: satellite.id,
        property: property,
        value: value,
        previousValue: property === 'periods' ? previousPeriods : previousPointsPerPeriod,
        allProperties: satellite.orbitSimProperties,
        needsRecalculation: needsRecalculation,
        forceRecalculation: forceRecalculation
      }
    });
    
    document.dispatchEvent(event);
  };

  const renderVector = (vector, label, isVelocity = false) => {
    if (!vector) return null;
    // Position is in km
    // Velocity is in km/s
    const unit = isVelocity ? 'km/s' : 'km';
    return (
      <div className="grid grid-cols-4 gap-1">
        <span className="text-xs font-mono text-muted-foreground">{label}:</span>
        <span className="text-xs font-mono">{formatNumber(vector.x)} {unit}</span>
        <span className="text-xs font-mono">{formatNumber(vector.y)} {unit}</span>
        <span className="text-xs font-mono">{formatNumber(vector.z)} {unit}</span>
      </div>
    );
  };

  // Render atmospheric drag data
  // const renderDragData = () => {
  //   if (!dragData) return null;
  //   return (
  //     <div className="space-y-1">
  //       <div className="text-[10px] font-semibold">Atmospheric Drag</div>
  //       <div className="grid grid-cols-4 gap-0.5 text-[9px]">
  //         <span className="text-muted-foreground">Altitude:</span>
  //         <span className="col-span-3 text-[10px] font-mono">{formatNumber(dragData.altitude)} km</span>
  //       </div>
  //       <div className="grid grid-cols-4 gap-0.5 text-[9px]">
  //         <span className="text-muted-foreground">Density:</span>
  //         <span className="col-span-3 text-[10px] font-mono">{dragData.density.toExponential(2)} kg/m³</span>
  //       </div>
  //       {renderVector(dragData.relativeVelocity, 'Rel Vel', true)}
  //       {renderVector(dragData.dragAcceleration, 'Drag Acc', true)}
  //     </div>
  //   );
  // };

  const formatNumber = (num, decimals = 2) => {
    if (num === undefined || num === null) return 'N/A';
    return typeof num === 'number' ? num.toFixed(decimals) : num;
  };

  // Format duration from seconds to human-readable format
  const formatDuration = (seconds) => {
    if (!seconds || seconds < 0) return 'N/A';
    
    const years = Math.floor(seconds / (365.25 * 24 * 3600));
    const days = Math.floor((seconds % (365.25 * 24 * 3600)) / (24 * 3600));
    const hours = Math.floor((seconds % (24 * 3600)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    const parts = [];
    if (years > 0) parts.push(`${years}y`);
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
    
    return parts.join(' ');
  };


  // Data row component for consistent formatting
  const DataRow = ({ label, value, unit = '', className = '' }) => (
    <div className={`grid grid-cols-2 gap-1 ${className}`}>
      <span className="text-xs text-muted-foreground truncate">{label}:</span>
      <span className="text-xs font-mono text-foreground">
        {value} {unit && <span className="text-muted-foreground">{unit}</span>}
      </span>
    </div>
  );

  // const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  // Render gravitational perturbations with breakdown per body
  // const renderPerturbation = () => {
  //   if (!perturbationData) return null;
  //   const { acc, force } = perturbationData;
  //   return (
  //     <div className="space-y-1">
  //       <div className="flex items-center gap-1">
  //         <span className="text-[10px] font-semibold">Perturbations</span>
  //       <button
  //           onClick={() => setShowBreakdown(!showBreakdown)}
  //           className="text-[8px] text-primary"
  //           style={{ padding: 0 }}
  //         >
  //           {showBreakdown ? '−' : '+'}
  //         </button>
  //       </div>
  //       <div className="grid grid-cols-4 gap-0.5 text-[9px]">
  //         <span className="text-muted-foreground">Total Acc:</span>
  //         <span>{formatNumber(acc.total.x)}</span>
  //         <span>{formatNumber(acc.total.y)}</span>
  //         <span>{formatNumber(acc.total.z)}</span>
  //       </div>
  //       <div className="grid grid-cols-4 gap-0.5 text-[9px]">
  //         <span className="text-muted-foreground">Total F:</span>
  //         <span>{formatNumber(force.total.x)}</span>
  //         <span>{formatNumber(force.total.y)}</span>
  //         <span>{formatNumber(force.total.z)}</span>
  //       </div>
  //       {showBreakdown && (
  //         <div className="space-y-1 p-1 bg-muted/10 rounded">
  //           {Object.keys(acc).filter(body => body !== 'total').map(body => (
  //             <div className="grid grid-cols-4 gap-0.5 text-[8px]" key={`acc-${body}`}>
  //               <span className="text-muted-foreground">{capitalize(body)} Acc:</span>
  //               <span>{formatNumber(acc[body].x)}</span>
  //               <span>{formatNumber(acc[body].y)}</span>
  //               <span>{formatNumber(acc[body].z)}</span>
  //             </div>
  //           ))}
  //           {Object.keys(force).filter(body => body !== 'total').map(body => (
  //             <div className="grid grid-cols-4 gap-0.5 text-[8px]" key={`force-${body}`}>
  //               <span className="text-muted-foreground">{capitalize(body)} F:</span>
  //               <span>{formatNumber(force[body].x)}</span>
  //               <span>{formatNumber(force[body].y)}</span>
  //               <span>{formatNumber(force[body].z)}</span>
  //             </div>
  //           ))}
  //         </div>
  //       )}
  //     </div>
  //   );
  // };

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
    // First try celestialBodies from context
    if (celestialBodies && celestialBodies.length > 0) {
      const body = celestialBodies.find(b => 
        b.naif_id === parseInt(naifId) || b.naifId === parseInt(naifId)
      );
      if (body) return body.name;
    }
    
    // Fallback to common body names
    const commonBodies = {
      10: 'Sun',
      199: 'Mercury',
      299: 'Venus',
      399: 'Earth',
      301: 'Moon',
      499: 'Mars',
      401: 'Phobos',
      402: 'Deimos',
      599: 'Jupiter',
      699: 'Saturn',
      799: 'Uranus',
      899: 'Neptune',
      999: 'Pluto'
    };
    
    return commonBodies[parseInt(naifId)] || `Body ${naifId}`;
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
      defaultPosition={{ x: window.innerWidth - 380, y: 80 }}
      resizable={true}
      defaultWidth={360}
      defaultHeight={480}
      minWidth={300}
      minHeight={350}
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
      <div className="space-y-0">
        {satellite && (
          <>
            {/* Satellite Characteristics Section */}
            <Section
              title="Satellite Properties"
              isOpen={showCharacteristics}
              onToggle={() => {
                console.log('[Debug] Toggling characteristics from', showCharacteristics, 'to', !showCharacteristics);
                setShowCharacteristics(!showCharacteristics);
              }}
            >
              <DataRow label="ID" value={satellite.id} />
              <DataRow label="Mass" value={formatNumber(physics?.mass || satellite.mass)} unit="kg" />
              <DataRow label="Size" value={formatNumber(physics?.size)} unit="m" />
              <DataRow label="Cross Section" value={formatNumber(physics?.crossSectionalArea)} unit="m²" />
              <DataRow label="Drag Coeff" value={formatNumber(physics?.dragCoefficient)} />
              {physics?.ballisticCoefficient && (
                <DataRow label="Ballistic Coeff" value={formatNumber(physics.ballisticCoefficient)} unit="kg/m²" />
              )}
              <DataRow label="Central Body" value={getBodyName(physics?.centralBodyNaifId || satellite.centralBodyNaifId)} />
            </Section>

            {/* Position and Time Section */}
            <Section
              title="Position & Time"
              isOpen={showPosition}
              onToggle={() => setShowPosition(!showPosition)}
            >
              {simTime && <DataRow label="Sim Time" value={simTime} />}
              {physics?.lat !== undefined && physics?.lon !== undefined ? (
                <div className="space-y-1">
                  <DataRow label="Latitude" value={formatNumber(physics.lat)} unit="°" />
                  <DataRow label="Longitude" value={formatNumber(physics.lon)} unit="°" />
                </div>
              ) : lat != null && lon != null ? (
                <div className="space-y-1">
                  <DataRow label="Latitude" value={formatNumber(lat)} unit="°" />
                  <DataRow label="Longitude" value={formatNumber(lon)} unit="°" />
                </div>
              ) : null}
              {physics?.altitude_surface !== undefined && (
                <DataRow label="Surface Alt" value={formatNumber(physics.altitude_surface)} unit="km" />
              )}
              {physics?.altitude_radial !== undefined && (
                <DataRow label="Radial Alt" value={formatNumber(physics.altitude_radial)} unit="km" />
              )}
              {physics?.ground_track_velocity !== undefined && (
                <DataRow label="Ground Speed" value={formatNumber(physics.ground_track_velocity * 3600)} unit="km/h" />
              )}
            </Section>

            {/* State Vectors Section */}
            <Section
              title="State Vectors"
              isOpen={showStateVectors}
              onToggle={() => setShowStateVectors(!showStateVectors)}
            >
              {renderVector(physics && toVector3(physics.position), "Position")}
              {renderVector(physics && toVector3(physics.velocity), "Velocity", true)}
              <DataRow label="Speed" value={formatNumber(physics?.speed || vectorLength(physics?.velocity))} unit="km/s" />
              {physics?.ground_velocity !== undefined && (
                <DataRow label="Ground Vel" value={formatNumber(physics.ground_velocity)} unit="km/s" />
              )}
              {physics?.orbital_velocity !== undefined && (
                <DataRow label="Orbital Vel" value={formatNumber(physics.orbital_velocity)} unit="km/s" />
              )}
              {physics?.radial_velocity !== undefined && (
                <DataRow label="Radial Vel" value={formatNumber(physics.radial_velocity)} unit="km/s" />
              )}
              {physics?.angular_momentum !== undefined && (
                <DataRow label="Angular Mom" value={formatNumber(vectorLength(physics.angular_momentum))} unit="km²/s" />
              )}
              {physics?.flight_path_angle !== undefined && (
                <DataRow label="Flight Path" value={formatNumber(physics.flight_path_angle)} unit="°" />
              )}
            </Section>

            {/* Communications Section */}
            <Section
              title="Communications"
              isOpen={showCommunications}
              onToggle={() => setShowCommunications(!showCommunications)}
            >
              <div className="p-1">
                <SatelliteCommsSection 
                  satelliteId={satellite.id} 
                  app={satellite?.app3d || window.app3d} 
                />
              </div>
            </Section>

            {/* Communication Timeline Section */}
            <Section
              title="Communication Timeline"
              isOpen={showCommTimeline}
              onToggle={() => setShowCommTimeline(!showCommTimeline)}
            >
              <div className="p-1 space-y-2">
                <div className="text-xs text-muted-foreground">
                  Communication subsystem integration coming soon...
                </div>
              </div>
            </Section>

            {/* Forces and Accelerations Section */}
            {physics?.a_total && (
              <Section
                title="Forces & Accelerations"
                isOpen={showForces}
                onToggle={() => setShowForces(!showForces)}
              >
                <div className="space-y-1">
                  {/* Acceleration summary */}
                  <div className="grid grid-cols-3 gap-1 text-xs font-mono">
                    <span className="text-muted-foreground">Type</span>
                    <span className="text-muted-foreground">Magnitude</span>
                    <span className="text-muted-foreground">Direction</span>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-1 text-xs">
                    <span className="text-muted-foreground">Total</span>
                    <span className="font-mono">{vectorLength(physics.a_total).toExponential(2)}</span>
                    <span className="font-mono text-[11px]">
                      {physics.a_total[0].toExponential(1)}, 
                      {physics.a_total[1].toExponential(1)}, 
                      {physics.a_total[2].toExponential(1)}
                    </span>
                  </div>

                  {physics.a_gravity_total && (
                    <div className="grid grid-cols-3 gap-1 text-xs">
                      <span className="text-muted-foreground">Gravity</span>
                      <span className="font-mono">{vectorLength(physics.a_gravity_total).toExponential(2)}</span>
                      <span className="font-mono text-[11px]">
                        {physics.a_gravity_total[0].toExponential(1)}, 
                        {physics.a_gravity_total[1].toExponential(1)}, 
                        {physics.a_gravity_total[2].toExponential(1)}
                      </span>
                    </div>
                  )}

                  {physics.a_j2 && vectorLength(physics.a_j2) > 1e-10 && (
                    <div className="grid grid-cols-3 gap-1 text-xs">
                      <span className="text-muted-foreground">J2</span>
                      <span className="font-mono">{vectorLength(physics.a_j2).toExponential(2)}</span>
                      <span className="font-mono text-[11px]">
                        {physics.a_j2[0].toExponential(1)}, 
                        {physics.a_j2[1].toExponential(1)}, 
                        {physics.a_j2[2].toExponential(1)}
                      </span>
                    </div>
                  )}

                  {physics.a_drag && vectorLength(physics.a_drag) > 1e-10 && (
                    <div className="grid grid-cols-3 gap-1 text-xs">
                      <span className="text-muted-foreground">Drag</span>
                      <span className="font-mono">{vectorLength(physics.a_drag).toExponential(2)}</span>
                      <span className="font-mono text-[11px]">
                        {physics.a_drag[0].toExponential(1)}, 
                        {physics.a_drag[1].toExponential(1)}, 
                        {physics.a_drag[2].toExponential(1)}
                      </span>
                    </div>
                  )}

                  {/* Individual Body Contributions */}
                  {physics.a_bodies && Object.keys(physics.a_bodies).length > 0 && (
                    <div className="pt-1">
                      <button
                        onClick={() => setShowBreakdown(!showBreakdown)}
                        className="text-xs text-primary hover:underline"
                      >
                        {showBreakdown ? '− Hide' : '+ Show'} Body Forces ({Object.keys(physics.a_bodies).length})
                      </button>
                      {showBreakdown && (
                        <div className="mt-1 space-y-0.5 max-h-32 overflow-y-auto">
                          {Object.entries(physics.a_bodies)
                            .filter(([_, vec]) => vectorLength(vec) >= 1e-10)
                            .sort(([_, a], [__, b]) => vectorLength(b) - vectorLength(a))
                            .map(([bodyId, vec]) => {
                              const magnitude = vectorLength(vec);
                              const bodyName = getBodyName(bodyId);
                              return (
                                <div className="grid grid-cols-3 gap-1 text-xs" key={bodyId}>
                                  <span className="text-muted-foreground truncate">{bodyName}</span>
                                  <span className="font-mono">{magnitude.toExponential(2)}</span>
                                  <span className="font-mono text-[11px]">
                                    {vec[0].toExponential(1)}, 
                                    {vec[1].toExponential(1)}, 
                                    {vec[2].toExponential(1)}
                                  </span>
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground text-right pt-1">Units: km/s²</div>
                </div>
              </Section>
            )}

            {/* Orbital Elements Section */}
            {orbitalElements && (
              <Section
                title="Orbital Elements"
                isOpen={showOrbit}
                onToggle={() => setShowOrbit(!showOrbit)}
              >
                <div className="space-y-2">
                  {/* Basic Elements */}
                  <div className="space-y-1">
                    <DataRow label="Semi-Major Axis" value={formatNumber(orbitalElements.semiMajorAxis)} unit="km" />
                    <DataRow label="Eccentricity" value={formatNumber(orbitalElements.eccentricity, 4)} />
                    <DataRow label="Inclination" value={formatNumber(orbitalElements.inclination)} unit="°" />
                    <DataRow label="LAN (Ω)" value={formatNumber(orbitalElements.longitudeOfAscendingNode)} unit="°" />
                    <DataRow label="Arg of Periapsis (ω)" value={formatNumber(orbitalElements.argumentOfPeriapsis)} unit="°" />
                    <DataRow label="True Anomaly (ν)" value={formatNumber(orbitalElements.trueAnomaly)} unit="°" />
                    {orbitalElements.meanAnomaly !== undefined && (
                      <DataRow label="Mean Anomaly (M)" value={formatNumber(orbitalElements.meanAnomaly)} unit="°" />
                    )}
                    {orbitalElements.eccentricAnomaly !== undefined && (
                      <DataRow label="Eccentric Anomaly (E)" value={formatNumber(orbitalElements.eccentricAnomaly)} unit="°" />
                    )}
                  </div>
                  
                  {/* Period and Energy */}
                  <div className="space-y-1 pt-1 border-t border-border/30">
                    {orbitalElements.period && (
                      <DataRow label="Period" value={formatDuration(orbitalElements.period)} />
                    )}
                    <DataRow label="Specific Energy" value={formatNumber(orbitalElements.specificOrbitalEnergy)} unit="m²/s²" />
                    <DataRow label="Specific Momentum" value={formatNumber(orbitalElements.specificAngularMomentum)} unit="m²/s" />
                    {orbitalElements.meanMotion !== undefined && (
                      <DataRow label="Mean Motion" value={formatNumber(orbitalElements.meanMotion * 86400)} unit="°/day" />
                    )}
                  </div>
                  
                  {/* Apsides */}
                  {orbitalElements.eccentricity < 1.0 && (
                    <div className="space-y-1 pt-1 border-t border-border/30">
                      <div className="text-xs font-semibold text-muted-foreground">Periapsis</div>
                      <DataRow label="Altitude" value={formatNumber(orbitalElements.periapsisAltitude)} unit="km" />
                      <DataRow label="Radius" value={formatNumber(orbitalElements.periapsisRadial)} unit="km" />
                      <DataRow label="Velocity" value={formatNumber(orbitalElements.periapsisVelocity)} unit="km/s" />
                      
                      <div className="text-xs font-semibold text-muted-foreground pt-1">Apoapsis</div>
                      <DataRow label="Altitude" value={formatNumber(orbitalElements.apoapsisAltitude)} unit="km" />
                      <DataRow label="Radius" value={formatNumber(orbitalElements.apoapsisRadial)} unit="km" />
                      <DataRow label="Velocity" value={formatNumber(orbitalElements.apoapsisVelocity)} unit="km/s" />
                    </div>
                  )}
                </div>
              </Section>
            )}

            {/* Simulation Properties Section */}
            <Section
              title="Simulation Properties"
              isOpen={showSimProperties}
              onToggle={() => setShowSimProperties(!showSimProperties)}
            >
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Orbit Prediction</Label>
                  <div className="flex gap-2 items-center">
                    <Input
                      type="number"
                      min="0.1"
                      max="10"
                      step="0.1"
                      value={orbitPeriods}
                      onChange={(e) => {
                        const value = parseFloat(e.target.value) || 1;
                        setOrbitPeriods(value);
                        setPropagationStatus('Updating orbit...');
                        handleSimPropertyChange('periods', value);
                      }}
                      className="h-7 text-xs flex-1 bg-background"
                    />
                    <span className="text-xs text-muted-foreground">periods</span>
                  </div>
                </div>
                
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Orbit Resolution</Label>
                  <div className="flex gap-2 items-center">
                    <Input
                      type="number"
                      min="30"
                      max="360"
                      step="10"
                      value={pointsPerPeriod}
                      onChange={(e) => {
                        const value = parseInt(e.target.value) || 180;
                        setPointsPerPeriod(value);
                        setPropagationStatus('Updating resolution...');
                        handleSimPropertyChange('pointsPerPeriod', value);
                      }}
                      className="h-7 text-xs flex-1 bg-background"
                    />
                    <span className="text-xs text-muted-foreground">pts/period</span>
                  </div>
                </div>
                
                <div className="text-xs text-muted-foreground pt-1">
                  Higher values increase accuracy but may impact performance
                </div>
                
                {propagationStatus && (
                  <div className="text-xs text-primary pt-1 font-medium">
                    {propagationStatus}
                  </div>
                )}
              </div>
            </Section>

            {/* Propagation Information Section */}
            <Section
              title="Propagation Information"
              isOpen={showPropagation}
              onToggle={() => setShowPropagation(!showPropagation)}
            >
              {propagationData ? (
                <div className="space-y-2">
                  {/* Basic propagation info */}
                  <div className="space-y-1">
                    <DataRow label="Duration" value={formatDuration(propagationData.duration)} />
                    <DataRow label="Total Points" value={propagationData.pointCount} />
                    {propagationData.maxPeriods && (
                      <DataRow label="Periods Shown" value={formatNumber(propagationData.maxPeriods, 1)} />
                    )}
                    <DataRow label="Status" value={propagationData.partial ? 'Calculating...' : 'Complete'} />
                    {physics?.distance_traveled !== undefined && (
                      <DataRow label="Distance Traveled" value={formatNumber(physics.distance_traveled)} unit="km" />
                    )}
                  </div>
                  
                  {/* SOI Transitions */}
                  {propagationData.soiTransitions && propagationData.soiTransitions.length > 0 && (
                    <div className="space-y-1 pt-1 border-t border-border/30">
                      <div className="text-xs font-semibold text-muted-foreground">SOI Transitions</div>
                      {propagationData.soiTransitions.map((transition, idx) => (
                        <div key={idx} className="pl-2 space-y-0.5">
                          <div className="text-xs">
                            <span className="text-muted-foreground">At </span>
                            <span className="font-mono">{formatDuration(transition.time)}</span>
                            <span className="text-muted-foreground">:</span>
                          </div>
                          <div className="text-xs pl-2">
                            <span className="text-muted-foreground">From </span>
                            <span>{getBodyName(transition.fromBody)}</span>
                            <span className="text-muted-foreground"> to </span>
                            <span>{getBodyName(transition.toBody)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Orbit type info */}
                  {(physics || orbitalElements) && (
                    <div className="space-y-1 pt-1 border-t border-border/30">
                      <DataRow label="Orbit Type" value={
                        orbitalElements ? (
                          orbitalElements.eccentricity < 0.001 ? 'Circular' :
                          orbitalElements.eccentricity < 1.0 ? 'Elliptical' : 
                          orbitalElements.eccentricity === 1.0 ? 'Parabolic' : 
                          'Hyperbolic'
                        ) : 'Unknown'
                      } />
                      {orbitalElements && (
                        <DataRow 
                          label="Eccentricity" 
                          value={formatNumber(orbitalElements.eccentricity, 4)} 
                        />
                      )}
                      {physics?.escape_velocity !== undefined && physics?.speed !== undefined && (
                        <DataRow 
                          label="Escape Status" 
                          value={physics.speed >= physics.escape_velocity ? 'Escaping' : 'Captured'} 
                        />
                      )}
                      {physics?.time_to_periapsis !== undefined && (
                        <DataRow 
                          label="Next Periapsis" 
                          value={formatDuration(physics.time_to_periapsis)} 
                        />
                      )}
                      {physics?.time_to_apoapsis !== undefined && (
                        <DataRow 
                          label="Next Apoapsis" 
                          value={formatDuration(physics.time_to_apoapsis)} 
                        />
                      )}
                    </div>
                  )}
                  
                  {/* Last update time */}
                  <div className="text-xs text-muted-foreground pt-1 border-t border-border/30">
                    Updated {new Date(propagationData.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">
                  No propagation data available
                </div>
              )}
            </Section>
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
