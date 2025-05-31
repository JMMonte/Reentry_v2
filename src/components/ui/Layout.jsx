import React, { useState, createContext, useRef, forwardRef, useImperativeHandle, useEffect } from 'react';
import { Navbar } from './navbar/Navbar';
import { ModalPortal } from './modal/ModalPortal';
import { AuthModal } from './auth/AuthModal';
import { ChatModal } from './chat/Modal';
import { DisplayOptions } from './controls/DisplayOptions';
import { SatelliteDebugWindow } from './satellite/SatelliteDebugWindow';
import { SatelliteListWindow } from './satellite/SatelliteListWindow';
import { DraggableModal } from './modal/DraggableModal';
import SatelliteCreator from './satellite/SatelliteCreator';
import PropTypes from 'prop-types';
import { ResetPasswordModal } from './auth/ResetPasswordModal';
import { SimulationWindow } from './simulation/SimulationWindow';
import { SatelliteManeuverWindow } from './satellite/SatelliteManeuverWindow';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './dropdown-menu';
import { Button } from './button';
import { GroundTrackWindow } from './groundtrack/GroundTrackWindow';

// Toast logic
export const ToastContext = createContext({ showToast: () => { } });

const Toast = forwardRef((props, ref) => {
    const [visible, setVisible] = useState(false);
    const [internalMessage, setInternalMessage] = useState('');
    const hideTimeout = useRef();

    useImperativeHandle(ref, () => ({
        showToast: (msg) => {
            setInternalMessage(msg);
            setVisible(true);
            if (hideTimeout.current) clearTimeout(hideTimeout.current);
            hideTimeout.current = setTimeout(() => {
                setVisible(false);
                hideTimeout.current = setTimeout(() => setInternalMessage(''), 500);
            }, 4000);
        }
    }), []);

    React.useEffect(() => {
        return () => hideTimeout.current && clearTimeout(hideTimeout.current);
    }, []);

    const handleClose = () => {
        if (hideTimeout.current) clearTimeout(hideTimeout.current);
        setVisible(false);
        setTimeout(() => setInternalMessage(''), 500);
    };

    return (
        <div
            style={{
                position: 'fixed',
                left: 0,
                right: 0,
                bottom: 32,
                display: 'flex',
                justifyContent: 'center',
                zIndex: 10000,
                pointerEvents: 'none',
            }}
        >
            {internalMessage && (
                <div
                    className={`transition-all duration-500 ease-in-out transform ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'} shadow-lg flex items-center justify-center`}
                    style={{
                        background: 'linear-gradient(90deg, #232526 0%, #414345 100%)',
                        color: '#fff',
                        padding: '10px 24px 10px 18px',
                        borderRadius: 12,
                        fontSize: 14,
                        fontWeight: 500,
                        boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
                        minWidth: 180,
                        textAlign: 'center',
                        letterSpacing: 0.2,
                        pointerEvents: 'auto',
                        position: 'relative',
                        maxWidth: 340,
                    }}
                >
                    <span style={{ flex: 1, fontSize: 14 }}>{internalMessage}</span>
                    <button
                        onClick={handleClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: '#fff',
                            fontSize: 18,
                            marginLeft: 12,
                            cursor: 'pointer',
                            pointerEvents: 'auto',
                            lineHeight: 1,
                        }}
                        aria-label="Close toast"
                    >
                        ×
                    </button>
                </div>
            )}
        </div>
    );
});
Toast.displayName = 'Toast';
Toast.propTypes = {};

// SatelliteCreatorModal
function SatelliteCreatorModal({ isOpen, onClose, onCreate, availableBodies, selectedBody }) {
    const satelliteCreatorRef = React.useRef();
    return (
        <DraggableModal
            title="Create Satellite"
            isOpen={isOpen}
            onClose={onClose}
            defaultWidth={350}
            defaultHeight={650}
            minWidth={300}
            minHeight={300}
            resizable={true}
        >
            <SatelliteCreator ref={satelliteCreatorRef} onCreateSatellite={onCreate} availableBodies={availableBodies} selectedBody={selectedBody} />
        </DraggableModal>
    );
}
SatelliteCreatorModal.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    onCreate: PropTypes.func.isRequired,
    availableBodies: PropTypes.array,
    selectedBody: PropTypes.shape({
        name: PropTypes.string.isRequired,
        naifId: PropTypes.number.isRequired
    })
};

