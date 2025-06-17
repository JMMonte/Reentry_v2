import React, { useMemo, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { Label } from '../label';

// ✅ OPTIMIZED PATTERN: Memoized helper components
const DataRow = React.memo(function DataRow({ label, value, unit = '', className = '' }) {
  return (
    <div className={`grid grid-cols-2 gap-1 ${className}`}>
      <span className="text-xs text-muted-foreground truncate">{label}:</span>
      <span className="text-xs font-mono text-foreground">
        {value} {unit && <span className="text-muted-foreground">{unit}</span>}
      </span>
    </div>
  );
});

DataRow.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  unit: PropTypes.string,
  className: PropTypes.string
};

// ✅ OPTIMIZED PATTERN: Memoized helper functions
const formatNumber = (num, decimals = 2) => {
  if (num === undefined || num === null) return 'N/A';
  return typeof num === 'number' ? num.toFixed(decimals) : num;
};

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

// ✅ OPTIMIZED PATTERN: Main component with React.memo and performance optimizations
export const OrbitalElementsSection = React.memo(function OrbitalElementsSection({
  orbitalElements,
  apsisData,
  orbitalReferenceFrame,
  onReferenceFrameChange,
  getBodyName,
  physics,
  satellite
}) {
  // 1. REFS for caching and preventing re-renders
  const lastElementsRef = useRef(null);
  const lastApsisDataRef = useRef(null);
  const calculationCacheRef = useRef({});
  const satelliteIdRef = useRef(satellite?.id);

  // Update satellite ID ref
  satelliteIdRef.current = satellite?.id;

  // 2. MEMOIZED expensive calculations with change detection
  const memoizedOrbitalData = useMemo(() => {
    if (!orbitalElements) return null;

    // Use simple property comparison instead of expensive JSON.stringify
    const currentUpdate = orbitalElements.lastUpdate;
    const currentFrame = orbitalReferenceFrame;

    // Use cached result if data hasn't changed
    if (lastElementsRef.current?.lastUpdate === currentUpdate && 
        lastElementsRef.current?.referenceFrame === currentFrame &&
        calculationCacheRef.current.elements) {
      return calculationCacheRef.current.elements;
    }

    // Process and cache orbital elements
    const processedElements = {
      semiMajorAxis: formatNumber(orbitalElements.semiMajorAxis),
      eccentricity: formatNumber(orbitalElements.eccentricity, 4),
      inclination: formatNumber(orbitalElements.inclination),
      longitudeOfAscendingNode: formatNumber(orbitalElements.longitudeOfAscendingNode),
      argumentOfPeriapsis: formatNumber(orbitalElements.argumentOfPeriapsis),
      trueAnomaly: formatNumber(orbitalElements.trueAnomaly),
      meanAnomaly: orbitalElements.meanAnomaly !== undefined ? formatNumber(orbitalElements.meanAnomaly) : undefined,
      eccentricAnomaly: orbitalElements.eccentricAnomaly !== undefined ? formatNumber(orbitalElements.eccentricAnomaly) : undefined,
      period: orbitalElements.period ? formatDuration(orbitalElements.period) : undefined,
      specificOrbitalEnergy: formatNumber(orbitalElements.specificOrbitalEnergy),
      specificAngularMomentum: formatNumber(orbitalElements.specificAngularMomentum),
      meanMotion: orbitalElements.meanMotion !== undefined ? formatNumber(orbitalElements.meanMotion * 86400) : undefined,
      periapsisAltitude: formatNumber(orbitalElements.periapsisAltitude),
      periapsisRadial: formatNumber(orbitalElements.periapsisRadial),
      periapsisVelocity: formatNumber(orbitalElements.periapsisVelocity),
      apoapsisAltitude: formatNumber(orbitalElements.apoapsisAltitude),
      apoapsisRadial: formatNumber(orbitalElements.apoapsisRadial),
      apoapsisVelocity: formatNumber(orbitalElements.apoapsisVelocity),
      isElliptical: orbitalElements.eccentricity < 1.0
    };

    // Cache result with simple properties
    lastElementsRef.current = { lastUpdate: currentUpdate, referenceFrame: currentFrame };
    calculationCacheRef.current.elements = processedElements;
    return processedElements;
  }, [orbitalElements, orbitalReferenceFrame]);

  // 3. MEMOIZED apsis timing data with change detection
  const memoizedApsisData = useMemo(() => {
    if (!apsisData) return null;

    // Use simple property comparison instead of expensive JSON.stringify
    const currentUpdate = apsisData.lastUpdate;
    const currentTimeToPeri = apsisData.timeToPeriapsis;
    const currentTimeToApo = apsisData.timeToApoapsis;

    // Use cached result if data hasn't changed
    if (lastApsisDataRef.current?.lastUpdate === currentUpdate && 
        lastApsisDataRef.current?.timeToPeriapsis === currentTimeToPeri &&
        lastApsisDataRef.current?.timeToApoapsis === currentTimeToApo &&
        calculationCacheRef.current.apsis) {
      return calculationCacheRef.current.apsis;
    }

    // Process and cache apsis data
    const processedApsis = {
      timeToPeriapsis: apsisData.timeToPeriapsis !== undefined && apsisData.timeToPeriapsis !== null ?
        formatNumber(apsisData.timeToPeriapsis, 1) : undefined,
      timeToApoapsis: apsisData.timeToApoapsis !== undefined && apsisData.timeToApoapsis !== null ?
        formatNumber(apsisData.timeToApoapsis, 1) : undefined,
      periapsisAltitude: apsisData.periapsisAltitude !== undefined ?
        formatNumber(apsisData.periapsisAltitude) : undefined,
      apoapsisAltitude: apsisData.apoapsisAltitude !== undefined ?
        formatNumber(apsisData.apoapsisAltitude) : undefined,
      hasData: (apsisData.timeToPeriapsis !== undefined || apsisData.timeToApoapsis !== undefined)
    };

    // Cache result with simple properties
    lastApsisDataRef.current = { 
      lastUpdate: currentUpdate, 
      timeToPeriapsis: currentTimeToPeri, 
      timeToApoapsis: currentTimeToApo 
    };
    calculationCacheRef.current.apsis = processedApsis;
    return processedApsis;
  }, [apsisData]);

  // 4. MEMOIZED reference frame configuration
  const referenceFrameConfig = useMemo(() => ({
    hasEquatorial: physics?.equatorialElements,
    centralBodyName: getBodyName(physics?.centralBodyNaifId || satellite?.centralBodyNaifId)
  }), [physics?.equatorialElements, physics?.centralBodyNaifId, satellite?.centralBodyNaifId, getBodyName]);

  // 5. MEMOIZED event handlers
  const handleReferenceFrameChange = useCallback((e) => {
    const newFrame = e.target.value;
    if (onReferenceFrameChange && newFrame !== orbitalReferenceFrame) {
      onReferenceFrameChange(newFrame);
    }
  }, [onReferenceFrameChange, orbitalReferenceFrame]);

  const handleSelectClick = useCallback((e) => {
    e.stopPropagation();
  }, []);

  if (!memoizedOrbitalData) return null;

  return (
    <div className="space-y-2">
      {/* Reference Frame Selector */}
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground">Reference Frame:</Label>
        <select
          value={orbitalReferenceFrame}
          onChange={handleReferenceFrameChange}
          className="flex-1 h-7 text-xs bg-background border border-input rounded px-2 text-foreground"
          onClick={handleSelectClick}
        >
          <option value="ecliptic">Ecliptic</option>
          {referenceFrameConfig.hasEquatorial && (
            <option value="equatorial">
              {referenceFrameConfig.centralBodyName} Equatorial
            </option>
          )}
        </select>
      </div>

      {/* Basic Elements */}
      <div className="space-y-1">
        <DataRow label="Semi-Major Axis" value={memoizedOrbitalData.semiMajorAxis} unit="km" />
        <DataRow label="Eccentricity" value={memoizedOrbitalData.eccentricity} />
        <DataRow label="Inclination" value={memoizedOrbitalData.inclination} unit="°" />
        <DataRow label="LAN (Ω)" value={memoizedOrbitalData.longitudeOfAscendingNode} unit="°" />
        <DataRow label="Arg of Periapsis (ω)" value={memoizedOrbitalData.argumentOfPeriapsis} unit="°" />
        <DataRow label="True Anomaly (ν)" value={memoizedOrbitalData.trueAnomaly} unit="°" />
        {memoizedOrbitalData.meanAnomaly !== undefined && (
          <DataRow label="Mean Anomaly (M)" value={memoizedOrbitalData.meanAnomaly} unit="°" />
        )}
        {memoizedOrbitalData.eccentricAnomaly !== undefined && (
          <DataRow label="Eccentric Anomaly (E)" value={memoizedOrbitalData.eccentricAnomaly} unit="°" />
        )}
      </div>

      {/* Period and Energy */}
      <div className="space-y-1 pt-1 border-t border-border/30">
        {memoizedOrbitalData.period && (
          <DataRow label="Period" value={memoizedOrbitalData.period} />
        )}
        <DataRow label="Specific Energy" value={memoizedOrbitalData.specificOrbitalEnergy} unit="m²/s²" />
        <DataRow label="Specific Momentum" value={memoizedOrbitalData.specificAngularMomentum} unit="m²/s" />
        {memoizedOrbitalData.meanMotion !== undefined && (
          <DataRow label="Mean Motion" value={memoizedOrbitalData.meanMotion} unit="°/day" />
        )}
      </div>

      {/* Apsides */}
      {memoizedOrbitalData.isElliptical && (
        <div className="space-y-1 pt-1 border-t border-border/30">
          <div className="text-xs font-semibold text-muted-foreground">Periapsis</div>
          <DataRow label="Altitude" value={memoizedOrbitalData.periapsisAltitude} unit="km" />
          <DataRow label="Radius" value={memoizedOrbitalData.periapsisRadial} unit="km" />
          <DataRow label="Velocity" value={memoizedOrbitalData.periapsisVelocity} unit="km/s" />

          <div className="text-xs font-semibold text-muted-foreground pt-1">Apoapsis</div>
          <DataRow label="Altitude" value={memoizedOrbitalData.apoapsisAltitude} unit="km" />
          <DataRow label="Radius" value={memoizedOrbitalData.apoapsisRadial} unit="km" />
          <DataRow label="Velocity" value={memoizedOrbitalData.apoapsisVelocity} unit="km/s" />
        </div>
      )}

      {/* Apsis Timing */}
      {memoizedApsisData?.hasData && (
        <div className="space-y-1 pt-1 border-t border-border/30">
          <div className="text-xs font-semibold text-muted-foreground">Next Apsis Points</div>
          {memoizedApsisData.timeToPeriapsis !== undefined && (
            <div className="space-y-1">
              <DataRow label="Time to Periapsis" value={memoizedApsisData.timeToPeriapsis} unit="min" />
              {memoizedApsisData.periapsisAltitude !== undefined && (
                <DataRow label="Periapsis Alt" value={memoizedApsisData.periapsisAltitude} unit="km" />
              )}
            </div>
          )}
          {memoizedApsisData.timeToApoapsis !== undefined && (
            <div className="space-y-1">
              <DataRow label="Time to Apoapsis" value={memoizedApsisData.timeToApoapsis} unit="min" />
              {memoizedApsisData.apoapsisAltitude !== undefined && (
                <DataRow label="Apoapsis Alt" value={memoizedApsisData.apoapsisAltitude} unit="km" />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for better performance
  return (
    prevProps.orbitalReferenceFrame === nextProps.orbitalReferenceFrame &&
    prevProps.orbitalElements?.lastUpdate === nextProps.orbitalElements?.lastUpdate &&
    prevProps.apsisData?.lastUpdate === nextProps.apsisData?.lastUpdate &&
    prevProps.physics?.equatorialElements === nextProps.physics?.equatorialElements &&
    prevProps.satellite?.id === nextProps.satellite?.id
  );
});

OrbitalElementsSection.propTypes = {
  orbitalElements: PropTypes.object,
  apsisData: PropTypes.object,
  orbitalReferenceFrame: PropTypes.string.isRequired,
  onReferenceFrameChange: PropTypes.func.isRequired,
  getBodyName: PropTypes.func.isRequired,
  physics: PropTypes.object,
  satellite: PropTypes.object
};