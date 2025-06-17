import { useState, useEffect, useCallback } from "react";
import { useDebouncePhysics } from "./useDebouncePhysics.js";

/**
 * Centralized loading progress hook that tracks all loading states
 * and provides a unified progress calculation
 */
export function useLoadingProgress() {
    const [progressState, setProgressState] = useState({
        sceneProgress: 0,
        assetsProgress: 0,
        physicsProgress: 0,
        overallStage: "Initializing...",
        isComplete: false,
    });

    const progressWeights = {
        scene: 40, // Scene setup and textures
        assets: 30, // Additional assets loading
        physics: 30, // Physics engine initialization
    };

    // Physics readiness handler with debouncing
    const handlePhysicsUpdate = useCallback((event) => {
        if (event.detail?.state?.isReady) {
            setProgressState((prev) => ({
                ...prev,
                physicsProgress: 100,
                overallStage: "Physics Engine Online",
            }));
        }
    }, []);

    // Use debounced physics handler for performance
    const debouncedPhysicsHandler = useDebouncePhysics(
        'statistics', // Use relaxed update strategy for loading progress
        handlePhysicsUpdate,
        [handlePhysicsUpdate]
    );

    // Listen to various progress events from different parts of the system
    useEffect(() => {
        // Scene loading progress from setupScene.js
        const handleLoadingProgress = (event) => {
            const { progress, stage } = event.detail;
            if (typeof progress === "number" && typeof stage === "string") {
                setProgressState((prev) => ({
                    ...prev,
                    sceneProgress: Math.min(100, progress),
                    overallStage: stage,
                }));
            }
        };

        // Assets loaded event
        const handleAssetsLoaded = () => {
            setProgressState((prev) => ({
                ...prev,
                assetsProgress: 100,
                overallStage: "Assets Loaded",
            }));
        };

        // Scene ready event - marks completion
        const handleSceneReady = () => {
            setProgressState((prev) => ({
                ...prev,
                sceneProgress: 100,
                assetsProgress: 100,
                physicsProgress: 100,
                overallStage: "System Ready",
                isComplete: true,
            }));
        };

        // Register event listeners
        window.addEventListener("loadingProgress", handleLoadingProgress);
        window.addEventListener("assetsLoaded", handleAssetsLoaded);
        document.addEventListener("simReady", handleSceneReady);
        window.addEventListener("sceneReadyFromBackend", handleSceneReady);

        // Use debounced physics handler instead of direct listener
        window.addEventListener("physicsUpdate", debouncedPhysicsHandler);

        return () => {
            window.removeEventListener("loadingProgress", handleLoadingProgress);
            window.removeEventListener("assetsLoaded", handleAssetsLoaded);
            document.removeEventListener("simReady", handleSceneReady);
            window.removeEventListener("sceneReadyFromBackend", handleSceneReady);
            window.removeEventListener("physicsUpdate", debouncedPhysicsHandler);
        };
    }, [debouncedPhysicsHandler]);

    // Calculate weighted overall progress
    const overallProgress = Math.min(
        100,
        (progressState.sceneProgress * progressWeights.scene) / 100 +
        (progressState.assetsProgress * progressWeights.assets) / 100 +
        (progressState.physicsProgress * progressWeights.physics) / 100
    );

    // Enhanced stage messages based on progress
    const getEnhancedStage = () => {
        if (progressState.isComplete) {
            return "Mission Control Online";
        }
        if (overallProgress >= 90) {
            return "Final System Checks...";
        }
        if (overallProgress >= 70) {
            return "Calibrating Orbital Mechanics...";
        }
        if (overallProgress >= 50) {
            return "Loading Physics Engine...";
        }
        if (overallProgress >= 20) {
            return "Building Solar System...";
        }
        return progressState.overallStage;
    };

    return {
        progress: Math.round(overallProgress),
        stage: getEnhancedStage(),
        isComplete: progressState.isComplete,
        breakdown: {
            scene: Math.round(progressState.sceneProgress),
            assets: Math.round(progressState.assetsProgress),
            physics: Math.round(progressState.physicsProgress),
        },
    };
}