// ShareModal
function ShareModal({ isOpen, onClose, shareUrl, shareCopied, onCopy, onShareEmail }) {
    return (
        <DraggableModal
            title="Share Simulation State"
            isOpen={isOpen}
            onClose={onClose}
            defaultWidth={380}
            defaultHeight={170}
            minWidth={260}
            minHeight={120}
            defaultPosition={{ x: window.innerWidth / 2 - 190, y: 120 }}
        >
            <div className="flex flex-col gap-2 text-xs">
                <label htmlFor="share-url" className="font-medium text-xs">Shareable URL:</label>
                <div className="flex gap-1 items-center">
                    <input
                        id="share-url"
                        type="text"
                        value={shareUrl}
                        readOnly
                        className="flex-1 px-2 py-1 border rounded bg-muted text-xs font-mono h-7"
                        onFocus={e => e.target.select()}
                        style={{ minWidth: 0 }}
                    />
                    <button className="btn btn-outline btn-sm text-xs px-2 h-7" onClick={onCopy}>
                        {shareCopied ? 'Copied!' : 'Copy'}
                    </button>
                </div>
                <button className="btn btn-outline btn-sm text-xs px-2 h-7 w-full" onClick={onShareEmail}>
                    Share via Email
                </button>
            </div>
        </DraggableModal>
    );
}
ShareModal.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    shareUrl: PropTypes.string.isRequired,
    shareCopied: PropTypes.bool.isRequired,
    onCopy: PropTypes.func.isRequired,
    onShareEmail: PropTypes.func.isRequired
};


export function Layout({
    groundTrackWindowProps,
    children,
    navbarProps,
    chatModalProps,
    displayOptionsProps,
    debugWindows,
    satelliteListWindowProps,
    satelliteCreatorModalProps,
    shareModalProps,
    authModalProps,
    simulationWindowProps,
    earthPointModalProps,
    isLoadingInitialData,
    loadingProgress = 0,
    loadingStage = 'Initializing...',
    satellitesPhysics = {}
}) {
    const toastRef = useRef();
    const showToast = (msg) => {
        toastRef.current?.showToast(msg);
    };
    const [resetModalOpen, setResetModalOpen] = useState(false);
    const [maneuverSat, setManeuverSat] = useState(null);
    const handleOpenManeuver = (satellite) => setManeuverSat(satellite);
    const [showIntro, setShowIntro] = useState(false);

    // Removed duplicate usePhysicsSatellites() call - now passed as prop for better performance

    useEffect(() => {
        if (typeof window !== 'undefined' && !localStorage.getItem('introShown')) {
            setShowIntro(true);
        }
    }, []);

    const handleDismissIntro = () => {
        localStorage.setItem('introShown', 'true');
        setShowIntro(false);
    };

    // Open reset modal if URL contains type=recovery and access_token
    useEffect(() => {
        function getRecoveryParams() {
            // Try search params
            let params = new URLSearchParams(window.location.search);
            if (params.get('type') === 'recovery' && params.get('access_token')) return true;
            // Try hash fragment
            if (window.location.hash) {
                const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
                params = new URLSearchParams(hash);
                if (params.get('type') === 'recovery' && params.get('access_token')) return true;
            }
            return false;
        }
        if (getRecoveryParams()) {
            setResetModalOpen(true);
        }
    }, []);

    return (
        <ToastContext.Provider value={{ showToast }}>
            <Navbar {...navbarProps} />
            <main>{children}</main>

            {/* Loading Spinner Overlay */}
            {isLoadingInitialData && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    backgroundColor: 'rgba(0, 0, 0, 0.8)', 
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    zIndex: 9999, 
                    color: 'white',
                    fontSize: '16px',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
                }}>
                    <style>
                        {`
                            @keyframes progressOpacity {
                                0%, 100% {
                                    opacity: 0.5;
                                }
                                50% {
                                    opacity: 1;
                                }
                            }
                        `}
                    </style>
                    
                    {/* Current Stage Message */}
                    <span style={{ 
                        marginBottom: '20px', 
                        letterSpacing: '0.5px',
                        fontSize: '18px',
                        fontWeight: '500'
                    }}>
                        {loadingStage}
                    </span>
                    
                    {/* Progress Bar Container */}
                    <div style={{
                        width: '300px',
                        height: '8px',
                        backgroundColor: 'rgba(255, 255, 255, 0.1)',
                        borderRadius: '4px',
                        overflow: 'hidden',
                        marginBottom: '10px',
                        position: 'relative',
                        border: '1px solid rgba(255, 255, 255, 0.2)'
                    }}>
                        {/* Progress Bar Fill */}
                        <div style={{
                            width: `${loadingProgress}%`,
                            height: '100%',
                            background: '#ffffff',
                            borderRadius: '3px',
                            transition: 'width 0.5s ease',
                            animation: loadingProgress < 100 ? 'progressOpacity 1.5s ease-in-out infinite' : 'none'
                        }}></div>
                    </div>
                    
                    {/* Progress Percentage */}
                    <span style={{
                        fontSize: '14px',
                        opacity: 0.8,
                        letterSpacing: '0.3px'
                    }}>
                        {Math.round(loadingProgress)}%
                    </span>
                </div>
            )}

            <ModalPortal>
                <ChatModal {...chatModalProps} />
                <DisplayOptions {...displayOptionsProps} />
                {debugWindows && debugWindows.map(({ id, satellite, earth, onBodySelect, onClose }) => {
                    // console.log('[Layout] Rendering SatelliteDebugWindow for id:', id, 'satellitesPhysics keys:', Object.keys(satellitesPhysics));
                    return (
                        <SatelliteDebugWindow
                            key={id}
                            satellite={satellite}
                            earth={earth}
                            onBodySelect={onBodySelect}
                            onClose={onClose}
                            onOpenManeuver={handleOpenManeuver}
                            physics={satellitesPhysics?.[String(id)]}
                        />
                    );
                })}
                <SatelliteListWindow {...satelliteListWindowProps} onOpenManeuver={handleOpenManeuver} />
                <SatelliteCreatorModal {...satelliteCreatorModalProps} />
                <ShareModal {...shareModalProps} />
                <AuthModal {...authModalProps} />
                <SimulationWindow {...simulationWindowProps} />
                {groundTrackWindowProps &&
                    <GroundTrackWindow
                        {...groundTrackWindowProps}
                        planets={window.app3d?.planets || []}
                    />
                }
                {maneuverSat && (
                    <SatelliteManeuverWindow
                        satellite={maneuverSat}
                        onClose={() => setManeuverSat(null)}
                    />
                )}
                {/* Render a modal for each selected point */}
                {earthPointModalProps?.openModals?.map(({ feature, category }, idx) => {
                    const featureProps = feature.properties || {};
                    const name = featureProps.name || featureProps.NAME || category;
                    return (
                        <DraggableModal
                            key={`pointmodal-${category}-${idx}`}
                            title={name}
                            isOpen={true}
                            onClose={() => earthPointModalProps.onToggle(feature, category)}
                            defaultWidth={300}
                            defaultHeight={200}
                            minWidth={200}
                            minHeight={100}
                            resizable={true}
                        >
                            <div className="space-y-1">
                                {Object.entries(featureProps).map(([key, val]) => (
                                    <div key={key} className="flex items-center justify-between px-2 py-1 text-[11px] text-muted-foreground">
                                        <span className="font-semibold">{key}</span>
                                        <span>{String(val)}</span>
                                    </div>
                                ))}
                            </div>
                        </DraggableModal>
                    );
                })}
                {/* Intro modal */}
                {showIntro && (
                    <div className="fixed bottom-4 left-4 z-50 max-w-xs w-64 bg-white dark:bg-gray-800 text-black dark:text-white p-4 rounded-lg shadow-lg">
                        <button
                            className="absolute top-2 right-2 text-xl font-bold leading-none"
                            onClick={handleDismissIntro}
                            aria-label="Close intro"
                        >
                            ×
                        </button>
                        <h2 className="text-lg font-semibold mb-2">Welcome to Darksun!</h2>
                        <p className="text-sm">
                            This simulation tool lets you explore satellites in 3D. Use the navbar to create satellites, add maneuvers, talk with the AI helper chat, satellite list, and display options. Click on Earth points for more information.
                        </p>
                        <div className="mt-3 flex justify-end">
                            <Button size="sm" onClick={handleDismissIntro}>Got it!</Button>
                        </div>
                    </div>
                )}
                <ResetPasswordModal isOpen={resetModalOpen} onClose={() => setResetModalOpen(false)} showToast={showToast} />
            </ModalPortal>
            <Toast ref={toastRef} />
        </ToastContext.Provider>
    );
}

