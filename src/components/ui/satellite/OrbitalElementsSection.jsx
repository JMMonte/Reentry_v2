import React from 'react';
import PropTypes from 'prop-types';
import { Label } from '../label';

// Helper components
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

// Helper functions
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

export function OrbitalElementsSection({ 
  orbitalElements, 
  apsisData, 
  orbitalReferenceFrame, 
  onReferenceFrameChange,
  getBodyName,
  physics,
  satellite 
}) {
  if (!orbitalElements) return null;

  return (
    <div className="space-y-2">
      {/* Reference Frame Selector */}
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground">Reference Frame:</Label>
        <select
          value={orbitalReferenceFrame}
          onChange={(e) => onReferenceFrameChange(e.target.value)}
          className="flex-1 h-7 text-xs bg-background border border-input rounded px-2 text-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          <option value="ecliptic">Ecliptic</option>
          {physics?.equatorialElements && (
            <option value="equatorial">
              {getBodyName(physics?.centralBodyNaifId || satellite.centralBodyNaifId)} Equatorial
            </option>
          )}
        </select>
      </div>
      
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
      
      {/* Apsis Timing */}
      {apsisData && (apsisData.timeToPeriapsis !== undefined || apsisData.timeToApoapsis !== undefined) && (
        <div className="space-y-1 pt-1 border-t border-border/30">
          <div className="text-xs font-semibold text-muted-foreground">Next Apsis Points</div>
          {apsisData.timeToPeriapsis !== undefined && apsisData.timeToPeriapsis !== null && (
            <div className="space-y-1">
              <DataRow label="Time to Periapsis" value={formatNumber(apsisData.timeToPeriapsis, 1)} unit="min" />
              {apsisData.periapsisAltitude !== undefined && (
                <DataRow label="Periapsis Alt" value={formatNumber(apsisData.periapsisAltitude)} unit="km" />
              )}
            </div>
          )}
          {apsisData.timeToApoapsis !== undefined && apsisData.timeToApoapsis !== null && (
            <div className="space-y-1">
              <DataRow label="Time to Apoapsis" value={formatNumber(apsisData.timeToApoapsis, 1)} unit="min" />
              {apsisData.apoapsisAltitude !== undefined && (
                <DataRow label="Apoapsis Alt" value={formatNumber(apsisData.apoapsisAltitude)} unit="km" />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

OrbitalElementsSection.propTypes = {
  orbitalElements: PropTypes.object,
  apsisData: PropTypes.object,
  orbitalReferenceFrame: PropTypes.string.isRequired,
  onReferenceFrameChange: PropTypes.func.isRequired,
  getBodyName: PropTypes.func.isRequired,
  physics: PropTypes.object,
  satellite: PropTypes.object
};