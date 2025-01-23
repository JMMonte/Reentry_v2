import { useState, useEffect } from 'react';

export const useDisplaySettings = (app3dRef) => {
    const [displaySettings, setDisplaySettings] = useState({});
    const [isDisplayOptionsOpen, setIsDisplayOptionsOpen] = useState(false);

    useEffect(() => {
        const app = app3dRef.current;
        if (!app || typeof app.updateDisplaySetting !== 'function') return;

        Object.entries(displaySettings).forEach(([key, value]) => {
            app.updateDisplaySetting(key, value);
        });
    }, [displaySettings, app3dRef]);

    const initializeDisplaySettings = () => {
        const app = app3dRef.current;
        if (app?.displayManager) {
            const props = app.displayManager.collectDisplayProperties();
            const initialSettings = {};
            Object.entries(props).forEach(([category, settings]) => {
                Object.entries(settings).forEach(([key, setting]) => {
                    initialSettings[key] = setting.value;
                });
            });
            setDisplaySettings(initialSettings);
        }
    };

    const updateSetting = (key, value) => {
        const app = app3dRef.current;
        if (app?.displayManager) {
            app.displayManager.updateSetting(key, value);
            setDisplaySettings(prev => ({ ...prev, [key]: value }));
        }
    };

    return {
        displaySettings,
        isDisplayOptionsOpen,
        setIsDisplayOptionsOpen,
        initializeDisplaySettings,
        updateSetting
    };
}; 