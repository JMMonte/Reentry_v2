import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../select';
import { Popover, PopoverTrigger, PopoverContent } from '../popover';
import { Button } from '../button';
import { Label } from '../label';
import PropTypes from 'prop-types';

// Memoized search input component to prevent recreation
const SearchInput = React.memo(function SearchInput({ 
    searchTerm, 
    onSearchChange, 
    searchPlaceholder, 
    searchInputRef 
}) {
    const handleChange = useCallback((e) => {
        onSearchChange(e.target.value);
    }, [onSearchChange]);

    return (
        <div className="sticky top-0 z-10 bg-popover p-1 border-b flex items-center">
            <input
                type="text"
                ref={searchInputRef}
                value={searchTerm}
                onChange={handleChange}
                placeholder={searchPlaceholder}
                className="w-full px-2 py-1 text-xs rounded bg-background border focus:outline-none focus:ring-1 focus:ring-primary"
            />
        </div>
    );
});

SearchInput.propTypes = {
    searchTerm: PropTypes.string.isRequired,
    onSearchChange: PropTypes.func.isRequired,
    searchPlaceholder: PropTypes.string.isRequired,
    searchInputRef: PropTypes.object.isRequired
};

// Memoized body option component
const BodyOption = React.memo(function BodyOption({ 
    body, 
    displayName, 
    onSelect, 
    className = "" 
}) {
    const handleClick = useCallback(() => {
        onSelect(body);
    }, [body, onSelect]);

    return (
        <button
            type="button"
            className={`w-full text-left px-3 py-2 text-xs hover:bg-accent focus:bg-accent focus:outline-none ${className}`}
            onClick={handleClick}
        >
            {displayName}
        </button>
    );
}, (prevProps, nextProps) => {
    // Custom comparison for better performance
    return prevProps.body === nextProps.body &&
        prevProps.displayName === nextProps.displayName &&
        prevProps.className === nextProps.className;
});

BodyOption.propTypes = {
    body: PropTypes.oneOfType([PropTypes.string, PropTypes.object]).isRequired,
    displayName: PropTypes.string.isRequired,
    onSelect: PropTypes.func.isRequired,
    className: PropTypes.string
};

// Memoized hierarchical planet/moon group component
const HierarchicalGroup = React.memo(function HierarchicalGroup({
    planet,
    moons,
    expanded,
    onToggleExpand,
    onBodySelect
}) {
    const handleToggleExpand = useCallback((e) => {
        e.stopPropagation();
        onToggleExpand(planet.value);
    }, [planet.value, onToggleExpand]);

    const handlePlanetSelect = useCallback(() => {
        onBodySelect(planet.value);
    }, [planet.value, onBodySelect]);

    return (
        <React.Fragment key={planet.value}>
            <div className="flex items-center">
                {moons.length > 0 && (
                    <button
                        type="button"
                        aria-label={expanded[planet.value] ? 'Collapse moons' : 'Expand moons'}
                        onClick={handleToggleExpand}
                        className="mr-1 p-1 hover:bg-accent rounded text-xs"
                        tabIndex={-1}
                    >
                        {expanded[planet.value] ? '▼' : '▶'}
                    </button>
                )}
                <button
                    type="button"
                    className="flex-1 text-left px-3 py-2 text-xs hover:bg-accent focus:bg-accent focus:outline-none"
                    onClick={handlePlanetSelect}
                >
                    {planet.text}
                </button>
            </div>
            {moons.length > 0 && expanded[planet.value] && (
                moons.map(moon => (
                    <BodyOption
                        key={moon.value}
                        body={moon.value}
                        displayName={moon.text}
                        onSelect={onBodySelect}
                        className="opacity-85 pl-8"
                    />
                ))
            )}
        </React.Fragment>
    );
});

HierarchicalGroup.propTypes = {
    planet: PropTypes.object.isRequired,
    moons: PropTypes.array.isRequired,
    expanded: PropTypes.object.isRequired,
    onToggleExpand: PropTypes.func.isRequired,
    onBodySelect: PropTypes.func.isRequired
};

/**
 * Centralized BodySelector component that handles the three main body selection patterns:
 * 1. Navbar style: Hierarchical Select with planet/moon expansion + search
 * 2. SatelliteCreator style: Popover with search functionality  
 * 3. GroundTrack style: Simple DropdownMenu + search
 * All modes now support search functionality
 * 
 * Main component with comprehensive performance optimizations
 */
