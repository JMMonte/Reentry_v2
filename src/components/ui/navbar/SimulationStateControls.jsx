import React, { useRef } from 'react';
import { Button } from '../Button';
import { Save, Upload } from 'lucide-react';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger
} from '../Tooltip';

/**
 * SimulationStateControls - Component for saving and loading simulation states
 */
export function SimulationStateControls() {
    const fileInputRef = useRef(null);

    // Handler for save button click
    const handleSaveState = () => {
        if (window.api && window.api.saveSimulationState) {
            window.api.saveSimulationState();
        } else {
            console.error('Save simulation state API not available');
        }
    };

    // Handler for load button click - this triggers the hidden file input
    const handleLoadButtonClick = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    // Handler for when a file is selected
    const handleFileChange = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        try {
            if (window.api && window.api.loadSimulationState) {
                const success = await window.api.loadSimulationState(file);
                if (success) {
                    console.log('Simulation state loaded successfully');
                } else {
                    console.error('Failed to load simulation state');
                }
            } else {
                console.error('Load simulation state API not available');
            }
        } catch (error) {
            console.error('Error loading simulation state:', error);
        }

        // Reset the file input so the same file can be selected again
        event.target.value = '';
    };

    return (
        <div className="flex items-center space-x-2">
            <TooltipProvider>
                {/* Save Button */}
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={handleSaveState}
                        >
                            <Save className="h-4 w-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Save Simulation State</TooltipContent>
                </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
                {/* Load Button */}
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={handleLoadButtonClick}
                        >
                            <Upload className="h-4 w-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Load Simulation State</TooltipContent>
                </Tooltip>
            </TooltipProvider>

            {/* Hidden file input for loading state files */}
            <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                accept=".json"
                onChange={handleFileChange}
            />
        </div>
    );
}

export default SimulationStateControls; 