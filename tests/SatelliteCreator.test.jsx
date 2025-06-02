/**
 * SatelliteCreator.test.jsx
 * 
 * Comprehensive tests for the SatelliteCreator component
 * Tests UI interactions, form validation, template loading, and satellite creation
 */

import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SatelliteCreator from '../src/components/ui/satellite/SatelliteCreator.jsx';
import React from 'react';

// Mock the UI components
vi.mock('../src/components/ui/button', () => ({
    Button: ({ children, onClick, type, className, variant, size, disabled, ...props }) => (
        <button 
            onClick={onClick} 
            type={type} 
            className={className}
            disabled={disabled}
            data-variant={variant}
            data-size={size}
            {...props}
        >
            {children}
        </button>
    )
}));

vi.mock('../src/components/ui/input', () => ({
    Input: ({ onChange, value, name, type, className, min, max, step, disabled, required, ...props }) => (
        <input
            onChange={onChange}
            value={value}
            name={name}
            type={type}
            className={className}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            required={required}
            data-testid={`input-${name}`}
            {...props}
        />
    )
}));

vi.mock('../src/components/ui/label', () => ({
    Label: ({ children, htmlFor, className }) => (
        <label htmlFor={htmlFor} className={className}>
            {children}
        </label>
    )
}));

vi.mock('../src/components/ui/slider', () => ({
    Slider: ({ value, onValueChange, min, max, step, className }) => (
        <input
            type="range"
            value={value[0]}
            onChange={(e) => onValueChange([parseFloat(e.target.value)])}
            min={min}
            max={max}
            step={step}
            className={className}
            data-testid="slider"
        />
    )
}));

vi.mock('../src/components/ui/tabs', () => ({
    Tabs: ({ children, value, onValueChange }) => (
        <div data-testid="tabs" data-value={value}>
            {React.Children.map(children, child => 
                React.cloneElement(child, { currentValue: value, onValueChange })
            )}
        </div>
    ),
    TabsList: ({ children, className }) => (
        <div className={className} data-testid="tabs-list">
            {children}
        </div>
    ),
    TabsTrigger: ({ children, value, className, currentValue, onValueChange }) => (
        <button
            onClick={() => onValueChange?.(value)}
            className={className}
            data-testid={`tab-${value}`}
            data-active={currentValue === value}
        >
            {children}
        </button>
    )
}));

vi.mock('../src/components/ui/switch', () => ({
    Switch: ({ checked, onCheckedChange }) => (
        <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onCheckedChange(e.target.checked)}
            data-testid="switch"
        />
    )
}));

vi.mock('../src/components/ui/select', () => ({
    Select: ({ children, value, onValueChange }) => (
        <select
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            data-testid="select"
        >
            {children}
        </select>
    ),
    SelectTrigger: ({ children, className }) => (
        <div className={className} data-testid="select-trigger">
            {children}
        </div>
    ),
    SelectValue: () => <span data-testid="select-value" />,
    SelectContent: ({ children }) => (
        <div data-testid="select-content">
            {children}
        </div>
    ),
    SelectItem: ({ children, value }) => (
        <option value={value} data-testid={`select-item-${value}`}>
            {children}
        </option>
    )
}));

vi.mock('../src/components/ui/dropdown-menu', () => ({
    DropdownMenu: ({ children }) => <div data-testid="dropdown-menu">{children}</div>,
    DropdownMenuTrigger: ({ children, asChild }) => (
        <div data-testid="dropdown-trigger">{children}</div>
    ),
    DropdownMenuContent: ({ children, className }) => (
        <div className={className} data-testid="dropdown-content">{children}</div>
    ),
    DropdownMenuItem: ({ children, onSelect, className }) => (
        <div
            onClick={onSelect}
            className={className}
            data-testid="dropdown-item"
        >
            {children}
        </div>
    )
}));

vi.mock('../src/components/ui/popover', () => ({
    Popover: ({ children, open, onOpenChange }) => (
        <div data-testid="popover" data-open={open}>
            {React.Children.map(children, child => 
                React.cloneElement(child, { isOpen: open, onOpenChange })
            )}
        </div>
    ),
    PopoverTrigger: ({ children, asChild }) => (
        <div data-testid="popover-trigger">{children}</div>
    ),
    PopoverContent: ({ children, className, style }) => (
        <div className={className} style={style} data-testid="popover-content">
            {children}
        </div>
    )
}));

