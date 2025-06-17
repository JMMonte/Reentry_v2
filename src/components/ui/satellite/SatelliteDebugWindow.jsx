import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from "../button";
import { Input } from "../input";
import { Label } from "../label";
import { DraggableModal } from "../modal/DraggableModal";
import { ColorPicker } from "./ColorPicker";
import { Focus, Trash2, Route } from "lucide-react";
import PropTypes from 'prop-types';
import { formatBodySelection } from '@/utils/BodySelectionUtils';
import { formatNumber } from '@/utils/numberUtils';

import { SatelliteCommsSection } from './SatelliteCommsSection.jsx';
import { SatelliteCommsTimeline } from './SatelliteCommsTimeline.jsx';
import { OrbitalElementsSection } from './OrbitalElementsSection.jsx';
import { useOrbitalElements } from '@/hooks/useOrbitalElements';
import { usePropagationData } from '@/hooks/usePropagationData';

// Memoized DataRow component
const DataRow = React.memo(({ label, value, unit = '', className = '' }) => (
  <div className={`grid grid-cols-2 gap-1 ${className}`}>
    <span className="text-xs text-muted-foreground truncate">{label}:</span>
    <span className="text-xs font-mono text-foreground">
      {value} {unit && <span className="text-muted-foreground">{unit}</span>}
    </span>
  </div>
));

DataRow.displayName = 'DataRow';
DataRow.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  unit: PropTypes.string,
  className: PropTypes.string
};

// Section component
const Section = React.memo(({ title, isOpen, onToggle, children }) => {
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-2 py-1 text-left hover:bg-secondary/50 transition-colors"
      >
        <span className="text-xs font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{isOpen ? '−' : '+'}</span>
      </button>
      {isOpen && (
        <div className="px-2 pb-2 space-y-1">
          {children}
        </div>
      )}
    </div>
  );
});

Section.displayName = 'Section';
Section.propTypes = {
  title: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
  isOpen: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired
};

