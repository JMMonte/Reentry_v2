import { useEffect } from 'react';

/**
 * Custom hook to handle simulation-related events
 */
export function useSimulationEvents({
  setSimTime,
  setTimeWarpLoading,
  setIsSimReady,
  setIsAssetsLoaded,
  setOpenPointModals,
  setLoadingProgress,
  setLoadingStage,
  app3d
}) {
  
  // Time update events
  useEffect(() => {
    const timeHandler = (e) => {
      if (e.detail?.simulatedTime) {
        setSimTime(new Date(e.detail.simulatedTime));
      }
      if (e.detail?.timeWarp !== undefined) {
        setTimeWarpLoading(false);
      }
    };

    const timeWarpHandler = (e) => {
      if (e.detail?.newValue !== undefined) {
        setTimeWarpLoading(false);
      }
    };

    document.addEventListener('timeUpdate', timeHandler);
    document.addEventListener('simulationTimeChanged', timeHandler);
    document.addEventListener('timeWarpChanged', timeWarpHandler);
    
    // Set initial state from simulation controller or fallback to timeUtils
    if (app3d?.simulationController?.getSimulationTime) {
      setSimTime(app3d.simulationController.getSimulationTime());
    } else if (app3d?.timeUtils?.getSimulatedTime) {
      setSimTime(app3d.timeUtils.getSimulatedTime());
    }
    
    return () => {
      document.removeEventListener('timeUpdate', timeHandler);
      document.removeEventListener('simulationTimeChanged', timeHandler);
      document.removeEventListener('timeWarpChanged', timeWarpHandler);
    };
  }, [app3d, setSimTime, setTimeWarpLoading]);

  // Scene ready events
  useEffect(() => {
    const handleSceneReady = () => {
      setIsSimReady(true);
      setLoadingProgress(100);
      setLoadingStage('Ready to Explore!');
    };
    
    window.addEventListener('sceneReadyFromBackend', handleSceneReady);
    return () => window.removeEventListener('sceneReadyFromBackend', handleSceneReady);
  }, [setIsSimReady, setLoadingProgress, setLoadingStage]);

  // Assets loaded events
  useEffect(() => {
    const handleAssetsLoaded = () => {
      setIsAssetsLoaded(true);
      setLoadingProgress(50);
      setLoadingStage('Building Solar System...');
    };
    window.addEventListener('assetsLoaded', handleAssetsLoaded);
    return () => window.removeEventListener('assetsLoaded', handleAssetsLoaded);
  }, [setIsAssetsLoaded, setLoadingProgress, setLoadingStage]);

  // Loading progress events
  useEffect(() => {
    const handleLoadingProgress = (e) => {
      const { progress, stage } = e.detail;
      if (typeof progress === 'number') setLoadingProgress(progress);
      if (typeof stage === 'string') setLoadingStage(stage);
    };
    
    window.addEventListener('loadingProgress', handleLoadingProgress);
    return () => window.removeEventListener('loadingProgress', handleLoadingProgress);
  }, [setLoadingProgress, setLoadingStage]);

  // Earth point click events
  useEffect(() => {
    const onPointClick = (e) => {
      const { feature, category } = e.detail;
      setOpenPointModals(prev => {
        const isSame = prev.length === 1 && prev[0].feature === feature && prev[0].category === category;
        return isSame ? [] : [{ feature, category }];
      });
    };
    
    window.addEventListener('earthPointClick', onPointClick);
    return () => window.removeEventListener('earthPointClick', onPointClick);
  }, [setOpenPointModals]);
}