export const BodySelector = React.memo(function BodySelector({
    // Data and selection
    selectedBody,
    onBodyChange,
    bodies = [],
    getDisplayValue,

    // Display mode - matches the three main patterns found in codebase
    mode = 'select', // 'select' (navbar), 'popover' (satellite creator), 'dropdown' (ground track)

    // Behavior options
    showSearch = true,             // Enable search input (now default for all modes)
    showHierarchy = false,         // Enable planet/moon hierarchy (select mode)
    allowNone = true,              // Include "None" option

    // Filtering options
    filterBarycenters = false,     // Filter out barycenter bodies
    includeTypes = [],             // Only include these body types (empty = all)
    excludeTypes = [],             // Exclude these body types

    // UI customization
    placeholder = "Select Body",
    label = null,                  // Optional label text
    triggerClassName = "",         // Additional CSS classes for trigger
    contentClassName = "",         // Additional CSS classes for content
    size = "default",              // "sm", "default", "lg"

    // Advanced options (now used by all modes)
    searchPlaceholder = "Search...",
    noResultsText = "No results",
    groupedData = null,            // For hierarchical display (navbar style)
    maxHeight = "320px"
}) {
    const [searchTerm, setSearchTerm] = useState("");
    const [expanded, setExpanded] = useState({});
    const [isOpen, setIsOpen] = useState(false);
    const searchInputRef = useRef(null);

    // Focus search input when popover opens
    useEffect(() => {
        if (isOpen && showSearch && searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, [isOpen, showSearch]);

    // Memoized type order mapping for consistent sorting
    const typeOrder = useMemo(() => ({
        planet: 0,
        moon: 1,
        asteroid: 2,
        comet: 3,
        spacecraft: 4
    }), []);

    // Prepare body list based on configuration - memoized for performance
    const preparedBodies = useMemo(() => {
        let filteredBodies = [...bodies];

        // Apply type filtering
        if (includeTypes.length > 0) {
            filteredBodies = filteredBodies.filter(body =>
                !body.type || includeTypes.includes(body.type)
            );
        }

        if (excludeTypes.length > 0) {
            filteredBodies = filteredBodies.filter(body =>
                !body.type || !excludeTypes.includes(body.type)
            );
        }

        // Filter barycenters if requested (common pattern in satellite creator and ground track)
        if (filterBarycenters) {
            filteredBodies = filteredBodies.filter(body =>
                body.type !== 'barycenter' &&
                !(typeof body.name === 'string' && (
                    body.name.endsWith('_barycenter') ||
                    body.name === 'ss_barycenter' ||
                    body.name === 'emb'
                ))
            );
        }

        // Apply search filter (for popover mode)
        if (searchTerm.trim() !== '') {
            const searchLower = searchTerm.trim().toLowerCase();
            filteredBodies = filteredBodies.filter(body =>
                body.name && body.name.toLowerCase().includes(searchLower)
            );
        }

        // Sort bodies for consistent ordering
        filteredBodies.sort((a, b) => {
            // Primary sort: type (planets first, then moons)
            const aTypeOrder = typeOrder[a.type] ?? 999;
            const bTypeOrder = typeOrder[b.type] ?? 999;
            
            if (aTypeOrder !== bTypeOrder) {
                return aTypeOrder - bTypeOrder;
            }
            
            // Secondary sort: name
            return (a.name || '').localeCompare(b.name || '');
        });

        return filteredBodies;
    }, [bodies, includeTypes, excludeTypes, filterBarycenters, searchTerm, typeOrder]);

    // Memoized event handlers to prevent recreation
    const handleBodySelect = useCallback((body) => {
        onBodyChange(body);
        setIsOpen(false);
        setSearchTerm("");
    }, [onBodyChange]);

    const handleSearchChange = useCallback((newSearchTerm) => {
        setSearchTerm(newSearchTerm);
    }, []);

    const handleToggleExpand = useCallback((planetValue) => {
        setExpanded(prev => ({ ...prev, [planetValue]: !prev[planetValue] }));
    }, []);

    // Memoized display text computation
    const displayText = useMemo(() => {
        if (getDisplayValue) {
            return getDisplayValue(selectedBody);
        }

        if (!selectedBody || selectedBody === 'none') {
            return placeholder;
        }

        if (typeof selectedBody === 'string') {
            return selectedBody.charAt(0).toUpperCase() + selectedBody.slice(1);
        }

        if (typeof selectedBody === 'object' && selectedBody.name) {
            return selectedBody.name;
        }

        return placeholder;
    }, [selectedBody, getDisplayValue, placeholder]);

    // Memoized trigger button classes
    const triggerClasses = useMemo(() => {
        const baseClasses = "justify-start";
        const sizeClasses = size === 'sm' ? 'w-[100px] h-7 text-xs' : 'w-[120px]';
        return `${baseClasses} ${sizeClasses} ${triggerClassName}`;
    }, [size, triggerClassName]);

    // Memoized content classes
    const contentClasses = useMemo(() => 
        `min-w-[10rem] p-0 w-48 overflow-y-auto ${contentClassName}`,
        [contentClassName]
    );

    // Memoized content style
    const contentStyle = useMemo(() => ({ 
        maxHeight, 
        zIndex: 11000 
    }), [maxHeight]);

    // NAVBAR STYLE: Hierarchical Select with planet/moon expansion + search
    if (mode === 'select' && showHierarchy && groupedData) {
        // Filter grouped data based on search term - memoized
        const filteredGroupedData = useMemo(() => {
            if (!showSearch || searchTerm.trim() === '') {
                return groupedData;
            }

            const searchLower = searchTerm.trim().toLowerCase();
            return groupedData.map(({ planet, moons }) => {
                const planetMatches = planet.text.toLowerCase().includes(searchLower);
                const filteredMoons = moons.filter(moon =>
                    moon.text.toLowerCase().includes(searchLower)
                );

                // Include planet if it matches or has matching moons
                if (planetMatches || filteredMoons.length > 0) {
                    return { planet, moons: filteredMoons };
                }
                return null;
            }).filter(Boolean);
        }, [groupedData, searchTerm, showSearch]);

        return (
            <div className="flex items-center gap-2">
                {label && <Label className="text-xs text-muted-foreground">{label}:</Label>}
                <Popover open={isOpen} onOpenChange={setIsOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="ghost"
                            size={size}
                            className={triggerClasses}
                        >
                            {displayText}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent
                        align="start"
                        className={contentClasses}
                        style={contentStyle}
                    >
                        {showSearch && (
                            <SearchInput
                                searchTerm={searchTerm}
                                onSearchChange={handleSearchChange}
                                searchPlaceholder={searchPlaceholder}
                                searchInputRef={searchInputRef}
                            />
                        )}
                        <div className="max-h-64 overflow-y-auto">
                            {allowNone && (
                                <BodyOption
                                    body="none"
                                    displayName="None"
                                    onSelect={handleBodySelect}
                                />
                            )}
                            {filteredGroupedData.length === 0 ? (
                                <div className="text-xs text-muted-foreground px-3 py-2">{noResultsText}</div>
                            ) : (
                                filteredGroupedData.map(({ planet, moons }) => (
                                    <HierarchicalGroup
                                        key={planet.value}
                                        planet={planet}
                                        moons={moons}
                                        expanded={expanded}
                                        onToggleExpand={handleToggleExpand}
                                        onBodySelect={handleBodySelect}
                                    />
                                ))
                            )}
                        </div>
                    </PopoverContent>
                </Popover>
            </div>
        );
    }

    // GROUND TRACK STYLE: Simple DropdownMenu + search
    if (mode === 'dropdown') {
        return (
            <div className="flex items-center gap-2">
                {label && <Label className="text-xs text-muted-foreground">{label}:</Label>}
                <Popover open={isOpen} onOpenChange={setIsOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="ghost"
                            size={size}
                            className={`justify-start w-full ${triggerClassName}`}
                        >
                            {displayText}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent
                        align="start"
                        className={contentClasses}
                        style={contentStyle}
                    >
                        {showSearch && (
                            <SearchInput
                                searchTerm={searchTerm}
                                onSearchChange={handleSearchChange}
                                searchPlaceholder={searchPlaceholder}
                                searchInputRef={searchInputRef}
                            />
                        )}
                        <div className="max-h-64 overflow-y-auto">
                            {allowNone && (
                                <BodyOption
                                    body="none"
                                    displayName="None"
                                    onSelect={handleBodySelect}
                                />
                            )}
                            {preparedBodies.length === 0 ? (
                                <div className="text-xs text-muted-foreground px-3 py-2">{noResultsText}</div>
                            ) : (
                                preparedBodies.map(body => {
                                    const key = body.naifId || body.name;
                                    const displayName = body.text || body.name;
                                    return (
                                        <BodyOption
                                            key={key}
                                            body={body}
                                            displayName={displayName}
                                            onSelect={handleBodySelect}
                                        />
                                    );
                                })
                            )}
                        </div>
                    </PopoverContent>
                </Popover>
            </div>
        );
    }

    // SATELLITE CREATOR STYLE: Popover with search functionality
    if (mode === 'popover') {
        return (
            <div className="flex items-center gap-2">
                {label && <Label className="text-xs text-muted-foreground">{label}:</Label>}
                <Popover open={isOpen} onOpenChange={setIsOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="ghost"
                            size={size}
                            className={`justify-start ${triggerClassName}`}
                        >
                            {displayText}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent
                        align="start"
                        className={contentClasses}
                        style={contentStyle}
                    >
                        {showSearch && (
                            <SearchInput
                                searchTerm={searchTerm}
                                onSearchChange={handleSearchChange}
                                searchPlaceholder={searchPlaceholder}
                                searchInputRef={searchInputRef}
                            />
                        )}
                        {preparedBodies.length === 0 ? (
                            <div className="text-xs text-muted-foreground px-3 py-2">{noResultsText}</div>
                        ) : (
                            preparedBodies.map(body => {
                                const key = body.naifId || body.name;
                                const displayName = body.text || body.name;
                                return (
                                    <BodyOption
                                        key={key}
                                        body={body}
                                        displayName={displayName}
                                        onSelect={handleBodySelect}
                                    />
                                );
                            })
                        )}
                    </PopoverContent>
                </Popover>
            </div>
        );
    }

    // FALLBACK: Simple select mode
    return (
        <div className="flex items-center gap-2">
            {label && <Label className="text-xs text-muted-foreground">{label}:</Label>}
            <Select value={selectedBody} onValueChange={onBodyChange}>
                <SelectTrigger className={triggerClasses}>
                    <SelectValue placeholder={placeholder}>
                        {displayText}
                    </SelectValue>
                </SelectTrigger>
                <SelectContent className={contentClassName} style={{ maxHeight }}>
                    {allowNone && <SelectItem value="none">None</SelectItem>}
                    {preparedBodies.map(body => {
                        const key = body.naifId || body.name;
                        const displayName = body.text || body.name;
                        return (
                            <SelectItem key={key} value={body.value || body.name || body}>
                                {displayName}
                            </SelectItem>
                        );
                    })}
                </SelectContent>
            </Select>
        </div>
    );
}, (prevProps, nextProps) => {
    // Custom comparison function for optimal performance
    return prevProps.selectedBody === nextProps.selectedBody &&
        prevProps.bodies === nextProps.bodies &&
        prevProps.mode === nextProps.mode &&
        prevProps.showSearch === nextProps.showSearch &&
        prevProps.showHierarchy === nextProps.showHierarchy &&
        prevProps.allowNone === nextProps.allowNone &&
        prevProps.filterBarycenters === nextProps.filterBarycenters &&
        JSON.stringify(prevProps.includeTypes) === JSON.stringify(nextProps.includeTypes) &&
        JSON.stringify(prevProps.excludeTypes) === JSON.stringify(nextProps.excludeTypes) &&
        prevProps.placeholder === nextProps.placeholder &&
        prevProps.label === nextProps.label &&
        prevProps.triggerClassName === nextProps.triggerClassName &&
        prevProps.contentClassName === nextProps.contentClassName &&
        prevProps.size === nextProps.size &&
        prevProps.groupedData === nextProps.groupedData;
});

BodySelector.propTypes = {
    // Required props
    selectedBody: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
    onBodyChange: PropTypes.func.isRequired,

    // Data
    bodies: PropTypes.array,
    getDisplayValue: PropTypes.func,
    groupedData: PropTypes.array,

    // Display mode
    mode: PropTypes.oneOf(['select', 'dropdown', 'popover']),

    // Behavior
    showSearch: PropTypes.bool,
    showHierarchy: PropTypes.bool,
    allowNone: PropTypes.bool,

    // Filtering
    filterBarycenters: PropTypes.bool,
    includeTypes: PropTypes.arrayOf(PropTypes.string),
    excludeTypes: PropTypes.arrayOf(PropTypes.string),

    // UI customization
    placeholder: PropTypes.string,
    label: PropTypes.string,
    triggerClassName: PropTypes.string,
    contentClassName: PropTypes.string,
    size: PropTypes.oneOf(['sm', 'default', 'lg']),
    searchPlaceholder: PropTypes.string,
    noResultsText: PropTypes.string,
    maxHeight: PropTypes.string
};

export default BodySelector; 