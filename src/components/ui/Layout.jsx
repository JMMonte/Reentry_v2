import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import LoadingScreen from './LoadingScreen';
import { Brain } from 'lucide-react';
import { useToast } from './Toast';

// SatelliteCreatorModal
const SatelliteCreatorModal = React.memo(function SatelliteCreatorModal({ isOpen, onClose, onCreate, availableBodies, selectedBody }) {
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
});
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
const ShareModal = React.memo(function ShareModal({ isOpen, onClose, shareUrl, shareCopied, onCopy, onShareEmail }) {
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
});
ShareModal.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    shareUrl: PropTypes.string.isRequired,
    shareCopied: PropTypes.bool.isRequired,
    onCopy: PropTypes.func.isRequired,
    onShareEmail: PropTypes.func.isRequired
};

// Memoized components that don't need real-time simulation updates
const MemoizedSatelliteListWindow = React.memo(SatelliteListWindow);
const MemoizedSatelliteCreatorModal = React.memo(SatelliteCreatorModal);
const MemoizedShareModal = React.memo(ShareModal);
const MemoizedAuthModal = React.memo(AuthModal);

// Main Layout component with React.memo and comprehensive performance improvements
export const Layout = React.memo(function Layout({
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
    satellitesPhysics = {},
    celestialBodies = [],
    onBodySelect
}) {
    const { showToast } = useToast();
    const [resetModalOpen, setResetModalOpen] = useState(false);
    const [maneuverSat, setManeuverSat] = useState(null);
    const handleOpenManeuver = useCallback((satellite) => setManeuverSat(satellite), []);
    const [showIntro, setShowIntro] = useState(false);
    const [currentSlide, setCurrentSlide] = useState(0);
    const [isMobile, setIsMobile] = useState(false);

    // Memoized intro slides data to prevent recreation on every render
    const introSlides = useMemo(() => [
        {
            title: "Welcome to Darksun",
            content: "Professional orbital mechanics simulation for satellite constellation design, interplanetary missions, and space communication networks.",
            image: "/assets/images/Screenshot 2025-04-22 at 22.44.48.png"
        },
        {
            title: "Satellite Operations",
            content: "Create satellites, plan maneuvers, and monitor subsystems including power, thermal, communications, and propulsion systems.",
            image: "/assets/images/Screenshot 2025-04-25 at 02.20.23.png"
        },
        {
            title: "Mission Planning",
            content: "Design interplanetary transfers, gravity assists, and complex trajectories with AI-powered mission planning assistance.",
            image: "/assets/images/Screenshot 2025-04-25 at 02.22.55.png"
        }
    ], []);

    // Memoized event handlers to prevent recreation
    const handleDismissIntro = useCallback(() => {
        localStorage.setItem('introShown', 'true');
        setShowIntro(false);
        setCurrentSlide(0);
    }, []);

    const handleOpenAI = useCallback(() => {
        handleDismissIntro();
        if (navbarProps?.onChatToggle) {
            navbarProps.onChatToggle();
        }
    }, [handleDismissIntro, navbarProps?.onChatToggle]);

    const handleNextSlide = useCallback(() => {
        if (currentSlide < introSlides.length - 1) {
            setCurrentSlide(currentSlide + 1);
        } else {
            handleDismissIntro();
        }
    }, [currentSlide, introSlides.length, handleDismissIntro]);

    const handlePrevSlide = useCallback(() => {
        if (currentSlide > 0) {
            setCurrentSlide(currentSlide - 1);
        }
    }, [currentSlide]);

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
        if (typeof window !== 'undefined' && !localStorage.getItem('introShown')) {
            // Show intro when ready (loading will be handled by LoadingScreen component)
            const timer = setTimeout(() => {
                setShowIntro(true);
            }, 2000); // Give loading screen time to complete
            return () => clearTimeout(timer);
        }
    }, []);

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
        <>
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

            {/* Centralized Loading Screen */}
            <LoadingScreen />

            <ModalPortal>
                <ChatModal {...chatModalProps} />
                <DisplayOptions {...displayOptionsProps} />

                {/* Only render debug windows when they exist and have valid satellites */}
                {debugWindows?.map(({ id, satellite, onClose }) => {
                    // Only render if satellite exists and has valid data
                    if (!satellite?.id) return null;

                    const physicsData = satellitesPhysics?.[satellite.id];
                    const earth = celestialBodies?.find(body => body.naifId === 399);

                    return (
                        <SatelliteDebugWindow
                            key={id}
                            satellite={satellite}
                            earth={earth}
                            onBodySelect={onBodySelect}
                            onClose={onClose}
                            onOpenManeuver={handleOpenManeuver}
                            physics={physicsData}
                            celestialBodies={celestialBodies}
                        />
                    );
                })}

                {/* Only render when visible */}
                {satelliteListWindowProps?.isOpen && (
                    <MemoizedSatelliteListWindow
                        {...satelliteListWindowProps}
                        onOpenManeuver={handleOpenManeuver}
                        onCreateSatellite={satelliteCreatorModalProps.onCreate}
                    />
                )}

                {/* Only render when visible */}
                {satelliteCreatorModalProps?.isOpen && (
                    <MemoizedSatelliteCreatorModal {...satelliteCreatorModalProps} />
                )}

                {/* Only render when visible */}
                {shareModalProps?.isOpen && (
                    <MemoizedShareModal {...shareModalProps} />
                )}

                {/* Only render when visible */}
                {authModalProps?.isOpen && (
                    <MemoizedAuthModal {...authModalProps} />
                )}

                {/* SimulationWindow needs simulation updates - render conditionally but don't memoize */}
                {simulationWindowProps?.isOpen && (
                    <SimulationWindow {...simulationWindowProps} />
                )}

                {/* GroundTrackWindow needs simulation updates - render conditionally but don't memoize */}
                {groundTrackWindowProps?.isOpen && (
                    <GroundTrackWindow
                        {...groundTrackWindowProps}
                        planets={window.app3d?.celestialBodies || []}
                    />
                )}

                {/* Only render when maneuver satellite is selected */}
                {maneuverSat && (
                    <SatelliteManeuverWindow
                        satellite={maneuverSat}
                        onClose={() => setManeuverSat(null)}
                    />
                )}

                {/* Render a modal for each selected point - only when they exist */}
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
                                <div className={`bg-zinc-900/30 border border-zinc-800 rounded overflow-hidden ${isMobile ? 'h-48 flex-shrink-0' : ''
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
                                <div className={`flex flex-col justify-center space-y-4 ${isMobile ? 'flex-1' : ''
                                    }`}>
                                    <h2 className={`font-semibold text-white ${isMobile ? 'text-lg' : 'text-xl'
                                        }`}>
                                        {introSlides[currentSlide].title}
                                    </h2>

                                    <p className="text-sm text-zinc-300 leading-relaxed">
                                        {introSlides[currentSlide].content}
                                    </p>
                                </div>
                            </div>

                            {/* Navigation */}
                            <div className={`pt-4 border-t border-zinc-800 ${isMobile ? 'flex flex-col space-y-3' : 'flex items-center justify-between'
                                }`}>
                                <div className={`flex gap-2 ${isMobile ? 'justify-center' : ''
                                    }`}>
                                    {introSlides.map((_, index) => (
                                        <div
                                            key={index}
                                            className={`w-2 h-2 rounded-full transition-colors ${index === currentSlide ? 'bg-white' : 'bg-zinc-600'
                                                }`}
                                        />
                                    ))}
                                </div>

                                <div className={`flex gap-2 ${isMobile ? 'justify-center' : ''
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
        </>
    );
});

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

    satellitesPhysics: PropTypes.object,
    groundTrackData: PropTypes.shape({
        poiData: PropTypes.object,
        tracks: PropTypes.object,
        planet: PropTypes.object
    }),
    celestialBodies: PropTypes.array,
    onBodySelect: PropTypes.func
}; 