# Maneuver Window Refactoring Plan

## Goal
Remove the dependency on timeUtils from useManeuverWindow to improve separation of concerns and make the component more testable and reusable.

## Current Issues

1. **Direct SimulationContext Dependency**
   - useManeuverWindow requires SimulationContext to get timeUtils
   - Component fails if context is not available
   - Makes testing difficult

2. **Time-Related Responsibilities**
   - Component directly accesses simulation time for calculations
   - Listens to time update events from the simulation
   - Passes timeUtils to child components

3. **Mixed Concerns**
   - UI state management mixed with physics calculations
   - Direct coupling to simulation infrastructure

## Proposed Solution

### 1. Pass currentTime as a Prop
Instead of accessing timeUtils directly, have the parent component provide the current simulation time:

```jsx
// Current
export function useManeuverWindow(satellite) {
    const simulationContext = useSimulation();
    const timeUtils = simulationContext?.timeUtils;
    const currentSimTime = timeUtils.getSimulatedTime();
    
// Proposed
export function useManeuverWindow(satellite, currentTime) {
    const [currentSimTime, setCurrentSimTime] = useState(currentTime);
    
    useEffect(() => {
        setCurrentSimTime(currentTime);
    }, [currentTime]);
```

### 2. Extract Time Calculations to PhysicsAPI
Move all time-related physics calculations to PhysicsAPI:

```js
// Add to PhysicsAPI
static computeExecutionTime(currentTime, timeMode, params) {
    if (timeMode === 'offset') {
        const secs = parseFloat(params.offsetSec) || 0;
        return new Date(currentTime.getTime() + secs * 1000);
    } else if (timeMode === 'datetime') {
        const newTime = new Date(currentTime);
        newTime.setUTCHours(params.hours);
        newTime.setUTCMinutes(params.minutes);
        newTime.setUTCSeconds(params.seconds);
        newTime.setUTCMilliseconds(params.milliseconds);
        return newTime;
    }
    // Handle other modes...
}
```

### 3. Refactor ManeuverManager
Remove timeUtils dependency from ManeuverManager:

```js
// Current
constructor(satellite, timeUtils) {
    this.sat = satellite;
    this.timeUtils = timeUtils;
}

// Proposed
constructor(satellite) {
    this.sat = satellite;
}

scheduleManualBurn(currentTime, params, replaceOldNode = null) {
    const executeTime = PhysicsAPI.computeExecutionTime(currentTime, params.timeMode, params);
    // ... rest of method
}
```

### 4. Update Parent Component
Have SatelliteManeuverWindow pass currentTime:

```jsx
export function SatelliteManeuverWindow({ satellite, onClose }) {
    const { simulatedTime } = useSimulation();
    const maneuverProps = useManeuverWindow(satellite, simulatedTime);
    // ...
}
```

### 5. Remove Event Listeners
Replace DOM event listeners with React props:

```jsx
// Remove this:
useEffect(() => {
    const handler = e => setCurrentSimTime(new Date(e.detail.simulatedTime));
    document.addEventListener('timeUpdate', handler);
    return () => document.removeEventListener('timeUpdate', handler);
}, [timeUtils]);

// The currentTime prop will automatically update via React
```

## Benefits

1. **Better Testability**: Can test useManeuverWindow without needing SimulationContext
2. **Clearer Dependencies**: Time is explicitly passed as a prop
3. **Improved Reusability**: Component can work in different contexts
4. **Separation of Concerns**: UI logic separated from simulation infrastructure
5. **No Failure Mode**: Component works even if SimulationContext is unavailable

## Implementation Steps

1. Add time calculation methods to PhysicsAPI
2. Refactor ManeuverManager to remove timeUtils dependency
3. Update useManeuverWindow to accept currentTime prop
4. Update usePreviewNodes to accept currentTime instead of timeUtils
5. Update SatelliteManeuverWindow to pass simulatedTime
6. Remove event listener setup and SimulationContext dependency
7. Update tests to pass currentTime as prop

## Alternative Approach

If passing currentTime as a prop is not desirable, consider creating a TimeProvider that abstracts time access:

```jsx
const TimeContext = createContext();

export function TimeProvider({ timeSource, children }) {
    const [currentTime, setCurrentTime] = useState(timeSource());
    
    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentTime(timeSource());
        }, 100);
        return () => clearInterval(interval);
    }, [timeSource]);
    
    return (
        <TimeContext.Provider value={currentTime}>
            {children}
        </TimeContext.Provider>
    );
}

export function useCurrentTime() {
    return useContext(TimeContext);
}
```

This would allow components to access time without direct coupling to SimulationContext.