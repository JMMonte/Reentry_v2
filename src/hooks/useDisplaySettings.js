import { useState } from 'react';

export const useDisplaySettings = (app3dRef) => {
    const [isDisplayOptionsOpen, setIsDisplayOptionsOpen] = useState(false);

    const updateSetting = (key, value) => {
        const app = app3dRef.current;
        if (app?.displayManager) {
            app.displayManager.updateSetting(key, value);
            // Emit updated properties
            const updatedProps = app.displayManager.collectDisplayProperties();
            document.dispatchEvent(new CustomEvent('displayPropertiesUpdate', {
                detail: updatedProps
            }));
        }
    };

    return {
        isDisplayOptionsOpen,
        setIsDisplayOptionsOpen,
        updateSetting
    };
}; 