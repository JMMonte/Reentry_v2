import React, { useState, useEffect, useMemo } from 'react';
import { useLoadingProgress } from '@/hooks/useLoadingProgress';

/**
 * Clean, minimal loading screen component - mobile friendly
 */
const LoadingScreen = React.memo(function LoadingScreen() {
    const [backgroundImage, setBackgroundImage] = useState('');

    // Get centralized loading progress
    const { progress: totalProgress, stage: loadingStage, isComplete: isLoadingComplete } = useLoadingProgress();

    // Memoized NASA and Cassini space images for background
    const spaceImages = useMemo(() => [
        "/assets/images/jupiter_nasa.jpg",
        "/assets/images/space_nasa.jpg",
        "/assets/images/mars_nasa.jpg",
        "/assets/images/tethys_nasa.jpg",
        "/assets/images/saturn_cassini.jpg",
        "/assets/images/earth_NASA.jpg"
    ], []);

    // Select random background image on mount
    useEffect(() => {
        const randomIndex = Math.floor(Math.random() * spaceImages.length);
        setBackgroundImage(spaceImages[randomIndex]);
    }, [spaceImages]);

    // Auto-hide when loading is complete
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        if (isLoadingComplete) {
            const timer = setTimeout(() => {
                setIsVisible(false);
            }, 800);
            return () => clearTimeout(timer);
        }
    }, [isLoadingComplete]);

    if (!isVisible && isLoadingComplete) {
        return null;
    }

    return (
        <div
            className={`fixed inset-0 bg-black text-white overflow-hidden transition-opacity duration-1000 ${
                isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
            style={{ zIndex: 10001 }}
        >
            {/* Background image */}
            {backgroundImage && (
                <div
                    className="absolute inset-0"
                    style={{
                        backgroundImage: `url(${backgroundImage})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        backgroundRepeat: 'no-repeat'
                    }}
                />
            )}

            {/* Main content */}
            <div className="flex flex-col h-full relative z-10">

                {/* Top progress bar */}
                <div className="w-full h-1 bg-zinc-900">
                    <div
                        className="h-full bg-white transition-all duration-500"
                        style={{ width: `${totalProgress}%` }}
                    />
                </div>

                {/* Top left logo */}
                <div className="absolute top-4 left-4 sm:top-6 sm:left-6">
                    <h1 className="text-xl sm:text-2xl font-bold tracking-wider">DARKSUN</h1>
                </div>

                {/* Empty center space for clean look */}
                <div className="flex-1"></div>

                {/* Bottom footer with loading info */}
                <div className="bg-black/70 border-t border-zinc-800/50 px-4 sm:px-6 py-3 sm:py-4">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end space-y-3 sm:space-y-0">

                        {/* Left: Description and loading status */}
                        <div className="space-y-1 sm:space-y-2">
                            {/* Always show description */}
                            <div className="text-xs text-zinc-400 leading-relaxed max-w-xs sm:max-w-md">
                                Accurate full N-body physics simulation for satellite mission modeling
                                <span className="hidden sm:inline"><br/>with complete solar system dynamics and AI mission planning assistance</span>
                                <span className="sm:hidden"> with solar system dynamics and AI assistance</span>
                            </div>
                            <div className="flex items-center space-x-4">
                                <div className="text-white text-sm">
                                    {loadingStage}
                                </div>
                                <div className="flex items-center space-x-2">
                                    <div className="text-zinc-500 text-xs font-mono">
                                        {Math.round(totalProgress)}%
                                    </div>
                                    {/* Spinner */}
                                    {!isLoadingComplete && (
                                        <div className="w-3 h-3 border border-zinc-500 border-t-white rounded-full animate-spin"></div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Right: Technical stats - always show */}
                        <div className="text-xs text-zinc-500 font-mono text-left sm:text-right">
                            <div>v2.0</div>
                            <div className="hidden sm:block">Solar System Barycentric Reference Frame</div>
                            <div className="sm:hidden">Barycentric Reference Frame</div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
});

LoadingScreen.propTypes = {
    // No props needed - uses centralized state
};

export default LoadingScreen; 