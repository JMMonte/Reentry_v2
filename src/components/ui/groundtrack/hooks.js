// Hook to get the list of planets, preferring prop over window.app3d
export function usePlanetList(planetsProp) {
    return planetsProp?.length ? planetsProp : window.app3d?.celestialBodies ?? [];
}
