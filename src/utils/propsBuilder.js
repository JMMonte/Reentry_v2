/**
 * Utility functions to build props objects for components
 * This helps organize and type-check component props
 */

export function buildNavbarProps({
  modalState,
  selectedBody,
  handleBodyChange,
  groupedPlanetOptions,
  satelliteOptions,
  getDisplayValue,
  app3d,
  timeWarpLoading,
  simTime,
  handleSimulatedTimeChange,
  satellites,
  handleImportState,
  shareModalOpen,
  setShareModalOpen,
  setShareUrl,
  isAuthOpen,
  setIsAuthOpen,
  setAuthMode,
  isSimulationOpen,
  setIsSimulationOpen,
  planetOptions
}) {
  return {
    onChatToggle: modalState.onChatToggle,
    onSatelliteListToggle: modalState.onSatelliteListToggle,
    onDisplayOptionsToggle: modalState.onDisplayOptionsToggle,
    onSatelliteCreatorToggle: modalState.onSatelliteCreatorToggle,
    onSimulationToggle: modalState.onSimulationToggle,
    onGroundtrackToggle: modalState.onGroundtrackToggle,
    isChatVisible: modalState.isChatVisible,
    isSatelliteListVisible: modalState.isSatelliteListVisible,
    isDisplayOptionsOpen: modalState.isDisplayOptionsOpen,
    isSatelliteModalOpen: modalState.isSatelliteModalOpen,
    selectedBody,
    onBodySelect: handleBodyChange,
    groupedPlanetOptions,
    satelliteOptions,
    getDisplayValue,
    timeWarp: app3d?.simulationController?.getTimeWarp() ?? app3d?.timeUtils?.getTimeWarp() ?? 1,
    timeWarpLoading,
    onTimeWarpChange: (newWarp) => {
      if (app3d?.simulationController) {
        app3d.simulationController.setTimeWarp(newWarp);
      }
    },
    simulatedTime: simTime,
    onSimulatedTimeChange: handleSimulatedTimeChange,
    app3DRef: { current: app3d },
    satellites: Object.values(satellites),
    onShareState: undefined,
    onImportState: handleImportState,
    shareModalOpen,
    setShareModalOpen,
    setShareUrl,
    isAuthOpen,
    setIsAuthOpen,
    setAuthMode,
    simulationOpen: isSimulationOpen,
    setSimulationOpen: setIsSimulationOpen,
    planetOptions
  };
}

export function buildModalProps({
  modalState,
  controller,
  displaySettings,
  setDisplaySettings,
  app3d,
  satellites,
  handleBodyChange,
  debugWindows,
  onCreateSatellite,
  availableBodies,
  shareUrl,
  shareCopied,
  handleCopyShareUrl,
  handleShareViaEmail,
  authMode,
  setAuthMode,
  showToast,
  satellitesPhysics
}) {
  return {
    chatModal: {
      isOpen: modalState.isChatVisible,
      onClose: () => modalState.setIsChatVisible(false),
      socket: controller?.app3d?.socketManager?.socket
    },
    
    displayOptions: {
      settings: displaySettings,
      onSettingChange: (key, value) => {
        if (app3d) {
          app3d.updateDisplaySetting(key, value);
          setDisplaySettings(prev => ({ ...prev, [key]: value }));
        }
      },
      isOpen: modalState.isDisplayOptionsOpen,
      onOpenChange: modalState.setIsDisplayOptionsOpen,
      app3DRef: { current: app3d },
      physicsProviderType: app3d?.physicsProviderType || 'unknown'
    },
    
    satelliteListWindow: {
      satellites,
      isOpen: modalState.isSatelliteListVisible,
      setIsOpen: modalState.setIsSatelliteListVisible,
      onBodySelect: handleBodyChange,
      debugWindows,
      app3d
    },
    
    satelliteCreatorModal: {
      isOpen: modalState.isSatelliteModalOpen,
      onClose: () => modalState.setIsSatelliteModalOpen(false),
      onCreate: onCreateSatellite,
      availableBodies
    },
    
    shareModal: {
      isOpen: modalState.shareModalOpen,
      onClose: () => modalState.setShareModalOpen(false),
      shareUrl,
      shareCopied,
      onCopy: handleCopyShareUrl,
      onShareEmail: handleShareViaEmail
    },
    
    authModal: {
      isOpen: modalState.isAuthOpen,
      onClose: () => modalState.setIsAuthOpen(false),
      mode: authMode,
      setMode: setAuthMode,
      onSignupSuccess: showToast
    },
    
    earthPointModal: {
      openModals: modalState.openPointModals,
      onToggle: (feature, category) => {
        modalState.setOpenPointModals(prev => {
          const isSame = prev.length === 1 && prev[0].feature === feature && prev[0].category === category;
          return isSame ? [] : [{ feature, category }];
        });
      }
    },
    
    groundTrackWindow: {
      isOpen: modalState.isGroundtrackOpen,
      onClose: () => modalState.setIsGroundtrackOpen(false),
      satellites: satellitesPhysics,
      planets: window.app3d?.planets || []
    },
    
    simulationWindow: {
      isOpen: modalState.isSimulationOpen,
      onClose: () => modalState.setIsSimulationOpen(false),
      app3d
    }
  };
}