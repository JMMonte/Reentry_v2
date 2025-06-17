import React, { useMemo, useCallback } from 'react';
import { Button } from '../button';
import { Plus, Settings, MessageSquare, List, Share2, BarChart, Map } from 'lucide-react';
import PropTypes from 'prop-types';

// OPTIMIZED PATTERN: Memoized ActionButtons component
const ActionButtons = React.memo(function ActionButtons({
    onSatelliteCreatorToggle,
    onDisplayOptionsToggle,
    onChatToggle,
    onSatelliteListToggle,
    handleShareToggle,
    onSimulationToggle,
    onGroundtrackToggle
}) {
    // Memoized button configurations to prevent recreation
    const buttonConfigs = useMemo(() => [
        {
            key: 'satellite-creator',
            icon: Plus,
            label: 'Create Satellite',
            onClick: onSatelliteCreatorToggle,
            variant: 'ghost',
            className: 'h-8 w-8 p-0'
        },
        {
            key: 'satellite-list',
            icon: List,
            label: 'Satellite List',
            onClick: onSatelliteListToggle,
            variant: 'ghost',
            className: 'h-8 w-8 p-0'
        },
        {
            key: 'display-options',
            icon: Settings,
            label: 'Display Options',
            onClick: onDisplayOptionsToggle,
            variant: 'ghost',
            className: 'h-8 w-8 p-0'
        },
        {
            key: 'chat',
            icon: MessageSquare,
            label: 'AI Assistant',
            onClick: onChatToggle,
            variant: 'ghost',
            className: 'h-8 w-8 p-0'
        },
        {
            key: 'groundtrack',
            icon: Map,
            label: 'Ground Track',
            onClick: onGroundtrackToggle,
            variant: 'ghost',
            className: 'h-8 w-8 p-0'
        },
        {
            key: 'share',
            icon: Share2,
            label: 'Share Simulation',
            onClick: handleShareToggle,
            variant: 'ghost',
            className: 'h-8 w-8 p-0'
        },
        {
            key: 'simulation',
            icon: BarChart,
            label: 'Simulation Window',
            onClick: onSimulationToggle,
            variant: 'ghost',
            className: 'h-8 w-8 p-0'
        }
    ], [
        onSatelliteCreatorToggle,
        onDisplayOptionsToggle,
        onChatToggle,
        onSatelliteListToggle,
        onGroundtrackToggle,
        handleShareToggle,
        onSimulationToggle
    ]);

    // Memoized button renderer to prevent recreation
    const renderButton = useCallback((config) => {
        const IconComponent = config.icon;
        return (
            <Button
                key={config.key}
                variant={config.variant}
                size="sm"
                onClick={config.onClick}
                className={config.className}
                title={config.label}
            >
                <IconComponent className="h-4 w-4" />
            </Button>
        );
    }, []);

    return (
        <div className="flex items-center space-x-2">
            {buttonConfigs.map(renderButton)}
        </div>
    );
});

ActionButtons.propTypes = {
    onSatelliteCreatorToggle: PropTypes.func.isRequired,
    onDisplayOptionsToggle: PropTypes.func.isRequired,
    onChatToggle: PropTypes.func.isRequired,
    onSatelliteListToggle: PropTypes.func.isRequired,
    handleShareToggle: PropTypes.func.isRequired,
    onSimulationToggle: PropTypes.func.isRequired,
    onGroundtrackToggle: PropTypes.func.isRequired
};

export default ActionButtons; 