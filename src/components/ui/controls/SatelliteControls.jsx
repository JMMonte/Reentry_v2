import React, { useState } from 'react';
import { Button } from '../button';
import { Input } from '../input';
import { Label } from '../label';
import { Satellite } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '../sheet';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../tabs';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../form';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

const latLonSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  latitude: z.string().transform(Number).pipe(
    z.number().min(-90).max(90)
  ),
  longitude: z.string().transform(Number).pipe(
    z.number().min(-180).max(180)
  ),
  altitude: z.string().transform(Number).pipe(
    z.number().min(0)
  ),
});

const orbitalElementsSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  semiMajorAxis: z.string().transform(Number).pipe(
    z.number().min(0)
  ),
  eccentricity: z.string().transform(Number).pipe(
    z.number().min(0).max(1)
  ),
  inclination: z.string().transform(Number).pipe(
    z.number().min(0).max(180)
  ),
  raan: z.string().transform(Number).pipe(
    z.number().min(0).max(360)
  ),
  argumentOfPeriapsis: z.string().transform(Number).pipe(
    z.number().min(0).max(360)
  ),
  trueAnomaly: z.string().transform(Number).pipe(
    z.number().min(0).max(360)
  ),
});

export function SatelliteControls({ socket }) {
  const [activeTab, setActiveTab] = useState('lat-lon');
  
  const latLonForm = useForm({
    resolver: zodResolver(latLonSchema),
    defaultValues: {
      name: '',
      latitude: '',
      longitude: '',
      altitude: '',
    },
  });

  const orbitalElementsForm = useForm({
    resolver: zodResolver(orbitalElementsSchema),
    defaultValues: {
      name: '',
      semiMajorAxis: '',
      eccentricity: '',
      inclination: '',
      raan: '',
      argumentOfPeriapsis: '',
      trueAnomaly: '',
    },
  });

  const onLatLonSubmit = (data) => {
    if (!socket) return;
    socket.emit('create satellite from lat lon', data);
    latLonForm.reset();
  };

  const onOrbitalElementsSubmit = (data) => {
    if (!socket) return;
    socket.emit('create satellite from orbital elements', data);
    orbitalElementsForm.reset();
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon">
          <Satellite className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="p-4">
        <SheetHeader>
          <SheetTitle>Create Satellite</SheetTitle>
          <SheetDescription>
            Add a new satellite using either Lat/Lon or Orbital Elements
          </SheetDescription>
        </SheetHeader>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="lat-lon">Lat/Lon</TabsTrigger>
            <TabsTrigger value="orbital-elements">Orbital Elements</TabsTrigger>
          </TabsList>
          
          <TabsContent value="lat-lon">
            <Form {...latLonForm}>
              <form onSubmit={latLonForm.handleSubmit(onLatLonSubmit)} className="space-y-4">
                <FormField
                  control={latLonForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Satellite name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={latLonForm.control}
                  name="latitude"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Latitude (°)</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" placeholder="-90 to 90" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={latLonForm.control}
                  name="longitude"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Longitude (°)</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" placeholder="-180 to 180" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={latLonForm.control}
                  name="altitude"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Altitude (km)</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" placeholder="Above Earth's surface" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit">Create Satellite</Button>
              </form>
            </Form>
          </TabsContent>
          
          <TabsContent value="orbital-elements">
            <Form {...orbitalElementsForm}>
              <form onSubmit={orbitalElementsForm.handleSubmit(onOrbitalElementsSubmit)} className="space-y-4">
                <FormField
                  control={orbitalElementsForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Satellite name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={orbitalElementsForm.control}
                  name="semiMajorAxis"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Semi-Major Axis (km)</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" placeholder="Distance from center" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={orbitalElementsForm.control}
                  name="eccentricity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Eccentricity</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" placeholder="0 to 1" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={orbitalElementsForm.control}
                  name="inclination"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Inclination (°)</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" placeholder="0 to 180" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={orbitalElementsForm.control}
                  name="raan"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>RAAN (°)</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" placeholder="0 to 360" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={orbitalElementsForm.control}
                  name="argumentOfPeriapsis"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Argument of Periapsis (°)</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" placeholder="0 to 360" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={orbitalElementsForm.control}
                  name="trueAnomaly"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>True Anomaly (°)</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" placeholder="0 to 360" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit">Create Satellite</Button>
              </form>
            </Form>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