// Simplified SatelliteDebugWindow with less aggressive memoization
export const SatelliteDebugWindow = React.memo(function SatelliteDebugWindow({ 
  satellite, 
  onBodySelect, 
  onClose, 
  onOpenManeuver, 
  physics, 
  celestialBodies = [] 
}) {
  // Simplified state management
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [orbitalReferenceFrame, setOrbitalReferenceFrame] = useState('ecliptic');
  const [orbitPeriods, setOrbitPeriods] = useState(satellite?.orbitSimProperties?.periods || 1);
  const [pointsPerPeriod, setPointsPerPeriod] = useState(satellite?.orbitSimProperties?.pointsPerPeriod || 180);
  const [propagationStatus, setPropagationStatus] = useState(null);
  
  // Core data states - simplified
  const [simTime, setSimTime] = useState(null);
  const [lat, setLat] = useState(null);
  const [lon, setLon] = useState(null);
  
  // Section visibility states
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
  
  // Helper functions
  const helpers = useMemo(() => ({
    toVector3: (arr) =>
      arr && arr.length === 3
        ? { x: arr[0], y: arr[1], z: arr[2] }
        : { x: 0, y: 0, z: 0 },

    vectorMagnitude: (arr) =>
      arr && arr.length === 3 ? Math.sqrt(arr[0] ** 2 + arr[1] ** 2 + arr[2] ** 2) : 0,

    formatDuration: (seconds) => {
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
    }
  }), []);

  // Body name lookup
  const getBodyName = useMemo(() => {
    const bodyLookup = {};
    if (celestialBodies && celestialBodies.length > 0) {
      celestialBodies.forEach(body => {
        const naifId = body.naif_id || body.naifId;
        if (naifId !== undefined) {
          bodyLookup[naifId] = body.name;
        }
      });
    }

    const commonBodies = {
      10: 'Sun', 199: 'Mercury', 299: 'Venus', 399: 'Earth', 301: 'Moon',
      499: 'Mars', 401: 'Phobos', 402: 'Deimos', 599: 'Jupiter', 699: 'Saturn',
      799: 'Uranus', 899: 'Neptune', 999: 'Pluto'
    };

    return (naifId) => {
      const id = parseInt(naifId);
      return bodyLookup[id] || commonBodies[id] || `Body ${naifId}`;
    };
  }, [celestialBodies]);

  // Use custom hooks
  const { orbitalElements, apsisData } = useOrbitalElements(physics, celestialBodies, orbitalReferenceFrame);
  const propagationData = usePropagationData(satellite);

  // Event handlers
  const toggleSection = useCallback((section) => {
    setSectionVisibility(prev => ({ ...prev, [section]: !prev[section] }));
  }, []);

  const handleFocus = useCallback(() => {
    if (onBodySelect && satellite) {
      const formattedValue = formatBodySelection(satellite);
      onBodySelect(formattedValue);
    }
  }, [onBodySelect, satellite]);

  const handleDelete = useCallback(() => {
    if (satellite) {
      // Use physics engine directly
      if (window.app3d?.physicsIntegration?.physicsEngine) {
        window.app3d.physicsIntegration.physicsEngine.removeSatellite(satellite.id);
      }
      if (onClose) onClose();
    }
  }, [satellite, onClose]);

  const handleSimPropertyChange = useCallback((property, value) => {
    if (!satellite) return;
    
    // Update satellite's simulation properties
    if (!satellite.orbitSimProperties) {
      satellite.orbitSimProperties = {};
    }
    
    satellite.orbitSimProperties[property] = value;
    
    // Dispatch event for Three.js layer
    const event = new CustomEvent('satelliteSimPropertiesChanged', {
      detail: {
        satelliteId: satellite.id,
        property: property,
        value: value,
        allProperties: satellite.orbitSimProperties,
        needsRecalculation: true
      }
    });
    
    document.dispatchEvent(event);
  }, [satellite]);

  const renderVector = useCallback((vector, label, isVelocity = false) => {
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
  }, []);

  // Input handlers
  const handleOrbitPeriodsChange = useCallback((e) => {
    const value = parseFloat(e.target.value) || 1;
    setOrbitPeriods(value);
    setPropagationStatus('Updating orbit...');
    handleSimPropertyChange('periods', value);
  }, [handleSimPropertyChange]);

  const handlePointsPerPeriodChange = useCallback((e) => {
    const value = parseInt(e.target.value) || 180;
    setPointsPerPeriod(value);
    setPropagationStatus('Updating resolution...');
    handleSimPropertyChange('pointsPerPeriod', value);
  }, [handleSimPropertyChange]);

  const handleColorChange = useCallback((color) => {
    if (window.app3d?.physicsIntegration?.physicsEngine) {
      window.app3d.physicsIntegration.physicsEngine.updateSatelliteProperty(satellite.id, 'color', color);
    }
  }, [satellite?.id]);

  // Update state when satellite changes
  useEffect(() => {
    if (satellite?.orbitSimProperties) {
      setOrbitPeriods(satellite.orbitSimProperties.periods || 1);
      setPointsPerPeriod(satellite.orbitSimProperties.pointsPerPeriod || 180);
    }
  }, [satellite?.orbitSimProperties]);

  // Simplified event listeners - no debouncing
  useEffect(() => {
    if (!satellite) return;

    const handleSimDataUpdate = (e) => {
      if (e.detail.id === satellite.id) {
        setSimTime(e.detail.simulatedTime);
        setLat(e.detail.lat);
        setLon(e.detail.lon);
      }
    };

    const handleOrbitUpdate = (e) => {
      if (e.detail?.satelliteId === satellite.id) {
        setPropagationStatus('Calculating orbit...');
        setTimeout(() => setPropagationStatus(null), 2000);
      }
    };

    const handleOrbitComplete = (e) => {
      if (e.detail?.satelliteId === satellite.id) {
        setPropagationStatus('✓ Orbit updated');
        setTimeout(() => setPropagationStatus(null), 1500);
      }
    };

    document.addEventListener('simulationDataUpdate', handleSimDataUpdate);
    document.addEventListener('orbitCalculationStarted', handleOrbitUpdate);
    document.addEventListener('orbitUpdated', handleOrbitComplete);

    return () => {
      document.removeEventListener('simulationDataUpdate', handleSimDataUpdate);
      document.removeEventListener('orbitCalculationStarted', handleOrbitUpdate);
      document.removeEventListener('orbitUpdated', handleOrbitComplete);
    };
  }, [satellite?.id]);

  // Calculate derived physics properties
  const derivedPhysics = useMemo(() => {
    if (!physics) return {};

    const derived = {};

    // Calculate speed from velocity vector
    if (physics.velocity) {
      const vel = Array.isArray(physics.velocity) ? physics.velocity : [physics.velocity.x, physics.velocity.y, physics.velocity.z];
      derived.speed = Math.sqrt(vel[0] ** 2 + vel[1] ** 2 + vel[2] ** 2);
    }

    // Calculate altitudes if we have position and central body
    if (physics.position && physics.centralBodyNaifId) {
      const pos = Array.isArray(physics.position) ? physics.position : [physics.position.x, physics.position.y, physics.position.z];
      const radialDistance = Math.sqrt(pos[0] ** 2 + pos[1] ** 2 + pos[2] ** 2);
      derived.altitude_radial = radialDistance;

      // Get central body radius for surface altitude
      const centralBody = celestialBodies?.find(b =>
        b.naif_id === parseInt(physics.centralBodyNaifId) || b.naifId === parseInt(physics.centralBodyNaifId)
      );

      if (centralBody && centralBody.radius) {
        derived.altitude_surface = radialDistance - centralBody.radius;
      }
    }

    return derived;
  }, [physics, celestialBodies]);

  // Force breakdown data
  const forceBreakdownData = useMemo(() => {
    if (!physics?.a_bodies_direct && !physics?.a_bodies) return [];

    const forces = physics.a_bodies_direct || physics.a_bodies;
    return Object.entries(forces)
      .filter(([, vec]) => helpers.vectorMagnitude(vec) >= 1e-10)
      .sort(([, a], [, b]) => helpers.vectorMagnitude(b) - helpers.vectorMagnitude(a))
      .map(([bodyId, vec]) => ({
        bodyId,
        vec,
        magnitude: helpers.vectorMagnitude(vec),
        bodyName: getBodyName(bodyId)
      }));
  }, [physics?.a_bodies_direct, physics?.a_bodies, helpers, getBodyName]);

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
      >
        <div className="text-xs text-red-500 p-4">
          No physics data found for satellite id: {String(satellite.id)}
        </div>
      </DraggableModal>
    );
  }

  return (
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
          color={satellite.color || 0xffff00}
          onChange={handleColorChange}
        />
      }
      rightElement={
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => onOpenManeuver(satellite)}>
            <Route className="h-4 w-4" />
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
          {renderVector(physics && helpers.toVector3(physics.position), "Position")}
          {renderVector(physics && helpers.toVector3(physics.velocity), "Velocity", true)}
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
          {physics?.escape_velocity !== undefined && physics?.speed !== undefined && (
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
                <span className="font-mono">{helpers.vectorMagnitude(physics.a_total).toExponential(2)}</span>
                <span className="font-mono text-[11px]">
                  {physics.a_total[0].toExponential(1)}, 
                  {physics.a_total[1].toExponential(1)}, 
                  {physics.a_total[2].toExponential(1)}
                </span>
              </div>

              {physics.a_gravity_total && (
                <div className="grid grid-cols-3 gap-1 text-xs">
                  <span className="text-muted-foreground">Gravity</span>
                  <span className="font-mono">{helpers.vectorMagnitude(physics.a_gravity_total).toExponential(2)}</span>
                  <span className="font-mono text-[11px]">
                    {physics.a_gravity_total[0].toExponential(1)}, 
                    {physics.a_gravity_total[1].toExponential(1)}, 
                    {physics.a_gravity_total[2].toExponential(1)}
                  </span>
                </div>
              )}

              {physics.a_j2 && helpers.vectorMagnitude(physics.a_j2) > 1e-10 && (
                <div className="grid grid-cols-3 gap-1 text-xs">
                  <span className="text-muted-foreground">J2</span>
                  <span className="font-mono">{helpers.vectorMagnitude(physics.a_j2).toExponential(2)}</span>
                  <span className="font-mono text-[11px]">
                    {physics.a_j2[0].toExponential(1)}, 
                    {physics.a_j2[1].toExponential(1)}, 
                    {physics.a_j2[2].toExponential(1)}
                  </span>
                </div>
              )}

              {physics.a_drag && helpers.vectorMagnitude(physics.a_drag) > 1e-10 && (
                <div className="grid grid-cols-3 gap-1 text-xs">
                  <span className="text-muted-foreground">Drag</span>
                  <span className="font-mono">{helpers.vectorMagnitude(physics.a_drag).toExponential(2)}</span>
                  <span className="font-mono text-[11px]">
                    {physics.a_drag[0].toExponential(1)}, 
                    {physics.a_drag[1].toExponential(1)}, 
                    {physics.a_drag[2].toExponential(1)}
                  </span>
                </div>
              )}

              {/* Individual Body Contributions */}
              {forceBreakdownData.length > 0 && (
                <div className="pt-1">
                  <button
                    onClick={() => setShowBreakdown(!showBreakdown)}
                    className="text-xs text-primary hover:underline"
                  >
                    {showBreakdown ? '− Hide' : '+ Show'} Body Forces ({forceBreakdownData.length})
                  </button>
                  {showBreakdown && (
                    <div className="mt-1 space-y-0.5 max-h-32 overflow-y-auto">
                      {forceBreakdownData.map(({ bodyId, vec, magnitude, bodyName }) => (
                        <div className="grid grid-cols-3 gap-1 text-xs" key={bodyId}>
                          <span className="text-muted-foreground truncate">{bodyName}</span>
                          <span className="font-mono">{magnitude.toExponential(2)}</span>
                          <span className="font-mono text-[11px]">
                            {vec[0].toExponential(1)}, 
                            {vec[1].toExponential(1)}, 
                            {vec[2].toExponential(1)}
                          </span>
                        </div>
                      ))}
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
                  onChange={handleOrbitPeriodsChange}
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
                  onChange={handlePointsPerPeriodChange}
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
                <DataRow label="Duration" value={helpers.formatDuration(propagationData.duration)} />
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
                        <span className="font-mono">{helpers.formatDuration(transition.time)}</span>
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
                      value={helpers.formatDuration(physics.time_to_periapsis)}
                    />
                  )}
                  {physics?.time_to_apoapsis !== undefined && (
                    <DataRow 
                      label="Next Apoapsis" 
                      value={helpers.formatDuration(physics.time_to_apoapsis)}
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
      </div>
    </DraggableModal>
  );
});

SatelliteDebugWindow.propTypes = {
  satellite: PropTypes.object.isRequired,
  onBodySelect: PropTypes.func,
  onClose: PropTypes.func.isRequired,
  onOpenManeuver: PropTypes.func.isRequired,
  physics: PropTypes.object,
  celestialBodies: PropTypes.array
};