Layout.propTypes = {
    children: PropTypes.node,
    navbarProps: PropTypes.object.isRequired,
    chatModalProps: PropTypes.object.isRequired,
    displayOptionsProps: PropTypes.object.isRequired,
    debugWindows: PropTypes.array,
    satelliteListWindowProps: PropTypes.object.isRequired,
    satelliteCreatorModalProps: PropTypes.object.isRequired,
    shareModalProps: PropTypes.object.isRequired,
    authModalProps: PropTypes.object.isRequired,
    simulationWindowProps: PropTypes.shape({
        isOpen: PropTypes.bool.isRequired,
        onClose: PropTypes.func.isRequired,
        satellites: PropTypes.array
    }).isRequired,
    groundTrackWindowProps: PropTypes.shape({
        isOpen: PropTypes.bool.isRequired,
        onClose: PropTypes.func.isRequired
    }),
    earthPointModalProps: PropTypes.shape({
        openModals: PropTypes.arrayOf(
            PropTypes.shape({
                feature: PropTypes.object.isRequired,
                category: PropTypes.string.isRequired
            })
        ).isRequired,
        onToggle: PropTypes.func.isRequired
    }),
    isLoadingInitialData: PropTypes.bool.isRequired,
    loadingProgress: PropTypes.number,
    loadingStage: PropTypes.string,
    satellitesPhysics: PropTypes.object
}; 