describe('SatelliteCreator Component', () => {
    let mockOnCreateSatellite;
    let mockAvailableBodies;
    let mockSelectedBody;
    let user;

    beforeEach(() => {
        user = userEvent.setup();
        mockOnCreateSatellite = vi.fn().mockResolvedValue(undefined);
        mockAvailableBodies = [
            { name: 'Earth', naifId: 399, type: 'planet' },
            { name: 'Moon', naifId: 301, type: 'moon' },
            { name: 'Mars', naifId: 499, type: 'planet' },
            { name: 'Sun', naifId: 10, type: 'star' },
            { name: 'EMB', naifId: 3, type: 'barycenter' }, // Should be filtered out
            { name: 'mars_barycenter', naifId: 4, type: 'barycenter' } // Should be filtered out
        ];
        mockSelectedBody = mockAvailableBodies[0]; // Earth
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Component Rendering', () => {
        test('should render with default props', () => {
            render(
                <SatelliteCreator 
                    onCreateSatellite={mockOnCreateSatellite}
                    availableBodies={mockAvailableBodies}
                    selectedBody={mockSelectedBody}
                />
            );

            expect(screen.getByText('Central Body:')).toBeInTheDocument();
            expect(screen.getByText('Earth')).toBeInTheDocument();
            expect(screen.getByText('Structure & Mass Properties')).toBeInTheDocument();
            expect(screen.getByText('Orbital Parameters')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
        });

        test('should filter out barycenters from available bodies', () => {
            render(
                <SatelliteCreator 
                    onCreateSatellite={mockOnCreateSatellite}
                    availableBodies={mockAvailableBodies}
                    selectedBody={mockSelectedBody}
                />
            );

            // Barycenters should not be visible in the dropdown
            expect(screen.queryByText('EMB')).not.toBeInTheDocument();
            expect(screen.queryByText('mars_barycenter')).not.toBeInTheDocument();
        });

        test('should show correct initial form values', () => {
            render(
                <SatelliteCreator 
                    onCreateSatellite={mockOnCreateSatellite}
                    availableBodies={mockAvailableBodies}
                    selectedBody={mockSelectedBody}
                />
            );

            // Check default values
            expect(screen.getByDisplayValue('100')).toBeInTheDocument(); // mass
            expect(screen.getByDisplayValue('1')).toBeInTheDocument(); // size
            expect(screen.getByDisplayValue('0')).toBeInTheDocument(); // latitude
            expect(screen.getByDisplayValue('400')).toBeInTheDocument(); // altitude
            expect(screen.getByDisplayValue('7.8')).toBeInTheDocument(); // velocity
        });
    });

    describe('Form Interaction', () => {
        test('should handle basic form input changes', async () => {
            render(
                <SatelliteCreator 
                    onCreateSatellite={mockOnCreateSatellite}
                    availableBodies={mockAvailableBodies}
                    selectedBody={mockSelectedBody}
                />
            );

            const nameInput = screen.getByTestId('input-name');
            const massInput = screen.getByTestId('input-mass');
            
            await user.clear(nameInput);
            await user.type(nameInput, 'Test Satellite');
            
            await user.clear(massInput);
            await user.type(massInput, '500');

            expect(nameInput.value).toBe('Test Satellite');
            expect(massInput.value).toBe('500');
        });

        test('should toggle between latlon and orbital modes', async () => {
            render(
                <SatelliteCreator 
                    onCreateSatellite={mockOnCreateSatellite}
                    availableBodies={mockAvailableBodies}
                    selectedBody={mockSelectedBody}
                />
            );

            const latlonTab = screen.getByTestId('tab-latlon');
            const orbitalTab = screen.getByTestId('tab-orbital');

            // Should start in latlon mode
            expect(latlonTab.getAttribute('data-active')).toBe('true');
            expect(screen.getByTestId('input-latitude')).toBeInTheDocument();

            // Switch to orbital mode
            await user.click(orbitalTab);
            
            expect(orbitalTab.getAttribute('data-active')).toBe('true');
            expect(screen.getByTestId('input-semiMajorAxis')).toBeInTheDocument();
        });

        test('should handle circular velocity toggle', async () => {
            render(
                <SatelliteCreator 
                    onCreateSatellite={mockOnCreateSatellite}
                    availableBodies={mockAvailableBodies}
                    selectedBody={mockSelectedBody}
                />
            );

            const circularCheckbox = screen.getByRole('checkbox', { name: 'circular' });
            const velocityInput = screen.getByTestId('input-velocity');

            // Initially should not be checked
            expect(circularCheckbox.checked).toBe(false);
            expect(velocityInput.disabled).toBe(false);

            // Check the circular box
            await user.click(circularCheckbox);
            
            expect(circularCheckbox.checked).toBe(true);
            expect(velocityInput.disabled).toBe(true);
        });

        test('should handle communications switch', async () => {
            render(
                <SatelliteCreator 
                    onCreateSatellite={mockOnCreateSatellite}
                    availableBodies={mockAvailableBodies}
                    selectedBody={mockSelectedBody}
                />
            );

            // First open the communications section
            const commsSection = screen.getByText('Communications Subsystem');
            await user.click(commsSection);

            const commsSwitch = screen.getByTestId('switch');
            
            // Should be enabled by default
            expect(commsSwitch.checked).toBe(true);

            // Disable communications
            await user.click(commsSwitch);
            
            expect(commsSwitch.checked).toBe(false);
        });
    });

    describe('Template System', () => {
        test('should load CubeSat template correctly', async () => {
            render(
                <SatelliteCreator 
                    onCreateSatellite={mockOnCreateSatellite}
                    availableBodies={mockAvailableBodies}
                    selectedBody={mockSelectedBody}
                />
            );

            // Open quick start section
            const quickStartSection = screen.getByText('Quick Start (Optional)');
            await user.click(quickStartSection);

            // Find and click Load Template button
            const loadTemplateButton = screen.getByText('Load Template...');
            await user.click(loadTemplateButton);

            // Find CubeSat template in dropdown
            const cubesatTemplate = screen.getByText('CubeSat');
            await user.click(cubesatTemplate);

            // Check that values were updated
            expect(screen.getByTestId('input-mass').value).toBe('5');
            expect(screen.getByTestId('input-size').value).toBe('0.3');
            expect(screen.getByTestId('input-ballisticCoefficient').value).toBe('30');
        });

        test('should load Communications Satellite template correctly', async () => {
            render(
                <SatelliteCreator 
                    onCreateSatellite={mockOnCreateSatellite}
                    availableBodies={mockAvailableBodies}
                    selectedBody={mockSelectedBody}
                />
            );

            // Open quick start section
            const quickStartSection = screen.getByText('Quick Start (Optional)');
            await user.click(quickStartSection);

            // Find and click Load Template button
            const loadTemplateButton = screen.getByText('Load Template...');
            await user.click(loadTemplateButton);

            // Find Communications Satellite template
            const commsTemplate = screen.getByText('Communications Satellite');
            await user.click(commsTemplate);

            // Check that values were updated
            expect(screen.getByTestId('input-mass').value).toBe('3000');
            expect(screen.getByTestId('input-size').value).toBe('3');
            expect(screen.getByTestId('input-ballisticCoefficient').value).toBe('200');
        });

        test('should update communication parameters when template is loaded', async () => {
            render(
                <SatelliteCreator 
                    onCreateSatellite={mockOnCreateSatellite}
                    availableBodies={mockAvailableBodies}
                    selectedBody={mockSelectedBody}
                />
            );

            // Open both sections
            const quickStartSection = screen.getByText('Quick Start (Optional)');
            await user.click(quickStartSection);
            
            const commsSection = screen.getByText('Communications Subsystem');
            await user.click(commsSection);

            // Load Communications Satellite template
            const loadTemplateButton = screen.getByText('Load Template...');
            await user.click(loadTemplateButton);

            const commsTemplate = screen.getByText('Communications Satellite');
            await user.click(commsTemplate);

            // Check communication parameters were updated
            expect(screen.getByTestId('input-antennaGain').value).toBe('25');
            expect(screen.getByTestId('input-transmitPower').value).toBe('50');
            expect(screen.getByTestId('input-dataRate').value).toBe('10000');
        });
    });

    describe('Ballistic Coefficient Presets', () => {
        test('should set ballistic coefficient presets correctly', async () => {
            render(
                <SatelliteCreator 
                    onCreateSatellite={mockOnCreateSatellite}
                    availableBodies={mockAvailableBodies}
                    selectedBody={mockSelectedBody}
                />
            );

            // Open structure section (should be open by default)
            const bcPresetsButton = screen.getByText('Custom (100)');
            await user.click(bcPresetsButton);

            // Select CubeSat preset
            const cubesatPreset = screen.getByText('CubeSat (30)');
            await user.click(cubesatPreset);

            expect(screen.getByTestId('input-ballisticCoefficient').value).toBe('30');
            expect(screen.getByText('CubeSat (30)')).toBeInTheDocument();
        });

        test('should display correct preset labels', async () => {
            render(
                <SatelliteCreator 
                    onCreateSatellite={mockOnCreateSatellite}
                    availableBodies={mockAvailableBodies}
                    selectedBody={mockSelectedBody}
                />
            );

            // Should show Custom (100) initially
            expect(screen.getByText('Custom (100)')).toBeInTheDocument();

            // Change to a preset value
            const bcInput = screen.getByTestId('input-ballisticCoefficient');
            await user.clear(bcInput);
            await user.type(bcInput, '500');

            // Should show LargeSat (500)
            expect(screen.getByText('LargeSat (500)')).toBeInTheDocument();
        });
    });

    describe('Central Body Selection', () => {
        test('should show correct initial central body', () => {
            render(
                <SatelliteCreator 
                    onCreateSatellite={mockOnCreateSatellite}
                    availableBodies={mockAvailableBodies}
                    selectedBody={mockSelectedBody}
                />
            );

            expect(screen.getByText('Earth')).toBeInTheDocument();
        });

        test('should update when selectedBody prop changes', () => {
            const { rerender } = render(
                <SatelliteCreator 
                    onCreateSatellite={mockOnCreateSatellite}
                    availableBodies={mockAvailableBodies}
                    selectedBody={mockAvailableBodies[0]} // Earth
                />
            );

            expect(screen.getByText('Earth')).toBeInTheDocument();

            // Update selectedBody prop
            rerender(
                <SatelliteCreator 
                    onCreateSatellite={mockOnCreateSatellite}
                    availableBodies={mockAvailableBodies}
                    selectedBody={mockAvailableBodies[1]} // Moon
                />
            );

            expect(screen.getByText('Moon')).toBeInTheDocument();
        });
    });

    describe('Form Submission', () => {
        test('should submit latlon satellite correctly', async () => {
            render(
                <SatelliteCreator 
                    onCreateSatellite={mockOnCreateSatellite}
                    availableBodies={mockAvailableBodies}
                    selectedBody={mockSelectedBody}
                />
            );

            // Fill out form
            const nameInput = screen.getByTestId('input-name');
            await user.clear(nameInput);
            await user.type(nameInput, 'Test Satellite');

            const massInput = screen.getByTestId('input-mass');
            await user.clear(massInput);
            await user.type(massInput, '500');

            const altitudeInput = screen.getByTestId('input-altitude');
            await user.clear(altitudeInput);
            await user.type(altitudeInput, '600');

            // Submit form
            const submitButton = screen.getByRole('button', { name: 'Create' });
            await user.click(submitButton);

            await waitFor(() => {
                expect(mockOnCreateSatellite).toHaveBeenCalledWith({
                    mode: 'latlon',
                    name: 'Test Satellite',
                    mass: 500,
                    size: 1,
                    ballisticCoefficient: 100,
                    latitude: 0,
                    longitude: 0,
                    altitude: 600,
                    azimuth: 90,
                    velocity: 7.8,
                    angleOfAttack: 0,
                    planetNaifId: 399,
                    commsConfig: { preset: 'cubesat' }
                });
            });
        });

        test('should submit orbital satellite correctly', async () => {
            render(
                <SatelliteCreator 
                    onCreateSatellite={mockOnCreateSatellite}
                    availableBodies={mockAvailableBodies}
                    selectedBody={mockSelectedBody}
                />
            );

            // Switch to orbital mode
            const orbitalTab = screen.getByTestId('tab-orbital');
            await user.click(orbitalTab);

            // Fill out form
            const nameInput = screen.getByTestId('input-name');
            await user.clear(nameInput);
            await user.type(nameInput, 'Orbital Satellite');

            const smaInput = screen.getByTestId('input-semiMajorAxis');
            await user.clear(smaInput);
            await user.type(smaInput, '7000');

            const eccInput = screen.getByTestId('input-eccentricity');
            await user.clear(eccInput);
            await user.type(eccInput, '0.1');

            // Submit form
            const submitButton = screen.getByRole('button', { name: 'Create' });
            await user.click(submitButton);

            await waitFor(() => {
                expect(mockOnCreateSatellite).toHaveBeenCalledWith({
                    mode: 'orbital',
                    name: 'Orbital Satellite',
                    mass: 100,
                    size: 1,
                    ballisticCoefficient: 100,
                    semiMajorAxis: 7000,
                    eccentricity: 0.1,
                    inclination: 51.6,
                    raan: 0,
                    argumentOfPeriapsis: 0,
                    trueAnomaly: 0,
                    referenceFrame: 'equatorial',
                    planetNaifId: 399,
                    commsConfig: { preset: 'cubesat' }
                });
            });
        });

        test('should handle circular velocity correctly', async () => {
            render(
                <SatelliteCreator 
                    onCreateSatellite={mockOnCreateSatellite}
                    availableBodies={mockAvailableBodies}
                    selectedBody={mockSelectedBody}
                />
            );

            // Enable circular velocity
            const circularCheckbox = screen.getByRole('checkbox', { name: 'circular' });
            await user.click(circularCheckbox);

            // Submit form
            const submitButton = screen.getByRole('button', { name: 'Create' });
            await user.click(submitButton);

            await waitFor(() => {
                const callArgs = mockOnCreateSatellite.mock.calls[0][0];
                expect(callArgs.velocity).toBeUndefined(); // Should be undefined for circular
            });
        });

        test('should reset name field after successful submission', async () => {
            render(
                <SatelliteCreator 
                    onCreateSatellite={mockOnCreateSatellite}
                    availableBodies={mockAvailableBodies}
                    selectedBody={mockSelectedBody}
                />
            );

            const nameInput = screen.getByTestId('input-name');
            await user.clear(nameInput);
            await user.type(nameInput, 'Test Satellite');

            const submitButton = screen.getByRole('button', { name: 'Create' });
            await user.click(submitButton);

            await waitFor(() => {
                expect(nameInput.value).toBe('');
            });
        });

        test('should handle submission errors gracefully', async () => {
            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            mockOnCreateSatellite.mockRejectedValue(new Error('Creation failed'));

            render(
                <SatelliteCreator 
                    onCreateSatellite={mockOnCreateSatellite}
                    availableBodies={mockAvailableBodies}
                    selectedBody={mockSelectedBody}
                />
            );

            const submitButton = screen.getByRole('button', { name: 'Create' });
            await user.click(submitButton);

            await waitFor(() => {
                expect(consoleErrorSpy).toHaveBeenCalledWith('Error creating satellite:', expect.any(Error));
            });

            consoleErrorSpy.mockRestore();
        });
    });

    describe('Section Collapsing', () => {
        test('should toggle section visibility', async () => {
            render(
                <SatelliteCreator 
                    onCreateSatellite={mockOnCreateSatellite}
                    availableBodies={mockAvailableBodies}
                    selectedBody={mockSelectedBody}
                />
            );

            // Structure section should be open by default
            expect(screen.getByTestId('input-mass')).toBeInTheDocument();

            // Click to collapse
            const structureSection = screen.getByText('Structure & Mass Properties');
            await user.click(structureSection);

            // Should be collapsed (inputs not visible)
            expect(screen.queryByTestId('input-mass')).not.toBeInTheDocument();

            // Click to expand again
            await user.click(structureSection);

            // Should be expanded again
            expect(screen.getByTestId('input-mass')).toBeInTheDocument();
        });

        test('should show correct expand/collapse indicators', async () => {
            render(
                <SatelliteCreator 
                    onCreateSatellite={mockOnCreateSatellite}
                    availableBodies={mockAvailableBodies}
                    selectedBody={mockSelectedBody}
                />
            );

            // Structure section should show '−' when expanded
            expect(screen.getByText('−')).toBeInTheDocument();

            // Click to collapse
            const structureSection = screen.getByText('Structure & Mass Properties');
            await user.click(structureSection);

            // Should show '+' when collapsed
            expect(screen.getByText('+')).toBeInTheDocument();
        });
    });

    describe('Accessibility', () => {
        test('should have proper form labels', () => {
            render(
                <SatelliteCreator 
                    onCreateSatellite={mockOnCreateSatellite}
                    availableBodies={mockAvailableBodies}
                    selectedBody={mockSelectedBody}
                />
            );

            expect(screen.getByLabelText(/Name/)).toBeInTheDocument();
            expect(screen.getByLabelText(/Mass.*kg/)).toBeInTheDocument();
            expect(screen.getByLabelText(/Size.*m/)).toBeInTheDocument();
        });

        test('should have required form fields', () => {
            render(
                <SatelliteCreator 
                    onCreateSatellite={mockOnCreateSatellite}
                    availableBodies={mockAvailableBodies}
                    selectedBody={mockSelectedBody}
                />
            );

            const nameInput = screen.getByTestId('input-name');
            const massInput = screen.getByTestId('input-mass');

            expect(nameInput.required).toBe(true);
            expect(massInput.required).toBe(true);
        });

        test('should have proper form structure', () => {
            render(
                <SatelliteCreator 
                    onCreateSatellite={mockOnCreateSatellite}
                    availableBodies={mockAvailableBodies}
                    selectedBody={mockSelectedBody}
                />
            );

            const form = screen.getByRole('form');
            const submitButton = screen.getByRole('button', { name: 'Create' });

            expect(form).toBeInTheDocument();
            expect(submitButton.type).toBe('submit');
        });
    });

    describe('Edge Cases', () => {
        test('should handle empty available bodies', () => {
            render(
                <SatelliteCreator 
                    onCreateSatellite={mockOnCreateSatellite}
                    availableBodies={[]}
                    selectedBody={null}
                />
            );

            expect(screen.getByText('Select Body')).toBeInTheDocument();
        });

        test('should handle invalid numeric inputs', async () => {
            render(
                <SatelliteCreator 
                    onCreateSatellite={mockOnCreateSatellite}
                    availableBodies={mockAvailableBodies}
                    selectedBody={mockSelectedBody}
                />
            );

            const massInput = screen.getByTestId('input-mass');
            
            // Try to enter non-numeric value
            await user.clear(massInput);
            await user.type(massInput, 'abc');

            // Should keep previous valid value
            expect(massInput.value).toBe('100'); // Previous value should be maintained
        });

        test('should disable velocity input when circular is checked', async () => {
            render(
                <SatelliteCreator 
                    onCreateSatellite={mockOnCreateSatellite}
                    availableBodies={mockAvailableBodies}
                    selectedBody={mockSelectedBody}
                />
            );

            const velocityInput = screen.getByTestId('input-velocity');
            const circularCheckbox = screen.getByRole('checkbox', { name: 'circular' });

            expect(velocityInput.disabled).toBe(false);

            await user.click(circularCheckbox);

            expect(velocityInput.disabled).toBe(true);
        });

        test('should uncheck circular when velocity is manually changed', async () => {
            render(
                <SatelliteCreator 
                    onCreateSatellite={mockOnCreateSatellite}
                    availableBodies={mockAvailableBodies}
                    selectedBody={mockSelectedBody}
                />
            );

            const velocityInput = screen.getByTestId('input-velocity');
            const circularCheckbox = screen.getByRole('checkbox', { name: 'circular' });

            // First check circular
            await user.click(circularCheckbox);
            expect(circularCheckbox.checked).toBe(true);

            // Then manually change velocity
            await user.clear(velocityInput);
            await user.type(velocityInput, '8.0');

            // Circular should be unchecked
            expect(circularCheckbox.checked).toBe(false);
        });
    });
});