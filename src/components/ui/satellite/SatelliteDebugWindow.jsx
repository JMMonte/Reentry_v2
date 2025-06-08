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
import { SatelliteCommsSection } from './SatelliteCommsSection.jsx';
import { SatelliteCommsTimeline } from './SatelliteCommsTimeline.jsx';
import { OrbitalElementsSection } from './OrbitalElementsSection.jsx';
import { useOrbitalElements } from '../../../hooks/useOrbitalElements';
import { usePropagationData } from '../../../hooks/usePropagationData';

// Section component for collapsible sections
const Section = ({ title, isOpen, onToggle, children }) => {
  return (
    <div className="border-b border-border/50 last:border-0">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className="w-full flex items-center justify-between py-2 px-1 hover:bg-accent/5 transition-colors cursor-pointer text-left"
      >
        {typeof title === 'string' ? (
          <span className="text-xs font-semibold text-foreground/90">{title}</span>
        ) : (
          <div className="text-xs font-semibold text-foreground/90 flex-1">{title}</div>
        )}
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
  title: PropTypes.oneOfType([PropTypes.string, PropTypes.node]).isRequired,
  isOpen: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
  children: PropTypes.node
};

export function SatelliteDebugWindow({ satellite, onBodySelect, onClose, onOpenManeuver, physics }) {
  const { celestialBodies } = useCelestialBodies();
  
  // UI control states
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [orbitalReferenceFrame, setOrbitalReferenceFrame] = useState('ecliptic');
  const [orbitPeriods, setOrbitPeriods] = useState(satellite?.orbitSimProperties?.periods || 1);
  const [pointsPerPeriod, setPointsPerPeriod] = useState(satellite?.orbitSimProperties?.pointsPerPeriod || 180);
  const [propagationStatus, setPropagationStatus] = useState(null);
  
  // Core data states
  const [simTime, setSimTime] = useState(null);
  const [lat, setLat] = useState(null);
  const [lon, setLon] = useState(null);
  const [derivedPhysics, setDerivedPhysics] = useState({});
  
  // Use custom hooks
  const { orbitalElements, apsisData } = useOrbitalElements(physics, celestialBodies, orbitalReferenceFrame);
  const propagationData = usePropagationData(satellite);
  
  // Section visibility states - consolidated into an object
  const [sectionVisibility, setSectionVisibility] = useState({
    characteristics: true,
    position: true,
    stateVectors: false,
    communications: true,
    commTimeline: false,
    forces: false,
    orbit: true,
    simProperties: false,
    propagation: false
  });
  
  const toggleSection = (section) => {
    setSectionVisibility(prev => ({ ...prev, [section]: !prev[section] }));
  };
  

  // Update state when satellite changes
  useEffect(() => {
    if (satellite?.orbitSimProperties) {
      setOrbitPeriods(satellite.orbitSimProperties.periods || 1);
      setPointsPerPeriod(satellite.orbitSimProperties.pointsPerPeriod || 180);
    }
  }, [satellite?.orbitSimProperties]);

  // Listen for orbit update events to show propagation status
  useEffect(() => {
    let timeoutId1 = null;
    let timeoutId2 = null;
    
    const handleOrbitUpdate = (e) => {
      if (e.detail?.satelliteId === satellite?.id) {
        setPropagationStatus('Calculating orbit...');
        
        // Clear status after a delay
        if (timeoutId1) clearTimeout(timeoutId1);
        timeoutId1 = setTimeout(() => {
          setPropagationStatus(null);
        }, 2000);
      }
    };
    
    const handleOrbitComplete = (e) => {
      if (e.detail?.satelliteId === satellite?.id) {
        setPropagationStatus('✓ Orbit updated');
        
        // Clear status after a delay
        if (timeoutId2) clearTimeout(timeoutId2);
        timeoutId2 = setTimeout(() => {
          setPropagationStatus(null);
        }, 1500);
      }
    };
    
    document.addEventListener('orbitCalculationStarted', handleOrbitUpdate);
    document.addEventListener('orbitUpdated', handleOrbitComplete);
    
    return () => {
      if (timeoutId1) clearTimeout(timeoutId1);
      if (timeoutId2) clearTimeout(timeoutId2);
      document.removeEventListener('orbitCalculationStarted', handleOrbitUpdate);
      document.removeEventListener('orbitUpdated', handleOrbitComplete);
    };
  }, [satellite?.id]);


  // Handle satellite event updates and debug data
  useEffect(() => {
    if (!satellite) return;
    
    // Set up debug window callback
    satellite.debugWindow = {
      onPositionUpdate: () => {
        // Debug data is now handled by custom hooks
        // This callback is kept for compatibility
      }
    };
    
    // Handle simulation data updates
    const handleSimData = (e) => {
      if (e.detail.id !== satellite.id) return;
      setSimTime(e.detail.simulatedTime);
      setLat(e.detail.lat);
      setLon(e.detail.lon);
    };
    
    document.addEventListener('simulationDataUpdate', handleSimData);
    
    return () => {
      satellite.debugWindow = null;
      document.removeEventListener('simulationDataUpdate', handleSimData);
    };
  }, [satellite?.id]);


  // Calculate derived physics properties
  useEffect(() => {
    if (!physics) return;
    
    const derived = {};
    
    // Calculate speed from velocity vector
    if (physics.velocity) {
      const vel = Array.isArray(physics.velocity) ? physics.velocity : [physics.velocity.x, physics.velocity.y, physics.velocity.z];
      derived.speed = Math.sqrt(vel[0]**2 + vel[1]**2 + vel[2]**2);
    }
    
    // Calculate altitudes if we have position and central body
    if (physics.position && physics.centralBodyNaifId) {
      const pos = Array.isArray(physics.position) ? physics.position : [physics.position.x, physics.position.y, physics.position.z];
      const radialDistance = Math.sqrt(pos[0]**2 + pos[1]**2 + pos[2]**2);
      derived.altitude_radial = radialDistance;
      
      // Get central body radius for surface altitude
      const centralBody = celestialBodies?.find(b => 
        b.naif_id === parseInt(physics.centralBodyNaifId) || b.naifId === parseInt(physics.centralBodyNaifId)
      );
      
      if (centralBody && centralBody.radius) {
        derived.altitude_surface = radialDistance - centralBody.radius;
      }
    }
    
    setDerivedPhysics(derived);
  }, [physics, celestialBodies]);


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
  
  DataRow.propTypes = {
    label: PropTypes.string.isRequired,
    value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    unit: PropTypes.string,
    className: PropTypes.string
  };



  // Helper to convert [x, y, z] arrays to {x, y, z}
  const toVector3 = (arr) =>
    arr && arr.length === 3
      ? { x: arr[0], y: arr[1], z: arr[2] }
      : { x: 0, y: 0, z: 0 };

  // Simple helper for vector magnitude (only for UI display)
  const vectorMagnitude = (arr) => 
    arr && arr.length === 3 ? Math.sqrt(arr[0] ** 2 + arr[1] ** 2 + arr[2] ** 2) : 0;

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
      10: 'Sun', 199: 'Mercury', 299: 'Venus', 399: 'Earth', 301: 'Moon',
      499: 'Mars', 401: 'Phobos', 402: 'Deimos', 599: 'Jupiter', 699: 'Saturn',
      799: 'Uranus', 899: 'Neptune', 999: 'Pluto'
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
              isOpen={sectionVisibility.characteristics}
              onToggle={() => toggleSection('characteristics')}
            >
              <DataRow label="ID" value={satellite.id} />
              <DataRow label="Mass" value={formatNumber(physics?.mass || satellite.mass)} unit="kg" />
              <DataRow label="Size" value={formatNumber(physics?.size)} unit="m" />
              <DataRow label="Cross Section" value={formatNumber(physics?.crossSectionalArea)} unit="m²" />
              <DataRow label="Drag Coeff" value={formatNumber(physics?.dragCoefficient)} />
              {physics?.ballisticCoefficient && (
                <DataRow label="Ballistic Coeff" value={formatNumber(physics.ballisticCoefficient)} unit="kg/m²" />
              )}
            </Section>

            {/* Position and Time Section */}
            <Section
              title="Position & Time"
              isOpen={sectionVisibility.position}
              onToggle={() => toggleSection('position')}
            >
              {simTime && <DataRow label="Sim Time" value={simTime} />}
              <DataRow label="Central Body" value={getBodyName(physics?.centralBodyNaifId || satellite.centralBodyNaifId)} />
              {physics?.latitude !== undefined && physics?.longitude !== undefined ? (
                <div className="space-y-1">
                  <DataRow label="Latitude" value={formatNumber(physics.latitude)} unit="°" />
                  <DataRow label="Longitude" value={formatNumber(physics.longitude)} unit="°" />
                </div>
              ) : lat != null && lon != null ? (
                <div className="space-y-1">
                  <DataRow label="Latitude" value={formatNumber(lat)} unit="°" />
                  <DataRow label="Longitude" value={formatNumber(lon)} unit="°" />
                </div>
              ) : null}
              {(physics?.altitude_surface !== undefined || derivedPhysics.altitude_surface !== undefined) && (
                <DataRow label="Surface Alt" value={formatNumber(physics?.altitude_surface ?? derivedPhysics.altitude_surface)} unit="km" />
              )}
              {(physics?.altitude_radial !== undefined || derivedPhysics.altitude_radial !== undefined) && (
                <DataRow label="Radial Alt" value={formatNumber(physics?.altitude_radial ?? derivedPhysics.altitude_radial)} unit="km" />
              )}
              {physics?.ground_track_velocity !== undefined && (
                <DataRow label="Ground Speed" value={formatNumber(physics.ground_track_velocity * 3600)} unit="km/h" />
              )}
              {physics?.distanceTraveled !== undefined && (
                <DataRow label="Distance Traveled" value={formatNumber(physics.distanceTraveled)} unit="km" />
              )}
            </Section>

            {/* State Vectors Section */}
            <Section
              title="State Vectors"
              isOpen={sectionVisibility.stateVectors}
              onToggle={() => toggleSection('stateVectors')}
            >
              {renderVector(physics && toVector3(physics.position), "Position")}
              {renderVector(physics && toVector3(physics.velocity), "Velocity", true)}
              <DataRow label="Speed" value={formatNumber(physics?.speed ?? derivedPhysics.speed)} unit="km/s" />
              {physics?.ground_velocity !== undefined && (
                <DataRow label="Ground Vel" value={formatNumber(physics.ground_velocity)} unit="km/s" />
              )}
              {physics?.orbital_velocity !== undefined && (
                <DataRow label="Orbital Vel" value={formatNumber(physics.orbital_velocity)} unit="km/s" />
              )}
              {physics?.escape_velocity !== undefined && (
                <DataRow label="Escape Vel" value={formatNumber(physics.escape_velocity)} unit="km/s" />
              )}
              {physics?.escape_velocity !== undefined && (physics?.speed !== undefined || derivedPhysics.speed !== undefined) && (
                <DataRow label="v/v_esc" value={formatNumber((physics?.speed ?? derivedPhysics.speed) / physics.escape_velocity, 3)} />
              )}
            </Section>

            {/* Communications Section */}
            <Section
              title="Communications"
              isOpen={sectionVisibility.communications}
              onToggle={() => toggleSection('communications')}
            >
              <SatelliteCommsSection 
                satelliteId={satellite.id} 
                app={satellite?.app3d || window.app3d} 
              />
            </Section>

            {/* Communication Timeline Section */}
            <Section
              title="Communication Timeline"
              isOpen={sectionVisibility.commTimeline}
              onToggle={() => toggleSection('commTimeline')}
            >
              <SatelliteCommsTimeline 
                satelliteId={satellite.id} 
                app={satellite?.app3d || window.app3d} 
              />
            </Section>

            {/* Forces and Accelerations Section */}
            {physics?.a_total && (
              <Section
                title="Forces & Accelerations"
                isOpen={sectionVisibility.forces}
                onToggle={() => toggleSection('forces')}
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
                    <span className="font-mono">{vectorMagnitude(physics.a_total).toExponential(2)}</span>
                    <span className="font-mono text-[11px]">
                      {physics.a_total[0].toExponential(1)}, 
                      {physics.a_total[1].toExponential(1)}, 
                      {physics.a_total[2].toExponential(1)}
                    </span>
                  </div>

                  {physics.a_gravity_total && (
                    <div className="grid grid-cols-3 gap-1 text-xs">
                      <span className="text-muted-foreground">Gravity</span>
                      <span className="font-mono">{vectorMagnitude(physics.a_gravity_total).toExponential(2)}</span>
                      <span className="font-mono text-[11px]">
                        {physics.a_gravity_total[0].toExponential(1)}, 
                        {physics.a_gravity_total[1].toExponential(1)}, 
                        {physics.a_gravity_total[2].toExponential(1)}
                      </span>
                    </div>
                  )}

                  {physics.a_j2 && vectorMagnitude(physics.a_j2) > 1e-10 && (
                    <div className="grid grid-cols-3 gap-1 text-xs">
                      <span className="text-muted-foreground">J2</span>
                      <span className="font-mono">{vectorMagnitude(physics.a_j2).toExponential(2)}</span>
                      <span className="font-mono text-[11px]">
                        {physics.a_j2[0].toExponential(1)}, 
                        {physics.a_j2[1].toExponential(1)}, 
                        {physics.a_j2[2].toExponential(1)}
                      </span>
                    </div>
                  )}

                  {physics.a_drag && vectorMagnitude(physics.a_drag) > 1e-10 && (
                    <div className="grid grid-cols-3 gap-1 text-xs">
                      <span className="text-muted-foreground">Drag</span>
                      <span className="font-mono">{vectorMagnitude(physics.a_drag).toExponential(2)}</span>
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
                            .filter(([, vec]) => vectorMagnitude(vec) >= 1e-10)
                            .sort(([, a], [, b]) => vectorMagnitude(b) - vectorMagnitude(a))
                            .map(([bodyId, vec]) => {
                              const magnitude = vectorMagnitude(vec);
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
                isOpen={sectionVisibility.orbit}
                onToggle={() => toggleSection('orbit')}
              >
                <OrbitalElementsSection
                  orbitalElements={orbitalElements}
                  apsisData={apsisData}
                  orbitalReferenceFrame={orbitalReferenceFrame}
                  onReferenceFrameChange={setOrbitalReferenceFrame}
                  getBodyName={getBodyName}
                  physics={physics}
                  satellite={satellite}
                />
              </Section>
            )}

            {/* Simulation Properties Section */}
            <Section
              title="Simulation Properties"
              isOpen={sectionVisibility.simProperties}
              onToggle={() => toggleSection('simProperties')}
            >
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Orbit Prediction</Label>
                  <div className="flex gap-2 items-center">
                    <Input
                      type="number"
                      min="0.1"
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
              isOpen={sectionVisibility.propagation}
              onToggle={() => toggleSection('propagation')}
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
                    {propagationData.requestedPeriods && (
                      <DataRow label="Requested Periods" value={formatNumber(propagationData.requestedPeriods, 1)} />
                    )}
                    {propagationData.pointsPerPeriod && (
                      <DataRow label="Points/Period" value={propagationData.pointsPerPeriod} />
                    )}
                    <DataRow label="Status" value={propagationData.partial ? 'Calculating...' : 'Complete'} />
                    {physics?.distance_traveled !== undefined && (
                      <DataRow label="Distance Traveled" value={formatNumber(physics.distance_traveled)} unit="km" />
                    )}
                    <DataRow label="Central Body" value={getBodyName(propagationData.centralBodyId)} />
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
                  
                  {/* Calculation metadata */}
                  <div className="space-y-1 pt-1 border-t border-border/30">
                    <div className="text-xs font-semibold text-muted-foreground">Calculation Details</div>
                    <DataRow label="Last Updated" value={new Date(propagationData.timestamp).toLocaleTimeString()} />
                    {propagationData.duration && propagationData.pointCount && (
                      <DataRow 
                        label="Time Step" 
                        value={formatNumber(propagationData.duration / propagationData.pointCount, 1)} 
                        unit="s/point" 
                      />
                    )}
                    {propagationData.maxPeriods && propagationData.pointCount && (
                      <DataRow 
                        label="Points/Period" 
                        value={formatNumber(propagationData.pointCount / propagationData.maxPeriods, 0)} 
                      />
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">
                    No cached orbit data available
                  </div>
                  {/* Show basic information even without cached data */}
                  {satellite?.orbitSimProperties && (
                    <div className="space-y-1 pt-1 border-t border-border/30">
                      <div className="text-xs font-semibold text-muted-foreground">Requested Settings</div>
                      <DataRow 
                        label="Requested Periods" 
                        value={formatNumber(satellite.orbitSimProperties.periods || 1, 1)} 
                      />
                      <DataRow 
                        label="Points/Period" 
                        value={satellite.orbitSimProperties.pointsPerPeriod || 180} 
                      />
                      <DataRow label="Status" value="Orbit calculation pending..." />
                    </div>
                  )}
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
