/**
 * Utility functions to build props objects for components
 * This helps organize and type-check component props
 */

import { getSocket } from '../socket.js';
import { solarSystemDataManager } from '../physics/PlanetaryDataManager.js';

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
  displaySettings,
  setDisplaySettings,
  app3d,
  satellites,
  selectedBody,
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
      socket: getSocket()
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
      physicsProviderType: 'local'
    },
    
    satelliteListWindow: {
      satellites,
      isOpen: modalState.isSatelliteListVisible,
      setIsOpen: modalState.setIsSatelliteListVisible,
      onBodySelect: handleBodyChange,
      debugWindows,
      app3d
    },
    
    satelliteCreatorModal: (() => {
      // Find matching body in availableBodies based on current selection using data-driven approach
      let preselectedBody = null;
      
      if (selectedBody && selectedBody !== 'none' && !selectedBody.startsWith('satellite-')) {
        // Strategy 1: Direct name match (case-insensitive)
        preselectedBody = availableBodies.find(body => 
          body.name.toLowerCase() === selectedBody.toLowerCase()
        );
        
        // Strategy 2: Use planetary data manager if available and initialized
        if (!preselectedBody && solarSystemDataManager?.initialized) {
          const bodyConfig = solarSystemDataManager.getBodyByName(selectedBody.toLowerCase());
          
          if (bodyConfig) {
            // Try to find by NAIF ID (most reliable identifier)
            preselectedBody = availableBodies.find(body => 
              body.naifId === bodyConfig.naif_id
            );
            
            // Try by astronomy engine name if NAIF ID didn't work
            if (!preselectedBody && bodyConfig.astronomyEngineName) {
              preselectedBody = availableBodies.find(body => 
                body.name.toLowerCase() === bodyConfig.astronomyEngineName.toLowerCase()
              );
            }
          }
        }
        
        // Strategy 3: Fallback - search through all available bodies for any reasonable match
        // This handles cases where the data manager isn't ready yet
        if (!preselectedBody) {
          const searchTerm = selectedBody.toLowerCase();
          preselectedBody = availableBodies.find(body => {
            const bodyName = body.name.toLowerCase();
            // Exact match, contains match, or common variations
            return bodyName === searchTerm || 
                   bodyName.includes(searchTerm) || 
                   searchTerm.includes(bodyName);
          });
        }
      }
      
      return {
        isOpen: modalState.isSatelliteModalOpen,
        onClose: () => modalState.setIsSatelliteModalOpen(false),
        onCreate: onCreateSatellite,
        availableBodies,
        selectedBody: preselectedBody
      };
    })(),
    
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