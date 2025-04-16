import React from 'react';
import { Button } from '../button';
import { Save, Upload } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../dropdown-menu';
import PropTypes from 'prop-types';

function LogoMenu({ handleSaveState, importInputRef, onImportState }) {
    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="bg-black hover:bg-neutral-800 flex items-center justify-center p-0">
                        <img src="/favicon-32x32.png" alt="App Icon" style={{ height: 20, width: 20 }} />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={handleSaveState}>
                        <Save className="h-4 w-4 mr-2" /> Save State
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => importInputRef.current && importInputRef.current.click()}>
                        <Upload className="h-4 w-4 mr-2" /> Import State
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            <input
                ref={importInputRef}
                id="import-state-input"
                type="file"
                accept="application/json"
                style={{ display: 'none' }}
                onChange={onImportState}
            />
        </>
    );
}

LogoMenu.propTypes = {
    handleSaveState: PropTypes.func.isRequired,
    importInputRef: PropTypes.object.isRequired,
    onImportState: PropTypes.func.isRequired,
};

export default LogoMenu; 