import React, { useState, useEffect } from 'react';
import { Button } from '../button';
import { Input } from '../input';
import { Label } from '../label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../tabs';
import { Slider } from '../slider';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '../sheet';

export function SatelliteCreationPanel({ isVisible, onToggle }) {
  const [latLonInputs, setLatLonInputs] = useState({
    name: '',
    lat: 0,
    lon: 0,
    alt: 200,
    velocity: 7.8,
    azimuth: 90,
    angleOfAttack: 0,
  });

  const [orbitalInputs, setOrbitalInputs] = useState({
    name: '',
    sma: 6778,
    ecc: 0,
    inc: 51.6,
    raan: 0,
    aop: 0,
    ta: 0,
  });

  const handleLatLonChange = (key, value) => {
    setLatLonInputs(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleOrbitalChange = (key, value) => {
    setOrbitalInputs(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleLatLonSubmit = () => {
    const event = new CustomEvent('createSatelliteFromLatLon', {
      detail: {
        name: latLonInputs.name,
        latitude: parseFloat(latLonInputs.lat),
        longitude: parseFloat(latLonInputs.lon),
        altitude: parseFloat(latLonInputs.alt),
        velocity: parseFloat(latLonInputs.velocity),
        azimuth: parseFloat(latLonInputs.azimuth),
        angleOfAttack: parseFloat(latLonInputs.angleOfAttack),
      }
    });
    document.dispatchEvent(event);
    onToggle(false);
  };

  const handleOrbitalSubmit = () => {
    const event = new CustomEvent('createSatelliteFromOrbital', {
      detail: {
        name: orbitalInputs.name,
        semiMajorAxis: parseFloat(orbitalInputs.sma),
        eccentricity: parseFloat(orbitalInputs.ecc),
        inclination: parseFloat(orbitalInputs.inc),
        raan: parseFloat(orbitalInputs.raan),
        argumentOfPeriapsis: parseFloat(orbitalInputs.aop),
        trueAnomaly: parseFloat(orbitalInputs.ta),
      }
    });
    document.dispatchEvent(event);
    onToggle(false);
  };

  return (
    <Sheet open={isVisible} onOpenChange={onToggle}>
      <SheetContent side="right" className="w-[400px]">
        <SheetHeader>
          <SheetTitle>Create Satellite</SheetTitle>
        </SheetHeader>

        <Tabs defaultValue="latlon" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="latlon">Lat/Lon</TabsTrigger>
            <TabsTrigger value="orbital">Orbital</TabsTrigger>
          </TabsList>

          <TabsContent value="latlon" className="space-y-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sat-name">Satellite Name</Label>
                <Input
                  id="sat-name"
                  value={latLonInputs.name}
                  onChange={(e) => handleLatLonChange('name', e.target.value)}
                  placeholder="Enter satellite name"
                />
              </div>

              {[
                { key: 'lat', label: 'Latitude', min: -90, max: 90, step: 0.1 },
                { key: 'lon', label: 'Longitude', min: -180, max: 180, step: 0.1 },
                { key: 'alt', label: 'Altitude', min: 100, max: 1000, step: 1 },
                { key: 'velocity', label: 'Velocity', min: 5, max: 15, step: 0.1 },
                { key: 'azimuth', label: 'Azimuth', min: 0, max: 360, step: 1 },
                { key: 'angleOfAttack', label: 'Angle of Attack', min: -90, max: 90, step: 1 },
              ].map(({ key, label, min, max, step }) => (
                <div key={key} className="space-y-2">
                  <Label htmlFor={key}>{label}</Label>
                  <div className="flex items-center gap-4">
                    <Slider
                      id={`${key}-range`}
                      min={min}
                      max={max}
                      step={step}
                      value={[latLonInputs[key]]}
                      onValueChange={([value]) => handleLatLonChange(key, value)}
                    />
                    <Input
                      type="number"
                      id={key}
                      value={latLonInputs[key]}
                      onChange={(e) => handleLatLonChange(key, parseFloat(e.target.value))}
                      className="w-20"
                    />
                  </div>
                </div>
              ))}

              <Button onClick={handleLatLonSubmit} className="w-full">
                Create Satellite
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="orbital" className="space-y-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sat-name-orbital">Satellite Name</Label>
                <Input
                  id="sat-name-orbital"
                  value={orbitalInputs.name}
                  onChange={(e) => handleOrbitalChange('name', e.target.value)}
                  placeholder="Enter satellite name"
                />
              </div>

              {[
                { key: 'sma', label: 'Semi-Major Axis', min: 6578, max: 42164, step: 1 },
                { key: 'ecc', label: 'Eccentricity', min: 0, max: 0.9, step: 0.01 },
                { key: 'inc', label: 'Inclination', min: 0, max: 180, step: 0.1 },
                { key: 'raan', label: 'RAAN', min: 0, max: 360, step: 1 },
                { key: 'aop', label: 'Argument of Periapsis', min: 0, max: 360, step: 1 },
                { key: 'ta', label: 'True Anomaly', min: 0, max: 360, step: 1 },
              ].map(({ key, label, min, max, step }) => (
                <div key={key} className="space-y-2">
                  <Label htmlFor={key}>{label}</Label>
                  <div className="flex items-center gap-4">
                    <Slider
                      id={`${key}-range`}
                      min={min}
                      max={max}
                      step={step}
                      value={[orbitalInputs[key]]}
                      onValueChange={([value]) => handleOrbitalChange(key, value)}
                    />
                    <Input
                      type="number"
                      id={key}
                      value={orbitalInputs[key]}
                      onChange={(e) => handleOrbitalChange(key, parseFloat(e.target.value))}
                      className="w-20"
                    />
                  </div>
                </div>
              ))}

              <Button onClick={handleOrbitalSubmit} className="w-full">
                Create Satellite
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
