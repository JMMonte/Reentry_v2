import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { Button } from '../button';
import { Download, Eye, EyeOff, MapPin } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
} from '../dropdown-menu';

export default function GroundTrackControls({
    onDownloadCsv,
    planetList,
    setSelectedPlanet,
    planet,
    showCoverage,
    setShowCoverage,
    layers,
    dispatchLayers,
}) {
    const [menuOpen, setMenuOpen] = useState(false);
    // Only show toggles for features this planet supports
    const surfaceOptions = planet?.config?.surfaceOptions || {};
    const optionMap = {
        cities: 'addCities',
        airports: 'addAirports',
        spaceports: 'addSpaceports',
        groundStations: 'addGroundStations',
        observatories: 'addObservatories',
        missions: 'addMissions',
        countryBorders: 'addCountryBorders',
        states: 'addStates',
    };
    const filteredLayers = Object.entries(layers).filter(
        ([key]) => surfaceOptions[optionMap[key]],
    );

    return (
        <>
            <Button
                variant="ghost"
                size="icon"
                className="w-8 h-8"
                onClick={onDownloadCsv}
            >
                <Download className="h-4 w-4" />
            </Button>

            {planetList.length > 0 && (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="outline"
                            size="sm"
                            className="text-xs mr-2"
                        >
                            {planet?.name}
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent sideOffset={4} className="text-xs">
                        {planetList.map((p, i) => (
                            <DropdownMenuItem
                                key={p.name}
                                onSelect={() => setSelectedPlanet(i)}
                            >
                                {p.name}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            )}

            <Button
                variant="ghost"
                size="icon"
                className="w-8 h-8"
                onClick={() => setShowCoverage(s => !s)}
            >
                {showCoverage ? (
                    <EyeOff className="h-4 w-4" />
                ) : (
                    <Eye className="h-4 w-4" />
                )}
            </Button>

            <div className="relative">
                <Button
                    variant="ghost"
                    size="icon"
                    className="w-8 h-8"
                    onClick={() => setMenuOpen(m => !m)}
                >
                    <MapPin className="h-4 w-4" />
                </Button>
                {menuOpen && (
                    <div className="absolute right-0 mt-2 w-44 bg-background border rounded shadow-md p-2 text-xs space-y-1 z-10">
                        {filteredLayers.map(([key, value]) => (
                            <label key={key} className="flex items-center gap-1">
                                <input
                                    type="checkbox"
                                    checked={value}
                                    onChange={() =>
                                        dispatchLayers({ type: 'TOGGLE', key })
                                    }
                                />
                                {key
                                    .replace(/([A-Z])/g, ' $1')
                                    .replace(/^./, s => s.toUpperCase())}
                            </label>
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}

GroundTrackControls.propTypes = {
    onDownloadCsv: PropTypes.func.isRequired,
    planetList: PropTypes.array.isRequired,
    setSelectedPlanet: PropTypes.func.isRequired,
    planet: PropTypes.object,
    showCoverage: PropTypes.bool.isRequired,
    setShowCoverage: PropTypes.func.isRequired,
    layers: PropTypes.shape({
        cities: PropTypes.bool,
        airports: PropTypes.bool,
        spaceports: PropTypes.bool,
        groundStations: PropTypes.bool,
        observatories: PropTypes.bool,
        missions: PropTypes.bool,
        countryBorders: PropTypes.bool,
        states: PropTypes.bool,
    }).isRequired,
    dispatchLayers: PropTypes.func.isRequired,
}; 