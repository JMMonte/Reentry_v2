import React from 'react';
import { Button } from '../button';
import { Rocket, Settings2, Brain, List, Share, Activity, Globe } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../tooltip';
import PropTypes from 'prop-types';

function ActionButtons({ onSatelliteCreatorToggle, onDisplayOptionsToggle, onChatToggle, onSatelliteListToggle, handleShareToggle, onSimulationToggle, onGroundtrackToggle }) {
    return (
        <>
            <TooltipProvider>
                {/* Create Satellite Button */}
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onSatelliteCreatorToggle}
                        >
                            <Rocket className="h-4 w-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Create New Satellite</TooltipContent>
                </Tooltip>
                {/* Display Options Button */}
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onDisplayOptionsToggle}
                        >
                            <Settings2 className="h-4 w-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Display Options</TooltipContent>
                </Tooltip>
            </TooltipProvider>
            {/* Toggle Chat Button at right edge */}
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onChatToggle}
                        >
                            <Brain className="h-4 w-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Toggle AI Chat</TooltipContent>
                </Tooltip>
            </TooltipProvider>
            {/* Toggle Satellite List Button at right edge */}
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onSatelliteListToggle}
                        >
                            <List className="h-4 w-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Toggle Satellite List</TooltipContent>
                </Tooltip>
            </TooltipProvider>
            {/* Share State Button at right edge */}
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleShareToggle}
                        >
                            <Share className="h-4 w-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Share State</TooltipContent>
                </Tooltip>
            </TooltipProvider>
            {/* Simulation Data Button */}
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onSimulationToggle}
                        >
                            <Activity className="h-4 w-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Simulation</TooltipContent>
                </Tooltip>
            </TooltipProvider>
            {/* Groundtrack Button */}
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onGroundtrackToggle}
                        >
                            <Globe className="h-4 w-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Groundtrack</TooltipContent>
                </Tooltip>
            </TooltipProvider>
        </>
    );
}

ActionButtons.propTypes = {
    onSatelliteCreatorToggle: PropTypes.func.isRequired,
    onDisplayOptionsToggle: PropTypes.func.isRequired,
    onChatToggle: PropTypes.func.isRequired,
    onSatelliteListToggle: PropTypes.func.isRequired,
    handleShareToggle: PropTypes.func.isRequired,
    onSimulationToggle: PropTypes.func.isRequired,
    onGroundtrackToggle: PropTypes.func.isRequired,
};

export default ActionButtons; 