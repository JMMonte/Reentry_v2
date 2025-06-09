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
import { Button } from './button';
import { GroundTrackWindow } from './groundtrack/GroundTrackWindow';
import EnhancedLoader from './EnhancedLoader';
import { Brain } from 'lucide-react';

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
    satellitesPhysics = {},
    groundTrackData
}) {
    const toastRef = useRef();
    const showToast = (msg) => {
        toastRef.current?.showToast(msg);
    };
    const [resetModalOpen, setResetModalOpen] = useState(false);
    const [maneuverSat, setManeuverSat] = useState(null);
    const handleOpenManeuver = (satellite) => setManeuverSat(satellite);
    const [showIntro, setShowIntro] = useState(false);
    const [currentSlide, setCurrentSlide] = useState(0);
    const [isMobile, setIsMobile] = useState(false);

    // Removed duplicate usePhysicsSatellites() call - now passed as prop for better performance

    // Check mobile on mount and resize
    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768);
        };
        
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    useEffect(() => {
        if (typeof window !== 'undefined' && !localStorage.getItem('introShown') && !isLoadingInitialData) {
            // Show intro only after loading is complete
            const timer = setTimeout(() => {
                setShowIntro(true);
            }, 1000); // Give fade-out time to complete
            return () => clearTimeout(timer);
        }
    }, [isLoadingInitialData]);

    // Intro slides data
    const introSlides = [
        {
            title: "Welcome to Darksun",
            content: "Professional orbital mechanics simulation for satellite constellation design, interplanetary missions, and space communication networks.",
            image: "/assets/images/Screenshot 2025-04-22 at 22.44.48.png" // Overview screenshot
        },
        {
            title: "Satellite Operations",
            content: "Create satellites, plan maneuvers, and monitor subsystems including power, thermal, communications, and propulsion systems.",
            image: "/assets/images/Screenshot 2025-04-25 at 02.20.23.png" // Satellite screenshot
        },
        {
            title: "Mission Planning", 
            content: "Design interplanetary transfers, gravity assists, and complex trajectories with AI-powered mission planning assistance.",
            image: "/assets/images/Screenshot 2025-04-25 at 02.22.55.png" // Mission planning screenshot
        }
    ];

    const handleDismissIntro = () => {
        localStorage.setItem('introShown', 'true');
        setShowIntro(false);
        setCurrentSlide(0);
    };

    const handleOpenAI = () => {
        handleDismissIntro();
        // Open the chat modal using the onClose function structure
        if (chatModalProps?.onClose) {
            // If onClose exists, we can infer the modal state setter
            // The chatModalProps.onClose is () => modalState.setIsChatVisible(false)
            // So we need to call the opposite - setIsChatVisible(true)
            // We'll trigger this through the navbar chat toggle
            if (navbarProps?.onChatToggle) {
                navbarProps.onChatToggle();
            }
        }
    };

    const handleNextSlide = () => {
        if (currentSlide < introSlides.length - 1) {
            setCurrentSlide(currentSlide + 1);
        } else {
            handleDismissIntro();
        }
    };

    const handlePrevSlide = () => {
        if (currentSlide > 0) {
            setCurrentSlide(currentSlide - 1);
        }
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
            
            {/* Darkmatter credit */}
            <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 pointer-events-none">
                <div className="text-xs font-mono mix-blend-difference text-white/50 pointer-events-auto flex items-center gap-1">
                    made with <Brain size={12} /> by{' '}
                    <a 
                        href="https://darkmatter.is" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="hover:underline"
                    >
                        Darkmatter
                    </a>
                </div>
            </div>

            {/* Enhanced Loading Overlay with fade-out */}
            <div 
                className={`transition-opacity duration-1000 ${
                    isLoadingInitialData ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
            >
                <EnhancedLoader 
                    loadingProgress={loadingProgress} 
                    loadingStage={loadingStage} 
                />
            </div>

            <ModalPortal>
                <ChatModal {...chatModalProps} />
                <DisplayOptions {...displayOptionsProps} />
                {debugWindows && debugWindows.map(({ id, satellite, earth, onBodySelect, onClose }) => {
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
                        planets={window.app3d?.celestialBodies || []}
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
                {/* Responsive Tutorial with Images */}
                {showIntro && (
                    <DraggableModal
                        title={`Getting Started (${currentSlide + 1}/${introSlides.length})`}
                        isOpen={true}
                        onClose={handleDismissIntro}
                        defaultPosition={{ 
                            x: isMobile ? 20 : Math.max(20, window.innerWidth / 2 - 350), 
                            y: isMobile ? 20 : Math.max(20, window.innerHeight / 2 - 200)
                        }}
                        defaultWidth={isMobile ? window.innerWidth - 40 : 700}
                        defaultHeight={isMobile ? window.innerHeight - 80 : 400}
                        minWidth={isMobile ? 300 : 600}
                        minHeight={isMobile ? 400 : 350}
                        resizable={!isMobile}
                    >
                        <div className="h-full flex flex-col space-y-4">
                            {/* Content Area */}
                            <div className={`flex-1 ${isMobile ? 'flex flex-col space-y-4' : 'grid grid-cols-2 gap-6'}`}>
                                {/* Image */}
                                <div className={`bg-zinc-900/30 border border-zinc-800 rounded overflow-hidden ${
                                    isMobile ? 'h-48 flex-shrink-0' : ''
                                }`}>
                                    <img 
                                        src={introSlides[currentSlide].image}
                                        alt={introSlides[currentSlide].title}
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                            // Fallback to a simple placeholder if image fails to load
                                            e.target.style.display = 'none';
                                            e.target.parentNode.innerHTML = `<div class="w-full h-full flex items-center justify-center text-zinc-500 ${isMobile ? 'text-4xl' : 'text-6xl'}">🛰️</div>`;
                                        }}
                                    />
                                </div>

                                {/* Text Content */}
                                <div className={`flex flex-col justify-center space-y-4 ${
                                    isMobile ? 'flex-1' : ''
                                }`}>
                                    <h2 className={`font-semibold text-white ${
                                        isMobile ? 'text-lg' : 'text-xl'
                                    }`}>
                                        {introSlides[currentSlide].title}
                                    </h2>
                                    
                                    <p className="text-sm text-zinc-300 leading-relaxed">
                                        {introSlides[currentSlide].content}
                                    </p>
                                </div>
                            </div>

                            {/* Navigation */}
                            <div className={`pt-4 border-t border-zinc-800 ${
                                isMobile ? 'flex flex-col space-y-3' : 'flex items-center justify-between'
                            }`}>
                                <div className={`flex gap-2 ${
                                    isMobile ? 'justify-center' : ''
                                }`}>
                                    {introSlides.map((_, index) => (
                                        <div
                                            key={index}
                                            className={`w-2 h-2 rounded-full transition-colors ${
                                                index === currentSlide ? 'bg-white' : 'bg-zinc-600'
                                            }`}
                                        />
                                    ))}
                                </div>

                                <div className={`flex gap-2 ${
                                    isMobile ? 'justify-center' : ''
                                }`}>
                                    {currentSlide > 0 && (
                                        <Button variant="ghost" size="sm" onClick={handlePrevSlide}>
                                            Previous
                                        </Button>
                                    )}
                                    
                                    {currentSlide === introSlides.length - 1 ? (
                                        <>
                                            <Button variant="outline" size="sm" onClick={handleOpenAI}>
                                                Talk with Darksun AI
                                            </Button>
                                            <Button size="sm" onClick={handleNextSlide}>
                                                Begin
                                            </Button>
                                        </>
                                    ) : (
                                        <Button size="sm" onClick={handleNextSlide}>
                                            Next
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </DraggableModal>
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
    satellitesPhysics: PropTypes.object,
    groundTrackData: PropTypes.shape({
        poiData: PropTypes.object,
        tracks: PropTypes.object,
        planet: PropTypes.object
    })
}; 